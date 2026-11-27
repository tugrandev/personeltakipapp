'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getSessionUser, clearSessionUser, AppUser } from '@/lib/session';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  RefreshCw,
  Download,
  UserPlus,
  Users,
  ClipboardList,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Trash2,
  LogOut,
  MapPin,
  Clock,
  Calendar,
  Building2,
  LogOut as ForceOutIcon,
  Save,
  Plus,
} from 'lucide-react';

interface ActiveWorker {
  userId: string;
  fullName: string;
  username: string;
  checkInTime: string;
  locationId: string;
}

interface LocationBox {
  id: string;
  name: string;
  activeWorkers: ActiveWorker[];
}

interface ShiftSummary {
  id: string;
  date: string;
  staffName: string;
  locationName: string;
  inTime: string;
  outTime: string | null;
  durationText: string;
  durationMinutes: number;
}

export default function AdminPage() {
  const [adminUser, setAdminUser] = useState<AppUser | null>(null);
  const [activeTab, setActiveTab] = useState<'live' | 'report' | 'locations' | 'staff'>('live');
  const router = useRouter();

  // Canlı durum state'leri
  const [locationBoxes, setLocationBoxes] = useState<LocationBox[]>([]);
  const [loadingLive, setLoadingLive] = useState(true);

  // Puantaj & Rapor state'leri
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedLocFilter, setSelectedLocFilter] = useState('ALL');
  const [shifts, setShifts] = useState<ShiftSummary[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);

  // Şube yönetimi state'leri
  const [locationsList, setLocationsList] = useState<any[]>([]);
  const [newLocName, setNewLocName] = useState('');
  const [newLocSecret, setNewLocSecret] = useState('');
  const [newLocLat, setNewLocLat] = useState('');
  const [newLocLng, setNewLocLng] = useState('');
  const [newLocRadius, setNewLocRadius] = useState('75');

  // Personel yönetimi state'leri
  const [staffList, setStaffList] = useState<any[]>([]);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'staff' | 'admin'>('staff');
  const [creating, setCreating] = useState(false);
  const [formMessage, setFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const user = getSessionUser();
    if (!user || user.role !== 'admin') {
      router.push('/login');
      return;
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const firstDayStr = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    setStartDate(firstDayStr);
    setEndDate(todayStr);

    setAdminUser(user);
    fetchLiveLocations();
    fetchLocationsList();
    fetchStaff();
  }, []);

  useEffect(() => {
    if (activeTab === 'report' && startDate && endDate) {
      fetchPuantajReport();
    }
  }, [activeTab, startDate, endDate, selectedLocFilter]);

  // 1. CANLI DURUM ÇEKME (Son 16 saatlik vardiyaya göre)
  const fetchLiveLocations = async () => {
    setLoadingLive(true);

    const { data: locations } = await supabase
      .from('locations')
      .select('id, name')
      .order('name', { ascending: true });

    const sixteenHoursAgo = new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString();

    const { data: recentLogs } = await supabase
      .from('attendance_logs')
      .select('user_id, location_id, action_type, created_at, profiles(full_name, username)')
      .gte('created_at', sixteenHoursAgo)
      .order('created_at', { ascending: false });

    const latestUserStatus = new Map<string, any>();
    if (recentLogs) {
      for (const log of recentLogs) {
        if (!latestUserStatus.has(log.user_id)) {
          latestUserStatus.set(log.user_id, log);
        }
      }
    }

    const boxes: LocationBox[] = (locations || []).map((loc) => {
      const workersInThisLoc: ActiveWorker[] = [];
      latestUserStatus.forEach((log) => {
        if (log.action_type === 'IN' && log.location_id === loc.id) {
          const prof = Array.isArray(log.profiles) ? log.profiles[0] : log.profiles;
          workersInThisLoc.push({
            userId: log.user_id,
            fullName: prof?.full_name || 'İsimsiz Personel',
            username: prof?.username || '',
            checkInTime: log.created_at,
            locationId: loc.id,
          });
        }
      });
      return { id: loc.id, name: loc.name, activeWorkers: workersInThisLoc };
    });

    setLocationBoxes(boxes);
    setLoadingLive(false);
  };

  // Yönetici tarafından manuel çıkış verme (Çıkış QR okutmayı unutan personel için)
  const forceCheckOut = async (worker: ActiveWorker) => {
    if (!confirm(`${worker.fullName} için manuel çıkış kaydı oluşturulsun mu?`)) return;

    const { error } = await supabase.from('attendance_logs').insert({
      user_id: worker.userId,
      location_id: worker.locationId,
      action_type: 'OUT',
      scanned_lat: 0,
      scanned_lng: 0,
      distance_meters: 0,
    });

    if (!error) {
      fetchLiveLocations();
    }
  };

  // 2. PUANTAJ & ÇALIŞMA SÜRESİ RAPORU
  const fetchPuantajReport = async () => {
    setLoadingReport(true);
    const startISO = new Date(`${startDate}T00:00:00`).toISOString();
    const endISO = new Date(`${endDate}T23:59:59`).toISOString();

    let query = supabase
      .from('attendance_logs')
      .select('id, user_id, location_id, action_type, created_at, profiles(full_name), locations(name)')
      .gte('created_at', startISO)
      .lte('created_at', endISO)
      .order('created_at', { ascending: true });

    if (selectedLocFilter !== 'ALL') {
      query = query.eq('location_id', selectedLocFilter);
    }

    const { data: rawLogs } = await query;

    const openShifts = new Map<string, any>();
    const completedShifts: ShiftSummary[] = [];

    (rawLogs || []).forEach((log: any) => {
      const prof = Array.isArray(log.profiles) ? log.profiles[0] : log.profiles;
      const loc = Array.isArray(log.locations) ? log.locations[0] : log.locations;
      const staffName = prof?.full_name || 'Bilinmiyor';
      const locationName = loc?.name || '';

      if (log.action_type === 'IN') {
        if (openShifts.has(log.user_id)) {
          const prev = openShifts.get(log.user_id);
          completedShifts.push({
            id: prev.id,
            date: new Date(prev.created_at).toLocaleDateString('tr-TR'),
            staffName: prev.staffName,
            locationName: prev.locationName,
            inTime: new Date(prev.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            outTime: null,
            durationText: 'Çıkış Eksik',
            durationMinutes: 0,
          });
        }
        openShifts.set(log.user_id, { ...log, staffName, locationName });
      } else if (log.action_type === 'OUT') {
        const matchingIn = openShifts.get(log.user_id);
        if (matchingIn) {
          const diffMs = new Date(log.created_at).getTime() - new Date(matchingIn.created_at).getTime();
          const totalMins = Math.max(0, Math.floor(diffMs / 60000));
          const hours = Math.floor(totalMins / 60);
          const mins = totalMins % 60;

          completedShifts.push({
            id: matchingIn.id,
            date: new Date(matchingIn.created_at).toLocaleDateString('tr-TR'),
            staffName,
            locationName: matchingIn.locationName,
            inTime: new Date(matchingIn.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            outTime: new Date(log.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            durationText: `${hours} sa ${mins} dk`,
            durationMinutes: totalMins,
          });
          openShifts.delete(log.user_id);
        }
      }
    });

    openShifts.forEach((openLog) => {
      completedShifts.push({
        id: openLog.id,
        date: new Date(openLog.created_at).toLocaleDateString('tr-TR'),
        staffName: openLog.staffName,
        locationName: openLog.locationName,
        inTime: new Date(openLog.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        outTime: 'İçeride',
        durationText: 'Devam Ediyor',
        durationMinutes: 0,
      });
    });

    setShifts(completedShifts.reverse());
    setLoadingReport(false);
  };

  const exportPuantajCSV = () => {
    const headers = ['Tarih', 'Personel', 'Sube', 'Giris_Saati', 'Cikis_Saati', 'Net_Calisma_Suresi'];
    const rows = shifts.map((s) => [
      s.date,
      s.staffName,
      s.locationName,
      s.inTime,
      s.outTime || 'Çıkış Yok',
      s.durationText,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\n');

    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `puantaj_${startDate}_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 3. ŞUBE YÖNETİMİ
  const fetchLocationsList = async () => {
    const { data } = await supabase.from('locations').select('*').order('name');
    if (data) setLocationsList(data);
  };

  const updateLocationField = (id: string, field: string, value: any) => {
    setLocationsList((prev) =>
      prev.map((loc) => (loc.id === id ? { ...loc, [field]: value } : loc))
    );
  };

  const saveLocationRow = async (loc: any) => {
    const { error } = await supabase
      .from('locations')
      .update({
        name: loc.name,
        latitude: parseFloat(loc.latitude),
        longitude: parseFloat(loc.longitude),
        radius_meters: parseInt(loc.radius_meters, 10),
      })
      .eq('id', loc.id);

    if (!error) alert(`${loc.name} güncellendi.`);
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('locations').insert({
      name: newLocName.trim(),
      qr_secret: newLocSecret.trim(),
      latitude: parseFloat(newLocLat),
      longitude: parseFloat(newLocLng),
      radius_meters: parseInt(newLocRadius, 10),
    });

    if (!error) {
      setNewLocName('');
      setNewLocSecret('');
      setNewLocLat('');
      setNewLocLng('');
      setNewLocRadius('75');
      fetchLocationsList();
      fetchLiveLocations();
    } else {
      alert('Şube eklenemedi: ' + error.message);
    }
  };

  // 4. PERSONEL YÖNETİMİ (RPC ile güvenli ekleme)
  const fetchStaff = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, username, role, device_id')
      .order('full_name', { ascending: true });

    if (data) setStaffList(data);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser) return;
    setCreating(true);
    setFormMessage(null);

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (cleanUsername.length < 3) {
      setFormMessage({ type: 'error', text: 'Kullanıcı adı en az 3 karakter olmalıdır.' });
      setCreating(false);
      return;
    }

    const { error } = await supabase.rpc('admin_create_user', {
      p_admin_id: adminUser.id,
      p_full_name: fullName,
      p_username: cleanUsername,
      p_password: password,
      p_role: role,
    });

    if (error) {
      setFormMessage({
        type: 'error',
        text: error.message.includes('duplicate') ? 'Bu kullanıcı adı zaten kayıtlı.' : error.message,
      });
    } else {
      setFormMessage({
        type: 'success',
        text: `${fullName.trim()} (${cleanUsername}) başarıyla oluşturuldu.`,
      });
      setFullName('');
      setUsername('');
      setPassword('');
      setRole('staff');
      fetchStaff();
    }

    setCreating(false);
  };

  const resetDeviceLock = async (userId: string, name: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ device_id: null })
      .eq('id', userId);

    if (!error) {
      alert(`${name} için telefon kilidi sıfırlandı.`);
      fetchStaff();
    }
  };

  const deleteUser = async (userId: string, name: string) => {
    if (!confirm(`${name} kullanıcısını silmek istediğinize emin misiniz?`)) return;
    await supabase.from('profiles').delete().eq('id', userId);
    fetchStaff();
  };

  const totalActiveCount = locationBoxes.reduce((sum, box) => sum + box.activeWorkers.length, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Üst Başlık & Sekmeler */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="p-2 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800"
              title="Ana Sayfa"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold">Yönetici Paneli</h1>
              <p className="text-xs text-slate-400">Canlı takip, puantaj raporları ve şube yönetimi</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab('live')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                  activeTab === 'live' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <ClipboardList className="w-4 h-4" /> Canlı Durum
              </button>
              <button
                onClick={() => setActiveTab('report')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                  activeTab === 'report' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Calendar className="w-4 h-4" /> Puantaj & Rapor
              </button>
              <button
                onClick={() => setActiveTab('locations')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                  activeTab === 'locations' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Building2 className="w-4 h-4" /> Şubeler
              </button>
              <button
                onClick={() => setActiveTab('staff')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                  activeTab === 'staff' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-4 h-4" /> Personeller
              </button>
            </div>

            <button
              onClick={() => {
                clearSessionUser();
                router.push('/login');
              }}
              className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-white"
              title="Çıkış Yap"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* SEKME 1: CANLI LOKASYON KUTULARI */}
        {activeTab === 'live' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div className="text-sm text-slate-300">
                Şu an işyerlerinde aktif toplam personel:{' '}
                <span className="font-bold text-emerald-400">{totalActiveCount} kişi</span>
              </div>
              <button
                onClick={fetchLiveLocations}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm hover:bg-slate-800"
              >
                <RefreshCw className="w-4 h-4" /> Yenile
              </button>
            </div>

            {loadingLive ? (
              <div className="text-center py-12 text-slate-400">Şube verileri yükleniyor...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {locationBoxes.map((box) => (
                  <div
                    key={box.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg"
                  >
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
                          <MapPin className="w-5 h-5" />
                        </div>
                        <h2 className="font-bold text-base text-white">{box.name}</h2>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          box.activeWorkers.length > 0
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {box.activeWorkers.length} Çalışan
                      </span>
                    </div>

                    {box.activeWorkers.length === 0 ? (
                      <div className="py-8 text-center text-sm text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800/50">
                        Şu an bu lokasyonda aktif çalışan bulunmuyor.
                      </div>
                    ) : (
                      <ul className="space-y-2.5">
                        {box.activeWorkers.map((worker) => (
                          <li
                            key={worker.userId}
                            className="flex items-center justify-between bg-slate-800/50 border border-slate-700/60 px-3.5 py-2.5 rounded-xl"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                              <div>
                                <p className="text-sm font-semibold text-white">{worker.fullName}</p>
                                <p className="text-xs text-slate-400 font-mono">@{worker.username}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded-md">
                                <Clock className="w-3 h-3" />
                                {new Date(worker.checkInTime).toLocaleTimeString('tr-TR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              <button
                                onClick={() => forceCheckOut(worker)}
                                className="text-xs px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-md flex items-center gap-1"
                                title="Manuel Çıkış Ver"
                              >
                                <ForceOutIcon className="w-3 h-3" /> Çıkış Ver
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* SEKME 2: PUANTAJ & ÇALIŞMA SÜRESİ RAPORU */}
        {activeTab === 'report' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Başlangıç Tarihi</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Bitiş Tarihi</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Şube Filtresi</label>
                  <select
                    value={selectedLocFilter}
                    onChange={(e) => setSelectedLocFilter(e.target.value)}
                    className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                  >
                    <option value="ALL">Tüm Şubeler</option>
                    {locationsList.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={exportPuantajCSV}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium"
              >
                <Download className="w-4 h-4" /> Puantajı Excel İndir
              </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-800/60 text-slate-400 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3">Tarih</th>
                      <th className="px-4 py-3">Personel</th>
                      <th className="px-4 py-3">Şube</th>
                      <th className="px-4 py-3">Giriş</th>
                      <th className="px-4 py-3">Çıkış</th>
                      <th className="px-4 py-3">Net Süre</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {loadingReport ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          Hesaplanıyor...
                        </td>
                      </tr>
                    ) : shifts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          Seçilen tarih aralığında vardiya kaydı bulunamadı.
                        </td>
                      </tr>
                    ) : (
                      shifts.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-800/30">
                          <td className="px-4 py-3 text-slate-300">{s.date}</td>
                          <td className="px-4 py-3 font-medium">{s.staffName}</td>
                          <td className="px-4 py-3 text-slate-300">{s.locationName}</td>
                          <td className="px-4 py-3 text-emerald-400 font-mono">{s.inTime}</td>
                          <td className="px-4 py-3 text-amber-400 font-mono">{s.outTime || '-'}</td>
                          <td className="px-4 py-3 font-semibold text-white">{s.durationText}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SEKME 3: ŞUBE & KOORDİNAT YÖNETİMİ */}
        {activeTab === 'locations' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-800">
                <h2 className="font-semibold text-sm">Mevcut Şubeler & Mesafe Sınırları</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-800/60 text-slate-400 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3">Şube Adı</th>
                      <th className="px-4 py-3">Enlem (Lat)</th>
                      <th className="px-4 py-3">Boylam (Lng)</th>
                      <th className="px-4 py-3">Yarıçap (Metre)</th>
                      <th className="px-4 py-3">QR Kodu</th>
                      <th className="px-4 py-3 text-right">Kaydet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {locationsList.map((loc) => (
                      <tr key={loc.id}>
                        <td className="px-4 py-2.5">
                          <input
                            type="text"
                            value={loc.name}
                            onChange={(e) => updateLocationField(loc.id, 'name', e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm w-44"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="text"
                            value={loc.latitude}
                            onChange={(e) => updateLocationField(loc.id, 'latitude', e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs font-mono w-32"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="text"
                            value={loc.longitude}
                            onChange={(e) => updateLocationField(loc.id, 'longitude', e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs font-mono w-32"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="number"
                            value={loc.radius_meters}
                            onChange={(e) => updateLocationField(loc.id, 'radius_meters', e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm w-20"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono text-slate-400">
                          {loc.qr_secret}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => saveLocationRow(loc)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-xs font-semibold"
                          >
                            <Save className="w-3.5 h-3.5" /> Kaydet
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Yeni Şube Ekleme Formu */}
            <form
              onSubmit={handleAddLocation}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
            >
              <div>
                <label className="block text-xs text-slate-400 mb-1">Yeni Şube Adı</label>
                <input
                  type="text"
                  required
                  value={newLocName}
                  onChange={(e) => setNewLocName(e.target.value)}
                  placeholder="Örn: Merkez Ofis"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">QR Anahtarı</label>
                <input
                  type="text"
                  required
                  value={newLocSecret}
                  onChange={(e) => setNewLocSecret(e.target.value)}
                  placeholder="merkez_SECRET"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Enlem (Lat)</label>
                <input
                  type="text"
                  required
                  value={newLocLat}
                  onChange={(e) => setNewLocLat(e.target.value)}
                  placeholder="35.2227"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Boylam (Lng)</label>
                <input
                  type="text"
                  required
                  value={newLocLng}
                  onChange={(e) => setNewLocLng(e.target.value)}
                  placeholder="33.4817"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Yarıçap (m)</label>
                <input
                  type="number"
                  required
                  value={newLocRadius}
                  onChange={(e) => setNewLocRadius(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                />
              </div>
              <button
                type="submit"
                className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-semibold flex items-center justify-center gap-1"
              >
                <Plus className="w-4 h-4" /> Şube Ekle
              </button>
            </form>
          </div>
        )}

        {/* SEKME 4: PERSONEL EKLEME & LİSTE */}
        {activeTab === 'staff' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-fit">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
                <UserPlus className="w-5 h-5 text-indigo-400" /> Yeni Kullanıcı Ekle
              </h2>
              <p className="text-xs text-slate-400 mb-5">
                Şifreler veritabanında güvenli olarak saklanır.
              </p>

              {formMessage && (
                <div
                  className={`p-3 rounded-lg text-xs mb-4 flex items-start gap-2 ${
                    formMessage.type === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-300'
                      : 'bg-red-500/10 border border-red-500/40 text-red-300'
                  }`}
                >
                  {formMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{formMessage.text}</span>
                </div>
              )}

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Ad Soyad</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Örn: Ahmet Yılmaz"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Kullanıcı Adı</label>
                  <input
                    type="text"
                    required
                    autoCapitalize="none"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Örn: ahmet"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Parola</label>
                  <input
                    type="text"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Örn: 1234"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Yetki Rolü</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'staff' | 'admin')}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="staff">Personel</option>
                    <option value="admin">Yönetici (Admin)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={creating}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold transition disabled:opacity-50"
                >
                  {creating ? 'Kaydediliyor...' : 'Kullanıcıyı Ekle'}
                </button>
              </form>
            </div>

            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h2 className="font-semibold text-sm">Kayıtlı Kullanıcılar ({staffList.length})</h2>
                <button
                  onClick={fetchStaff}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Yenile
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-800/60 text-slate-400 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3">Ad Soyad</th>
                      <th className="px-4 py-3">Kullanıcı Adı</th>
                      <th className="px-4 py-3">Rol</th>
                      <th className="px-4 py-3">Cihaz</th>
                      <th className="px-4 py-3 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {staffList.map((person) => (
                      <tr key={person.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-medium">{person.full_name || 'İsimsiz'}</td>
                        <td className="px-4 py-3 text-slate-300 font-mono text-xs">{person.username}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              person.role === 'admin'
                                ? 'bg-indigo-500/20 text-indigo-300'
                                : 'bg-slate-700 text-slate-300'
                            }`}
                          >
                            {person.role === 'admin' ? 'Yönetici' : 'Personel'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {person.role === 'admin' ? (
                            <span className="text-indigo-400">Sınırsız</span>
                          ) : person.device_id ? (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <Smartphone className="w-3.5 h-3.5" /> Tanımlı
                            </span>
                          ) : (
                            <span className="text-slate-500">Boş</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                          {person.device_id && person.role !== 'admin' && (
                            <button
                              onClick={() => resetDeviceLock(person.id, person.full_name)}
                              className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-amber-300"
                            >
                              Cihaz Sıfırla
                            </button>
                          )}
                          <button
                            onClick={() => deleteUser(person.id, person.full_name)}
                            className="p-1.5 text-slate-400 hover:text-red-400"
                            title="Kullanıcıyı Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}