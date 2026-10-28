import 'server-only';
import { db, likePrefix } from '../../db';
import { saveAttempt } from '../../kyouiku';
import type { LecChapterSum, LecChapterView, LecCheck, LecPart, LecState } from '../lecture-types';
import type { LecChapter } from './types';
import { A1 } from './a1';
import { A2 } from './a2';
import { A3 } from './a3';
import { A4 } from './a4';
import { A5 } from './a5';
import { A6 } from './a6';

// CCNA の講義（メインの教材・2026-10-09 shoya）。章ごとに 解説を読む → 穴埋め。全部の穴が合ったら合格で、次の章が開く（super admin は全部開く）
//   ・中身は a1〜a6.ts（正解入り＝サーバだけ）。画面に渡すのは 穴を番号に置きかえた形（toView）
//   ・記録は kyouiku_progress の quest='_ccnalec:<章id>'（表は増やさない）。答え合わせ1回＝1行・ok=全部合った・detail.miss=外れた穴の数
//   ・図鑑あつめ（ポケモン風の CcnaView）は 2026-10-20 に消した（shoya「ポケモン要素のやつ全部消していい」）
export const LEC_PREFIX = '_ccnalec:';
export const CHAPTERS: LecChapter[] = [...A1, ...A2, ...A3, ...A4, ...A5, ...A6];
const byId = new Map(CHAPTERS.map((c) => [c.id, c]));
const noOf = new Map(CHAPTERS.map((c) => [c.id, CHAPTERS.filter((x) => x.area === c.area).indexOf(c) + 1]));

const BLANK = /［([^［］]+)］/g;
// 1問の文を 文字と穴に分ける。穴の番号は 章の中の通し番号（start から）
function parse(text: string, start: number): { parts: LecPart[]; answers: string[] } {
  const parts: LecPart[] = []; const answers: string[] = []; let last = 0; let m: RegExpExecArray | null;
  BLANK.lastIndex = 0;
  while ((m = BLANK.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ i: start + answers.length }); answers.push(m[1].trim()); last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return { parts, answers };
}
// 選択肢の並びは 章id と問題番号で決める（開き直しても同じ並び）
function shuffle<T>(a: T[], seed: string): T[] {
  let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i + 1); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
function compile(c: LecChapter) {
  let n = 0; const answers: string[] = [];
  const quiz = c.quiz.map((q, qi) => {
    const p = parse(q.text, n); n += p.answers.length; answers.push(...p.answers);
    return { parts: p.parts, bank: shuffle([...new Set([...p.answers, ...q.extra.map((x) => x.trim())])], `${c.id}:${qi}`), qOf: p.answers.length };
  });
  return { quiz, answers };
}
export function toView(c: LecChapter): LecChapterView {
  const { quiz, answers } = compile(c);
  return { id: c.id, area: c.area, no: noOf.get(c.id) || 0, title: c.title, goal: c.goal, body: c.body, quiz: quiz.map(({ parts, bank }) => ({ parts, bank })), blanks: answers.length };
}

interface Row { subject_key: string; quest: string; ok: boolean; created_at: string }
export async function loadLec(subject?: string): Promise<Row[]> {
  try {
    let q = db().from('kyouiku_progress').select('subject_key,quest,ok,created_at').like('quest', likePrefix(LEC_PREFIX)).order('id', { ascending: true }).limit(20000);
    if (subject) q = q.eq('subject_key', subject);
    const { data, error } = await q;
    return error ? [] : ((data || []) as Row[]);
  } catch { return []; }
}
// 進み具合（受講データにも使う）: 合格した章の数と、いまの章
export function lecSummary(rows: Row[]) {
  const passed = new Set(rows.filter((r) => r.ok).map((r) => r.quest.slice(LEC_PREFIX.length)));
  const cur = CHAPTERS.find((c) => !passed.has(c.id));
  return { done: CHAPTERS.filter((c) => passed.has(c.id)).length, total: CHAPTERS.length, current: cur ? `${cur.area}-${noOf.get(cur.id)} ${cur.title}` : '' };
}

export async function lecState(subject: string, all: boolean): Promise<LecState> {
  const rows = await loadLec(subject);
  const passed = new Set(rows.filter((r) => r.ok).map((r) => r.quest.slice(LEC_PREFIX.length)));
  const tries = new Map<string, number>(); for (const r of rows) { const k = r.quest.slice(LEC_PREFIX.length); tries.set(k, (tries.get(k) || 0) + 1); }
  const chapters: LecChapterSum[] = CHAPTERS.map((c, i) => ({
    id: c.id, area: c.area, no: noOf.get(c.id) || 0, title: c.title, goal: c.goal, blanks: compile(c).answers.length,
    passed: passed.has(c.id), open: all || i === 0 || passed.has(c.id) || passed.has(CHAPTERS[i - 1].id), tries: tries.get(c.id) || 0,
  }));
  return { chapters };
}

async function isOpen(subject: string, id: string, all: boolean) {
  if (all) return true;
  const i = CHAPTERS.findIndex((c) => c.id === id); if (i <= 0) return i === 0;
  const passed = new Set((await loadLec(subject)).filter((r) => r.ok).map((r) => r.quest.slice(LEC_PREFIX.length)));
  return passed.has(id) || passed.has(CHAPTERS[i - 1].id);
}
export async function lecChapter(subject: string, id: string, all: boolean): Promise<LecChapterView | { error: string }> {
  const c = byId.get(id); if (!c) return { error: 'その章は ありません' };
  if (!(await isOpen(subject, id, all))) return { error: '前の章に合格すると開きます' };
  return toView(c);
}
// 答え合わせ。answers = 穴の番号順の語（空は未記入）。全部合ったら合格として記録する
export async function lecCheck(subject: string, name: string, id: string, given: unknown, all: boolean): Promise<LecCheck | { error: string }> {
  const c = byId.get(id); if (!c) return { error: 'その章は ありません' };
  if (!(await isOpen(subject, id, all))) return { error: '前の章に合格すると開きます' };
  const { quiz, answers } = compile(c);
  const g = Array.isArray(given) ? given.map((x) => String(x ?? '').trim()) : [];
  const ok = answers.map((a, i) => g[i] === a);
  const passed = ok.every(Boolean);
  const explain: { q: number; text: string }[] = []; let n = 0;
  quiz.forEach((q, qi) => { if (ok.slice(n, n + q.qOf).some((x) => !x)) explain.push({ q: qi, text: c.quiz[qi].explain }); n += q.qOf; });
  const err = await saveAttempt({ subject_key: subject, name, quest: LEC_PREFIX + id, step: 0, ok: passed, detail: { miss: ok.filter((x) => !x).length, blanks: answers.length } });
  if (err) console.error('ccna lec save', err);
  return { ok, passed, explain };
}
