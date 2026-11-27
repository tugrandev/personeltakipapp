import { formatDuration, formatTime, personName, type AttendanceLog } from '@/lib/attendance';
import { PersonAvatar } from './badges';

function minutesSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

export function InsideNow({ logs }: { logs: AttendanceLog[] }) {
  return (
    <aside className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Şu An İçeride</h2>
        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
          {logs.length} kişi
        </span>
      </div>
      {logs.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">Şu anda içeride personel yok.</p>
      ) : (
        <ul className="divide-y divide-slate-800/70 max-h-96 overflow-y-auto">
          {logs.map((log) => {
            const name = personName(log);
            return (
              <li key={log.id} className="px-4 py-3 flex items-center gap-3">
                <PersonAvatar name={name} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {log.locations?.name} • {formatTime(log.created_at)}
                  </p>
                </div>
                <span className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
                  {formatDuration(minutesSince(log.created_at))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
