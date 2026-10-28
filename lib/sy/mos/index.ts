import 'server-only';
import { Bk } from './check';
import { readXlsx } from './read';
import { hasDyn, mosFile, type Check, type Env, type Lesson, type LessonState, type MockRun, type MockSet, type MosState, type PubLesson, type Task, type World, MOCK_MINUTES, MOCK_READY } from './types';
import { W0 } from './w0';
import { W1 } from './w1';
import { W2 } from './w2';
import { W3 } from './w3';
import { W4 } from './w4';
import { W5 } from './w5';
import { W6 } from './w6';
import { W7 } from './w7';
import { MOCK1 } from './mock1';
import { MOCK2 } from './mock2';

// MOS コース（Excel 365 一般レベル・2026-10-09 shoya「実際のエクセル起動しながら・バージョン違っても汎用的に・バカでも合格できる」）
//   ・本人のパソコンの Excel で練習する（持っている人だけが受ける）。サーバは 最初のファイルを配り、本人が保存したファイルを読んで採点する
//   ・ワールド＝出題範囲の分野。レッスン＝出題範囲の項目。タスク＝本番で出る1問ぶんの操作。1つずつ順番に進む（前のレッスンをクリアすると 次が開く）
//   ・W7 は やりかたを たたんだ復習（ボス）。全部クリアすると 模擬試験（50分・本番と同じ形）。模擬で 800点以上を2回つづけると「受けていい」
//   ・記録は kyouiku_progress（表は増やさない）:
//       quest='_mos:<レッスンid>' step=タスクの番号 … 答え合わせ（ok=できた）
//       quest='_mosenv' … Excel の版と Windows／Mac（detail）
//       quest='_mosmock:<セットid>' step=0 始めた／1〜 そのプロジェクトを提出（detail.results）／99 終わった（detail.score・byDomain）
//   ★MOS_LIVE = 受講者に開くかどうかの元栓。false の間は super admin だけが入れる（ほかの人には「準備中」）
export const MOS_LIVE = false;
export const MOS_PREFIX = '_mos:';
export const MOS_ENV = '_mosenv';
export const MOS_MOCK = '_mosmock:';
export const MOCK_START = 0;
export const MOCK_DONE = 99;

export const WORLDS: World[] = [W0, W1, W2, W3, W4, W5, W6, W7];
export const LESSONS: Lesson[] = WORLDS.flatMap((w) => w.lessons);
export const MOCKS: MockSet[] = [MOCK1, MOCK2];
export const lessonById = (id: string) => LESSONS.find((l) => l.id === id) || null;
export const mockById = (id: string) => MOCKS.find((m) => m.id === id) || null;
export const fileName = mosFile;

// 古い版の人には、スピルする関数のタスクを「選ぶ問題」に差し替える（quiz があるものだけ）
export const asQuiz = (t: Task, env: Env | null) => !t.checks.length || (!!t.dyn && !!t.quiz && !!env && !hasDyn(env));
export function publicLesson(l: Lesson, env: Env | null): PubLesson {
  return {
    id: l.id, no: l.no, title: l.title, goal: l.goal, obj: l.obj, place: l.place, enemy: l.enemy, minutes: l.minutes, boss: !!l.boss, sheets: l.book.sheets.map((s) => s.name), extra: (l.book.extra || []).map((x) => x.name),
    tasks: l.tasks.map((t) => ({ title: t.title, ask: t.ask, how: t.how, search: t.search, why: t.why, trap: t.trap, dyn: t.dyn, quiz: asQuiz(t, env) && t.quiz ? { q: t.quiz.q, options: t.quiz.options } : undefined, checks: asQuiz(t, env) ? [] : t.checks.map((c) => ({ label: c.label, hint: c.hint })) })),
  };
}

const run = (checks: Check[], bk: Bk) => checks.map((c) => { try { return !!c.test(bk); } catch { return false; } });
export function openBook(buf: Uint8Array): { bk: Bk; marker: string } | null {
  try { const raw = readXlsx(buf); return { bk: new Bk(raw), marker: raw.props.bdsh || '' }; } catch { return null; }
}
export function judgeLesson(l: Lesson, bk: Bk, env: Env | null) {
  return l.tasks.map((t) => { if (asQuiz(t, env)) return { ok: false, checks: [] as boolean[], quiz: true }; const checks = run(t.checks, bk); return { ok: checks.length > 0 && checks.every(Boolean), checks, quiz: false }; });
}
export const judgeMock = (set: MockSet, project: number, bk: Bk) => set.projects[project].tasks.map((t) => { const c = run(t.checks, bk); return c.length > 0 && c.every(Boolean); });

