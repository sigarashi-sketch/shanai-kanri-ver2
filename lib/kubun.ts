// 権限の区分（10-26 shoya「見え方も 承諾者管理とか 神奈川西エリア みたいな区分分けに」「今のいけどんの区分に合わせる」）。
//   ・区分は今の社内システムの「ロール別ページ表示」の区分（api/_page_access.ts PAGES の section）と同じ名前
//   ・ロール・組織・個別のどれも、この区分ごとに 見ない/見る/直す/承認 を付ける（前の4分類 人事/労務/営業/経理 はやめた）
//   ・ver2 の画面は KUBUN_OF_HREF で区分に振る（今のシステムの同じ画面がいる区分に合わせた。今に無い画面は近いところ）
//   ・キーは前の4分類（jinji/roumu/eigyo/keiri）と重ならない名前（営業の区分は sales）＝保存してある古い値と見分けられる
//   ・かな西エリア：要員の画面（KANAWEST_HREFS）を「神奈川要員チェックの人だけ」で開ける区分。
//     その画面の元の区分が「見ない」で、かな西エリアだけ持っている人は、神奈川要員だけに絞って見せる（lib/kanawest-scope.ts）
import type { ModuleKey } from './theme';
import type { Level } from './access';

export type KubunKey = 'sales' | 'anken' | 'mendan' | 'kadou' | 'kintai' | 'seikyu' | 'bunseki' | 'kanawest' | 'kanri';
/** mod＝札の色に使う分類（色だけ） */
export const KUBUN: { key: KubunKey; label: string; mod: ModuleKey; hint: string }[] = [
  { key: 'sales', label: '営業', mod: 'eigyo', hint: 'ホーム営業・要員リスト・営業リスト一覧・待機・成約日報' },
  { key: 'anken', label: '案件', mod: 'eigyo', hint: '案件・案件進捗・案件掲載・マップ' },
  { key: 'mendan', label: '面談・入社', mod: 'jinji', hint: '面談管理・面談可能日・採用（承諾者管理）・入社手続き・スキルシート' },
  { key: 'kadou', label: '稼働中の人', mod: 'jinji', hint: '社員一覧・変更の予約・資格手当・産休育休・コミュニティ・派遣契約・交通費経費' },
  { key: 'kintai', label: '勤怠', mod: 'roumu', hint: '当日の出勤状況（欠勤管理）・シフト表・申請の承認・残業・締め・交通費チェック・アラート' },
  { key: 'seikyu', label: '請求', mod: 'keiri', hint: '請求書・請求書づくり・作成・格納・勤怠の照合' },
  { key: 'bunseki', label: '分析', mod: 'keiri', hint: '売上・粗利・想定賃金・離職リスク' },
  { key: 'kanawest', label: 'かな西エリア', mod: 'eigyo', hint: '要員リスト・面談管理・案件進捗・チャットを神奈川要員だけで' },
  { key: 'kanri', label: '管理', mod: 'roumu', hint: '労務法務ナレッジ・媒体アイパス管理' },
];
export const KUBUN_KEYS = KUBUN.map((k) => k.key);
export type KPerms = Record<KubunKey, Level>;
export const kubunLabel = (k: KubunKey) => KUBUN.find((x) => x.key === k)!.label;

