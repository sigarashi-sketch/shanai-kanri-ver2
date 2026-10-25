'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useIke } from '@/components/Live';
import { PersonName } from '@/components/Person';
import type { LiverList, LiverRow } from '@/lib/live/proper';

// ライバーリスト（本物・全体管理者だけ）。足す・状態・入社日・採用担当・メモを直す・手で足した行を消す（10-25）。
//   書くのは /api/live/livers（今の /api/livers の POST）。プロパーリストには入れない
const STATUSES = ['', '稼働中', '辞退', '終了'];
const inp = 'rounded-lg border border-field bg-surface px-2 py-1 text-[13px] text-ink';
const toDate = (v: string | null) => (v ? v.replace(/\//g, '-') : '');

async function post(body: Record<string, unknown>) {
  const r = await fetch('/api/live/livers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as { error?: string };
  return r.ok && !j.error ? '' : j.error || `保存できませんでした（${r.status}）`;
}

export function LiverLive() {
  const lv = useIke<LiverList>('livers');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', tantou: '', nyusha_bi: '', memo: '' });
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const [memo, setMemo] = useState<Record<string, string>>({});
  const run = async (body: Record<string, unknown>, done: string) => {
    const e = await post(body);
    setMsg(e ? { text: e, bad: true } : { text: done });
    if (!e) void lv.reload();
    return !e;
  };
  const upd = (l: LiverRow, patch: Record<string, unknown>, done: string) => run({ action: 'update', id: l.id, ...patch }, `${l.name}：${done}`);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12.5px] text-muted">プロパーには入れない別のリスト（全体管理者だけ）。#all-盛り上げ の承諾から自動で入ります。</p>
        <button onClick={() => setAdding(!adding)} className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-[10px] border border-field bg-surface px-3 text-[13px] font-semibold"><Plus size={14} />手で足す</button>
      </div>
      {msg.text && <div role="status" className="rounded-lg px-3 py-2 text-[12.5px]" style={{ background: msg.bad ? 'var(--tone-bad-bg)' : 'var(--tone-ok-bg)', color: msg.bad ? 'var(--tone-bad-fg)' : 'var(--tone-ok-fg)' }}>{msg.text}</div>}
      {adding && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          <label className="flex flex-col gap-1">氏名<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={`${inp} w-[150px]`} /></label>
          <label className="flex flex-col gap-1">採用担当<input value={f.tantou} onChange={(e) => setF({ ...f, tantou: e.target.value })} className={`${inp} w-[120px]`} /></label>
          <label className="flex flex-col gap-1">入社日<input type="date" value={f.nyusha_bi} onChange={(e) => setF({ ...f, nyusha_bi: e.target.value })} className={inp} /></label>
          <label className="flex flex-col gap-1">メモ<input value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} className={`${inp} w-[220px]`} /></label>
          <button disabled={!f.name.trim()} onClick={async () => { if (await run({ action: 'add', ...f }, `${f.name} を足しました`)) { setF({ name: '', tantou: '', nyusha_bi: '', memo: '' }); setAdding(false); } }}
            className="btn-primary min-h-9 rounded-[10px] px-4 text-[13px] font-semibold disabled:opacity-40">足す</button>
        </div>
      )}
      {lv.state === 'error' && <div className="rounded-xl px-4 py-2.5 text-[12.5px]" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>{lv.error}</div>}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[820px] border-collapse text-[13px]">
          <thead><tr className="th-row text-left">
            <th className="px-4 py-2.5 font-semibold">名前</th><th className="px-2 py-2.5 font-semibold">承諾日</th><th className="px-2 py-2.5 font-semibold">入社日</th><th className="px-2 py-2.5 font-semibold">採用担当</th><th className="px-2 py-2.5 font-semibold">状態</th><th className="px-2 py-2.5 font-semibold">メモ</th><th className="px-4 py-2.5" />
          </tr></thead>
          <tbody>
            {lv.state === 'loading' && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">読み込み中…</td></tr>}
            {(lv.data?.rows ?? []).map((l, i) => (
              <tr key={l.id} className="row mo-fade-in border-t border-line-soft align-top" style={{ ['--i' as string]: Math.min(i, 20) }}>
                <td className="px-4 py-2.5"><PersonName name={l.name} />{lv.data?.inProper.includes(l.id) && <span className="ml-1.5 text-[11px] font-normal text-warn">プロパーにも居る</span>}</td>
                <td className="px-2 py-2.5">{l.shoudaku_bi || '—'}</td>
                <td className="px-2 py-2"><input type="date" defaultValue={toDate(l.nyusha_bi)} onBlur={(e) => { if (e.target.value !== toDate(l.nyusha_bi)) void upd(l, { nyusha_bi: e.target.value }, '入社日を直しました'); }} aria-label={`${l.name} の入社日`} className={inp} /></td>
                <td className="px-2 py-2"><input defaultValue={l.tantou ?? ''} onBlur={(e) => { if (e.target.value.trim() !== (l.tantou ?? '')) void upd(l, { tantou: e.target.value.trim() }, '採用担当を直しました'); }} aria-label={`${l.name} の採用担当`} className={`${inp} w-[100px]`} /></td>
                <td className="px-2 py-2">
                  <select value={l.status ?? ''} onChange={(e) => void upd(l, { status: e.target.value }, `状態を「${e.target.value || 'なし'}」にしました`)} aria-label={`${l.name} の状態`} className={inp}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s || '—'}</option>)}
                  </select>
                </td>
                <td className="px-2 py-2"><textarea rows={1} value={memo[l.id] ?? l.memo ?? ''} onChange={(e) => setMemo({ ...memo, [l.id]: e.target.value })} onBlur={() => { const v = memo[l.id]; if (v !== undefined && v !== (l.memo ?? '')) void upd(l, { memo: v }, 'メモを直しました'); }} aria-label={`${l.name} のメモ`} className={`${inp} w-[220px] resize-y`} /></td>
                <td className="px-4 py-2">{l.source === 'manual' && <button onClick={() => { if (window.confirm(`${l.name} をライバーリストから消します`)) void run({ action: 'delete', id: l.id }, `${l.name} を消しました`); }} className="min-h-8 rounded-lg border border-field px-2 text-[12px]">消す</button>}</td>
              </tr>
            ))}
            {lv.state === 'live' && !(lv.data?.rows ?? []).length && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">まだいません</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] text-faint">Slack から入った行は消せません（外したいときは状態を「辞退」「終了」に）。入力すると自動で保存します。</p>
    </div>
  );
}
