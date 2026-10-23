// 離職率：今の社内システムの形 → この画面の型。
//   読むのは GET /api/rishoku?months=12（今の離職率ダッシュボード rishoku.html と同じ集計・書き込みなし）。
//   数え方は今のシステムのまま：未経験で入った社員だけ・入場前に辞めた人は数えない・同姓同名は外す。
//   今のシステムが返すのは区分ごとの人数と率だけ（氏名は返さない）。1人ずつのリスクは今のシステムに無い
export type IkeRateCell = { n: number; left: number; rate: number | null };
export type IkeTrendRow = { ym: string; start: number; joined: number; left: number; rate: number | null; cohortLeft: number; cohortRate: number | null };
export type IkeRishoku = {
  ok: boolean; error?: string; asOf: string; notes?: string[];
  window: { from: string; to: string; months: number };
  population: { people: number; retired: number; active: number };
  kpi: { left: number; exposure: number; rate: number | null; early1: IkeRateCell; early3: IkeRateCell; early6: IkeRateCell; cohort: IkeRateCell; netGain: number };
  trend: IkeTrendRow[];
};

export type LiveRateRow = { ym: string; start: number; joined: number; left: number; monthRate: number | null; stay: number; stayPct: number | null };
export type LiveRate = {
  asOf: string; people: number; notes: string[];
  early: { label: string; cell: IkeRateCell }[];
  rows: LiveRateRow[];
};

const pct = (r: number | null) => (r == null ? null : Math.round(r * 1000) / 10);

export function rateFromIke(j: IkeRishoku | null): LiveRate | null {
  if (!j || !j.ok || !j.kpi) return null;
  return {
    asOf: j.asOf, people: j.population?.people ?? 0, notes: j.notes || [],
    early: [
      { label: '入社1か月以内に辞めた', cell: j.kpi.early1 },
      { label: '入社3か月以内に辞めた', cell: j.kpi.early3 },
      { label: '入社6か月以内に辞めた', cell: j.kpi.early6 },
      { label: 'この1年の入社のうち今日までに辞めた', cell: j.kpi.cohort },
    ],
    rows: (j.trend || []).map((t) => {
      const stay = Math.max(0, t.joined - t.cohortLeft);
      return { ym: t.ym, start: t.start, joined: t.joined, left: t.left, monthRate: pct(t.rate), stay, stayPct: t.joined ? Math.round((stay / t.joined) * 100) : null };
    }),
  };
}
export const pctText = (c: IkeRateCell) => (c.rate == null ? '—' : `${Math.round(c.rate * 1000) / 10}%`);
