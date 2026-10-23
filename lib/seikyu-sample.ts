// 請求書づくりの見本データ（本物の会社名・単価ではない）。
//   今のシステムの請求書作成の流れ：勤務表が届く → 時間を読む → 精算幅で金額 → 請求書の下書き → 送付
//   ・精算幅（例 140〜180h）を下回れば控除、上回れば超過。控除・超過の単価は 月額÷下限・月額÷上限（10円未満切り捨て）
//   ・取引先の様式（先方FMT）があるなら、それに転記して出す。読み方がまだの会社は手で写す
//   ・格納＝請求書PDFの置き場。中身の文字から誰の分かを当てる。名前が読めないファイルは「人を選ぶ」
export const STAGES = ['勤務表が届いた', '時間を読んだ', '金額を出した', '下書きできた', '送付した'] as const;
// stage: 0=勤務表まだ / 1..5 = STAGES の何番目まで済んだか
export type Fmt = 'fmt-ready' | 'fmt-todo' | 'own';
export const FMT_LABEL: Record<Fmt, { label: string; tone: string }> = {
  'fmt-ready': { label: '先方の様式あり（読み方あり）', tone: 'ok' },
  'fmt-todo': { label: '先方の様式あり（読み方まだ・手で写す）', tone: 'warn' },
  own: { label: '自社の様式', tone: 'mute' },
};
export type SPerson = {
  id: string; personId: string; name: string; price: number; lower: number; upper: number; fixed?: boolean;
  hours: number; stage: number; issue?: string;
};
export type SFile = { id: string; name: string; who: string | null };
export type Client = { id: string; name: string; close: string; send: string; fmt: Fmt; people: SPerson[]; files: SFile[] };

export const SHEET_REJECT = ['勤務表の合計時間と日ごとの時間が合わない', '現場の責任者の承認（印）が無い', '月の途中までしか書かれていない', '別の月の勤務表が届いた'];

export const CLIENTS: Client[] = [
  { id: 'c-a', name: 'A社', close: '月末締め', send: '翌月3営業日', fmt: 'fmt-ready', files: [{ id: 'f1', name: 'A社_勤務表_10月_山田.pdf', who: 's0412' }], people: [
    { id: 'p1', personId: 's0412', name: '山田 太郎', price: 450000, lower: 140, upper: 180, hours: 184.5, stage: 2 },
    { id: 'p2', personId: 's0501', name: '岡田 修', price: 420000, lower: 140, upper: 180, hours: 132, stage: 1 },
  ] },
  { id: 'c-c', name: 'C社', close: '月末締め', send: '翌月5日', fmt: 'own', files: [{ id: 'f2', name: '10月分_勤怠表.pdf', who: null }], people: [
    { id: 'p3', personId: 's0388', name: '伊藤 誠', price: 420000, lower: 150, upper: 190, hours: 168, stage: 1 },
    { id: 'p4', personId: 's0502', name: '石井 遥', price: 380000, lower: 150, upper: 190, hours: 151, stage: 1 },
  ] },
  { id: 'c-d', name: 'D社', close: '月末締め', send: '翌月3営業日', fmt: 'fmt-todo', files: [], people: [
    { id: 'p5', personId: 's0302', name: '鈴木 一郎', price: 450000, lower: 140, upper: 180, hours: 176, stage: 1, issue: '勤務表の合計時間と日ごとの時間が合わない' },
    { id: 'p6', personId: 's0503', name: '前田 楓', price: 400000, lower: 140, upper: 180, hours: 160, stage: 0 },
    { id: 'p7', personId: 's0504', name: '藤井 隼', price: 400000, lower: 140, upper: 180, hours: 148, stage: 1 },
  ] },
  { id: 'c-f', name: 'F社', close: '月末締め', send: '翌月10日', fmt: 'fmt-ready', files: [{ id: 'f3', name: 'F社_支払明細_10月.pdf', who: 's0410' }], people: [
    { id: 'p8', personId: 's0410', name: '渡辺 涼', price: 410000, lower: 0, upper: 0, fixed: true, hours: 152, stage: 3 },
  ] },
  { id: 'c-g', name: 'G社', close: '20日締め', send: '翌月末', fmt: 'own', files: [{ id: 'f4', name: 'scan_20261021.pdf', who: null }, { id: 'f5', name: 'G社_勤務表_高橋.pdf', who: 's0399' }], people: [
    { id: 'p9', personId: 's0399', name: '高橋 健', price: 400000, lower: 140, upper: 180, hours: 141, stage: 2 },
    { id: 'p10', personId: 's0505', name: '西田 陸', price: 360000, lower: 140, upper: 180, hours: 186, stage: 1 },
    { id: 'p11', personId: 's0506', name: '原 美月', price: 360000, lower: 140, upper: 180, hours: 0, stage: 0 },
  ] },
  { id: 'c-h', name: 'H社', close: '月末締め', send: '翌月5営業日', fmt: 'fmt-todo', files: [], people: [
    { id: 'p12', personId: 's0461', name: '佐藤 光', price: 380000, lower: 160, upper: 200, hours: 152, stage: 1 },
    { id: 'p13', personId: 's0507', name: '小松 大地', price: 380000, lower: 160, upper: 200, hours: 171.5, stage: 1 },
  ] },
  { id: 'c-k', name: 'K社', close: '月末締め', send: '翌月3日', fmt: 'own', files: [], people: [
    { id: 'p14', personId: 's0480', name: '森 拓海', price: 400000, lower: 140, upper: 180, hours: 162, stage: 1 },
    { id: 'p15', personId: 's0508', name: '村上 凛', price: 350000, lower: 140, upper: 180, hours: 139, stage: 1, issue: '現場の責任者の承認（印）が無い' },
    { id: 'p16', personId: 's0509', name: '安藤 湊', price: 350000, lower: 140, upper: 180, hours: 177, stage: 2 },
    { id: 'p17', personId: 's0510', name: '工藤 紬', price: 350000, lower: 140, upper: 180, hours: 0, stage: 0 },
    { id: 'p18', personId: 's0511', name: '宮本 樹', price: 330000, lower: 140, upper: 180, hours: 181, stage: 1 },
  ] },
];

const floor10 = (n: number) => Math.floor(n / 10) * 10;
export function calc(p: SPerson) {
  if (p.fixed) return { amount: p.price, note: '固定（時間によらず1か月分）', diff: 0 };
  const under = floor10(p.price / p.lower), over = floor10(p.price / p.upper);
  if (p.hours < p.lower) { const d = Math.round((p.lower - p.hours) * under); return { amount: p.price - d, note: `控除 ${(p.lower - p.hours).toFixed(1)}h × ${under.toLocaleString()}円`, diff: -d }; }
  if (p.hours > p.upper) { const d = Math.round((p.hours - p.upper) * over); return { amount: p.price + d, note: `超過 ${(p.hours - p.upper).toFixed(1)}h × ${over.toLocaleString()}円`, diff: d }; }
  return { amount: p.price, note: '精算幅の中', diff: 0 };
}
