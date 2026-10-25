'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog } from './Dialog';
import { Z_MODAL } from '@/lib/layers';

// 本物のデータに書く前の確認の窓（10-25 労務・経理の移し替え）。
//   ・何が・何件・だれに届くか（LINE・メール）を lines で並べてから押させる
//   ・押したら run を待つ。失敗はこの窓の中に出して閉じない（もう一度押せる）
//   ・danger（締め・差し戻し・消す など）は押すボタンを赤にする
export type ConfirmSpec = {
  title: string;
  lines: string[];
  okLabel: string;
  danger?: boolean;
  /** 送る先がある操作（LINE・メール）の一言。目立たせて出す */
  sends?: string;
  /** 選ぶだけの追加の入力（理由など）。窓の中に出す */
  extra?: React.ReactNode;
  /** extra が揃っていないときなど、押せない理由 */
  blocked?: string;
  /** 何人ずつ書くときの途中経過（run の途中で spec を差し替えて出す） */
  progress?: string;
  run: () => Promise<unknown>;
};

export function ConfirmWrite({ spec, onClose }: { spec: ConfirmSpec; onClose: (done: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    if (busy || spec.blocked) return;
    setBusy(true); setErr('');
    try { await spec.run(); onClose(true); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <Dialog label={spec.title} onClose={() => !busy && onClose(false)} z={Z_MODAL}
      className="fixed left-1/2 top-1/2 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-5 shadow-xl">
      <div className="text-[15px] font-bold">{spec.title}</div>
      <ul className="mt-2 flex flex-col gap-1 text-[13px]">{spec.lines.map((l) => <li key={l}>{l}</li>)}</ul>
      {spec.sends && (
        <div className="mt-2.5 flex items-start gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />{spec.sends}
        </div>
      )}
      {spec.extra && <div className="mt-3">{spec.extra}</div>}
      <div className="mt-2 text-[11.5px] text-faint">本物のデータ（今の社内システム）に書きます。</div>
      {busy && spec.progress && <div className="num mt-2 text-[12.5px] font-semibold" style={{ color: 'var(--ad)' }}>{spec.progress}</div>}
      {err && <div className="mt-2 rounded-lg px-3 py-2 text-[12.5px]" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>{err}</div>}
      <div className="mt-4 flex justify-end gap-2">
        <button data-dialog-close onClick={() => onClose(false)} disabled={busy} className="min-h-9 rounded-[10px] border border-field px-3.5 text-[13px] font-semibold disabled:opacity-40">やめる</button>
        <button onClick={go} disabled={busy || !!spec.blocked} title={spec.blocked}
          className={`min-h-9 rounded-[10px] px-4 text-[13px] font-bold disabled:opacity-40 ${spec.danger ? 'text-white' : 'btn-primary'}`}
          style={spec.danger ? { background: 'var(--color-bad)' } : undefined}>{busy ? '書いています…' : spec.okLabel}</button>
      </div>
    </Dialog>
  );
}
