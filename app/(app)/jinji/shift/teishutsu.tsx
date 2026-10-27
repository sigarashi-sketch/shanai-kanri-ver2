'use client';

import { useState } from 'react';
import { PersonName } from '@/components/Person';
import { FilterChips } from '@/components/ui';
import type { IkeShiftList, IkeTodayTargets } from '@/lib/live/shift';

// 提出状況（シフト表のタブ・10-27 shoya「勤務区分 平日以外のひと全員の名前があって そこに提出状況いれるタブ」）。
//   勤務区分が「平日」でない人を全員（未設定もふくむ）並べて、集めている月のシフトを 提出済み／下書き／未提出 で出す。
//   ・勤務区分は今のシステムの名簿（当日の出勤状況の対象＝kintai-today?stale=1）から。提出はシフト表と同じ shift-calendar?action=list
//   ・今のシステムで提出が要るのは シフト・夜勤 だけ（それ以外は「要」の印なし・お願いは送れる）
const nn = (s: string) => s.replace(/[\s　]+/g, '');
const REQUIRED = ['シフト', '夜勤'];
type St = '提出済み' | '下書き' | '未提出';
const TONE: Record<St, string> = { 提出済み: 'ok', 下書き: 'caution', 未提出: 'bad' };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }) : '');

export function TeishutsuTab({ targets, list, monthLabel, askedOf, ask, canEdit, block, loading }: {
  targets: IkeTodayTargets | null; list: IkeShiftList | null; monthLabel: string; loading: boolean;
  askedOf: (name: string) => boolean; ask: (names: string[]) => void; canEdit: boolean; block?: string;
}) {
  const byName = new Map((list?.rows || []).map((r) => [nn(r.name), r]));
  const seen = new Set<string>();
  const people = (targets?.rows || []).filter((r) => (r.kubun || '') !== '平日' && !seen.has(nn(r.name)) && seen.add(nn(r.name))).map((r) => {
    const s = byName.get(nn(r.name));
    const st: St = !s ? '未提出' : s.submittedAt ? '提出済み' : '下書き';
    return { ...r, kubun: r.kubun || '未設定', s, st };
  });
  const kubuns = ['すべて', ...Array.from(new Set(people.map((p) => p.kubun)))];
  const [k, setK] = useState('すべて');
  const [st, setSt] = useState<'すべて' | St>('すべて');
  const shown = people.filter((p) => (k === 'すべて' || p.kubun === k) && (st === 'すべて' || p.st === st))
    .sort((a, b) => ['未提出', '下書き', '提出済み'].indexOf(a.st) - ['未提出', '下書き', '提出済み'].indexOf(b.st) || a.name.localeCompare(b.name, 'ja'));
  const cnt = (x: St) => people.filter((p) => (k === 'すべて' || p.kubun === k) && p.st === x).length;
  const waiting = shown.filter((p) => p.st !== '提出済み' && !askedOf(p.name));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <b className="text-body text-ink">{monthLabel}のシフトの提出状況</b><span>勤務区分が「平日」でない人 {people.length}人</span>
        <button onClick={() => waiting.length && ask(waiting.map((p) => p.name))} disabled={!canEdit || waiting.length === 0} title={block} className="btn-primary btn-sm ml-auto">表示中の未提出・下書き {waiting.length}人にお願い</button>
      </div>
      <FilterChips items={kubuns.map((x) => ({ key: x, label: x === 'すべて' ? '勤務区分：すべて' : x, count: x === 'すべて' ? undefined : people.filter((p) => p.kubun === x).length }))} value={k} onChange={setK} />
      <FilterChips items={(['すべて', '未提出', '下書き', '提出済み'] as const).map((x) => ({ key: x, label: x, count: x === 'すべて' ? undefined : cnt(x) }))} value={st} onChange={setSt} />
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-body">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">勤務区分</th><th className="px-2 py-2.5 font-semibold">提出状況</th>
              <th className="px-2 py-2.5 font-semibold">入れた日</th><th className="px-2 py-2.5 font-semibold">提出・最後に直した日</th><th className="px-4 py-2.5 font-semibold">お願い</th>
            </tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">{loading ? '読み込み中…' : '当てはまる人はいません'}</td></tr>}
              {shown.map((p) => (
                <tr key={p.name} className="row border-t border-line-soft">
                  <td className="px-4 py-2"><PersonName name={p.name} className="font-semibold" /><div className="text-xs text-faint">{[p.shozoku, p.rep && `担当 ${p.rep}`].filter(Boolean).join('・')}</div></td>
                  <td className="px-2 py-2">{p.kubun}{REQUIRED.includes(p.kubun) && <span className="ml-1.5 text-xs text-faint">（提出が要る）</span>}</td>
                  <td className="px-2 py-2"><span className="chip" style={{ background: `var(--tone-${TONE[p.st]}-bg)`, color: `var(--tone-${TONE[p.st]}-fg)` }}>{p.st}</span></td>
                  <td className="num px-2 py-2 text-muted">{p.s ? `出勤 ${p.s.work}日・休み ${p.s.off}日${p.s.blank ? `・空欄 ${p.s.blank}日` : ''}` : '—'}</td>
                  <td className="num px-2 py-2 text-muted">{p.s?.submittedAt ? `提出 ${fmt(p.s.submittedAt)}` : p.s?.updatedAt ? `直した ${fmt(p.s.updatedAt)}` : '—'}</td>
                  <td className="px-4 py-2">{p.st === '提出済み' ? null : askedOf(p.name) ? <span className="text-sm text-ok">お願い済み</span>
                    : <button onClick={() => ask([p.name])} disabled={!canEdit} title={block} className="text-sm font-semibold disabled:opacity-40" style={{ color: 'var(--ad)' }}>お願いする</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
