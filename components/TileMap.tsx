'use client';

import { MAP_H, MAP_W, TILES, xy } from '@/lib/live/map';

// 地図の土台（Google マップの地図タイルを敷き、上に children の SVG でピンを重ねる）。
//   案件・要員マップ（/eigyo/map）・保留の要員マップ・客先向けの画面で同じものを使う（10-27 まとめた）
//   タイルは決まった枠を全部読むだけ（場所は外へ送らない）。座標は lib/live/map の xy（タイルと同じメルカトル図法）
export const pct = (lat: number, lng: number) => { const p = xy(lat, lng); return { left: `${(p.x / MAP_W) * 100}%`, top: `${(p.y / MAP_H) * 100}%` }; };

export function TileMap({ children, overlay, onBg }: { children: React.ReactNode; overlay?: React.ReactNode; onBg?: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-line-soft" style={{ background: 'var(--color-soft)' }}>
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {TILES.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={t.src} src={t.src} alt="" referrerPolicy="no-referrer" loading="lazy" draggable={false} className="absolute max-w-none select-none"
            style={{ left: `${t.left}%`, top: `${t.top}%`, width: `${t.w}%`, height: `${t.h}%` }} />
        ))}
      </div>
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="relative block h-auto w-full" role="img" aria-label="地図" onClick={onBg}>
        {children}
      </svg>
      {overlay}
      <span className="absolute bottom-1 right-1.5 rounded bg-surface/80 px-1 text-xs text-faint">地図データ ©Google</span>
    </div>
  );
}
