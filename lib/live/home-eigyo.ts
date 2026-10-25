// ホーム営業の計算（今のシステムの api/_nippo_pl.ts と同じ決まり。迷ったら今の画面が正）。純関数だけ。
//   ・売上＝今月の成約（日報②の契約実績・人月担当＝担当営業）の契約単価（月額）の合計。未経験の要員だけ
//   ・粗利＝単価 − 額面 − 社保（額面×19%・固定）− 交通費。交通費が引けない成約は 0円で出して「交通費未取得」に数える
//   ・額面が分からない成約は売上には入れ、粗利には入れない（粗利率の分母からも外す）。単価が空の成約は売上・粗利に入れない
//   ・請求の無い退場は売上・粗利から引く（成約数には残す）
//
// 本物につないでいない理由：今のシステムには「全員分の営業別」を返す GET が無い（毎朝スプレッドシートの「営業別」タブに書くだけ）。
//   本人の分の GET /api/nippo?action=self は、呼ぶたびに交通費の計算で駅すぱあと（回数に上限がある有料 API）を最大10回使う
//   （maxCalls: 10 が固定で 0 にできない）ので、この画面からは呼ばない。読める口ができたら、ここに形の変換を足す。
//
// ver2 に出すのは未経験の人だけ（10-25 shoya）。未経験の正＝今のシステムのプロパーリスト（GET /api/roster?action=getEngineerRows・
//   中身は sales_roster）に名前がある人。空白を外した氏名（normName）で照合する。今のシステムの営業別は
//   「契約実績のステータスが 未経験〜」で決めていて、プロパーリストを見るのはステータスの無い 1〜3月だけ＝少しずれるので、ここで重ねて絞る。
import { normName } from './eigyo-common';

export const SHAHO_RATE = 0.19;

export type Shussha = 'jouchuu' | 'hybrid' | 'remote';
export const SHUSSHA_LABEL: Record<Shussha, string> = { jouchuu: '常駐', hybrid: 'リモート併用', remote: 'フルリモート' };

export type HeLine = {
  tantou: string; name: string; joui: string;
  status: '未経験新規' | '未経験再アサイン' | '未経験待機成約';
  md: string;                 // 成約日（M/D）
  uriage: number | null;      // 契約単価（月額・円）
  gakumen: number | null;     // 額面（円）
  fare: number | null;        // 月の交通費（円）。引けなければ null
  shussha: Shussha;
  noBill: boolean;            // 請求の無い退場で差し引いた
};
export type HeRepPrev = { count: number; uriage: number; gross: number };
export type HeRep = {
  tantou: string; count: number; uriage: number; gross: number; grossBase: number;
  noBillCount: number; noBillUriage: number; noPrice: number; noGakumen: number; fareMissing: number;
};

/** プロパーリストに名前がある成約だけ残す（未経験の正） */
export function onlyProper<T extends { name: string }>(lines: T[], properNames: readonly string[]): { kept: T[]; dropped: number } {
  const set = new Set(properNames.map(normName));
  const kept = lines.filter((l) => set.has(normName(l.name)));
  return { kept, dropped: lines.length - kept.length };
}

export function grossOf(l: Pick<HeLine, 'uriage' | 'gakumen' | 'fare'>): { shaho: number | null; gross: number | null } {
  if (l.gakumen == null) return { shaho: null, gross: null };
  const shaho = Math.round(l.gakumen * SHAHO_RATE);
  return { shaho, gross: l.uriage == null ? null : l.uriage - l.gakumen - shaho - (l.fare ?? 0) };
}

export function repOf(tantou: string, lines: HeLine[]): HeRep {
  const r: HeRep = { tantou, count: 0, uriage: 0, gross: 0, grossBase: 0, noBillCount: 0, noBillUriage: 0, noPrice: 0, noGakumen: 0, fareMissing: 0 };
  for (const l of lines) {
    if (l.tantou !== tantou) continue;
    r.count++;
    if (l.uriage == null) { r.noPrice++; continue; }
    if (l.gakumen == null) r.noGakumen++;
    if (l.fare == null && l.gakumen != null && l.shussha !== 'remote') r.fareMissing++;
    const g = grossOf(l).gross;
    if (l.noBill) { r.noBillCount++; r.noBillUriage += l.uriage; continue; }
    r.uriage += l.uriage;
    if (g != null) { r.gross += g; r.grossBase += l.uriage; }
  }
  return r;
}

export const rate = (gross: number, base: number) => (base > 0 ? (gross / base) * 100 : 0);
export const manOf = (yen: number) => Math.round(yen / 10000);
export const yen = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('ja-JP')}円`);
