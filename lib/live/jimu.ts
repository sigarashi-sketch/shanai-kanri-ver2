// 参画決定者の手続き（人事管理）の本物。今の社内システムの「事務ページ」（/jimu.html）と同じ API。
//   GET /api/roster?op=jimu&action=list … 名簿に載っていて参画決定がONの人。状態（名簿と同じ判定）・入場日・
//     LINE・勤務区分・シフト表・freee招待・ミンミカ総務手続き7項目・次にやること（今のシステムが上から順に決める）
//   ★今のシステムには 営業 → 人事 → 労務 の列は無い。「次にやること」の中身で列に振り分けて見せるだけ（読むだけ）
//   ★次にやることが「対応なし」の人は、参画予定（まだ入場前）の人だけ「完了」に出す（稼働中で対応なしの人は出さない）
import type { Lane } from '@/lib/jimu-sample';
import { staffIdOf } from './staff';

export type IkeJimuRow = {
  name: string; kana: string; rep: string; tantou: string; shozoku: string; keiyaku: string;
  status: string; statusLabel: string; provisional: boolean; start: string; end: string; nyusha: string; nyuujou: string;
  taiki: boolean; taisha: boolean; kinmu: string; freeeLinked: boolean;
  onboarding: { typeLabel: string; createdAt: string; completedAt: string; steps: { key: string; label: string; value: string; text: string }[] } | null;
  next: { key: string; label: string; done: boolean };
};
export type IkeJimuList = { ok?: boolean; month: string; rows: IkeJimuRow[]; warnings?: string[] };

// 次にやること → どの列のやることか
const LANE_OF: Record<string, Lane> = {
  nyuujou: '営業',
  mnm_missing: '人事', mnm_ambiguous: '人事', freee_invite: '人事', freee_register: '人事', line_1to1: '人事', line_group: '人事',
  kinmu: '労務', freee_link: '労務', shift: '労務',
  ok: '完了',
};

export type LiveHandoff = {
  id: string; personId: string; name: string; sales: string; contract: string; day: string; site: string;
  status: string; lane: Lane; next: string; onboarding: IkeJimuRow['onboarding'];
};

export function toJimuLive(j: IkeJimuList): { rows: LiveHandoff[]; month: string; hiddenDone: number } {
  let hiddenDone = 0;
  const rows: LiveHandoff[] = [];
  (j.rows || []).forEach((r, i) => {
    if (r.taisha || r.next.key === 'taisha') return;
    const lane = LANE_OF[r.next.key] ?? (r.next.done ? '完了' : '人事');
    if (lane === '完了' && r.status !== 'yotei') { hiddenDone++; return; }
    rows.push({
      id: `${staffIdOf(r.name)}-${i}`, personId: staffIdOf(r.name), name: r.name, sales: r.rep || '—', contract: r.keiyaku || '—',
      day: r.nyuujou || '—', site: r.shozoku || '—', status: r.statusLabel, lane, next: r.next.label, onboarding: r.onboarding,
    });
  });
  return { rows, month: j.month || '', hiddenDone };
}
