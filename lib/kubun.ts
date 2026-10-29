// 権限の区分＝左メニューの分類（10-27 shoya「左のメニュー依存にしてほしい またいで表示したい場合は複製するから」）。
//   ・区分は lib/nav.ts の NAV の分類（人事管理・人財管理・労務/営業管理・営業・経理管理）＋かな西エリア。画面の区分は「左メニューのどの分類にいるか」だけで決まる
//   ・2つの分類で見せたい画面は、メニューに別の href で複製する（例：営業の派遣契約＝労務の派遣契約・人財のプロパーリスト＝営業の要員リスト）
//   ・ロール・組織・個別のどれも、この区分ごとに 見ない/見る/直す/承認 を付ける
//   ・前に保存した値（10-26〜27 の今のいけどん寄りの区分 営業/案件/面談・入社/稼働中の人/勤怠/請求/分析/管理）は toKPerms で読み替える
//   ・かな西エリア：要員の画面（KANAWEST_HREFS）を「神奈川要員チェックの人だけ」で開ける区分。
//     かな西エリア「だけ」の人（ほかの区分が全部「見ない」）は いつも神奈川要員だけ（lib/kanawest-scope.ts）。開けるのは 神奈川要員だけに絞れる画面（KANAWEST_HREFS）とホーム・設定だけ
//     ★10-29 shoya「営業管理 かな西しかみれない」「その神奈川限定だけ表示なしにして」：ほかの区分を1つでも持つ人は かな西エリアを見ない（絞らない・ふつうに区分どおり）
//       （10-27 の「ほかの区分を持っていても いつも神奈川要員だけ」はやめた）。全体管理者・管理者・全体を見る（kAll）には付けない
import { NAV } from './nav';
import type { ModuleKey } from './theme';
import type { Level } from './access';

export type KubunKey = ModuleKey | 'kanawest';
/** mod＝札の色に使う分類（色だけ） */
export const KUBUN: { key: KubunKey; label: string; mod: ModuleKey; hint: string }[] = [
  ...NAV.map((g) => ({ key: g.module as KubunKey, label: g.label, mod: g.module, hint: g.items.map((it) => it.label).join('・') })),
  { key: 'kanawest', label: 'かな西エリア', mod: 'eigyo', hint: 'ほかの区分が全部「見ない」の人だけ効く＝神奈川要員だけ。開けるのは要員リスト・面談管理・案件進捗・チャットだけ（ほかの区分を持つ人には効かない）' },
];
export const KUBUN_KEYS = KUBUN.map((k) => k.key);
export type KPerms = Record<KubunKey, Level>;
export const kubunLabel = (k: KubunKey) => KUBUN.find((x) => x.key === k)!.label;

/** ver2 の画面 → 区分（＝左メニューの分類） */
export const KUBUN_OF_HREF: Record<string, KubunKey> = Object.fromEntries(NAV.flatMap((g) => g.items.map((it) => [it.href, g.module])));
// 営業から先に出す（10-27 shoya「営業からやっちゃいたい」）。PRE_LAUNCH を true にすると、全体管理者でない人には
//   PRE_LAUNCH_CLOSED の下の画面を出さない（メニューにも出ない・開くと「権限がありません」）＝営業（/home/eigyo・/eigyo/）とホーム・設定だけ
//   ★同日「もう本番」（ほかの分類も使っている人がいる）なので false にしてある。営業だけにしたいときは true
export const PRE_LAUNCH = false;
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

// 画面ごとの「見るだけ」（10-27 shoya「ところどころ横断して閲覧だけしたいのがある」）。
//   区分は「見ない」のまま、左メニューの画面を1つずつ「見る」で開ける。ロール・部署/チームに付ける（組織表の「ロールと役職」・右のメニューの見本を押す）。
//   持っているのは href の並びだけ＝その画面（と下の階層）は「見る」まで（直す・承認は区分で付ける）
export const NAV_HREFS: ReadonlySet<string> = new Set(Object.keys(KUBUN_OF_HREF));
/** 保存してある「見るだけ」の画面を確かめる（左メニューに無い href は捨てる） */
export const cleanPages = (raw: unknown): string[] => (Array.isArray(raw) ? [...new Set(raw.filter((h): h is string => typeof h === 'string' && NAV_HREFS.has(h)))] : []);
/** その画面が「見るだけ」で開いているか */
export const pageGranted = (pages: readonly string[], pathname: string) => pages.some((h) => pathname === h || pathname.startsWith(h + '/'));

