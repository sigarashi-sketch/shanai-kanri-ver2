import { PAGE_H, PAGE_W, type Align, type Box, type CellSt, type El, type NCell, type NEl, type NPage, type NPara, type NRun, type Patch, type RunSt, type Tbl } from './types';

// デザインリテラシー コースの「答え合わせの道具」。レッスン（l1〜l3.ts）のチェックが使う。画面でもサーバでも動く（ここは計算だけ）
//   P       … 1レッスンぶんのスライド（1〜3枚）を、名前（k）で引けるようにしたもの
//   specToN … 配るスライド（El）を、答え合わせで見る形（NEl）にする。お手本が全チェックに通るかの確認と、画面の図に使う
//   applyFix … 最初の状態に お手本の直しを当てる

// ---- 色
export const hex = (c: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [0, 0, 0]; };
const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export const lum = (c: string) => { const [r, g, b] = hex(c); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };   // 0 = 黒, 1 = 白
export const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export function hsl(c: string) {
  const [r, g, b] = hex(c).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return { h, s, l };
}
// 白・黒・グレーではない「色」か（色みがあって、白や黒に近すぎない）
//   色みの強さは「いちばん明るい成分 − いちばん暗い成分」で見る（うすい水色や濃紺のグレーを 色に数えない）
export const isColor = (c: string) => { if (!c) return false; const v = hex(c); return (Math.max(...v) - Math.min(...v)) / 255 > 0.2; };
export const sameColor = (a: string, b: string) => { const x = hex(a), y = hex(b); return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) <= 36; };
// 色みの近いものを1つに数えて、何色あるか（白・黒・グレーは数えない）
export function hueCount(colors: string[]) {
  const hs = colors.filter(isColor).map((c) => hsl(c).h); const groups: number[] = [];
  for (const h of hs) if (!groups.some((g) => Math.min(Math.abs(g - h), 360 - Math.abs(g - h)) <= 25)) groups.push(h);
  return groups.length;
}

// ---- 文字
const vis = (r: NRun) => r.text.replace(/\s/g, '').length;
const visRuns = (e: { runs: NRun[] }) => e.runs.filter((r) => vis(r) > 0);
export const minSize = (e?: { runs: NRun[] }) => { const r = e ? visRuns(e) : []; return r.length ? Math.min(...r.map((x) => x.size)) : 0; };
export const maxSize = (e?: { runs: NRun[] }) => { const r = e ? visRuns(e) : []; return r.length ? Math.max(...r.map((x) => x.size)) : 0; };
export const chars = (e?: { runs: NRun[] }) => (e ? visRuns(e).reduce((s, r) => s + vis(r), 0) : 0);
export const boldRatio = (e?: { runs: NRun[] }) => { const n = chars(e); return n && e ? visRuns(e).filter((r) => r.bold).reduce((s, r) => s + vis(r), 0) / n : 0; };
export const allBold = (e?: { runs: NRun[] }) => chars(e) > 0 && boldRatio(e) > 0.99;
export const noBold = (e?: { runs: NRun[] }) => chars(e) > 0 && boldRatio(e) < 0.01;
export const anyUnder = (e?: { runs: NRun[] }) => !!e && visRuns(e).some((r) => r.under);
// いちばん多く使われている文字の色
export function textColor(e?: { runs: NRun[] }) {
  const n = new Map<string, number>(); for (const r of e ? visRuns(e) : []) n.set(r.color, (n.get(r.color) || 0) + vis(r));
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}
export const textColors = (els: { runs: NRun[] }[]) => { const out: string[] = []; for (const e of els) for (const r of visRuns(e)) if (!out.some((c) => sameColor(c, r.color))) out.push(r.color); return out; };
export const fonts = (els: { runs: NRun[] }[]) => [...new Set(els.flatMap((e) => visRuns(e).map((r) => r.font)))];
// ある言葉を含む部分が 太字か
export const boldAt = (e: { runs: NRun[] } | undefined, word: string) => { if (!e) return false; const all = e.runs.map((r) => r.text).join(''); const at = all.indexOf(word); if (at < 0) return false; let pos = 0; for (const r of e.runs) { const end = pos + r.text.length; if (end > at && pos < at + word.length && !r.bold) return false; pos = end; } return true; };
export const lines = (e?: { paras: NPara[] }) => (e ? e.paras.filter((p) => p.text.trim()) : []);
export const aligned = (e: { paras: NPara[] } | undefined, a: Align) => { const l = lines(e); return l.length > 0 && l.every((p) => p.align === a); };

// かざり文字・明朝体（本文に向かないもの）。ビジネス資料の本文は ゴシック体
export const DECO_FONTS = ['Potta One', 'Hachi Maru Pop', 'Yusei Magic', 'Comic Sans MS', 'DotGothic16', 'Kaisei Decol', 'Reggae One', 'RocknRoll One', 'Dela Gothic One', 'Rampart One', 'Stick', 'Mochiy Pop One', 'Mochiy Pop P One', 'Yomogi', 'Impact', 'Pacifico', 'Lobster', 'Caveat'];
export const SERIF_FONTS = ['Noto Serif JP', 'Sawarabi Mincho', 'Shippori Mincho', 'Zen Old Mincho', 'Zen Antique', 'Kaisei Tokumin', 'Kaisei Opti', 'Times New Roman', 'Georgia', 'Merriweather', 'Playfair Display', 'MS PMincho', 'MS Mincho'];
const inList = (f: string, list: string[]) => list.some((x) => x.toLowerCase() === f.toLowerCase());
export const isDeco = (f: string) => inList(f, DECO_FONTS);
export const isSerif = (f: string) => inList(f, SERIF_FONTS);

