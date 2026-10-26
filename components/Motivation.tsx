'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// 遊び心（モーション図鑑の MOTIVATION）。shoya「絶対になくさないで」。
//   ・今日の処理 n件（先週平均との差）… 上のバーに常駐。処理するたび +1
//   ・波及先トースト … 「保存しました」ではなく「→ どこに反映されたか」＋取り消す
//   ・残り件数リング → ゼロで静かな完了カード（紙吹雪なし）
//   ・弾み（mo-celebrate）は 参画決定・承認・提出完了 だけ
//   比べるのは先週の自分とだけ。ランキング・ポイントはやらない。
type Toast = { id: number; text: string; sub?: string; undo?: () => void };
type Ctx = { today: number | null; weekAvg: number | null; hit: (n?: number) => void; toast: (t: Omit<Toast, 'id'>) => void };
const MotivationCtx = createContext<Ctx | null>(null);

export function MotivationProvider({ children }: { children: React.ReactNode }) {
  // 今日の処理と先週の1日平均は、今の社内システムの my-activity?action=today（本人の操作の記録 op_audit_log を数えたもの・10-26 見本の 12件／9件 をやめた）。
  //   この画面で処理した分は、次に読み直すまでここで +1 して見せる（読み直すと今のシステムの数に戻る＝二重に数えない）
  const [today, setToday] = useState<number | null>(null);
  const [weekAvg, setWeekAvg] = useState<number | null>(null);
  useEffect(() => {
    let on = true;
    void fetch('/api/ike/my-activity?action=today', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; today?: unknown; weekAvg?: unknown } | null) => {
        if (!on || !j || j.ok === false) return;
        if (Number.isFinite(Number(j.today))) setToday(Number(j.today));
        if (j.weekAvg != null && Number.isFinite(Number(j.weekAvg))) setWeekAvg(Number(j.weekAvg));
      })
      .catch(() => { /* 読めなければ出さない */ });
    return () => { on = false; };
  }, []);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const hit = useCallback((n = 1) => setToday((v) => (v == null ? v : v + n)), []);
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
          <div key={t.id} className="mo-fade-up pointer-events-auto flex min-w-[340px] items-center gap-3 rounded-xl bg-sumi px-4 py-3 text-body text-white shadow-[0_10px_28px_rgba(25,27,46,.28)]">
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="var(--color-ok)" /><path className="mo-check" d="M7.5 12.5 10.5 15.5 16.5 9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="flex-1">{t.text}{t.sub && <span className="block text-sm text-white/70">{t.sub}</span>}</span>
            {t.undo && <button onClick={() => { t.undo!(); setToasts((xs) => xs.filter((x) => x.id !== t.id)); }} className="font-bold" style={{ color: 'var(--tone-ok-bg)' }}>取り消す</button>}
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
  if (today == null) return null;
  const ratio = Math.min(1, today / Math.max((weekAvg ?? today) * 1.5, 1));
  const diff = weekAvg == null ? null : Math.round((today - weekAvg) * 10) / 10;
  return (
    <div className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-sm" title="比べるのは先週のあなたの平均だけ">
      <svg aria-hidden width="28" height="28" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="14" fill="none" stroke="var(--color-track)" strokeWidth="5" />
        <circle cx="18" cy="18" r="14" fill="none" stroke="var(--color-ok)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${88 * ratio} 88`} transform="rotate(-90 18 18)" style={{ transition: 'stroke-dasharray 600ms cubic-bezier(.22,1,.36,1)' }} />
      </svg>
      <span>今日の処理 <b key={bump} className={`num text-body ${bump ? 'mo-spring-in inline-block' : ''}`}>{today}</b>件{diff != null && <> <span className={diff >= 0 ? 'text-ok' : 'text-muted'}>先週平均 {diff >= 0 ? '+' : ''}{diff}</span></>}</span>
    </div>
  );
}

/** 残り件数のリング。0 になったら静かな完了カードに変わる。 */
export function RemainRing({ remain, total }: { remain: number; total: number }) {
  const done = total - remain;
  const r = total ? done / total : 1;
  return (
    <svg aria-label={`残り${remain}件`} width="44" height="44" viewBox="0 0 44 44" role="img">
      <circle cx="22" cy="22" r="18" fill="none" stroke="var(--color-track)" strokeWidth="5" />
      <circle cx="22" cy="22" r="18" fill="none" stroke="var(--a)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${113 * r} 113`} transform="rotate(-90 22 22)" style={{ transition: 'stroke-dasharray 600ms cubic-bezier(.22,1,.36,1)' }} />
      <text x="22" y="26" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--color-ink)">{remain}</text>
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