/** その画面を開けるか。'all'＝区分か「見るだけ」で開ける／'kanawest'＝かな西エリアだけで開ける（神奈川要員だけ）／null＝開けない。区分に振っていない画面は 'all' */
export function pageAccess(kperms: KPerms, pathname: string, pages: readonly string[] = []): 'all' | 'kanawest' | null {
  const k = kubunOfPath(pathname);
  if (!k) return 'all';
  if (isKanawest(kperms)) return isKanawestHref(pathname) ? 'kanawest' : null;
  if (kperms[k] !== 'none') return 'all';
  if (pageGranted(pages, pathname)) return 'all';
  return null;
}
/** かな西エリアだけの人（ほかの区分が全部「見ない」）。この人が読めるのは神奈川要員の人のことだけ（lib/kanawest-scope.ts・10-29 ほかの区分を持つ人は外した） */
export const isKanawest = (k: KPerms) => k.kanawest !== 'none' && KUBUN_KEYS.every((x) => x === 'kanawest' || k[x] === 'none');

const RANK: Record<Level, number> = { none: 0, view: 1, edit: 2, approve: 3 };
const hi = (a: Level, b: Level): Level => (RANK[a] >= RANK[b] ? a : b);
const isLevel = (v: unknown): v is Level => v === 'none' || v === 'view' || v === 'edit' || v === 'approve';
/** 全部の区分を同じ段階に（かな西エリアは絞る印なので付けない） */
export const kAll = (l: Level): KPerms => Object.fromEntries(KUBUN_KEYS.map((k) => [k, k === 'kanawest' ? 'none' : l])) as KPerms;
export const K_NONE = kAll('none');
export const kMax = (a: Partial<KPerms>, b: Partial<KPerms>): KPerms =>
  Object.fromEntries(KUBUN_KEYS.map((k) => [k, hi(a[k] ?? 'none', b[k] ?? 'none')])) as KPerms;

// ---- 前に保存した値の読み替え ----
//   ・10-26 より前の4分類（jinji/roumu/eigyo/keiri）は今の区分のキーと同じ＝そのまま読む
//   ・10-26〜27 の区分（今のいけどん寄り）は、その区分の画面が入っている左メニューの分類に同じ段階を付ける（いくつも当たれば高いほう）
type OldKubun = 'sales' | 'anken' | 'mendan' | 'kadou' | 'kintai' | 'seikyu' | 'bunseki' | 'kanri';
// 広げすぎない（1つの画面のためだけに分類まるごとは開かない）＝主に入っていた分類だけ。新しい形で保存し直せば消える
const OLD_TO_MODULES: Record<OldKubun, ModuleKey[]> = {
  sales: ['eigyo'], // 要員リスト・営業リスト・待機・成約日報
  anken: ['eigyo'], // 案件・案件進捗・掲載・マップ
  mendan: ['eigyo', 'jinji', 'jinzai'], // 面談管理・面談可能日・スキルシート／入社手続き・身分証／採用
  kadou: ['jinji', 'jinzai'], // 社員一覧・予約・産休／人財の画面
  kintai: ['jinji', 'roumu'], // 当日の出勤・シフト／残業・締め・アラート
  seikyu: ['keiri'],
  bunseki: ['keiri'], // 想定賃金・売上粗利
  kanri: ['roumu'], // 労務法務ナレッジ
};
/** 保存してある段階を区分の形に（区分のキーならそのまま・前の区分のキーは左メニューの分類に開く・知らないキーは捨てる） */
export function toKPerms(raw: unknown): Partial<KPerms> {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  let out: Partial<KPerms> = {};
  for (const k of KUBUN_KEYS) if (isLevel(o[k])) out[k] = o[k] as Level;
  for (const [old, mods] of Object.entries(OLD_TO_MODULES)) {
    const l = o[old];
    if (isLevel(l) && l !== 'none') out = kMax(out, Object.fromEntries(mods.map((m) => [m, l])));
  }
  return out;
}
