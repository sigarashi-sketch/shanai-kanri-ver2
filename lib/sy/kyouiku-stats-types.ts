// /kyouiku「集計」の形（画面とサーバで共用）。組み立ては lib/kyouiku-stats.ts
export interface StatsDay { d: string; active: number; opened: number }
export interface StatsCourse {
  id: string; name: string;
  users: number; active7: number; active30: number;   // 練習の記録がある人（累計・7日・30日）
  clickers: number;   // 記録を取り始めてから コースを選ぶ画面で押した人
  clicks: number;     // 押した 延べ（1人1日1回）
}
export interface StatsCheckSubject {
  id: string; name: string; n: number; avg: number | null; retakers: number; firstAvg: number | null; retakeAvg: number | null;   // 受け直した人の 初回と最新の平均
  dist: number[];   // 0-19 / 20-39 / 40-59 / 60-79 / 80-100 の人数（いちばん新しい回）
  tags: { tag: string; rate: number; n: number }[];   // 分野ごとの正解の割合（低い順）
  items: { label: string; tag: string; rate: number; dk: number; n: number }[];   // 問題ごとの正解の割合・「わからない」の割合（低い順）
  kpm?: number; accuracy?: number;   // タイピングだけ
}
export interface StatsData {
  since: string;            // 開いた・押した の記録を取り始めた日（まだ無ければ ''）
  staff: boolean;           // 内勤を含めたか
  seenKeys: string[];       // 一度でも bdsh の記録がある人（稼働中の何割が使ったかを 画面で名簿と突き合わせる）
  active7Keys: string[];    // この7日に記録がある人
  days: StatsDay[];         // 直近30日（日本時間）
  opened: number; menu: number; clickers: number; practiced: number;   // 記録を取り始めてから: 開いた人・メニューから来た人・コースを押した人・練習した人（開いた人のうち）
  courses: StatsCourse[];
  check: { takers: number; all4: number; avg: number | null; subjects: StatsCheckSubject[] };
}
