// 想定賃金・粗利：今の社内システムの GET /api/seikyu?action=arari[&ym=YYYY-MM]（請求書ベースの粗利・/seikyu-arari.html）の形 → この画面の行。
//   ・粗利＝格納した請求書の売上（税抜）− 給与（額面）− 交通費 − 法定福利（19%）。計算は今の API の答えのまま（ここで計算し直さない）
//   ・給与：手で直した ＞ freee 勤怠の想定賃金（額面＋残業代−控除・10-26 shoya「全部 freee に合わせる・0日なら0円」＝打刻0日・freee に無い人は0円）。勤怠の計算に載っていない人（退社・名簿なし）だけ 額面 ＞ 仮 21万。勤怠は毎朝の取り込み分。交通費：手で直した ＞ 経費の申請 ＞ 仮 25,000円
//   ・読むのは runArari（SELECT だけ）。手で直すのは /api/live/arari（今の POST arari-fare / arari-salary・10-26）
export type ArariPersonLive = {
  key: string; name: string; company: string; shozoku: string; sales: number; billedFare: number;
  salary: number; salaryRaw: string; salaryDefault: boolean; salaryManual: boolean;
  salarySrc?: 'manual' | 'kintai' | 'gakumen' | 'default'; kintai?: KintaiParts | null;
  fare: number; fareManual: boolean; fareSrc: 'manual' | 'keihi' | 'default'; fareNote: string; welfare: number; gross: number;
  files: unknown[]; warn: string[];
};
export type ArariLive = {
  ok?: boolean; ym: string; months: string[]; people: ArariPersonLive[];
  unknown: Array<{ id: string }>;
  totals: { sales: number; salary: number; fare: number; welfare: number; gross: number; people: number };
  rates: { welfare: number; defaultFare: number; defaultSalary: number };
  kintaiNote?: string;
  kintaiSyncedAt?: string | null;
  error?: string;
};

// freee 勤怠から出した給与の内訳（今の想定賃金の計算＝額面＋残業代−過不足控除−欠勤控除−待機の不支給）
export type KintaiParts = {
  base: number | null; hours: number | null; workDays?: number; leaveDays?: number; absentDays?: number;
  otHours: number | null; otPay: number | null; utHours?: number | null; deduction: number | null; absenceCut?: number; taikiCut?: number;
};
const man = (n: number) => `${Math.round(n / 1000) / 10}万`;
const h1 = (n: number) => `${Math.round(n * 10) / 10}h`;
/** 給与の欄の下に出す内訳（例「額面 21万＋残業 12.5h ¥20,513−控除 ¥0」） */
export function wageParts(k: KintaiParts | null | undefined): string {
  if (!k || k.base == null) return '';
  const cut = (k.deduction || 0) + (k.absenceCut || 0) + (k.taikiCut || 0);
  return `額面 ${man(k.base)}・残業 ${h1(k.otHours || 0)} ＋¥${(k.otPay || 0).toLocaleString('ja-JP')}・控除 −¥${cut.toLocaleString('ja-JP')}${k.absentDays ? `（欠勤${k.absentDays}日）` : ''}`;
}

export type LiveArariRow = {
  key: string; name: string; company: string; shozoku: string; sales: number; salary: number; salaryLabel: string;
  fare: number; fareLabel: string; welfare: number; gross: number; rate: number; temp: boolean; warn: string[];
  salaryManual: boolean; fareManual: boolean; kintai: KintaiParts | null; salaryFromKintai: boolean;
};

export function toArari(j: ArariLive | null): LiveArariRow[] {
  return (j?.people || []).map((p) => ({
    key: p.key, name: p.name, company: p.company || '—', shozoku: p.shozoku || '—', sales: p.sales,
    salary: p.salary, salaryLabel: p.salaryManual ? '手で直した値' : p.salaryDefault ? '仮 21万（額面なし）' : p.salarySrc === 'kintai' ? 'freee 勤怠から' : '額面（内定の月給）',
    fare: p.fare, fareLabel: p.fareSrc === 'manual' ? '手で直した値' : p.fareSrc === 'keihi' ? (p.fareNote || '経費の申請') : '仮 25,000円',
    welfare: p.welfare, gross: p.gross, rate: p.sales ? p.gross / p.sales : 0,
    temp: (p.salaryDefault && !p.salaryManual) || p.fareSrc === 'default', warn: p.warn || [],
    salaryManual: !!p.salaryManual, fareManual: p.fareSrc === 'manual', kintai: p.kintai || null, salaryFromKintai: p.salarySrc === 'kintai',
  }));
}