/** ver2 の画面 → 区分 */
export const KUBUN_OF_HREF: Record<string, KubunKey> = {
  // 人事管理
  '/home/jinji': 'kadou', '/jinji/staff': 'kadou', '/jinji/yoyaku': 'kadou', '/jinji/nyusha': 'mendan', '/jinji/jimu': 'kadou',
  '/jinji/sankyu': 'kadou', 
  '/jinji/ocr': 'mendan', '/jinji/ippass': 'kanri', '/jinji/today': 'kintai', '/jinji/shift': 'kintai', '/jinji/map': 'kadou',
  // 人財管理（10-27・それゆけ未経験から移した画面と、人事管理から移した画面。区分は人事管理にいたときと同じ＝見られる人は変わらない）
  '/jinzai/teiki': 'kadou', '/jinzai/survey': 'kadou', '/jinzai/community': 'kadou', '/jinzai/events': 'kadou', '/jinzai/enquete': 'kadou',
  '/jinzai/saiyou': 'mendan', '/jinzai/shikaku': 'kadou', '/jinzai/rishoku': 'bunseki', '/jinzai/ltv': 'bunseki', '/jinzai/bdsh': 'kadou',
  '/jinzai/richmenu': 'kadou', '/jinzai/pon': 'kadou', '/jinzai/roster': 'kadou', '/jinzai/chat': 'kadou', '/jinzai/broadcast': 'kadou', '/jinzai/proper': 'sales',
  // 労務/営業管理
  '/roumu/overtime': 'kintai', '/roumu/shime': 'kintai',
  '/roumu/contracts': 'kadou', '/roumu/alerts': 'kintai', '/roumu/kb': 'kanri',
  // 営業
  '/home/eigyo': 'sales', '/eigyo/cases': 'anken', '/eigyo/progress': 'anken', '/eigyo/mendan': 'mendan', '/eigyo/availability': 'mendan',
  '/eigyo/keisai': 'anken', '/eigyo/proper': 'sales', '/eigyo/sales-list': 'sales', '/eigyo/skillsheet': 'mendan', '/eigyo/haken': 'kadou',
  '/eigyo/taiki': 'sales', '/eigyo/nippo': 'sales', '/eigyo/map': 'anken', '/eigyo/pl': 'bunseki',
  // 経理管理
  '/keiri/approval': 'kintai', '/keiri/keihi': 'kadou', '/keiri/check': 'kintai', '/keiri/kintai-shogo': 'seikyu', '/keiri/seikyu': 'seikyu', '/keiri/seikyu-zukuri': 'seikyu',
  '/keiri/seikyu-make': 'seikyu', '/keiri/kakunou': 'seikyu', '/keiri/chingin': 'bunseki',
};
// 営業から先に出す（10-27 shoya「ver2 ローンチ・営業からやっちゃいたい」）。今の社内システムは残したまま並行で使う
//   PRE_LAUNCH が true の間、全体管理者でない人には PRE_LAUNCH_CLOSED の下の画面を出さない（メニューにも出ない・開くと「権限がありません」）
//   ＝営業の画面（/home/eigyo・/eigyo/）と、ホーム・設定だけ。人事・人財・労務・経理・保留を出すときは、そこを外す（全部出すなら false）
export const PRE_LAUNCH = true;
export const PRE_LAUNCH_CLOSED = ['/home/jinji', '/jinji', '/jinzai', '/roumu', '/keiri', '/horyu'] as const;
export const preLaunchClosed = (pathname: string, owner: boolean) =>
  PRE_LAUNCH && !owner && PRE_LAUNCH_CLOSED.some((h) => pathname === h || pathname.startsWith(h + '/'));

/** かな西エリアで開ける画面（神奈川要員だけに絞る）。連絡パネルのチャットも同じ扱い */
export const KANAWEST_HREFS = ['/eigyo/proper', '/eigyo/mendan', '/eigyo/progress'] as const;

/** いまの画面の区分（画面の下の階層もふくむ）。区分に振っていない画面は null */
export function kubunOfPath(pathname: string): KubunKey | null {
  let best: string | null = null;
  for (const h of Object.keys(KUBUN_OF_HREF)) if ((pathname === h || pathname.startsWith(h + '/')) && (!best || h.length > best.length)) best = h;
  return best ? KUBUN_OF_HREF[best] : null;
}
export const isKanawestHref = (pathname: string) => KANAWEST_HREFS.some((h) => pathname === h || pathname.startsWith(h + '/'));

