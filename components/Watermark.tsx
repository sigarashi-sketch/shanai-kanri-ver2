'use client';
import { useEffect } from 'react';

// スクショ対策: 「スクショ厳禁」とログイン中のメールアドレス・日時（分）を全画面に薄く斜めに敷く。画面を撮れば誰の画面かが一緒に写る。
//   「スクショ厳禁」の1行は 2026-10-27 shoya（ver2 にも入れたとき）。それゆけ（saiyou-app）の components/Watermark.tsx の写し
//   いけどん public/watermark.js と同じ見た目・同じ考え方（2026-10-01）。濃さは OPACITY 1箇所。
//   ★隠し機能ではない。全員の画面に見える形で出る（薄いだけ）。人に見えない目印で流出元を特定する方式は入れない（いけどんと同じ判断）
//   ★操作の邪魔をしない: pointer-events:none の1枚を最前面に重ねるだけ。今のシステムを埋め込んだ画面(iframe)の上にもかかる
//   ★<html> 直下に置く（画面側の再描画で消えない）。外されても1分以内に戻す
const OPACITY = 0.11;   // 0.08 でほぼ見えない・0.16 で少し気になる
const TILE_W = 840, TILE_H = 500, FONT = 13, ANGLE = -22;
const ID = 'v2-wm';
const NOTE = 'スクショ厳禁';

const pad = (n: number) => (n < 10 ? '0' : '') + n;
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const xml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
// 決まった乱数（同じメール・同じ分なら同じ並び）
function rand(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
// AI の加工（Gemini などの「透かしを消して」）で消されにくくする（2026-10-27 shoya）:
//   ・きれいに並んだ1パターンだと 繰り返しを見抜いて塗りつぶされやすい → 位置・角度・大きさ・濃さを少しずつずらす（分ごとに並びも変わる）
//   ・角度のちがう細かい層を もう1枚重ねる（大きい字だけ消しても 小さい字が残る）
//   ・字は 画面の中身の上に重なる＝消すと下の中身も作り直すことになり、加工したことが残りやすい
//   ★完全に消せなくする方法は無い（見える透かしは AI で薄くはできる）。目的は「撮ったら誰か分かる」「加工の手間を上げる」まで
function tileUrl(email: string, when: string): string {
  const r = rand(email + when);
  const j = (n: number) => (r() - 0.5) * n;
  const big = (x: number, y: number) => {
    const a = ANGLE + j(10), f = FONT + j(3), o = OPACITY * (0.85 + r() * 0.3);
    return `<g transform="translate(${x + j(60)} ${y + j(40)}) rotate(${a.toFixed(1)})" fill-opacity="${o.toFixed(3)}" font-size="${f.toFixed(1)}"><text x="0" y="0" font-weight="700">${NOTE}</text><text x="0" y="${f + 5}">${xml(email)}</text><text x="0" y="${(f + 5) * 2}">${xml(when)}</text></g>`;
  };
  const small = (x: number, y: number) => {
    const a = 24 + j(14), o = OPACITY * 0.6;
    return `<g transform="translate(${x + j(50)} ${y + j(50)}) rotate(${a.toFixed(1)})" fill-opacity="${o.toFixed(3)}" font-size="9"><text x="0" y="0">${NOTE} ${xml(email)}</text></g>`;
  };
  let g = '';
  for (let iy = 0; iy < 4; iy++) for (let ix = 0; ix < 2; ix++) g += big(14 + ix * (TILE_W / 2) + (iy % 2) * (TILE_W / 4), 70 + iy * (TILE_H / 4));
  for (let iy = 0; iy < 5; iy++) for (let ix = 0; ix < 3; ix++) g += small(60 + ix * (TILE_W / 3), 40 + iy * (TILE_H / 5));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}"><g fill="#808080" font-family="system-ui,-apple-system,'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif">${g}</g></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}
const STYLE = 'position:fixed;inset:0;left:0;top:0;width:100vw;height:100vh;z-index:2147483646;pointer-events:none;'
  + 'user-select:none;-webkit-user-select:none;background-repeat:repeat;-webkit-print-color-adjust:exact;print-color-adjust:exact;';

export default function Watermark({ email }: { email: string }) {
  useEffect(() => {
    const who = String(email || '').trim();
    if (!who) return;
    let el: HTMLDivElement | null = null;
    const paint = () => {
      if (!el) { el = document.createElement('div'); el.id = ID; el.setAttribute('aria-hidden', 'true'); }
      el.setAttribute('style', STYLE + 'background-image:' + tileUrl(who, stamp(new Date())));
      if (el.parentNode !== document.documentElement) document.documentElement.appendChild(el);
    };
    const onVis = () => { if (!document.hidden) paint(); };
    paint();
    const t = setInterval(paint, 60000);   // 日時の更新を兼ねて、外されていたら戻す
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); el?.remove(); };
  }, [email]);
  return null;
}
