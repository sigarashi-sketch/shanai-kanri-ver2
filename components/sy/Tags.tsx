import { CalendarDays, Dumbbell, Tag, TrainFront, UsersRound } from 'lucide-react';
import type { Member } from '@/components/sy/compat';

// 名簿のタグ＝入社日・案件最寄り・コミュニティ・部活・手で付けたタグ（lib/tags.ts）。絵文字は使わず線アイコン
export function MemberTags({ m, max }: { m: Member; max?: number }) {
  const tags: { k: string; t: string; I: typeof CalendarDays }[] = [];
  if (m.nyusha) tags.push({ k: 'n', t: `${m.nyusha.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3')} 入社`, I: CalendarDays });
  if (m.siteEki) tags.push({ k: 's', t: m.siteEki, I: TrainFront });
  if (m.community) tags.push({ k: 'c', t: m.community, I: UsersRound });
  m.clubs.forEach((c) => tags.push({ k: 'b' + c, t: c, I: Dumbbell }));
  m.tags.forEach((c) => tags.push({ k: 't' + c, t: c, I: Tag }));
  const shown = max ? tags.slice(0, max) : tags;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map(({ k, t, I }) => (
        <span key={k} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-ig-hover px-1.5 py-0.5 text-[11px] text-ig-text">
          <I size={12} strokeWidth={2} className="text-ig-muted" />{t}
        </span>
      ))}
      {max && tags.length > max && <span className="text-[11px] text-ig-muted">+{tags.length - max}</span>}
    </div>
  );
}
