// 公式LINE「インフォメーション」のリッチメニュー（2026-10-02 shoya）。
//   ★ボタンは6つ（大・3列×2行）: 勉強会・Udemy／bdsh／資格手当／月次アンケート／定期面談／部活動
//       2026-10-09 shoya「いけどんの公式LINEにある資格手当を こちらにも入れる・そのかわり Udemy と 勉強会は1つにまとめる」＝v3
//       決め方＝過去トーク3,612件で こちらから何度も送り直していたもの（勉強会の資料 207回・月次アンケート 45回・定期面談の日程調整 39回・Udemy 27回）。
//       いけどんの稼働中メニュー（勤怠・総務・営業への連絡）とは かぶせない。こちらは 学ぶ・面談・アンケート・部活（資格手当だけは 両方に置く）
//   ★押すと ページが開く（shoya「それぞれ押すとページ遷移するように」）。行き先は LIFF＝ https://liff.line.me/<LIFF ID>/<key> → /m/<key>
//       LIFF だと 開いた人の LINE が分かる（名前を入れさせない・なりすませない）。ページの中身と本人確認は lib/m.ts
//   ★ボタンごとに「だれに開けるか」を持つ（shoya「徐々に稼働中からメニューは解放する」）: 準備中 → リーダーだけ → 稼働中の人 → 全員。
//       メニュー（絵）は全員に出したまま、開けていない人には そのページで「準備中」と出る。変えても LINE のメニューは作り直さない
//   ★画像（public/richmenu/menu-v1.png）とボタンの並びは固定。変えるときは MENU_VERSION を上げる＝次の「反映」で作り直される
//     画像は tools/richmenu-image.mjs で作る（絵文字は使わない・lucide の線アイコン）
export const MENU_VERSION = 'v3';   // v2 = ボタン名 b-dash → bdsh（2026-10-05）／v3 = 勉強会と Udemy を1つに・資格手当を足す（2026-10-09）
export const MENU_IMAGE = `/richmenu/menu-${MENU_VERSION}.png`;
export const MENU_SIZE = { width: 2500, height: 1686 };
export const MENU_NAME = `info_main_${MENU_VERSION}`;
export const CHAT_BAR_TEXT = 'メニューを開く';   // 14文字まで
export const RICHMENU_PAGE = '/richmenu';
// 要員が開くページの場所（LIFF の「エンドポイントURL」に入れる値）。★それゆけ（soreyuke）のホストは使わない＝要員に名前を見せない
export const M_ENDPOINT = 'https://saiyou-app.vercel.app/m';
export const LIFF_ID_RE = /^\d{8,12}-[A-Za-z0-9]{6,12}$/;
export const liffUrl = (liffId: string, key: string) => `https://liff.line.me/${liffId}/${key}`;

export type MenuKey = 'study' | 'bdash' | 'shikaku' | 'survey' | 'mendan' | 'bukatsu';
// 前の版のメニューに残っている行き先 → いまの行き先（LINE のメニューを出し直すまでは 前の版のボタンが押される）
export const OLD_KEYS: Record<string, MenuKey> = { udemy: 'study' };
// だれに開けるか。kadou は「稼働中の人」とリーダー（リーダー → 稼働中 → 全員 の順に広がるように）
export type Audience = 'off' | 'leader' | 'kadou' | 'all';
export const AUDIENCES: [Audience, string][] = [['off', '準備中（だれにも開けない）'], ['leader', 'リーダーだけ'], ['kadou', '稼働中の人（リーダーを含む）'], ['all', '全員']];
export const AUDIENCE_SHORT: Record<Audience, string> = { off: '準備中', leader: 'リーダーだけ', kadou: '稼働中', all: '全員' };
// ページの種類: text＝文面を出すだけ／bdash＝その人の受講ページへ送る／shikaku＝資格手当の申請フォーム／survey＝回答フォーム／mendan＝面談の予約／clubs＝文面＋部活の一覧
export type PageKind = 'text' | 'bdash' | 'shikaku' | 'survey' | 'mendan' | 'clubs';
export interface MenuButton { key: MenuKey; label: string; sub: string; kind: PageKind; audience: Audience; text: string }

