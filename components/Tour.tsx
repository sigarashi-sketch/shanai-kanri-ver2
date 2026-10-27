'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, List, Lock, MousePointer2, SkipForward, X } from 'lucide-react';
import { LEVELS, atLeast, type Level } from '@/lib/access';
import { GUIDE, type GuideEntry } from '@/lib/guide';

// 使い方ガイドの「実際の画面で案内する」形（10-27 shoya「使い方ガイドは実際の画面でポインタとか強調表示とかでやってほしい」）。
//   ・本物の画面を順に開き、左のメニューのその画面をポインタで指して光らせ、画面の中身も明るく残す（ほかは暗く）。横の吹き出しに 見られるもの・見え方・できること
//   ・狙う場所は data-tour の印（components/Shell.tsx：sidenav／home／grp-<分類>／nav-<href>／col＝画面の中身／guide／theme／renraku）
//   ・ツアーの間は左のメニューを広げたまま（window の 'v2-tour' で Shell の SideNav に知らせる）
//   ・吹き出しの「一覧で見る」で前の一覧の窓（components/Guide.tsx）。← → で進む・戻る、Esc で終わる
export type TourStep = {
  key: string;
  /** 先に開く画面（無ければ今の画面のまま） */
  path?: string;
  /** ポインタで指して光らせる場所（data-tour の値） */
  target: string;
  /** 画面の中身（data-tour="col"）も明るく残すか */
  showPage?: boolean;
  /** 左のメニューで開いておく分類 */
  group?: string;
  /** 吹き出しの色（分類の色） */
  mod?: string;
  title: string;
  level?: { l: Level; note?: string };
  entry?: GuideEntry;
  text?: string;
  /** 吹き出しの「飛ぶ」の欄に出す区切り（はじめに・分類の名前・おわりに） */
  section?: string;
  /** 「この分類をとばす」で飛ぶ先（次の分類の最初の段） */
  skipTo?: number;
};

const NEED: Record<string, Level> = { '（直す）': 'edit', '（承認）': 'approve' };
const levelText = (l: Level) => LEVELS.find((x) => x.key === l)!.label;
type Box = { x: number; y: number; w: number; h: number };
const PAD = 6, BW = 400;

function rectOf(name: string): Box | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${CSS.escape(name)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  if (name === 'col') {
    // 画面の中身＝上のバーより下・見えているところだけ
    // 広げたメニューの下にもぐる分は外す（メニューは画面の上に重ねて広がる）
    const hb = document.querySelector('[data-tour="header"]')?.getBoundingClientRect().bottom ?? r.top;
    const nr = document.querySelector('[data-tour="sidenav"]')?.getBoundingClientRect().right ?? r.left;
    const top = Math.max(r.top, hb), bottom = Math.min(r.bottom, window.innerHeight), left = Math.max(r.left, nr + 8);
    return { x: left, y: top, w: Math.max(0, r.right - left), h: Math.max(0, bottom - top) };
  }
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}
export const tourNav = (on: boolean, group?: string) => void window.dispatchEvent(new CustomEvent('v2-tour', { detail: { on, group } }));

