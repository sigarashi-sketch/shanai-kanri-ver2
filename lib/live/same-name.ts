// 同姓同名をつなぐ（設定の中）の形。今のシステムの GET /api/roster?op=person&action=list の sameName（api/_op_person.ts）と同じ形。
import { isMikeiken, type MikeikenSet } from './mikeiken';

export type SameNameCandidate = {
  personId: string; applicantId: string; tantou: string; shozoku: string; eki: string;
  kadouChu: boolean; jitai: boolean; poa: boolean; sankakuKettei: boolean;
};
export type SameNameAnswer = { token: string; personId: string; submittedAt: string; eki: string; where: 'main' | 'extra' };
export type SameNameItem = {
  key: string; name: string; candidates: SameNameCandidate[];
  rosterLink: string; rosterLinkExact: boolean; inRoster: boolean; answers: SameNameAnswer[];
};

/** 未経験の人（今のプロパーリストに入っている名前）だけ。形が崩れた行は捨てる */
export function filterSameName(items: readonly SameNameItem[], mk: MikeikenSet): SameNameItem[] {
  return items.filter((x) => x && Array.isArray(x.candidates) && x.candidates.length >= 2 && isMikeiken(mk, x.name || x.key))
    .map((x) => ({ ...x, answers: Array.isArray(x.answers) ? x.answers : [] }));
}

/** 候補の見分け用の1行（採用担当・所属・最寄駅・状態） */
export function candidateLabel(c: SameNameCandidate): string {
  const st = c.jitai || c.poa ? '辞退・ぽあ' : c.kadouChu ? '稼働中' : c.sankakuKettei ? '参画決定' : '';
  return [`採用担当 ${c.tantou || '—'}`, `所属 ${c.shozoku || '—'}`, `最寄駅 ${c.eki || '—'}`, st].filter(Boolean).join('・');
}

/** まだ決まっていないものの数（名簿の行・だれのか決まっていない回答） */
export function openCount(x: SameNameItem): number {
  return (x.inRoster && !x.rosterLinkExact && !x.rosterLink ? 1 : 0) + x.answers.filter((a) => !a.personId).length;
}
