'use client';

import { useState, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/personel';

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

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !data.user) {
      setError(authError?.message || 'Bilinmeyen bir giriş hatası oluştu.');
      setLoading(false);
      return;
    }

    const currentDeviceId = getOrCreateDeviceId();
    const { data: profile } = await supabase
      .from('profiles')
      .select('device_id, role')
      .eq('id', data.user.id)
      .single();

    if (profile) {
      if (!profile.device_id) {
        await supabase
          .from('profiles')
          .update({ device_id: currentDeviceId })
          .eq('id', data.user.id);
      } else if (profile.device_id !== currentDeviceId && profile.role !== 'admin') {
        await supabase.auth.signOut();
        setError('Bu hesap başka bir telefona tanımlı! Yönetici ile iletişime geçin.');
        setLoading(false);
        return;
      }
    }

    router.push(redirectTo);
  };

  return (
    <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      <h1 className="text-2xl font-bold text-center mb-1">Personel Takip</h1>
      <p className="text-slate-400 text-sm text-center mb-6">Devam etmek için giriş yapın</p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">E-posta</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ad.soyad@sirket.com"
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Şifre</label>
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