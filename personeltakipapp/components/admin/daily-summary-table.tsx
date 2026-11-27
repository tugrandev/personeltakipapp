import { formatDate, formatDuration, formatTime, type DailySummary } from '@/lib/attendance';
import { PersonAvatar } from './badges';
import { EmptyState } from './logs-table';

export function DailySummaryTable({ summaries }: { summaries: DailySummary[] }) {
  if (summaries.length === 0) {
    return <EmptyState text="Seçilen tarih aralığında puantaj kaydı bulunamadı." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-slate-400 text-xs uppercase tracking-wide border-b border-slate-800">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Personel</th>
            <th scope="col" className="px-4 py-3 font-medium">Tarih</th>
            <th scope="col" className="px-4 py-3 font-medium">İlk Giriş</th>
            <th scope="col" className="px-4 py-3 font-medium">Son Çıkış</th>
            <th scope="col" className="px-4 py-3 font-medium">Toplam Süre</th>
            <th scope="col" className="px-4 py-3 font-medium">Durum</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">
          {summaries.map((s) => (
            <tr key={s.key} className="hover:bg-slate-800/40 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <PersonAvatar name={s.name} />
                  <div>
                    <p className="font-medium text-slate-100">{s.name}</p>
                    <p className="text-xs text-slate-500">{s.locations.join(', ') || '-'}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatDate(`${s.date}T12:00:00`)}</td>
              <td className="px-4 py-3 font-mono tabular-nums text-emerald-400">{s.firstIn ? formatTime(s.firstIn) : '-'}</td>
              <td className="px-4 py-3 font-mono tabular-nums text-amber-400">
                {s.lastOut && !s.isOpen ? formatTime(s.lastOut) : '-'}
              </td>
              <td className="px-4 py-3 font-semibold tabular-nums">{formatDuration(s.totalMinutes)}</td>
              <td className="px-4 py-3">
                {s.isOpen ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    İçeride
                  </span>
                ) : (
                  <span className="text-xs font-medium text-slate-400">Tamamlandı</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
