import { stageDot } from '@/lib/sy/stages';
import { PageTitle, Tabs as V2Tabs } from '@/components/ui';

// 人財管理（それゆけ未経験から移した画面）の共通部品。それゆけ components/ui.tsx の写しを ver2 の見た目にしたもの（10-27）
type TagDef = { label: string; tone: 'warn' | 'danger' | 'muted' | 'plain' | 'stop' };

// 共通部品（DESIGN.md の定義どおり）
export function StageBadge({ stage }: { stage: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-ig-hover px-2 py-0.5 text-[11px] font-medium text-ig-text">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: stageDot(stage) }} />{stage}
    </span>
  );
}

// タグのバッジ（lib/tags.ts の TAGS）。色は tone で決める
const TAG_TONE: Record<TagDef['tone'], string> = { warn: 'bg-ig-warn text-white', danger: 'bg-ig-danger text-white', muted: 'bg-ig-divider text-ig-text', plain: 'bg-ig-primary/10 text-ig-primary', stop: 'bg-ig-stop text-white' };
export function TagBadge({ tag }: { tag: TagDef }) {
  return <span className={`whitespace-nowrap rounded px-1 text-[10px] font-semibold ${TAG_TONE[tag.tone]}`}>{tag.label}</span>;
}

const AV = ['#f58529', '#dd2a7b', '#8134af', '#515bd4', '#0095f6', '#2e9e4f', '#e07a00', '#d62976'];
// 名前から決まる色（アバターの地・フィードのイラストの服）
export function avatarColor(name: string): string {
  const n = (name || '?').replace(/[\s　]+/g, '');
  let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AV[h % AV.length];
}
// 丸いアバター。ring=true で Instagram のストーリー枠（新着・未読のとき）
export function Avatar({ name, src, size = 'md', ring }: { name: string; src?: string; size?: 'sm' | 'md' | 'lg'; ring?: boolean }) {
  const n = (name || '?').replace(/[\s　]+/g, '');
  const px = size === 'lg' ? 'h-20 w-20 text-2xl' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-11 w-11 text-sm';
  const inner = src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" className={`${px} rounded-full object-cover`} />
    : <div className={`${px} grid place-items-center rounded-full font-semibold text-white`} style={{ background: avatarColor(n) }}>{Array.from(n)[0]}</div>;
  if (!ring) return <div className="shrink-0">{inner}</div>;
  return <div className="shrink-0 rounded-full p-[2px] ig-gradient"><div className="rounded-full bg-white p-[2px]">{inner}</div></div>;
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return <div className="px-6 pt-[22px]"><PageTitle title={title} sub={sub}>{children}</PageTitle></div>;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return <div className="px-6"><V2Tabs tabs={items.map(([key, label]) => ({ key, label }))} value={value} onChange={onChange} /></div>;
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={on} className="fchip">{children}</button>;
}

export const btnPrimary = 'btn-primary';
export const btnGray = 'btn-secondary';
export const inputCls = 'min-h-9 rounded-[10px] border border-field bg-surface px-2.5 text-body outline-none focus:border-[var(--a)]';

// ★SSRとブラウザで時刻がずれると表示が食い違うので、使う側の要素に suppressHydrationWarning を付ける
export function ago(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'たった今';
  if (d < 3600) return `${Math.floor(d / 60)}分前`;
  if (d < 86400) return `${Math.floor(d / 3600)}時間前`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}日前`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400 / 7)}週間前`;
  return new Date(iso).toLocaleDateString('ja-JP');
}
// いまから h 時間以内か
export function withinHours(iso: string, h: number): boolean {
  return Date.now() - new Date(iso).getTime() <= h * 3600e3;
}
