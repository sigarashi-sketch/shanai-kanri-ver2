// 交通費チェックの見本データ（本物の名前・数字ではない）。
//   今のシステムの交通費チェック（経費の明細＝日ごと × freee の打刻）の決まりをそのまま載せる：
//   ・出勤＝出勤か退勤の打刻がある日。片側だけは「片側だけの打刻」
//   ・在籍期間（入社日〜退社日）の外の日は打刻なしに数えない。申請があれば「在籍期間外の日」
//   ・退場して待機中の日は打刻漏れにしない（申請があれば拾う）
//   ・土日祝に2日以上出勤している人はシフト勤務＝平日の打刻なしを漏れにしない
//   ・申請月に1つでも引っかかれば差し戻し対象
export type Punch = 'both' | 'in' | 'out';
export type CheckPerson = {
  id: string; personId: string; name: string; site: string; amount: number;
  claims: number[];                       // 交通費を申請した日
  punches: Record<number, Punch>;         // freee の打刻（無い日は打刻なし）
  entry?: number; retire?: number;        // 在籍期間（月の途中の入社・退社）
  taiki?: [number, number];               // 待機中の日（退場〜次の入場の前）
};
export type MonthData = { key: string; label: string; year: number; month: number; lastDay: number; holidays: number[]; people: CheckPerson[] };

const WD = (y: number, m: number, d: number) => new Date(y, m - 1, d).getDay();
const isOff = (y: number, m: number, d: number, hol: number[]) => [0, 6].includes(WD(y, m, d)) || hol.includes(d);
// 平日は全部打刻あり（両側）で作り、例外だけ上書きする
function weekdays(y: number, m: number, last: number, hol: number[], skip: number[] = [], over: Record<number, Punch | null> = {}) {
  const p: Record<number, Punch> = {};
  for (let d = 1; d <= last; d++) if (!isOff(y, m, d, hol) && !skip.includes(d)) p[d] = 'both';
  for (const [d, v] of Object.entries(over)) { if (v) p[Number(d)] = v; else delete p[Number(d)]; }
  return p;
}
const daysOf = (p: Record<number, Punch>) => Object.keys(p).map(Number);

const OCT_HOL = [12];
const O = (skip?: number[], over?: Record<number, Punch | null>) => weekdays(2026, 10, 23, OCT_HOL, skip, over);
// 森さんはシフト勤務（土日も出る・平日に休み）
const moriPunch: Record<number, Punch> = { 3: 'both', 4: 'both', 10: 'both', 11: 'both', 12: 'both', 17: 'both', 18: 'both', 1: 'both', 2: 'both', 6: 'both', 7: 'both', 13: 'both', 14: 'both', 19: 'both', 20: 'both', 21: 'both' };

export const MONTHS: MonthData[] = [
  {
    key: '2026-10', label: '10月（1日〜23日）', year: 2026, month: 10, lastDay: 23, holidays: OCT_HOL, people: [
      { id: 'k1', personId: 's0302', name: '鈴木 一郎', site: 'D社（大手町）', amount: 9240, punches: O([], { 21: 'in' }), claims: daysOf(O([], { 21: 'in' })) },
      { id: 'k2', personId: 's0410', name: '渡辺 涼', site: 'F社（横浜）', amount: 4080, punches: O([13]), claims: [...daysOf(O([13])), 13] },
      { id: 'k3', personId: 's0441', name: '中村 優', site: '—（待機）', amount: 2720, punches: O([16, 19, 20, 21, 22, 23]), claims: [...daysOf(O([16, 19, 20, 21, 22, 23])), 20], taiki: [16, 23] },
      { id: 'k4', personId: 's0495', name: '小川 翼', site: 'E社（川崎）', amount: 3360, entry: 6, punches: O([1, 2, 5]), claims: [2, ...daysOf(O([1, 2, 5]))] },
      { id: 'k5', personId: 's0480', name: '森 拓海', site: 'K社（品川）', amount: 4800, punches: moriPunch, claims: daysOf(moriPunch) },
      { id: 'k6', personId: 's0461', name: '佐藤 光', site: 'H社（渋谷）', amount: 6300, punches: O([9, 23]), claims: daysOf(O([9, 23])) },
      { id: 'k7', personId: 's0399', name: '高橋 健', site: 'G社（品川）', amount: 1760, punches: O(), claims: daysOf(O()) },
      { id: 'k8', personId: 's0412', name: '山田 太郎', site: 'A社（品川）', amount: 5440, punches: O([], { 15: 'out' }), claims: daysOf(O()) },
      { id: 'k9', personId: 's0388', name: '伊藤 誠', site: 'C社（新宿）', amount: 0, punches: O(), claims: [] },
      { id: 'k10', personId: 's0472', name: '松本 結衣', site: 'L社（赤羽）', amount: 3920, retire: 16, punches: O([19, 20, 21, 22, 23]), claims: [...daysOf(O([19, 20, 21, 22, 23])), 19] },
    ],
  },
  {
    key: '2026-09', label: '9月', year: 2026, month: 9, lastDay: 30, holidays: [21, 22, 23], people: [
      { id: 'q1', personId: 's0302', name: '鈴木 一郎', site: 'D社（大手町）', amount: 9856, punches: weekdays(2026, 9, 30, [21, 22, 23]), claims: daysOf(weekdays(2026, 9, 30, [21, 22, 23])) },
      { id: 'q2', personId: 's0410', name: '渡辺 涼', site: 'F社（横浜）', amount: 5168, punches: weekdays(2026, 9, 30, [21, 22, 23], [], { 8: 'in' }), claims: daysOf(weekdays(2026, 9, 30, [21, 22, 23])) },
    ],
  },
];

