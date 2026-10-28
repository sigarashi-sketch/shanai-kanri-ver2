// 関数道場（lib/dojo）の「式を計算するしくみ」。スプレッドシートを開かずに、画面の中の小さい表で 式の結果を出す。
//   ブラウザ（打っている途中の結果を見せる）と サーバ（答え合わせ）の両方が使う。正解は ここには無い
//   ・表（grid）は A1 からの2次元。セルが '=' で始まる文字なら 式（こわれた式を直す問題で使う）
//   ・結果が 表（複数セル）になる式は、そのセルから 右と下へ広がる（スプレッドシートと同じ）
//   ・使える関数は FUNCS にあるものだけ（QUERY・IMPORTRANGE・正規表現は無い）。無い関数は #NAME?
//   ・Google スプレッドシートとの ちがいを減らすため: 範囲どうしの計算（B2:B6*C2:C6）は ARRAYFORMULA・SUMPRODUCT・FILTER・SORT の中でだけ通す（外では #VALUE!）
//   ・答えは 本物のスプレッドシートと突き合わせて確かめる（tools/dojo-verify.ts）
export type Cell = string | number;
export class Err { constructor(public code: string) {} }
export type Scalar = number | string | boolean | Err | null;   // null = 空のセル
export type Val = Scalar | Scalar[][];
const E = (code: string) => new Err(code);
const isArr = (v: Val): v is Scalar[][] => Array.isArray(v);

