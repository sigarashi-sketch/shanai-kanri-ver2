// 成約日報の選択肢と形（今の nippo.html の選び方のまま）。人の名前・会社名・数字は持たない。
export type Kettei = { id: string; name: string; status: string; shozoku: string; tantou: string; on: string; doneOn?: string; addKettei?: boolean };
export const ST = ['未経験新規', '未経験再アサイン'];
export const KE_ST = ['新規', '再アサイン'];

// 売上：時給は160h、日給は20日で人月に直して「売上高」に書く
export const UNIT = { ningetsu: { label: '人月', mul: 1, note: 'そのまま' }, jikyu: { label: '時給', mul: 160, note: '× 160h' }, nikkyu: { label: '日給', mul: 20, note: '× 20日' } } as const;
export type Unit = keyof typeof UNIT;
const range = (a: number, b: number, s: number) => Array.from({ length: Math.floor((b - a) / s) + 1 }, (_, i) => a + i * s);
export const AMOUNTS: Record<Unit, number[]> = { ningetsu: range(280000, 500000, 10000), jikyu: range(1600, 3000, 100), nikkyu: range(13000, 25000, 1000) };
export const RATE_DAYS = [30, 60, 90, 180];

// 勤務の形（日報②には書かず、従業員名簿の勤務区分に入る）。複数選べる
export const KINMU = ['土日祝休み', 'シフト', '夜勤シフト', 'その他'];
export const KINMU_SONOTA = ['祝日出勤・土日休み', '3勤3休', '固定休み（水・日）', '固定休み（土・日）'];

// 退場・退職で選べる人（稼働管理情報一覧）
export type Roster = { id: string; name: string; shozoku: string; kubun: '未経験' | '経験者'; start: string };
export const TAIJOU_RIYUU = ['PJ終了', '上位都合', '予算縮小', 'スキル不足', '本人都合'];
export const TAIJOU_CHK = [['sukishi', 'スキルシート更新'], ['hearing', 'ヒアリング'], ['saieigyo', '再営業']] as const;
export const RIYUU = ['転職', '体調不良', '家庭事情', '勤怠不良', '契約満了'];

// 好きな食べ物 → 食べログ 百名店のページ（リンクだけ）
export const FOODS: [string, string][] = [['ラーメン', 'ramen_tokyo'], ['寿司', 'sushi_tokyo'], ['焼肉', 'yakiniku_tokyo'], ['カレー', 'curry_tokyo'], ['とんかつ', 'tonkatsu'], ['うなぎ', 'unagi'], ['そば', 'soba_east'], ['うどん', 'udon_east'], ['焼き鳥', 'yakitori_east'], ['餃子', 'gyoza'], ['ハンバーガー', 'hamburger'], ['ピザ', 'pizza'], ['中華', 'chinese_tokyo'], ['イタリアン', 'italian_tokyo'], ['ステーキ', 'steak_east'], ['天ぷら', 'tempura'], ['お好み焼き', 'okonomiyaki'], ['洋食', 'yoshoku_east'], ['スイーツ', 'sweets_tokyo'], ['パン', 'bread_tokyo'], ['居酒屋', 'izakaya_east']];

// 日付の選択肢（入場日・退場日・退職日）
const fmt = (d: Date) => d.toISOString().slice(0, 10);
export const datesBetween = (from: string, to: string) => { const out: string[] = []; for (let d = new Date(from + 'T00:00:00Z'); fmt(d) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(fmt(d)); return out; };
export const md = (ymd: string) => `${+ymd.slice(5, 7)}/${+ymd.slice(8, 10)}`;
export const addMonth = (ymd: string) => { const d = new Date(ymd + 'T00:00:00Z'); return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()))); };
export const monthEnd = (ymd: string) => fmt(new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7), 0)));
export const yen = (n: number) => n.toLocaleString('ja-JP');
