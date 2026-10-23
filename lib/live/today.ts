// 当日の出勤状況：今の社内システムの形 → この画面の型。
//   読むのは GET /api/kintai-today?date=&stale=1（1段目・キャッシュだけ・すぐ返る）と、続けて ?date=（2段目・freee から取り直す・遅いと40秒台）。
//   欠勤・遅刻の連絡は GET /api/attendance-board?action=absence&date=（LINE の発言を AI で 欠勤/遅刻/早退/… に分けたもの）。
//   ★「何を異常とみなすか」は今のシステムの issues 配列だけで決める（ここで条件を書き足さない）
import type { TodayRow } from '@/lib/kintai-sample';

export type IkeTodayStatus = 'working' | 'nightEnd' | 'punched' | 'unpunched' | 'beforeStart' | 'off' | 'nodata' | 'pending' | 'error' | 'unlinked';
export type IkeTodayRow = {
  key: string; name: string; rep: string; shozoku: string; kind: string; status: IkeTodayStatus; detail: string;
  clockIn: string; clockOut: string; late: number; early: number;
  startTime: string; endTime: string; shiftPlan: 'work' | 'off' | ''; shiftStart: string; shiftEnd: string; shiftImplied?: boolean;
  note: string; noteCarried: boolean; noteDate: string;
  issues: { code: string; label: string; detail: string }[];
};
export type IkeToday = {
  ok: boolean; date: string; dateLabel: string; nowJst: string; rows: IkeTodayRow[];
  counts: Record<IkeTodayStatus, number> & { total: number; issues: number };
  stale?: boolean; pendingCount?: number; cacheAt?: string; error?: { kind: string; message: string } | string;
};
export type IkeAbsence = {
  ok: boolean; date: string; note?: string; error?: string;
  items: { key: string; name: string; resolved: boolean; at: string; isTargetDate: boolean; daysBefore: number; refTarget: boolean; text: string; kind: 'absent' | 'late' | 'early' | 'unknown' | 'punched' | 'off' | 'future' | 'other' }[];
};

const toMin = (s: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

/** 行を画面の型へ。key をそのまま personId にする（ver2 の社員ページの id とはまだ結んでいない）。 */
export function todayFromIke(t: IkeToday | null, ab: IkeAbsence | null): { rows: TodayRow[]; planned: number; done: number; date: string; time: string; stale: boolean } {
  const rows: TodayRow[] = [];
  const now = toMin(t?.nowJst || '');
  const contact = new Map<string, IkeAbsence['items'][number]>();
  for (const it of ab?.ok ? ab.items : []) if (it.key && it.refTarget && (it.kind === 'absent' || it.kind === 'late' || it.kind === 'early') && !contact.has(it.key)) contact.set(it.key, it);
  for (const r of t?.rows || []) {
    const start = r.shiftPlan === 'work' && r.shiftStart ? r.shiftStart : r.startTime;
    const end = r.shiftPlan === 'work' && r.shiftEnd ? r.shiftEnd : r.endTime;
    const shift = r.shiftPlan === 'off' ? (r.shiftImplied ? 'シフト休（空欄）' : 'シフト休') : start ? `${start}〜${end}` : '所定の時間が未設定';
    const s0 = toMin(start);
    const c = contact.get(r.key);
    const issue = r.issues?.length ? r.issues.map((x) => x.label).join('・') : '';
    let state: TodayRow['state'];
    if (c && !r.clockIn) state = c.kind === 'absent' ? '欠勤の連絡' : '遅刻の連絡';
    else if (r.status === 'unpunched' || r.issues?.some((x) => x.code === 'unpunched' || x.code === 'shiftNoPunch')) state = '未打刻';
    else if (r.status === 'working' || r.status === 'punched' || r.status === 'nightEnd') state = '出勤済み';
    else if (r.status === 'beforeStart') state = '始業前';
    else if (r.status === 'off') state = '休み';
    else state = '取得できていない';
    rows.push({
      personId: r.key, person: r.name, site: r.shozoku || '—', sales: r.rep || '未設定', shift, state,
      punch: r.clockIn || undefined,
      contact: c ? `${c.at} ${c.text}` : state === '休み' ? r.kind || r.detail || '休み' : state === '取得できていない' ? r.detail || undefined : undefined,
      late: state === '未打刻' && s0 != null && now != null && now > s0 ? now - s0 : r.late > 0 ? r.late : undefined,
      memo: [issue && state !== '未打刻' ? `異常：${issue}` : '', r.note ? `${r.noteCarried ? `メモ（${r.noteDate.slice(5).replace('-', '/')}）` : 'メモ'}：${r.note.split('\n')[0]}` : ''].filter(Boolean).join(' ／ ') || undefined,
    });
  }
  const k = t?.counts;
  const planned = k ? k.total - k.off - k.nodata - k.unlinked : 0;
  const done = k ? k.working + k.punched + k.nightEnd : 0;
  // dateLabel は今のシステムで '10/23(金)' の形
  return { rows, planned, done, date: (t?.dateLabel || '').replace('(', '（').replace(')', '）'), time: t?.nowJst || '', stale: !!t?.stale };
}
