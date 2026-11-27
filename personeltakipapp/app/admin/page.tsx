'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
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
} from 'lucide-react';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'logs' | 'staff'>('logs');
  const [logs, setLogs] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Yeni personel formu state'leri
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'staff' | 'admin'>('staff');
  const [creating, setCreating] = useState(false);
  const [formMessage, setFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

    await Promise.all([fetchLogs(), fetchStaff()]);
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

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setFormMessage({ type: 'error', text: 'Oturum süresi dolmuş, tekrar giriş yapın.' });
      setCreating(false);
      return;
    }

    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ fullName, username, password, role }),
    });

    const result = await res.json();

    if (!res.ok) {
      setFormMessage({ type: 'error', text: result.error || 'Kayıt başarısız.' });
    } else {
      setFormMessage({
        type: 'success',
        text: `${result.fullName} (Kullanıcı adı: ${result.username}) başarıyla oluşturuldu.`,
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
      alert(`${name} için telefon kilidi sıfırlandı. Yeni telefondan giriş yapabilir.`);
      fetchStaff();
    }
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
        {/* Üst Başlık */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="p-2 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold">Yönetici Paneli</h1>
              <p className="text-xs text-slate-400">Personel takibi ve kullanıcı yönetimi</p>
            </div>
          </div>

          {/* Sekmeler */}
          <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
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
        </div>

        {/* SEKME 1: CANLI HAREKETLER */}
        {activeTab === 'logs' && (
          <>
            <div className="flex justify-end gap-2 mb-4">
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
          </>
        )}

        {/* SEKME 2: PERSONEL EKLEME & LİSTE */}
        {activeTab === 'staff' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sol: Yeni Personel Formu */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-fit">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
                <UserPlus className="w-5 h-5 text-indigo-400" /> Yeni Kullanıcı Ekle
              </h2>
              <p className="text-xs text-slate-400 mb-5">
                E-posta gerekmez; yalnızca kullanıcı adı ve parola tanımlayın.
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
                    placeholder="Örn: ahmet.yilmaz"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Parola (En az 6 karakter)</label>
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Örn: 123456"
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
                  {creating ? 'Oluşturuluyor...' : 'Kullanıcıyı Oluştur'}
                </button>
              </form>
            </div>

            {/* Sağ: Kayıtlı Personel Listesi */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h2 className="font-semibold text-sm">Kayıtlı Personeller ({staffList.length})</h2>
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
                      <th className="px-4 py-3">Rol</th>
                      <th className="px-4 py-3">Cihaz Durumu</th>
                      <th className="px-4 py-3 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {staffList.map((person) => (
                      <tr key={person.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-medium">{person.full_name || 'İsimsiz'}</td>
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
                              <Smartphone className="w-3.5 h-3.5" /> Telefona Tanımlı
                            </span>
                          ) : (
                            <span className="text-slate-500">Henüz giriş yapmadı</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {person.device_id && (
                            <button
                              onClick={() => resetDeviceLock(person.id, person.full_name)}
                              className="text-xs px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-amber-300"
                            >
                              Cihaz Kilidini Sıfırla
                            </button>
                          )}
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