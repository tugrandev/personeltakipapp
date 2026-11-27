-- Personel Takip: güvenlik kuralları (RLS) + örnek veri
-- Supabase Dashboard > SQL Editor'a yapıştırıp "Run" ile tek seferde çalıştırın.
-- Tekrar çalıştırmak güvenlidir; mevcut kayıtlar çoğaltılmaz.

create extension if not exists pgcrypto with schema extensions;

-- 1) Tablolar (varsa dokunulmaz, eksik sütunlar eklenir) ---------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'staff',
  device_id text,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role text default 'staff';
alter table public.profiles add column if not exists device_id text;

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  radius_meters integer not null default 150,
  qr_secret text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  action_type text not null check (action_type in ('IN', 'OUT')),
  scanned_lat double precision,
  scanned_lng double precision,
  distance_meters integer,
  created_at timestamptz not null default now()
);
alter table public.attendance_logs add column if not exists scanned_lat double precision;
alter table public.attendance_logs add column if not exists scanned_lng double precision;
alter table public.attendance_logs add column if not exists distance_meters integer;

create index if not exists attendance_logs_user_created_idx on public.attendance_logs (user_id, created_at desc);
create index if not exists attendance_logs_created_idx on public.attendance_logs (created_at desc);

-- 2) Yardımcı fonksiyonlar ----------------------------------------------------

-- RLS içinde profiles tablosunu sorgularken sonsuz döngüyü önlemek için security definer.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Yeni kayıt olan her kullanıcı için otomatik profil.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), 'staff')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Personel kendi profilinde yalnızca device_id'yi ilk kez yazabilir; rolünü veya adını değiştiremez.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role or new.full_name is distinct from old.full_name then
    raise exception 'Bu alanı değiştirme yetkiniz yok';
  end if;
  if old.device_id is not null and new.device_id is distinct from old.device_id then
    raise exception 'Cihaz kaydı yalnızca yönetici tarafından değiştirilebilir';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- 3) RLS kuralları -----------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.attendance_logs enable row level security;

-- Eski / çakışan kuralları temizle
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('profiles', 'locations', 'attendance_logs')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- profiles: herkes kendini, admin herkesi görür
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy "profiles_admin_insert" on public.profiles
  for insert to authenticated with check (public.is_admin());
create policy "profiles_admin_delete" on public.profiles
  for delete to authenticated using (public.is_admin());

-- locations: giriş yapan herkes okur (QR doğrulaması için), yalnızca admin yönetir
create policy "locations_select_authenticated" on public.locations
  for select to authenticated using (true);
create policy "locations_admin_all" on public.locations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- attendance_logs: personel yalnızca kendi kayıtlarını görür/ekler, admin tüm lokasyonlardaki her şeyi
create policy "logs_select_own_or_admin" on public.attendance_logs
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "logs_insert_own" on public.attendance_logs
  for insert to authenticated with check (user_id = auth.uid() or public.is_admin());
create policy "logs_admin_update" on public.attendance_logs
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "logs_admin_delete" on public.attendance_logs
  for delete to authenticated using (public.is_admin());

-- 4) Örnek veri ---------------------------------------------------------------
-- Hesaplar (ilk girişten sonra şifreleri değiştirin):
--   admin@personeltakip.com  / Admin123!
--   ahmet@personeltakip.com  / Personel123!
--   ayse@personeltakip.com   / Personel123!
--   mehmet@personeltakip.com / Personel123!

do $$
declare
  u record;
  uid uuid;
  loc_merkez uuid;
  loc_depo uuid;
  staff_ids uuid[] := '{}';
  sid uuid;
  d int;
  loc uuid;
  day_start timestamptz;
  in_at timestamptz;
  out_at timestamptz;
begin
  for u in
    select * from (values
      ('admin@personeltakip.com',  'Admin123!',    'Sistem Yöneticisi', 'admin'),
      ('ahmet@personeltakip.com',  'Personel123!', 'Ahmet Yılmaz',      'staff'),
      ('ayse@personeltakip.com',   'Personel123!', 'Ayşe Demir',        'staff'),
      ('mehmet@personeltakip.com', 'Personel123!', 'Mehmet Kaya',       'staff')
    ) as t(email, password, full_name, role)
  loop
    select id into uid from auth.users where email = u.email;

    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', u.email,
        extensions.crypt(u.password, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', u.full_name), now(), now(), '', '', '', ''
      );
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (
        gen_random_uuid(), uid, uid::text,
        jsonb_build_object('sub', uid::text, 'email', u.email, 'email_verified', true),
        'email', now(), now(), now()
      );
    end if;

    insert into public.profiles (id, full_name, role)
    values (uid, u.full_name, u.role)
    on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;

    if u.role = 'staff' then
      staff_ids := staff_ids || uid;
    end if;
  end loop;

  select id into loc_merkez from public.locations where name = 'Merkez Ofis';
  if loc_merkez is null then
    insert into public.locations (name, latitude, longitude, radius_meters, qr_secret)
    values ('Merkez Ofis', 41.0082, 28.9784, 150, 'merkez-ofis-qr')
    returning id into loc_merkez;
  end if;

  select id into loc_depo from public.locations where name = 'Depo';
  if loc_depo is null then
    insert into public.locations (name, latitude, longitude, radius_meters, qr_secret)
    values ('Depo', 40.9923, 29.0244, 200, 'depo-qr')
    returning id into loc_depo;
  end if;

  -- Örnek hareketler yalnızca hiç kayıt yoksa eklenir
  if not exists (select 1 from public.attendance_logs) then
    foreach sid in array staff_ids loop
      for d in 0..6 loop
        day_start := date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul' - make_interval(days => d);
        if extract(isodow from day_start at time zone 'Europe/Istanbul') >= 6 then
          continue;
        end if;
        loc := case when random() < 0.7 then loc_merkez else loc_depo end;
        in_at := day_start + interval '8 hours' + make_interval(mins => (random() * 50)::int);
        out_at := day_start + interval '17 hours' + make_interval(mins => (random() * 70)::int);

        insert into public.attendance_logs (user_id, location_id, action_type, distance_meters, created_at)
        values (sid, loc, 'IN', (random() * 60)::int, in_at);

        -- Bugün için ilk personel hâlâ içeride görünsün
        if d = 0 and sid = staff_ids[1] then
          continue;
        end if;
        if out_at < now() then
          insert into public.attendance_logs (user_id, location_id, action_type, distance_meters, created_at)
          values (sid, loc, 'OUT', (random() * 60)::int, out_at);
        end if;
      end loop;
    end loop;
  end if;
end $$;
