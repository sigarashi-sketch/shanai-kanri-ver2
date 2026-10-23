// 想定賃金・粗利の見本データ（本物の名前・数字ではない）。
//   今のシステムの請求書ベースの粗利の決まり：
//   粗利 ＝ 売上（請求・税抜）− 給与（額面）− 交通費 − 法定福利（給与の19%）
//   ・額面の正はミンミカの内定月給。現場の契約単価の欄は給与として使わない
//   ・内定が無い人（経験者など）は 仮21万。交通費は 経費の申請の実額 ＞ 定期代の見積もり ＞ 仮25,000円
export const WELFARE_RATE = 0.19;
export type SalarySrc = 'offer' | 'self' | 'temp';
export type FareSrc = 'claim' | 'teiki' | 'temp';
export const SALARY_LABEL: Record<SalarySrc, string> = { offer: '内定の月給', self: '本人提示（備考）', temp: '仮 21万' };
export const FARE_LABEL: Record<FareSrc, string> = { claim: '経費の申請の実額', teiki: '定期代の見積もり', temp: '仮 25,000円' };
export type ArariRow = {
  id: string; personId: string; name: string; client: string; sales: string; billed: number;
  salary: Partial<Record<SalarySrc, number>>; salarySrc: SalarySrc;
  fare: Partial<Record<FareSrc, number>>; fareSrc: FareSrc;
};
const T = { temp: 210000 };
const F = { temp: 25000 };

export const ROWS: ArariRow[] = [
  { id: 'r1', personId: 's0412', name: '山田 太郎', client: 'A社', sales: '小林', billed: 462580, salary: { offer: 230000 }, salarySrc: 'offer', fare: { claim: 13200, ...F }, fareSrc: 'claim' },
  { id: 'r2', personId: 's0501', name: '岡田 修', client: 'A社', sales: '小林', billed: 400000, salary: { self: 280000, ...T }, salarySrc: 'temp', fare: { teiki: 16800, ...F }, fareSrc: 'temp' },
  { id: 'r3', personId: 's0388', name: '伊藤 誠', client: 'C社', sales: '小林', billed: 420000, salary: { offer: 250000 }, salarySrc: 'offer', fare: { claim: 14800, ...F }, fareSrc: 'claim' },
  { id: 'r4', personId: 's0502', name: '石井 遥', client: 'C社', sales: '田中', billed: 380000, salary: { offer: 210000 }, salarySrc: 'offer', fare: { teiki: 9800, ...F }, fareSrc: 'temp' },
  { id: 'r5', personId: 's0302', name: '鈴木 一郎', client: 'D社', sales: '小林', billed: 450000, salary: { offer: 240000 }, salarySrc: 'offer', fare: { claim: 9240, ...F }, fareSrc: 'claim' },
  { id: 'r6', personId: 's0504', name: '藤井 隼', client: 'D社', sales: '田中', billed: 368000, salary: { self: 300000, ...T }, salarySrc: 'temp', fare: { claim: 11200, ...F }, fareSrc: 'claim' },
  { id: 'r7', personId: 's0410', name: '渡辺 涼', client: 'F社', sales: '小林', billed: 410000, salary: { offer: 220000 }, salarySrc: 'offer', fare: { claim: 4080, ...F }, fareSrc: 'claim' },
  { id: 'r8', personId: 's0399', name: '高橋 健', client: 'G社', sales: '田中', billed: 400000, salary: { offer: 230000 }, salarySrc: 'offer', fare: { claim: 1760, ...F }, fareSrc: 'claim' },
  { id: 'r9', personId: 's0505', name: '西田 陸', client: 'G社', sales: '田中', billed: 372000, salary: { offer: 210000 }, salarySrc: 'offer', fare: { teiki: 12400, ...F }, fareSrc: 'temp' },
  { id: 'r10', personId: 's0461', name: '佐藤 光', client: 'H社', sales: '田中', billed: 361000, salary: { offer: 220000 }, salarySrc: 'offer', fare: { claim: 6300, ...F }, fareSrc: 'claim' },
  { id: 'r11', personId: 's0480', name: '森 拓海', client: 'K社', sales: '小林', billed: 400000, salary: { offer: 210000 }, salarySrc: 'offer', fare: { claim: 4800, ...F }, fareSrc: 'claim' },
  { id: 'r12', personId: 's0508', name: '村上 凛', client: 'K社', sales: '中村', billed: 347500, salary: { self: 290000, ...T }, salarySrc: 'temp', fare: { teiki: 15600, ...F }, fareSrc: 'temp' },
];

export function arari(r: ArariRow) {
  const salary = r.salary[r.salarySrc] ?? 0;
  const fare = r.fare[r.fareSrc] ?? 0;
  const welfare = Math.round(salary * WELFARE_RATE);
  const gross = r.billed - salary - fare - welfare;
  return { salary, fare, welfare, gross, rate: r.billed ? gross / r.billed : 0 };
}
