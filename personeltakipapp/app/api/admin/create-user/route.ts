import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Sunucuda SUPABASE_SERVICE_ROLE_KEY tanımlı değil.' },
        { status: 500 }
      );
    }

    // 1. İsteği atan kişinin gerçekten admin olduğunu doğrula
    const userClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Oturum doğrulanamadı.' }, { status: 401 });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: requesterProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (requesterProfile?.role !== 'admin') {
      return NextResponse.json({ error: 'Bu işlem için yönetici yetkisi gerekir.' }, { status: 403 });
    }

    // 2. Form verilerini al
    const { fullName, username, password, role } = await request.json();

    if (!fullName || !username || !password) {
      return NextResponse.json({ error: 'Ad Soyad, Kullanıcı Adı ve Parola zorunludur.' }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (cleanUsername.length < 3) {
      return NextResponse.json(
        { error: 'Kullanıcı adı en az 3 karakter olmalı (sadece harf, rakam, nokta veya tire).' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Parola en az 6 karakter olmalıdır.' }, { status: 400 });
    }

    const internalEmail = `${cleanUsername}@personeltakip.local`;

    // 3. Kullanıcıyı e-posta onayı gerektirmeden oluştur
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName.trim() },
    });

    if (createError || !created.user) {
      return NextResponse.json(
        { error: createError?.message || 'Kullanıcı oluşturulamadı (kullanıcı adı kullanımda olabilir).' },
        { status: 400 }
      );
    }

    // 4. Profiles tablosuna ad soyad ve rolü kaydet
    const { error: profileError } = await adminClient.from('profiles').upsert({
      id: created.user.id,
      full_name: fullName.trim(),
      role: role === 'admin' ? 'admin' : 'staff',
    });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      username: cleanUsername,
      fullName: fullName.trim(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Sunucu hatası.' }, { status: 500 });
  }
}