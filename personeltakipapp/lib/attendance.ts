export type ActionType = 'IN' | 'OUT';

export interface AttendanceLog {
  id: string;
  user_id: string;
  location_id: string;
  action_type: ActionType;
  created_at: string;
  distance_meters: number | null;
  profiles?: { full_name: string | null } | null;
  locations?: { name: string } | null;
}

export interface DailySummary {
  key: string;
  userId: string;
  name: string;
  date: string;
  firstIn: string | null;
  lastOut: string | null;
  totalMinutes: number;
  isOpen: boolean;
  locations: string[];
}

export const SCAN_COOLDOWN_MINUTES = 5;

export function personName(log: AttendanceLog) {
  return log.profiles?.full_name || 'Bilinmeyen Personel';
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('tr-TR'))
    .join('');
}

export function toDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDuration(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m} dk`;
  return `${h} sa ${m} dk`;
}

export function buildDailySummaries(logs: AttendanceLog[]): DailySummary[] {
  const ascending = [...logs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const groups = new Map<string, { summary: DailySummary; openSince: number | null }>();

  for (const log of ascending) {
    const date = toDateInputValue(new Date(log.created_at));
    const key = `${log.user_id}_${date}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        summary: {
          key,
          userId: log.user_id,
          name: personName(log),
          date,
          firstIn: null,
          lastOut: null,
          totalMinutes: 0,
          isOpen: false,
          locations: [],
        },
        openSince: null,
      };
      groups.set(key, group);
    }

    const { summary } = group;
    const locationName = log.locations?.name;
    if (locationName && !summary.locations.includes(locationName)) {
      summary.locations.push(locationName);
    }

    const time = new Date(log.created_at).getTime();
    if (log.action_type === 'IN') {
      if (!summary.firstIn) summary.firstIn = log.created_at;
      if (group.openSince === null) group.openSince = time;
    } else {
      summary.lastOut = log.created_at;
      if (group.openSince !== null) {
        summary.totalMinutes += (time - group.openSince) / 60000;
        group.openSince = null;
      }
    }
  }

  const now = Date.now();
  const today = toDateInputValue(new Date());
  return [...groups.values()]
    .map(({ summary, openSince }) => {
      if (openSince !== null) {
        summary.isOpen = true;
        if (summary.date === today) summary.totalMinutes += (now - openSince) / 60000;
      }
      return summary;
    })
    .sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name, 'tr') : b.date.localeCompare(a.date)));
}

export function getCurrentlyInside(logs: AttendanceLog[]) {
  const latestByUser = new Map<string, AttendanceLog>();
  for (const log of logs) {
    const existing = latestByUser.get(log.user_id);
    if (!existing || new Date(log.created_at) > new Date(existing.created_at)) {
      latestByUser.set(log.user_id, log);
    }
  }
  return [...latestByUser.values()]
    .filter((log) => log.action_type === 'IN')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const content = [headers, ...rows].map((row) => row.map(escape).join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
