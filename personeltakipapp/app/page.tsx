'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, Loader2, Lock, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';

async function getRole(userId: string) {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
  return data?.role as string | undefined;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!active) return;
      if (!user) return setChecking(false);
      const role = await getRole(user.id);
      router.replace(role === 'admin' ? '/admin' : '/personel');
    });
    return () => {
      active = false;
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError || !data.user) {
      setError('E-posta veya şifre hatalı.');
      setLoading(false);
      return;
    }

    const role = await getRole(data.user.id);
    if (role !== 'admin') {
      await supabase.auth.signOut();
      setError('Bu alan yalnızca yöneticiler içindir.');
      setLoading(false);
      return;
    }

    router.replace('/admin');
  };

  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" aria-label="Yükleniyor" />
      </main>
    );
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-2 bg-slate-950 text-white">
      <section className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-emerald-950 via-slate-950 to-slate-950 border-r border-slate-800">
        <div className="flex items-center gap-2 text-emerald-400 font-semibold">
          <ShieldCheck className="w-6 h-6" />
          Personel Takip
        </div>
        <div className="max-w-md">
          <h2 className="text-4xl font-bold leading-tight text-balance">
            Ekibinizin giriş-çıkış hareketlerini tek ekrandan yönetin.
          </h2>
          <p className="mt-4 text-slate-400 leading-relaxed">
            QR ve konum doğrulamalı kayıtlar, günlük puantaj özetleri ve anlık içerideki personel listesi.
          </p>
        </div>
        <p className="text-xs text-slate-500">© {new Date().getFullYear()} Personel Takip Sistemi</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Yönetici Girişi</h1>
              <p className="text-sm text-slate-400">Yönetim paneline erişmek için giriş yapın</p>
            </div>
          </div>

          {error && (
            <div role="alert" className="bg-red-500/10 border border-red-500/40 text-red-300 text-sm p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="block text-sm text-slate-300 mb-1.5">E-posta</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="yonetici@sirket.com"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="block text-sm text-slate-300 mb-1.5">Şifre</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full py-3 bg-emerald-600 hover:bg-emerald-500 font-semibold rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Doğrulanıyor...' : 'Giriş Yap'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">
            Personel misiniz?{' '}
            <Link href="/login?redirect=/personel" className="text-emerald-400 hover:underline">
              Personel girişi
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