// ---- 字句
type Tok = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'id'; v: string } | { t: 'ref'; v: string } | { t: 'op'; v: string };
// 文字列（" "）の外だけ 全角 → 半角（日本語入力のまま打っても通るように）
export function normalize(src: string): string {
  let out = ''; let inStr = false;
  for (const ch0 of String(src || '').trim()) {
    const ch = ch0 === '“' || ch0 === '”' || ch0 === '＂' ? '"' : ch0;
    if (ch === '"') { inStr = !inStr; out += ch; continue; }
    out += inStr ? ch : ch.normalize('NFKC');
  }
  return out;
}
function lex(src: string): Tok[] {
  const s = src; const out: Tok[] = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"') { let j = i + 1; let v = ''; for (;;) { if (j >= s.length) throw E('#ERROR!'); if (s[j] === '"') { if (s[j + 1] === '"') { v += '"'; j += 2; continue; } break; } v += s[j++]; } out.push({ t: 'str', v }); i = j + 1; continue; }
    const num = /^\d+(\.\d+)?%?/.exec(s.slice(i));
    if (num) { out.push({ t: 'num', v: num[0].endsWith('%') ? parseFloat(num[0]) / 100 : parseFloat(num[0]) }); i += num[0].length; continue; }
    const ref = /^\$?[A-Za-z]{1,2}\$?\d+(:\$?[A-Za-z]{1,2}\$?\d+)?(?![A-Za-z0-9_(])/.exec(s.slice(i));
    if (ref) { out.push({ t: 'ref', v: ref[0].replace(/\$/g, '').toUpperCase() }); i += ref[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(s.slice(i));
    if (id) { out.push({ t: 'id', v: id[0].toUpperCase() }); i += id[0].length; continue; }
    const op = /^(<>|<=|>=|[-+*/^&=<>(),])/.exec(s.slice(i));
    if (op) { out.push({ t: 'op', v: op[0] }); i += op[0].length; continue; }
    throw E('#ERROR!');
  }
  return out;
}

// ---- 構文
type Node = { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 'bool'; v: boolean } | { k: 'ref'; v: string } | { k: 'un'; op: string; a: Node } | { k: 'bin'; op: string; a: Node; b: Node } | { k: 'fn'; name: string; args: Node[] };
function parse(toks: Tok[]): Node {
  let p = 0;
  const peek = () => toks[p]; const isOp = (v: string) => peek()?.t === 'op' && peek().v === v;
  const eat = (v: string) => { if (!isOp(v)) throw E('#ERROR!'); p++; };
  const bin = (next: () => Node, ops: string[]) => () => { let a = next(); while (peek()?.t === 'op' && ops.includes(String(peek().v))) { const op = String(toks[p++].v); a = { k: 'bin', op, a, b: next() }; } return a; };
  const prim = (): Node => {
    const t = toks[p++]; if (!t) throw E('#ERROR!');
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'str') return { k: 'str', v: t.v };
    if (t.t === 'ref') return { k: 'ref', v: t.v };
    if (t.t === 'op' && t.v === '(') { const n = cmp(); eat(')'); return n; }
    if (t.t === 'id') {
      if (!isOp('(')) { if (t.v === 'TRUE' || t.v === 'FALSE') return { k: 'bool', v: t.v === 'TRUE' }; throw E('#NAME?'); }
      p++; const args: Node[] = [];
      if (isOp(')')) { p++; return { k: 'fn', name: t.v, args }; }
      for (;;) { args.push(cmp()); if (isOp(',')) { p++; continue; } eat(')'); break; }
      return { k: 'fn', name: t.v, args };
    }
    throw E('#ERROR!');
  };
  const unary = (): Node => (peek()?.t === 'op' && (peek().v === '-' || peek().v === '+') ? { k: 'un', op: String(toks[p++].v), a: unary() } : prim());
  const pow = bin(unary, ['^']); const mul = bin(pow, ['*', '/']); const add = bin(mul, ['+', '-']); const cat = bin(add, ['&']);
  const cmp: () => Node = bin(cat, ['=', '<>', '<', '>', '<=', '>=']);
  const n = cmp(); if (p < toks.length) throw E('#ERROR!');
  return n;
}

// ---- 値の変換
const num = (v: Scalar): number => {
  if (v instanceof Err) throw v;
  if (v === null || v === '') return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/,/g, '')); if (String(v).trim() === '' || isNaN(n)) throw E('#VALUE!'); return n;
};
const str = (v: Scalar): string => { if (v instanceof Err) throw v; return v === null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : typeof v === 'number' ? String(Math.round(v * 1e10) / 1e10) : v; };
const bool = (v: Scalar): boolean => { if (v instanceof Err) throw v; if (typeof v === 'string') { if (/^true$/i.test(v)) return true; if (/^false$/i.test(v)) return false; throw E('#VALUE!'); } return !!v; };
const eq = (a: Scalar, b: Scalar): boolean => {
  if (a === null) a = typeof b === 'number' ? 0 : typeof b === 'boolean' ? false : ''; if (b === null) b = typeof a === 'number' ? 0 : typeof a === 'boolean' ? false : '';
  return typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a === b;
};
const rank = (v: Scalar) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3);
const cmpS = (a: Scalar, b: Scalar): number => {
  if (a === null) a = typeof b === 'string' ? '' : 0; if (b === null) b = typeof a === 'string' ? '' : 0;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (typeof a === 'string') { const x = a.toLowerCase(), y = String(b).toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
  return Number(a) - Number(b);
};
const flat = (v: Val): Scalar[] => (isArr(v) ? v.flat() : [v]);
const one = (v: Val): Scalar => { if (isArr(v)) { if (v.length === 1 && v[0].length === 1) return v[0][0]; throw E('#VALUE!'); } return v; };
const grid2 = (v: Val): Scalar[][] => (isArr(v) ? v : [[v]]);
// 条件（COUNTIF などの ">=10" "営業部" "山*"）
function crit(c: Scalar): (v: Scalar) => boolean {
  if (c instanceof Err) throw c;
  if (typeof c !== 'string') return (v) => v !== null && eq(v, c);
  const m = /^(<>|<=|>=|=|<|>)(.*)$/.exec(c); const op = m ? m[1] : '='; const raw = m ? m[2] : c;
  const n = raw.trim() !== '' && !isNaN(Number(raw)) ? Number(raw) : null;
  if (op === '=' || op === '<>') {
    const re = /[*?]/.test(raw) ? new RegExp('^' + raw.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i') : null;
    const hit = (v: Scalar) => (n !== null ? (typeof v === 'number' ? v === n : typeof v === 'string' && v.trim() !== '' && Number(v) === n) : re ? typeof v === 'string' && re.test(v) : str(v instanceof Err ? '' : v).toLowerCase() === raw.toLowerCase());
    return op === '=' ? hit : (v) => !hit(v);
  }
  return (v) => { if (n !== null) { if (typeof v !== 'number') return false; return op === '<' ? v < n : op === '>' ? v > n : op === '<=' ? v <= n : v >= n; } if (typeof v !== 'string') return false; const k = cmpS(v, raw); return op === '<' ? k < 0 : op === '>' ? k > 0 : op === '<=' ? k <= 0 : k >= 0; };
}
const round = (x: number, d: number, mode: 'r' | 'u' | 'd') => { const f = 10 ** d; const y = Math.abs(x) * f; const r = mode === 'r' ? Math.round(y + 1e-9) : mode === 'u' ? Math.ceil(y - 1e-9) : Math.floor(y + 1e-9); return (Math.sign(x) * r) / f; };

// ---- 計算
const a1 = (s: string) => { const m = /^([A-Z]+)(\d+)$/.exec(s)!; let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return { r: Number(m[2]) - 1, c: c - 1 }; };
export const addr = (r: number, c: number) => String.fromCharCode(65 + c) + (r + 1);
const ARRAY_FN = new Set(['ARRAYFORMULA', 'SUMPRODUCT', 'FILTER', 'SORT']);

export class Sheet {
  private memo = new Map<string, Scalar>(); private busy = new Set<string>(); private spill = new Map<string, Scalar>(); private all = false; private filling = false;
  rows: number; cols: number;
  constructor(private grid: Cell[][]) { this.rows = grid.length; this.cols = Math.max(0, ...grid.map((r) => r.length)); }
  // そのセルの値（式なら計算した結果。広がった結果の先も 値が入る）
  get(r: number, c: number): Scalar {
    const raw = this.grid[r]?.[c]; const key = r + ',' + c;
    if (typeof raw === 'string' && raw.startsWith('=')) {
      if (this.memo.has(key)) return this.memo.get(key)!;
      if (this.busy.has(key)) return E('#REF!');
      this.busy.add(key); let v: Val;
      try { v = evalNode(parse(lex(normalize(raw).slice(1))), this, false); } catch (e) { if (e instanceof Err) v = e; else throw e; }
      this.busy.delete(key);
      let top: Scalar;
      if (isArr(v)) {
        // 広がる先に 何か入っていたら #REF!（スプレッドシートと同じ）
        const blocked = v.some((row, i) => row.some((_, k) => (i || k) && this.grid[r + i]?.[c + k] !== undefined && this.grid[r + i][c + k] !== ''));
        if (blocked) top = E('#REF!'); else { v.forEach((row, i) => row.forEach((x, k) => { if (i || k) this.spill.set(r + i + ',' + (c + k), x); })); top = v[0]?.[0] ?? null; this.rows = Math.max(this.rows, r + v.length); this.cols = Math.max(this.cols, c + (v[0]?.length || 0)); }
      } else top = v;
      this.memo.set(key, top); return top;
    }
    if (raw !== undefined && raw !== '') return raw;
    if (!this.all && !this.filling) { this.filling = true; for (let i = 0; i < this.grid.length; i++) for (let k = 0; k < this.grid[i].length; k++) { const x = this.grid[i][k]; if (typeof x === 'string' && x.startsWith('=')) this.get(i, k); } this.filling = false; this.all = true; }
    return this.spill.has(key) ? this.spill.get(key)! : null;
  }
  range(ref: string): Scalar[][] {
    const [s, e] = ref.split(':'); const a = a1(s), b = a1(e || s);
    const out: Scalar[][] = [];
    for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++) { const row: Scalar[] = []; for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) row.push(this.get(r, c)); out.push(row); }
    return out;
  }
  // 表ぜんぶの値（広がった分も入れて）
  values(): Scalar[][] {
    for (let r = 0; r < this.grid.length; r++) for (let c = 0; c < this.grid[r].length; c++) this.get(r, c);
    this.get(this.grid.length, 0);
    return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.cols }, (_, c) => this.get(r, c)));
  }
}

