// 離職リスク・離職率（人事管理）の見本データ。本物の名前・数字ではない。
//   リスクは点数にしない。材料（残業の増え方・未打刻・欠勤・面談メモの気になる言葉・待機の長さ・入社からの月数）を
//   そのまま並べて「なぜ」が見えるようにする。年齢・性別・健康の申告は材料に使わない。
export type RiskPerson = {
  id: string; name: string; site: string; recruiter: string; sales: string;
  months: number; // 入社からの月数
  overtime: [number, number, number]; // 直近3か月の残業（時間）
  noPunch: number; // 今月の未打刻（回）
  absent: number; // 直近3か月の欠勤（回）
  words: string[]; // 面談メモ・日報で引っかかった言葉
  taikiDays: number; // 待機の日数（0＝待機でない）
  lastMendan: string; // 最後の面談
};

export const RISK_PEOPLE: RiskPerson[] = [
  { id: 's0388', name: '伊藤 誠', site: 'C社（新宿）', recruiter: '田中', sales: '小林', months: 24, overtime: [22, 35, 48], noPunch: 1, absent: 2, words: ['しんどい', '辞めたい'], taikiDays: 0, lastMendan: '08/04' },
  { id: 's0441', name: '中村 優', site: '—（待機）', recruiter: '中村', sales: '田中', months: 3, overtime: [0, 0, 0], noPunch: 0, absent: 1, words: ['他の会社'], taikiDays: 46, lastMendan: '09/30' },
  { id: 's0302', name: '鈴木 一郎', site: 'D社（大手町）', recruiter: '中村', sales: '小林', months: 42, overtime: [12, 14, 13], noPunch: 3, absent: 0, words: [], taikiDays: 0, lastMendan: '10/02' },
  { id: 's0470', name: '佐々木 蓮', site: 'I社（大宮）', recruiter: '田中', sales: '小林', months: 2, overtime: [0, 8, 21], noPunch: 4, absent: 3, words: ['合わない'], taikiDays: 0, lastMendan: '09/12' },
  { id: 's0472', name: '松本 結衣', site: 'J社（赤羽）', recruiter: '中村', sales: '小林', months: 5, overtime: [5, 6, 4], noPunch: 0, absent: 0, words: ['人間関係'], taikiDays: 0, lastMendan: '09/25' },
  { id: 's0410', name: '渡辺 涼', site: 'F社（横浜）', recruiter: '田中', sales: '小林', months: 19, overtime: [10, 9, 11], noPunch: 0, absent: 0, words: [], taikiDays: 0, lastMendan: '10/10' },
  { id: 's0412', name: '山田 太郎', site: 'A社（品川）', recruiter: '中村', sales: '小林', months: 18, overtime: [15, 18, 16], noPunch: 1, absent: 0, words: [], taikiDays: 0, lastMendan: '10/08' },
];

export const MENDAN_BY = ['中村（採用）', '田中（採用）', '小林（営業）', '吉村（コミュニティ）'];
export const MENDAN_WHEN = ['今週中', '来週', '2週間以内'];

// 入社月（初回入場の月）ごとの定着。null＝まだその月数に届いていない。
//   定義：初回入場から在籍通算（現場替え・待機を挟んでも退社していなければ在籍）・未経験の社員だけ。
//   2026-01 以前の入場は辞めた人の記録が残っていないので出さない（2026-02 以降だけ）。
export type Cohort = { month: string; n: number; m3: number | null; m6: number | null; m12: number | null };
export const COHORTS: Cohort[] = [
  { month: '2026-02', n: 18, m3: 16, m6: 14, m12: null },
  { month: '2026-03', n: 22, m3: 19, m6: 17, m12: null },
  { month: '2026-04', n: 31, m3: 27, m6: 25, m12: null },
  { month: '2026-05', n: 15, m3: 14, m6: null, m12: null },
  { month: '2026-06', n: 20, m3: 16, m6: null, m12: null },
  { month: '2026-07', n: 24, m3: 21, m6: null, m12: null },
  { month: '2026-08', n: 19, m3: null, m6: null, m12: null },
  { month: '2026-09', n: 17, m3: null, m6: null, m12: null },
];
