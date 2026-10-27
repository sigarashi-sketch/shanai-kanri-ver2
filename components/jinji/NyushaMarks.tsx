'use client';

import { useState } from 'react';
import { PersonName } from '@/components/Person';
import { needText, usePerms } from '@/components/Perms';
import { nyushaQuery } from '@/lib/live/nyusha';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { useLiveWrite, WriteError } from './useLiveWrite';

// 入社手続きの印（今の入社手続きの画面 nyusha-admin.html と同じ・10-25）。人ごとに 雇用契約サイン〜雇用保険証 を「済み／対象外／まだ」から選ぶ。
//   ・選んだらすぐ保存（取り消すで戻る）。メモは欄を離れたら保存
//   ・印は人が付ける（freee・クラウドサインからは取らない）。参画決定から60日以内の人＋付けかけの人
//   ・q＝上の検索の言葉（氏名・メモで絞る）
//   ・読めないとき（ログインしていない）は出さない
type Check = { v: 'done' | 'na'; at?: string; by?: string };
type Row = { id: string; name: string; decided_at?: string; checks: Record<string, Check>; memo: string; progress?: { done: number; need: number; complete: boolean } };
type Item = { key: string; label: string; opt?: boolean };
type Res = { ok: boolean; rows: Row[]; items: Item[] };
const URL = '/api/live/nyusha/progress';
const ITEMS: Item[] = [
  { key: 'sign', label: '雇用契約サイン' }, { key: 'freee', label: 'freee 入社手続き' }, { key: 'rirekisho', label: '履歴書' },
  { key: 'kenshin', label: '健康診断' }, { key: 'gensen', label: '源泉徴収票', opt: true }, { key: 'koyou', label: '雇用保険証', opt: true },
];
const LABEL = { done: '済み', na: '対象外', '': 'まだ' } as const;
const progressOf = (c: Record<string, Check>, items: Item[]) => {
  let done = 0, need = 0;
  for (const it of items) { const v = c[it.key]?.v; if (v === 'na' || (it.opt && !v)) continue; need++; if (v === 'done') done++; }
  return { done, need };
};

export function NyushaMarks({ q = '' }: { q?: string }) {
  const canEdit = usePerms().can('jinji', 'edit');
  const lv = useLiveRoute<Res>(URL);
  const live = lv.live && !!lv.data;
  const [local, setLocal] = useState<Record<string, Partial<Row>>>({});
  const { send, error, setError } = useLiveWrite(live, () => { setLocal({}); lv.reload(); });
  if (lv.state === 'loading' || lv.state === 'sample') return null;
  if (lv.state === 'error') return <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">入社手続きの印：{lv.error}</div>;
  const items = live && lv.data!.items.length ? lv.data!.items : ITEMS;
  const hit = nyushaQuery(q);
  const all = (live ? lv.data!.rows : []).map((r) => ({ ...r, ...(local[r.id] || {}) }));
  const rows = all.filter((r) => hit(r.name, r.memo));

  const set = (r: Row, key: string, value: '' | 'done' | 'na') => {
    const prev = r.checks[key]?.v || '';
    const next = { ...r.checks }; if (value) next[key] = { v: value }; else delete next[key];
    const label = items.find((i) => i.key === key)?.label;
    send({
      url: URL, body: { action: 'set', roster_id: r.id, key, value }, text: `${r.name} さんの「${label}」を${LABEL[value]}にしました`, sub: '→ 入社手続きの進み具合',
      apply: () => setLocal((l) => ({ ...l, [r.id]: { ...(l[r.id] || {}), checks: next } })), revert: () => setLocal((l) => ({ ...l, [r.id]: { ...(l[r.id] || {}), checks: r.checks } })),
      undo: () => ({ url: URL, body: { action: 'set', roster_id: r.id, key, value: prev } }),
    });
  };
  const memo = (r: Row, v: string) => {
    if (v === r.memo) return;
    send({
      url: URL, body: { action: 'memo', roster_id: r.id, memo: v }, text: `${r.name} さんの入社手続きのメモを保存しました`,
      apply: () => setLocal((l) => ({ ...l, [r.id]: { ...(l[r.id] || {}), memo: v } })), revert: () => setLocal((l) => ({ ...l, [r.id]: { ...(l[r.id] || {}), memo: r.memo } })),
      undo: () => ({ url: URL, body: { action: 'memo', roster_id: r.id, memo: r.memo } }),
    });
  };

  return (
    <section className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface">
      <div className="px-4 py-3">
        <h2 className="text-md font-bold">入社手続きの印</h2>
        <div className="text-sm text-faint">参画決定から60日以内の人と、付けかけの人。選んだらすぐ保存されます（源泉徴収票・雇用保険証は要る人だけ）</div>
      </div>
      <div className="px-4"><WriteError error={error} onClose={() => setError('')} /></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-body">
          <thead><tr className="th-row text-left">
            <th className="px-4 py-2.5 font-semibold">氏名</th><th className="px-2 py-2.5 font-semibold">参画決定</th>
            {items.map((i) => <th key={i.key} className="whitespace-nowrap px-2 py-2.5 font-semibold">{i.label}{i.opt && <span className="font-normal text-faint">（要る人）</span>}</th>)}
            <th className="px-2 py-2.5 font-semibold">進み</th><th className="px-4 py-2.5 font-semibold">メモ</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={items.length + 4} className="px-4 py-8 text-center text-muted">{all.length && q.trim() ? `「${q.trim()}」に当たる人はいません` : '対象の人はいません'}</td></tr>}
            {rows.map((r) => {
              const pg = progressOf(r.checks, items);
              return (
                <tr key={r.id} className="row border-t border-line-soft">
                  <td className="whitespace-nowrap px-4 py-2"><PersonName name={r.name} className="font-semibold underline-offset-2 hover:underline" /></td>
                  <td className="num whitespace-nowrap px-2 py-2 text-muted">{(r.decided_at || '').slice(0, 10).replaceAll('-', '/') || '—'}</td>
                  {items.map((i) => {
                    const v = r.checks[i.key]?.v || '';
                    return (
                      <td key={i.key} className="px-2 py-2">
                        <select aria-label={`${r.name} の${i.label}`} value={v} disabled={!canEdit} title={canEdit ? r.checks[i.key]?.by : needText('edit')} onChange={(e) => set(r, i.key, e.target.value as '' | 'done' | 'na')}
                          className="min-h-8 rounded-lg border border-field px-1.5 text-sm disabled:opacity-50"
                          style={v === 'done' ? { background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' } : v === 'na' ? { background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' } : { background: 'var(--color-surface)' }}>
                          <option value="">まだ</option><option value="done">済み</option><option value="na">対象外</option>
                        </select>
                      </td>
                    );
                  })}
                  <td className="num whitespace-nowrap px-2 py-2 font-semibold" style={{ color: pg.need && pg.done >= pg.need ? 'var(--color-ok)' : undefined }}>{pg.done}/{pg.need}</td>
                  <td className="px-4 py-2"><input key={r.memo} defaultValue={r.memo} disabled={!canEdit} onBlur={(e) => memo(r, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} placeholder="メモ" className="min-h-8 w-full min-w-[160px] rounded-lg border border-field bg-surface px-2 text-sm disabled:opacity-50" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
