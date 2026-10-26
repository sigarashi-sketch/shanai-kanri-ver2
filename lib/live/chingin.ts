// 想定賃金・粗利：今の社内システムの GET /api/seikyu?action=arari[&ym=YYYY-MM]（請求書ベースの粗利・/seikyu-arari.html）の形 → この画面の行。
//   ・粗利＝格納した請求書の売上（税抜）− 給与（額面）− 交通費 − 法定福利（19%）。計算は今の API の答えのまま（ここで計算し直さない）
//   ・給与：手で直した ＞ 額面（ミンミカの内定月給）＞ 仮 21万。交通費：手で直した ＞ 経費の申請 ＞ 仮 25,000円
//   ・読むのは runArari（SELECT だけ）。手で直すのは /api/live/arari（今の POST arari-fare / arari-salary・10-26）
export type ArariPersonLive = {
  key: string; name: string; company: string; shozoku: string; sales: number; billedFare: number;
  salary: number; salaryRaw: string; salaryDefault: boolean; salaryManual: boolean;
  fare: number; fareManual: boolean; fareSrc: 'manual' | 'keihi' | 'default'; fareNote: string; welfare: number; gross: number;
  files: unknown[]; warn: string[];
};
export type ArariLive = {
  ok?: boolean; ym: string; months: string[]; people: ArariPersonLive[];
  unknown: Array<{ id: string }>;
  totals: { sales: number; salary: number; fare: number; welfare: number; gross: number; people: number };
  rates: { welfare: number; defaultFare: number; defaultSalary: number };
  error?: string;
};

export type LiveArariRow = {
  key: string; name: string; company: string; shozoku: string; sales: number; salary: number; salaryLabel: string;
  fare: number; fareLabel: string; welfare: number; gross: number; rate: number; temp: boolean; warn: string[];
  salaryManual: boolean; fareManual: boolean;
};

export function toArari(j: ArariLive | null): LiveArariRow[] {
  return (j?.people || []).map((p) => ({
    key: p.key, name: p.name, company: p.company || '—', shozoku: p.shozoku || '—', sales: p.sales,
    salary: p.salary, salaryLabel: p.salaryManual ? '手で直した値' : p.salaryDefault ? '仮 21万（額面なし）' : '額面（内定の月給）',
    fare: p.fare, fareLabel: p.fareSrc === 'manual' ? '手で直した値' : p.fareSrc === 'keihi' ? (p.fareNote || '経費の申請') : '仮 25,000円',
    welfare: p.welfare, gross: p.gross, rate: p.sales ? p.gross / p.sales : 0,
    temp: (p.salaryDefault && !p.salaryManual) || p.fareSrc === 'default', warn: p.warn || [],
    salaryManual: !!p.salaryManual, fareManual: p.fareSrc === 'manual',
  }));
}
