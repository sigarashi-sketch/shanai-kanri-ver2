// 成約日報の見本。今の社内システムの成約日報（携帯で1問ずつ答える画面）をそのまま写したもの。
//   流れ：今日、成約あった？ → だれが成約した？（今日「参画決定」を押した人が自動で並ぶ）
//        → 1人ずつ 転籍 → 上位会社 → 現場（この人の条件は現場の決まりと同じ？＝契約）→ 入場日 → 売上 → 勤務の形
//        → 退場（現場を出る）→ 退職（会社を辞める）→ 内定辞退 → 今日の数字（組シートの項目名のまま）→ 確認 → おわり
//   経験者の日報は 勤務の形・内定辞退・今日の数字 を聞かない。人の名前は lib/sample.ts ほかの見本と同じ id・名前。
export const TODAY = '2026-10-23';
export const NOW_LABEL = '10/23（金）18:40';   // 見本の「いま」。平日18時を過ぎている
export const KAISHA = ['自社（本体）', '自社（関西）'];   // 所属＝転籍先の候補

// 日報の締め：組シート（NN月◯◯組）のA列に居る営業だけが「出すまでほかの画面へ行けない」対象
export const MUST_MEMBERS = ['三枝', '博田', '田中'];

export type Kettei = { id: string; name: string; status: string; shozoku: string; tantou: string; on: string; doneOn?: string; addKettei?: boolean };
export const ST = ['未経験新規', '未経験再アサイン'];
export const KE_ST = ['新規', '再アサイン'];
// 今日「参画決定」を押した人（プロパーリスト）。older＝直近7日
export const KETTEI: Kettei[] = [
  { id: 's0455', name: '加藤 葵', status: '未経験新規', shozoku: '自社（本体）', tantou: '田中', on: '2026-10-23' },
  { id: 's0441', name: '中村 優', status: '未経験再アサイン', shozoku: '自社（本体）', tantou: '中村', on: '2026-10-23' },
  { id: 's0470', name: '佐々木 蓮', status: '未経験新規', shozoku: '自社（関西）', tantou: '吉村', on: '2026-10-21' },
  { id: 's0478', name: '井上 さくら', status: '未経験新規', shozoku: '自社（本体）', tantou: '吉村', on: '2026-10-20', doneOn: '10/20' },
];
// 名前で探すと出る人（参画決定がまだの人も選べる＝送るときに参画決定も付ける）
export const SEIYAKU_CAND: Kettei[] = [
  { id: 's0472', name: '松本 結衣', status: '未経験新規', shozoku: '自社（本体）', tantou: '田中', on: '', addKettei: true },
  { id: 's0476', name: '井上 翔', status: '未経験再アサイン', shozoku: '自社（本体）', tantou: '布野', on: '', addKettei: true },
];
// 経験者の日報の候補（稼働管理情報一覧に居て、未経験のプロパーリストに居ない人。再アサインが既定）
export const KEIKEN_CAND: Kettei[] = [
  { id: 's0486', name: '西村 大輝', status: '再アサイン', shozoku: '自社（本体）', tantou: '', on: '' },
  { id: 's0491', name: '斉藤 翔', status: '再アサイン', shozoku: '自社（本体）', tantou: '', on: '' },
];

