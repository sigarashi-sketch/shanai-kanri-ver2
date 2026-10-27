'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ExternalLink, Maximize, Minus, Plus } from 'lucide-react';
import { MAP_H, MAP_W, TILES, detailTiles, latLng, xy } from '@/lib/live/map';

// 地図の土台（Google マップの地図タイルを敷き、上に children の SVG でピンを重ねる）。
//   案件・要員マップ（/eigyo/map）・保留の要員マップ・客先向けの画面で同じものを使う（10-27 まとめた）
//   タイルは決まった枠と いま見ている窓のぶんを読むだけ（場所は外へ送らない）。座標は lib/live/map の xy（タイルと同じメルカトル図法）
//   拡大・移動（10-27 shoya「拡大とかできないし Google map じゃない」）: ホイール・ピンチ・ドラッグ・ダブルクリック・右上の ＋ − 全体。
//     拡大すると細かいタイルに差し替える。ピンは <Pin> で置くと 拡大しても同じ大きさのまま。吹き出し（overlay）は pct で置けば窓に付いてくる
const MAX_K = 64;
const ViewCtx = createContext(1);
/** いまの拡大率（1＝枠ぜんぶ） */
export const useMapK = () => useContext(ViewCtx);
/** 拡大しても大きさの変わらないピン（x,y は xy() の値） */
export function Pin({ x, y, children, ...rest }: { x: number; y: number } & React.SVGProps<SVGGElement>) {
  const k = useMapK();
  return <g transform={`translate(${x},${y}) scale(${1 / k})`} {...rest}>{children}</g>;
}
/** overlay の吹き出しの位置（拡大・移動に付いてくる＝TileMap が --map-* を持つ） */
export const pct = (lat: number, lng: number) => { const p = xyPct(lat, lng); return { left: `calc((${p.x}% - var(--map-vx, 0%)) * var(--map-k, 1))`, top: `calc((${p.y}% - var(--map-vy, 0%)) * var(--map-k, 1))` }; };
const xyPct = (lat: number, lng: number) => { const p = xy(lat, lng); return { x: (p.x / MAP_W) * 100, y: (p.y / MAP_H) * 100 }; };

type View = { k: number; vx: number; vy: number };
const clampView = ({ k, vx, vy }: View): View => {
  const kk = Math.min(MAX_K, Math.max(1, k)), vw = MAP_W / kk, vh = MAP_H / kk;
  return { k: kk, vx: Math.min(MAP_W - vw, Math.max(0, vx)), vy: Math.min(MAP_H - vh, Math.max(0, vy)) };
};

