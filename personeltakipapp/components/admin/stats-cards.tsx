import { LogIn, LogOut, Users, Clock } from 'lucide-react';

interface StatsCardsProps {
  inCount: number;
  outCount: number;
  insideCount: number;
  averageMinutesLabel: string;
}

export function StatsCards({ inCount, outCount, insideCount, averageMinutesLabel }: StatsCardsProps) {
  const items = [
    { label: 'Şu An İçeride', value: insideCount, icon: Users, tone: 'text-emerald-400 bg-emerald-500/10' },
    { label: 'Toplam Giriş', value: inCount, icon: LogIn, tone: 'text-sky-400 bg-sky-500/10' },
    { label: 'Toplam Çıkış', value: outCount, icon: LogOut, tone: 'text-amber-400 bg-amber-500/10' },
    { label: 'Ort. Çalışma Süresi', value: averageMinutesLabel, icon: Clock, tone: 'text-slate-300 bg-slate-500/10' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map(({ label, value, icon: Icon, tone }) => (
        <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
          </div>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tone}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      ))}
    </div>
  );
}
