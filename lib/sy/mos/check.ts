import { a1, colNo, type RBook, type RCell, type RCf, type RChart, type RSheet, type RStyle, type RTable } from './read';
import { cellsIn } from './write';

// MOS コース: 答え合わせの道具。レッスンの checks は ここの Bk（ブック）と Sh（シート）を使って書く。
//   ・文字は 全角半角・前後の空白のちがいを気にしない（norm）。数式は 大文字・空白なしで比べる（f）。$ を無視したい時は fx
//   ・無いシート・無いセルを聞いても 落ちない（空の値が返る）
export const norm = (v: unknown) => String(v ?? '').normalize('NFKC').replace(/\s+/g, '').toUpperCase();
export const near = (a: unknown, b: number, eps = 0.006) => typeof a === 'number' && Math.abs(a - b) <= eps;
export const refKey = (r: string) => r.replace(/\$/g, '').replace(/'/g, '').toUpperCase();       // 'Sheet 1'!$A$1:$B$2 → SHEET 1!A1:B2
export const refOnly = (r: string) => refKey(r).replace(/^.*!/, '');                               // シート名を外した範囲
export function overlap(x: string, y: string) {
  const box = (r: string) => { const [s, e] = refOnly(r).split(':'); const a = a1(s), b = a1(e || s); return a && b ? { r1: Math.min(a.r, b.r), r2: Math.max(a.r, b.r), c1: Math.min(a.c, b.c), c2: Math.max(a.c, b.c) } : null; };
  return x.split(/[ ,]+/).some((p) => y.split(/[ ,]+/).some((q) => { const a = box(p), b = box(q); return !!a && !!b && a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2; }));
}
export const covers = (outer: string, inner: string) => cellsIn(refOnly(inner)).every((c) => outer.split(/[ ,]+/).some((p) => overlap(p, c)));

// 表示形式の見分け
export const F = {
  comma: (s: RStyle) => /#,##0/.test(s.numFmt) && !/[¥$€]/.test(s.numFmt) && !/%/.test(s.numFmt),
  currency: (s: RStyle) => /[¥$€]|\[\$/.test(s.numFmt),
  percent: (s: RStyle) => /%/.test(s.numFmt),
  date: (s: RStyle) => /[ymd]/i.test(s.numFmt.replace(/\[[^\]]*\]|"[^"]*"/g, '')) && !/^General$/i.test(s.numFmt),
  text: (s: RStyle) => s.numFmt === '@',
  general: (s: RStyle) => /^General$/i.test(s.numFmt),
  decimals: (s: RStyle) => { const m = /\.(0+)/.exec(s.numFmt.split(';')[0]); return m ? m[1].length : 0; },
};
const BLANK_ST: RStyle = { numFmtId: 0, numFmt: 'General', bold: false, italic: false, underline: false, strike: false, size: 11, font: '', color: '', fill: '', h: '', v: '', wrap: false, indent: 0, rot: 0, shrink: false, border: { l: '', r: '', t: '', b: '' }, name: '' };
const EMPTY: RSheet = { name: '', hidden: false, tabColor: '', chartSheet: false, cells: {}, merges: [], cols: [], rows: {}, defaultColWidth: 8.43, defaultRowHeight: 18.75, freeze: null, split: false, view: { showFormulas: false, gridLines: true, headings: true, zoom: 100, mode: 'normal' }, page: { orientation: 'portrait', scale: 100, fitToPage: false, fitW: 1, fitH: 1, paper: 9, hCenter: false, vCenter: false, gridLines: false, headings: false, margins: {} }, header: '', footer: '', printArea: '', printTitleRows: '', printTitleCols: '', rowBreaks: [], cf: [], links: [], notes: [], tables: [], charts: [], sparks: [], filter: null, sort: null, validations: [] };

export class Sh {
  constructor(public raw: RSheet, public exists = true) {}
  get name() { return this.raw.name; }
  cell(a: string): RCell | undefined { return this.raw.cells[a.toUpperCase()]; }
  v(a: string) { return this.cell(a)?.v ?? null; }                                    // 値そのまま
  n(a: string) { const v = this.v(a); return typeof v === 'number' ? v : NaN; }       // 数（数でなければ NaN）
  t(a: string) { return norm(this.v(a)); }                                             // 文字（ならして比べる用）
  blank(a: string) { const v = this.v(a); return v === null || v === ''; }
  f(a: string) { return (this.cell(a)?.f || '').replace(/\s+/g, '').toUpperCase(); }   // 数式（= なし・大文字・空白なし）。無ければ ''
  fx(a: string) { return this.f(a).replace(/\$/g, ''); }                               // 数式（$ も外す）
  uses(a: string, ...fns: string[]) { const f = this.f(a); return fns.every((fn) => new RegExp('(^|[^A-Z0-9_.])' + fn.toUpperCase() + '\\(').test(f)); }
  st(a: string): RStyle { return this.cell(a)?.s || BLANK_ST; }
  cells(range: string) { return cellsIn(range); }
  all(range: string, pred: (a: string) => boolean) { return cellsIn(range).every(pred); }
  any(range: string, pred: (a: string) => boolean) { return cellsIn(range).some(pred); }
  vals(range: string) { return cellsIn(range).map((a) => this.v(a)); }
  width(col: string) { const n = colNo(col.toUpperCase()); const c = this.raw.cols.find((x) => x.min <= n && n <= x.max); return c ? c.width : this.raw.defaultColWidth; }
  colHidden(col: string) { const n = colNo(col.toUpperCase()); return !!this.raw.cols.find((x) => x.min <= n && n <= x.max)?.hidden; }
  height(row: number) { return this.raw.rows[row]?.ht || this.raw.defaultRowHeight; }
  rowHidden(row: number) { return !!this.raw.rows[row]?.hidden; }
  merged(range: string) { return this.raw.merges.some((m) => refOnly(m) === refOnly(range)); }
  mergedAny(range: string) { return this.raw.merges.some((m) => overlap(m, range)); }
  cf(range?: string): RCf[] { return range ? this.raw.cf.filter((c) => overlap(c.ref, range)) : this.raw.cf; }
  sparks(range?: string) { return range ? this.raw.sparks.filter((s) => overlap(s.loc, range)) : this.raw.sparks; }
  link(a: string) { return this.raw.links.find((l) => overlap(l.ref, a)) || null; }
  note(a: string) { return this.raw.notes.find((x) => x.ref.toUpperCase() === a.toUpperCase()) || null; }
  table(name?: string): RTable | null { return (name ? this.raw.tables.find((t) => norm(t.name) === norm(name)) : this.raw.tables[0]) || null; }
  tableAt(range: string): RTable | null { return this.raw.tables.find((t) => overlap(t.ref, range)) || null; }
  chart(i = 0): RChart | null { return this.raw.charts[i] || null; }
  get charts() { return this.raw.charts; }
  // 行の並び（見出しを除いた range の、col 列の値）
  column(range: string, col: string) { const [s, e] = refOnly(range).split(':'); const a = a1(s)!, b = a1(e)!; return Array.from({ length: b.r - a.r + 1 }, (_, k) => this.v(col.toUpperCase() + (a.r + k))); }
  // このシートに その文字のセルがあるか（インポートの確認など）
  hasText(text: string) { const t = norm(text); return Object.values(this.raw.cells).some((c) => norm(c.v) === t); }
  find(text: string) { const t = norm(text); return Object.entries(this.raw.cells).find(([, c]) => norm(c.v) === t)?.[0] || ''; }
}

export class Bk {
  constructor(public raw: RBook) {}
  get sheets() { return this.raw.sheets.map((s) => new Sh(s)); }
  sheet(name: string) { const s = this.raw.sheets.find((x) => norm(x.name) === norm(name)); return s ? new Sh(s) : new Sh({ ...EMPTY, name }, false); }
  has(name: string) { return this.raw.sheets.some((x) => norm(x.name) === norm(name)); }
  at(i: number) { const s = this.raw.sheets[i]; return s ? new Sh(s) : new Sh(EMPTY, false); }
  name(n: string) { return this.raw.names.find((x) => norm(x.name) === norm(n)) || null; }                 // 名前の定義
  nameIs(n: string, ref: string) { const x = this.name(n); return !!x && refKey(x.ref) === refKey(ref); }   // ref は 'シート名!A1:B5' の形（$ は気にしない）
  prop(k: string) { return this.raw.props[k] || ''; }                                                      // title / subject / creator / keywords / category / description / company / manager
  get tables() { return this.raw.sheets.flatMap((s) => s.tables); }
  table(name?: string) { return (name ? this.tables.find((t) => norm(t.name) === norm(name)) : this.tables[0]) || null; }
  get charts() { return this.raw.sheets.flatMap((s) => s.charts); }
  get chartSheets() { return this.raw.sheets.filter((s) => s.chartSheet).map((s) => new Sh(s)); }
  some(pred: (s: Sh) => boolean) { return this.sheets.some(pred); }
}

// グラフの見分け
export const G = {
  is: (c: RChart | null, type: 'col' | 'bar' | 'line' | 'pie' | 'doughnut' | 'area' | 'scatter') => !!c && (type === 'col' ? c.types.some((t) => t.startsWith('bar')) && c.barDir !== 'bar' : type === 'bar' ? c.types.some((t) => t.startsWith('bar')) && c.barDir === 'bar' : type === 'pie' ? c.types.some((t) => /^(pie|pie3D|ofPie)$/.test(t)) : type === 'line' ? c.types.some((t) => /^line/.test(t)) : c.types.some((t) => t.startsWith(type))),
  stacked: (c: RChart | null) => !!c && /stacked/i.test(c.grouping),
  axisTitle: (c: RChart | null, kind: 'cat' | 'val') => c?.axes.find((a) => a.kind === kind && a.hasTitle)?.title ?? null,
  usesRange: (c: RChart | null, range: string) => !!c && c.series.some((s) => overlap(s.val, range) || overlap(s.cat, range)),
};
