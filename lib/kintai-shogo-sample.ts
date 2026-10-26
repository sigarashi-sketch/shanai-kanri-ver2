// 勤怠の照合（/keiri/kintai-shogo）の見本データ（本物の名前・数字ではない）。
//   形は今の GET /api/roster?op=shime&action=board|detail と同じ（lib/live/shime.ts の型）。日ごとは決まった式で作る
import type { IkeShimeBoard, IkeShimeCell, IkeShimeDay, IkeShimeDetail, IkeShimeStatus } from './live/shime';

const YM = '2026-09';
type Kind = { key: string; name: string; company: string; status: IkeShimeStatus; plus?: number; skip?: number[]; extra?: Record<number, number> };
// plus＝freee が毎日何分長いか／skip＝freee の打刻が無い日／extra＝その日だけ勤務表が長い分
const PEOPLE: Kind[] = [
  { key: 'itou', name: '伊藤 誠', company: 'C社（新宿）', status: 'diff', plus: 35 },
  { key: 'suzuki', name: '鈴木 一郎', company: 'D社（大手町）', status: 'diff', skip: [9, 22] },
  { key: 'watanabe', name: '渡辺 涼', company: 'F社（横浜）', status: 'diff', extra: { 10: 120, 25: 90 } },
  { key: 'sato', name: '佐藤 光', company: 'H社（渋谷）', status: 'match', plus: 10 },
  { key: 'yamada', name: '山田 太郎', company: 'A社（品川）', status: 'match' },
  { key: 'mori', name: '森 拓海', company: 'K社（品川）', status: 'closed', plus: 5 },
  { key: 'takahashi', name: '高橋 健', company: 'G社（品川）', status: 'unread' },
  { key: 'hayashi', name: '林 さくら', company: 'M社（池袋）', status: 'missing' },
  { key: 'matsumoto', name: '松本 結衣', company: 'L社（赤羽）', status: 'freee_only' },
];
const HOLI = new Set(['2026-09-21', '2026-09-22', '2026-09-23']);   // 敬老の日・国民の休日・秋分の日

function workDays(): string[] {
  const out: string[] = [];
  for (let d = 1; d <= 30; d++) {
    const s = `${YM}-${String(d).padStart(2, '0')}`;
    const w = new Date(`${s}T00:00:00Z`).getUTCDay();
    if (w !== 0 && w !== 6 && !HOLI.has(s)) out.push(s);
  }
  return out;
}

function daysOf(p: Kind): IkeShimeDay[] {
  return workDays().map((date) => {
    const n = Number(date.slice(8));
    const sheet = 480 + (p.extra?.[n] || 0);
    const freee = p.skip?.includes(n) ? 0 : 480 + (p.plus || 0) + ((n * 7) % 11);
    const leave = p.key === 'yamada' && n === 15 ? 480 : 0;
    const s = leave ? 0 : sheet, f = leave ? 0 : freee;
    const diff = s - f;
    const ok = Math.abs(diff) < 30;
    return { date, sheet: s, freee: f, leave, diff, ok, note: leave ? '休暇' : !f && s ? 'freee の打刻なし' : ok ? (diff ? '丸め内' : '') : diff > 0 ? '勤務表のほうが長い' : 'freee のほうが長い' };
  });
}

function cellOf(p: Kind): IkeShimeCell {
  const base = { company: p.company, route: '', freeeMins: 0, sheetMins: null as number | null, diffMins: null as number | null, diffDays: 0 };
  const days = daysOf(p);
  const fm = days.reduce((a, d) => a + d.freee, 0);
  if (['unread', 'missing', 'freee_only'].includes(p.status)) return { ...base, status: p.status, freeeMins: fm };
  const sm = days.reduce((a, d) => a + (d.sheet || 0), 0);
  const bad = days.filter((d) => !d.ok).length;
  const cell: IkeShimeCell = { ...base, status: p.status === 'closed' ? 'closed' : bad ? 'diff' : 'match', sheetMins: sm, freeeMins: fm, diffMins: sm - fm, diffDays: bad };
  if (p.status === 'closed') return { ...cell, closedAt: '2026-10-06T10:00:00+09:00', closedBy: '経理（見本）', reason: '' };
  return cell;
}

export const SHOGO_SAMPLE_BOARD: IkeShimeBoard = {
  ok: true, months: [YM], currentYm: '2026-10',
  rows: PEOPLE.map((p) => ({ key: p.key, name: p.name, kubun: '未経験', cells: { [YM]: cellOf(p) } })),
  counts: {},
};

export function shogoSampleDetail(key: string): IkeShimeDetail | null {
  const p = PEOPLE.find((x) => x.key === key);
  if (!p) return null;
  const cell = cellOf(p);
  const days = daysOf(p);
  const comparable = cell.sheetMins != null;
  return {
    ok: true, ym: YM, key, name: p.name, cell,
    compare: comparable ? { from: `${YM}-01`, to: `${YM}-30`, sheetMins: cell.sheetMins!, freeeMins: cell.freeeMins, diffMins: cell.diffMins!, diffDays: cell.diffDays, days, dailyKnown: true } : null,
    freeeDays: comparable ? null : days.map((d) => ({ date: d.date, mins: d.freee, leave: d.leave })),
    freeeMonthMins: cell.freeeMins,
    sheet: comparable ? { file: `稼働表_202609_${p.name.replace(' ', '')}.xlsx`, updatedAt: '2026-10-03T02:10:00+09:00', hours: Math.round(cell.sheetMins! / 6) / 10, fmt: '' } : null,
    freeeSyncedAt: '2026-10-25T06:00:00+09:00',
    mnm: { company: p.company },
    closed: cell.status === 'closed' ? { closed_at: cell.closedAt, closed_by: cell.closedBy, reason: '', diff_mins: cell.diffMins } : null,
    unread: p.status === 'unread' ? { why: '書式を読めなかった', files: [{ file: '9月勤務表_G社.pdf', receivedAt: '2026-10-02T09:00:00+09:00', state: 'failed', note: '表の形が決まった読み方に合わない' }] } : undefined,
  };
}
