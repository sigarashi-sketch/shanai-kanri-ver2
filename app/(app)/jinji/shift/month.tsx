'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

// 月を選ぶ（シフト表・提出状況・当月の実績・10-28 shoya「過去分も選べるように」）。
//   選べるのは 今の社内システムが集めている月（choices＝20日を過ぎたら翌月まで）から12か月前まで。今のシステムの list・detail はどの月でも読める
export const addMonth = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
export const monthsUpTo = (last: string, back = 12) => Array.from({ length: back + 1 }, (_, i) => addMonth(last, -i));
const label = (ym: string) => `${Number(ym.slice(0, 4))}年${Number(ym.slice(5, 7))}月`;

export function MonthPicker({ value, options, onChange, mark, markLabel = '集めている月' }: { value: string; options: string[]; onChange: (m: string) => void; mark?: string; markLabel?: string }) {
  const i = options.indexOf(value);
  return (
    <div className="inline-flex items-center gap-1">
      <button aria-label="前の月" onClick={() => i < options.length - 1 && onChange(options[i + 1])} disabled={i < 0 || i >= options.length - 1} className="btn-secondary btn-sm px-1.5 disabled:opacity-40"><ChevronLeft size={15} /></button>
      <select aria-label="月" value={value} onChange={(e) => onChange(e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-sm font-semibold">
        {options.map((m) => <option key={m} value={m}>{label(m)}{m === mark ? `（${markLabel}）` : ''}</option>)}
      </select>
      <button aria-label="次の月" onClick={() => i > 0 && onChange(options[i - 1])} disabled={i <= 0} className="btn-secondary btn-sm px-1.5 disabled:opacity-40"><ChevronRight size={15} /></button>
    </div>
  );
}
