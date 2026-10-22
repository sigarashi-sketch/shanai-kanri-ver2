// 画面で使い回す小さな部品（状態の札・見出し）。色は分類色（--a 系）と状態色だけ。
import type { Status } from '@/lib/sample';

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  稼働中: { bg: '#E9F7EE', fg: '#116B34' },
  待機: { bg: '#FFF4E0', fg: '#8A4B00' },
  予約: { bg: '#FFF4E0', fg: '#8A4B00' },
  入場予定: { bg: '#EAF2FE', fg: '#134A9C' },
  '休職・産休': { bg: '#F3EEFE', fg: '#5B21B6' },
  退社: { bg: '#F0F1F5', fg: '#5A5E75' },
  終了: { bg: '#F0F1F5', fg: '#5A5E75' },
  要対応: { bg: '#FFE4E9', fg: '#BE123C' },
};

export function Pill({ children }: { children: Status | string }) {
  const s = STATUS_STYLE[children as string] ?? STATUS_STYLE['終了'];
  return <span className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={{ background: s.bg, color: s.fg }}>{children}</span>;
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
    <button onClick={onClick} disabled={disabled} title={title} className="min-h-10 rounded-[10px] px-4 text-[13.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40" style={{ background: 'var(--a)', color: 'var(--ao)' }}>{children}</button>
  );
}

export function GhostButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return <button onClick={onClick} className="min-h-10 rounded-[10px] border border-[#DCDDE6] bg-white px-3.5 text-[13.5px] font-semibold">{children}</button>;
}

export const TONE: Record<string, string> = { ok: '#116B34', warn: '#B45309', bad: '#BE123C', mute: '#8B8FA3' };
