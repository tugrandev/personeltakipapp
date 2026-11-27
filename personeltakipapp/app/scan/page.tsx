'use client';

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { calculateDistanceMeters } from '@/lib/geo';
import { formatDuration, formatTime, SCAN_COOLDOWN_MINUTES, type ActionType } from '@/lib/attendance';
import { CheckCircle2, XCircle, Loader2, Home, Clock, LogOut } from 'lucide-react';

type Status = 'loading' | 'confirm' | 'cooldown' | 'success' | 'error';

interface PendingScan {
  userId: string;
  locationId: string;
  locationName: string;
  lat: number;
  lng: number;
  distance: number;
  lastInAt: string | null;
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Cihazınız konum servisini desteklemiyor.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    });
  });
}

function ScanProcessor() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const locSecret = searchParams.get('loc');
  const startedRef = useRef(false);

  const [status, setStatus] = useState<Status>('loading');
  const [title, setTitle] = useState('Konum ve QR doğrulanıyor...');
  const [detail, setDetail] = useState('Lütfen konum izni istendiğinde onay verin.');
  const [pending, setPending] = useState<PendingScan | null>(null);
  const [saving, setSaving] = useState(false);

  const fail = (t: string, d: string) => {
    setStatus('error');
    setTitle(t);
    setDetail(d);
  };

  const saveLog = useCallback(async (scan: PendingScan, action: ActionType) => {
    setSaving(true);
    const { error } = await supabase.from('attendance_logs').insert({
      user_id: scan.userId,
      location_id: scan.locationId,
      action_type: action,
      scanned_lat: scan.lat,
      scanned_lng: scan.lng,
      distance_meters: scan.distance,
    });
    setSaving(false);

    if (error) {
      fail('Kayıt Başarısız', error.message || 'Bir hata oluştu, lütfen tekrar QR okutun.');
      return;
    }

    const timeStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    setStatus('success');
    setTitle(`${action === 'IN' ? 'Giriş' : 'Çıkış'} Kaydedildi`);
    setDetail(
      action === 'OUT' && scan.lastInAt
        ? `${scan.locationName} • ${timeStr} • Bugünkü çalışma: ${formatDuration((Date.now() - new Date(scan.lastInAt).getTime()) / 60000)}`
        : `${scan.locationName} • ${timeStr} • Konum doğrulandı (${scan.distance} m)`,
    );
  }, []);

  const processScan = useCallback(async () => {
    setStatus('loading');
    setTitle('Konum ve QR doğrulanıyor...');
    setDetail('Lütfen konum izni istendiğinde onay verin.');

    if (!locSecret) return fail('Geçersiz QR Bağlantısı', 'QR kodda lokasyon bilgisi bulunamadı.');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(`/scan?loc=${locSecret}`)}`);
      return;
    }

    try {
      const { data: location, error: locError } = await supabase
        .from('locations')
        .select('*')
        .eq('qr_secret', locSecret)
        .single();

      if (locError || !location) {
        return fail('Tanımsız Lokasyon', 'Okutulan QR kod sistemdeki hiçbir şubeye ait değil.');
      }

      let pos: GeolocationPosition;
      try {
        pos = await getCurrentPosition();
      } catch {
        return fail('Konum Alınamadı', 'İşlemi tamamlamak için telefonunuzun konum (GPS) servisini açıp tarayıcıya izin verin.');
      }

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const distance = calculateDistanceMeters(lat, lng, location.latitude, location.longitude);

      if (distance > location.radius_meters) {
        return fail('İşyeri Dışındasınız', `${location.name} noktasına ${distance} m uzaktasınız (maksimum: ${location.radius_meters} m).`);
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: todayLogs } = await supabase
        .from('attendance_logs')
        .select('action_type, created_at')
        .eq('user_id', user.id)
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      const last = todayLogs?.[0];
      if (last) {
        const minutesSince = (Date.now() - new Date(last.created_at).getTime()) / 60000;
        if (minutesSince < SCAN_COOLDOWN_MINUTES) {
          const remaining = Math.ceil(SCAN_COOLDOWN_MINUTES - minutesSince);
          setStatus('cooldown');
          setTitle(`${last.action_type === 'IN' ? 'Girişiniz' : 'Çıkışınız'} Zaten Kayıtlı`);
          setDetail(`Saat ${formatTime(last.created_at)} itibarıyla kaydınız alındı. Yanlışlıkla tekrar okutmaya karşı yeni işlem için ${remaining} dk bekleyin.`);
          return;
        }
      }

      const scan: PendingScan = {
        userId: user.id,
        locationId: location.id,
        locationName: location.name,
        lat,
        lng,
        distance,
        lastInAt: last?.action_type === 'IN' ? last.created_at : null,
      };

      if (last?.action_type === 'IN') {
        setPending(scan);
        setStatus('confirm');
        setTitle('Çıkış yapmak istiyor musunuz?');
        setDetail(`Bugün ${formatTime(last.created_at)} saatinde giriş yaptınız. İçeride geçen süre: ${formatDuration((Date.now() - new Date(last.created_at).getTime()) / 60000)}.`);
        return;
      }

      await saveLog(scan, 'IN');
    } catch (err) {
      fail('Kayıt Başarısız', err instanceof Error ? err.message : 'Bir hata oluştu, lütfen tekrar QR okutun.');
    }
  }, [locSecret, router, saveLog]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    processScan();
  }, [processScan]);

  const goHome = (
    <button
      onClick={() => router.push('/personel')}
      className="w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
    >
      <Home className="w-4 h-4" /> Geçmiş Kayıtlarımı Gör
    </button>
  );

  return (
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl">
      <div className="flex flex-col items-center gap-4" aria-live="polite">
        {status === 'loading' && <Loader2 className="w-14 h-14 animate-spin text-emerald-500" />}
        {status === 'success' && <CheckCircle2 className="w-16 h-16 text-emerald-400" />}
        {status === 'error' && <XCircle className="w-16 h-16 text-red-400" />}
        {status === 'cooldown' && <Clock className="w-16 h-16 text-sky-400" />}
        {status === 'confirm' && <LogOut className="w-16 h-16 text-amber-400" />}

        <h1
          className={`text-2xl font-bold ${
            status === 'success' ? 'text-emerald-400' : status === 'error' ? 'text-red-400' : status === 'confirm' ? 'text-amber-400' : status === 'cooldown' ? 'text-sky-400' : ''
          }`}
        >
          {title}
        </h1>
        <p className="text-sm text-slate-300 leading-relaxed">{detail}</p>

        <div className="mt-4 w-full flex flex-col gap-2">
          {status === 'confirm' && pending && (
            <>
              <button
                onClick={() => saveLog(pending, 'OUT')}
                disabled={saving}
                className="w-full py-3 bg-amber-600 hover:bg-amber-500 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Evet, Çıkış Yap
              </button>
              <button
                onClick={() => router.push('/personel')}
                disabled={saving}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-medium"
              >
                Vazgeç, İçeride Kal
              </button>
            </>
          )}
          {status === 'error' && (
            <button
              onClick={processScan}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-semibold"
            >
              Tekrar Dene
            </button>
          )}
          {(status === 'success' || status === 'cooldown') && goHome}
        </div>
      </div>
    </div>
  );
}

export default function ScanPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
      <Suspense fallback={<div className="text-slate-400">Yükleniyor...</div>}>
        <ScanProcessor />
      </Suspense>
    </div>
  );
}
