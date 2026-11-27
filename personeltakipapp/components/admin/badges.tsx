import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { initials, type ActionType } from '@/lib/attendance';

export function ActionBadge({ type }: { type: ActionType }) {
  const isIn = type === 'IN';
  const Icon = isIn ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${
        isIn
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      }`}
    >
      <Icon className="w-3 h-3" />
      {isIn ? 'Giriş' : 'Çıkış'}
    </span>
  );
}

export function PersonAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="w-8 h-8 shrink-0 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center"
    >
      {initials(name) || '?'}
    </span>
  );
}