// 並び順＝画像のマスの順（左上→右上→左下→右下）。audience は最初の開け方（2026-10-02 shoya 指定）
export const BUTTONS: MenuButton[] = [
  {
    // 勉強会は もともと全員に開けていた。Udemy は準備中だったが 1つにまとめたので 同じ開け方になる
    key: 'study', label: '勉強会・Udemy', sub: '資料・動画で学ぶ', kind: 'text', audience: 'all',
    text: 'エンジニア勉強会のご案内です。\n\n▼ 勉強会の資料（CCNA ほか）\nhttps://drive.google.com/drive/folders/1bIqUpH0sgiVoRe3l-cy6qeoyOD98U-Z5\n\n日程・参加URLは 開催前に 公式LINEのトークでお知らせします。\n\n▼ Udemy（動画で学ぶ）\n会社アカウントで 動画講座を自由に受けられます。\nhttps://engineer.udemy.com/\n\nログインID・パスワードが分からないときは、公式LINEのトークで聞いてください。',
  },
  { key: 'bdash', label: 'bdsh', sub: 'ゲームで学ぶ', kind: 'bdash', audience: 'leader', text: '' },
  // 資格手当の申請（いけどんの稼働中メニューにあるものと同じ申請先）。全員に開ける（2026-10-09 shoya「資格手当は全員に開けて」）
  { key: 'shikaku', label: '資格手当', sub: '合格したら申請', kind: 'shikaku', audience: 'all', text: '' },
  { key: 'survey', label: '月次アンケート', sub: '毎月の回答はこちら', kind: 'survey', audience: 'all', text: '' },
  { key: 'mendan', label: '定期面談', sub: '日程を予約する', kind: 'mendan', audience: 'all', text: '' },
  {
    key: 'bukatsu', label: '部活動', sub: 'なかまと楽しむ', kind: 'clubs', audience: 'all',
    text: '現場や年次をこえて、同じ趣味のなかまとつながれます。\n入りたい部活・作ってみたい部活があれば、公式LINEのトークで教えてください。',
  },
];
export const buttonOf = (key: string): MenuButton | undefined => BUTTONS.find((b) => b.key === key);
export const hasText = (b: MenuButton) => b.kind === 'text' || b.kind === 'clubs';

// 面談の予約の決まり（shoya「平日10〜19時でいいけど あとでいじれるように」「吉村はリーダーとしか面談しない・リーダーは吉村としか面談しない」）
//   leaderHost … リーダーが予約する相手（吉村）／memberHost … それ以外の人が予約する相手（坂田こころ。2026-10-07 原崎から交代）。どちらも Google カレンダーのアドレス
//   カレンダーの読み書きは いけどん（/api/community teikiSlots / teikiBook）。予定がある時間は自動で外れる
export interface MendanSettings { leaderHost: string; memberHost: string; startHm: string; endHm: string; slotMin: number; days: number; weekends: boolean }
export const DEFAULT_MENDAN: MendanSettings = {
  leaderHost: 'a.yoshimura@engineer-mikata.com', memberHost: 'k.sakata@engineer-mikata.com',
  startHm: '10:00', endHm: '19:00', slotMin: 30, days: 10, weekends: false,
};
export const SLOT_MINS = [15, 30, 45, 60];

// saiyou.settings key='richmenu' の中身
//   texts は 既定から変えたものだけ持つ。testers は「まず1人で試す」で選んだ人（どのボタンも開いて見える）
export interface RichMenuSettings {
  liffId: string;
  audience: Record<MenuKey, Audience>;
  texts: Partial<Record<MenuKey, string>>;
  mendan: MendanSettings;
  testers: string[];
  line: { id: string; version: string; liffId: string; isDefault: boolean; appliedAt: string; appliedBy: string };
}
export const EMPTY_LINE = { id: '', version: '', liffId: '', isDefault: false, appliedAt: '', appliedBy: '' };
export const TEXT_MAX = 2000;
const HOST_RE = /^[a-z0-9._%+-]+@engineer-mikata\.com$/;
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const isAudience = (v: unknown): v is Audience => AUDIENCES.some(([a]) => a === v);
const hmMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));

