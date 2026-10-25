'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// 連絡パネルの部品（長押しボタン・LINE風のプレビュー・送る口・進み具合）

/** 押し続けて発火。途中で離すと戻る（モーション図鑑 Hold To Confirm 900ms） */
export function HoldButton({ label, onDone, disabled, title }: { label: string; onDone: () => void; disabled?: boolean; title?: string }) {
  const [p, setP] = useState(0);
  const t = useRef<ReturnType<typeof setInterval> | null>(null);
  // 発火は時間で決める（描画が間引かれても 0.9 秒で確実に発火・離せば必ず止まる）
  const start = () => {
    if (disabled || t.current) return;
    const t0 = Date.now();
    t.current = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / 900);
      setP(k);
      if (k >= 1) { clearInterval(t.current!); t.current = null; setP(0); onDone(); }
    }, 16);
  };
  const stop = () => { if (t.current) clearInterval(t.current); t.current = null; setP(0); };
  useEffect(() => () => { if (t.current) clearInterval(t.current); }, []);
  return (
    <button type="button" disabled={disabled} title={title ?? '押し続けると送ります（0.9秒）'} onPointerDown={start} onPointerUp={stop} onPointerLeave={stop}
      className="relative min-h-10 shrink-0 select-none overflow-hidden rounded-[10px] px-4 text-[13.5px] font-bold disabled:cursor-not-allowed disabled:opacity-40" style={{ background: 'var(--a)', color: 'var(--ao)' }}>
      <span className="absolute inset-y-0 left-0 bg-black/20" style={{ width: `${p * 100}%` }} />
      <span className="relative">{label}</span>
    </button>
  );
}

/** 送る直前の見え方（今の配信画面の右のプレビューと同じ：本文は1つの吹き出し・回答ボタンはその下のカード） */
export function LinePreview({ text, name, choices, title }: { text: string; name?: string; choices?: { label: string; ng: boolean }[]; title?: string }) {
  const body = name ? text.replaceAll('{名前}', name) : text;
  return (
    <div className="rounded-xl border border-line-soft p-3" style={{ background: 'var(--color-sunken)' }}>
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-faint"><span>プレビュー{name ? `（${name} さんに届く形）` : ''}</span><span className="num">{text.length} 字</span></div>
      <div className="flex flex-col items-start gap-1.5">
        <div className="max-w-[92%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-md border border-line bg-surface px-3 py-2 text-[12.5px] leading-relaxed">
          {body.trim() ? body : <span className="text-faint">ここに本文のプレビューが出ます</span>}
        </div>
        {choices && choices.length >= 2 && (
          <div className="w-[70%] overflow-hidden rounded-2xl border border-line bg-surface text-[12px]">
            <div className="px-3 py-2"><div className="text-[10.5px] text-faint">ご回答のお願い</div><b>{title || '（件名）'}</b></div>
            {choices.map((c) => <div key={c.label} className="border-t border-line-soft px-3 py-1.5 text-center font-semibold" style={{ color: c.ng ? 'var(--color-muted)' : 'var(--ad)' }}>{c.label}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}

/** 一斉送信の進み具合（Progress Fill） */
export function SendProgress({ done, total, label }: { done: number; total: number; label?: string }) {
  return (
    <div className="flex flex-1 items-center gap-2 text-[12.5px]" role="progressbar" aria-valuenow={done} aria-valuemax={total}>
      <div className="h-2 flex-1 overflow-hidden rounded bg-sunken"><div className="h-2 transition-[width] duration-300" style={{ width: `${(done / Math.max(total, 1)) * 100}%`, background: 'var(--a)' }} /></div>
      <span className="num shrink-0">{label ?? `${done} / ${total}`}</span>
    </div>
  );
}

export type HaishinRes = Record<string, unknown> & { ok?: boolean; error?: string; sample?: boolean };
/** app/api/live/haishin を呼ぶ（op ごとに通す action は決まっている） */
export async function haishin<T extends HaishinRes = HaishinRes>(op: string, body: Record<string, unknown> = {}): Promise<T> {
  try {
    const r = await fetch('/api/live/haishin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, ...body }) });
    const j = (await r.json().catch(() => ({}))) as T;
    if (!r.ok && !j.error) return { ...j, ok: false, error: `うまくいきませんでした（${r.status}）` };
    return j;
  } catch (e) { return { ok: false, error: (e as Error).message } as T; }
}

/** haishin の読むだけの op を、見本／本物の状態つきで読む */
export function useHaishinRead<T>(op: string | null, body?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'live' | 'error'>('idle');
  const [error, setError] = useState('');
  const key = op ? op + JSON.stringify(body ?? {}) : '';
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!op) return;
    const my = ++seq.current;
    setState('loading');
    const j = await haishin<HaishinRes>(op, body);
    if (my !== seq.current) return;
    if (j.ok === false || j.error) { setError(String(j.error || '読めませんでした')); setState('error'); return; }
    setData(j as unknown as T); setError(''); setState('live');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { load(); }, [load]);
  return { data, state, error, reload: load };
}

/** /api/ike（GET だけ）を、引数が変わるたびに少し待ってから読む（案件文を打っている途中で何度も読まない） */
export function useIkeDebounced<T>(path: string | null, waitMs = 500) {
  const [data, setData] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current;
    if (!path) { setData(null); setBusy(false); return; }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/ike/${path}`, { cache: 'no-store' });
        const j = (await r.json().catch(() => null)) as T | null;
        if (my === seq.current) setData(r.ok ? j : ({ ok: false, error: (j as { error?: string } | null)?.error || `読めませんでした（${r.status}）` } as T));
      } catch (e) { if (my === seq.current) setData({ ok: false, error: (e as Error).message } as T); }
      finally { if (my === seq.current) setBusy(false); }
    }, waitMs);
    return () => clearTimeout(t);
  }, [path, waitMs]);
  return { data, busy };
}

export function Pills<K extends string>({ items, value, onChange, small }: { items: readonly (readonly [K, string, number?])[]; value: K; onChange: (k: K) => void; small?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(([k, l, n]) => (
        <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={value === k}
          className={`flex items-center gap-1 rounded-full border font-semibold ${small ? 'min-h-7 px-2.5 text-[12px]' : 'min-h-8 px-3 text-[12.5px]'}`}
          style={value === k ? { background: 'var(--as)', color: 'var(--ad)', borderColor: 'var(--al)' } : { borderColor: 'var(--color-field)', color: 'var(--color-muted)' }}>
          {l}{!!n && <span className="num rounded-full px-1.5 text-[10.5px] font-bold" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>{n}</span>}
        </button>
      ))}
    </div>
  );
}

export function Step({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <section className="rounded-xl border border-line px-3.5 py-3">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-bold">
        <span className="flex size-5 items-center justify-center rounded-full text-[11px]" style={done ? { background: 'var(--a)', color: 'var(--ao)' } : { background: 'var(--as)', color: 'var(--ad)' }}>{n}</span>{title}
      </div>
      {children}
    </section>
  );
}

export const Note = ({ tone = 'mute', children }: { tone?: 'mute' | 'warn' | 'bad' | 'ok' | 'info'; children: React.ReactNode }) => (
  <div className="whitespace-pre-line rounded-lg px-2.5 py-1.5 text-[12px]" style={{ background: `var(--tone-${tone}-bg)`, color: `var(--tone-${tone}-fg)` }}>{children}</div>
);
