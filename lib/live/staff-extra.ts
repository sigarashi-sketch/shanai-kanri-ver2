// 社員一覧（人事）に足した材料の形（10-25）。/api/live/staff の答えに足して返す（どれも読むだけ）。
//   rule    … ルール欠勤の回数（GET /api/roster?op=extra&action=ruleAbsence・今の名簿の「ルール欠勤」「フェーズ」と同じ数え方）。
//             「数えない」にした日は引く。理由（診断書など）は画面に渡さない
//   yoyaku  … 待機・退社の予約（getRosterStatus の taiki_yotei_bi / taisha_yotei_bi）。月に関係なく生きているので名簿の行ではなく印そのものから作る
import type { LiveStaffList } from './staff';

export type IkeRuleAbsence = { ok?: boolean; since?: string; overlay?: Record<string, { days?: { d: string; kinds?: string[]; ex?: boolean }[] }> };
export type StaffYoyaku = { name: string; kind: 'taiki' | 'taisha'; date: string };
export type StaffRule = { ok: boolean; since: string; n: Record<string, number> };
export type LiveStaffListX = LiveStaffList & { rule?: StaffRule; yoyaku?: StaffYoyaku[] };

export function ruleCounts(j: IkeRuleAbsence | null): StaffRule {
  if (!j || j.ok === false) return { ok: false, since: j?.since || '', n: {} };
  const n: Record<string, number> = {};
  for (const [k, v] of Object.entries(j.overlay || {})) n[k] = (v.days || []).filter((d) => !d.ex).length;
  return { ok: true, since: j.since || '', n };
}