export function cleanMendan(v: unknown): MendanSettings {
  const o = (v || {}) as Partial<MendanSettings>; const d = DEFAULT_MENDAN;
  const host = (x: unknown, fb: string) => { const s = String(x || '').trim().toLowerCase(); return HOST_RE.test(s) ? s : fb; };
  const startHm = HM_RE.test(String(o.startHm || '')) ? String(o.startHm) : d.startHm;
  let endHm = HM_RE.test(String(o.endHm || '')) ? String(o.endHm) : d.endHm;
  if (hmMin(endHm) <= hmMin(startHm)) endHm = hmMin(d.endHm) > hmMin(startHm) ? d.endHm : '23:30';
  const days = Math.floor(Number(o.days));
  return {
    leaderHost: host(o.leaderHost, d.leaderHost), memberHost: host(o.memberHost, d.memberHost), startHm, endHm,
    slotMin: SLOT_MINS.includes(Number(o.slotMin)) ? Number(o.slotMin) : d.slotMin,
    days: Number.isFinite(days) && days >= 1 && days <= 20 ? days : d.days, weekends: o.weekends === true,
  };
}
// 画面から保存できる部分（LIFF ID・開け方・文面・面談の決まり）だけを検める
export function cleanEditable(v: unknown): Pick<RichMenuSettings, 'liffId' | 'audience' | 'texts' | 'mendan'> {
  const o = (v || {}) as Partial<RichMenuSettings>;
  const liffId = String(o.liffId || '').trim();
  const audience = {} as Record<MenuKey, Audience>; const texts: Partial<Record<MenuKey, string>> = {};
  for (const b of BUTTONS) {
    const a = (o.audience || {})[b.key]; audience[b.key] = isAudience(a) ? a : b.audience;
    const t = String((o.texts || {})[b.key] ?? '').replace(/\r\n/g, '\n').trim().slice(0, TEXT_MAX);
    if (hasText(b) && t && t !== b.text) texts[b.key] = t;
  }
  return { liffId: LIFF_ID_RE.test(liffId) ? liffId : '', audience, texts, mendan: cleanMendan(o.mendan) };
}
export function cleanSettings(v: unknown): RichMenuSettings {
  const o = (v || {}) as Partial<RichMenuSettings>; const l = (o.line || {}) as Partial<RichMenuSettings['line']>;
  return {
    ...cleanEditable(o),
    testers: (Array.isArray(o.testers) ? o.testers : []).map(String).filter((x) => /^U[0-9a-f]{32}$/.test(x)).slice(0, 20),
    line: { id: String(l.id || ''), version: String(l.version || ''), liffId: String(l.liffId || ''), isDefault: !!l.isDefault, appliedAt: String(l.appliedAt || ''), appliedBy: String(l.appliedBy || '') },
  };
}
export const textOf = (s: RichMenuSettings, b: MenuButton) => s.texts[b.key] || b.text;

// LINE に渡すタップ領域（3列×2行。2500 は3で割り切れないので 端数は右端のマスに寄せる）
export function menuAreas(liffId: string) {
  const cols = 3, rows = 2; const w = Math.floor(MENU_SIZE.width / cols), h = Math.floor(MENU_SIZE.height / rows);
  return BUTTONS.map((b, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    return {
      bounds: { x: w * c, y: h * r, width: c === cols - 1 ? MENU_SIZE.width - w * c : w, height: r === rows - 1 ? MENU_SIZE.height - h * r : h },
      action: { type: 'uri', label: b.label, uri: liffUrl(liffId, b.key) },
    };
  });
}

// ---- 資格手当の申請（いけどんの申請フォーム /m/shikaku と同じ中身。保存先も同じ＝いけどんの「資格手当」の画面に並ぶ） ----
//   ★資格の名前は いけどん api/_shikaku_master.ts（手当額の表）と一字一句同じにする。足す・変えるときは 両方を直す
//   手当額は本人に入れさせない（資格の名前から いけどん側で決まる）。証明書・領収書・受験費用は すべて必須
export const SHIKAKU_PDF = '/m/shikaku-teate.pdf';   // 対象資格・手当額の一覧（いけどん public/docs/shikaku-teate.pdf の写し）
export const SHIKAKU_FILE_MAX = 25 * 1024 * 1024;    // 1ファイルあたり（いけどん側と同じ）
export const SHIKAKU_FEE_MAX = 9_999_999;
export const SHIKAKU_CERTS: { group: string; items: string[] }[] = [
  { group: '事務・ビジネス系', items: [
    'MOS Excel（スペシャリスト）', 'MOS Excel（エキスパート）', 'MOS Word（スペシャリスト）', 'MOS Word（エキスパート）', 'ITパスポート試験',
    '秘書検定（準1級）', '秘書検定（1級）', '日商簿記検定 3級', '日商簿記検定 2級', '日商簿記検定 1級',
    'ビジネス会計検定 3級', 'ビジネス会計検定 2級', 'ビジネス会計検定 1級', 'ビジネス実務法務検定 3級', 'ビジネス実務法務検定 2級', 'ビジネス実務法務検定 1級',
    'VBAエキスパート Excel VBA（ベーシック）', 'VBAエキスパート Excel VBA（スタンダード）', 'VBAエキスパート Access VBA（ベーシック）', 'VBAエキスパート Access VBA（スタンダード）',
    '基本情報技術者試験', '情報セキュリティマネジメント試験',
  ] },
  { group: 'エンジニア系', items: [
    'CCNA', 'LinuC レベル1（101試験）', 'LinuC レベル1（102試験）', 'LPIC-1（101試験）', 'LPIC-1（102試験）',
    'AWS認定 クラウドプラクティショナー', 'AWS認定 AI プラクティショナー', 'AWS認定 Solutions Architect – Associate', 'AWS認定 Developer – Associate',
    'AWS認定 SysOps Administrator – Associate', 'AWS認定 Data Engineer – Associate', 'AWS認定 Machine Learning Engineer – Associate',
    'Oracle認定 Java Silver SE', 'Oracle認定 Java Gold SE', 'CCNP', 'プロジェクトマネージャ試験', 'ITストラテジスト試験', 'システムアーキテクト試験',
    'AWS認定 Solutions Architect – Professional', 'AWS認定 DevOps Engineer – Professional', '応用情報技術者試験',
  ] },
];
export const isShikakuCert = (c: string) => SHIKAKU_CERTS.some((g) => g.items.includes(c));
export type ShikakuFileKind = 'cert' | 'receipt';
export interface ShikakuApply { examDate: string; cert: string; examFee: string; certPath: string; receiptPath: string }