// 会社マスタ・現場マスタ（日報で答えた条件が請求条件の正になる）
export type Field = { key: string; label: string; options: string[]; required?: boolean };
export const CO_FIELDS: Field[] = [
  { key: 'close', label: '締め', options: ['月末', '10日', '15日', '20日', '25日'], required: true },
  { key: 'month', label: '支払い月', options: ['翌月', '翌々月', '翌々々月'], required: true },
  { key: 'day', label: '支払い日', options: ['末', '5日', '10日', '15日', '20日', '25日'], required: true },
  { key: 'docs', label: '一緒に送る物', options: ['なし', '勤務表の写し', '見積書', '交通費の明細'] },
  { key: 'down', label: '条件詳細が上位から降りてくる', options: ['はい', 'いいえ'] },
  { key: 'adjust', label: '請求書に調整行を入れてよい', options: ['はい', 'いいえ'] },
];
export const SITE_FIELDS: Field[] = [
  { key: 'base', label: '計算ベース', options: ['freee勤怠', '勤務表（時間だけ）', '明細表', 'KING OF TIME'], required: true },
  { key: 'period', label: '勤務表の締め期間', options: ['1日〜末日', '11日〜10日', '16日〜15日', '21日〜20日', '26日〜25日'], required: true },
  { key: 'route', label: '勤務表の経路', options: ['メール', 'LINE', '上位のシステム', '本人が出す', '出さない'], required: true },
  { key: 'settle', label: '精算（方式・単位）', options: ['固定', '上下割 140-180h', '上下割 160-200h', '中間割 140-180h'], required: true },
  { key: 'commute', label: '交通費', options: ['なし', '実費', '定期代', '上限あり'], required: true },
  { key: 'night', label: '夜勤（22時以降の勤務）で単価が上がる？', options: ['上がる', '上がらない'], required: true },
  { key: 'eki', label: '現場の最寄り駅', options: ['品川', '大手町', '川崎', '武蔵小杉', '新宿', '横浜'], required: true },
  { key: 'shussha', label: '出社の形', options: ['常駐', 'リモート併用', 'フルリモート'], required: true },
];
export type Site = { name: string; values: Record<string, string>; people: string[] };
export type Company = { name: string; kind: '登録ずみの会社' | 'ミンミカにある会社（条件をはじめて登録）'; values: Record<string, string>; sites: Site[] };
const S1 = { base: 'freee勤怠', period: '1日〜末日', route: 'メール', settle: '上下割 140-180h', commute: '実費', night: '上がらない' };
export const COMPANIES: Company[] = [
  { name: 'A社', kind: '登録ずみの会社', values: { close: '月末', month: '翌月', day: '末', docs: '勤務表の写し', down: 'いいえ', adjust: 'はい' }, sites: [
    { name: '品川 サーバー監視', values: { ...S1, eki: '品川', shussha: '常駐' }, people: ['山田 太郎'] },
    { name: '大手町 運用', values: { ...S1, settle: '固定', eki: '大手町', shussha: 'リモート併用' }, people: [] },
  ] },
  { name: 'E社', kind: '登録ずみの会社', values: { close: '月末', month: '翌々月', day: '10日', docs: 'なし', down: 'はい', adjust: 'いいえ' }, sites: [
    { name: '川崎 ヘルプデスク', values: { ...S1, route: '上位のシステム' }, people: ['加藤 葵'] },   // 最寄り駅・出社の形が空＝一度だけ聞く
  ] },
  { name: 'K社', kind: 'ミンミカにある会社（条件をはじめて登録）', values: { docs: 'なし' }, sites: [
    { name: '品川 キッティング', values: { ...S1, commute: '定期代', eki: '品川', shussha: '常駐' }, people: ['森 拓海'] },
  ] },
];

// 売上：時給は160h、日給は20日で人月に直して「売上高」に書く
export const UNIT = { ningetsu: { label: '人月', mul: 1, note: 'そのまま' }, jikyu: { label: '時給', mul: 160, note: '× 160h' }, nikkyu: { label: '日給', mul: 20, note: '× 20日' } } as const;
export type Unit = keyof typeof UNIT;
const range = (a: number, b: number, s: number) => Array.from({ length: Math.floor((b - a) / s) + 1 }, (_, i) => a + i * s);
export const AMOUNTS: Record<Unit, number[]> = { ningetsu: range(280000, 500000, 10000), jikyu: range(1600, 3000, 100), nikkyu: range(13000, 25000, 1000) };
export const RATE_DAYS = [30, 60, 90, 180];

// 勤務の形（日報②には書かず、従業員名簿の勤務区分に入る）。複数選べる
export const KINMU = ['土日祝休み', 'シフト', '夜勤シフト', 'その他'];
export const KINMU_SONOTA = ['祝日出勤・土日休み', '3勤3休', '固定休み（水・日）', '固定休み（土・日）'];

