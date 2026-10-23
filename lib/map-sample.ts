// 案件・要員マップの見本（本物の案件・名前ではない）。今の社内システムの2画面をそのまま写す。
//   ・案件マップ（今の cases-map）… 未経験事業部の案件を職種の色のピンで出す。出発駅を入れると通勤の目安で並べる
//   ・要員マップ（今の map）… 営業中の要員を最寄駅ごとの丸、Slack の案件（K番号）をオレンジの丸で出す
//   通勤時間は今の画面と同じ「目安」：直線距離×1.2÷40km/h＋待ち・乗換6分＋駅から先（アクセス欄の徒歩/バス分・無ければ徒歩8分）。
//   電車の実経路は出さない（乗換案内・Google マップへのボタンで見る）。
//   地図は見本なので SVG の簡易な地図（緯度経度→位置）。本物の地図タイルは本物につなぐときに入れる。

export type Station = { name: string; lat: number; lng: number };
export const STATIONS: Station[] = [
  { name: '大宮', lat: 35.9064, lng: 139.6239 }, { name: '浦和', lat: 35.8587, lng: 139.6571 },
  { name: '蕨', lat: 35.8279, lng: 139.6904 }, { name: '川口', lat: 35.8017, lng: 139.7173 },
  { name: '赤羽', lat: 35.7779, lng: 139.7209 }, { name: '池袋', lat: 35.7295, lng: 139.7109 },
  { name: '新宿', lat: 35.6896, lng: 139.7006 }, { name: '大手町', lat: 35.6862, lng: 139.7663 },
  { name: '渋谷', lat: 35.658, lng: 139.7016 }, { name: '大崎', lat: 35.6197, lng: 139.7286 },
  { name: '品川', lat: 35.6285, lng: 139.7387 }, { name: '浦安', lat: 35.6537, lng: 139.9017 },
  { name: '船橋', lat: 35.7019, lng: 139.9855 }, { name: '武蔵小杉', lat: 35.5762, lng: 139.6597 },
  { name: '川崎', lat: 35.5313, lng: 139.697 }, { name: '横浜', lat: 35.4657, lng: 139.6223 },
  { name: '町田', lat: 35.542, lng: 139.4467 }, { name: 'さがみ野', lat: 35.4757, lng: 139.428 },
];
export const stationOf = (n: string) => STATIONS.find((s) => s.name === n.replace(/駅$/, ''));

// ---- 簡易な地図（緯度経度 → SVG の位置。等距円筒＋緯度補正）----
export const BOX = { n: 35.95, s: 35.4, w: 139.36, e: 140.0 };
const K = 1000, COS = Math.cos((35.7 * Math.PI) / 180);
export const MAP_W = Math.round((BOX.e - BOX.w) * COS * K), MAP_H = Math.round((BOX.n - BOX.s) * K);
export const xy = (lat: number, lng: number) => ({ x: (lng - BOX.w) * COS * K, y: (BOX.n - lat) * K });
/** 東京湾（ざっくり）。[緯度, 経度] */
export const BAY: [number, number][] = [[35.4, 139.64], [35.45, 139.645], [35.5, 139.69], [35.53, 139.75], [35.58, 139.77], [35.62, 139.78], [35.64, 139.8], [35.65, 139.84], [35.64, 139.88], [35.66, 139.92], [35.68, 139.96], [35.69, 140.0], [35.4, 140.0]];
/** 背景にうすく引く路線（駅の並びだけ） */
export const RAILS: string[][] = [
  ['大宮', '浦和', '蕨', '川口', '赤羽', '大手町', '品川', '川崎', '横浜'],
  ['赤羽', '池袋', '新宿', '渋谷', '大崎', '品川'],
  ['渋谷', '武蔵小杉', '横浜'], ['大手町', '浦安', '船橋'], ['町田', '横浜'], ['さがみ野', '横浜'], ['新宿', '町田'],
];