function broadcast(a: Val, b: Val, f: (x: Scalar, y: Scalar) => Scalar, arr: boolean): Val {
  if (!isArr(a) && !isArr(b)) return f(a, b);
  if (!arr) throw E('#VALUE!');
  const A = grid2(a), B = grid2(b); const R = Math.max(A.length, B.length), C = Math.max(A[0]?.length || 0, B[0]?.length || 0);
  const pick = (m: Scalar[][], r: number, c: number): Scalar => { const rr = m.length === 1 ? 0 : r, cc = (m[0]?.length || 0) === 1 ? 0 : c; return rr < m.length && cc < (m[rr]?.length || 0) ? m[rr][cc] : E('#N/A'); };
  return Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => { try { return f(pick(A, r, c), pick(B, r, c)); } catch (e) { if (e instanceof Err) return e; throw e; } }));
}
const OPS: Record<string, (x: Scalar, y: Scalar) => Scalar> = {
  '+': (x, y) => num(x) + num(y), '-': (x, y) => num(x) - num(y), '*': (x, y) => num(x) * num(y),
  '/': (x, y) => { const d = num(y); const n = num(x); if (d === 0) throw E('#DIV/0!'); return n / d; }, '^': (x, y) => num(x) ** num(y), '&': (x, y) => str(x) + str(y),
  '=': (x, y) => { if (x instanceof Err) throw x; if (y instanceof Err) throw y; return eq(x, y); }, '<>': (x, y) => { if (x instanceof Err) throw x; if (y instanceof Err) throw y; return !eq(x, y); },
  '<': (x, y) => cmpS(chk(x), chk(y)) < 0, '>': (x, y) => cmpS(chk(x), chk(y)) > 0, '<=': (x, y) => cmpS(chk(x), chk(y)) <= 0, '>=': (x, y) => cmpS(chk(x), chk(y)) >= 0,
};
function chk(v: Scalar): Scalar { if (v instanceof Err) throw v; return v; }

