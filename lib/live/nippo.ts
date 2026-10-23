// 成約日報：今の社内システムの GET /api/nippo（action なし＝init。今の nippo.html を開いたときと同じ・読むだけ）→ この画面の形。
//   ・今日（older=1 なら直近7日）にプロパーリストで「参画決定」が付いた人＝kettei
//   ・名前で探す成約の候補＝seiyakuCand（参画決定がまだの人は送るときに付ける＝addKettei）／経験者の候補＝keikenCand
//   ・退場・退職で選べる人＝roster（今月・先月の稼働管理情報一覧）／内定辞退の候補＝jitaiCand（もう辞退ずみの人は外す）
//   ・今日の数字の項目＝act.items（組シートの自分の表の項目名のまま）／空欄の残る成約＝pending
//   ・「今月の自分」（?action=self）は呼ばない：交通費の計算で駅すぱあと（回数に限りがある）を使うため。送信も止めているので出番が無い
import type { Kettei, Roster } from '../nippo-sample';

type Cand = { nn: string; name: string; shozoku?: string; shozokuRaw?: string; tantou?: string; status?: string; kettei?: boolean; today?: boolean; doneOn?: string };
export type NippoInit = {
  ok: boolean; error?: string; today: string; me: string; tantouList: string[]; kind: 'mikeiken' | 'keiken'; older: boolean;
  statuses: string[]; kaisha: string[]; joui: string[];
  kettei: Cand[]; seiyakuCand: Cand[]; keikenCand: Cand[];
  roster: { name: string; shozoku: string; kubun: '未経験' | '経験者'; start: string }[];
  jitaiCand: { id: string; name: string; tantou: string; kettei: boolean; jitai: boolean; nyuujou: string }[];
  act: { tab: string; items: { label: string; auto: boolean; current?: unknown }[] } | null;
  pending: { id: string; name: string; seiyaku: string; joui: string; needNyuujou: boolean; needUriage: boolean }[];
  submittedToday: boolean;
};

const k = (c: Cand, statuses: string[], today: string): Kettei => ({
  id: c.nn, name: c.name, status: c.status || statuses[0] || '', shozoku: c.shozoku || c.shozokuRaw || '', tantou: c.tantou || '',
  on: c.today === false ? '' : today, ...(c.doneOn ? { doneOn: c.doneOn.slice(5).replace('-', '/') } : {}), ...(c.kettei === false ? { addKettei: true } : {}),
});

export function liveNippo(d: NippoInit | null) {
  if (!d || !d.ok) return null;
  const st = d.statuses || [];
  return {
    today: d.today, me: d.me, reps: d.tantouList || [], kind: d.kind, submitted: !!d.submittedToday,
    // older の行は today:false（直近7日）。older で見るときは画面が全部出す
    kettei: (d.kettei || []).map((c) => k(c, st, d.today)),
    seiyakuCand: (d.seiyakuCand || []).map((c) => ({ ...k({ ...c, today: false }, st, d.today), on: '' })),
    keikenCand: (d.keikenCand || []).map((c) => ({ ...k({ ...c, today: false }, ['再アサイン'], d.today), on: '', status: '再アサイン' })),
    roster: (d.roster || []).map((r): Roster => ({ id: r.name, name: r.name, shozoku: r.shozoku, kubun: r.kubun, start: r.start })),
    jitaiCand: (d.jitaiCand || []).filter((j) => !j.jitai).map((j) => ({ id: j.id, name: j.name, tantou: j.tantou, kettei: j.kettei })),
    actItems: (d.act?.items || []).map((i) => ({ label: i.label, auto: !!i.auto, current: Number(i.current) || 0 })),
    pending: d.pending || [],
  };
}
