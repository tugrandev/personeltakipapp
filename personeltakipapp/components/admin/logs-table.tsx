import { MapPin } from 'lucide-react';
import { formatDate, formatTime, personName, type AttendanceLog } from '@/lib/attendance';
import { ActionBadge, PersonAvatar } from './badges';

export function LogsTable({ logs }: { logs: AttendanceLog[] }) {
  if (logs.length === 0) {
    return <EmptyState text="Seçilen filtrelere uygun hareket bulunamadı." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-slate-400 text-xs uppercase tracking-wide border-b border-slate-800">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Personel</th>
            <th scope="col" className="px-4 py-3 font-medium">İşlem</th>
            <th scope="col" className="px-4 py-3 font-medium">Lokasyon</th>
            <th scope="col" className="px-4 py-3 font-medium">Tarih</th>
            <th scope="col" className="px-4 py-3 font-medium">Saat</th>
            <th scope="col" className="px-4 py-3 font-medium text-right">Mesafe</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">
          {logs.map((log) => {
            const name = personName(log);
            return (
              <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <PersonAvatar name={name} />
                    <span className="font-medium text-slate-100">{name}</span>
                  </div>
                </td>
                <td className="px-4 py-3"><ActionBadge type={log.action_type} /></td>
                <td className="px-4 py-3 text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    {log.locations?.name || '-'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatDate(log.created_at)}</td>
                <td className="px-4 py-3 font-mono text-slate-200 tabular-nums">{formatTime(log.created_at)}</td>
                <td className="px-4 py-3 text-right text-slate-400 tabular-nums">
                  {log.distance_meters != null ? `${log.distance_meters} m` : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <p className="px-4 py-12 text-center text-sm text-slate-500">{text}</p>;
}
