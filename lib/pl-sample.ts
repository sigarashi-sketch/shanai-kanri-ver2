// 営業別の売上・粗利・成約数・行動指標の見本（数字は作り物・単位は万円）。
//   今のシステムでは 日報②の契約実績（未経験の要員だけ）と、組シートの行動指標から出している。
//   粗利＝単価−額面−額面×19%（社保）−交通費。請求の無い退場は売上・粗利から引く（成約数には残す）。
export const MONTHS = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
export const REPS = ['小林', '田中', '三枝', '博田'];
export type RepMonth = { uri: number; arari: number; n: number; sent: number; mendan: number; cut: number };

// rep × month の見本（毎月少しずつ動かす）
const BASE: Record<string, RepMonth> = {
  小林: { uri: 612, arari: 96, n: 16, sent: 310, mendan: 38, cut: 0 },
  田中: { uri: 540, arari: 78, n: 14, sent: 344, mendan: 41, cut: 0 },
  三枝: { uri: 468, arari: 74, n: 12, sent: 262, mendan: 29, cut: 0 },
  博田: { uri: 434, arari: 61, n: 11, sent: 288, mendan: 33, cut: 0 },
};
const WAVE = [0.82, 0.9, 0.86, 1.0, 1.08];
const TILT: Record<string, number[]> = { 小林: [0, 1, 0, 2, 1], 田中: [1, 0, 2, 0, 3], 三枝: [0, 2, 1, 1, 0], 博田: [2, 0, 0, 1, 2] };
const CUTS: Record<string, number> = { '2026-09:田中': 38, '2026-10:博田': 35 };

export const PL: Record<string, Record<string, RepMonth>> = Object.fromEntries(MONTHS.map((m, i) => [m, Object.fromEntries(REPS.map((r) => {
  const b = BASE[r]; const w = WAVE[i] + TILT[r][i] * 0.03;
  return [r, { uri: Math.round(b.uri * w), arari: Math.round(b.arari * w), n: Math.round(b.n * w), sent: Math.round(b.sent * (0.9 + i * 0.03)), mendan: Math.round(b.mendan * w), cut: CUTS[`${m}:${r}`] ?? 0 }];
}))]));
export const monthLabel = (m: string) => `${Number(m.slice(5))}月`;
