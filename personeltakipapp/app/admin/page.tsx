'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getSessionUser, clearSessionUser } from '@/lib/session';
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
} from 'lucide-react';

interface ActiveWorker {
  userId: string;
  fullName: string;
  username: string;
  checkInTime: string;
  distanceMeters: number;
}

interface LocationBox {
  id: string;
  name: string;
  activeWorkers: ActiveWorker[];
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'logs' | 'staff'>('logs');
  const [locationBoxes, setLocationBoxes] = useState<LocationBox[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

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
    Promise.all([fetchLiveLocations(), fetchStaff()]);
  }, []);

  const fetchLiveLocations = async () => {
    setLoading(true);

    // 1. Tüm şubeleri çek
    const { data: locations } = await supabase
      .from('locations')
      .select('id, name')
      .order('name', { ascending: true });

    // 2. Bugünün başlangıcından itibaren tüm giriş/çıkış hareketlerini çek
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: todayLogs } = await supabase
      .from('attendance_logs')
      .select('user_id, location_id, action_type, created_at, distance_meters, profiles(full_name, username)')
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: false });

    // 3. Her personelin bugünkü EN SON hareketini bul (sadece son hareketi 'IN' olanlar içeridedir)
    const latestUserStatus = new Map<string, any>();
    if (todayLogs) {
      for (const log of todayLogs) {
        if (!latestUserStatus.has(log.user_id)) {
          latestUserStatus.set(log.user_id, log);
        }
      }
    }

    // 4. Şube kutularını oluştur ve içerideki personelleri ilgili şubeye yerleştir
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
            distanceMeters: log.distance_meters,
          });
        }
      });

      return {
        id: loc.id,
        name: loc.name,
        activeWorkers: workersInThisLoc,
      };
    });

    setLocationBoxes(boxes);
    setLoading(false);
  };

  const fetchStaff = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name', { ascending: true });

    if (data) setStaffList(data);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setFormMessage(null);

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (cleanUsername.length < 3) {
      setFormMessage({ type: 'error', text: 'Kullanıcı adı en az 3 karakter olmalıdır.' });
      setCreating(false);
      return;
    }

    const { error } = await supabase.from('profiles').insert({
      full_name: fullName.trim(),
      username: cleanUsername,
      password: password.trim(),
      role,
    });

    if (error) {
      setFormMessage({
        type: 'error',
        text: error.code === '23505' ? 'Bu kullanıcı adı zaten kayıtlı.' : error.message,
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

  const exportLiveCSV = () => {
    const headers = ['Sube_Lokasyon', 'Personel', 'Kullanici_Adi', 'Giris_Saati', 'Mesafe_Metre'];
    const rows: any[] = [];

    locationBoxes.forEach((box) => {
      box.activeWorkers.forEach((w) => {
        rows.push([
          box.name,
          w.fullName,
          w.username,
          new Date(w.checkInTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
          w.distanceMeters,
        ]);
      });
    });

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\n');

    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `aktif_personel_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
              <p className="text-xs text-slate-400">Şube bazlı anlık personel durumu ve yönetim</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab('logs')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === 'logs'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ClipboardList className="w-4 h-4" /> Canlı Hareketler
              </button>
              <button
                onClick={() => setActiveTab('staff')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === 'staff'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-4 h-4" /> Personel Yönetimi
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

        {/* SEKME 1: LOKASYON BAZLI CANLI KUTULAR */}
        {activeTab === 'logs' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div className="text-sm text-slate-300">
                Şu an işyerlerinde aktif toplam personel:{' '}
                <span className="font-bold text-emerald-400">{totalActiveCount} kişi</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchLiveLocations}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm hover:bg-slate-800"
                >
                  <RefreshCw className="w-4 h-4" /> Yenile
                </button>
                <button
                  onClick={exportLiveCSV}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium"
                >
                  <Download className="w-4 h-4" /> Aktif Listeyi İndir
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12 text-slate-400">Şube verileri yükleniyor...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {locationBoxes.map((box) => (
                  <div
                    key={box.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-lg"
                  >
                    <div>
                      {/* Kutu Üst Başlık */}
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

                      {/* Kutu İçi Çalışan Listesi */}
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
                                  {worker.username && (
                                    <p className="text-xs text-slate-400 font-mono">@{worker.username}</p>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded-md">
                                  <Clock className="w-3 h-3" />
                                  {new Date(worker.checkInTime).toLocaleTimeString('tr-TR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* SEKME 2: PERSONEL EKLEME & LİSTE */}
        {activeTab === 'staff' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-fit">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
                <UserPlus className="w-5 h-5 text-indigo-400" /> Yeni Kullanıcı Ekle
              </h2>
              <p className="text-xs text-slate-400 mb-5">
                Doğrudan veritabanına kullanıcı adı ve parola tanımlar.
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
                      <th className="px-4 py-3">Parola</th>
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
                        <td className="px-4 py-3 text-slate-400 font-mono text-xs">{person.password}</td>
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
                          {person.device_id ? (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <Smartphone className="w-3.5 h-3.5" /> Tanımlı
                            </span>
                          ) : (
                            <span className="text-slate-500">Boş</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                          {person.device_id && (
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