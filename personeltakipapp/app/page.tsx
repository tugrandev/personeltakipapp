'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getSessionUser, clearSessionUser, AppUser } from '@/lib/session';
import { useRouter } from 'next/navigation';
import { LogOut, ShieldCheck, QrCode } from 'lucide-react';

export default function HomePage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    const currentUser = getSessionUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    setUser(currentUser);
    fetchLogs(currentUser.id);
  }, []);

  const fetchLogs = async (userId: string) => {
    const { data } = await supabase
      .from('attendance_logs')
      .select('*, locations(name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(15);
    if (data) setRecentLogs(data);
  };

  const handleLogout = () => {
    clearSessionUser();
    router.push('/login');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center p-4">
      <div className="w-full max-w-md flex items-center justify-between py-3 border-b border-slate-800 mb-6">
        <div>
          <p className="text-xs text-slate-400">Personel Takip (@{user.username})</p>
          <h2 className="font-semibold text-base">{user.full_name}</h2>
        </div>
        <div className="flex items-center gap-2">
          {user.role === 'admin' && (
            <button
              onClick={() => router.push('/admin')}
              className="flex items-center gap-1 text-xs bg-indigo-600 hover:bg-indigo-500 px-3 py-2 rounded-lg font-medium"
            >
              <ShieldCheck className="w-4 h-4" /> Yönetim
            </button>
          )}
          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-white bg-slate-900 rounded-lg border border-slate-800"
            title="Çıkış Yap"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="w-full max-w-md bg-slate-900/70 border border-slate-800 rounded-2xl p-4 mb-6 flex items-center gap-3 text-sm text-slate-300">
        <QrCode className="w-8 h-8 text-emerald-400 shrink-0" />
        <p>Giriş veya çıkış yapmak için telefonunuzun kamerasını açıp kapıdaki QR kodu okutmanız yeterlidir.</p>
      </div>

      <div className="w-full max-w-md">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Son Hareketleriniz
        </h3>
        <div className="space-y-2">
          {recentLogs.length === 0 ? (
            <p className="text-sm text-slate-500 bg-slate-900/50 p-4 rounded-xl border border-slate-800/60">
              Henüz giriş-çıkış kaydınız bulunmuyor.
            </p>
          ) : (
            recentLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between bg-slate-900 border border-slate-800 px-4 py-3 rounded-xl text-sm"
              >
                <div>
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-bold mr-2 ${
                      log.action_type === 'IN'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {log.action_type === 'IN' ? 'GİRİŞ' : 'ÇIKIŞ'}
                  </span>
                  <span className="text-slate-200">{log.locations?.name}</span>
                </div>
                <span className="text-xs text-slate-400">
                  {new Date(log.created_at).toLocaleString('tr-TR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}