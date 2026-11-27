'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Download, Loader2, LogOut, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  buildDailySummaries,
  downloadCsv,
  formatDate,
  formatDuration,
  formatTime,
  getCurrentlyInside,
  personName,
  toDateInputValue,
  type AttendanceLog,
} from '@/lib/attendance';
import { StatsCards } from '@/components/admin/stats-cards';
import { LogsTable } from '@/components/admin/logs-table';
import { DailySummaryTable } from '@/components/admin/daily-summary-table';
import { InsideNow } from '@/components/admin/inside-now';

type View = 'movements' | 'summary';
type ActionFilter = 'ALL' | 'IN' | 'OUT';

async function fetchLogs([, from, to]: [string, string, string]) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  end.setDate(end.getDate() + 1);

  const { data, error } = await supabase
    .from('attendance_logs')
    .select('id, user_id, location_id, action_type, created_at, distance_meters, profiles(full_name), locations(name)')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) throw error;
  return (data ?? []) as unknown as AttendanceLog[];
}

export default function AdminPage() {
  const router = useRouter();
  const today = toDateInputValue(new Date());
  const [authorized, setAuthorized] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [view, setView] = useState<View>('movements');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return router.replace('/');
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', user.id)
        .single();
      if (profile?.role !== 'admin') return router.replace('/');
      setAdminName(profile.full_name || user.email || '');
      setAuthorized(true);
    });
  }, [router]);

  const { data: logs = [], isLoading, isValidating, mutate, error } = useSWR(
    authorized ? ['attendance_logs', from, to] : null,
    fetchLogs,
    { refreshInterval: 30000 },
  );

  const locations = useMemo(
    () => [...new Set(logs.map((l) => l.locations?.name).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'tr')),
    [logs],
  );

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr-TR');
    return logs.filter(
      (l) =>
        (actionFilter === 'ALL' || l.action_type === actionFilter) &&
        (locationFilter === 'ALL' || l.locations?.name === locationFilter) &&
        (!term || personName(l).toLocaleLowerCase('tr-TR').includes(term)),
    );
  }, [logs, search, actionFilter, locationFilter]);

  const summaries = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr-TR');
    const scoped = logs.filter((l) => locationFilter === 'ALL' || l.locations?.name === locationFilter);
    return buildDailySummaries(scoped).filter((s) => !term || s.name.toLocaleLowerCase('tr-TR').includes(term));
  }, [logs, search, locationFilter]);

  const inside = useMemo(() => getCurrentlyInside(logs), [logs]);
  const allSummaries = useMemo(() => buildDailySummaries(logs), [logs]);
  const average = allSummaries.length
    ? allSummaries.reduce((sum, s) => sum + s.totalMinutes, 0) / allSummaries.length
    : 0;

  const handleExport = () => {
    const stamp = from === to ? from : `${from}_${to}`;
    if (view === 'summary') {
      downloadCsv(
        `puantaj_${stamp}.csv`,
        ['Personel', 'Tarih', 'İlk Giriş', 'Son Çıkış', 'Toplam Süre', 'Durum', 'Lokasyonlar'],
        summaries.map((s) => [
          s.name,
          formatDate(`${s.date}T12:00:00`),
          s.firstIn ? formatTime(s.firstIn) : '',
          s.lastOut && !s.isOpen ? formatTime(s.lastOut) : '',
          formatDuration(s.totalMinutes),
          s.isOpen ? 'İçeride' : 'Tamamlandı',
          s.locations.join(', '),
        ]),
      );
    } else {
      downloadCsv(
        `hareketler_${stamp}.csv`,
        ['Personel', 'İşlem', 'Lokasyon', 'Tarih', 'Saat', 'Mesafe (m)'],
        filteredLogs.map((l) => [
          personName(l),
          l.action_type === 'IN' ? 'Giriş' : 'Çıkış',
          l.locations?.name || '',
          formatDate(l.created_at),
          formatTime(l.created_at),
          l.distance_meters ?? '',
        ]),
      );
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  if (!authorized) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" aria-label="Yükleniyor" />
      </main>
    );
  }

  const inputClass =
    'bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500';

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold leading-tight">Yönetim Paneli</p>
              <p className="text-xs text-slate-400 leading-tight">{adminName}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white px-3 py-2 rounded-lg border border-slate-800 hover:bg-slate-900"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Çıkış Yap</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Giriş - Çıkış Takibi</h1>
            <p className="text-sm text-slate-400">
              {from === to ? formatDate(`${from}T12:00:00`) : `${formatDate(`${from}T12:00:00`)} - ${formatDate(`${to}T12:00:00`)}`}{' '}
              • Her 30 saniyede otomatik güncellenir
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => mutate()}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm hover:bg-slate-800"
            >
              <RefreshCw className={`w-4 h-4 ${isValidating ? 'animate-spin' : ''}`} /> Yenile
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium"
            >
              <Download className="w-4 h-4" /> Excel İndir
            </button>
          </div>
        </div>

        <StatsCards
          insideCount={inside.length}
          inCount={logs.filter((l) => l.action_type === 'IN').length}
          outCount={logs.filter((l) => l.action_type === 'OUT').length}
          averageMinutesLabel={formatDuration(average)}
        />

        <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
          <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex flex-col gap-4">
              <div role="tablist" className="inline-flex self-start p-1 bg-slate-950 border border-slate-800 rounded-lg">
                {([
                  ['movements', 'Hareketler'],
                  ['summary', 'Günlük Puantaj'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={view === key}
                    onClick={() => setView(key)}
                    className={`px-3 py-1.5 text-sm rounded-md font-medium transition ${
                      view === key ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-48">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <label htmlFor="search" className="sr-only">Personel ara</label>
                  <input
                    id="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Personel ara..."
                    className={`${inputClass} w-full pl-9`}
                  />
                </div>
                <label className="sr-only" htmlFor="from">Başlangıç tarihi</label>
                <input id="from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} [color-scheme:dark]`} />
                <label className="sr-only" htmlFor="to">Bitiş tarihi</label>
                <input id="to" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className={`${inputClass} [color-scheme:dark]`} />
                <label className="sr-only" htmlFor="location">Lokasyon</label>
                <select id="location" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className={inputClass}>
                  <option value="ALL">Tüm Lokasyonlar</option>
                  {locations.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                {view === 'movements' && (
                  <>
                    <label className="sr-only" htmlFor="action">İşlem tipi</label>
                    <select id="action" value={actionFilter} onChange={(e) => setActionFilter(e.target.value as ActionFilter)} className={inputClass}>
                      <option value="ALL">Tüm İşlemler</option>
                      <option value="IN">Giriş</option>
                      <option value="OUT">Çıkış</option>
                    </select>
                  </>
                )}
              </div>
            </div>

            {error ? (
              <p className="px-4 py-12 text-center text-sm text-red-400">Veriler yüklenemedi: {error.message}</p>
            ) : isLoading ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-slate-500" aria-label="Yükleniyor" />
              </div>
            ) : view === 'movements' ? (
              <LogsTable logs={filteredLogs} />
            ) : (
              <DailySummaryTable summaries={summaries} />
            )}

            {!isLoading && !error && (
              <div className="px-4 py-3 border-t border-slate-800 text-xs text-slate-500">
                {view === 'movements' ? `${filteredLogs.length} hareket listeleniyor` : `${summaries.length} puantaj kaydı listeleniyor`}
              </div>
            )}
          </section>

          <InsideNow logs={inside} />
        </div>
      </main>
    </div>
  );
}
