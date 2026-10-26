'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiveRoute } from '@/lib/live/use-live-route';
import type { HoryuView } from '@/lib/horyu';

// 保留（あとで決める）の画面で使い回す部品。
//   ・useHoryu(view) … /api/live/horyu?view=… を読む。読めたときだけ d に入る（読み込み中・読めない・ログインなしは null＝見本は出さない）
//   ・Panel / Kpi / Bars / Spark … 見た目は今の ver2（components/ui・globals.css）に合わせた小さな箱と横棒
//   ・HoldButton … 取り消せない操作は長押し（0.9秒）
//   ・postHoryu … /api/live/horyu/write に kind を渡して書く（行き先はサーバ側で決め打ち）
export function useHoryu<T>(view: HoryuView, params = '') {
  const r = useLiveRoute<T>(`/api/live/horyu?view=${view}${params}`);
  return { ...r, d: (r.live && r.data ? r.data : null) as T | null };
}

/** 読み込み中の一言（LiveBanner は読み込み中に何も出さないので、その下に置く） */
export function HoryuLoading({ state }: { state: string }) {
  return state === 'loading' ? <div className="py-10 text-center text-body text-muted">読み込み中…</div> : null;
}

export async function postHoryu(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  try {
    const r = await fetch('/api/live/horyu/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return { ...j, ok: r.ok && j.ok !== false };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export function Panel({ title, sub, children, i = 1, right }: { title: string; sub?: string; children: React.ReactNode; i?: number; right?: React.ReactNode }) {
  return (
    <section className="mo-fade-up min-w-0 rounded-xl border border-line bg-surface" style={{ ['--i' as string]: i }}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5">
        <h2 className="text-body font-bold">{title}</h2>{sub && <span className="text-sm text-faint">{sub}</span>}
        {right && <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>}
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-sm text-muted">{label}</div>
      <div className="num mt-0.5 text-xl font-bold" style={tone ? { color: `var(--color-${tone})` } : undefined}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-faint">{sub}</div>}
    </div>
  );
}

/** 横棒（多い順に上から）。fmt で値の見せ方を変える */
export function Bars({ items, fmt, max: maxN = 12, empty = 'データがありません' }: { items: { key: string; count: number }[]; fmt?: (v: number) => string; max?: number; empty?: string }) {
  if (!items.length) return <div className="py-3 text-center text-sm text-faint">{empty}</div>;
  const top = items.slice(0, maxN);
  const mx = Math.max(1, ...top.map((x) => x.count));
  return (
    <div className="flex flex-col gap-1.5">
      {top.map((x, i) => (
        <div key={x.key + i} className="grid grid-cols-[minmax(70px,140px)_1fr_auto] items-center gap-2 text-sm">
          <span className="truncate" title={x.key}>{x.key}</span>
          <span className="h-3 overflow-hidden rounded-r bg-soft"><i className="mo-bar block h-full rounded-r" style={{ width: `${Math.max(2, (x.count / mx) * 100)}%`, background: 'var(--a)', ['--i' as string]: i }} /></span>
          <span className="num font-semibold">{fmt ? fmt(x.count) : x.count}</span>
        </div>
      ))}
      {items.length > maxN && <div className="text-xs text-faint">ほか {items.length - maxN}件</div>}
    </div>
  );
}

/** 縦棒の推移（日・週・月）。ラベルは最初と最後だけ */
export function Spark({ items, height = 90 }: { items: { date: string; count: number }[]; height?: number }) {
  if (!items.length) return <div className="py-3 text-center text-sm text-faint">データがありません</div>;
  const mx = Math.max(1, ...items.map((x) => x.count));
  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height }}>
        {items.map((x, i) => <span key={i} title={`${x.date}：${x.count}`} className="flex-1 rounded-t" style={{ height: `${Math.max(2, (x.count / mx) * 100)}%`, background: x.count ? 'var(--a)' : 'var(--color-line)' }} />)}
      </div>
      <div className="mt-1 flex justify-between text-xs text-faint"><span>{items[0].date}</span><span>{items[items.length - 1].date}</span></div>
    </div>
  );
}

/** 押しっぱなし（0.9秒）で実行。取り消せない操作に使う */
export function HoldButton({ label, onDone, disabled, title, small }: { label: string; onDone: () => void; disabled?: boolean; title?: string; small?: boolean }) {
  const [p, setP] = useState(0);
  const t = useRef<number | null>(null);
  const start = () => {
    if (disabled) return;
    const t0 = performance.now();
    const tick = () => {
      const v = Math.min(1, (performance.now() - t0) / 900);
      setP(v);
      if (v >= 1) { t.current = null; setP(0); onDone(); return; }
      t.current = requestAnimationFrame(tick);
    };
    t.current = requestAnimationFrame(tick);
  };
  const stop = () => { if (t.current) cancelAnimationFrame(t.current); t.current = null; setP(0); };
  useEffect(() => stop, []);
  return (
    <button type="button" disabled={disabled} title={title ?? '押したままにすると実行します'} onPointerDown={start} onPointerUp={stop} onPointerLeave={stop}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) start(); }} onKeyUp={stop}
      className={`relative overflow-hidden rounded-lg border border-field bg-surface font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${small ? 'min-h-8 px-2.5 text-sm' : 'min-h-10 px-3.5 text-body'}`}>
      <i className="absolute inset-y-0 left-0" style={{ width: `${p * 100}%`, background: 'var(--as, var(--soft))' }} />
      <span className="relative">{label}（長押し）</span>
    </button>
  );
}

export const Seg = <K extends string>({ value, options, onChange }: { value: K; options: readonly (readonly [K, string])[]; onChange: (k: K) => void }) => (
  <div className="flex rounded-[10px] border border-field bg-surface p-0.5 text-sm font-semibold">
    {options.map(([k, l]) => <button key={k} onClick={() => onChange(k)} className={`min-h-8 rounded-lg px-3 ${value === k ? 'text-white' : 'text-muted'}`} style={value === k ? { background: 'var(--a)', color: 'var(--ao)' } : undefined}>{l}</button>)}
  </div>
);

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
export const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
export const pct = (v: number | null | undefined) => (v == null ? '—' : `${v}%`);

/** 保留の画面の上に出す一言 */
export function HoryuNote({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-field bg-soft px-4 py-2 text-sm text-muted">保留（あとで決める）の画面です。今の社内システムの同じ画面を写しています。{children}</div>;
}
