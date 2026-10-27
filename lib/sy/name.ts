// 氏名の正規化。いけどん api/_link.ts normName の写し（突合キーを一致させるため、必ず同じ規則にする）。
const NAME_VARIANT_MAP: Record<string, string> = {
  '髙': '高', '﨑': '崎', '邊': '辺', '邉': '辺', '齋': '斎', '齊': '斉', '齌': '斉',
  '澤': '沢', '濱': '浜', '濵': '浜', '德': '徳', '廣': '広', '曾': '曽', '眞': '真',
  '靑': '青', '惠': '恵', '槇': '槙', '渕': '淵', '冨': '富', '籠': '篭', '桒': '桑', '國': '国', '萬': '万',
};
export function normName(s: unknown): string {
  let t = String(s == null ? '' : s);
  t = t.replace(/[\s　]+/g, '');
  t = t.replace(/(さん|サン|様|君|くん)$/, '');
  t = t.replace(/[髙﨑邊邉齋齊齌澤濱濵德廣曾眞靑惠槇渕冨籠桒國萬]/g, (c) => NAME_VARIANT_MAP[c] || c);
  return t;
}
// 検索用のそろえ方: 空白（全角も）を消し、異体字（髙→高 など）と英字の大小をそろえる。名簿は「小林 亜未」、回答は「小林亜未」と書き方が割れるため（2026-10-08）
export const foldSearch = (s: unknown): string =>
  String(s == null ? '' : s).replace(/[\s　]+/g, '').replace(/[髙﨑邊邉齋齊齌澤濱濵德廣曾眞靑惠槇渕冨籠桒國萬]/g, (c) => NAME_VARIANT_MAP[c] || c).toLowerCase();