function evalNode(n: Node, sh: Sheet, arr: boolean): Val {
  switch (n.k) {
    case 'num': case 'str': case 'bool': return n.v;
    case 'ref': return n.v.includes(':') ? sh.range(n.v) : chkRef(sh, n.v);
    case 'un': { const v = evalNode(n.a, sh, arr); return broadcast(v, 0, (x) => (n.op === '-' ? -num(x) : num(x)), arr); }
    case 'bin': return broadcast(evalNode(n.a, sh, arr), evalNode(n.b, sh, arr), OPS[n.op], arr);
    case 'fn': { const f = FUNCS[n.name]; if (!f) throw E('#NAME?'); const inner = arr || ARRAY_FN.has(n.name); return f(n.args, (x) => evalNode(x, sh, inner), inner); }
  }
}
function chkRef(sh: Sheet, ref: string): Scalar { const p = a1(ref); return sh.get(p.r, p.c); }

type Fn = (args: Node[], ev: (n: Node) => Val, arr: boolean) => Val;
const need = (args: Node[], min: number, max = min) => { if (args.length < min || args.length > max) throw E('#N/A'); };
const nums = (vs: Val[]): number[] => vs.flatMap((v) => (isArr(v) ? v.flat().filter((x): x is number | Err => typeof x === 'number' || x instanceof Err).map(num) : [num(v)]));
const agg = (f: (xs: number[]) => number): Fn => (args, ev) => { if (!args.length) throw E('#N/A'); return f(nums(args.map(ev))); };
// SUMIFS 系: 範囲と条件のペアから、合う行（平らにした位置）の一覧
const matchIdx = (pairs: [Scalar[], Scalar][]): number[] => { const n = pairs[0][0].length; const ps = pairs.map(([r, c]) => { if (r.length !== n) throw E('#VALUE!'); return [r, crit(c)] as const; }); const out: number[] = []; for (let i = 0; i < n; i++) if (ps.every(([r, p]) => p(r[i]))) out.push(i); return out; };
const pairsOf = (args: Node[], ev: (n: Node) => Val, from: number): [Scalar[], Scalar][] => { if ((args.length - from) % 2 || args.length - from < 2) throw E('#N/A'); const out: [Scalar[], Scalar][] = []; for (let i = from; i < args.length; i += 2) out.push([flat(ev(args[i])), one(ev(args[i + 1]))]); return out; };
const sumAt = (r: Scalar[], idx: number[]) => idx.reduce((s, i) => s + (typeof r[i] === 'number' ? (r[i] as number) : 0), 0);
// 1列／1行の範囲を 平らに
const vec = (v: Val): Scalar[] => { const g = grid2(v); if (g.length !== 1 && (g[0]?.length || 0) !== 1) throw E('#N/A'); return g.flat(); };
const exactPos = (xs: Scalar[], key: Scalar) => xs.findIndex((x) => x !== null && eq(x, key) && rank(x) === rank(key));
const approxPos = (xs: Scalar[], key: Scalar) => { let hit = -1; for (let i = 0; i < xs.length; i++) { if (xs[i] === null) continue; if (cmpS(xs[i], key) <= 0 && rank(xs[i]) === rank(key)) hit = i; else if (rank(xs[i]) === rank(key)) break; } return hit; };
const text1 = (f: (s: string, ...r: number[]) => Scalar, min: number, max: number): Fn => (args, ev) => { need(args, min, max); const [s, ...r] = args.map((a) => one(ev(a))); return f(str(s), ...r.map(num)); };

