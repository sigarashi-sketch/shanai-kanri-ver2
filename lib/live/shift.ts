// シフト表：今の社内システムの形 → この画面の型。
//   読むのは GET /api/shift-calendar?action=month（本人の提出画面が開く月＝20日を過ぎたら翌月）、
//   ?action=list&month=（その月に1日でも入れた人の一覧・submittedAt が空＝下書き）、
//   ?action=detail&month=&user=（1人1月の日ごと：kind=work（時間つき）／off）。
//   ★今のシステムのシフトは「出勤（時間つき）」か「休み」の2つだけ。早番・遅番などの名前は無いので「出」と時間で出す
//   ★提出済みの月の空欄は休みとみなす（今のシステムと同じ）。1日も入れていない人（未提出）はこの口には出てこない
import type { ShiftKind, ShiftPerson } from '@/lib/shift-sample';

export type IkeShiftMonth = { ok: boolean; month: string; choices: string[] };
export type IkeShiftList = {
  ok: boolean; month: string; currentMonth: string; months: string[];
  rows: { lineUserId: string; month: string; name: string; submittedAt: string | null; updatedAt: string | null; work: number; off: number; blank: number; hours: number }[];
};
export type IkeShiftDetail = {
  ok: boolean; month: string; lineUserId: string;
  days: { date: string; kind: 'work' | 'off'; start: string; end: string; overnight: boolean; note: string }[];
};

export function shiftMonthOf(month: string) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return { label: `${m}月`, year: y, month: m, days, firstDow, deadline: '—' };
}

/** 一覧＋日ごと → 画面の行。times は「出」のマスの title に出す時間 */
export function shiftPeopleOf(list: IkeShiftList | null, details: Record<string, IkeShiftDetail | undefined>, month: string): (ShiftPerson & { times: string[] })[] {
  const n = shiftMonthOf(month).days;
  return (list?.rows || []).map((r) => {
    const d = details[r.lineUserId];
    const days = Array.from({ length: n }, () => '' as ShiftKind);
    const times = Array.from({ length: n }, () => '');
    for (const x of d?.days || []) {
      const i = Number(x.date.slice(8, 10)) - 1;
      if (i < 0 || i >= n) continue;
      days[i] = x.kind === 'work' ? '出勤' : '休み';
      times[i] = x.kind === 'work' ? `${x.start}〜${x.overnight ? '翌' : ''}${x.end}` : '';
    }
    return {
      personId: r.lineUserId, name: r.name,
      site: d ? `出勤 ${r.work}日・${r.hours}時間${r.updatedAt ? `・最後に直した日 ${new Date(r.updatedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}` : ''}` : '日ごとを読み込み中…',
      state: (r.submittedAt ? '提出済み' : '下書き') as ShiftPerson['state'], days, times,
    };
  }).sort((a, b) => Number(a.state === '提出済み') - Number(b.state === '提出済み') || a.name.localeCompare(b.name, 'ja'));
}

/** 今日の出勤状況の対象（勤務区分つき）から、シフト提出が要る人（シフト・夜勤）でその月にまだ1日も入れていない人＝未提出 */
export type IkeTodayTargets = { ok: boolean; rows: { name: string; kubun: string; shozoku?: string; rep?: string }[] };
const SHIFT_REQUIRED_KUBUN = ['シフト', '夜勤'];   // 今のシステムの isShiftSubmitRequired と同じ
const nn = (s: string) => s.replace(/[\s　]+/g, '');
export function shiftMissingOf(today: IkeTodayTargets | null, submitted: { name: string }[], month: string): ShiftPerson[] {
  const n = shiftMonthOf(month).days;
  const have = new Set(submitted.map((r) => nn(r.name)));
  const seen = new Set<string>();
  return (today?.rows || [])
    .filter((r) => SHIFT_REQUIRED_KUBUN.includes(r.kubun) && !have.has(nn(r.name)) && !seen.has(nn(r.name)) && seen.add(nn(r.name)))
    .map((r) => ({ personId: `missing:${nn(r.name)}`, name: r.name, site: `勤務区分 ${r.kubun}${r.shozoku ? `・${r.shozoku}` : ''}・まだ1日も入れていません`, state: '未提出' as const, days: Array.from({ length: n }, () => '' as ShiftKind) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}
