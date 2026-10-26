// ホーム営業の計算（今のシステムの api/_nippo_pl.ts と同じ決まり。迷ったら今の画面が正）。純関数だけ。
//   ・売上＝今月の成約（日報②の契約実績・人月担当＝担当営業）の契約単価（月額）の合計。未経験の要員だけ
//   ・粗利＝単価 − 額面 − 社保（額面×19%・固定）− 交通費。交通費が引けない成約は 0円で出して「交通費未取得」に数える
//   ・額面が分からない成約は売上には入れ、粗利には入れない（粗利率の分母からも外す）。単価が空の成約は売上・粗利に入れない
//   ・請求の無い退場は売上・粗利から引く（成約数には残す）
//
// 本物（10-25〜）：今のシステムに足した GET /api/nippo?action=pl-reps を読む。今のシステムが api/_nippo_pl.ts で計算した値をそのまま出す
//   （駅すぱあとは呼ばない＝交通費は運賃の辞書・キャッシュにある分だけ。無い成約は 0円で fareMissing）。
//
// ver2 に出すのは未経験の人だけ（10-25 shoya）。未経験の正＝今のシステムのプロパーリスト（GET /api/roster?action=getEngineerRows・
//   中身は sales_roster）に名前がある人。空白を外した氏名（normName）で照合する。今のシステムの営業別は
//   「契約実績のステータスが 未経験〜」で決めていて、プロパーリストを見るのはステータスの無い 1〜3月だけ＝少しずれるので、ここで重ねて絞る。
//   本物（10-25〜）：画面で明細（lines）をプロパーリストで絞り、担当ごとの合計は repFromIkeLines で明細から作り直す。
//     明細が返ってこない担当（営業の人が見たときのほかの担当）と前月は、今のシステムの合計のまま（絞れない）
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
  gross?: number | null;      // 本物は今のシステムが出した粗利（額面・交通費の金額は返さない）
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

// ---- 本物：今のシステムの GET /api/nippo?action=pl-reps（10-25 足した口）の形 ----
export type IkePlRep = HeRep & { ym: string; noBillGross: number; acts: Record<string, number> };
export type IkePlLine = { ym: string; tantou: string; name: string; joui: string; status: string; md: string; uriage: number | null; gross: number | null; gakumenKnown: boolean; fareMissing: boolean; shussha: string; noBill: boolean };
export type IkePlReps = { ok?: boolean; ym: string; prev: string; me: string; all: boolean; reps: IkePlRep[]; lines: IkePlLine[]; actLabels: string[]; notes: string[] };

// ---- 本物の明細から担当ごとの合計を作り直す（未経験で絞ったあと・10-25） ----
//   決まりは今のシステムの api/_nippo_pl.ts（営業別の足し方）と同じ順：単価が空→noPrice／請求なし退場→差し引き／粗利が出ない→noGakumen／交通費が引けない→fareMissing
export function repFromIkeLines(tantou: string, lines: readonly IkePlLine[]): HeRep {
  const r: HeRep = { tantou, count: 0, uriage: 0, gross: 0, grossBase: 0, noBillCount: 0, noBillUriage: 0, noPrice: 0, noGakumen: 0, fareMissing: 0 };
  for (const l of lines) {
    if (l.tantou !== tantou) continue;
    r.count++;
    if (l.uriage == null) { r.noPrice++; continue; }
    if (l.noBill) { r.noBillCount++; r.noBillUriage += l.uriage; continue; }
    r.uriage += l.uriage;
    if (l.gross == null) { r.noGakumen++; continue; }
    r.gross += l.gross;
    r.grossBase += l.uriage;
    if (l.fareMissing) r.fareMissing++;
  }
  return r;
}

// 交通費が引けなかった成約は 0円で粗利を出している＝粗利が多めに出る。どれだけ多めかの上限の目安
//   ★今のシステムに交通費の上限は無い。ここでは「1件 月3万円まで」と置いた目安（10-25 ver2 の仮置き。決まったら直す）
export const FARE_CAP_PER_LINE = 30000;
/** 交通費未取得の件数 → 粗利が多めに出ているぶんの上限（円） */
export const fareOverMax = (fareMissing: number) => fareMissing * FARE_CAP_PER_LINE;
/** 粗利に入った成約のうち交通費未取得が 20% を超えたら、粗利率は「参考値」 */
export function grossIsRough(r: Pick<HeRep, 'count' | 'noPrice' | 'noBillCount' | 'noGakumen' | 'fareMissing'>): boolean {
  const n = r.count - r.noPrice - r.noBillCount - r.noGakumen;
  return n > 0 && r.fareMissing / n > 0.2;
}
