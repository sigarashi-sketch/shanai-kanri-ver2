// 月次アンケートの「何月分か」と「誰が答えたか」の決め方（画面とサーバの両方で使う。ここが唯一の正）。
//   アンケートは月末に配って翌月にかけて回答が届くので、回答日時の月では分けられない
//   （9月分を 9/28 に配る → 10/1 の回答も 9月分）。CUTOFF 日以降の回答はその月分、それより前は前の月分として数える。
//   2026-10-02 shoya「21日以降に回答した人はいい」＝区切りは21日（それまでは25日）
export const SURVEY_CUTOFF = 21;
//   2026-10-21 shoya「10月分だけ回答日時ベースにして」: 9/28 に配った回の回答（9/28〜）を 10月分 として数える（その時点で 212件）。
//   10月分の終わりは今までどおり 11/20（11/21〜 は 11月分）。9月分は 8/21〜9/27
const OCT_2026_FROM = Date.UTC(2026, 8, 28) - 9 * 3600e3;    // 2026-09-28 00:00 JST
const OCT_2026_TO = Date.UTC(2026, 10, SURVEY_CUTOFF) - 9 * 3600e3;   // 2026-11-21 00:00 JST
export function surveyMonthOf(iso: string): string {
  const t = new Date(iso).getTime();
  if (t >= OCT_2026_FROM && t < OCT_2026_TO) return '2026-10';
  const d = new Date(t + 9 * 3600e3);   // JST
  let y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  if (d.getUTCDate() < SURVEY_CUTOFF) { m -= 1; if (m === 0) { m = 12; y -= 1; } }
  return `${y}-${String(m).padStart(2, '0')}`;
}
// 回答した人（正規化氏名）の集合を、対象者（正規化氏名）に当てて「回答済みの対象者」を返す。
//   苗字だけで答えた人（例「三野」）: 対象者にその書き出しの人が1人だけなら、その人の回答として数える
export function answeredTargets(answerNorms: Iterable<string>, targetNorms: string[]): Set<string> {
  const targets = new Set(targetNorms);
  const done = new Set<string>();
  for (const n of answerNorms) {
    if (!n) continue;
    if (targets.has(n)) { done.add(n); continue; }
    const hit = targetNorms.filter((t) => t.startsWith(n));
    if (hit.length === 1) done.add(hit[0]);
  }
  return done;
}
// 月次アンケートの対象＝従業員のうち 稼働中・待機（2026-10-02 shoya）。ぼうさん（接触禁止・lib/bousan.ts）は 対象から外す＝未回答に数えない・催促しない（2026-10-11 shoya）
export const isSurveyTarget = (m: { kind: string; status: string; bousan?: boolean }) => m.kind === 'employee' && (m.status === '稼働中' || m.status === '待機') && !m.bousan;