// ---- 位置
export const right = (e: NEl) => e.x + e.w;
export const bottom = (e: NEl) => e.y + e.h;
export const near = (a: number, b: number, tol = 3) => Math.abs(a - b) <= tol;
export const spread = (v: number[]) => (v.length ? Math.max(...v) - Math.min(...v) : 0);
export const inPage = (e: NEl, margin = 0) => e.x >= margin - 0.5 && e.y >= margin - 0.5 && right(e) <= PAGE_W - margin + 0.5 && bottom(e) <= PAGE_H - margin + 0.5;
export const overlap = (a: NEl, b: NEl) => a.x < right(b) - 1 && b.x < right(a) - 1 && a.y < bottom(b) - 1 && b.y < bottom(a) - 1;
// 横に並んだものの すき間（左から順に）
export const gapsX = (els: NEl[]) => { const s = [...els].sort((a, b) => a.x - b.x); return s.slice(1).map((e, i) => e.x - right(s[i])); };

export class P {
  readonly els: NEl[];
  constructor(readonly pages: NPage[]) { this.els = pages.flatMap((p) => p.els); }
  el(k: string) { return this.els.find((e) => e.k === k); }
  all(...ks: string[]) { return ks.map((k) => this.el(k)).filter((e): e is NEl => !!e); }
  // 名前が そろっているか（消してしまったものが無いか）
  has(...ks: string[]) { return ks.every((k) => !!this.el(k)); }
  // 本人が足したもの
  get added() { return this.els.filter((e) => !e.k); }
  get texts() { return this.els.filter((e) => e.kind === 'box' && e.text.trim()); }
}

// ---- 配るスライド → 答え合わせで見る形
const BASE = { size: 14, bold: false, italic: false, under: false, font: 'Noto Sans JP', color: '#000000' };
function runsOf(text: string, st: RunSt, ranges: Box['runs'] = []): NRun[] {
  const base = { ...BASE, ...clean(st) };
  const cuts = [...new Set([0, text.length, ...ranges.flatMap((r) => [Math.max(0, r.a), Math.min(text.length, r.b)])])].sort((a, b) => a - b);
  const out: NRun[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1]; if (a === b) continue;
    let s = { ...base }; for (const r of ranges) if (r.a <= a && r.b >= b) s = { ...s, ...clean(r) };
    out.push({ text: text.slice(a, b), size: s.size, bold: s.bold, italic: s.italic, under: s.under, font: s.font, color: s.color.toUpperCase() });
  }
  return out;
}
const clean = (s: RunSt) => Object.fromEntries((['size', 'bold', 'italic', 'under', 'font', 'color'] as const).filter((k) => s[k] !== undefined).map((k) => [k, s[k]])) as Partial<typeof BASE>;
const parasOf = (text: string, align: Align = 'l', lh = 100, bullet: boolean | 'num' = false): NPara[] => text.split('\n').map((t) => ({ text: t, align, lh, bullet: !!bullet, num: bullet === 'num' }));
export function cellSt(t: Tbl, r: number, c: number): CellSt {
  const base: CellSt = { size: t.size, bold: t.bold, color: t.color, font: t.font, align: t.align };
  for (const [key, st] of Object.entries(t.cells || {})) { const [a, b] = key.split(','); if ((a === '*' || +a === r) && (b === '*' || +b === c)) Object.assign(base, st); }
  return base;
}
export function specToN(pages: El[][], notes: string[] = []): NPage[] {
  return pages.map((els, page) => ({
    notes: notes[page] || '',
    els: els.map((e): NEl => {
      const base = { id: e.k, k: e.k, page, x: e.x, y: e.y, w: e.w, h: e.h, text: '', runs: [] as NRun[], paras: [] as NPara[], fill: '', line: '', lineW: 0, arrow: false, ratio: 0, cells: [] as NCell[][], vlines: 0, shape: '' };
      if (e.t === 'box') { const text = e.text || ''; return { ...base, kind: 'box', shape: e.shape || 'text', text, runs: text ? runsOf(text, e, e.runs) : [], paras: text ? parasOf(text, e.align, e.lh, e.bullet) : [], fill: (e.fill || '').toUpperCase(), line: (e.line || '').toUpperCase(), lineW: e.line ? e.lineW ?? 1 : 0 }; }
      if (e.t === 'line') return { ...base, kind: 'line', shape: 'line', line: (e.color || '#000000').toUpperCase(), lineW: e.weight ?? 1, arrow: !!e.arrow };
      if (e.t === 'img') return { ...base, kind: 'img', shape: 'img', ratio: e.w / e.h };
      const cells = e.rows.map((row, r) => row.map((text, c): NCell => { const st = cellSt(e, r, c); return { text, runs: text ? runsOf(text, st) : [], paras: parasOf(text, st.align), fill: (st.fill || '').toUpperCase() }; }));
      return { ...base, kind: 'table', shape: 'table', cells, vlines: e.vline === false ? 0 : e.rows.length * (e.rows[0].length - 1) };
    }),
  }));
}
export function applyFix(pages: El[][], fix: Patch[]): El[][] {
  return pages.map((els, i) => {
    const f = fix[i] || {};
    return [...els.filter((e) => !(f.del || []).includes(e.k)).map((e) => (f.set?.[e.k] ? ({ ...e, ...f.set[e.k] } as El) : e)), ...(f.add || [])];
  });
}
