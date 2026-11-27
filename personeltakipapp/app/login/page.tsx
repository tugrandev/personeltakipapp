'use client';

import { useState, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { setSessionUser } from '@/lib/session';
import { useRouter, useSearchParams } from 'next/navigation';
import { QrCode } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getOrCreateDeviceId = () => {
    let deviceId = localStorage.getItem('pt_device_id');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('pt_device_id', deviceId);
    }
    return deviceId;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data: users, error: rpcError } = await supabase.rpc('verify_user_login', {
      p_username: username,
      p_password: password,
    });

    const profile = users && users.length > 0 ? users[0] : null;

    if (rpcError || !profile) {
      setError('Kullanıcı adı veya parola hatalı.');
      setLoading(false);
      return;
    }

    // Personel hesapları için cihaz kilidi kontrolü (Admin sınırsız cihazdan girebilir)
    const currentDeviceId = getOrCreateDeviceId();
    if (profile.role !== 'admin') {
      if (!profile.device_id) {
        await supabase
          .from('profiles')
          .update({ device_id: currentDeviceId })
          .eq('id', profile.id);
        profile.device_id = currentDeviceId;
      } else if (profile.device_id !== currentDeviceId) {
        setError('Bu hesap başka bir telefona tanımlı! Yönetici ile iletişime geçin.');
        setLoading(false);
        return;
      }
    }

    setSessionUser({
      id: profile.id,
      full_name: profile.full_name,
      username: profile.username,
      role: profile.role,
      device_id: profile.device_id,
    });

    // Kullanıcının rolüne göre otomatik yönlendirme
    if (profile.role === 'admin') {
      router.push('/admin');
    } else if (redirectParam) {
      router.push(redirectParam);
    } else {
      router.push('/');
    }
  };

  return (
    <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex justify-center mb-3">
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
          <QrCode className="w-8 h-8" />
        </div>
      </div>

      <h1 className="text-2xl font-bold text-center mb-1">Personel Takip</h1>
      <p className="text-slate-400 text-sm text-center mb-6">
        Devam etmek için giriş yapın
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Kullanıcı Adı</label>
          <input
            type="text"
            required
            autoCapitalize="none"
            autoCorrect="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Kullanıcı adınız"
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Parola</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 font-semibold rounded-lg transition disabled:opacity-50"
        >
          {loading ? 'Kontrol ediliyor...' : 'Giriş Yap'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-4">
      <Suspense fallback={<div className="text-slate-400">Yükleniyor...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}