'use client';

import { useMemo, useState } from 'react';
import { Card, HoryuFrame, inputCls, tdCls, thCls, useHoryu, fmtAt } from '@/components/horyu/kit';

// 設定センター（保留・10-25）。今の /settings.html のうち「変更履歴」を見るだけ。
//   ・見えるのは自分のロールで見てよい区分だけ（今のシステムが絞る）
//   ・設定を変える・承認する・LINE の部品や配信は今の画面から（ver2 から LINE には送らない）
//   ・値そのもの（前→後）は出さず、どの設定を・だれが・いつ変えたかだけ
type Row = { id: number; at: string; actor: string; section: string; sectionLabel: string; label: string; action: string; actionLabel: string; state: string; changes: Array<{ label?: string; key?: string } | string> | null };
const STATE_LABEL: Record<string, string> = { ok: '反映ずみ', undone: '元に戻した', pending: '承認待ち', closed: '決まった', withdrawn: '取り下げ', revert: '元に戻す操作' };
const S_ROWS: Row[] = [
  { id: 1, at: new Date(Date.now() - 3600000).toISOString(), actor: 'kanri@example.com', section: 'kintai', sectionLabel: '勤怠', label: '未打刻アラートの時刻', action: 'save', actionLabel: '保存', state: 'ok', changes: ['送る時刻'] },
  { id: 2, at: new Date(Date.now() - 86400000).toISOString(), actor: 'eigyo@example.com', section: 'line', sectionLabel: 'LINE', label: 'あいさつの文', action: 'request', actionLabel: '承認の依頼', state: 'pending', changes: null },
];

export default function SettingsCenterPage() {
  const r = useHoryu<{ rows: Row[] }>('settings-history');
  const rows = r.state === 'sample' ? S_ROWS : r.data?.rows ?? [];
  const [sec, setSec] = useState('');
  const sections = useMemo(() => [...new Map(rows.map((x) => [x.section, x.sectionLabel])).entries()], [rows]);
  const shown = rows.filter((x) => !sec || x.section === sec);
  const changeText = (c: Row['changes']) => (c ?? []).map((x) => (typeof x === 'string' ? x : x.label || x.key || '')).filter(Boolean).join('・');

  return (
    <HoryuFrame title="設定センター" sub="社内システムの設定の変更履歴（見るだけ・変えるのは今の画面から）" state={r.state} error={r.error} onReload={r.reload}>
      <div className="mo-fade-up flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3">
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted">区分<select value={sec} onChange={(e) => setSec(e.target.value)} className={inputCls}><option value="">すべて</option>{sections.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <span className="ml-auto text-[12px] text-faint">{shown.length}件</span>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead><tr className="th-row"><th className={thCls}>いつ</th><th className={thCls}>だれが</th><th className={thCls}>区分</th><th className={thCls}>設定</th><th className={thCls}>操作</th><th className={thCls}>状態</th></tr></thead>
            <tbody>
              {shown.map((x) => (
                <tr key={x.id} className="border-t border-line-soft align-top">
                  <td className={`${tdCls} num whitespace-nowrap`}>{fmtAt(x.at)}</td>
                  <td className={tdCls}>{x.actor.split('@')[0] || '—'}</td>
                  <td className={tdCls}>{x.sectionLabel}</td>
                  <td className={tdCls}><b>{x.label}</b>{changeText(x.changes) && <div className="text-[11.5px] text-faint">{changeText(x.changes)}</div>}</td>
                  <td className={tdCls}>{x.actionLabel}</td>
                  <td className={tdCls}>{STATE_LABEL[x.state] ?? x.state}</td>
                </tr>
              ))}
              {r.state !== 'loading' && !shown.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">ありません</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </HoryuFrame>
  );
}
