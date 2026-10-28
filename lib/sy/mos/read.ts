import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

// MOS コース: 受講者が保存した .xlsx を読んで、答え合わせで見る形（RBook）にする。Excel 本体は使わない（zip の中の XML を直接読む）。
//   読むもの: セルの値・数式・書式／結合・列幅・行の高さ／表示（固定・数式の表示・ズーム・改ページ プレビュー）／ページ設定・ヘッダー フッター・印刷範囲
//             条件付き書式・スパークライン・ハイパーリンク・メモ／テーブル（スタイル・集計行・フィルター・並べ替え）／グラフ（種類・タイトル・凡例・軸・系列・代替テキスト）
//             名前の定義・ブックのプロパティ
//   ★Excel は 下にコピーした数式を「共有数式」（2つ目からは中身なし）で保存する。ここで1つずつの数式に戻す（shiftFormula）
//   ★色は 標準の色なら RRGGBB、テーマの色なら テーマから引いた RRGGBB（濃淡は見ない）
export interface RStyle {
  numFmtId: number; numFmt: string; bold: boolean; italic: boolean; underline: boolean; strike: boolean; size: number; font: string; color: string;
  fill: string; h: string; v: string; wrap: boolean; indent: number; rot: number; shrink: boolean; border: { l: string; r: string; t: string; b: string }; name: string;
}
export interface RCell { v: string | number | boolean | null; f: string; t: string; s: RStyle; arr: string }   // f = 数式（先頭の = なし・大文字にはしない）／arr = 配列・スピルの範囲
export interface RCf { ref: string; type: string; operator: string; formulas: string[]; rank: number; percent: boolean; bottom: boolean; aboveAverage: boolean; text: string; kind: string; fill: string; color: string; bold: boolean }
export interface RLink { ref: string; target: string; location: string; display: string; tooltip: string }
export interface RTableCol { name: string; total: string; totalLabel: string; formula: string }
export interface RFilterCol { col: number; values: string[]; custom: { op: string; val: string }[]; top10: boolean; dynamic: string }
export interface RSort { ref: string; by: { ref: string; desc: boolean }[] }
export interface RTable { name: string; ref: string; header: boolean; totals: boolean; style: string; rowStripes: boolean; colStripes: boolean; firstCol: boolean; lastCol: boolean; cols: RTableCol[]; filterOn: boolean; filters: RFilterCol[]; sort: RSort | null }
export interface RSeries { name: string; nameRef: string; cat: string; val: string; labels: boolean; trend: boolean }
export interface RAxis { kind: string; title: string; hasTitle: boolean; deleted: boolean; gridlines: boolean }
export interface RChart {
  types: string[]; barDir: string; grouping: string; title: string; hasTitle: boolean; legend: string; hasLegend: boolean; axes: RAxis[]; series: RSeries[];
  labels: boolean; dataTable: boolean; style: number; alt: string; altTitle: string; name: string; from: { r: number; c: number } | null; to: { r: number; c: number } | null; ex: boolean;
}
export interface RSpark { type: string; loc: string; data: string }
export interface RSheet {
  name: string; hidden: boolean; tabColor: string; chartSheet: boolean; cells: Record<string, RCell>; merges: string[];
  cols: { min: number; max: number; width: number; hidden: boolean }[]; rows: Record<number, { ht: number; hidden: boolean }>; defaultColWidth: number; defaultRowHeight: number;
  freeze: { rows: number; cols: number } | null; split: boolean; view: { showFormulas: boolean; gridLines: boolean; headings: boolean; zoom: number; mode: string };
  page: { orientation: string; scale: number; fitToPage: boolean; fitW: number; fitH: number; paper: number; hCenter: boolean; vCenter: boolean; gridLines: boolean; headings: boolean; margins: Record<string, number> };
  header: string; footer: string; printArea: string; printTitleRows: string; printTitleCols: string; rowBreaks: number[];
  cf: RCf[]; links: RLink[]; notes: { ref: string; text: string }[]; tables: RTable[]; charts: RChart[]; sparks: RSpark[]; filter: { ref: string; cols: RFilterCol[] } | null; sort: RSort | null;
  validations: { ref: string; type: string; formula1: string }[];
}
export interface RBook { sheets: RSheet[]; names: { name: string; ref: string; sheet: string }[]; props: Record<string, string>; active: number; files: string[] }

