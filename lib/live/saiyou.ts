// 採用（承諾者・面談）：今の社内システムの形 → この画面の型。
//   読むのは GET /api/shoudaku-story?list=1&days=90（今の承諾者ストーリー shoudaku.html の一覧と同じ）。
//   承諾の日時は承諾日（shoudaku_bi）が正（名簿の作成日だけでは判断しない＝今のシステムの shoudakuAt のまま）。
//   ここに出すのは まだ決着していない人（outcome='open'＝参画・辞退・ぽあ のどれでもない）だけ。
//   応募ID・最寄駅・入社予定日・返信の間隔・フォロー面談の記録は、今のシステムの一覧に無い
import type { Acceptor } from '@/lib/saiyou-sample';

export type IkeShoudakuPerson = { name: string; norm: string; tantou: string; shoudaku_at: string; outcome: 'open' | 'sankaku' | 'jitai' | 'poa'; outcome_at: string | null; days: number | null };
export type IkeShoudakuList = {
  at: string; days: number;
  medians: { sankaku: number | null; jitai: number | null; poa: number | null };
  counts: { sankaku: number; jitai: number; poa: number };
  people: IkeShoudakuPerson[];
};

const jstDate = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t + 9 * 3600e3).toISOString().slice(0, 10) : ''; };

export function acceptorsFromIke(j: IkeShoudakuList | null): Acceptor[] {
  return (j?.people || []).filter((p) => p.outcome === 'open').map((p, i): Acceptor => ({
    appId: `n:${p.norm}:${i}`, name: p.name || p.norm, recruiter: p.tantou || '—', station: '',
    acceptedAt: jstDate(p.shoudaku_at), joinDate: null,
    lastReplyDays: 0, reschedules: 0, formDone: true, words: [], follow: '未設定',
  })).sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt));
}

export function shoudakuNote(j: IkeShoudakuList | null): string {
  if (!j) return '';
  const m = (v: number | null) => (v == null ? '—' : `${v}日`);
  return `直近${j.days}日の承諾者のうち決着前の人だけ。決着までの中央値：参画 ${m(j.medians.sankaku)}（${j.counts.sankaku}人）・辞退 ${m(j.medians.jitai)}（${j.counts.jitai}人）・ぽあ ${m(j.medians.poa)}（${j.counts.poa}人）`;
}

/** 人を絞ったあとの承諾者一覧（未経験の人だけ）。決着ごとの人数と、決着までの日数の中央値を絞った人で数え直す */
export function mikeikenShoudaku(j: IkeShoudakuList, people: IkeShoudakuPerson[]): IkeShoudakuList {
  const med = (o: IkeShoudakuPerson['outcome']) => {
    const d = people.filter((p) => p.outcome === o && typeof p.days === 'number').map((p) => p.days as number).sort((a, b) => a - b);
    if (!d.length) return null;
    const m = Math.floor(d.length / 2);
    return d.length % 2 ? d[m] : Math.round(((d[m - 1] + d[m]) / 2) * 10) / 10;
  };
  const cnt = (o: IkeShoudakuPerson['outcome']) => people.filter((p) => p.outcome === o).length;
  return { ...j, people, medians: { sankaku: med('sankaku'), jitai: med('jitai'), poa: med('poa') }, counts: { sankaku: cnt('sankaku'), jitai: cnt('jitai'), poa: cnt('poa') } };
}