export function TileMap({ children, overlay, onBg }: { children: React.ReactNode; overlay?: React.ReactNode; onBg?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ k: 1, vx: 0, vy: 0 });
  const [cw, setCw] = useState(900);
  const vref = useRef(view); vref.current = view;
  const vw = MAP_W / view.k, vh = MAP_H / view.k;

  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setCw(el.clientWidth || 900)); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** 画面の点（地図の左上からの px）を動かさずに 拡大率を f 倍 */
  const zoomAt = useCallback((f: number, px?: number, py?: number) => {
    const el = box.current; if (!el) return;
    const w = el.clientWidth, h = el.clientHeight, ax = px ?? w / 2, ay = py ?? h / 2;
    setView((v) => {
      const vw0 = MAP_W / v.k, vh0 = MAP_H / v.k, ux = v.vx + (ax / w) * vw0, uy = v.vy + (ay / h) * vh0;
      const k = Math.min(MAX_K, Math.max(1, v.k * f));
      return clampView({ k, vx: ux - (ax / w) * (MAP_W / k), vy: uy - (ay / h) * (MAP_H / k) });
    });
  }, []);

  // ホイールで拡大（ページが動かないよう passive にしない）
  useEffect(() => {
    const el = box.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // ドラッグで移動・2本指で拡大。4px 動いたらドラッグ扱い＝そのあとのクリック（ピン・背景）は効かせない
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ moved: boolean; start: { x: number; y: number }; v: View; dist?: number; mid?: { x: number; y: number } } | null>(null);
  const swallow = useRef(false);
  const begin = () => {
    const ps = [...pts.current.values()];
    if (!ps.length) { drag.current = null; return; }
    const mid = ps.length > 1 ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } : ps[0];
    drag.current = { moved: drag.current?.moved ?? false, start: mid, v: vref.current, dist: ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : undefined, mid };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('[data-map-ui]') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const r = box.current!.getBoundingClientRect();
    pts.current.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    swallow.current = false;
    begin();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId) || !drag.current) return;
    const el = box.current!, r = el.getBoundingClientRect(), w = el.clientWidth, h = el.clientHeight;
    pts.current.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    const ps = [...pts.current.values()], d = drag.current;
    const mid = ps.length > 1 ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } : ps[0];
    if (!d.moved && Math.hypot(mid.x - d.start.x, mid.y - d.start.y) < 4 && !(ps.length > 1)) return;
    if (!d.moved) { d.moved = true; try { el.setPointerCapture(e.pointerId); } catch {} }
    const k = d.dist && ps.length > 1 ? d.v.k * (Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) / d.dist) : d.v.k;
    const kk = Math.min(MAX_K, Math.max(1, k));
    // 始めの点の地図上の位置を いまの指の位置に合わせる
    const ux = d.v.vx + (d.start.x / w) * (MAP_W / d.v.k), uy = d.v.vy + (d.start.y / h) * (MAP_H / d.v.k);
    setView(clampView({ k: kk, vx: ux - (mid.x / w) * (MAP_W / kk), vy: uy - (mid.y / h) * (MAP_H / kk) }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.delete(e.pointerId);
    if (drag.current?.moved) swallow.current = true;
    if (pts.current.size) begin(); else drag.current = null;
  };

  const center = latLng(view.vx + vw / 2, view.vy + vh / 2);
  const { z, tiles } = detailTiles(view.k, cw, view.vx, view.vy, vw, vh);
  const btn = 'grid size-8 place-items-center bg-surface text-ink hover:bg-soft disabled:text-faint';
  return (
    <div ref={box} className="relative touch-none select-none overflow-hidden rounded-lg border border-line-soft"
      style={{ background: 'var(--color-soft)', aspectRatio: `${MAP_W} / ${MAP_H}`, cursor: drag.current?.moved ? 'grabbing' : 'grab', '--map-k': view.k, '--map-vx': `${(view.vx / MAP_W) * 100}%`, '--map-vy': `${(view.vy / MAP_H) * 100}%` } as React.CSSProperties}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onClickCapture={(e) => { if (swallow.current) { swallow.current = false; e.stopPropagation(); e.preventDefault(); } }}
      onDoubleClick={(e) => { if ((e.target as Element).closest('[data-map-ui]')) return; const r = box.current!.getBoundingClientRect(); zoomAt(2, e.clientX - r.left, e.clientY - r.top); }}>
      <div className="pointer-events-none absolute" aria-hidden
        style={{ left: `${(-view.vx / vw) * 100}%`, top: `${(-view.vy / vh) * 100}%`, width: `${view.k * 100}%`, height: `${view.k * 100}%` }}>
        {[...TILES, ...tiles].map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={t.src} src={t.src} alt="" referrerPolicy="no-referrer" loading="lazy" draggable={false} className="absolute max-w-none select-none"
            style={{ left: `${t.left}%`, top: `${t.top}%`, width: `${t.w}%`, height: `${t.h}%` }} />
        ))}
      </div>
      <svg viewBox={`${view.vx} ${view.vy} ${vw} ${vh}`} preserveAspectRatio="none" className="absolute inset-0 block h-full w-full" role="img" aria-label="地図" onClick={onBg}>
        <ViewCtx.Provider value={view.k}>{children}</ViewCtx.Provider>
      </svg>
      {overlay && <div data-map-ui className="contents">{overlay}</div>}
      <div data-map-ui className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-md border border-line shadow-sm">
        <button className={btn} onClick={() => zoomAt(2)} disabled={view.k >= MAX_K} aria-label="拡大" title="拡大"><Plus size={15} /></button>
        <button className={`${btn} border-t border-line-soft`} onClick={() => zoomAt(0.5)} disabled={view.k <= 1} aria-label="縮小" title="縮小"><Minus size={15} /></button>
        <button className={`${btn} border-t border-line-soft`} onClick={() => setView({ k: 1, vx: 0, vy: 0 })} disabled={view.k <= 1} aria-label="全体を表示" title="全体を表示"><Maximize size={14} /></button>
      </div>
      <a data-map-ui target="_blank" rel="noopener" className="absolute bottom-1 left-1.5 flex items-center gap-1 rounded bg-surface/90 px-1.5 py-0.5 text-xs text-muted shadow-sm hover:text-ink"
        href={`https://www.google.com/maps/@${center.lat.toFixed(5)},${center.lng.toFixed(5)},${Math.max(z, 11)}z?hl=ja`}><ExternalLink size={11} />Google マップで開く</a>
      <span className="pointer-events-none absolute bottom-1 right-1.5 rounded bg-surface/80 px-1 text-xs text-faint">地図データ ©Google</span>
    </div>
  );
}