// ---- 月次アンケート（Googleフォーム「月次アンケート」と同じ設問。shoya「全部必須・質問内容は Google のと一緒」） ----
//   入社月だけは聞かない（shoya「入社月は いけどんDB から引っ張ろう」＝名簿の入社日で分かる）
//   保存先は いけどんの月次アンケートの表（/api/survey?action=submit）。キーは いけどん の列名に合わせてある
export const SURVEY_INTRO = '日々の業務などで思っていることを自由にお書きください！';
export const MANZOKU_OPTIONS = ['10～8', '7～6', '5～3', '2～1'];
export const SHIKAKU_OPTIONS = ['取り組んでいる', '出来ていない'];
export const SHIKAKU_NG = '出来ていない';
export type SurveyKey = 'name' | 'eki' | 'gyomu' | 'manzoku' | 'riyu' | 'shikaku' | 'shikakuRiyu' | 'mokuhyo' | 'sonota';
export type SurveyAnswers = Partial<Record<SurveyKey, string>>;
export interface SurveyQ { key: SurveyKey; label: string; desc?: string; type: 'text' | 'area' | 'choice'; options?: string[]; hint?: string; onlyIf?: (a: SurveyAnswers) => boolean }
export const SURVEY_QS: SurveyQ[] = [
  { key: 'name', label: '氏名', type: 'text', hint: '漢字フルネーム' },
  { key: 'eki', label: '就業先の最寄り', type: 'text' },
  { key: 'gyomu', label: '主な業務内容', type: 'area' },
  { key: 'manzoku', label: '現場の満足度', desc: '精神、体力面含めて10段階でお答えください！', type: 'choice', options: MANZOKU_OPTIONS },
  { key: 'riyu', label: '理由', type: 'area' },
  { key: 'shikaku', label: '資格について', type: 'choice', options: SHIKAKU_OPTIONS },
  { key: 'shikakuRiyu', label: '理由', desc: '〜出来ていない方のみ回答〜', type: 'area', onlyIf: (a) => a.shikaku === SHIKAKU_NG },
  { key: 'mokuhyo', label: '目標資格', type: 'text' },
  { key: 'sonota', label: 'その他', type: 'area', hint: '特になければ「なし」と入れてください' },
];
// 足りない・選択肢に無い項目（空なら そのまま送れる）。画面とサーバの両方で同じ判定を使う
export function surveyMissing(a: SurveyAnswers): SurveyKey[] {
  const out = SURVEY_QS.filter((q) => (!q.onlyIf || q.onlyIf(a)) && !String(a[q.key] || '').trim()).map((q) => q.key);
  if (a.manzoku && !MANZOKU_OPTIONS.includes(a.manzoku)) out.push('manzoku');
  if (a.shikaku && !SHIKAKU_OPTIONS.includes(a.shikaku)) out.push('shikaku');
  return out;
}

// ---- 要員向けページ（/m/<key>）と API（/api/m）のやりとりの形 ----
export interface MSlot { start: string; end: string; hm: string }
export interface MDay { date: string; label: string; slots: MSlot[] }
export interface MBooking { start: string; end: string; text: string; meetUrl: string }
export interface MPage {
  ok: true; token: string; key: MenuKey; label: string; kind: PageKind;
  // open＝見せる／closed＝準備中／needName＝名前を教えてもらう／checking＝名前は聞いたが 名簿と まだ つながっていない
  state: 'open' | 'closed' | 'needName' | 'checking';
  name: string; linked: boolean; tester: boolean;
  text?: string; clubs?: string[]; url?: string; host?: string;
  paired?: string; pairError?: string;   // bdsh の共通の入口の QR から来たとき: つないだ Google アドレス／QR の期限切れ（lib/kyouiku-google.ts）
}
