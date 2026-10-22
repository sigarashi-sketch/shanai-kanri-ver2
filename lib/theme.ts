// 分類ごとの色。人事・労務・営業・経理が1色ずつ持ち、同じ色は2つに付けられない。
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
  { key: 'roumu', label: '労務管理', short: '労務', def: 'teal' },
  { key: 'eigyo', label: '営業管理', short: '営業', def: 'yellow' },
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

/** CSS 変数にする。--c-jinji / --d-jinji / --s-jinji / --l-jinji / --o-jinji … */
export function cssVars(keys: Record<ModuleKey, ColorKey>): Record<string, string> {
  const v: Record<string, string> = {};
  for (const m of MODULES) {
    const s = PALETTE[keys[m.key]];
    v[`--c-${m.key}`] = s.p;
    v[`--d-${m.key}`] = s.d;
    v[`--s-${m.key}`] = s.s;
    v[`--l-${m.key}`] = s.l;
    v[`--o-${m.key}`] = s.on;
  }
  return v;
}

export const COLOR_STORAGE_KEY = 'v2_module_colors';
