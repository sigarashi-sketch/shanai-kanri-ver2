import 'server-only';
import { ike, onIkeikeDb } from './db';
import { loadForms, readForm } from './forms';
import { normName } from './name';
import { surveyMonthOf } from './survey';
import { loadTeikiRecords } from './teiki';
import { MENDAN_KINDS, mendanKindOf, type MendanKind } from './teiki-types';

// 要員の詳細（MemberDrawer）に出す「活動の記録」。読むだけ。
//   2026-10-05 shoya「名前を押すと アンケートの回答状況・リーダー面談/定期面談/フォロー面談の実施日・勉強会の参加日と回数」
//   ・月次アンケート … いけどん public.monthly_survey_responses（何月分かは lib/survey.ts の区切り）
//   ・面談           … 定期面談ページ（/teiki）と同じ記録（lib/teiki.ts。それゆけの面談メモ＋いけどんの対応歴）
//   ・勉強会         … イベント出欠（/events）に登録してあるフォームのうち 名前に「勉強会」を含むものの回答シート。
//                      ★分かるのは「出席と答えたか」まで（当日ほんとうに来たかの記録はどこにも無い）
export interface SurveyAns { month: string; at: string }
export interface StudyAns { form: string; event: string; answer: string; attend: boolean; at: string }
export interface MemberBase {
  survey: SurveyAns[] | null;   // 新しい順。null＝読めなかった
  surveyLatest: string;         // 全員の回答のうち いちばん新しい「何月分」（'' ＝回答がまだ無い）
  mendan: Record<MendanKind, string[]> | null;   // 区分ごとの実施日時（新しい順）
  // ↓ アクションログ（月ごとの 回答／未回答・実施／未実施）を組むための材料
  surveyMonths: string[];       // 全員の回答に出てくる「何月分」（新しい順）＝アンケートを配った月
  mendanFrom: string;           // 面談の記録が残っている いちばん古い月（'YYYY-MM'・'' ＝記録なし）
  // この人の面談（新しい順・by＝書いた人。分からなければ ''）。押すと中身（議事録）が開くので 本文も持つ。
  //   memoId＝それゆけのメモの id（直す・消すのに使う）。いけどんの対応歴は ''＝見るだけ
  mendanLog: { id: string; memoId: string; at: string; kind: MendanKind; label: string; by: string; body: string; details: { k: string; v: string }[] }[];
  warnings: string[];
}
export interface MemberStudy { study: StudyAns[]; warnings: string[] }

const jstYm = (iso: string) => { const t = Date.parse(iso); return isNaN(t) ? '' : new Date(t + 9 * 3600e3).toISOString().slice(0, 7); };

export async function loadMemberBase(key: string, name: string): Promise<MemberBase> {
  const nn = normName(name);
  const warnings: string[] = [];
  const [sv, tk] = await Promise.all([
    onIkeikeDb()
      ? ike().from('monthly_survey_responses').select('name, submitted_at').order('submitted_at', { ascending: false }).limit(5000)
      : Promise.resolve({ data: null, error: { message: 'いけどんのDBにつながっていません' } }),
    loadTeikiRecords().catch((e) => ({ records: null, warnings: ['面談: ' + (e as Error).message] })),
  ]);
  let survey: SurveyAns[] | null = null; let surveyLatest = ''; let surveyMonths: string[] = [];
  if (sv.error || !sv.data) warnings.push('月次アンケート: ' + (sv.error?.message || '読めませんでした'));
  else {
    const rows = sv.data as { name: string; submitted_at: string }[];
    surveyLatest = rows.length ? surveyMonthOf(rows[0].submitted_at) : '';
    surveyMonths = [...new Set(rows.map((r) => surveyMonthOf(r.submitted_at)))].sort((a, b) => b.localeCompare(a));
    survey = rows.filter((r) => nn && normName(r.name) === nn).map((r) => ({ month: surveyMonthOf(r.submitted_at), at: r.submitted_at }));
  }
  let mendan: MemberBase['mendan'] = null; let mendanFrom = ''; const mendanLog: MemberBase['mendanLog'] = [];
  warnings.push(...tk.warnings);
  if (tk.records) {
    mendan = { leader: [], follow: [], teiki: [] };
    for (const r of tk.records) {
      const ym = jstYm(r.at); if (ym && (!mendanFrom || ym < mendanFrom)) mendanFrom = ym;
      if (!(r.key === key || (nn && normName(r.name) === nn))) continue;
      mendan[mendanKindOf(r)].push(r.at);
      mendanLog.push({ id: r.id, memoId: r.source === 'soreike' ? r.id.slice(2) : '', at: r.at, kind: mendanKindOf(r), label: r.label, by: r.tantouName || r.tantou.split('@')[0], body: r.body, details: r.details });
    }
    MENDAN_KINDS.forEach((k) => mendan![k].sort((a, b) => b.localeCompare(a)));
    mendanLog.sort((a, b) => b.at.localeCompare(a.at));
  }
  return { survey, surveyLatest, mendan, surveyMonths, mendanFrom, mendanLog, warnings };
}

const NEG = /不参加|欠席|^[×✕✖xXｘＸ]$/, POS = /参加|出席|^[〇○◯]$/;
// 勉強会の出欠の回答。1行＝1回の勉強会への答え（「勉強会日時」の列で どの回かを見分ける）。同じ回に答え直したら新しい方
export async function loadMemberStudy(name: string): Promise<MemberStudy> {
  const nn = normName(name);
  const warnings: string[] = [];
  const forms = (await loadForms()).filter((f) => f.title.includes('勉強会'));
  const study: StudyAns[] = [];
  await Promise.all(forms.map(async (f) => {
    try {
      const d = await readForm(f, null);
      if (!d.ok) throw new Error(d.error || '読めませんでした');
      const nameCol = d.header.findIndex((h) => /名前|氏名/.test(h));
      const ansCol = d.header.findIndex((h) => /出欠|可否/.test(h));
      const evCol = d.header.findIndex((h, i) => i !== d.tsCol && /日時|日程|開催/.test(h));
      if (nameCol < 0 || ansCol < 0) throw new Error('名前か出欠の列が見つかりません');
      const last = new Map<string, StudyAns>();
      d.rows.forEach((r) => {
        if (!nn || normName(r[nameCol]) !== nn) return;
        const at = d.tsCol >= 0 ? r[d.tsCol] || '' : '';
        const event = (evCol >= 0 ? r[evCol] : '') || at.slice(0, 10);
        const answer = r[ansCol] || '';
        const p = last.get(event);
        if (!p || at >= p.at) last.set(event, { form: f.title, event, answer, attend: POS.test(answer) && !NEG.test(answer), at });
      });
      study.push(...last.values());
    } catch (e) { warnings.push(`${f.title}: ${(e as Error).message}`); }
  }));
  study.sort((a, b) => b.at.localeCompare(a.at));
  return { study, warnings };
}
