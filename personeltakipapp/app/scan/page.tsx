'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { calculateDistanceMeters } from '@/lib/geo';
import { CheckCircle2, XCircle, Loader2, Home, QrCode } from 'lucide-react';

function ScanProcessor() {
  const searchParams = useSearchParams();
  const locSecret = searchParams.get('loc');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [title, setTitle] = useState('Konum ve QR doğrulanıyor...');
  const [detail, setDetail] = useState('Lütfen konum izni istendiğinde onay verin.');

  // React StrictMode veya çift render kaynaklı ikiz kayıtları engelleyen kilit
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    processScan();
  }, [locSecret]);

  const getCurrentPosition = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Cihazınız konum servisini desteklemiyor.'));
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });
  };

  const processScan = async () => {
    setStatus('loading');
    setTitle('Konum ve QR doğrulanıyor...');
    setDetail('Lütfen konum izni istendiğinde onay verin.');

    if (!locSecret) {
      setStatus('error');
      setTitle('Geçersiz QR Bağlantısı');
      setDetail('QR kodda lokasyon bilgisi bulunamadı.');
      return;
    }

    const user = getSessionUser();
    if (!user) {
      window.location.href = `/login?redirect=/scan?loc=${encodeURIComponent(locSecret)}`;
      return;
    }

    try {
      const { data: location, error: locError } = await supabase
        .from('locations')
        .select('*')
        .eq('qr_secret', locSecret)
        .single();

      if (locError || !location) {
        setStatus('error');
        setTitle('Tanımsız Lokasyon');
        setDetail('Okutulan QR kod sistemdeki hiçbir şubeye ait değil.');
        return;
      }

      let pos: GeolocationPosition;
      try {
        pos = await getCurrentPosition();
      } catch {
        setStatus('error');
        setTitle('Konum Alınamadı');
        setDetail('İşlemi tamamlamak için telefonunuzun konum (GPS) servisini açıp tarayıcıya izin verin.');
        return;
      }

      const userLat = pos.coords.latitude;
      const userLng = pos.coords.longitude;
      const distance = calculateDistanceMeters(
        userLat,
        userLng,
        location.latitude,
        location.longitude
      );

      if (distance > location.radius_meters) {
        setStatus('error');
        setTitle('İşyeri Dışındasınız!');
        setDetail(`${location.name} noktasına ${distance}m uzaktasınız (Maksimum sınır: ${location.radius_meters}m).`);
        return;
      }

      const sixteenHoursAgo = new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString();

      const { data: recentLogs } = await supabase
        .from('attendance_logs')
        .select('action_type, created_at')
        .eq('user_id', user.id)
        .gte('created_at', sixteenHoursAgo)
        .order('created_at', { ascending: false })
        .limit(1);

      const latestLog = recentLogs && recentLogs.length > 0 ? recentLogs[0] : null;

      // Son 90 saniye içinde zaten bir GİRİŞ veya ÇIKIŞ kaydı varsa mükerrer kayıt atma
      if (
        latestLog &&
        (latestLog.action_type === 'IN' || latestLog.action_type === 'OUT') &&
        Date.now() - new Date(latestLog.created_at).getTime() < 90 * 1000
      ) {
        const existingTimeStr = new Date(latestLog.created_at).toLocaleTimeString('tr-TR', {
          hour: '2-digit',
          minute: '2-digit',
        });
        setStatus('success');
        setTitle(`${latestLog.action_type === 'IN' ? 'GİRİŞ' : 'ÇIKIŞ'} ZATEN KAYDEDİLDİ (${existingTimeStr})`);
        setDetail(`${location.name} • Konum doğrulandı (${distance}m)`);
        return;
      }

      // Son hareket 'IN' veya 'BREAK_END' ise (yani içerideyse) sıradaki hareket 'OUT' olmalı
      const isInside = latestLog && (latestLog.action_type === 'IN' || latestLog.action_type === 'BREAK_END');
      const nextAction = isInside ? 'OUT' : 'IN';

      const { error: insertError } = await supabase.from('attendance_logs').insert({
        user_id: user.id,
        location_id: location.id,
        action_type: nextAction,
        scanned_lat: userLat,
        scanned_lng: userLng,
        distance_meters: distance,
      });

      if (insertError) throw insertError;

      const timeStr = new Date().toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
      });

      setStatus('success');
      setTitle(`${nextAction === 'IN' ? 'GİRİŞ' : 'ÇIKIŞ'} KAYDEDİLDİ (${timeStr})`);
      setDetail(`${location.name} • Konum doğrulandı (${distance}m)`);
    } catch (err: any) {
      setStatus('error');
      setTitle('Kayıt Başarısız');
      setDetail(err.message || 'Bir hata oluştu, lütfen tekrar QR okutun.');
    }
  };

  return (
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl">
      {status === 'loading' && (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-14 h-14 animate-spin text-emerald-500" />
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm text-slate-400">{detail}</p>
        </div>
      )}

      {status === 'success' && (
        <div className="flex flex-col items-center gap-4">
          <CheckCircle2 className="w-16 h-16 text-emerald-400" />
          <h1 className="text-2xl font-bold text-emerald-400">{title}</h1>
          <p className="text-sm text-slate-300">{detail}</p>
          <button
            onClick={() => {
              window.location.href = '/';
            }}
            className="mt-4 w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" /> Ana Sayfaya Dön
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-4">
          <XCircle className="w-16 h-16 text-red-400" />
          <h1 className="text-2xl font-bold text-red-400">{title}</h1>
          <p className="text-sm text-slate-300">{detail}</p>
          <button
            type="button"
            onClick={() => {
              window.location.href = '/';
            }}
            className="mt-4 w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
          >
            <QrCode className="w-4 h-4" /> Ana Sayfaya Dön ve Tekrar Okut
          </button>
        </div>
      )}
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