type X = Record<string, unknown> | undefined;
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', attributesGroupName: '$', removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, trimValues: false, textNodeName: '#' });
const arr = <T = X>(x: unknown): T[] => (x === undefined || x === null || x === '' ? [] : Array.isArray(x) ? x : [x]) as T[];
const at = (n: unknown, k: string): string => String(((n as X)?.$ as Record<string, string> | undefined)?.[k] ?? '');
const ch = (n: unknown, ...path: string[]): X => { let c = n as X; for (const p of path) { if (c === undefined || c === null) return undefined; const v = (c as Record<string, unknown>)[p]; c = (Array.isArray(v) ? v[0] : v) as X; } return typeof c === 'object' ? c : undefined; };
const has = (n: unknown, k: string) => !!n && typeof n === 'object' && (n as Record<string, unknown>)[k] !== undefined;
const txt = (n: unknown): string => (n === undefined || n === null ? '' : typeof n === 'string' ? n : typeof n === 'object' ? String((n as Record<string, unknown>)['#'] ?? '') : String(n));
const on = (v: string, dflt = false) => (v === '' ? dflt : v === '1' || v === 'true');
const num = (v: string, d = 0) => (v === '' || isNaN(Number(v)) ? d : Number(v));
const val = (n: unknown, k: string) => at(ch(n, k), 'val');

const dir = (p: string) => p.slice(0, p.lastIndexOf('/') + 1);
function resolve(base: string, target: string) {
  if (target.startsWith('/')) return target.slice(1);
  const out: string[] = [];
  for (const s of (dir(base) + target).split('/')) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); }
  return out.join('/');
}
const relsPath = (p: string) => dir(p) + '_rels/' + p.slice(p.lastIndexOf('/') + 1) + '.rels';

// 共有数式を ずらす（$ の付いていない 行・列だけ）。文字列（"…"）・シート名（'…'!）・関数名（LOG10( など）は触らない
export function colNo(s: string) { let c = 0; for (const x of s) c = c * 26 + (x.charCodeAt(0) - 64); return c; }
export function colName(n: number) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
export function shiftFormula(f: string, dr: number, dc: number) {
  return f.replace(/"[^"]*"|'[^']*'|(?<![A-Za-z0-9_.])(\$?)([A-Z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_(!])/g, (m, a, col, b, row) => {
    if (col === undefined) return m;
    const c = a ? col : colName(colNo(col) + dc); const r = b ? row : String(Number(row) + dr);
    return a + c + b + r;
  });
}
export function a1(addr: string) { const m = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(addr.toUpperCase()); return m ? { c: colNo(m[1]), r: Number(m[2]) } : null; }

const BUILTIN_FMT: Record<number, string> = { 0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 5: '"¥"#,##0;"¥"-#,##0', 6: '"¥"#,##0;[Red]"¥"-#,##0', 7: '"¥"#,##0.00;"¥"-#,##0.00', 8: '"¥"#,##0.00;[Red]"¥"-#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??', 14: 'yyyy/m/d', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'yyyy/m/d h:mm', 37: '#,##0;-#,##0', 38: '#,##0;[Red]-#,##0', 39: '#,##0.00;-#,##0.00', 40: '#,##0.00;[Red]-#,##0.00', 41: '_ * #,##0_ ;_ * -#,##0_ ', 42: '_ "¥"* #,##0_ ;_ "¥"* -#,##0_ ', 43: '_ * #,##0.00_ ', 44: '_ "¥"* #,##0.00_ ', 49: '@', 55: 'yyyy"年"m"月"', 56: 'm"月"d"日"', 57: 'ge.m.d', 58: 'ggge"年"m"月"d"日"', 31: 'yyyy"年"m"月"d"日"', 30: 'm/d/yy', 27: 'ge.m.d', 28: 'ggge"年"m"月"d"日"' };
const BUILTIN_STYLE: Record<string, string> = { 0: '標準', 3: '桁区切り [0.00]', 4: '通貨 [0.00]', 5: 'パーセント', 6: '桁区切り', 7: '通貨', 8: 'ハイパーリンク', 9: '表示済みのハイパーリンク', 10: 'メモ', 11: '警告文', 15: 'タイトル', 16: '見出し 1', 17: '見出し 2', 18: '見出し 3', 19: '見出し 4', 20: '入力', 21: '出力', 22: '計算', 23: 'チェック セル', 24: 'リンク セル', 25: '集計', 26: '良い', 27: '悪い', 28: 'どちらでもない', 53: '説明文' };
const INDEXED = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080'];
const BLANK: RStyle = { numFmtId: 0, numFmt: 'General', bold: false, italic: false, underline: false, strike: false, size: 11, font: '', color: '', fill: '', h: '', v: '', wrap: false, indent: 0, rot: 0, shrink: false, border: { l: '', r: '', t: '', b: '' }, name: '' };

