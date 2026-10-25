'use client';

import { useEffect, useState } from 'react';
import { Card, HoryuFrame, inputCls, tdCls, thCls, useHoryu, fmtAt } from '@/components/horyu/kit';

// 操作ログ（保留・10-25）。今の /ops-log.html と同じ：だれが・いつ・何をしたか（今の op_audit_log）。見るだけ
//   見られるかは今のページ権限 ops-log（既定は管理者）。403 なら何も出さない
type Row = { id: number; at: string; actor: string; action: string; target: string; detail: Record<string, string>; ok: boolean; status: number | null; ms: number | null; source: string };
const jstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const S_ROWS: Row[] = [
  { id: 1, at: new Date(Date.now() - 600000).toISOString(), actor: 'nakamura@example.com', action: 'roster:saveEngineerRow', target: '見本 太郎', detail: { fields: 'eki' }, ok: true, status: 200, ms: 220, source: 'proxy' },
  { id: 2, at: new Date(Date.now() - 3600000).toISOString(), actor: 'tanaka@example.com', action: 'kashitsuke:pay', target: '—', detail: {}, ok: false, status: 400, ms: 80, source: 'kashitsuke' },
];

export default function OpsLogPage() {
  const [date, setDate] = useState(jstToday);
  const [actor, setActor] = useState('');
  const [act, setAct] = useState('');
  const [ng, setNg] = useState(false);
  const [deb, setDeb] = useState({ actor: '', act: '' });
  useEffect(() => { const t = setTimeout(() => setDeb({ actor: actor.trim(), act: act.trim() }), 400); return () => clearTimeout(t); }, [actor, act]);
  const r = useHoryu<{ rows: Row[]; truncated?: boolean; needsMigration?: boolean }>('ops-log', { date, actor: deb.actor, act: deb.act, ng: ng ? 1 : undefined });
  const rows = r.state === 'sample' ? S_ROWS.filter((x) => (!ng || !x.ok) && (!deb.actor || x.actor.includes(deb.actor)) && (!deb.act || x.action.includes(deb.act))) : r.data?.rows ?? [];

  return (
    <HoryuFrame title="操作ログ" sub="だれが・いつ・何を変えたか（新しい順・見るだけ）" state={r.state} error={r.error} onReload={r.reload}>
      <div className="mo-fade-up flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3">
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="日付" className={inputCls} />
        <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="だれが（メール）" aria-label="だれが" className={`${inputCls} w-[160px]`} />
        <input value={act} onChange={(e) => setAct(e.target.value)} placeholder="操作の名前" aria-label="操作" className={`${inputCls} w-[160px]`} />
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={ng} onChange={(e) => setNg(e.target.checked)} />失敗だけ</label>
        <span className="ml-auto text-sm text-faint">{rows.length}件{r.data?.truncated ? '（多いので途中まで）' : ''}</span>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-body">
            <thead><tr className="th-row"><th className={thCls}>いつ</th><th className={thCls}>だれが</th><th className={thCls}>操作</th><th className={thCls}>対象</th><th className={thCls}>結果</th><th className={thCls}>詳しく</th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className="border-t border-line-soft align-top">
                  <td className={`${tdCls} num whitespace-nowrap`}>{fmtAt(x.at)}</td>
                  <td className={tdCls}>{x.actor.split('@')[0] || '—'}</td>
                  <td className={tdCls}><code className="text-sm">{x.action}</code><div className="text-xs text-faint">{x.source}</div></td>
                  <td className={tdCls}>{x.target || '—'}</td>
                  <td className={tdCls}>{x.ok ? <span className="text-faint">OK</span> : <span style={{ color: 'var(--tone-bad-fg)' }}>失敗 {x.status ?? ''}</span>}</td>
                  <td className={`${tdCls} max-w-[280px] text-sm text-muted`}>{Object.entries(x.detail || {}).map(([k, v]) => `${k}: ${v}`).join('・') || '—'}</td>
                </tr>
              ))}
              {r.state !== 'loading' && !rows.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">{r.data?.needsMigration ? '今のシステムに操作ログの表がまだありません' : 'この日の記録はありません'}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </HoryuFrame>
  );
}
