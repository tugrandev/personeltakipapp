'use client';

import { useState, useEffect, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { setSessionUser } from '@/lib/session';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff, ShieldCheck, Lock, User, ArrowRight } from 'lucide-react';

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const savedRemember = localStorage.getItem('pt_remember_me');
    const savedUsername = localStorage.getItem('pt_last_username');

    if (savedRemember === 'false') {
      setRememberMe(false);
    } else if (savedUsername) {
      setRememberMe(true);
      setUsername(savedUsername);
    }
  }, []);

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
    if (loading) return;

    setLoading(true);
    setError('');

    try {
      const cleanUsername = username.trim();

      const { data: users, error: rpcError } = await supabase.rpc('verify_user_login', {
        p_username: cleanUsername,
        p_password: password,
      });

      const profile = users && users.length > 0 ? users[0] : null;

      if (rpcError || !profile) {
        setError('Kullanıcı adı veya parola hatalı.');
        setLoading(false);
        return;
      }

      // Personel hesapları için cihaz kilidi kontrolü
      const currentDeviceId = getOrCreateDeviceId();
      if (profile.role !== 'admin') {
        if (!profile.device_id) {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ device_id: currentDeviceId })
            .eq('id', profile.id);

          if (updateError) {
            setError('Cihaz kaydı yapılırken hata oluştu. Lütfen tekrar deneyin.');
            setLoading(false);
            return;
          }
          profile.device_id = currentDeviceId;
        } else if (profile.device_id !== currentDeviceId) {
          setError('Bu hesap başka bir telefona tanımlı! Yöneticinizle iletişime geçin.');
          setLoading(false);
          return;
        }
      }

      // Beni Hatırla tercihini kaydet
      localStorage.setItem('pt_remember_me', rememberMe ? 'true' : 'false');
      if (rememberMe) {
        localStorage.setItem('pt_last_username', cleanUsername);
      } else {
        localStorage.removeItem('pt_last_username');
      }

      setSessionUser(
        {
          id: profile.id,
          full_name: profile.full_name,
          username: profile.username,
          role: profile.role,
          device_id: profile.device_id,
        },
        rememberMe
      );

      if (profile.role === 'admin') {
        window.location.href = '/admin';
      } else if (redirectParam) {
        window.location.href = redirectParam;
      } else {
        window.location.href = '/';
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      {/* Üst Marka ve Logo Alanı */}
      <div className="flex flex-col items-center mb-6">
        <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-lg shadow-emerald-950/60 border border-slate-800 mb-4 bg-slate-900 flex items-center justify-center">
          <img
            src="/icon-192.png"
            alt="Personel Takip Logo"
            className="w-full h-full object-cover"
          />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Personel Takip</h1>
        <p className="text-slate-400 text-xs mt-1">QR & Konum Doğrulamalı Puantaj Sistemi</p>
      </div>

      {/* Giriş Kartı */}
      <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-2xl p-6 shadow-2xl">
        {error && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-300 text-xs p-3.5 rounded-xl mb-5 leading-relaxed">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Kullanıcı Adı
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="kullanici.adi"
                className="w-full pl-10 pr-3.5 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Parola
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-11 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Beni Hatırla Onay Kutusu */}
          <div className="flex items-center justify-between pt-0.5">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-slate-900 accent-emerald-600"
              />
              <span className="text-xs text-slate-300">Beni hatırla</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 mt-1 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-semibold text-sm rounded-xl shadow-lg shadow-emerald-950/50 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Kontrol ediliyor...
              </>
            ) : (
              <>
                Giriş Yap <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Alt Güvenlik ve Yasal Uyum Rozeti */}
      <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/80" />
        <span>Biyometrik veri tutulmaz • 89/2007 KVKK Uyumlu</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-4">
      <Suspense fallback={<div className="text-slate-400 text-sm">Yükleniyor...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}