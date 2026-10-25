// 採用（承諾者・面談）：今の社内システムの形 → この画面の型。
//   読むのは GET /api/shoudaku-story?list=1&days=90（今の承諾者ストーリー shoudaku.html の一覧と同じ）。
//   承諾の日時は承諾日（shoudaku_bi）が正（名簿の作成日だけでは判断しない＝今のシステムの shoudakuAt のまま）。
//   ここに出すのは まだ決着していない人（outcome='open'＝参画・辞退・ぽあ のどれでもない）だけ。
//   応募ID・最寄駅・入社予定日・返信の間隔・フォロー面談の記録は、今のシステムの一覧に無い
//   （返信の間隔・フォーム・入社日は別の GET から app/api/live/saiyou-signals が集める＝下の liveSignalLines）
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
    appId: `n:${p.norm}:${i}`, norm: p.norm, name: p.name || p.norm, recruiter: p.tantou || '—', station: '',
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

// ---- 辞退しそうな兆し（本物・2026-10-25 shoya「材料は4つだけ・メモの言葉と ML の点数は使わない」） ----
//   出どころは app/api/live/saiyou-signals（今のシステムの GET を読んで、人ごとに 日数・はい/いいえ だけ返す。トーク本文・メールは返さない）
//   ・本人の返信が止まっている日数 … LINE の最後の受信（1:1 の last_in_at と、名前の入ったグループの lastInAt の新しい方）から何日
//   ・基本情報フォームが未回答     … 基本情報フォームの回答者（basic-info?action=names）に名前が無い
//   ・入社日が決まっていない       … 名簿の入社日（roster?op=nyusha&action=list → 無ければ事務ページの入社日）が空
//   ・フォロー面談の日程変更の回数 … 今のシステムに承諾者のフォロー面談の記録（日程を変えた履歴）が無いので使わない
//   読めなかった材料（null）は「兆しなし」ではなく「わからない」＝兆しに出さない
export type SaiyouSignal = {
  norm: string;
  sameName: boolean;           // 同じ名前の承諾者が2人以上（名前で当てられないので兆しを出さない・10-25）
  lastInDays: number | null;   // 本人の最後の受信から何日（LINE が見つからない・一度も受信が無いときは null）
  noReplyDays: number | null;  // 受信が1回も見つからないときの、承諾日からの日数（LINE が読めないときは null・10-25）
  formDone: boolean | null;    // 基本情報フォームに答えたか（読めなかったら null）
  joinDate: string | null;     // 入社日 'YYYY-MM-DD'（決まっていない・読めないときは null）
};
export type SaiyouSignalsLive = {
  people: SaiyouSignal[];
  shoudaku: IkeShoudakuList;   // 承諾者の一覧（未経験の人だけに絞って数え直したもの・画面は別に読まない・10-25）
  sources: { line: boolean; form: boolean; join: boolean };   // それぞれの材料が読めたか
  warnings: string[]; generatedAt: string;
};
export type SignalLine = { text: string; strong: boolean };

/** 1人分の材料 → 画面に出す兆し（見本の signals と同じ言い方・同じ強さ） */
export function liveSignalLines(s: SaiyouSignal | undefined, src: SaiyouSignalsLive['sources'] | undefined): SignalLine[] {
  const out: SignalLine[] = [];
  if (!s || !src) return out;
  // 同姓同名は名前で当てると別の人の返信・回答を数えてしまう＝判定しない（10-25）
  if (s.sameName) return [{ text: '同姓同名のため判定できません', strong: false }];
  if (src.line && s.lastInDays != null) {
    if (s.lastInDays >= 5) out.push({ text: `本人の返信が ${s.lastInDays}日 止まっている`, strong: true });
    else if (s.lastInDays >= 3) out.push({ text: `本人の返信が ${s.lastInDays}日 空いている`, strong: false });
  }
  // 受信が1回も無い人：承諾から3日たったら出す（5日で強い）。LINE の相手に紐付いていない人もここに入る
  if (src.line && s.lastInDays == null && s.noReplyDays != null && s.noReplyDays >= 3) {
    out.push({ text: `承諾してから一度も返信なし（承諾から ${s.noReplyDays}日）`, strong: s.noReplyDays >= 5 });
  }
  if (src.form && s.formDone === false) out.push({ text: '基本情報フォームがまだ', strong: false });
  if (src.join && !s.joinDate) out.push({ text: '入社日が決まっていない', strong: false });
  return out;
}