export const FUNCS: Record<string, Fn> = {
  SUM: agg((xs) => xs.reduce((s, x) => s + x, 0)),
  AVERAGE: agg((xs) => { if (!xs.length) throw E('#DIV/0!'); return xs.reduce((s, x) => s + x, 0) / xs.length; }),
  MAX: agg((xs) => (xs.length ? Math.max(...xs) : 0)), MIN: agg((xs) => (xs.length ? Math.min(...xs) : 0)),
  MEDIAN: agg((xs) => { if (!xs.length) throw E('#NUM!'); const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }),
  COUNT: (args, ev) => args.map(ev).flatMap(flat).filter((x) => typeof x === 'number').length,
  COUNTA: (args, ev) => args.map(ev).flatMap(flat).filter((x) => x !== null && x !== '').length,
  COUNTBLANK: (args, ev) => { need(args, 1); return flat(ev(args[0])).filter((x) => x === null || x === '').length; },
  ROUND: (args, ev) => { need(args, 1, 2); return round(num(one(ev(args[0]))), args[1] ? num(one(ev(args[1]))) : 0, 'r'); },
  ROUNDUP: (args, ev) => { need(args, 1, 2); return round(num(one(ev(args[0]))), args[1] ? num(one(ev(args[1]))) : 0, 'u'); },
  ROUNDDOWN: (args, ev) => { need(args, 1, 2); return round(num(one(ev(args[0]))), args[1] ? num(one(ev(args[1]))) : 0, 'd'); },
  INT: (args, ev) => { need(args, 1); return Math.floor(num(one(ev(args[0]))) + 1e-9); },
  ABS: (args, ev) => { need(args, 1); return Math.abs(num(one(ev(args[0])))); },
  MOD: (args, ev) => { need(args, 2); const a = num(one(ev(args[0]))), b = num(one(ev(args[1]))); if (!b) throw E('#DIV/0!'); return a - b * Math.floor(a / b); },
  LARGE: (args, ev) => { need(args, 2); const s = nums([ev(args[0])]).sort((a, b) => b - a); const k = num(one(ev(args[1]))); if (k < 1 || k > s.length) throw E('#NUM!'); return s[k - 1]; },
  SMALL: (args, ev) => { need(args, 2); const s = nums([ev(args[0])]).sort((a, b) => a - b); const k = num(one(ev(args[1]))); if (k < 1 || k > s.length) throw E('#NUM!'); return s[k - 1]; },
  RANK: (args, ev) => { need(args, 2, 3); const v = num(one(ev(args[0]))); const xs = nums([ev(args[1])]); const asc = args[2] ? bool(one(ev(args[2]))) : false; if (!xs.includes(v)) throw E('#N/A'); return 1 + xs.filter((x) => (asc ? x < v : x > v)).length; },
  SUMPRODUCT: (args, ev) => { if (!args.length) throw E('#N/A'); const vs = args.map((a) => flat(ev(a))); if (vs.some((v) => v.length !== vs[0].length)) throw E('#VALUE!'); return vs[0].reduce((s: number, _, i) => s + vs.reduce((p, v) => p * (typeof v[i] === 'number' || typeof v[i] === 'boolean' ? num(v[i]) : v[i] instanceof Err ? num(v[i]) : 0), 1), 0); },
  IF: (args, ev, arr) => {
    need(args, 2, 3); const c = ev(args[0]);
    if (isArr(c)) { if (!arr) throw E('#VALUE!'); const t = ev(args[1]); const f = args[2] ? ev(args[2]) : false; return broadcast(broadcast(c, t, (x, y) => (bool(x) ? y : SKIP), true), f, (x, y) => (x === SKIP ? y : x), true); }
    return bool(c) ? ev(args[1]) : args[2] ? ev(args[2]) : false;
  },
  IFS: (args, ev) => { if (args.length < 2 || args.length % 2) throw E('#N/A'); for (let i = 0; i < args.length; i += 2) if (bool(one(ev(args[i])))) return ev(args[i + 1]); throw E('#N/A'); },
  AND: (args, ev) => { if (!args.length) throw E('#N/A'); return args.map(ev).flatMap(flat).filter((x) => x !== null).every(bool); },
  OR: (args, ev) => { if (!args.length) throw E('#N/A'); return args.map(ev).flatMap(flat).filter((x) => x !== null).some(bool); },
  NOT: (args, ev) => { need(args, 1); return !bool(one(ev(args[0]))); },
  IFERROR: (args, ev) => { need(args, 1, 2); try { const v = ev(args[0]); if (!isArr(v) && v instanceof Err) throw v; return v; } catch (e) { if (e instanceof Err) return args[1] ? ev(args[1]) : ''; throw e; } },
  ISBLANK: (args, ev) => { need(args, 1); return one(ev(args[0])) === null; },
  SUMIF: (args, ev) => { need(args, 2, 3); const r = flat(ev(args[0])); const idx = matchIdx([[r, one(ev(args[1]))]]); const s = args[2] ? flat(ev(args[2])) : r; return sumAt(s, idx); },
  SUMIFS: (args, ev) => { const s = flat(ev(args[0] || (() => { throw E('#N/A'); })())); return sumAt(s, matchIdx(pairsOf(args, ev, 1))); },
  COUNTIF: (args, ev) => { need(args, 2); return matchIdx([[flat(ev(args[0])), one(ev(args[1]))]]).length; },
  COUNTIFS: (args, ev) => matchIdx(pairsOf(args, ev, 0)).length,
  AVERAGEIF: (args, ev) => { need(args, 2, 3); const r = flat(ev(args[0])); const idx = matchIdx([[r, one(ev(args[1]))]]); const s = args[2] ? flat(ev(args[2])) : r; const xs = idx.map((i) => s[i]).filter((x): x is number => typeof x === 'number'); if (!xs.length) throw E('#DIV/0!'); return xs.reduce((a, b) => a + b, 0) / xs.length; },
  AVERAGEIFS: (args, ev) => { const s = flat(ev(args[0] || (() => { throw E('#N/A'); })())); const xs = matchIdx(pairsOf(args, ev, 1)).map((i) => s[i]).filter((x): x is number => typeof x === 'number'); if (!xs.length) throw E('#DIV/0!'); return xs.reduce((a, b) => a + b, 0) / xs.length; },
  VLOOKUP: (args, ev) => {
    need(args, 3, 4); const key = chk(one(ev(args[0]))); const t = grid2(ev(args[1])); const col = num(one(ev(args[2]))); const sorted = args[3] ? bool(one(ev(args[3]))) : true;
    if (col < 1 || col > (t[0]?.length || 0)) throw E('#REF!');
    const first = t.map((r) => r[0]); const i = sorted ? approxPos(first, key) : exactPos(first, key); if (i < 0) throw E('#N/A');
    return t[i][col - 1];
  },
  MATCH: (args, ev) => { need(args, 2, 3); const key = chk(one(ev(args[0]))); const xs = vec(ev(args[1])); const type = args[2] ? num(one(ev(args[2]))) : 1; const i = type === 0 ? exactPos(xs, key) : approxPos(xs, key); if (i < 0) throw E('#N/A'); return i + 1; },
  INDEX: (args, ev) => {
    need(args, 1, 3); const t = grid2(ev(args[0])); let r = args[1] ? num(one(ev(args[1]))) : 0; let c = args[2] ? num(one(ev(args[2]))) : 0;
    if (t.length === 1 && args.length === 2) { c = r; r = 1; }   // 1行だけの範囲は 2つ目を 列の番号として使う
    if (r < 0 || c < 0 || r > t.length || c > (t[0]?.length || 0)) throw E('#REF!');
    if (r && c) return t[r - 1][c - 1]; if (r) return t[0].length === 1 ? t[r - 1][0] : [t[r - 1]]; if (c) return t.length === 1 ? t[0][c - 1] : t.map((x) => [x[c - 1]]); return t;
  },
  XLOOKUP: (args, ev) => {
    need(args, 3, 4); const key = chk(one(ev(args[0]))); const look = grid2(ev(args[1])); const ret = grid2(ev(args[2]));
    const byRow = look.length === 1 && (look[0]?.length || 0) > 1; const xs = look.flat(); const i = exactPos(xs, key);
    if (i < 0) { if (args[3]) return ev(args[3]); throw E('#N/A'); }
    if (byRow) { if ((ret[0]?.length || 0) !== xs.length) throw E('#VALUE!'); return ret.length === 1 ? ret[0][i] : ret.map((r) => [r[i]]); }
    if (ret.length !== xs.length) throw E('#VALUE!'); return ret[i].length === 1 ? ret[i][0] : [ret[i]];
  },
  LEFT: text1((s, n = 1) => s.slice(0, Math.max(0, n)), 1, 2), RIGHT: text1((s, n = 1) => (n <= 0 ? '' : s.slice(-n)), 1, 2),
  MID: text1((s, a, n) => s.substr(Math.max(0, a - 1), Math.max(0, n)), 3, 3), LEN: text1((s) => s.length, 1, 1),
  TRIM: text1((s) => s.trim().replace(/ +/g, ' '), 1, 1), UPPER: text1((s) => s.toUpperCase(), 1, 1), LOWER: text1((s) => s.toLowerCase(), 1, 1),
  VALUE: (args, ev) => { need(args, 1); return num(one(ev(args[0]))); },
  SUBSTITUTE: (args, ev) => { need(args, 3); const [s, a, b] = args.map((x) => str(one(ev(x)))); return a ? s.split(a).join(b) : s; },
  CONCATENATE: (args, ev) => args.map(ev).flatMap(flat).map(str).join(''), CONCAT: (args, ev) => { need(args, 2); return args.map((a) => str(one(ev(a)))).join(''); },
  TEXTJOIN: (args, ev) => { if (args.length < 3) throw E('#N/A'); const d = str(one(ev(args[0]))); const skip = bool(one(ev(args[1]))); return args.slice(2).map(ev).flatMap(flat).map(str).filter((x) => !skip || x !== '').join(d); },
  SPLIT: (args, ev) => { need(args, 2); const s = str(one(ev(args[0]))); const d = str(one(ev(args[1]))); if (!d) throw E('#VALUE!'); const parts = s.split(new RegExp('[' + d.replace(/[\]\\^-]/g, '\\$&') + ']')).filter((x) => x !== ''); return [parts.map((x) => (x.trim() !== '' && !isNaN(Number(x)) ? Number(x) : x))]; },
  ARRAYFORMULA: (args, ev) => { need(args, 1); return ev(args[0]); },
  FILTER: (args, ev) => {
    if (args.length < 2) throw E('#N/A'); const t = grid2(ev(args[0])); const conds = args.slice(1).map((a) => grid2(ev(a)));
    const byRow = conds[0].length === t.length && (conds[0][0]?.length || 0) === 1; const byCol = !byRow && conds[0].length === 1 && conds[0][0].length === (t[0]?.length || 0);
    if (!byRow && !byCol) throw E('#VALUE!');
    const keep = conds.map((c) => { const f = c.flat(); if (f.length !== (byRow ? t.length : t[0].length)) throw E('#VALUE!'); return f.map((x) => (x === null ? false : bool(x))); });
    const ok = (i: number) => keep.every((k) => k[i]);
    const out = byRow ? t.filter((_, i) => ok(i)) : t.map((r) => r.filter((_, i) => ok(i)));
    if (!out.length || !out[0].length) throw E('#N/A'); return out;
  },
  UNIQUE: (args, ev) => { need(args, 1); const t = grid2(ev(args[0])); const seen = new Set<string>(); return t.filter((r) => { const k = JSON.stringify(r.map((x) => (x instanceof Err ? x.code : x))); if (seen.has(k)) return false; seen.add(k); return true; }); },
  SORT: (args, ev) => {
    if (!args.length || (args.length > 1 && args.length % 2 === 0)) throw E('#N/A'); const t = grid2(ev(args[0])).map((r, i) => ({ r, i }));
    const keys: [number, boolean][] = []; for (let i = 1; i < args.length; i += 2) { const c = num(one(ev(args[i]))); if (c < 1 || c > (t[0]?.r.length || 0)) throw E('#VALUE!'); keys.push([c - 1, bool(one(ev(args[i + 1])))]); }
    if (!keys.length) keys.push([0, true]);
    return t.sort((a, b) => { for (const [c, asc] of keys) { const k = cmpS(a.r[c] instanceof Err ? null : a.r[c], b.r[c] instanceof Err ? null : b.r[c]); if (k) return asc ? k : -k; } return a.i - b.i; }).map((x) => x.r);
  },
};
const SKIP = E('skip');   // IF を範囲にかける時の 目印（外には出ない）

