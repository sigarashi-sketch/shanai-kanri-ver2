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
