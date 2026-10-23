// 案件（案件ストック）：今の社内システムの /api/proxy?action=getProgressData の cases（送信に使う案件の控え）→ この画面の形。
//   ・今の案件ストック＝Slack の案件（K番号）＋手貼りの案件（P番号）。送るときに選ぶのと同じもの
//   ・単価・駅・開始・スキルは本文から読める分だけ（今のシステムも本文が正。列として持っていない）
//   ・送れない案件（アダルト・店舗運営系）は今の adultBlockReason と同じ語で止める（blockReason）
//   ・「送った」は今の送信履歴（sends）の送り先の数
//   ・合いそうな要員＝プロパーリストの営業中の人（getEngineerRows の active）。点数は ver2 の目安の式のまま
import type { StockCase } from '../cases-sample';
import type { Taiki } from '../taiki-sample';
import { blockReason, caseTitle, cellsOf, pickLabel, stationIn, type EngineerRows, type ProgressData } from './eigyo-common';

const SKILLS = ['CCNA', 'CCNP', 'LPIC-1', 'LPIC', 'LinuC', 'AWS SAA', 'AWS', 'ITパスポート', '基本情報技術者', '応用情報', 'MOS', 'Java', 'Python', 'Excel', 'Linux', 'Windows Server'];
export const skillsIn = (t: string) => { const out: string[] = []; for (const k of SKILLS) if (t.toLowerCase().includes(k.toLowerCase()) && !out.some((x) => x.includes(k) || k.includes(x))) out.push(k); return out.slice(0, 4); };
const DAY = 86400000;
// 登録の時刻：Slack の案件は ts（秒）、手貼りの案件は date（'YYYY/MM/DD HH:mm' JST）
const regMs = (c: { ts: string; date: string }) => Number(c.ts) * 1000 || Date.parse(c.date.replace(/\//g, '-').replace(' ', 'T') + ':00+09:00') || 0;

export type LiveCase = StockCase & { ng: string | null; sentTo: number; content: string; ageDays: number };

export function liveStock(d: ProgressData | null, nowMs = Date.now()): LiveCase[] {
  if (!d) return [];
  const sent = new Map<string, number>();
  for (const s of d.sends ?? []) sent.set(s.caseNo, (sent.get(s.caseNo) ?? 0) + s.groupIds.length);
  return (d.cases ?? [])
    .filter((c) => c.kNo && (regMs(c) >= nowMs - 14 * DAY || sent.has(c.kNo)))
    .sort((a, b) => regMs(b) - regMs(a))
    .slice(0, 200)
    .map((c) => {
      const t = c.content;
      const priceText = pickLabel(t, ['単価', '金額', '報酬', '月額']);
      const nums = [...priceText.matchAll(/(\d{2,3})(?:\.\d)?\s*万/g)].map((m) => Number(m[1]));
      const reg = regMs(c);
      return {
        no: c.kNo, name: caseTitle(d, c), place: stationIn(t), station: stationIn(t),
        priceMin: nums.length ? Math.min(...nums) : 0, priceMax: nums.length ? Math.max(...nums) : 0,
        skills: skillsIn(t), shouryu: '不明', deadline: c.date.slice(5, 10), daysLeft: 99, ageDays: Math.max(0, Math.round((nowMs - reg) / DAY)),
        start: pickLabel(t, ['開始', '稼働開始', '参画時期', '期間']).slice(0, 16) || '—',
        work: pickLabel(t, ['業務内容', '作業内容', '内容', '業務']) || t.slice(0, 120),
        ng: blockReason(t), sentTo: sent.get(c.kNo) ?? 0, content: t,
      } satisfies LiveCase;
    });
}

/** プロパーリストの営業中の人 → 案件に当てる形。希望単価は今のリストに無いので 0（＝単価の点は入れない） */
export function liveCandidates(d: EngineerRows | null): Taiki[] {
  if (!d) return [];
  return d.rows.filter((r) => r.active).map((r) => {
    const c = cellsOf(d, r);
    return {
      id: r.row, name: r.name, kind: '待機中' as const, station: c.eki.replace(/駅$/, ''), want: c.kibou_shokushu || '—',
      skills: skillsIn(`${c.zenshoku} ${c.summary}`), price: 0, sales: '—', recruiter: c.tantou || '—', state: '案件を探す' as const,
    };
  });
}