/** その画面を開けるか。'all'＝区分で開ける／'kanawest'＝かな西エリアだけで開ける（神奈川要員だけ）／null＝開けない。区分に振っていない画面は 'all' */
export function pageAccess(kperms: KPerms, pathname: string): 'all' | 'kanawest' | null {
  const k = kubunOfPath(pathname);
  if (!k) return 'all';
  if (kperms[k] !== 'none') return 'all';
  if (isKanawestHref(pathname) && kperms.kanawest !== 'none') return 'kanawest';
  return null;
}
/** かな西エリアだけを持つ人（ほかの区分が全部「見ない」）。この人が読めるのは神奈川要員の人のことだけ（lib/kanawest-scope.ts） */
export const isKanawestOnly = (k: KPerms) => k.kanawest !== 'none' && KUBUN_KEYS.every((x) => x === 'kanawest' || k[x] === 'none');

const RANK: Record<Level, number> = { none: 0, view: 1, edit: 2, approve: 3 };
const hi = (a: Level, b: Level): Level => (RANK[a] >= RANK[b] ? a : b);
const isLevel = (v: unknown): v is Level => v === 'none' || v === 'view' || v === 'edit' || v === 'approve';
export const kAll = (l: Level): KPerms => Object.fromEntries(KUBUN_KEYS.map((k) => [k, l])) as KPerms;
export const K_NONE = kAll('none');
export const kMax = (a: Partial<KPerms>, b: Partial<KPerms>): KPerms =>
  Object.fromEntries(KUBUN_KEYS.map((k) => [k, hi(a[k] ?? 'none', b[k] ?? 'none')])) as KPerms;

/** 前の4分類の段階 → 区分の段階（その分類のメニューの画面が入っている区分に、同じ段階を付ける。保存してある古い値を読むとき） */
const MOD_HREF_PREFIX: Record<ModuleKey, string[]> = { jinji: ['/home/jinji', '/jinji/'], roumu: ['/roumu/'], eigyo: ['/home/eigyo', '/eigyo/'], keiri: ['/keiri/'], jinzai: ['/jinzai/'] };
// 分類をまたいで移した画面は、古い値を読むときは元の分類のまま数える（人事の段階で勤怠が開かないように）
const MOVED_FROM: Record<string, ModuleKey> = {
  // 人財管理は 10-27 にできた分類。前の値（4分類）を読むときは人事管理として数える
  ...Object.fromEntries(['teiki', 'survey', 'community', 'events', 'enquete', 'saiyou', 'shikaku', 'rishoku', 'ltv', 'bdsh', 'richmenu', 'pon', 'roster', 'chat', 'broadcast'].map((x) => [`/jinzai/${x}`, 'jinji' as ModuleKey])), '/jinzai/proper': 'eigyo', '/jinji/today': 'roumu', '/jinji/shift': 'roumu', '/keiri/approval': 'roumu' };
const modOfHref = (h: string, legacy: boolean) => (legacy ? MOVED_FROM[h] : undefined) ?? (Object.keys(MOD_HREF_PREFIX) as ModuleKey[]).find((m) => MOD_HREF_PREFIX[m].some((p) => h === p || h.startsWith(p)));
/** その分類のメニューの画面が入っている区分。legacy＝保存してある古い値を読むとき（移した画面は元の分類で数える） */
export function kubunsOfModule(m: ModuleKey, legacy = false): KubunKey[] {
  return [...new Set(Object.entries(KUBUN_OF_HREF).filter(([h]) => modOfHref(h, legacy) === m).map(([, k]) => k))];
}
/** 保存してある段階を区分の形に（区分のキーならそのまま・4分類のキーなら区分に開く・知らないキーは捨てる） */
export function toKPerms(raw: unknown): Partial<KPerms> {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  let out: Partial<KPerms> = {};
  for (const k of KUBUN_KEYS) if (isLevel(o[k])) out[k] = o[k] as Level;
  for (const m of ['jinji', 'roumu', 'eigyo', 'keiri'] as ModuleKey[]) {
    const l = o[m];
    if (isLevel(l) && l !== 'none') out = kMax(out, Object.fromEntries(kubunsOfModule(m, true).map((k) => [k, l])));
  }
  return out;
}