// 退場・退職で選べる人（従業員名簿）
export type Roster = { id: string; name: string; shozoku: string; kubun: '未経験' | '経験者'; start: string };
export const ROSTER: Roster[] = [
  { id: 's0412', name: '山田 太郎', shozoku: '自社（本体）', kubun: '未経験', start: '2025-04-01' },
  { id: 's0410', name: '渡辺 涼', shozoku: '自社（本体）', kubun: '未経験', start: '2025-03-01' },
  { id: 's0477', name: '森 さくら', shozoku: '自社（本体）', kubun: '未経験', start: '2026-10-01' },   // 入場1か月以内
  { id: 's0399', name: '高橋 健', shozoku: '自社（本体）', kubun: '未経験', start: '2024-11-01' },
  { id: 's0302', name: '鈴木 一郎', shozoku: '自社（関西）', kubun: '経験者', start: '' },
];
export const TAIJOU_RIYUU = ['PJ終了', '上位都合', '予算縮小', 'スキル不足', '本人都合'];
export const TAIJOU_CHK = [['sukishi', 'スキルシート更新'], ['hearing', 'ヒアリング'], ['saieigyo', '再営業']] as const;
export const RIYUU = ['転職', '体調不良', '家庭事情', '勤怠不良', '契約満了'];
// 内定辞退で選べる人（入場前の人だけ）
export const JITAI_CAND = [
  { id: 's0472', name: '松本 結衣', tantou: '田中', kettei: false },
  { id: 's0476', name: '井上 翔', tantou: '布野', kettei: false },
  { id: 's0455', name: '加藤 葵', tantou: '田中', kettei: true },
];

// 今日の数字（組シートの自分の表。項目名はシートのまま）。auto＝成約の回答から決まる／シートの数式
export const ACT_ITEMS = [
  { label: '架電数（新）', auto: false, current: 0 },
  { label: '提案数', auto: false, current: 0 },
  { label: '契約数', auto: true },
  { label: '新規入社数', auto: true },
  { label: '再アサイン数', auto: true },
];

// 空欄のある成約（前の日に入場日・売上が未定で出したもの）＝アラート
export const PENDING = [{ id: 's0461', name: '佐藤 光', seiyaku: '10/20', joui: 'A社', needNyuujou: true, needUriage: false }];

// 今月の自分（おわり画面）。当月の成約の契約単価の合計と粗利＝単価−額面−額面×19%−交通費
export const SELF = { goal: 8, month: 4, lastWeekAvg: 0.6, streak: 3, uriage: 1520000, gross: 221000 };
export const GAKUMEN: Record<string, { gakumen: number; fare: number }> = {
  s0455: { gakumen: 230000, fare: 12800 }, s0441: { gakumen: 240000, fare: 9600 }, s0470: { gakumen: 225000, fare: 15400 },
  s0472: { gakumen: 220000, fare: 8200 }, s0476: { gakumen: 225000, fare: 11000 },
};
export const SHAHO = 0.19;

// 好きな食べ物 → 食べログ 百名店のページ（リンクだけ）
export const FOODS: [string, string][] = [['ラーメン', 'ramen_tokyo'], ['寿司', 'sushi_tokyo'], ['焼肉', 'yakiniku_tokyo'], ['カレー', 'curry_tokyo'], ['とんかつ', 'tonkatsu'], ['うなぎ', 'unagi'], ['そば', 'soba_east'], ['うどん', 'udon_east'], ['焼き鳥', 'yakitori_east'], ['餃子', 'gyoza'], ['ハンバーガー', 'hamburger'], ['ピザ', 'pizza'], ['中華', 'chinese_tokyo'], ['イタリアン', 'italian_tokyo'], ['ステーキ', 'steak_east'], ['天ぷら', 'tempura'], ['お好み焼き', 'okonomiyaki'], ['洋食', 'yoshoku_east'], ['スイーツ', 'sweets_tokyo'], ['パン', 'bread_tokyo'], ['居酒屋', 'izakaya_east']];

// 日付の選択肢（入場日・退場日・退職日）
const fmt = (d: Date) => d.toISOString().slice(0, 10);
export const datesBetween = (from: string, to: string) => { const out: string[] = []; for (let d = new Date(from + 'T00:00:00Z'); fmt(d) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(fmt(d)); return out; };
export const md = (ymd: string) => `${+ymd.slice(5, 7)}/${+ymd.slice(8, 10)}`;
export const addMonth = (ymd: string) => { const d = new Date(ymd + 'T00:00:00Z'); return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()))); };
export const monthEnd = (ymd: string) => fmt(new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7), 0)));
export const yen = (n: number) => n.toLocaleString('ja-JP');
