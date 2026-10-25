// 名前の貼り付けで宛先を選ぶ（今の配信画面 line-broadcast.html の PASTENAMES ブロックをそのまま写した純粋な関数）。
//   ・貼り付けの書式はバラバラ（ふりがな付き・敬称付き・「氏名＠案件」・旧字/新字・1字違いの誤記）
//   ・自動で選ぶのは「表記の揺れを畳めば同じ」になる人だけ。1字違いは自動で選ばず「もしかして」で人に選ばせる
//     （今の名簿で試すと別人に当たる組があったため。今のシステムの決まりのまま）
import { normName } from './eigyo-common';

const KANJI_RE = /[㐀-鿿豈-﫿々〆]|[\uD840-\uD87F][\uDC00-\uDFFF]/;
const KANA_ONLY_RE = /^[ぁ-ゖァ-ヺー・･ｦ-ﾟ]+$/;
const OPEN = '[（(【［\\[〔「『<＜]';
const CLOSE = '[）)】］\\]〕」』>＞]';
const PAREN_RE = new RegExp(`${OPEN}[^）)】］\\]〕」』>＞]*${CLOSE}`, 'g');
const PAREN_TAIL_RE = new RegExp(`${OPEN}.*$`);

/** 1件分の表記から「氏名以外」（括弧書き・後ろのふりがな）を落とす */
export function cleanPastedName(raw: unknown): string {
  let t = String(raw ?? '');
  t = t.replace(PAREN_RE, ' ').replace(PAREN_TAIL_RE, ' ').replace(/^[\s　]+|[\s　]+$/g, '');
  const tok = t.split(/[\s　]+/);
  if (tok.length >= 2) {
    let n = tok.length;
    while (n > 0 && KANA_ONLY_RE.test(tok[n - 1])) n--;
    if (n > 0 && n < tok.length) {
      const head = tok.slice(0, n);
      if (head.some((w) => KANJI_RE.test(w)) && (head.length >= 2 || head[0].length >= 3)) t = head.join(' ');
    }
  }
  return t;
}

/** 貼り付けた文から氏名を取り出す（改行・カンマ・読点で区切る。スペースでは割らない。表計算の貼り付けは先頭列だけ） */
export function parsePastedNames(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of String(text ?? '').split(/\r\n|\r|\n/)) {
    const head = line.split('\t')[0].replace(PAREN_RE, ' ');
    for (const raw of head.split(/[,、，;；]/)) {
      const t = cleanPastedName(raw.replace(/^[\s　]*(?:[-–—・*•‧]+|[（(]?\d+[）).．。、:：]?)[\s　]*/, ''));
      if (!t) continue;
      const k = normName(t);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

/** 照合用のゆるいキー（＠以降・括弧・中黒・カナの種類・ヶケを畳む） */
export function looseNameKey(s: unknown): string {
  const t = cleanPastedName(String(s ?? '').split(/[@＠]/)[0]);
  return normName(t).replace(/(さん|サン|様|君|くん)$/, '').replace(/[・･.．]/g, '')
    .replace(/[ヶヵゖゕ]/g, (c) => ({ ヶ: 'ケ', ヵ: 'カ', ゖ: 'ケ', ゕ: 'カ' } as Record<string, string>)[c])
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export type NameIndex<V> = { exact: Map<string, V>; loose: Map<string, V>; names: Map<string, string> };

export function buildNameIndex<V>(entries: { name: string; value: V }[]): NameIndex<V> {
  const idx: NameIndex<V> = { exact: new Map(), loose: new Map(), names: new Map() };
  for (const e of entries) {
    if (!e?.name) continue;
    const nm = normName(e.name);
    if (nm && !idx.exact.has(nm)) idx.exact.set(nm, e.value);
    const lk = looseNameKey(e.name);
    if (lk && !idx.loose.has(lk)) { idx.loose.set(lk, e.value); idx.names.set(lk, e.name); }
  }
  return idx;
}

function oneCharDiff(a: string, b: string) {
  const A = Array.from(a), B = Array.from(b);
  if (A.length !== B.length || A.length < 4 || A[0] !== B[0]) return false;
  let d = 0;
  for (let i = 0; i < A.length; i++) if (A[i] !== B[i] && ++d > 1) return false;
  return d === 1;
}

function uniqueKey<V>(idx: NameIndex<V>, pred: (k: string) => boolean): string | null {
  let hit: string | null = null;
  for (const k of idx.loose.keys()) {
    if (!pred(k)) continue;
    if (hit !== null && idx.loose.get(k) !== idx.loose.get(hit)) return null;
    hit = k;
  }
  return hit;
}

/** 氏名 → 当たった人（完全一致 → ゆるい一致 → 4字以上で候補1人だけの部分一致）。当たらなければ null */
export function matchName<V>(name: string, idx: NameIndex<V>): { value: V; how: 'exact' | 'loose' | 'partial' } | null {
  const nm = normName(name);
  if (nm && idx.exact.has(nm)) return { value: idx.exact.get(nm)!, how: 'exact' };
  const q = looseNameKey(name);
  if (!q) return null;
  if (idx.loose.has(q)) return { value: idx.loose.get(q)!, how: 'loose' };
  if (Array.from(q).length < 4) return null;
  const hit = uniqueKey(idx, (k) => k.length > q.length && k.includes(q));
  return hit ? { value: idx.loose.get(hit)!, how: 'partial' } : null;
}

/** 自動では選ばなかった氏名の「もしかして」（1字違い・候補がちょうど1人のとき） */
export function suggestName<V>(name: string, idx: NameIndex<V>): { value: V; name: string } | null {
  const q = looseNameKey(name);
  if (!q) return null;
  const hit = uniqueKey(idx, (k) => oneCharDiff(q, k));
  return hit ? { value: idx.loose.get(hit)!, name: idx.names.get(hit)! } : null;
}
