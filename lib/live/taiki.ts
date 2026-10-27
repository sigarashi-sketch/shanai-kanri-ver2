// 待機・再アサイン：今の社内システムの /api/proxy?action=getRosterStatus（従業員名簿の 待機チェック・待機の予約）
//   ＋ /api/roster?action=getEngineerRows（最寄駅・希望・採用担当）→ この画面の形。
//   ・待機中＝名簿の「待機」にチェックがある人（退社の人は外す）。待機に入った日は今のシステムに残っていない
//   ・もうすぐ待機＝「待機の予約」の日が先にある人（その日の朝に待機へ自動で切り替わる）
//   ・担当営業（成約者）・状態（案件を探す〜）は ver2 で足した（/api/roster?op=eigyo&action=taiki・画面は app/(app)/eigyo/taiki）
import type { Taiki } from '../types/eigyo';
import { skillsIn } from './cases';
import { cellsOf, normName, ymdJst, type EngineerRows } from './eigyo-common';

export type RosterStatus = { normalized_name: string; name: string; taisha: boolean; taisha_bi: string; taiki: boolean; taiki_yotei_bi: string; status_override?: string; taisha_yotei_bi?: string };

export function liveTaiki(st: RosterStatus[] | null, er: EngineerRows | null, nowMs = Date.now()): Taiki[] {
  if (!Array.isArray(st)) return [];
  const today = ymdJst(nowMs);
  const byNorm = new Map<string, Record<string, string> & { id: string }>();
  for (const r of er?.rows ?? []) { const k = normName(r.name); if (!byNorm.has(k)) byNorm.set(k, { ...cellsOf(er!, r), id: r.row }); }
  const out: Taiki[] = [];
  for (const s of st) {
    if (s.taisha) continue;
    const soon = !s.taiki && !!s.taiki_yotei_bi && s.taiki_yotei_bi > today;
    if (!s.taiki && !soon) continue;
    const c = byNorm.get(s.normalized_name || normName(s.name));
    out.push({
      id: c?.id ?? `n:${s.normalized_name}`, name: s.name || s.normalized_name, kind: soon ? 'もうすぐ待機' : '待機中',
      ...(soon ? { contractEnd: s.taiki_yotei_bi, site: '待機の予約' } : {}),
      station: (c?.eki ?? '').replace(/駅$/, '') || '—', want: c?.kibou_shokushu || '—', skills: skillsIn(`${c?.zenshoku ?? ''} ${c?.summary ?? ''}`),
      price: 0, sales: '—', recruiter: c?.tantou || '—', state: '案件を探す',
    });
  }
  return out;
}
