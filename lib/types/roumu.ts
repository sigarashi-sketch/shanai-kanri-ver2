// 労務/営業管理の画面の型と決まり（見本データは持たない・10-26 見本をなくすときに *-sample.ts から移した）。
//   36協定の数字は新宿事業所の協定届（令和7年11月1日〜令和8年10月31日・特別条項あり）のもの（10-23 shoya のPDFから）。
//   事業所ごとに協定が違うことがあるので、事業所ごとに持つときはここを分ける。最終判断は社労士へ。

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

export type Level = 'ok' | 'caution' | 'warn' | 'danger';
export const LEVEL_STYLE: Record<Level, { bg: string; fg: string; label: string; bar: string }> = {
  ok: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)', label: '問題なし', bar: 'var(--tone-ok-bar)' },
  caution: { bg: 'var(--tone-caution-bg)', fg: 'var(--tone-caution-fg)', label: '注意', bar: 'var(--tone-caution-bar)' },
  warn: { bg: 'var(--tone-warn-bg)', fg: 'var(--tone-warn-fg)', label: '警告', bar: 'var(--tone-warn-bar)' },
  danger: { bg: 'var(--tone-bad-bg)', fg: 'var(--tone-bad-fg)', label: '上限間近', bar: 'var(--tone-bad-bar)' },
};

// 有給の年5日（年10日以上付く人は、付いた日から1年のうちに5日取らせる義務）。
export type Leave = { personId: string; name: string; site: string; grantedOn: string; granted: number; taken: number; deadline: string; daysLeft: number; planned?: string };
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

// 派遣契約（準委任は通知の対象外・行は出す）。抵触日＝同じ派遣先の同じ組織で働ける3年の期限（個人単位）。
//   事業所単位の抵触日＝派遣先の事業所が派遣を受け入れられる3年の期限。延ばすなら派遣先が抵触日の1か月前までに意見聴取
//   更新の意向：営業は「提案」まで。確定（confirmed）は労務の権限の人だけ
export type Intent = '未確認' | '更新' | '終了' | '派遣先と調整中';
export type ContractKind = '派遣' | '準委任';
export type ContractDocs = { kobetsu: boolean; daicho: boolean; meiji: boolean };
export const DOC_LABELS: { key: keyof ContractDocs; label: string }[] = [
  { key: 'kobetsu', label: '個別契約書' }, { key: 'daicho', label: '派遣元管理台帳' }, { key: 'meiji', label: '就業条件明示' },
];
export type DispatchContract = {
  personId: string; name: string; site: string; sales: string; kind: ContractKind;
  start: string; end: string; daysLeft: number;
  conflictOn: string; conflictDays: number;                 // 個人単位（準委任は空・使わない）
  officeConflictOn: string; officeConflictDays: number;     // 事業所単位（準委任は空・使わない）
  docs: ContractDocs | null;                                 // 準委任は null
  intent: Intent; confirmed?: boolean; asked?: string;
};
const ymd = (s: string) => { const [y, m, d] = s.split('/').map(Number); return { y, m, d }; };
const dayMs = (s: string) => { const { y, m, d } = ymd(s); return Date.UTC(y, m - 1, d); };
/** 事業所単位の抵触日の1か月前の日（意見聴取の期限）。31日→その月の末日に寄せる */
export function ikenOf(c: DispatchContract): { on: string; days: number } | null {
  if (c.kind !== '派遣' || !c.officeConflictOn) return null;
  const { y, m, d } = ymd(c.officeConflictOn);
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const on = `${py}/${String(pm).padStart(2, '0')}/${String(Math.min(d, last)).padStart(2, '0')}`;
  return { on, days: c.officeConflictDays - Math.round((dayMs(c.officeConflictOn) - dayMs(on)) / 86400000) };
}
/** 更新・終了が確定した（営業の提案だけでは止めない） */
export const contractDecided = (c: DispatchContract) => (c.intent === '更新' || c.intent === '終了') && !!c.confirmed;
export function contractLevel(c: DispatchContract, days: [number, number, number] = [60, 30, 14]): Level {
  if (c.kind === '準委任' || contractDecided(c)) return 'ok';
  const d = Math.min(c.daysLeft, c.conflictDays, ikenOf(c)?.days ?? Infinity);
  if (d <= days[2]) return 'danger';
  if (d <= days[1]) return 'warn';
  if (d <= days[0]) return 'caution';
  return 'ok';
}

// 欠勤管理。連絡の本文をそのまま並べ、欠勤かどうかは人が読んで選ぶ（言葉で欠勤と決めつけない）
export type Kind = '欠勤' | '遅刻' | '後日の相談' | '欠勤ではない' | '未確認';
export const KINDS: Kind[] = ['未確認', '欠勤', '遅刻', '後日の相談', '欠勤ではない'];
export type KekkinRoute = 'グループLINE' | '公式LINE（1:1）' | '電話' | '連絡なし' | 'LINEの欠勤連絡' | '手で追加';
export type Absence = {
  id: string; personId: string; name: string; site: string; sales: string;
  month: string; day: string; at: string; route: KekkinRoute; text: string;
  kind: Kind; reason: string; siteNotified: boolean;
};
// その月の欠勤の回数ごとの対応の目安（今のシステムの決まり）
export const STEPS = ['', '① 営業との面談', '② 来社しての面談（採用＋営業）', '③ 書面での注意・改善の計画', '④ 書面での処分（けん責）を検討・決めるのは人'];

// シフト表。今のシステムのシフトは「出勤（時間つき）」か「休み」の2つだけ
export type ShiftKind = '出勤' | '休み' | '';
export const SHIFT_KINDS: { k: ShiftKind; short: string; time: string; tone: string }[] = [
  { k: '出勤', short: '出', time: '', tone: 'ok' },
  { k: '休み', short: '休', time: '', tone: 'mute' },
  { k: '', short: '', time: '', tone: 'mute' },
];
export type ShiftState = '提出済み' | '下書き' | '未提出';
export type ShiftPerson = { personId: string; name: string; site: string; state: ShiftState; days: ShiftKind[] };

// 勤怠の締め：残業がこれを超える人は、理由を選んでから締める
export const OT_LINE = 45;

// 勤務表の届き具合
export type TsState = '届いた' | '未着' | '読めない';
export type TsRoute = '上位から' | '所属会社から' | '本人から' | '流れが未設定' | '提出不要';
export type TsRow = {
  id: string; partner: string; personId: string; name: string; site: string; route: TsRoute;
  state: TsState; arrivedAt?: string; unreadable?: string;
  sheetH?: number; freeeH?: number; offDays?: number; // 30分以上ずれた日
};

// 当日の出勤状況
export type TodayState = '出勤済み' | '未打刻' | '遅刻の連絡' | '欠勤の連絡' | '休み' | '出発コール未着' | '始業前' | '取得できていない';
export type TodayRow = {
  personId: string; person: string; site: string; sales: string;
  shift: string; state: TodayState; punch?: string; contact?: string; late?: number; memo?: string;
};
