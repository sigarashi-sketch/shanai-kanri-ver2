// 画面で使い回す小さな部品（状態の札・見出し）。色は分類色（--a 系）と状態色だけ。
import { Info } from 'lucide-react';
import type { Status } from '@/lib/types/base';

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

// 10-27 shoya「こういう説明いらない 極力スッキリな情報量に」：sub は頭の短い一言（日付・時点・件数など数字の入ったもの）だけ出し、
//   残りの説明は ⓘ に指を置いたときだけ出す
function splitSub(sub: string): [string, string] {
  const i = sub.search(/[。・]/);
  const head = (i < 0 ? sub : sub.slice(0, i)).trim();
  return /\d/.test(head) && head.length <= 30 ? [head, sub.slice(head.length).replace(/^[。・\s]+/, '')] : ['', sub];
}
export function PageTitle({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  const [head, rest] = sub ? splitSub(sub) : ['', ''];
  return (
    <div className="mo-fade-up flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-1.5 text-xl font-bold tracking-tight">{title}{rest && <span title={rest} aria-label={rest} className="cursor-help text-faint"><Info size={15} /></span>}</h1>
        {head && <div className="mt-0.5 text-sm text-muted">{head}</div>}
      </div>
      {children && <div className="flex gap-2">{children}</div>}
    </div>
  );
}

// ---- ボタン（10-25 見た目の整理）。形は globals.css の .btn-primary / .btn-secondary / .btn-danger / .btn-sm ----
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'danger-solid'; size?: 'md' | 'sm' };
const BTN_CLS = { primary: 'btn-primary', secondary: 'btn-secondary', danger: 'btn-danger', 'danger-solid': 'btn-danger solid' } as const;
/** ボタンはこれ1つ。主＝primary（1画面に1つ）／それ以外＝secondary／取り消せない操作＝danger。表の行の中は size="sm" */
export function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...rest }: BtnProps) {
  return <button type={type} {...rest} className={`${BTN_CLS[variant]}${size === 'sm' ? ' btn-sm' : ''}${className ? ` ${className}` : ''}`} />;
}

/** 主ボタン。権限が足りないときは disabled＋title に「どの権限が要るか」を入れる。 */
export function PrimaryButton({ children, onClick, disabled, title }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) {
  return <Button variant="primary" onClick={onClick} disabled={disabled} title={title}>{children}</Button>;
}

export function GhostButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return <Button onClick={onClick}>{children}</Button>;
}

// ---- タブ（ページの区切り＝下線）と 絞り込み（丸い札）。形は globals.css の .tab / .fchip ----
type TabItem<K extends string> = { key: K; label: React.ReactNode; count?: number; extra?: React.ReactNode };
/** ページの中を切り替える下線のタブ */
export function Tabs<K extends string>({ tabs, value, onChange, className = '' }: { tabs: TabItem<K>[]; value: K; onChange: (k: K) => void; className?: string }) {
  return (
    <div role="tablist" className={`flex gap-1 overflow-x-auto border-b border-line ${className}`}>
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)} className="tab">
          {t.label}{t.count ? <span className="num ml-1.5 rounded-full bg-sunken px-1.5 text-xs">{t.count}</span> : null}{t.extra}
        </button>
      ))}
    </div>
  );
}
/** 一覧を絞り込む丸い札（数つき） */
export function FilterChips<K extends string>({ items, value, onChange, className = '' }: { items: TabItem<K>[]; value: K; onChange: (k: K) => void; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((t) => (
        <button key={t.key} type="button" aria-pressed={value === t.key} onClick={() => onChange(t.key)} className="fchip">
          {t.label}{t.count != null && <span className="num">{t.count}</span>}{t.extra}
        </button>
      ))}
    </div>
  );
}

// ---- 読み込み中（「読み込み中…」の字の代わりに、表の形をした灰色の帯） ----
/** 一覧の読み込み中。rows 行 × cols 列の帯を出す（読み上げには「読み込み中」と伝える） */
export function SkeletonRows({ rows = 6, cols = 5, className = '' }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div role="status" aria-label="読み込み中" className={`flex flex-col divide-y divide-line-soft ${className}`}>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 px-3.5 py-3">
          <span className="skel size-7 shrink-0 rounded-full" />
          {Array.from({ length: cols }, (_, c) => <span key={c} className="skel h-3" style={{ flex: c === 0 ? 2 : 1, opacity: 1 - c * 0.08 }} />)}
        </div>
      ))}
    </div>
  );
}

export const TONE: Record<string, string> = { ok: 'var(--color-ok)', warn: 'var(--color-warn)', bad: 'var(--color-bad)', mute: 'var(--color-faint)' };