export function readXlsx(buf: Uint8Array): RBook {
  let total = 0;
  const zip = unzipSync(buf, { filter: (f) => { total += f.originalSize; if (total > 30_000_000) throw new Error('too large'); return /\.(xml|rels|vml)$/i.test(f.name) && f.originalSize < 12_000_000; } });
  const files = Object.keys(zip);
  const cache = new Map<string, X>();
  const xml = (p: string): X => { if (!cache.has(p)) cache.set(p, zip[p] ? (parser.parse(strFromU8(zip[p])) as X) : undefined); return cache.get(p); };
  const rels = (p: string) => { const out: Record<string, { target: string; type: string; ext: boolean }> = {}; for (const r of arr(ch(xml(relsPath(p)), 'Relationships')?.Relationship)) out[at(r, 'Id')] = { target: at(r, 'TargetMode') === 'External' ? at(r, 'Target') : resolve(p, at(r, 'Target')), type: at(r, 'Type').split('/').pop() || '', ext: at(r, 'TargetMode') === 'External' }; return out; };

  // テーマの色（lt1, dk1, lt2, dk2, accent1〜6, hlink, folHlink の順で引く）
  const themeFile = files.find((f) => /^xl\/theme\/theme\d*\.xml$/.test(f));
  const scheme = ch(themeFile ? xml(themeFile) : undefined, 'theme', 'themeElements', 'clrScheme');
  const themeColors = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map((k) => { const n = ch(scheme, k); return (val(n, 'srgbClr') || at(ch(n, 'sysClr'), 'lastClr') || '').toUpperCase(); });
  const color = (c: X): string => {
    if (!c) return '';
    const rgb = at(c, 'rgb'); if (rgb) return rgb.slice(-6).toUpperCase();
    const th = at(c, 'theme'); if (th !== '') return themeColors[Number(th)] || 'THEME' + th;
    const ix = at(c, 'indexed'); if (ix !== '') return Number(ix) >= 64 ? '' : INDEXED[Number(ix)] || '';
    return '';
  };

  // 書式
  const ss = ch(xml('xl/styles.xml'), 'styleSheet');
  const numFmts: Record<number, string> = { ...BUILTIN_FMT };
  for (const n of arr(ch(ss, 'numFmts')?.numFmt)) numFmts[Number(at(n, 'numFmtId'))] = at(n, 'formatCode').replace(/\\/g, '');
  const fonts = arr(ch(ss, 'fonts')?.font); const fills = arr(ch(ss, 'fills')?.fill); const borders = arr(ch(ss, 'borders')?.border);
  const cellXfs = arr(ch(ss, 'cellXfs')?.xf); const styleXfs = arr(ch(ss, 'cellStyleXfs')?.xf);
  // セルのスタイルの名前。組み込みのスタイルは 番号（builtinId）から 日本語の名前にそろえる（英語の Excel で保存すると 'Heading 2' などになるため）
  const styleNames: Record<string, string> = {}; for (const c of arr(ch(ss, 'cellStyles')?.cellStyle)) styleNames[at(c, 'xfId')] = BUILTIN_STYLE[at(c, 'builtinId')] || at(c, 'name');
  const dxfs = arr(ch(ss, 'dxfs')?.dxf);
  const fontOf = (f: X) => ({ bold: has(f, 'b') && val(f, 'b') !== '0', italic: has(f, 'i') && val(f, 'i') !== '0', underline: has(f, 'u') && val(f, 'u') !== 'none', strike: has(f, 'strike') && val(f, 'strike') !== '0', size: num(val(f, 'sz'), 11), font: val(f, 'name'), color: color(ch(f, 'color')) });
  const fillOf = (f: X) => { const p = ch(f, 'patternFill'); const t = at(p, 'patternType'); return !p || t === 'none' || t === '' && !has(p, 'fgColor') && !has(p, 'bgColor') ? '' : color(ch(p, 'fgColor')) || color(ch(p, 'bgColor')) || (t === 'solid' ? '000000' : ''); };
  const styleCache = new Map<number, RStyle>();
  const styleOf = (i: number): RStyle => {
    if (styleCache.has(i)) return styleCache.get(i)!;
    const xf = cellXfs[i]; if (!xf) return BLANK;
    const id = num(at(xf, 'numFmtId')); const b = borders[num(at(xf, 'borderId'))]; const al = ch(xf, 'alignment');
    const s: RStyle = {
      numFmtId: id, numFmt: numFmts[id] ?? 'General', ...fontOf(fonts[num(at(xf, 'fontId'))]), fill: fillOf(fills[num(at(xf, 'fillId'))]),
      h: at(al, 'horizontal'), v: at(al, 'vertical'), wrap: on(at(al, 'wrapText')), indent: num(at(al, 'indent')), rot: num(at(al, 'textRotation')), shrink: on(at(al, 'shrinkToFit')),
      border: { l: at(ch(b, 'left'), 'style'), r: at(ch(b, 'right'), 'style'), t: at(ch(b, 'top'), 'style'), b: at(ch(b, 'bottom'), 'style') },
      name: styleNames[at(xf, 'xfId') || '0'] || '',
    };
    void styleXfs; styleCache.set(i, s); return s;
  };

  // 共有文字列
  const sst = arr(ch(xml('xl/sharedStrings.xml'), 'sst')?.si).map((si) => (has(si, 't') ? txt((si as Record<string, unknown>).t) : arr(si?.r).map((r) => txt((r as Record<string, unknown>).t)).join('')));
  const rich = (n: X) => arr(n?.p).map((p) => arr(p?.r).map((r) => txt((r as Record<string, unknown>).t)).concat(arr(p?.fld).map((r) => txt((r as Record<string, unknown>).t))).join('')).join('\n');

  const wb = ch(xml('xl/workbook.xml'), 'workbook'); const wbRels = rels('xl/workbook.xml');
  const sheetDefs = arr(ch(wb, 'sheets')?.sheet).map((s) => ({ name: at(s, 'name'), hidden: at(s, 'state') !== '' && at(s, 'state') !== 'visible', rel: wbRels[at(s, 'id')] }));
  const cleanF = (f: string) => f.replace(/_xlfn\.|_xlws\.|_xlpm\./g, '');

  const filterCols = (af: X): RFilterCol[] => arr(af?.filterColumn).map((fc) => ({
    col: num(at(fc, 'colId')), values: arr(ch(fc, 'filters')?.filter).map((f) => at(f, 'val')).concat(arr(ch(fc, 'filters')?.dateGroupItem).map((f) => [at(f, 'year'), at(f, 'month'), at(f, 'day')].filter(Boolean).join('/'))),
    custom: arr(ch(fc, 'customFilters')?.customFilter).map((f) => ({ op: at(f, 'operator') || 'equal', val: at(f, 'val') })), top10: has(fc, 'top10'), dynamic: at(ch(fc, 'dynamicFilter'), 'type'),
  }));
  const sortOf = (st: X): RSort | null => (st ? { ref: at(st, 'ref'), by: arr(st.sortCondition).map((c) => ({ ref: at(c, 'ref'), desc: on(at(c, 'descending')) })) } : null);

  function readChart(path: string): Omit<RChart, 'alt' | 'altTitle' | 'name' | 'from' | 'to'> {
    const cs = ch(xml(path), 'chartSpace'); const c = ch(cs, 'chart'); const pa = ch(c, 'plotArea');
    const blank = { types: [] as string[], barDir: '', grouping: '', title: '', hasTitle: false, legend: '', hasLegend: false, axes: [] as RAxis[], series: [] as RSeries[], labels: false, dataTable: false, style: 0, ex: false };
    if (!c) return blank;
    const title = ch(c, 'title'); const titleText = title ? rich(ch(title, 'tx', 'rich')) || arr(ch(title, 'tx', 'txData')?.v).map(txt).join('') : '';
    if (has(pa, 'plotAreaRegion')) {   // 新しい種類のグラフ（ウォーターフォール・ツリーマップ・ヒストグラム など）
      const sers = arr(ch(pa, 'plotAreaRegion')?.series);
      return { ...blank, ex: true, types: [...new Set(sers.map((s) => at(s, 'layoutId')))], title: titleText, hasTitle: !!title, hasLegend: has(c, 'legend'), legend: at(ch(c, 'legend'), 'pos'), series: sers.map(() => ({ name: '', nameRef: '', cat: '', val: '', labels: false, trend: false })) };
    }
    const types: string[] = []; const series: RSeries[] = []; let barDir = '', grouping = '', labels = false;
    const lbl = (d: X) => !!d && val(d, 'delete') !== '1' && ['showVal', 'showPercent', 'showCatName', 'showSerName'].some((k) => val(d, k) === '1');
    for (const [k, v] of Object.entries(pa || {})) {
      if (!/Chart$/.test(k)) continue;
      for (const g of arr(v)) {
        types.push(k.replace(/Chart$/, '')); barDir = barDir || val(g, 'barDir'); grouping = grouping || val(g, 'grouping');
        if (lbl(ch(g, 'dLbls'))) labels = true;
        for (const s of arr(g?.ser)) {
          const tx = ch(s, 'tx'); const catN = ch(s, 'cat') || ch(s, 'xVal'); const valN = ch(s, 'val') || ch(s, 'yVal');
          const sl = lbl(ch(s, 'dLbls')); if (sl) labels = true;
          series.push({ name: arr(ch(tx, 'strRef', 'strCache')?.pt).map((p) => txt((p as Record<string, unknown>).v)).join('') || txt(tx?.v), nameRef: txt(ch(tx, 'strRef')?.f), cat: txt((ch(catN, 'strRef') || ch(catN, 'numRef') || ch(catN, 'multiLvlStrRef'))?.f), val: txt(ch(valN, 'numRef')?.f), labels: sl, trend: has(s, 'trendline') });
        }
      }
    }
    const axes: RAxis[] = [];
    for (const k of ['catAx', 'valAx', 'dateAx', 'serAx']) for (const a of arr(pa?.[k])) { const t = ch(a, 'title'); axes.push({ kind: k === 'valAx' ? 'val' : 'cat', title: t ? rich(ch(t, 'tx', 'rich')) : '', hasTitle: !!t, deleted: val(a, 'delete') === '1', gridlines: has(a, 'majorGridlines') }); }
    // 散布図は 軸が2本とも valAx。横（下）に置かれた方を cat として扱う
    if (axes.length >= 2 && axes.every((a) => a.kind === 'val')) { const pos = arr(pa?.valAx).map((a) => val(a, 'axPos')); const i = pos.findIndex((p) => p === 'b' || p === 't'); if (i >= 0) axes[i].kind = 'cat'; }
    const styleN = num(val(cs, 'style')) || num(val(ch(cs, 'AlternateContent', 'Choice'), 'style')) || num(val(ch(cs, 'AlternateContent', 'Fallback'), 'style'));
    const hasTitle = !!title || (val(c, 'autoTitleDeleted') !== '1' && !title && false);
    return { types, barDir, grouping, title: titleText, hasTitle, legend: val(ch(c, 'legend'), 'legendPos'), hasLegend: has(c, 'legend'), axes, series, labels, dataTable: has(pa, 'dTable'), style: styleN, ex: false };
  }
  function readDrawing(path: string): RChart[] {
    const out: RChart[] = []; const dr = ch(xml(path), 'wsDr'); const r = rels(path);
    for (const k of ['twoCellAnchor', 'oneCellAnchor', 'absoluteAnchor']) for (const an of arr(dr?.[k])) {
      const gf = ch(an, 'graphicFrame') || ch(an, 'AlternateContent', 'Choice', 'graphicFrame'); if (!gf) continue;
      const gd = ch(gf, 'graphic', 'graphicData'); const id = at(ch(gd, 'chart'), 'id'); if (!id || !r[id]) continue;
      const pr = ch(gf, 'nvGraphicFramePr', 'cNvPr'); const pt = (n: X) => (n ? { r: num(txt(n.row)) + 1, c: num(txt(n.col)) + 1 } : null);
      out.push({ ...readChart(r[id].target), alt: at(pr, 'descr'), altTitle: at(pr, 'title'), name: at(pr, 'name'), from: pt(ch(an, 'from')), to: pt(ch(an, 'to')) });
    }
    return out;
  }
  function readTable(path: string): RTable {
    const t = ch(xml(path), 'table'); const si = ch(t, 'tableStyleInfo'); const af = ch(t, 'autoFilter');
    return {
      name: at(t, 'displayName') || at(t, 'name'), ref: at(t, 'ref'), header: at(t, 'headerRowCount') !== '0', totals: num(at(t, 'totalsRowCount')) > 0, style: at(si, 'name'),
      rowStripes: on(at(si, 'showRowStripes')), colStripes: on(at(si, 'showColumnStripes')), firstCol: on(at(si, 'showFirstColumn')), lastCol: on(at(si, 'showLastColumn')),
      cols: arr(ch(t, 'tableColumns')?.tableColumn).map((c) => ({ name: at(c, 'name').replace(/_x000a_/gi, '\n'), total: at(c, 'totalsRowFunction'), totalLabel: at(c, 'totalsRowLabel'), formula: cleanF(txt(c?.calculatedColumnFormula)) })),
      filterOn: !!af, filters: filterCols(af), sort: sortOf(ch(t, 'sortState') || ch(af, 'sortState')),
    };
  }

  const sheets: RSheet[] = sheetDefs.map((def) => {
    const path = def.rel?.target || ''; const root = xml(path); const chartSheet = !!ch(root, 'chartsheet'); const ws = ch(root, 'worksheet') || ch(root, 'chartsheet'); const r = path ? rels(path) : {};
    const view = arr(ch(ws, 'sheetViews')?.sheetView)[0]; const pane = ch(view, 'pane'); const ps = ch(ws, 'pageSetup'); const po = ch(ws, 'printOptions'); const pm = ch(ws, 'pageMargins'); const hf = ch(ws, 'headerFooter');
    const sh: RSheet = {
      name: def.name, hidden: def.hidden, tabColor: color(ch(ws, 'sheetPr', 'tabColor')), chartSheet, cells: {}, merges: arr(ch(ws, 'mergeCells')?.mergeCell).map((m) => at(m, 'ref')),
      cols: arr(ch(ws, 'cols')?.col).map((c) => ({ min: num(at(c, 'min')), max: num(at(c, 'max')), width: num(at(c, 'width')), hidden: on(at(c, 'hidden')) })), rows: {},
      defaultColWidth: num(at(ch(ws, 'sheetFormatPr'), 'defaultColWidth'), 8.43), defaultRowHeight: num(at(ch(ws, 'sheetFormatPr'), 'defaultRowHeight'), 18.75),
      freeze: pane && /frozen/i.test(at(pane, 'state')) ? { rows: num(at(pane, 'ySplit')), cols: num(at(pane, 'xSplit')) } : null, split: !!pane && !/frozen/i.test(at(pane, 'state')),
      view: { showFormulas: on(at(view, 'showFormulas')), gridLines: on(at(view, 'showGridLines'), true), headings: on(at(view, 'showRowColHeaders'), true), zoom: num(at(view, 'zoomScale'), 100), mode: at(view, 'view') || 'normal' },
      page: { orientation: at(ps, 'orientation') || 'portrait', scale: num(at(ps, 'scale'), 100), fitToPage: on(at(ch(ws, 'sheetPr', 'pageSetUpPr'), 'fitToPage')), fitW: num(at(ps, 'fitToWidth'), 1), fitH: num(at(ps, 'fitToHeight'), 1), paper: num(at(ps, 'paperSize'), 9), hCenter: on(at(po, 'horizontalCentered')), vCenter: on(at(po, 'verticalCentered')), gridLines: on(at(po, 'gridLines')), headings: on(at(po, 'headings')), margins: Object.fromEntries(['left', 'right', 'top', 'bottom', 'header', 'footer'].map((k) => [k, num(at(pm, k))])) },
      header: txt(hf?.oddHeader), footer: txt(hf?.oddFooter), printArea: '', printTitleRows: '', printTitleCols: '', rowBreaks: arr(ch(ws, 'rowBreaks')?.brk).map((b) => num(at(b, 'id'))),
      cf: [], links: [], notes: [], tables: [], charts: [], sparks: [], filter: ch(ws, 'autoFilter') ? { ref: at(ch(ws, 'autoFilter'), 'ref'), cols: filterCols(ch(ws, 'autoFilter')) } : null, sort: sortOf(ch(ws, 'sortState') || ch(ws, 'autoFilter', 'sortState')),
      validations: arr(ch(ws, 'dataValidations')?.dataValidation).map((d) => ({ ref: at(d, 'sqref'), type: at(d, 'type'), formula1: txt(d?.formula1) })),
    };
    // セル
    const shared: Record<string, { f: string; r: number; c: number }> = {};
    for (const row of arr(ch(ws, 'sheetData')?.row)) {
      const rn = num(at(row, 'r')); if (at(row, 'ht') || on(at(row, 'hidden'))) sh.rows[rn] = { ht: num(at(row, 'ht')), hidden: on(at(row, 'hidden')) };
      for (const c of arr(row?.c)) {
        const ref = at(c, 'r'); const p = a1(ref); if (!p) continue; const t = at(c, 't'); const raw = has(c, 'v') ? txt((c as Record<string, unknown>).v) : null;
        let f = '', ar = '';
        if (has(c, 'f')) {
          const fn = (c as Record<string, unknown>).f; f = txt(fn); const si = at(fn, 'si');
          if (at(fn, 't') === 'shared' && si !== '') { if (f) shared[si] = { f, r: p.r, c: p.c }; else if (shared[si]) f = shiftFormula(shared[si].f, p.r - shared[si].r, p.c - shared[si].c); }
          if (at(fn, 't') === 'array') ar = at(fn, 'ref');
          f = cleanF(f);
        }
        const v = raw === null ? (t === 'inlineStr' ? rich({ p: { r: ch(c, 'is')?.r } }) || txt(ch(c, 'is')?.t) : null) : t === 's' ? sst[Number(raw)] ?? '' : t === 'b' ? raw === '1' : t === 'str' || t === 'e' ? raw : isNaN(Number(raw)) ? raw : Number(raw);
        const s = styleOf(num(at(c, 's')));
        if (v === null && !f && s === styleOf(0)) continue;
        sh.cells[ref] = { v, f, t, s, arr: ar };
      }
    }
    // 条件付き書式（2010 以降の拡張ぶんも）
    const cfRule = (ref: string, rule: X, ext = false): RCf => {
      const d = ext ? ch(rule, 'dxf') : dxfs[num(at(rule, 'dxfId'), -1)]; const type = at(rule, 'type');
      return { ref, type, operator: at(rule, 'operator'), formulas: arr<unknown>(rule?.formula).concat(arr<unknown>(rule?.f)).map(txt), rank: num(at(rule, 'rank')), percent: on(at(rule, 'percent')), bottom: on(at(rule, 'bottom')), aboveAverage: on(at(rule, 'aboveAverage'), true), text: at(rule, 'text'), kind: has(rule, 'colorScale') ? 'colorScale' : has(rule, 'dataBar') ? 'dataBar' : has(rule, 'iconSet') ? 'iconSet:' + at(ch(rule, 'iconSet'), 'iconSet') : type, fill: d ? color(ch(d, 'fill', 'patternFill', 'bgColor')) || color(ch(d, 'fill', 'patternFill', 'fgColor')) : '', color: d ? color(ch(d, 'font', 'color')) : '', bold: !!d && has(ch(d, 'font'), 'b') };
    };
    for (const g of arr(ws?.conditionalFormatting)) for (const rule of arr(g?.cfRule)) sh.cf.push(cfRule(at(g, 'sqref'), rule));
    for (const ext of arr(ch(ws, 'extLst')?.ext)) {
      for (const g of arr(ch(ext, 'conditionalFormattings')?.conditionalFormatting)) for (const rule of arr(g?.cfRule)) { const ref = txt(g?.sqref); const r2 = cfRule(ref, rule, true); if (!sh.cf.some((x) => x.ref === ref && x.kind.split(':')[0] === r2.kind.split(':')[0])) sh.cf.push(r2); }
      for (const g of arr(ch(ext, 'sparklineGroups')?.sparklineGroup)) for (const s of arr(ch(g, 'sparklines')?.sparkline)) sh.sparks.push({ type: at(g, 'type') || 'line', loc: txt(s?.sqref), data: txt(s?.f) });
    }
    for (const l of arr(ch(ws, 'hyperlinks')?.hyperlink)) sh.links.push({ ref: at(l, 'ref'), target: r[at(l, 'id')]?.target || '', location: at(l, 'location'), display: at(l, 'display'), tooltip: at(l, 'tooltip') });
    for (const tp of arr(ch(ws, 'tableParts')?.tablePart)) { const rel = r[at(tp, 'id')]; if (rel) sh.tables.push(readTable(rel.target)); }
    for (const [, rel] of Object.entries(r)) {
      if (rel.type === 'comments') for (const c of arr(ch(xml(rel.target), 'comments', 'commentList')?.comment)) sh.notes.push({ ref: at(c, 'ref'), text: rich({ p: { r: ch(c, 'text')?.r } }) || txt(ch(c, 'text')?.t) });
      if (rel.type === 'threadedComment') for (const c of arr(ch(xml(rel.target), 'ThreadedComments')?.threadedComment)) if (!sh.notes.some((n) => n.ref === at(c, 'ref'))) sh.notes.push({ ref: at(c, 'ref'), text: txt(c?.text) });
      if (rel.type === 'drawing') sh.charts.push(...readDrawing(rel.target));
    }
    return sh;
  });

  const names: RBook['names'] = []; let marker = '';
  for (const d of arr(ch(wb, 'definedNames')?.definedName)) {
    const name = at(d, 'name'); const ref = txt(d); const local = at(d, 'localSheetId'); const sh = local !== '' ? sheets[Number(local)] : undefined;
    if (name === '_xlnm.Print_Area' && sh) sh.printArea = ref.replace(/^.*!/, '').replace(/\$/g, '');
    else if (name === '_xlnm.Print_Titles' && sh) { for (const part of ref.split(',')) { const x = part.replace(/^.*!/, '').replace(/\$/g, ''); if (/^\d+:\d+$/.test(x)) sh.printTitleRows = x; else sh.printTitleCols = x; } }
    else if (name === '_bdsh') marker = ref.replace(/"/g, '');
    else if (!name.startsWith('_xlnm.') && !on(at(d, 'hidden'))) names.push({ name, ref, sheet: sh?.name || '' });
  }
  const core = ch(xml('docProps/core.xml'), 'coreProperties'); const app = ch(xml('docProps/app.xml'), 'Properties');
  const props: Record<string, string> = {};
  for (const k of ['title', 'subject', 'creator', 'keywords', 'description', 'category', 'contentStatus', 'lastModifiedBy']) props[k] = txt(core?.[k]);
  for (const k of ['Company', 'Manager', 'Application', 'AppVersion']) props[k.toLowerCase()] = txt(app?.[k]);
  for (const p of arr(ch(xml('docProps/custom.xml'), 'Properties')?.property)) props['custom:' + at(p, 'name')] = Object.entries(p || {}).filter(([k]) => k !== '$' && k !== '#').map(([, v]) => txt(v)).join('');
  props.bdsh = marker;
  return { sheets, names, props, active: num(at(arr(ch(wb, 'bookViews')?.workbookView)[0], 'activeTab')), files };
}
