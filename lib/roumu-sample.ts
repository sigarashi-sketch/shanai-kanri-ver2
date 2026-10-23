// 労務/営業管理の見本データ（本物の名前・数字ではない）。
//   残業見込み＝今月の実績 ÷ 経過した所定日 × 今月の所定日（締め日時点で何時間になりそうか）。
//   36協定の数字は新宿事業所の協定届（令和7年11月1日〜令和8年10月31日・特別条項あり）のもの（10-23 shoya のPDFから）。
//   事業所ごとに協定が違うことがあるので、実データにつなぐときは事業所ごとに持つ。最終判断は社労士へ。

export const KYOTEI = {
  office: '新宿事業所',
  validFrom: '2025/11/01', validUntil: '2026/10/31',
  yearStart: '11/1',    // 1年の起算日
  daily: 5,             // 1日の上限（法定労働時間を超える時間）
  monthly: 45,          // 原則の上限（月）
  yearly: 360,          // 原則の上限（年）
  special: true,        // 特別条項あり
  spMonthly: 90,        // 特別条項の月上限（時間外＋休日労働。法の上限は100時間未満）
  spYearly: 720,        // 特別条項の年上限（時間外のみ）
  avgLimit: 80,         // 2〜6か月平均（休日労働込み・法の上限）
  overCount: 6,         // 月45時間を超えてよい回数（年）
  holidayPerMonth: 4,   // 法定休日に働かせてよい日数（1か月）
};

export const MONTH = { label: '10月度', closeOn: '10/31', workdays: 22, passed: 16 };

export type Overtime = {
  personId: string; name: string; site: string; sales: string;
  actual: number;       // 今月の実績（時間・休日労働込み）
  holiday: number;      // そのうち休日労働
  yearTotal: number;    // 今年度の累計（今月の実績を含む）
  over45: number;       // 今年度に月45時間を超えた回数（今月を除く）
  avg26: number;        // 直近2〜6か月平均の最大（今月の見込みを入れたとき）
  trend: number[];      // 直近6か月（古い順）
};

export const OVERTIME: Overtime[] = [
  { personId: 's0388', name: '伊藤 誠', site: 'C社（新宿）', sales: '小林', actual: 35, holiday: 4, yearTotal: 298, over45: 4, avg26: 61, trend: [38, 44, 52, 47, 49, 35] },
  { personId: 's0302', name: '鈴木 一郎', site: 'D社（大手町）', sales: '小林', actual: 27, holiday: 0, yearTotal: 214, over45: 1, avg26: 42, trend: [30, 28, 46, 33, 31, 27] },
  { personId: 's0410', name: '渡辺 涼', site: 'F社（横浜）', sales: '小林', actual: 22, holiday: 0, yearTotal: 160, over45: 0, avg26: 33, trend: [25, 22, 30, 28, 26, 22] },
  { personId: 's0412', name: '山田 太郎', site: 'A社（品川）', sales: '小林', actual: 12, holiday: 0, yearTotal: 98, over45: 0, avg26: 18, trend: [14, 16, 12, 18, 15, 12] },
  { personId: 's0399', name: '高橋 健', site: 'G社（品川）', sales: '田中', actual: 8, holiday: 0, yearTotal: 77, over45: 0, avg26: 12, trend: [10, 11, 9, 12, 13, 8] },
  { personId: 's0461', name: '佐藤 光', site: 'H社（渋谷）', sales: '田中', actual: 36, holiday: 6, yearTotal: 266, over45: 6, avg26: 58, trend: [47, 50, 46, 49, 48, 30] },
];

export const projection = (o: Overtime) => Math.round((o.actual / MONTH.passed) * MONTH.workdays);

export type Level = 'ok' | 'caution' | 'warn' | 'danger';
// 段階つきアラート（注意→警告→上限）。理由も一緒に返す（画面で「なぜ色が付いたか」を出す）。
// 段階の線はアラート設定で選べる（caution＝月45hの何割から・danger＝特別条項の月上限の何割から）
export function otLevel(o: Overtime, caution = 0.8, danger = 0.9): { level: Level; reason: string } {
  const p = projection(o);
  // 特別条項の月上限の9割（81h）から「上限間近」。上限そのものに届いてからでは遅い
  if (p >= KYOTEI.spMonthly * danger) return { level: 'danger', reason: `見込み ${p}h が特別条項の月上限 ${KYOTEI.spMonthly}h の${Math.round(danger * 10)}割を超える` };
  if (o.avg26 >= KYOTEI.avgLimit * 0.9) return { level: 'danger', reason: `2〜6か月平均 ${o.avg26}h が ${KYOTEI.avgLimit}h に近い` };
  if (p > KYOTEI.monthly && o.over45 >= KYOTEI.overCount) return { level: 'danger', reason: `45h超えが今年もう ${o.over45}回。今月超えると ${KYOTEI.overCount}回の枠を超える` };
  if (p > KYOTEI.monthly) return { level: 'warn', reason: `見込み ${p}h が月 ${KYOTEI.monthly}h を超える（今年 ${o.over45 + 1}回目）` };
  if (p >= KYOTEI.monthly * caution) return { level: 'caution', reason: `見込み ${p}h が月 ${KYOTEI.monthly}h の${Math.round(caution * 10)}割に届く` };
  return { level: 'ok', reason: '' };
}