// ---- 通勤時間の目安（今の cases-map と同じ式）----
export function kmBetween(a: Station, b: Station) {
  const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
/** 駅から先の分（アクセス欄の「徒歩N分」「バスN分」。バスは待ち5分を足す。書いてなければ徒歩8分） */
export function lastMile(access = '') {
  let m = 0, hit = false;
  for (const x of access.matchAll(/徒歩\s*約?\s*(\d{1,2})\s*分/g)) { m += +x[1]; hit = true; }
  for (const x of access.matchAll(/バス\s*約?\s*(\d{1,2})\s*分/g)) { m += +x[1] + 5; hit = true; }
  if (!hit && /バス/.test(access)) { m += 20; hit = true; }
  return hit ? m : 8;
}
/** 出発駅 → 案件の駅 の目安（分は5分きざみ・最低5分）。どちらかの場所が分からなければ null */
export function estimate(from: string, to: string, access?: string): { km: number; min: number } | null {
  const a = stationOf(from), b = stationOf(to);
  if (!a || !b) return null;
  const km = kmBetween(a, b), ride = km < 1.2 ? 0 : ((km * 1.2) / 40) * 60 + 6;
  return { km, min: Math.max(5, Math.round((ride + lastMile(access)) / 5) * 5) };
}
/** ほかの画面（案件ストック・待機）が使う2駅の目安（分） */
export const commuteMin = (a: string, b: string) => estimate(a, b)?.min ?? null;
export const commuteTone = (m: number) => (m <= 45 ? 'ok' : m <= 60 ? 'warn' : 'bad');

// ---- 案件マップ ----
export const CATS = ['事務', '軽作業', 'コールセンター', '製造', 'IT・SE', '営業', '販売', '生産管理', 'その他'] as const;
export type Cat = (typeof CATS)[number];
/** 職種の色（今の画面は職種ごとに色分け。ver2 は役割の色の名前に当てる） */
export const CAT_TONE: Record<Cat, string> = { 事務: 'info', 軽作業: 'caution', コールセンター: 'purple', 製造: 'bad', 'IT・SE': 'ok', 営業: 'warn', 販売: 'warn', 生産管理: 'purple', その他: 'mute' };
export const MODES = [{ v: '公共交通機関', l: '電車・バス' }, { v: '自動車', l: '自動車' }, { v: 'バイク', l: 'バイク' }, { v: '自転車', l: '自転車' }, { v: '徒歩', l: '徒歩' }] as const;
export const OWNERS = ['小林', '田中', '三枝', '博田'];
export const SRC_LABEL = { sheet: 'スプシ', ike: '社内ツール', juchu: '受注' } as const;
export type Src = keyof typeof SRC_LABEL;

export type Job = {
  id: string; case_no: number; title: string; company?: string; category: Cat; owner: string; source: Src;
  pay?: string; start?: string; hours?: string; holiday?: string; require?: string;
  station?: string; access?: string; area?: string; modes: string[]; summary: string;
  reserve?: string; reserveNote?: string;             // 充足予約（この日に充足扱い）
  status: 'open' | 'filled' | 'closed'; doneOn?: string; doneNote?: string;
};
export const TODAY = '2026-10-23';
type RawJob = Omit<Job, 'status'> & { status?: Job['status'] };
const RAW_JOBS: RawJob[] = [
  { id: 'j1', case_no: 41, title: '営業事務（プリント基板メーカー）', category: '事務', owner: '小林', source: 'sheet', pay: '36万（時給2300円）', start: '即日〜11/1', hours: '8:30-17:20', holiday: '土日', require: '事務経験 / Excel基本操作', station: 'さがみ野', access: 'さがみ野駅から徒歩12分', modes: ['公共交通機関', '自動車'], summary: '受注業務（専用システム）、進捗管理・納期調整、庶務' },
  { id: 'j2', case_no: 42, title: 'サーバー監視・一次対応', category: 'IT・SE', owner: '田中', source: 'juchu', pay: '40万', start: '11/1', hours: '9:00-18:00', holiday: '土日祝', require: 'CCNA 歓迎', station: '品川', access: '品川駅 港南口から徒歩6分', modes: ['公共交通機関'], summary: '監視画面のアラート確認と手順書どおりの一次対応。未経験OK・研修あり', reserve: '2026-10-30', reserveNote: '10/28 面談後に決定見込み' },
  { id: 'j3', case_no: 43, title: '社内ヘルプデスク', category: 'IT・SE', owner: '小林', source: 'ike', pay: '34万', start: '11/16', hours: '9:00-17:30', holiday: '土日祝', station: '大手町', access: '大手町駅直結（徒歩2分）', modes: ['公共交通機関'], summary: '社員からの問い合わせ（PC・アカウント）の受付と切り分け' },
  { id: 'j4', case_no: 44, title: 'PCキッティング', category: 'IT・SE', owner: '三枝', source: 'sheet', pay: '32万', start: '12/1', hours: '9:00-18:00', holiday: '土日', station: '大宮', access: '大宮駅西口から徒歩5分', modes: ['公共交通機関', '自転車'], summary: 'PCの初期設定・資産管理。残業ほぼなし' },
  { id: 'j5', case_no: 45, title: 'コールセンター（ITの窓口）', category: 'コールセンター', owner: '田中', source: 'sheet', pay: '33万', start: '12/1', hours: 'シフト 9-22時の8h', holiday: 'シフト制', station: '横浜', access: '横浜駅から徒歩7分', modes: ['公共交通機関'], summary: 'ネット回線の問い合わせ・一次切り分け' },
  { id: 'j6', case_no: 46, title: '物流センター 検品・出荷', category: '軽作業', owner: '博田', source: 'juchu', pay: '30万', start: '即日', hours: '8:00-17:00', holiday: '日＋1日', station: '浦安', access: '浦安駅からバス15分', modes: ['公共交通機関', '自動車', 'バイク'], summary: 'ハンディ端末での検品と出荷の準備' },
  { id: 'j7', case_no: 47, title: '生産管理アシスタント', category: '生産管理', owner: '三枝', source: 'ike', pay: '35万', start: '11/16', hours: '8:30-17:30', holiday: '土日', station: '川崎', access: '川崎駅からバス10分', modes: ['公共交通機関', '自動車'], summary: '生産計画の入力・部品の手配' },
  { id: 'j8', case_no: 48, title: 'テスト・検証', category: 'IT・SE', owner: '小林', source: 'sheet', pay: '33万', start: '11/1', hours: '10:00-19:00', holiday: '土日祝', station: '渋谷', access: '渋谷駅から徒歩9分', modes: ['公共交通機関'], summary: 'スマホアプリのテスト項目どおりの確認と記録' },
  { id: 'j9', case_no: 49, title: 'ネットワーク運用', category: 'IT・SE', owner: '田中', source: 'juchu', pay: '43万', start: '12/1', hours: '9:00-18:00', holiday: '土日祝', station: '新宿', access: '新宿駅南口から徒歩4分', modes: ['公共交通機関'], summary: '設定変更の手順書どおりの作業・夜間の立ち会いは月1' },
  { id: 'j10', case_no: 50, title: 'データ入力（保険）', category: '事務', owner: '博田', source: 'sheet', pay: '29万', start: '11/1', hours: '9:00-17:00', holiday: '土日祝', station: '大手町', access: '大手町駅から徒歩3分', modes: ['公共交通機関'], summary: '申込書の内容をシステムに入力・ダブルチェック' },
  { id: 'j11', case_no: 51, title: 'ショップ 法人営業サポート', category: '販売', owner: '小林', source: 'ike', pay: '31万', start: '即日', hours: '10:00-19:00', holiday: 'シフト制', area: '神奈川県・埼玉県（指定の携帯ショップ）', modes: ['公共交通機関'], summary: '法人のお客さま向けの手続きと端末の設定' },
  { id: 'j12', case_no: 38, title: '検品（食品工場）', category: '製造', owner: '三枝', source: 'sheet', station: '川口', access: '川口駅からバス12分', modes: ['自動車'], summary: 'ラインの検品', status: 'filled', doneOn: '2026-10-20', doneNote: '10/20 参画決定' },
  { id: 'j13', case_no: 36, title: '受付事務', category: '事務', owner: '田中', source: 'juchu', station: '池袋', access: '池袋駅から徒歩5分', modes: ['公共交通機関'], summary: 'ビル受付', status: 'closed', doneOn: '2026-10-15', doneNote: '先方都合でなくなった' },
];
export const JOBS: Job[] = RAW_JOBS.map((j) => ({ ...j, status: j.status ?? 'open' }));

/** AI 読み取りの見本：貼った案件文と、そこから埋まる欄（本物は案件文を AI が14の欄に分ける・失敗したら見出しで拾う） */
export const PASTE_SAMPLE = `【案件】ヘルプデスク（物流システム）
最寄駅：武蔵小杉駅 徒歩6分
単価：34万（時給2100円）
時間：9:00-18:00　休日：土日祝
開始：12/1〜
業務：倉庫で使う端末の問い合わせ受付、設定の手順書どおりの対応
求めるもの：PCの基本操作 / 電話応対`;
export const PASTE_RESULT: Omit<Job, 'id' | 'case_no' | 'owner' | 'source' | 'status'> = {
  title: 'ヘルプデスク（物流システム）', category: 'IT・SE', pay: '34万（時給2100円）', start: '12/1〜', hours: '9:00-18:00', holiday: '土日祝',
  require: 'PCの基本操作 / 電話応対', station: '武蔵小杉', access: '武蔵小杉駅から徒歩6分', modes: ['公共交通機関'],
  summary: '倉庫で使う端末の問い合わせ受付、設定の手順書どおりの対応',
};

// ---- 要員マップ ----
//   要員＝営業中の人（最寄駅は営業用リストの最寄駅）。案件＝Slack に流れた案件（K番号・現場は複数ありうる）
export type Youin = { id: string; name: string; station?: string; tags: string[]; summary: string; career: string; dates: string[]; memo?: string };
export const YOUIN: Youin[] = [
  { id: 's0441', name: '中村 優', station: '蕨', tags: ['[稼働]待機', '[希望]インフラ'], summary: 'CCNA・LPIC-1。夜勤なし希望', career: '飲食店 店長（シフト・発注）', dates: ['10/27 午後', '10/28 終日'], memo: '面談は対面がよい' },
  { id: 's0470', name: '佐々木 蓮', station: '大宮', tags: ['[稼働]待機', '[希望]開発'], summary: '基本情報。Java を勉強中', career: '物流倉庫（検品・出荷管理）', dates: ['10/26 終日'] },
  { id: 's0491', name: '斉藤 翔', station: '大宮', tags: ['[稼働]営業中', '[希望]エンジニア'], summary: 'ITパスポート。即日OK', career: '携帯ショップ販売', dates: ['10/29 午前'] },
  { id: 's0472', name: '松本 結衣', station: '赤羽', tags: ['[稼働]待機', '[希望]テスト'], summary: 'MOS。在宅併用を希望', career: 'コールセンター（一次切り分け）', dates: ['10/27 午前', '10/30 午後'] },
  { id: 's0388', name: '伊藤 誠', station: '赤羽', tags: ['[稼働]11/30 終了', '[希望]NW運用'], summary: 'CCNA・AWS SAA', career: '家電量販店（販売・修理受付）', dates: [] },
  { id: 's0476', name: '井上 翔', station: '川口', tags: ['[稼働]待機', '[希望]ヘルプデスク'], summary: 'ITパスポート', career: '飲食店ホール', dates: ['10/28 夕方'] },
  { id: 's0483', name: '森 拓海', station: '浦和', tags: ['[稼働]営業中'], summary: '電話応対の経験あり', career: '保険の事務', dates: ['10/26 午後'] },
  { id: 's0477', name: '森 さくら', station: '武蔵小杉', tags: ['[稼働]11/15 終了', '[希望]キッティング'], summary: 'ITパスポート', career: 'アパレル販売', dates: [] },
  { id: 's0410', name: '渡辺 涼', station: '横浜', tags: ['[稼働]11/30 終了', '[希望]ヘルプデスク'], summary: 'MOS', career: '旅行代理店 窓口', dates: ['10/31 終日'] },
  { id: 's0478', name: '井上 さくら', station: '横浜', tags: ['[稼働]営業中', '[希望]事務'], summary: '日商簿記2級', career: '施工管理の事務', dates: ['10/27 午後'] },
  { id: 's0493', name: '前田 悠真', tags: ['[稼働]営業中'], summary: '—', career: '—', dates: [] },
  { id: 's0494', name: '石井 菜々', tags: ['[稼働]営業中'], summary: '—', career: '—', dates: [] },
];
/** 地図に出ない人の内訳（今の画面の「なぜ人数が少ないか」） */
export const YOUIN_COUNTS = { total: 855, excluded: 776, target: 79, pending: 1, pendingNames: ['吉田 美咲（新高島平）'] };

export type SlackCase = { kNo: string; date: string; stations: string[]; remote?: boolean; content: string };
export const SLACK_CASES: SlackCase[] = [
  { kNo: 'K2391', date: '10/23', stations: ['品川'], content: '【サーバー監視】品川駅徒歩6分／40万／11/1〜／CCNA歓迎・未経験OK。監視画面のアラート確認と一次対応' },
  { kNo: 'K2388', date: '10/22', stations: ['大宮', '浦和'], content: '【キッティング】大宮・浦和の2拠点／32万／12/1〜。PCの初期設定と資産管理' },
  { kNo: 'K2385', date: '10/22', stations: ['新宿'], remote: true, content: '【ネットワーク運用】新宿駅南口／43万／12/1〜。設定変更の手順書どおりの作業・在宅は週2' },
  { kNo: 'K2380', date: '10/21', stations: ['横浜'], content: '【IT窓口】横浜駅徒歩7分／33万／シフト制。ネット回線の問い合わせ・一次切り分け' },
  { kNo: 'K2377', date: '10/20', stations: ['武蔵小杉', '川崎'], content: '【ヘルプデスク】武蔵小杉・川崎／34万／12/1〜。倉庫端末の問い合わせ受付' },
  { kNo: 'K2372', date: '10/19', stations: [], remote: true, content: '【テスト】フルリモート／30万／11/1〜。スマホアプリのテスト項目どおりの確認' },
];
