'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, Download } from 'lucide-react';

export default function AdminPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    verifyAndLoad();
  }, []);

  const verifyAndLoad = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push('/login');

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      router.push('/');
      return;
    }

    fetchLogs();
  };

  const fetchLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('attendance_logs')
      .select('*, profiles(full_name), locations(name)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (data) setLogs(data);
    setLoading(false);
  };

  const exportCSV = () => {
    const headers = ['Personel', 'Lokasyon', 'Islem', 'Tarih_Saat', 'Mesafe_Metre'];
    const rows = logs.map((l) => [
      l.profiles?.full_name || 'Bilinmiyor',
      l.locations?.name || '',
      l.action_type === 'IN' ? 'GIRIS' : 'CIKIS',
      new Date(l.created_at).toLocaleString('tr-TR'),
      l.distance_meters,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\n');

    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `puantaj_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="p-2 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold">Yönetici Paneli - Canlı Hareketler</h1>
              <p className="text-xs text-slate-400">Tüm şubelerdeki son 100 giriş-çıkış kaydı</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchLogs}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm hover:bg-slate-800"
            >
              <RefreshCw className="w-4 h-4" /> Yenile
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium"
            >
              <Download className="w-4 h-4" /> Excel (CSV) İndir
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800/60 text-slate-400 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Personel</th>
                  <th className="px-4 py-3">Şube / Lokasyon</th>
                  <th className="px-4 py-3">İşlem</th>
                  <th className="px-4 py-3">Tarih & Saat</th>
                  <th className="px-4 py-3">Mesafe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      Yükleniyor...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      Henüz kayıt yok.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-medium">{log.profiles?.full_name}</td>
                      <td className="px-4 py-3 text-slate-300">{log.locations?.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold ${
                            log.action_type === 'IN'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {log.action_type === 'IN' ? 'GİRİŞ' : 'ÇIKIŞ'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {new Date(log.created_at).toLocaleString('tr-TR')}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{log.distance_meters} m</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}