// 有給の年5日（年10日以上付く人は、付いた日から1年のうちに5日取らせる義務）。
export type Leave = { personId: string; name: string; site: string; grantedOn: string; granted: number; taken: number; deadline: string; daysLeft: number; planned?: string };
export const LEAVES: Leave[] = [
  { personId: 's0302', name: '鈴木 一郎', site: 'D社（大手町）', grantedOn: '2025/12/01', granted: 14, taken: 1, deadline: '2026/11/30', daysLeft: 38 },
  { personId: 's0388', name: '伊藤 誠', site: 'C社（新宿）', grantedOn: '2026/04/01', granted: 11, taken: 0, deadline: '2027/03/31', daysLeft: 159 },
  { personId: 's0412', name: '山田 太郎', site: 'A社（品川）', grantedOn: '2026/04/01', granted: 10, taken: 3, deadline: '2027/03/31', daysLeft: 159, planned: '11/14 予定' },
  { personId: 's0410', name: '渡辺 涼', site: 'F社（横浜）', grantedOn: '2026/03/01', granted: 10, taken: 2, deadline: '2027/02/28', daysLeft: 128 },
  { personId: 's0399', name: '高橋 健', site: 'G社（品川）', grantedOn: '2026/05/01', granted: 10, taken: 5, deadline: '2027/04/30', daysLeft: 189 },
];
// 進み具合：期限までに残り日数で取りきれそうか。義務の残りが多いのに期限が近いほど赤。
export function leaveLevel(l: Leave, dangerDays = 60, warnGap = 0.25): Level {
  const need = Math.max(0, 5 - l.taken);
  if (need === 0) return 'ok';
  if (l.daysLeft <= dangerDays) return 'danger';
  const elapsed = 1 - l.daysLeft / 365;
  if (l.taken / 5 < elapsed - warnGap) return 'warn';
  if (l.taken / 5 < elapsed) return 'caution';
  return 'ok';
}

// 派遣契約の終了通知（準委任は対象外）。抵触日＝同じ派遣先の同じ組織で働ける3年の期限（個人単位）。
export type Intent = '未確認' | '更新' | '終了' | '派遣先と調整中';
export type DispatchContract = {
  personId: string; name: string; site: string; sales: string;
  start: string; end: string; daysLeft: number; conflictOn: string; conflictDays: number;
  intent: Intent; asked?: string;
};
export const CONTRACTS: DispatchContract[] = [
  { personId: 's0388', name: '伊藤 誠', site: 'C社（新宿）', sales: '小林', start: '2024/10/01', end: '2026/11/30', daysLeft: 38, conflictOn: '2027/10/01', conflictDays: 343, intent: '未確認' },
  { personId: 's0410', name: '渡辺 涼', site: 'F社（横浜）', sales: '小林', start: '2025/03/01', end: '2026/11/30', daysLeft: 38, conflictOn: '2028/03/01', conflictDays: 495, intent: '派遣先と調整中', asked: '10/20 営業が確認中' },
  { personId: 's0399', name: '高橋 健', site: 'G社（品川）', sales: '田中', start: '2024/11/01', end: '2026/12/31', daysLeft: 69, conflictOn: '2027/11/01', conflictDays: 374, intent: '未確認' },
  { personId: 's0455', name: '加藤 葵', site: 'E社（川崎）', sales: '田中', start: '2026/11/01', end: '2027/01/31', daysLeft: 100, conflictOn: '2029/11/01', conflictDays: 1105, intent: '更新' },
  { personId: 's0474', name: '林 さくら', site: 'J社（池袋）', sales: '田中', start: '2023/12/01', end: '2026/11/30', daysLeft: 38, conflictOn: '2026/12/01', conflictDays: 39, intent: '未確認' },
];
// 何日前に知らせるか（段階）の既定。実際の日数と宛先はアラート設定（lib/alert-rules.ts）を読む。
export const CONTRACT_STEPS = [
  { days: 60, level: 'caution' as Level, label: '60日前', to: ['担当営業'] },
  { days: 30, level: 'warn' as Level, label: '30日前', to: ['担当営業', '労務'] },
  { days: 14, level: 'danger' as Level, label: '14日前', to: ['担当営業', '労務', '全体管理者'] },
];
export function contractLevel(c: DispatchContract, days: [number, number, number] = [60, 30, 14]): Level {
  if (c.intent === '更新' || c.intent === '終了') return 'ok';
  const d = Math.min(c.daysLeft, c.conflictDays);
  if (d <= days[2]) return 'danger';
  if (d <= days[1]) return 'warn';
  if (d <= days[0]) return 'caution';
  return 'ok';
}

export const LEVEL_STYLE: Record<Level, { bg: string; fg: string; label: string; bar: string }> = {
  ok: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)', label: '問題なし', bar: 'var(--tone-ok-bar)' },
  caution: { bg: 'var(--tone-caution-bg)', fg: 'var(--tone-caution-fg)', label: '注意', bar: 'var(--tone-caution-bar)' },
  warn: { bg: 'var(--tone-warn-bg)', fg: 'var(--tone-warn-fg)', label: '警告', bar: 'var(--tone-warn-bar)' },
  danger: { bg: 'var(--tone-bad-bg)', fg: 'var(--tone-bad-fg)', label: '上限間近', bar: 'var(--tone-bad-bar)' },
};
