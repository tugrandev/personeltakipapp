'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { getSessionUser, clearSessionUser, AppUser } from '@/lib/session';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogOut, ShieldCheck, QrCode, Camera, X } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

function HomeContent() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoScan = searchParams.get('scan') === '1';

  useEffect(() => {
    const currentUser = getSessionUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    setUser(currentUser);
    fetchLogs(currentUser.id);

    if (autoScan) {
      startScanner();
    }

    return () => {
      stopScanner();
    };
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

  const startScanner = async () => {
    setScanError('');
    setScannerOpen(true);

    setTimeout(async () => {
      try {
        if (scannerRef.current) return;
        const html5QrCode = new Html5Qrcode('qr-reader');
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText) => {
            stopScanner();
            try {
              const url = new URL(decodedText);
              const loc = url.searchParams.get('loc');
              if (loc) {
                router.push(`/scan?loc=${encodeURIComponent(loc)}`);
              } else {
                setScanError('Geçersiz QR kod okutuldu.');
              }
            } catch {
              setScanError('Bu QR kod sisteme ait değil.');
            }
          },
          () => {}
        );
      } catch {
        setScanError('Kamera başlatılamadı. Tarayıcı kamera iznini kontrol edin.');
      }
    }, 250);
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
    setScannerOpen(false);
  };

  const handleLogout = () => {
    stopScanner();
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

      {scannerOpen ? (
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5">
              <QrCode className="w-4 h-4" /> Kapıdaki QR Kodu Okutun
            </span>
            <button
              onClick={stopScanner}
              className="p-1.5 bg-slate-800 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div id="qr-reader" className="w-full overflow-hidden rounded-xl bg-black" />
        </div>
      ) : (
        <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 rounded-2xl p-5 mb-6 text-center">
          <button
            onClick={startScanner}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition"
          >
            <Camera className="w-5 h-5" /> Kamera ile QR Okut
          </button>
          <p className="text-xs text-slate-400 mt-3">
            Giriş veya çıkış yapmak için butona basıp şube QR kodunu okutun.
          </p>
        </div>
      )}

      {scanError && (
        <div className="w-full max-w-md bg-red-500/10 border border-red-500/40 text-red-300 text-xs p-3 rounded-xl mb-4">
          {scanError}
        </div>
      )}

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

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center">Yükleniyor...</div>}>
      <HomeContent />
    </Suspense>
  );
}