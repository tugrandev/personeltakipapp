'use client';

import { useState, useEffect, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, UserCheck } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect');

  // QR koddan gelindiyse (?redirect=...) varsayılan olarak Personel Girişi,
  // site doğrudan açıldıysa varsayılan olarak Yönetici Girişi açılır.
  const [loginMode, setLoginMode] = useState<'admin' | 'staff'>(
    redirectParam ? 'staff' : 'admin'
  );

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (redirectParam) {
      setLoginMode('staff');
    }
  }, [redirectParam]);

  const getOrCreateDeviceId = () => {
    let deviceId = localStorage.getItem('pt_device_id');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('pt_device_id', deviceId);
    }
    return deviceId;
  };

  // Kullanıcı adından '@' kaldırıldığı için arka planda Supabase uyumlu formata çevirir.
  // Eğer eski bir e-posta adresiyle giriliyorsa '@' içerdiği için olduğu gibi bırakır.
  const formatAuthEmail = (rawInput: string) => {
    const cleaned = rawInput.trim().toLowerCase();
    if (cleaned.includes('@')) return cleaned;
    return `${cleaned}@personeltakip.local`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formattedEmail = formatAuthEmail(username);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: formattedEmail,
      password,
    });

    if (authError || !data.user) {
      setError('Kullanıcı adı veya şifre hatalı.');
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
      // Yönetici girişi sekmesinden normal personel girmeye çalışırsa uyar
      if (loginMode === 'admin' && profile.role !== 'admin') {
        await supabase.auth.signOut();
        setError('Bu hesap yönetici yetkisine sahip değil. Personel girişini kullanın.');
        setLoading(false);
        return;
      }

      // Cihaz kilidi kontrolü (Admin hariç)
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

    // Yönlendirme hedefi
    if (redirectParam) {
      router.push(redirectParam);
    } else if (loginMode === 'admin' || profile?.role === 'admin') {
      router.push('/admin');
    } else {
      router.push('/');
    }
  };

  return (
    <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex justify-center mb-3">
        {loginMode === 'admin' ? (
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400">
            <ShieldCheck className="w-8 h-8" />
          </div>
        ) : (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
            <UserCheck className="w-8 h-8" />
          </div>
        )}
      </div>

      <h1 className="text-2xl font-bold text-center mb-1">
        {loginMode === 'admin' ? 'Yönetici Girişi' : 'Personel Girişi'}
      </h1>
      <p className="text-slate-400 text-sm text-center mb-6">
        {loginMode === 'admin'
          ? 'Yönetim paneline erişmek için giriş yapın'
          : 'Devam etmek için kullanıcı adınızı girin'}
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
            placeholder={loginMode === 'admin' ? 'admin' : 'ad.soyad'}
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
          className={`w-full py-3 font-semibold rounded-lg transition disabled:opacity-50 ${
            loginMode === 'admin'
              ? 'bg-indigo-600 hover:bg-indigo-500'
              : 'bg-emerald-600 hover:bg-emerald-500'
          }`}
        >
          {loading
            ? 'Kontrol ediliyor...'
            : loginMode === 'admin'
            ? 'Yönetici Girişi Yap'
            : 'Giriş Yap'}
        </button>
      </form>

      <div className="mt-6 pt-4 border-t border-slate-800 text-center">
        {loginMode === 'admin' ? (
          <button
            type="button"
            onClick={() => {
              setLoginMode('staff');
              setError('');
            }}
            className="text-sm text-emerald-400 hover:text-emerald-300 font-medium underline underline-offset-4"
          >
            Kullanıcı girişi için tıkla
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setLoginMode('admin');
              setError('');
            }}
            className="text-sm text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-4"
          >
            Yönetici girişi için tıkla
          </button>
        )}
      </div>
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