export type DayKind = 'ok' | 'noPunch' | 'half' | 'outside' | 'taiki' | 'leak' | 'off' | 'none';
export const DAY_STYLE: Record<DayKind, { bg: string; fg: string; label: string; issue: boolean }> = {
  noPunch: { bg: 'var(--tone-bad-bg)', fg: 'var(--tone-bad-fg)', label: '打刻の無い日の申請', issue: true },
  half: { bg: 'var(--tone-warn-bg)', fg: 'var(--tone-warn-fg)', label: '片側だけの打刻', issue: true },
  outside: { bg: 'var(--tone-purple-bg)', fg: 'var(--tone-purple-fg)', label: '在籍期間外の日', issue: true },
  taiki: { bg: 'var(--tone-info-bg)', fg: 'var(--tone-info-fg)', label: '待機中の日', issue: true },
  leak: { bg: 'var(--tone-caution-bg)', fg: 'var(--tone-caution-fg)', label: '平日に打刻なし', issue: true },
  ok: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)', label: '打刻あり', issue: false },
  off: { bg: 'transparent', fg: 'var(--color-faint)', label: '休み', issue: false },
  none: { bg: 'var(--tone-mute-bg)', fg: 'var(--tone-mute-fg)', label: '期間外・待機（申請なし）', issue: false },
};

export type Judged = { p: CheckPerson; days: { d: number; dow: number; kind: DayKind; claim: boolean }[]; shift: boolean; issues: Partial<Record<DayKind, number>>; n: number };

export function judge(m: MonthData, p: CheckPerson): Judged {
  const offDays = Array.from({ length: m.lastDay }, (_, i) => i + 1).filter((d) => isOff(m.year, m.month, d, m.holidays));
  const shift = offDays.filter((d) => p.punches[d]).length >= 2;
  const issues: Partial<Record<DayKind, number>> = {};
  const days = Array.from({ length: m.lastDay }, (_, i) => {
    const d = i + 1;
    const dow = WD(m.year, m.month, d);
    const claim = p.claims.includes(d);
    const pu = p.punches[d];
    const outside = (p.entry && d < p.entry) || (p.retire && d > p.retire);
    const taiki = p.taiki && d >= p.taiki[0] && d <= p.taiki[1];
    let kind: DayKind;
    if (outside) kind = claim ? 'outside' : 'none';
    else if (taiki && !pu) kind = claim ? 'taiki' : 'none';
    else if (pu === 'in' || pu === 'out') kind = 'half';
    else if (pu) kind = 'ok';
    else if (claim) kind = 'noPunch';
    else if (!offDays.includes(d) && !shift) kind = 'leak';
    else kind = 'off';
    if (DAY_STYLE[kind].issue) issues[kind] = (issues[kind] || 0) + 1;
    return { d, dow, kind, claim };
  });
  return { p, days, shift, issues, n: Object.values(issues).reduce((a, b) => a + (b || 0), 0) };
}

// 差し戻しの理由（選ぶだけ）。「いちばん多い理由」を先に選んでおく
export const REASONS: Record<string, string> = {
  noPunch: '打刻の無い日に交通費の申請があります',
  half: '打刻が出勤か退勤の片方だけの日があります',
  outside: '在籍期間の外の日に申請があります',
  taiki: '待機中の日に通勤の申請があります',
  leak: '出勤日に打刻がありません（打刻修正を出してください）',
};