export function Tour({ steps, onClose, onList }: { steps: TourStep[]; onClose: () => void; onList: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [i, setI] = useState(0);
  const [t, setT] = useState<Box | null>(null);
  const [page, setPage] = useState<Box | null>(null);
  const [vw, setVw] = useState({ w: 1280, h: 800 });
  const bubble = useRef<HTMLDivElement>(null);
  const [bh, setBh] = useState(300);
  const sections = steps.reduce<{ name: string; at: number }[]>((a, st, n) => (st.section && !a.some((x) => x.name === st.section) ? [...a, { name: st.section, at: n }] : a), []);
  const s = steps[Math.min(i, steps.length - 1)];

  // 段が変わったら：メニューを広げて分類を開き、画面を移る
  useEffect(() => {
    tourNav(true, s.group);
    if (s.path && pathname !== s.path) router.push(s.path);
  }, [s, pathname, router]);
  useEffect(() => () => { tourNav(false); }, []);

  // 狙う場所を毎フレーム追いかける（画面の読み込み・メニューの開き・スクロールに付いていく）
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${CSS.escape(s.target)}"]`);
      // 左のメニューの中だけ動かして見えるところへ（scrollIntoView は画面ごと動かしてしまう）
      //   分類が開き切るまで項目の位置が動くので、見えるところに来るまで毎フレーム合わせる
      if (el) {
        const nav = el.closest<HTMLElement>('[data-tour="sidenav"]');
        if (nav && nav !== el) {
          const er = el.getBoundingClientRect(), nr = nav.getBoundingClientRect();
          if (er.top < nr.top + 8 || er.bottom > nr.bottom - 8) nav.scrollTop += er.top - nr.top - nr.height / 3;
        }
      }
      if (bubble.current) setBh(bubble.current.offsetHeight);
      setT(rectOf(s.target));
      setPage(s.showPage ? rectOf('col') : null);
      setVw({ w: window.innerWidth, h: window.innerHeight });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s]);

  const go = useCallback((n: number) => { if (n >= steps.length) onClose(); else setI(Math.max(0, n)); }, [steps.length, onClose]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [i, go, onClose]);

  const holes = [t, page].filter((b): b is Box => !!b && b.w > 0 && b.h > 0);
  // 吹き出しの置き場：画面の中身を見せる段は右下の隅。それ以外は狙う場所の右（入らなければ下）
  // 吹き出しは測った高さで置く（はみ出して「次へ」が見えなくならないように）
  let bx: number, by: number;
  if (s.showPage || !t) { bx = vw.w - BW - 20; by = Math.max(12, vw.h - bh - 16); }
  else if (t.x + t.w + 20 + BW < vw.w) { bx = t.x + t.w + 20; by = Math.min(Math.max(12, t.y - 20), vw.h - bh - 12); }
  else { bx = Math.min(Math.max(12, t.x + t.w - BW), vw.w - BW - 12); by = Math.min(t.y + t.h + 14, vw.h - bh - 12); }
  const px = t ? t.x + Math.min(t.w - 14, Math.max(18, t.w * 0.7)) : vw.w / 2;
  const py = t ? t.y + t.h / 2 : vw.h / 2;
  const color = s.mod ? `var(--c-${s.mod})` : 'var(--a)';

  // 画面の外枠（data-module・分類の色の変数がここにある）の直下に出す。上のバーは backdrop-blur なので、その中の fixed はバーに閉じ込められる
  if (typeof document === 'undefined') return null;
  const host = document.querySelector('[data-module]') ?? document.body;
  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: 95 }} aria-live="polite">
      {/* 暗い幕（穴あき）。押しても何も起きない＝案内の間は画面を触らせない */}
      <svg className="absolute inset-0 size-full" aria-hidden onClick={(e) => e.stopPropagation()}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {holes.map((b, n) => <rect key={n} x={b.x - PAD} y={b.y - PAD} width={b.w + PAD * 2} height={b.h + PAD * 2} rx={10} fill="black" style={{ transition: 'all 380ms cubic-bezier(.22,1,.36,1)' }} />)}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(12,12,18,.58)" mask="url(#tour-mask)" />
      </svg>
      {page && <div aria-hidden className="pointer-events-none absolute rounded-[10px]" style={{ left: page.x - PAD, top: page.y - PAD, width: page.w + PAD * 2, height: page.h + PAD * 2, boxShadow: '0 0 0 2px rgba(255,255,255,.55)', transition: 'all 380ms cubic-bezier(.22,1,.36,1)' }} />}
      {t && (
        <div key={`r${s.key}`} aria-hidden className="pointer-events-none absolute rounded-[10px]"
          style={{ left: t.x - PAD, top: t.y - PAD, width: t.w + PAD * 2, height: t.h + PAD * 2, outline: `3px solid ${color}`, outlineOffset: 0, transition: 'all 380ms cubic-bezier(.22,1,.36,1)' }}>
          <span className="absolute inset-0 rounded-[10px]" style={{ animation: 'mo-ring 1400ms ease-out infinite', ['--a' as string]: color }} />
        </div>
      )}
      {/* ポインタ（前の場所からすべって来て、着いたら押す） */}
      <div aria-hidden className="pointer-events-none absolute" style={{ left: px, top: py, transition: 'left 650ms cubic-bezier(.22,1,.36,1), top 650ms cubic-bezier(.22,1,.36,1)' }}>
        <span key={s.key} className="absolute -left-3 -top-3 size-6 rounded-full" style={{ background: color, opacity: 0.35, animation: 'mo-ring 1100ms 650ms ease-out infinite', ['--a' as string]: color }} />
        <MousePointer2 key={`p${s.key}`} size={30} strokeWidth={1.6} className="relative drop-shadow-[0_2px_4px_rgba(0,0,0,.45)]" style={{ fill: '#fff', color: '#18181B', animation: 'tour-tap 1100ms 650ms ease-in-out infinite' }} />
      </div>

      <div key={`b${s.key}`} role="dialog" aria-label={`使い方ガイド ${i + 1}/${steps.length}`} ref={bubble} className="mo-fade-up absolute flex max-h-[calc(100vh-28px)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_64px_rgba(0,0,0,.35)]"
        style={{ left: bx, top: by, width: BW }}>
        <div className="h-1 shrink-0" style={{ background: color }} />
        <div className="flex items-start gap-2 px-4 pt-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-faint">使い方ガイド {i + 1} / {steps.length}
              {sections.length > 1 && (
                <select aria-label="飛ぶ" value={s.section ?? ''} onChange={(e) => { const x = sections.find((y) => y.name === e.target.value); if (x) go(x.at); }}
                  className="rounded-md border border-field bg-surface px-1.5 py-0.5 text-xs text-ink">
                  {sections.map((x) => <option key={x.name} value={x.name}>{x.name}へ飛ぶ</option>)}
                </select>
              )}
            </div>
            <h2 className="flex flex-wrap items-center gap-2 text-md font-bold">{s.title}
              {s.level && s.level.l !== 'none' && <span className="chip" style={{ background: color, color: s.mod ? `var(--o-${s.mod})` : 'var(--ao)' }}>{levelText(s.level.l)}{s.level.note ? `・${s.level.note}` : ''}</span>}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="ガイドを終わる" className="rounded-lg p-1 text-muted hover:bg-sunken"><X size={16} /></button>
        </div>
        <div className="min-h-0 overflow-y-auto px-4 pb-2 pt-1.5 text-body">
          {s.text && <p className="whitespace-pre-line">{s.text}</p>}
          {s.entry && (
            <div className="flex flex-col gap-1.5">
              <p>{s.entry.see}</p>
              <p className="text-muted"><span className="font-semibold text-ink">見え方：</span>{s.entry.look}</p>
              <ul className="flex flex-col gap-0.5">
                {s.entry.can.map((c) => {
                  const tag = Object.keys(NEED).find((k) => c.endsWith(k));
                  const ok = !tag || (s.level ? atLeast(s.level.l, NEED[tag]) : true);
                  return (
                    <li key={c} className={`flex items-start gap-1.5 text-sm ${ok ? '' : 'text-faint'}`}>
                      {ok ? <Check size={14} className="mt-0.5 shrink-0" style={{ color }} /> : <Lock size={13} className="mt-0.5 shrink-0" />}
                      <span>{tag ? c.slice(0, -tag.length) : c}{!ok && <span className="ml-1 text-xs">（この権限ではできません）</span>}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 border-t border-line px-3 py-2.5">
          <button type="button" onClick={onList} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted hover:bg-soft" title="全部の画面の説明を一覧で"><List size={14} className="shrink-0" /><span className="whitespace-nowrap">一覧</span></button>
          {s.skipTo !== undefined && <button type="button" onClick={() => go(s.skipTo!)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted hover:bg-soft"><SkipForward size={14} className="shrink-0" /><span className="whitespace-nowrap">この分類をとばす</span></button>}
          <span className="ml-auto" />
          {i > 0 && <button type="button" onClick={() => go(i - 1)} aria-label="戻る" className="btn-secondary px-2.5"><ArrowLeft size={15} /></button>}
          <button type="button" onClick={() => go(i + 1)} className="btn bg-sumi text-white">{i < steps.length - 1 ? <>次へ<ArrowRight size={15} /></> : 'はじめる'}</button>
        </div>
      </div>
    </div>,
    host,
  );
}
