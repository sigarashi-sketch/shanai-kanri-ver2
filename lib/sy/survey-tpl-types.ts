// 月次アンケート「スコア別の文章」（2026-10-09 shoya）。画面とサーバの両方で使う決め方（ここが唯一の正）。
//   「スコア 5 はこの文章」「5〜7 はこの文章」のように範囲ごとに文章を置き、ボタンで その範囲の回答者の LINE（1:1）へ送る。
//   ・範囲は 1〜10 の整数で、互いに重ならない（1つの回答に当たる文章は 多くて1つ）
//   ・回答は いまのフォームでは「10～8 / 7～6 / 5～3 / 2～1」の帯。帯の回答は **帯がまるごと範囲に入っているとき** だけ当たる
//     （5〜7 なら 7～6 の人だけ。5～3 の人は 3・4 かもしれないので当てない）。重なりで当てると、重ならない2つの範囲の両方に1人が当たる。
//     フォームが 1〜10 の数字1つになれば、その数字が範囲に入るかで決まる（同じ式）
//   ・保存先は saiyou.settings key='survey_templates'。だれに いつ送ったかは line_messages.payload.surveyTpl に残す（表は増やさない）
export interface ScoreRule { id: string; min: number; max: number; text: string }
export const TPL_MAX_RULES = 10;
export const TPL_MAX_TEXT = 2000;

export const ruleLabel = (r: { min: number; max: number }) => (r.min === r.max ? String(r.min) : `${r.min}〜${r.max}`);

// 保存値・画面からの入力を整える。形が違うものは捨てる（min>max は入れ替える）
export function cleanRules(v: unknown): ScoreRule[] {
  const src = Array.isArray(v) ? v : Array.isArray((v as { rules?: unknown } | null)?.rules) ? (v as { rules: unknown[] }).rules : [];
  const out: ScoreRule[] = [];
  const seen = new Set<string>();
  for (const x of src) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const a = Number(o.min), b = Number(o.max);
    if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
    const min = Math.min(a, b), max = Math.max(a, b);
    if (min < 1 || max > 10) continue;
    let id = String(o.id || '').trim().slice(0, 40);
    if (!id || seen.has(id)) id = `r${min}_${max}_${out.length}`;
    seen.add(id);
    out.push({ id, min, max, text: String(o.text ?? '').slice(0, TPL_MAX_TEXT) });
  }
  return out.sort((x, y) => x.min - y.min).slice(0, TPL_MAX_RULES);
}
// 保存できない理由（重なり・本文が空）。問題なければ ''
export function rulesError(rules: readonly ScoreRule[]): string {
  const s = [...rules].sort((x, y) => x.min - y.min);
  for (let i = 0; i < s.length; i++) {
    if (s[i].min > s[i].max) return `スコア ${s[i].min}〜${s[i].max} は 小さいほうを左にしてください`;
    if (i > 0 && s[i].min <= s[i - 1].max) return `スコア ${ruleLabel(s[i - 1])} と ${ruleLabel(s[i])} が重なっています（同じスコアに2つの文章は置けません）`;
    if (!s[i].text.trim()) return `スコア ${ruleLabel(s[i])} の文章が空です`;
  }
  return '';
}
// 回答の文言（"7～6" / "8"）→ スコアの幅。区切りの字（～ 〜 ~ -）が割れるので 数字だけ拾う。読めない・0〜10 の外は null
export function answerRange(manzoku: unknown): { lo: number; hi: number } | null {
  const nums = (String(manzoku ?? '').match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  const hi = Math.max(...nums), lo = Math.min(...nums);
  return hi > 10 || lo < 0 ? null : { lo, hi };
}
export const ruleHits = (r: { min: number; max: number }, manzoku: unknown): boolean => { const a = answerRange(manzoku); return !!a && r.min <= a.lo && a.hi <= r.max; };
// 本文の {名前} を回答者の氏名に差し替える
export const fillTpl = (text: string, name: string) => String(text || '').replace(/\{名前\}|｛名前｝/g, String(name || '').trim());
// 同じ月に2回答えた人は 新しいほうの回答で決める（1人に2通送らない）。key は正規化した氏名
export function latestByPerson<T extends { submitted_at: string }>(rows: readonly T[], keyOf: (r: T) => string): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) { const k = keyOf(r); if (!k) continue; const c = m.get(k); if (!c || r.submitted_at > c.submitted_at) m.set(k, r); }
  return m;
}

export type TplStatus = 'ok' | 'sent' | 'no_line' | 'blocked' | 'many' | 'bousan';   // bousan＝ぼうさん（接触禁止）なので送らない
export interface TplTarget { key: string; name: string; manzoku: string; status: TplStatus; note: string }
