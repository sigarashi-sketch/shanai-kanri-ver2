// 勤務表の届き具合：今の社内システムの形 → この画面の型。
//   読むのは GET /api/roster?op=timesheet&action=list[&ym=YYYY-MM]（ミンミカの稼働契約ごとの 流れ・締切・届いたファイル）。
//   既定の月は今のシステムと同じ＝先月（勤務表は翌月の頭に届く）。
//   ★届いたか＝ファイルが1つ以上あるか だけ（今のシステムと同じ）。「読めない」と freee との差はこの口には無い（勤怠の締めの画面にある）
//   ★流れが「提出不要」の契約は届かなくてよいので一覧から外し、件数だけ出す
import type { TsRow } from '@/lib/types/roumu';

export type IkeTsGroup = 'none' | 'upper' | 'shozoku' | 'self' | 'unknown';
export type IkeTsItem = {
  ym: string; period_id: string; name: string; member_type: string; company: string; partner: string; shozoku: string;
  project: string; route: string; deadline: string; checker: string; start_date: string; end_date: string;
  files: number; last_file_at: string | null; group: IkeTsGroup; arrival: 'arrived' | 'missing' | 'na';
};
export type IkeTimesheet = {
  ok: boolean; error?: string; ym: string; months: string[]; syncedAt: string; groupLabels: Record<IkeTsGroup, string>;
  items: IkeTsItem[]; counts: { arrived: number; missing: number; na: number };
};

const ROUTE: Record<IkeTsGroup, TsRow['route']> = { upper: '上位から', shozoku: '所属会社から', self: '本人から', unknown: '流れが未設定', none: '提出不要' };
const md = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };

export function tsFromIke(t: IkeTimesheet | null): { rows: TsRow[]; na: number; label: string; synced: string } {
  const rows = (t?.items || []).filter((r) => r.arrival !== 'na').map((r, i) => ({
    id: r.period_id || `${r.name}-${i}`, partner: r.partner || r.shozoku || '取引先が未設定', personId: '', name: r.name,
    site: [r.project, r.deadline && `締切 ${r.deadline}`, r.checker && `確認 ${r.checker}`].filter(Boolean).join('・'),
    route: ROUTE[r.group], state: r.arrival === 'arrived' ? '届いた' : '未着', arrivedAt: md(r.last_file_at) || undefined,
  } as TsRow));
  const [y, m] = (t?.ym || '').split('-');
  return { rows, na: t?.counts?.na || 0, label: t?.ym ? `${y}年${Number(m)}月分` : '', synced: t?.syncedAt ? new Date(t.syncedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '' };
}
