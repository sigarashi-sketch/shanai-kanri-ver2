import type { HeLine, HeRepPrev } from '@/lib/live/home-eigyo';

// ホーム営業の見本（名前・会社・金額はすべて作り物）。
//   今のシステムの数え方：日報②の契約実績（今月のタブ）の行で、人月担当＝担当営業。未経験の要員だけ。
//   粗利＝単価−額面−額面×19%（社保）−交通費。請求の無い退場は売上・粗利から引く（成約数には残す）
export const HE_MONTH = '2026-10';
export const HE_REPS = ['小林', '田中', '三枝', '博田'];

// 見え方の名簿 id → 担当営業の名前（営業の人が開いたら、その人の分だけ出す）
export const HE_REP_OF_MEMBER: Record<string, string> = { kobayashi: '小林' };

// 今月の目標（成約数）。RemainRing の「あと何件」に使う
export const HE_GOAL: Record<string, number> = { 小林: 6, 田中: 5, 三枝: 5, 博田: 4 };

const L = (tantou: string, name: string, joui: string, status: HeLine['status'], md: string, uriage: number | null, gakumen: number | null, fare: number | null, shussha: HeLine['shussha'], noBill = false): HeLine =>
  ({ tantou, name, joui, status, md, uriage, gakumen, fare, shussha, noBill });

export const HE_LINES: HeLine[] = [
  L('小林', '佐々木 蓮', 'A社', '未経験新規', '10/2', 340000, 230000, 14000, 'jouchuu'),
  L('小林', '松本 結衣', 'B社', '未経験新規', '10/6', 320000, 220000, 6400, 'hybrid'),
  L('小林', '山田 太郎', 'C社', '未経験再アサイン', '10/9', 360000, 240000, 0, 'remote'),
  L('小林', '鈴木 一郎', 'A社', '未経験待機成約', '10/15', 330000, 230000, 12000, 'jouchuu'),
  L('小林', '渡辺 涼', 'D社', '未経験新規', '10/21', 310000, 220000, null, 'jouchuu'),
  L('田中', '中村 優', 'E社', '未経験新規', '10/1', 350000, 240000, 9800, 'jouchuu'),
  L('田中', '加藤 葵', 'B社', '未経験新規', '10/8', 330000, 225000, 0, 'remote'),
  L('田中', '伊藤 誠', 'F社', '未経験再アサイン', '10/14', 320000, 230000, 15000, 'jouchuu', true),
  L('田中', '高橋 健', 'C社', '未経験新規', '10/20', 345000, 235000, 5200, 'hybrid'),
  L('三枝', '森 陽菜', 'G社', '未経験新規', '10/3', 330000, 225000, 11000, 'jouchuu'),
  L('三枝', '石井 颯', 'E社', '未経験新規', '10/10', 315000, 220000, 7400, 'hybrid'),
  L('三枝', '前田 美咲', 'A社', '未経験待機成約', '10/17', 300000, null, 10000, 'jouchuu'),
  L('博田', '岡田 拓海', 'H社', '未経験新規', '10/7', 335000, 230000, 13000, 'jouchuu'),
  L('博田', '西村 陽太', 'D社', '未経験新規', '10/16', 325000, 225000, 0, 'remote'),
  L('博田', '小川 さくら', 'G社', '未経験再アサイン', '10/22', null, 220000, 8000, 'jouchuu'),
  L('三枝', '吉田 隼', 'H社', '未経験新規', '10/23', 330000, null, 9000, 'jouchuu'),   // プロパーリストに居ない＝数えない見本
];

// プロパーリスト（未経験の正）に載っている名前。ここに無い成約は数えない
export const HE_PROPER_NAMES: string[] = HE_LINES.map((l) => l.name).filter((n) => n !== '吉田 隼');

// 先月（前月比に使う合計だけ）
export const HE_PREV: Record<string, HeRepPrev> = {
  小林: { count: 4, uriage: 1290000, gross: 175000 },
  田中: { count: 5, uriage: 1660000, gross: 210000 },
  三枝: { count: 2, uriage: 640000, gross: 98000 },
  博田: { count: 3, uriage: 980000, gross: 128000 },
};

// 行動指標（日報②の組シートの本人の行×今月の日付の合計。項目名は日報のまま）
export const HE_ACT_LABELS = ['案件送付', '面談設定', '面談実施'];
export const HE_ACTS: Record<string, Record<string, number>> = {
  小林: { 案件送付: 168, 面談設定: 24, 面談実施: 19 },
  田中: { 案件送付: 184, 面談設定: 22, 面談実施: 17 },
  三枝: { 案件送付: 131, 面談設定: 17, 面談実施: 14 },
  博田: { 案件送付: 142, 面談設定: 15, 面談実施: 11 },
};
