'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// 遊び心（モーション図鑑の MOTIVATION）。shoya「絶対になくさないで」。
//   ・今日の処理 n件（先週平均との差）… 上のバーに常駐。処理するたび +1
//   ・波及先トースト … 「保存しました」ではなく「→ どこに反映されたか」＋取り消す
//   ・残り件数リング → ゼロで静かな完了カード（紙吹雪なし）
//   ・弾み（mo-celebrate）は 参画決定・承認・提出完了 だけ
//   比べるのは先週の自分とだけ。ランキング・ポイントはやらない。
type Toast = { id: number; text: string; sub?: string; undo?: () => void };
type Ctx = { today: number; weekAvg: number; hit: (n?: number) => void; toast: (t: Omit<Toast, 'id'>) => void };
const MotivationCtx = createContext<Ctx | null>(null);

export function MotivationProvider({ children }: { children: React.ReactNode }) {
  // 今日の処理はこの端末に日付ごとに覚える（ページを開き直しても戻らない）。見本は12件から。
  const dayKey = `v2_today_${new Date().toISOString().slice(0, 10)}`;
  const [today, setToday] = useState(12);
  useEffect(() => { try { const v = Number(localStorage.getItem(dayKey)); if (v) setToday(v); } catch { /* noop */ } }, [dayKey]);
  const weekAvg = 9;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const hit = useCallback((n = 1) => setToday((v) => { const nv = v + n; try { localStorage.setItem(dayKey, String(nv)); } catch { /* noop */ } return nv; }), [dayKey]);
  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current;
    setToasts((xs) => [...xs, { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <MotivationCtx.Provider value={{ today, weekAvg, hit, toast }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="mo-fade-up pointer-events-auto flex min-w-[340px] items-center gap-3 rounded-xl bg-sumi px-4 py-3 text-[13.5px] text-white shadow-[0_10px_28px_rgba(25,27,46,.28)]">
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#16A34A" /><path className="mo-check" d="M7.5 12.5 10.5 15.5 16.5 9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="flex-1">{t.text}{t.sub && <span className="block text-[12px] text-[#C9CBE0]">{t.sub}</span>}</span>
            {t.undo && <button onClick={() => { t.undo!(); setToasts((xs) => xs.filter((x) => x.id !== t.id)); }} className="font-bold text-[#A5F3C4]">取り消す</button>}
          </div>
        ))}
      </div>
    </MotivationCtx.Provider>
  );
}

export function useMotivation(): Ctx {
  const c = useContext(MotivationCtx);
  if (!c) throw new Error('MotivationProvider の外です');
  return c;
}

/** 上のバーの「今日の処理」。増えた瞬間だけ数字が弾む。 */
export function TodayPill() {
  const { today, weekAvg } = useMotivation();
  const [bump, setBump] = useState(0);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } setBump((b) => b + 1); }, [today]);
  const ratio = Math.min(1, today / Math.max(weekAvg * 1.5, 1));
  const diff = today - weekAvg;
  return (
    <div className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-[12.5px]" title="比べるのは先週のあなたの平均だけ">
      <svg aria-hidden width="28" height="28" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="14" fill="none" stroke="#ECEDF3" strokeWidth="5" />
        <circle cx="18" cy="18" r="14" fill="none" stroke="#16A34A" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${88 * ratio} 88`} transform="rotate(-90 18 18)" style={{ transition: 'stroke-dasharray 600ms cubic-bezier(.22,1,.36,1)' }} />
      </svg>
      <span>今日の処理 <b key={bump} className={`num text-[14px] ${bump ? 'mo-spring-in inline-block' : ''}`}>{today}</b>件 <span className={diff >= 0 ? 'text-[#16A34A]' : 'text-muted'}>先週平均 {diff >= 0 ? '+' : ''}{diff}</span></span>
    </div>
  );
}

/** 残り件数のリング。0 になったら静かな完了カードに変わる。 */
export function RemainRing({ remain, total }: { remain: number; total: number }) {
  const done = total - remain;
  const r = total ? done / total : 1;
  return (
    <svg aria-label={`残り${remain}件`} width="44" height="44" viewBox="0 0 44 44" role="img">
      <circle cx="22" cy="22" r="18" fill="none" stroke="#ECEDF3" strokeWidth="5" />
      <circle cx="22" cy="22" r="18" fill="none" stroke="var(--a)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${113 * r} 113`} transform="rotate(-90 22 22)" style={{ transition: 'stroke-dasharray 600ms cubic-bezier(.22,1,.36,1)' }} />
      <text x="22" y="26" textAnchor="middle" fontSize="12" fontWeight="700" fill="#171717">{remain}</text>
    </svg>
  );
}

/** 数字を 600ms で回して着地させる（Count Up）。 */
export function CountUp({ to, className }: { to: number; className?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    // 動きを減らす設定の人には、数え上げずに最後の数字を出す
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(to); return; }
    let raf = 0; const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 600);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <span className={`num ${className || ''}`}>{v.toLocaleString('ja-JP')}</span>;
}
