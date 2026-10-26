// 人事の画面の型と決まり（見本ファイル lib/*-sample.ts から移した・10-26）。架空の人・数字はここに置かない。
import type { ModuleKey } from '@/lib/theme';

// ---- 日付 ----
/** 今日（日本時間）の YYYY-MM-DD */
export const jstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const WD = ['日', '月', '火', '水', '木', '金', '土'];
export const fmtDate = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`; };
export const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** 今日から何日先か（今日＝0） */
export const daysFrom = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${jstToday()}T00:00:00Z`)) / 86400000);

// ---- 変更の予約 ----
export type Field = '現場' | '単価' | '住所' | '通勤' | '状態' | '転籍';
export type YState = '承認待ち' | '予約中' | '適用済み' | '取り消し';
// 項目ごとの決まり：どの分類の持ち物か・何が一緒に変わるか・承認が要るか
export const FIELD_RULES: Record<Field, { module: ModuleKey; with: string[]; approve?: boolean; options?: string[] }> = {
  現場: { module: 'roumu', with: ['勤務表の様式', '請求先', '通勤の経路', '36協定の事業所'] },
  単価: { module: 'eigyo', with: ['請求の単価', '想定粗利'], approve: true },
  住所: { module: 'jinji', with: ['通勤・定期の見直し', '社員ページの住所'] },
  通勤: { module: 'keiri', with: ['交通費（定期代）', '通勤の経路'], approve: true },
  状態: { module: 'jinji', with: ['勤怠の対象', '営業共有リスト', '社保の手続き（労務担当へ）'], options: ['待機', '退社', '休職', '産休', '育休'] },
  // 転籍は転籍台帳（ミンミカの所属変更）から入る。会社の選択肢はここに置かない
  転籍: { module: 'jinji', with: ['名簿の所属会社', '勤怠の紐付け（転籍日で割る）', '社保・雇用保険の切り替え（労務担当へ）'], approve: true },
};
export type Yoyaku = {
  id: string; date: string; personId: string; person: string; field: Field;
  from: string; to: string; by: string; state: YState; note?: string;
};

// ---- ホーム人事 ----
export type FeedType = 'shoudaku' | 'sankaku' | 'debut' | 'mendan' | 'teiki' | 'jitai' | 'taisha' | 'reassign' | 'line' | 'memo';
export type FeedPerson = { name: string; sales?: string };
export type FeedDetail = { k: string; v: string };
export type FeedPost = { id: string; type: FeedType; at: string; people: FeedPerson[]; text: string; sub: string; details?: FeedDetail[] };
export type HomeJinjiData = {
  posts: FeedPost[];
  scope: 'all' | 'mine';      // mine＝営業：自分が担当営業の人だけ
  me: string;                  // 絞り込みに使った自分の名前（営業のとき）
  missing: FeedType[];         // 本物で読めなかった種類
  warnings: string[];
};
export const TYPE_LABEL: Record<FeedType, string> = {
  shoudaku: '承諾', sankaku: '参画決定', debut: '現場デビュー', mendan: '現場面談', teiki: '定期面談',
  jitai: '辞退', taisha: '退社', reassign: '再アサイン', line: 'LINE', memo: 'メモ',
};
// 同じ日に同じ種類が GROUP_MIN 件以上なら1つの投稿にまとめる
export const GROUP_MIN = 4;
export const GROUP_TEXT: Record<FeedType, string> = {
  shoudaku: '承諾。プロパーリストに入りました', sankaku: '参画決定。現場が決まりました', debut: '現場デビュー。今日から入場です',
  mendan: '現場面談がありました', teiki: '定期面談がありました', jitai: '辞退', taisha: '退社', reassign: '再アサイン。次の現場を探します',
  line: '採用LINEを友だち追加しました', memo: 'メモ',
};
export const jstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
type Raw = { id: string; type: FeedType; at: string; who: FeedPerson; text: string; sub: string; details?: FeedDetail[] };
/** 1件ずつの出来事 → 投稿。同日同種が多いものはまとめる（メモ・定期面談は中身が違うのでまとめない）。新しい順 */
export function toPosts(raw: Raw[]): FeedPost[] {
  const buckets = new Map<string, Raw[]>();
  raw.forEach((r) => { const k = r.type === 'memo' || r.type === 'teiki' ? r.id : r.type + '|' + jstDay(r.at); buckets.set(k, [...(buckets.get(k) || []), r]); });
  const posts: FeedPost[] = [];
  buckets.forEach((rs, k) => {
    if (rs.length < GROUP_MIN) { rs.forEach((r) => posts.push({ id: r.id, type: r.type, at: r.at, people: [r.who], text: r.text, sub: r.sub, ...(r.details?.length ? { details: r.details } : {}) })); return; }
    const seen = new Set<string>(); const people = rs.map((r) => r.who).filter((p) => !seen.has(p.name) && !!seen.add(p.name));
    posts.push({ id: 'g:' + k, type: rs[0].type, at: rs.reduce((a, r) => (r.at > a ? r.at : a), rs[0].at), people, text: GROUP_TEXT[rs[0].type], sub: '' });
  });
  return posts.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 120);
}

// ---- 参画決定者の手続き ----
export type Lane = '営業' | '人事' | '労務' | '完了';
export const LANES: { key: Lane; who: string; note: string }[] = [
  { key: '営業', who: '担当営業', note: '入場日・現場・単価を確定' },
  { key: '人事', who: '人事', note: '契約書を交わす' },
  { key: '労務', who: '労務', note: '勤怠の設定・通勤' },
  { key: '完了', who: '', note: '入場の準備ができた人' },
];
export const TO_LANE: Record<Lane, string> = {
  営業: '→ 担当営業のやることに戻しました',
  人事: '→ 人事のやることに載りました',
  労務: '→ 労務のやることに載りました',
  完了: '→ 入場の準備ができた人に載りました',
};

