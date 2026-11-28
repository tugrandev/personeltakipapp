'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getSessionUser, clearSessionUser, AppUser } from '@/lib/session';
import { calculateDistanceMeters } from '@/lib/geo';
import { useRouter } from 'next/navigation';
import {
  LogOut,
  QrCode,
  Camera,
  X,
  Clock,
  MapPin,
  CalendarPlus,
  CalendarDays,
  CheckCircle2,
  XCircle,
  Hourglass,
  History,
  Send,
  Coffee,
  Play,
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface LeaveRequest {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export default function HomePage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [activeTab, setActiveTab] = useState<'attendance' | 'leaves'>('attendance');

  // Mesai, Mola & QR State
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [activeShift, setActiveShift] = useState<{
    locationId: string;
    locationName: string;
    checkInTime: string;
  } | null>(null);
  const [activeBreak, setActiveBreak] = useState<{ startTime: string } | null>(null);
  const [todayBreakMinutes, setTodayBreakMinutes] = useState<number>(0);
  const [breakLoading, setBreakLoading] = useState(false);

  const [elapsedText, setElapsedText] = useState('');
  const [breakElapsedText, setBreakElapsedText] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanHandledRef = useRef(false);

  // İzin Talebi State
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [leaveType, setLeaveType] = useState('Yıllık İzin');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [leaveFeedback, setLeaveFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const router = useRouter();

  useEffect(() => {
    const currentUser = getSessionUser();
    if (!currentUser) {
      window.location.href = '/login';
      return;
    }
    if (currentUser.role === 'admin') {
      window.location.href = '/admin';
      return;
    }

    setUser(currentUser);
    fetchLogs(currentUser.id);
    fetchLeaves(currentUser.id);

    const handleFocus = () => {
      fetchLogs(currentUser.id);
      fetchLeaves(currentUser.id);
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      stopScanner();
    };
  }, []);

  // Aktif vardiya ve mola kronometreleri
  useEffect(() => {
    if (!activeShift && !activeBreak) {
      setElapsedText('');
      setBreakElapsedText('');
      return;
    }

    const formatDuration = (startTime: string) => {
      const diffMs = Math.max(0, Date.now() - new Date(startTime).getTime());
      const hrs = Math.floor(diffMs / 3600000);
      const mins = Math.floor((diffMs % 3600000) / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const updateTimers = () => {
      if (activeShift) {
        setElapsedText(formatDuration(activeShift.checkInTime));
      }
      if (activeBreak) {
        setBreakElapsedText(formatDuration(activeBreak.startTime));
      }
    };

    updateTimers();
    const interval = setInterval(updateTimers, 1000);
    return () => clearInterval(interval);
  }, [activeShift, activeBreak]);

  const fetchLogs = async (userId: string) => {
    const { data } = await supabase
      .from('attendance_logs')
      .select('*, locations(name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (data) {
      setRecentLogs(data);

      const latest = data[0];
      const sixteenHoursAgo = Date.now() - 16 * 60 * 60 * 1000;

      if (latest && latest.action_type !== 'OUT' && new Date(latest.created_at).getTime() >= sixteenHoursAgo) {
        const lastInLog = data.find((l) => l.action_type === 'IN');
        if (lastInLog) {
          setActiveShift({
            locationId: lastInLog.location_id,
            locationName: lastInLog.locations?.name || 'Şube',
            checkInTime: lastInLog.created_at,
          });
        }

        if (latest.action_type === 'BREAK_START') {
          setActiveBreak({ startTime: latest.created_at });
        } else {
          setActiveBreak(null);
        }
      } else {
        setActiveShift(null);
        setActiveBreak(null);
      }

      // Bugünkü tamamlanmış mola süresini hesapla (dk)
      const todayStr = new Date().toDateString();
      const todayLogs = [...data]
        .filter((l) => new Date(l.created_at).toDateString() === todayStr)
        .reverse();

      let totalBreakMs = 0;
      let tempBreakStart: number | null = null;
      for (const log of todayLogs) {
        if (log.action_type === 'BREAK_START') {
          tempBreakStart = new Date(log.created_at).getTime();
        } else if (log.action_type === 'BREAK_END' && tempBreakStart) {
          totalBreakMs += new Date(log.created_at).getTime() - tempBreakStart;
          tempBreakStart = null;
        }
      }
      setTodayBreakMinutes(Math.round(totalBreakMs / 60000));
    }
  };

  const getCurrentPosition = (): Promise<GeolocationPosition> => {
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
  };

  const handleToggleBreak = async () => {
    if (!user || !activeShift || breakLoading) return;

    // 1. 15 saniyelik bekleme (cooldown) kontrolü
    if (activeBreak) {
      const breakDurationSec = (Date.now() - new Date(activeBreak.startTime).getTime()) / 1000;
      if (breakDurationSec < 15) {
        setScanError(
          `Yanlışlıkla dokunmayı önlemek için molayı en az 15 saniye sonra bitirebilirsiniz (${Math.ceil(
            15 - breakDurationSec
          )} sn kaldı).`
        );
        return;
      }
    } else {
      const lastBreakEnd = recentLogs.find((l) => l.action_type === 'BREAK_END');
      if (lastBreakEnd) {
        const sinceLastBreakSec = (Date.now() - new Date(lastBreakEnd.created_at).getTime()) / 1000;
        if (sinceLastBreakSec < 15) {
          setScanError(
            `Yeni bir molaya çıkmak için lütfen ${Math.ceil(15 - sinceLastBreakSec)} saniye bekleyin.`
          );
          return;
        }
      }
    }

    setBreakLoading(true);
    setScanError('');

    try {
      // 2. Şube konum (GPS) doğrulaması
      const { data: location, error: locError } = await supabase
        .from('locations')
        .select('name, latitude, longitude, radius_meters')
        .eq('id', activeShift.locationId)
        .single();

      if (locError || !location) {
        setScanError('Şube konum bilgisi doğrulanamadı.');
        setBreakLoading(false);
        return;
      }

      let pos: GeolocationPosition;
      try {
        pos = await getCurrentPosition();
      } catch {
        setScanError('Mola işlemi için telefonunuzun konum (GPS) servisini açıp izin verin.');
        setBreakLoading(false);
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
        setScanError(
          `İşyeri dışındasınız! Mola başlatmak/bitirmek için ${location.name} sınırları içinde olmalısınız (${distance}m uzaktasınız).`
        );
        setBreakLoading(false);
        return;
      }

      // 3. Konum doğrulandıktan sonra mola kaydını oluştur
      const nextAction = activeBreak ? 'BREAK_END' : 'BREAK_START';
      const { error } = await supabase.from('attendance_logs').insert({
        user_id: user.id,
        location_id: activeShift.locationId,
        action_type: nextAction,
        scanned_lat: userLat,
        scanned_lng: userLng,
        distance_meters: distance,
      });

      if (error) throw error;
      await fetchLogs(user.id);
    } catch {
      setScanError('Mola durumu güncellenirken hata oluştu. Tekrar deneyin.');
    } finally {
      setBreakLoading(false);
    }
  };

  const fetchLeaves = async (userId: string) => {
    const { data } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (data) {
      setLeaves(data as LeaveRequest[]);
    }
  };

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || submittingLeave) return;

    if (!startDate || !endDate) {
      setLeaveFeedback({ type: 'error', text: 'Lütfen başlangıç ve bitiş tarihlerini seçin.' });
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      setLeaveFeedback({ type: 'error', text: 'Bitiş tarihi başlangıç tarihinden önce olamaz.' });
      return;
    }

    setSubmittingLeave(true);
    setLeaveFeedback(null);

    try {
      const { error } = await supabase.from('leave_requests').insert({
        user_id: user.id,
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim(),
        status: 'pending',
      });

      if (error) throw error;

      setLeaveFeedback({ type: 'success', text: 'İzin talebiniz yöneticinize iletildi.' });
      setStartDate('');
      setEndDate('');
      setReason('');
      fetchLeaves(user.id);
    } catch {
      setLeaveFeedback({ type: 'error', text: 'Talep gönderilirken hata oluştu, tekrar deneyin.' });
    } finally {
      setSubmittingLeave(false);
    }
  };

  const startScanner = async () => {
    isScanHandledRef.current = false;
    setScanError('');
    setScannerOpen(true);

    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode('qr-reader');
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          async (decodedText) => {
            if (isScanHandledRef.current) return;
            isScanHandledRef.current = true;

            await stopScanner();
            try {
              const url = new URL(decodedText);
              const loc = url.searchParams.get('loc');
              if (loc) {
                // Eğer kişi moladayken çıkış QR okutuyorsa önce molayı otomatik sonlandır
                if (activeBreak && user && activeShift) {
                  await supabase.from('attendance_logs').insert({
                    user_id: user.id,
                    location_id: activeShift.locationId,
                    action_type: 'BREAK_END',
                  });
                }
                router.push(`/scan?loc=${encodeURIComponent(loc)}`);
              } else {
                isScanHandledRef.current = false;
                setScanError('Geçersiz QR kod okutuldu.');
              }
            } catch {
              isScanHandledRef.current = false;
              setScanError('Bu QR kod sisteme ait değil.');
            }
          },
          () => {}
        );
      } catch {
        isScanHandledRef.current = false;
        setScanError('Kamera başlatılamadı. Tarayıcı kamera iznini kontrol edin.');
      }
    }, 200);
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

  const handleLogout = async () => {
    await stopScanner();
    clearSessionUser();
    window.location.href = '/login';
  };

  if (!user) return null;

  const thisMonthCheckIns = recentLogs.filter((l) => {
    const d = new Date(l.created_at);
    const now = new Date();
    return l.action_type === 'IN' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const approvedLeavesCount = leaves.filter((l) => l.status === 'approved').length;

  const getActionBadge = (type: string) => {
    switch (type) {
      case 'IN':
        return {
          label: 'GİRİŞ',
          className: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
        };
      case 'OUT':
        return {
          label: 'ÇIKIŞ',
          className: 'bg-red-500/15 text-red-400 border border-red-500/20',
        };
      case 'BREAK_START':
        return {
          label: 'MOLA BAŞLADI',
          className: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
        };
      case 'BREAK_END':
        return {
          label: 'MOLA BİTTİ',
          className: 'bg-sky-500/15 text-sky-400 border border-sky-500/20',
        };
      default:
        return {
          label: type,
          className: 'bg-slate-800 text-slate-300',
        };
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center pb-24">
      {/* Üst Profil Barı */}
      <div className="w-full bg-slate-900/80 backdrop-blur border-b border-slate-800/80 sticky top-0 z-20">
        <div className="max-w-md mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/icon-192.png"
              alt="Logo"
              className="w-9 h-9 rounded-xl border border-slate-800 object-cover"
            />
            <div>
              <h2 className="font-bold text-sm text-white leading-tight">{user.full_name}</h2>
              <p className="text-[11px] text-slate-400">@{user.username}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-red-400 bg-slate-950/70 hover:bg-red-950/30 rounded-xl border border-slate-800 transition"
            title="Çıkış Yap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Çıkış</span>
          </button>
        </div>
      </div>

      <div className="w-full max-w-md px-4 pt-5">
        {/* Özet Kartları */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-3.5">
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" /> Bu Ay Giriş
            </p>
            <p className="text-xl font-bold text-white mt-1">
              {thisMonthCheckIns} <span className="text-xs font-normal text-slate-500">kez</span>
            </p>
          </div>
          <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-3.5">
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Coffee className="w-3.5 h-3.5 text-amber-400" /> Bugün Mola
            </p>
            <p className="text-xl font-bold text-white mt-1">
              {todayBreakMinutes} <span className="text-xs font-normal text-slate-500">dk</span>
            </p>
          </div>
        </div>

        {/* SEKME 1: MESAİ & QR */}
        {activeTab === 'attendance' && (
          <>
            {/* Aktif Vardiya & Mola Kartı */}
            {activeShift && (
              <div
                className={`rounded-2xl p-4 mb-5 border shadow-lg transition ${
                  activeBreak
                    ? 'bg-gradient-to-br from-amber-950/70 to-slate-900 border-amber-500/50 shadow-amber-950/20'
                    : 'bg-gradient-to-br from-emerald-950/70 to-slate-900 border-emerald-500/40 shadow-emerald-950/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    {activeBreak ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-400 bg-amber-500/15 px-2.5 py-0.5 rounded-full">
                        <Coffee className="w-3 h-3 animate-bounce" />
                        Şu An Moladasınız
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        Mesai Devam Ediyor
                      </span>
                    )}
                    <p className="text-sm font-bold text-white mt-2 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-emerald-400 shrink-0" /> {activeShift.locationName}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Giriş:{' '}
                      <span className="text-slate-200 font-medium">
                        {new Date(activeShift.checkInTime).toLocaleTimeString('tr-TR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </p>
                  </div>

                  <div className="text-right bg-slate-950/80 border border-slate-800 px-3.5 py-2.5 rounded-xl">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">
                      {activeBreak ? 'Mola Süresi' : 'Toplam Süre'}
                    </p>
                    <p
                      className={`text-base font-mono font-bold mt-0.5 ${
                        activeBreak ? 'text-amber-300' : 'text-emerald-300'
                      }`}
                    >
                      {activeBreak ? breakElapsedText : elapsedText}
                    </p>
                  </div>
                </div>

                {/* Mola Başlat / Bitir Butonu */}
                <div className="mt-4 pt-3 border-t border-slate-800/80">
                  <button
                    onClick={handleToggleBreak}
                    disabled={breakLoading}
                    className={`w-full py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50 ${
                      activeBreak
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {activeBreak ? (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        {breakLoading ? 'Konum doğrulanıyor...' : 'Molayı Bitir & İşe Dön'}
                      </>
                    ) : (
                      <>
                        <Coffee className="w-3.5 h-3.5" />
                        {breakLoading ? 'Konum doğrulanıyor...' : 'Molaya Çık'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* QR Kamera / Okutma Kartı */}
            {scannerOpen ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6 shadow-xl">
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
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 mb-6 text-center shadow-lg">
                <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <QrCode className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-white mb-1">
                  {activeShift ? 'Mesaiyi Bitir' : 'Mesaiye Başla'}
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Konum doğrulaması için şube girişindeki QR kodu okutun.
                </p>
                <button
                  onClick={startScanner}
                  className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.99] ${
                    activeShift
                      ? 'bg-red-600 hover:bg-red-500 shadow-red-950/40 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/50 text-white'
                  }`}
                >
                  <Camera className="w-5 h-5" />
                  {activeShift ? 'Çıkış İçin QR Okut' : 'Giriş İçin QR Okut'}
                </button>
              </div>
            )}

            {scanError && (
              <div className="bg-red-500/10 border border-red-500/40 text-red-300 text-xs p-3.5 rounded-xl mb-5">
                {scanError}
              </div>
            )}

            {/* Son Hareketler Listesi */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" /> Son Hareketleriniz
              </h3>
              <div className="space-y-2.5">
                {recentLogs.length === 0 ? (
                  <div className="text-center py-8 bg-slate-900/40 rounded-2xl border border-slate-800/60">
                    <p className="text-xs text-slate-500">Henüz giriş-çıkış kaydınız bulunmuyor.</p>
                  </div>
                ) : (
                  recentLogs.map((log) => {
                    const badge = getActionBadge(log.action_type);
                    return (
                      <div
                        key={log.id}
                        className="flex items-center justify-between bg-slate-900/90 border border-slate-800/90 px-4 py-3 rounded-xl text-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${badge.className}`}>
                            {badge.label}
                          </span>
                          <span className="text-slate-200 font-medium text-xs sm:text-sm">
                            {log.locations?.name || 'Şube'}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 font-mono">
                          {new Date(log.created_at).toLocaleString('tr-TR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}

        {/* SEKME 2: İZİN TALEPLERİ */}
        {activeTab === 'leaves' && (
          <div className="space-y-6">
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <CalendarPlus className="w-4 h-4 text-emerald-400" /> Yeni İzin Talebi
                </h3>
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5 text-emerald-400" /> Onaylı: {approvedLeavesCount}
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Yıllık izin, rapor veya mazeret izni talebinizi oluşturun.
              </p>

              {leaveFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs mb-4 border ${
                    leaveFeedback.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                      : 'bg-red-500/10 border-red-500/40 text-red-300'
                  }`}
                >
                  {leaveFeedback.text}
                </div>
              )}

              <form onSubmit={handleLeaveSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">İzin Türü</label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Yıllık İzin">Yıllık İzin</option>
                    <option value="Hastalık / Rapor">Hastalık / Rapor</option>
                    <option value="Mazeret İzni">Mazeret İzni</option>
                    <option value="Ücretsiz İzin">Ücretsiz İzin</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Başlangıç</label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Bitiş</label>
                    <input
                      type="date"
                      required
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Açıklama (İsteğe bağlı)</label>
                  <textarea
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Kısa bir not ekleyebilirsiniz..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingLeave}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {submittingLeave ? 'Gönderiliyor...' : 'Talebi Gönder'}
                </button>
              </form>
            </div>

            {/* Geçmiş İzin Talepleri */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Geçmiş Taleplerim
              </h3>
              <div className="space-y-2.5">
                {leaves.length === 0 ? (
                  <div className="text-center py-6 bg-slate-900/40 rounded-2xl border border-slate-800/60">
                    <p className="text-xs text-slate-500">Henüz izin talebiniz bulunmuyor.</p>
                  </div>
                ) : (
                  leaves.map((item) => (
                    <div
                      key={item.id}
                      className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">{item.leave_type}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {new Date(item.start_date).toLocaleDateString('tr-TR')} –{' '}
                          {new Date(item.end_date).toLocaleDateString('tr-TR')}
                        </p>
                        {item.reason && (
                          <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{item.reason}</p>
                        )}
                      </div>
                      <div>
                        {item.status === 'approved' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" /> Onaylandı
                          </span>
                        )}
                        {item.status === 'rejected' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
                            <XCircle className="w-3 h-3" /> Reddedildi
                          </span>
                        )}
                        {item.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <Hourglass className="w-3 h-3" /> Bekliyor
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Alt Mobil Navigasyon Barı */}
      <div className="fixed bottom-0 inset-x-0 bg-slate-900/95 backdrop-blur border-t border-slate-800 z-30">
        <div className="max-w-md mx-auto grid grid-cols-2">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`py-3 flex flex-col items-center justify-center gap-1 text-xs font-medium transition ${
              activeTab === 'attendance' ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <QrCode className="w-5 h-5" />
            <span>Mesai & QR</span>
          </button>
          <button
            onClick={() => {
              stopScanner();
              setActiveTab('leaves');
            }}
            className={`py-3 flex flex-col items-center justify-center gap-1 text-xs font-medium transition ${
              activeTab === 'leaves' ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <CalendarPlus className="w-5 h-5" />
            <span>İzin Talebi</span>
          </button>
        </div>
      </div>
    </div>
  );
}