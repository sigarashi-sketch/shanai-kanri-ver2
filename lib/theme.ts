// 分類ごとの色。人事管理・労務/営業管理・営業・経理管理が1色ずつ持ち、同じ色は2つに付けられない。
//   選んだ色が重なったら、あとの分類を空いている色へ自動でずらし、そう知らせる（notes）。
//   黄（jinjer 寄りの黄×黒）だけは上に乗る文字を黒にする（on）。

export type ColorKey = 'indigo' | 'teal' | 'yellow' | 'orange' | 'violet' | 'rose' | 'blue' | 'green';
export type ModuleKey = 'jinji' | 'roumu' | 'eigyo' | 'keiri';

export type Swatch = {
  name: string;
  p: string; // 主の色（ボタン・バッジ・選択中の線）
  d: string; // 濃い色（白地の上の文字）
  s: string; // うすい地（表の見出し・選択中の行）
  l: string; // 線
  on: string; // p の上に乗る文字の色
};

export const PALETTE: Record<ColorKey, Swatch> = {
  indigo: { name: 'インディゴ', p: '#4F46E5', d: '#3730A3', s: '#EEF0FF', l: '#C7CBFA', on: '#FFFFFF' },
  teal: { name: 'ティール', p: '#0E9384', d: '#0B6B61', s: '#E6F6F4', l: '#A9DED7', on: '#FFFFFF' },
  yellow: { name: 'イエロー（黄×黒）', p: '#F5C400', d: '#6B5300', s: '#FFF8D6', l: '#F0D873', on: '#171717' },
  orange: { name: 'オレンジ', p: '#E8590C', d: '#A63E07', s: '#FFF1E8', l: '#F8C7A6', on: '#FFFFFF' },
  violet: { name: 'バイオレット', p: '#7C3AED', d: '#5B21B6', s: '#F3EEFE', l: '#D6C6FB', on: '#FFFFFF' },
  rose: { name: 'ローズ', p: '#E11D48', d: '#9F1239', s: '#FFEEF2', l: '#F8B8C8', on: '#FFFFFF' },
  blue: { name: 'ブルー', p: '#1F6FE0', d: '#134A9C', s: '#EAF2FE', l: '#B9D3F7', on: '#FFFFFF' },
  green: { name: 'グリーン', p: '#16A34A', d: '#116B34', s: '#E9F7EE', l: '#B5E3C4', on: '#FFFFFF' },
};

export const MODULES: { key: ModuleKey; label: string; short: string; def: ColorKey }[] = [
  { key: 'jinji', label: '人事管理', short: '人事', def: 'indigo' },
  { key: 'roumu', label: '労務/営業管理', short: '労務/営業', def: 'teal' },
  { key: 'eigyo', label: '営業', short: '営業', def: 'yellow' },
  { key: 'keiri', label: '経理管理', short: '経理', def: 'violet' },
];

export type ColorChoice = Partial<Record<ModuleKey, ColorKey>>;

/** 選んだ色を重複なしに解決する。上の分類（人事→労務→営業→経理）が優先。 */
export function resolveColors(choice: ColorChoice): { keys: Record<ModuleKey, ColorKey>; notes: string[] } {
  const used = new Set<ColorKey>();
  const keys = {} as Record<ModuleKey, ColorKey>;
  const notes: string[] = [];
  for (const m of MODULES) {
    let c: ColorKey = choice[m.key] && PALETTE[choice[m.key]!] ? choice[m.key]! : m.def;
    if (used.has(c)) {
      const alt = (Object.keys(PALETTE) as ColorKey[]).find((k) => !used.has(k))!;
      notes.push(`${m.label}は「${PALETTE[c].name}」が他と重なるので「${PALETTE[alt].name}」にしました`);
      c = alt;
    }
    used.add(c);
    keys[m.key] = c;
  }
  return { keys, notes };
}

