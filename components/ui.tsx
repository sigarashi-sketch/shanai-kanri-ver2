// 画面で使い回す小さな部品（状態の札・見出し）。色は分類色（--a 系）と状態色だけ。
import type { Status } from '@/lib/sample';

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  稼働中: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)' },
  待機: { bg: 'var(--tone-warn-bg)', fg: 'var(--tone-warn-fg)' },
  予約: { bg: 'var(--tone-warn-bg)', fg: 'var(--tone-warn-fg)' },
  入場予定: { bg: 'var(--tone-info-bg)', fg: 'var(--tone-info-fg)' },
  '休職・産休': { bg: 'var(--tone-purple-bg)', fg: 'var(--tone-purple-fg)' },
  退社: { bg: 'var(--tone-mute-bg)', fg: 'var(--tone-mute-fg)' },
  終了: { bg: 'var(--tone-mute-bg)', fg: 'var(--tone-mute-fg)' },
  要対応: { bg: 'var(--tone-bad-bg)', fg: 'var(--tone-bad-fg)' },
};

export function Pill({ children }: { children: Status | string }) {
  const s = STATUS_STYLE[children as string] ?? STATUS_STYLE['終了'];
  return <span className="chip" style={{ background: s.bg, color: s.fg }}>{children}</span>;
}

export function PageTitle({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mo-fade-up flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-[22px] font-bold tracking-tight">{title}</h1>{sub && <div className="mt-0.5 text-[13px] text-muted">{sub}</div>}</div>
      {children && <div className="flex gap-2">{children}</div>}
    </div>
  );
}

/** 主ボタン。権限が足りないときは disabled＋title に「どの権限が要るか」を入れる。 */
export function PrimaryButton({ children, onClick, disabled, title }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} className="btn-primary min-h-10 rounded-[10px] px-4 text-[13.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40">{children}</button>
  );
}

export function GhostButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return <button onClick={onClick} className="min-h-10 rounded-[10px] border border-field bg-surface px-3.5 text-[13.5px] font-semibold">{children}</button>;
}

export const TONE: Record<string, string> = { ok: 'var(--color-ok)', warn: 'var(--color-warn)', bad: 'var(--color-bad)', mute: 'var(--color-faint)' };
