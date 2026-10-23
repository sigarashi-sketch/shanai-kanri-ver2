'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Plus } from 'lucide-react';
import { CANDIDATES, COMPANIES, MONTH_STARTS, TENSEKI, T_STATES, T_TO, type Company, type Tenseki, type TState } from '@/lib/tenseki-sample';
import { daysFrom, fmtDate } from '@/lib/yoyaku-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';

// 転籍台帳（人事管理）＝グループ会社のあいだで籍を移す人の台帳。
//   ・転籍日・元の会社・先の会社・手続きの状態は、ぜんぶ選ぶだけ
//   ・状態は 打診中 → 本人の同意 → 退職・入社の書類 → 社会保険の切り替え → 完了（取りやめも選べる）
//   ・「完了」で名簿の今の所属会社が転籍日から切り替わる（今のシステムの転籍の印は「今の会社」と比べて付く）
//   ?tab=done で 終わったもの から開ける
type Tab = 'open' | 'done';
const FLOW = T_STATES.filter((s) => s !== '取りやめ');
const isClosed = (s: TState) => s === '完了' || s === '取りやめ';

export default function TensekiPage() {
  const canEdit = usePerms().can('jinji', 'edit');
  const { hit, toast } = useMotivation();
  const [rows, setRows] = useState<Tenseki[]>(TENSEKI);
  const [tab, setTab] = useState<Tab>('open');
  const [flash, setFlash] = useState<string | null>(null);
  const [add, setAdd] = useState({ personId: CANDIDATES[0].id, on: MONTH_STARTS[1], to: 'グループA社' as Company });

  useEffect(() => { if (new URLSearchParams(window.location.search).get('tab') === 'done') setTab('done'); }, []);

  const open = rows.filter((r) => !isClosed(r.state));
  const shown = rows.filter((r) => (tab === 'open' ? !isClosed(r.state) : isClosed(r.state))).sort((a, b) => a.on.localeCompare(b.on));
  const pulse = (id: string) => { setFlash(id); setTimeout(() => setFlash(null), 1300); };

  const change = (r: Tenseki, patch: Partial<Tenseki>, text: string, sub: string) => {
    const before = rows;
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
    pulse(r.id); hit();
    toast({ text, sub, undo: () => setRows(before) });
  };
  const setState = (r: Tenseki, s: TState) => change(r, { state: s }, `${r.name} の転籍を「${s}」にしました`, T_TO[s]);
  const setOn = (r: Tenseki, on: string) => change(r, { on }, `${r.name} の転籍日を ${fmtDate(on)} にしました`, '→ 名簿の切り替えの予約と、労務の手続きの期限を合わせました');
  const setTo = (r: Tenseki, to: Company) => change(r, { to }, `${r.name} の転籍先を ${to} にしました`, '→ 契約書の下書きの会社名を差し替えました');

  const cand = CANDIDATES.find((c) => c.id === add.personId)!;
  const toOptions = COMPANIES.filter((c) => c !== cand.company);
  const addRow = () => {
    const to = toOptions.includes(add.to) ? add.to : toOptions[0];
    const row: Tenseki = { id: `t${Date.now()}`, personId: cand.id, name: cand.name, on: add.on, from: cand.company, to, state: '打診中', by: 'あなた' };
    const before = rows;
    setRows((rs) => [...rs, row]); setTab('open');
    pulse(row.id); hit();
    toast({ text: `${cand.name} を転籍台帳に足しました（${cand.company} → ${to}）`, sub: '→ 社員ページに「転籍の予定」を出しました', undo: () => setRows(before) });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="転籍台帳" sub="グループ会社のあいだで籍を移す人。転籍日・元と先の会社・手続きの状態を選んで進めます・見本データ" />

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={open.length} total={rows.length} />
        <div className="text-[13px]"><b>手続き中 {open.length}人</b>
          <div className="text-[12px] text-muted">「完了」にすると、名簿の今の所属会社が転籍日から切り替わります。{!canEdit && <span className="text-bad"> {needText('edit')}</span>}</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5 rounded-lg border border-line-soft bg-soft px-2 py-1.5 text-[12.5px]">
          <span className="text-muted">台帳に足す</span>
          <select aria-label="社員" value={add.personId} disabled={!canEdit} onChange={(e) => setAdd((a) => ({ ...a, personId: e.target.value }))} className="min-h-8 rounded-lg border border-field bg-surface px-2 disabled:opacity-50">
            {CANDIDATES.map((c) => <option key={c.id} value={c.id}>{c.name}（{c.company}）</option>)}
          </select>
          <select aria-label="転籍日" value={add.on} disabled={!canEdit} onChange={(e) => setAdd((a) => ({ ...a, on: e.target.value }))} className="min-h-8 rounded-lg border border-field bg-surface px-2 disabled:opacity-50">
            {MONTH_STARTS.map((d) => <option key={d} value={d}>{fmtDate(d)}</option>)}
          </select>
          <select aria-label="転籍先" value={toOptions.includes(add.to) ? add.to : toOptions[0]} disabled={!canEdit} onChange={(e) => setAdd((a) => ({ ...a, to: e.target.value as Company }))} className="min-h-8 rounded-lg border border-field bg-surface px-2 disabled:opacity-50">
            {toOptions.map((c) => <option key={c} value={c}>{c} へ</option>)}
          </select>
          <button onClick={addRow} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} className="btn-primary inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 font-bold disabled:opacity-40"><Plus size={14} />足す</button>
        </div>
      </div>

      <div role="tablist" className="mo-fade-up flex gap-1 border-b border-line" style={{ ['--i' as string]: 2 }}>
        {([['open', `手続き中 ${open.length}`], ['done', `終わったもの ${rows.length - open.length}`]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="px-3.5 py-2.5 text-[14px]"
            style={tab === k ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: 'var(--color-muted)' }}>{l}</button>
        ))}
      </div>

      {tab === 'open' && open.length === 0 ? (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-10 text-center">
          <Check className="mx-auto text-ok" size={26} />
          <div className="mt-2 text-[15px] font-bold">手続き中の転籍はありません</div>
          <div className="mt-1 text-[12.5px] text-muted">転籍日を迎えると、名簿の所属会社が自動で切り替わります。</div>
        </div>
      ) : (
        <div key={tab} className="mo-axis overflow-hidden rounded-xl border border-line bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-[13px]">
              <thead><tr className="th-row text-left">
                <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">転籍日</th><th className="px-2 py-2.5 font-semibold">元 → 先</th><th className="px-2 py-2.5 font-semibold">手続きの進み具合</th><th className="px-4 py-2.5 font-semibold">状態</th>
              </tr></thead>
              <tbody>
                {shown.map((r, i) => {
                  const d = daysFrom(r.on);
                  const at = FLOW.indexOf(r.state as (typeof FLOW)[number]);
                  const lock = !canEdit || isClosed(r.state);
                  return (
                    <tr key={r.id} className={`mo-fade-in border-t border-line-soft align-top ${flash === r.id ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                      <td className="px-4 py-2.5"><Link href={`/jinji/staff/${r.personId}`} className="font-semibold hover:underline">{r.name}</Link><div className="text-[11.5px] text-faint">担当 {r.by}</div></td>
                      <td className="px-2 py-2.5">
                        <select aria-label={`${r.name} の転籍日`} value={r.on} disabled={lock} title={!canEdit ? needText('edit') : undefined} onChange={(e) => setOn(r, e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-[12.5px] disabled:opacity-60">
                          {Array.from(new Set([r.on, ...MONTH_STARTS])).map((x) => <option key={x} value={x}>{fmtDate(x)}</option>)}
                        </select>
                        {!isClosed(r.state) && <div className="num mt-1 text-[11.5px]" style={{ color: d <= 14 ? 'var(--color-bad)' : 'var(--color-faint)' }}>あと{d}日</div>}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span>{r.from}</span><ArrowRight size={14} className="text-faint" />
                          <select aria-label={`${r.name} の転籍先`} value={r.to} disabled={lock} title={!canEdit ? needText('edit') : undefined} onChange={(e) => setTo(r, e.target.value as Company)} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-[12.5px] font-semibold disabled:opacity-60">
                            {COMPANIES.filter((c) => c !== r.from).map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        {r.state === '取りやめ' ? <span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>取りやめ</span> : (
                          <ol className="flex flex-wrap items-center gap-1">
                            {FLOW.map((s, k) => (
                              <li key={s} className="chip" style={k < at || r.state === '完了' ? { background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' } : k === at ? { background: 'var(--al)', color: 'var(--ad)' } : { background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)', fontWeight: 500 }}>{k < at || r.state === '完了' ? '✓ ' : ''}{s}</li>
                            ))}
                          </ol>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <select aria-label={`${r.name} の状態`} value={r.state} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} onChange={(e) => setState(r, e.target.value as TState)} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-[12.5px] disabled:opacity-50">
                          {T_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
                {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-[12.5px] text-muted">まだありません。</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[11.5px] text-faint">転籍には本人の同意が要ります。退職・入社の扱い、社会保険・雇用保険・有給の引き継ぎは、最終判断は社労士・法務に確認してください。</p>
    </main>
  );
}
