// 身分証の読み取り（保留中）の見本データ。実際の読み取りはしない。
//   参画決定のあと、本人が撮った身分証の写真から 氏名・ふりがな・生年月日・住所 を読み、基本情報に入れる想定。
//   マイナンバーカードは表面だけ。個人番号（裏面）は読まない・残さない。
export type DocKey = 'license' | 'mynumber' | 'zairyu';
export const DOCS: { key: DocKey; label: string; note: string }[] = [
  { key: 'license', label: '運転免許証', note: '表面' },
  { key: 'mynumber', label: 'マイナンバーカード', note: '表面だけ（個人番号は読まない）' },
  { key: 'zairyu', label: '在留カード', note: '表面＋在留期間' },
];

export type OcrField = { key: string; label: string; read: string; current: string; sure: 'high' | 'low' };
const BASE: OcrField[] = [
  { key: 'name', label: '氏名', read: '加藤 葵', current: '加藤 葵', sure: 'high' },
  { key: 'kana', label: 'ふりがな', read: 'かとう あおい', current: '', sure: 'low' },
  { key: 'birth', label: '生年月日', read: '2002/05/14', current: '2002/05/14', sure: 'high' },
  { key: 'addr', label: '住所', read: '神奈川県川崎市中原区小杉町3-○-○', current: '神奈川県川崎市中原区小杉町', sure: 'low' },
];
export const FIELDS: Record<DocKey, OcrField[]> = {
  license: [...BASE, { key: 'exp', label: '有効期限', read: '2029/06/14', current: '', sure: 'high' }],
  mynumber: BASE,
  zairyu: [...BASE.filter((f) => f.key !== 'kana'), { key: 'stay', label: '在留期間（満了日）', read: '2027/08/31', current: '', sure: 'high' }],
};
export const PERSON = { id: 's0455', name: '加藤 葵' };