export interface MosRow { quest: string; step: number; ok: boolean; detail: Record<string, unknown> | null; created_at: string }
export function lessonStates(rows: MosRow[], all: boolean): LessonState[] {
  let prev = true;
  return LESSONS.map((l) => {
    const done = [...new Set(rows.filter((r) => r.ok && r.quest === MOS_PREFIX + l.id && r.step >= 0 && r.step < l.tasks.length).map((r) => r.step))].sort((a, b) => a - b);
    const cleared = done.length >= l.tasks.length; const open = all || prev; prev = cleared;
    return { id: l.id, open, cleared, done };
  });
}
export const envOf = (rows: MosRow[]): Env | null => { const r = rows.filter((x) => x.quest === MOS_ENV).at(-1)?.detail as Partial<Env> | undefined; return r && (r.os === 'win' || r.os === 'mac') && ['365', '2021', '2019', '2016'].includes(String(r.ver)) ? { os: r.os, ver: r.ver as Env['ver'] } : null; };

// 模擬試験: 終わった回（古い順）と、いま受けている回
export function mockRuns(rows: MosRow[]) {
  const runs: MockRun[] = []; let live = null as MosState['live']; let liveResults: Record<number, boolean[]> = {};
  for (const r of rows) {
    if (!r.quest.startsWith(MOS_MOCK)) continue; const set = r.quest.slice(MOS_MOCK.length);
    if (r.step === MOCK_START) { live = { set, startedAt: r.created_at, submitted: [] }; liveResults = {}; }
    else if (r.step === MOCK_DONE) { const d = (r.detail || {}) as { score?: number; byDomain?: MockRun['byDomain'] }; runs.push({ set, at: r.created_at, score: Number(d.score || 0), byDomain: d.byDomain || [] }); live = null; }
    else if (live && live.set === set) { const p = mockById(set)?.projects[r.step - 1]; if (p) { if (!live.submitted.includes(p.id)) live.submitted.push(p.id); liveResults[r.step - 1] = ((r.detail || {}) as { results?: boolean[] }).results || []; } }
  }
  // 始めてから 時間（＋10分）を過ぎたまま 終わらせていない回は 流す
  if (live && Date.now() - new Date(live.startedAt).getTime() > (MOCK_MINUTES + 10) * 60_000) live = null;
  const last2 = runs.slice(-2);
  return { runs, live, liveResults, ready: last2.length === 2 && last2.every((r) => r.score >= MOCK_READY) };
}
export function scoreMock(set: MockSet, results: Record<number, boolean[]>) {
  const byDomain = Array.from({ length: 5 }, () => ({ ok: 0, total: 0 })); let ok = 0, total = 0;
  const detail = set.projects.map((p, k) => p.tasks.map((t, i) => { const good = !!results[k]?.[i]; total++; if (good) ok++; const d = byDomain[t.obj - 1]; if (d) { d.total++; if (good) d.ok++; } return { ask: t.ask, ok: good, lesson: t.lesson, obj: t.obj }; }));
  return { score: total ? Math.round((ok / total) * 1000) : 0, ok, total, byDomain, detail };
}

export function buildMos(name: string, rows: MosRow[], opt: { all: boolean; trial: boolean }): MosState {
  const env = envOf(rows); const open = opt.all || (MOS_LIVE && !opt.trial);
  const lessons = lessonStates(rows, opt.all); const m = mockRuns(rows);
  return {
    open, note: open ? '' : MOS_LIVE ? '参画が決まると開きます。' : 'このコースは準備中です。', name, env, all: opt.all,
    worlds: WORLDS.map((w) => ({ id: w.id, title: w.title, sub: w.sub, share: w.share, lessons: w.lessons.map((l) => publicLesson(l, env)) })), lessons,
    mocks: MOCKS.map((s) => ({ id: s.id, title: s.title, projects: s.projects.map((p) => ({ id: p.id, title: p.title, intro: p.intro, tasks: p.tasks.map((t) => t.ask) })) })),
    runs: m.runs, mockOpen: opt.all || lessons.every((l) => l.cleared), ready: m.ready, live: m.live,
  };
}

// 内勤の受講データ（/kyouiku）に出す まとめ。skipped = 「できているはずなのに通らない」で先へ進めたタスク（判定を見直す目印）
export interface MosSummary { cleared: number; total: number; attempts: number; wrong: number; skipped: string[]; mockRuns: number; mockBest: number; mockLast: number; ready: boolean; env: string; lastAt: string }
export function mosSummary(rows: MosRow[]): MosSummary {
  const ls = lessonStates(rows, false); const m = mockRuns(rows); const env = envOf(rows);
  let attempts = 0, wrong = 0, lastAt = ''; const skipped: string[] = [];
  for (const r of rows) {
    if (r.created_at > lastAt) lastAt = r.created_at;
    if (!r.quest.startsWith(MOS_PREFIX)) continue; const l = lessonById(r.quest.slice(MOS_PREFIX.length)); if (!l) continue;
    attempts++; if (!r.ok) wrong++;
    if (r.ok && (r.detail as { skip?: boolean } | null)?.skip) skipped.push(`${l.no} タスク${r.step + 1}`);
  }
  return { cleared: ls.filter((x) => x.cleared).length, total: ls.length, attempts, wrong, skipped, mockRuns: m.runs.length, mockBest: m.runs.length ? Math.max(...m.runs.map((r) => r.score)) : 0, mockLast: m.runs.at(-1)?.score || 0, ready: m.ready, env: env ? `${env.os === 'mac' ? 'Mac' : 'Windows'}・${env.ver}` : '', lastAt };
}