// ---- 色の上の文字が読めるように（10-25 見た目の整理）。主の色の上に on の字を乗せて 4.5:1 に届かない色は、同じ色味のまま少しずつ暗くする ----
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
};
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const darken = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.round(x * (1 - k)));
  return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
};
/** 主の色（p）を、上に乗る字（on）が 4.5:1 で読める濃さにして返す（黄×黒のように元から読める色はそのまま） */
export function readableFill(p: string, on: string): string {
  if (on.toUpperCase() !== '#FFFFFF') return p;
  for (let k = 0; k <= 0.5; k += 0.02) { const c = darken(p, k); if (contrast(c, on) >= 4.6) return c; }
  return darken(p, 0.5);
}

/** CSS 変数にする。--c-jinji / --d-jinji / --s-jinji / --l-jinji / --o-jinji … */
export function cssVars(keys: Record<ModuleKey, ColorKey>): Record<string, string> {
  const v: Record<string, string> = {};
  for (const m of MODULES) {
    const s = PALETTE[keys[m.key]];
    v[`--c-${m.key}`] = readableFill(s.p, s.on);
    v[`--d-${m.key}`] = s.d;
    v[`--s-${m.key}`] = s.s;
    v[`--l-${m.key}`] = s.l;
    v[`--o-${m.key}`] = s.on;
  }
  return v;
}

export const COLOR_STORAGE_KEY = 'v2_module_colors';

// ---- 着せ替え（画面全体の見た目）。10-23 shoya「全部着せ替えできるようにして」。色の見本 /iro-mihon.html の8つ ----
//   分類ごとの色（上）はどれを選んでも残る。着せ替えが変えるのは 面・メニュー・表の見出し・札の形・ボタン・影・分類色の深さ。
export type ThemeKey = 'now' | 'kin' | 'houseki' | 'mono' | 'yoru' | 'kiguro' | 'kami' | 'ai';
export const THEMES: { key: ThemeKey; no: string; name: string; desc: string; sw: [string, string, string, string] }[] = [
  { key: 'houseki', no: '2', name: '深い宝石色', desc: '分類の色を1段深く。大事なところだけ影とグラデーション', sw: ['#10131F', '#F4F5F9', '#0F766E', '#A1173D'] },
  { key: 'kin', no: '1', name: '墨と金', desc: '墨色に、くすんだ金を差し色に。札は細い線で囲む', sw: ['#0F1426', '#FBFAF7', '#C8A96E', '#9B2C3C'] },
  { key: 'mono', no: '3', name: '白黒＋色は点だけ', desc: 'ほぼ白黒。色は状態の点と危ない棒だけ', sw: ['#F7F7F9', '#FFFFFF', '#111111', '#C2263F'] },
  { key: 'yoru', no: '4', name: '夜のダーク', desc: '暗い画面に、状態の色だけがほのかに光る', sw: ['#0A0C12', '#141824', '#5EEAD4', '#FB7185'] },
  { key: 'kiguro', no: '5', name: '黄×黒を上品に', desc: '黄と黒の面積をしぼって大人っぽく。危ないものは朱色', sw: ['#111111', '#F7F6F2', '#F5C400', '#D9381E'] },
  { key: 'kami', no: '6', name: '紺と生成りの紙', desc: '紙の色に紺。見出しは明朝、札は下線', sw: ['#1B2A4A', '#F3EFE6', '#E2C79A', '#A4343A'] },
  { key: 'ai', no: '7', name: '藍のグラデーション', desc: '今どきのSaaS。上の帯・ボタンに藍→紫', sw: ['#1E1B4B', '#F6F7FB', '#6366F1', '#BE185D'] },
  { key: 'now', no: '0', name: 'はじめの色', desc: '最初に作った明るい色（パステルの札）', sw: ['#191B2E', '#F5F6FA', '#0E9384', '#E11D48'] },
];
export const THEME_STORAGE_KEY = 'v2_theme';
export const DEFAULT_THEME: ThemeKey = 'houseki';