// ---- 外から使う口
// 表の targ（例 'C2'）に formula を入れた時の、表ぜんぶの値
export function evalAt(grid: Cell[][], targ: string, formula: string): Scalar[][] {
  const p = a1(targ.toUpperCase()); const g = grid.map((r) => [...r]);
  while (g.length <= p.r) g.push([]); while (g[p.r].length <= p.c) g[p.r].push('');
  const f = normalize(formula); g[p.r][p.c] = f.startsWith('=') ? f : f === '' ? '' : isNaN(Number(f)) ? f : Number(f);
  return new Sheet(g).values();
}
export const sheetValues = (grid: Cell[][]) => new Sheet(grid).values();
// 2つの結果が同じか（数は 小さな誤差を許す・文字は 前後の空白と 大文字小文字を気にしない・空と '' は同じ）
export function sameValues(a: Scalar[][], b: Scalar[][]): boolean {
  const R = Math.max(a.length, b.length), C = Math.max(...a.map((r) => r.length), ...b.map((r) => r.length), 0);
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const x = a[r]?.[c] ?? null, y = b[r]?.[c] ?? null;
    if (x instanceof Err || y instanceof Err) { if (!(x instanceof Err && y instanceof Err && x.code === y.code)) return false; continue; }
    if (typeof x === 'number' && typeof y === 'number') { if (Math.abs(x - y) > 1e-6 * Math.max(1, Math.abs(x), Math.abs(y))) return false; continue; }
    const sx = x === null ? '' : typeof x === 'string' ? x.trim().toLowerCase() : x, sy = y === null ? '' : typeof y === 'string' ? y.trim().toLowerCase() : y;
    if (sx !== sy) return false;
  }
  return true;
}
// 画面に出す形
export const show = (v: Scalar): string => (v === null ? '' : v instanceof Err ? v.code : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : typeof v === 'number' ? (Math.round(v * 1e6) / 1e6).toLocaleString('ja-JP', { maximumFractionDigits: 4 }) : v);
// 式に出てくる関数の名前（「この関数を使ったか」を見る）
export function usedFunctions(formula: string): string[] { try { return lex(normalize(formula).replace(/^=/, '')).flatMap((t, i, a) => (t.t === 'id' && a[i + 1]?.t === 'op' && a[i + 1].v === '(' ? [t.v] : [])); } catch { return []; } }
