// 入社手続き（人事管理）の本物。今の社内システムの「入社手続きの進み具合（担当向け）」（/nyusha-admin.html）と同じ API。
//   GET /api/nyusha-progress?days=60 … 参画決定（辞退でない）で、参画決定の日が60日以内の人＋それより前でも印が付けかけの人
//   ★印（済み/対象外）は今のシステムでも人が付ける。ここは読むだけ（POST action=set/memo は呼ばない）
//   ★項目は今のシステムのもの（雇用契約サイン・freee 入社手続き・履歴書・健康診断・源泉徴収票(任意)・雇用保険証(任意)）
import type { StepState } from '@/lib/nyusha-sample';
import { jstToday, parseDateIso, staffIdOf } from './staff';

export type IkeNyushaItem = { key: string; label: string; opt?: boolean };
export type IkeNyushaRow = {
  id: string; name: string; tantou: string; shozoku: string; nyuujou_bi: string; kadou_chu: boolean; decided_at: string;
  notice: string; checks: Record<string, { v: 'done' | 'na'; at?: string; by?: string }>; memo: string;
  progress: { done: number; need: number; complete: boolean };
};
export type IkeNyushaProgress = { ok?: boolean; rows: IkeNyushaRow[]; items: IkeNyushaItem[]; days: number };

export type LiveStep = { key: string; label: string; optional?: boolean; to: string };
export type LiveNewcomer = {
  id: string; personId: string; name: string; kind: '参画決定'; joinOn: string; joinRaw: string; decidedAt: string;
  site: string; recruiter: string; notice: string; steps: Record<string, StepState>;
};

export function toNyushaLive(j: IkeNyushaProgress): { steps: LiveStep[]; rows: LiveNewcomer[]; today: string } {
  const steps: LiveStep[] = (j.items || []).map((i) => ({ key: i.key, label: i.label, optional: !!i.opt, to: '' }));
  const rows = (j.rows || []).map((r): LiveNewcomer => ({
    id: r.id, personId: staffIdOf(r.name), name: r.name, kind: '参画決定',
    joinOn: parseDateIso(r.nyuujou_bi), joinRaw: r.nyuujou_bi || '', decidedAt: String(r.decided_at || '').slice(0, 10),
    site: r.shozoku || '—', recruiter: r.tantou || '—', notice: r.notice || '',
    steps: Object.fromEntries(steps.map((s) => {
      const v = r.checks?.[s.key]?.v;
      return [s.key, v === 'done' ? '済み' : v === 'na' ? '対象外' : 'まだ'];
    })) as Record<string, StepState>,
  }));
  return { steps, rows, today: jstToday() };
}

/** 今のシステムの progressOf と同じ：対象外は数えない・任意は印が無ければ数えない → 残りは「必須でまだ」の数 */
export const openOf = (steps: LiveStep[], n: { steps: Record<string, StepState> }) => steps.filter((s) => !s.optional && n.steps[s.key] === 'まだ').length;
export const daysUntil = (iso: string, today: string) => (iso ? Math.round((Date.parse(iso) - Date.parse(today)) / 86400000) : null);
