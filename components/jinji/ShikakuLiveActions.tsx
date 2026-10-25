'use client';

import { Trash2 } from 'lucide-react';
import { needText, usePerms } from '@/components/Perms';
import type { IkeShikakuRow } from '@/lib/live/shikaku';
import { useLiveWrite, WriteError } from './useLiveWrite';

// 資格手当の申請1件を、今の社内システムの段階（未確認／承認／却下）で動かす（今の管理画面 shikaku-admin.html と同じ・10-25）。
//   ・段階はプルダウンで選ぶ＝すぐ保存（取り消すで元の段階に戻す）。確定手当額は欄を離れたら保存（空＝マスタの額）
//   ・消すのは誤送信・テスト行だけ。添付の証明書・領収書も消えて戻せないので、必ず確かめる
const URL = '/api/live/shikaku';

export function ShikakuLiveActions({ row, onDone }: { row: IkeShikakuRow; onDone: () => void }) {
  const can = usePerms().can;
  const canEdit = can('jinji', 'edit'), canApprove = can('jinji', 'approve');
  const { send, error, setError, busy } = useLiveWrite(true, onDone);
  const label = `${row.name || '（氏名なし）'}／${row.cert || '（資格なし）'}`;
  const setStatus = (status: string) => {
    if (status === row.status) return;
    send({
      url: URL, body: { action: 'updateStatus', id: row.id, status }, text: `${label} を「${status}」にしました`,
      sub: status === '承認' ? '→ 毎月の手当に載りました' : status === '却下' ? '→ 一覧から外れました' : '→ 確認待ちに戻しました',
      undo: () => ({ url: URL, body: { action: 'updateStatus', id: row.id, status: row.status } }),
    });
  };
  const setAmount = (v: string) => {
    const cur = row.allowance_amount == null ? '' : String(row.allowance_amount);
    if (v === cur) return;
    if (v !== '' && !/^\d+$/.test(v)) { setError('確定手当額は数字で入れてください'); return; }
    send({
      url: URL, body: { action: 'updateStatus', id: row.id, status: row.status, allowance_amount: v === '' ? null : Number(v) }, text: `${label} の確定手当額を${v === '' ? '空（マスタの額）に' : ` ${Number(v).toLocaleString()}円に`}しました`,
      undo: () => ({ url: URL, body: { action: 'updateStatus', id: row.id, status: row.status, allowance_amount: row.allowance_amount } }),
    });
  };
  const del = () => {
    if (!window.confirm(`この申請を消します。\n\n${label}\n\n添付の証明書・領収書も一緒に消え、元に戻せません。よろしいですか？`)) return;
    send({ url: URL, body: { action: 'delete', id: row.id }, text: `${label} の申請を消しました`, sub: '→ 添付も消えました（取り消せません）' });
  };
  // 承認・却下は「承認」の権限、確認待ちに戻す・額は「直す」の権限（ver2 の権限の表）。最後の判定は今のシステム
  const statusOff = !canEdit && !canApprove;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <select aria-label={`${label} の段階`} value={row.status} disabled={statusOff || busy} title={statusOff ? needText('edit') : undefined} onChange={(e) => setStatus(e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-1.5 text-sm disabled:opacity-50">
          <option value="未確認">未確認（確認待ち）</option>
          <option value="承認" disabled={!canApprove}>承認</option>
          <option value="却下" disabled={!canApprove}>却下</option>
        </select>
        <input key={String(row.allowance_amount)} defaultValue={row.allowance_amount ?? ''} inputMode="numeric" disabled={!canEdit || busy} placeholder={row.master_amount != null ? `マスタ ${row.master_amount.toLocaleString()}円` : '確定手当額'} aria-label={`${label} の確定手当額`}
          onBlur={(e) => setAmount(e.target.value.trim())} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="min-h-8 w-[120px] rounded-lg border border-field bg-surface px-2 text-sm disabled:opacity-50" />
        <button onClick={del} disabled={!canEdit || busy} title={canEdit ? '誤送信・テスト行を消す（添付も消えます）' : needText('edit')} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-sm text-muted hover:text-bad disabled:opacity-40"><Trash2 size={13} />消す</button>
      </div>
      <WriteError error={error} onClose={() => setError('')} />
    </div>
  );
}