// ---- 採用（承諾者・面談） ----
export type FollowState = '未設定' | '予定あり' | '日程調整中' | '済み';
export type Acceptor = {
  appId: string; name: string; recruiter: string; station: string;
  norm?: string; // 名前のキー（normName）。兆しの材料と当てるのに使う
  acceptedAt: string; joinDate: string | null;
  lastReplyDays: number; reschedules: number; formDone: boolean; words: string[];
  follow: FollowState; followAt?: string; followBy?: string;
};

// ---- 資格手当 ----
export type SState = '確認待ち' | '承認待ち' | '反映待ち' | '反映ずみ' | '差し戻し';
export type ShikakuApp = {
  id: string; personId: string; name: string; cert: string;
  passedOn: string; filedAt: string; years: number; // 現場経験（年・わからなければ -1）
  files: ('合格証' | '領収書')[];
  state: SState; plus?: boolean; reason?: string;
};
/** 差し戻しの理由（選ぶだけ） */
export const S_REJECT = ['合格証の名前が違う', '合格証が読めない', '合格証が付いていない', '手当一覧にない資格'] as const;
export const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;

// ---- コミュニティ ----
export type Community = { id: string; name: string; leader: string; sub?: string; members: number };
export type Attendee = { id: string; name: string; state: '参加' | '未定' | '不参加' };
export type CEvent = { id: string; date: string; time: string; title: string; kind: '勉強会' | 'イベント'; host: string; place: string; cap: number; attendees: Attendee[] };
/** 参加の呼びかけの相手（選ぶだけ） */
export const TARGETS = ['このコミュニティの全員', '社員みんな', '入社3か月以内の人', '待機中の人'] as const;

// ---- 産休・育休 ----
export type Kind = '本人の出産' | '配偶者の出産';
export type SankyuCase = { id: string; personId: string; person: string; site: string; sales: string; kind: Kind; due: string; multi: boolean };
export const EXTEND = [
  { key: '1y', label: '1歳まで（原則）', months: 12 },
  { key: '18m', label: '1歳6か月まで（延長）', months: 18 },
  { key: '2y', label: '2歳まで（再延長・最長）', months: 24 },
] as const;
export type ExtendKey = (typeof EXTEND)[number]['key'];
// やること。base＝どの日を起点にするか、off＝その日から何日ずらすか。who＝誰がやるか。
export type Base = 'due' | 'preStart' | 'ikujiStart' | 'ikujiEnd';
export type Todo = { id: string; text: string; base: Base; off: number; who: 'うち（人事）' | '現場・営業' | '労務担当（freee）へ渡す'; link?: { href: string; label: string }; only?: Kind };
export const TODOS: Todo[] = [
  { id: 't1', text: '担当営業に知らせる（現場への伝え方と時期を相談）', base: 'preStart', off: -120, who: '現場・営業' },
  { id: 't2', text: '現場に休みの期間を伝え、代わりの人の要否を決める', base: 'preStart', off: -90, who: '現場・営業' },
  { id: 't3', text: '産休・育休の申出書を受け取る', base: 'preStart', off: -30, who: 'うち（人事）' },
  { id: 't4', text: '状態を「産休」にする予約を入れる', base: 'preStart', off: 0, who: 'うち（人事）', link: { href: '/jinji/yoyaku', label: '変更の予約へ' }, only: '本人の出産' },
  { id: 't5', text: '社会保険料の免除の申出（産前産後）', base: 'preStart', off: 0, who: '労務担当（freee）へ渡す', only: '本人の出産' },
  { id: 't6', text: '出産の連絡を受け、生まれた日を確かめる', base: 'due', off: 0, who: 'うち（人事）' },
  { id: 't7', text: '出産手当金・出産育児一時金の書類', base: 'due', off: 14, who: '労務担当（freee）へ渡す', only: '本人の出産' },
  { id: 't8', text: '育児休業の給付金・社会保険料の免除の申出', base: 'ikujiStart', off: 0, who: '労務担当（freee）へ渡す' },
  { id: 't9', text: '復帰面談（働き方・時短・現場の希望を聞く）', base: 'ikujiEnd', off: -45, who: 'うち（人事）' },
  { id: 't10', text: '復帰予定日の予約を入れる（状態を「稼働中」に戻す）', base: 'ikujiEnd', off: -30, who: 'うち（人事）', link: { href: '/jinji/yoyaku', label: '変更の予約へ' } },
  { id: 't11', text: '復帰先の現場を営業と決める', base: 'ikujiEnd', off: -30, who: '現場・営業' },
];

// ---- 離職リスク ----
export type RiskPerson = {
  id: string; name: string; site: string; recruiter: string; sales: string;
  months: number; overtime: [number, number, number]; noPunch: number; absent: number;
  words: string[]; taikiDays: number; lastMendan: string;
};
/** 面談の時期（選ぶだけ） */
export const MENDAN_WHEN = ['今週中', '来週', '2週間以内'];

// ---- 身分証の読み取り ----
export type DocKey = 'license' | 'mynumber' | 'zairyu';
export const DOCS: { key: DocKey; label: string; note: string }[] = [
  { key: 'license', label: '運転免許証', note: '表面' },
  { key: 'mynumber', label: 'マイナンバーカード', note: '表面だけ（個人番号は読まない）' },
  { key: 'zairyu', label: '在留カード', note: '表面＋在留期間' },
];
