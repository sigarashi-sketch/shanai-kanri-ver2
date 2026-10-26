// 勤怠の締め：今の社内システムの形 → この画面の型。
//   読むのは GET /api/roster?op=shime&action=board（人 × 月のマス目。勤務表 × freee 打刻を日ごとに突き合わせた結果と締め）。
//   ★今のシステムの締めは「勤務表と freee が合っているか」で決める。打刻漏れ・未承認の申請・残業の見込みは持っていない
//   ★月の途中（current）は締められない＝既定で開くのは締められるいちばん新しい月
export type IkeShimeStatus = 'closed' | 'current' | 'match' | 'diff' | 'unread' | 'missing' | 'freee_only' | 'no_record' | 'no_contract' | 'no_freee' | 'empty';
export type IkeShimeCell = {
  status: IkeShimeStatus; diffMins: number | null; diffDays: number; sheetMins: number | null; freeeMins: number;
  company: string; route: string; closedBasis?: string; closedAt?: string; closedBy?: string; reason?: string;
};
export type IkeShimeBoard = {
  ok: boolean; error?: string; months: string[]; currentYm: string;
  rows: { key: string; name: string; kubun: string; cells: Record<string, IkeShimeCell> }[];
  counts: Record<string, Partial<Record<IkeShimeStatus, number>>>;
};

// 今の画面（/kintai-shime.html）の言い方に合わせる
export const SHIME_LABEL: Record<IkeShimeStatus, { label: string; tone: string; todo: boolean }> = {
  closed: { label: '締め済み', tone: 'ok', todo: false },
  match: { label: '一致（締められる）', tone: 'ok', todo: true },
  freee_only: { label: 'freee だけで締められる', tone: 'info', todo: true },
  diff: { label: 'ずれあり', tone: 'warn', todo: true },
  unread: { label: '勤務表は届いたが時間を読めていない', tone: 'caution', todo: true },
  missing: { label: '勤務表が来ていない', tone: 'bad', todo: true },
  no_freee: { label: 'freee の打刻が無い', tone: 'bad', todo: true },
  no_contract: { label: 'その月の稼働契約なし（freee だけ）', tone: 'mute', todo: true },
  no_record: { label: '届き具合の記録が無い月（freee だけ）', tone: 'mute', todo: true },
  current: { label: '月の途中', tone: 'mute', todo: false },
  empty: { label: '—', tone: 'mute', todo: false },
};

export type ShimeLiveRow = { key: string; name: string; company: string; cell: IkeShimeCell };

export const hhmm = (m: number | null) => (m == null ? '—' : `${Math.floor(Math.abs(m) / 60)}:${String(Math.abs(m) % 60).padStart(2, '0')}`);

/** 締められるいちばん新しい月（月の途中より前）。無ければ先頭 */
export function defaultShimeYm(b: IkeShimeBoard | null): string {
  if (!b?.months?.length) return '';
  const past = b.months.filter((m) => m < b.currentYm).sort();
  return past[past.length - 1] || b.months[0];
}

/** その月の行。手を打つもの（ずれ・未着・未読…）が上、締め済みは下 */
export function shimeRowsOf(b: IkeShimeBoard | null, ym: string): ShimeLiveRow[] {
  const order: IkeShimeStatus[] = ['missing', 'no_freee', 'diff', 'unread', 'match', 'freee_only', 'no_contract', 'no_record', 'closed', 'current', 'empty'];
  return (b?.rows || [])
    .map((r) => ({ key: r.key, name: r.name, company: r.cells[ym]?.company || '', cell: r.cells[ym] }))
    .filter((r) => r.cell && r.cell.status !== 'empty')
    .sort((a, b2) => order.indexOf(a.cell.status) - order.indexOf(b2.cell.status) || a.name.localeCompare(b2.name, 'ja'));
}

export const ymLabel = (ym: string) => (ym ? `${Number(ym.slice(5))}月` : '');

// 締めるときの理由（今の画面 kintai-shime.html と同じ選択肢・自由入力にしない）。一致・freee だけ・記録なし・契約なしは理由なしで締められる
/** まとめて締めるとき、1回の POST で送る人数の上限（画面は何回かに分けて送る） */
export const SHIME_BULK_MAX = 5;
export const SHIME_AUTO: IkeShimeStatus[] = ['match', 'freee_only', 'no_record', 'no_contract'];
export const SHIME_REASONS: Partial<Record<IkeShimeStatus, readonly string[]>> = {
  diff: ['freeeを本人に直してもらった', '勤務表の誤り（上位に確認済み）', '休暇・特休の付け方の違い', '差を認めて締める'],
  missing: ['勤務表なしで freee の時間で締める', '上位から勤務表が来ない現場'],
  unread: ['勤務表を目で見て合っていた', 'freee の時間で締める'],
  no_freee: ['freee の打刻漏れを確認済み', '勤務表の時間で締める'],
};
export const reasonsFor = (s: IkeShimeStatus): readonly string[] => (SHIME_AUTO.includes(s) ? [] : SHIME_REASONS[s] || SHIME_REASONS.diff!);
export const ALL_SHIME_REASONS: readonly string[] = Object.values(SHIME_REASONS).flat() as string[];

// ---- 勤怠の照合（経理管理 /keiri/kintai-shogo・10-26）：1人1月の日ごと ----
//   今の GET /api/roster?op=shime&action=detail&ym=&key=（SELECT だけ）。名前を画面の URL に出さないよう POST /api/live/shime {action:'detail'} から読む
export type IkeShimeDay = { date: string; sheet: number | null; freee: number; leave: number; diff: number; ok: boolean; note: string };
export type IkeShimeDetail = {
  ok: boolean; error?: string; ym: string; key: string; name: string; cell: IkeShimeCell;
  compare: { from: string; to: string; sheetMins: number; freeeMins: number; diffMins: number; diffDays: number; days: IkeShimeDay[]; dailyKnown: boolean } | null;
  freeeDays: { date: string; mins: number; leave: number }[] | null;
  freeeMonthMins: number;
  sheet: { file: string; updatedAt: string; hours: number | null; fmt: string } | null;
  freeeSyncedAt: string | null;
  mnm: { company?: string } | null;
  closed: { closed_at?: string; closed_by?: string; reason?: string; diff_mins?: number | null } | null;
  unread?: { why: string; files: { file: string; receivedAt: string | null; state: string; note: string }[] };
};
// 勤務表が比べられない月の説明（今の kintai-shime.html の言い方）
export const SHIME_WHY: Partial<Record<IkeShimeStatus, string>> = {
  unread: '勤務表は届いていますが、時間がまだ読まれていません（取り込んだ勤務表は毎晩 0〜4時にまとめて読みます）。',
  missing: 'この月の勤務表はまだ届いていません（ミンミカの勤務表の届き具合）。',
  freee_only: 'この契約は勤務表の流れが「不要」です。freee の打刻だけです。',
  no_contract: 'この月はミンミカの稼働契約がありません（待機・内勤など）。freee の打刻だけです。',
  no_record: '勤務表の届き具合を記録し始める前の月です。freee の打刻だけです。',
  current: '月の途中です。',
};
/** 差（±つき） */
export const hhmmSigned = (m: number | null) => (m == null ? '—' : m === 0 ? '0:00' : `${m > 0 ? '+' : '−'}${hhmm(m)}`);
