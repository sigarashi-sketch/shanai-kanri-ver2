import 'server-only';
import { createHmac } from 'node:crypto';
import { db, ike, likePrefix, onIkeikeDb } from './db';
import { normName } from './name';
import { RECRUIT_STAGE_KEYS, stageKey } from './stages';
import { loadAccess } from './access';
import { roleOf } from './access-types';
import { googleReady } from './google';
import { QUESTS, intakeResult, worldOffset, type KyouikuState } from './kyouiku-lessons';
import { stepCount } from './kyouiku-judge';
import { TYPING_PREFIX, type TypingRow, TYPING_EXAM, TYPING_WORK, type TypingExamResult, type TypingWorkResult } from './kyouiku-typing';
import { DESIGN_PREFIX } from './design';

// 教育コンテンツ「b-dash」（中身はスプシ講座）の受講者キー・受講URL・進み具合。
//   受講者 = それゆけ未経験の人のキー（subject_key）。従業員 'n:<正規化氏名>'、内勤のテストは 'u:<メール>'
//   受講コード = subject を base64url + HMAC 署名（他人のコードは作れない）。受講URL /k/<コード> に入っている
//   進み具合 = saiyou.kyouiku_progress（0013）。表が無いときは空で返す（画面は止めない）
const sig = (s: string) => createHmac('sha256', String(process.env.SESSION_SECRET)).update('kyouiku:' + s).digest('base64url').slice(0, 16);
export function kyouikuCode(subject: string) { return Buffer.from(subject).toString('base64url') + '.' + sig(subject); }
export function readKyouikuCode(t: string): string | null {
  const [b, s] = String(t || '').trim().split('.');
  if (!b || !s) return null;
  const subject = Buffer.from(b, 'base64url').toString();
  return /^[nup]:.{1,80}$/.test(subject) && sig(subject) === s ? subject : null;
}
// ★受講ページは要員が見る。名前は「b-dash」で、「それゆけ未経験」は URL・タイトル・アイコンのどこにも出さない（2026-10-02 shoya）。
//   だから受講URL は それゆけ のホストではなく b-dash 用のホスト（LEARN_HOST・next.config.ts と同じ値）で作る
export const LEARN_HOST = process.env.KYOUIKU_HOST || 'b-dash-app.vercel.app';
export function kyouikuUrl(subject: string) {
  return `https://${LEARN_HOST}/k/${kyouikuCode(subject)}`;
}
// 動作確認の合い言葉（SESSION_SECRET を持つ人だけが作れる）。本番で「記録を残さずに答え合わせ」「お手本を当てる」を試すときに使う（デザインリテラシー コース）
export const debugSig = (subject: string) => sig('debug:' + subject);
// super admin（内勤 u:メール のうち権限ページで super admin の人）は、クリアしていなくても全クエストに入れる（2026-10-02 shoya）
export async function isAllOpen(subject: string): Promise<boolean> {
  if (!subject.startsWith('u:')) return false;
  try { return roleOf(subject.slice(2), await loadAccess()) === 'super_admin'; } catch { return false; }
}

// おためし＝参画決定前（2026-10-02 shoya「営業中の人は おためし」→ 2026-10-09 shoya「参画決定になるまで」）。何が開くかは lib/kyouiku-release-types.ts（管理画面で決める）
//   参画決定前 = いけどんのプロパーリスト（sales_roster）に居て、参画決定・稼働中 の行が1つも無い人（営業中・辞退・ぽあ も 参画決定前）
//   ・状態は 受講ページを開くたびに見る（60秒だけ覚える）ので、いけどんで 参画決定 になれば 何もしなくても 開く
//   ・プロパーリストに居ない人（未経験リスト外の社員など）と 内勤（u:）は おためしにしない。読めなかったときも おためしにしない（稼働中の人を閉め出さない）
//   ・候補者（p:<people.id>）は ステージが採用側（営業中〜内定）の間は おためし。氏名は people から引く
//   ★辞退・ぽあ（2026-10-10 shoya「辞退 ぽあは絶対に何も見せない アクセスできない感じで」）: 参画決定・稼働中 の行が無く、残りの行が全部 辞退か ぽあ の人は
//     bdsh に一切入れない（readLearner が 受講URLごと はじく＝どの口も「受講URLが正しくありません」）。営業中の行が1つでもあれば 入れる（出直した人）。
//     候補者（p:）は ステージが 辞退 のとき。読めなかったときは はじかない
let trialCache: { at: number; set: Set<string>; blocked: Set<string> } | null = null;
export async function trialNames(): Promise<Set<string>> { return (await rosterGate()).set; }
async function rosterGate(): Promise<{ set: Set<string>; blocked: Set<string> }> {
  if (trialCache && Date.now() - trialCache.at < 60_000) return trialCache;
  if (!onIkeikeDb()) return { set: new Set(), blocked: new Set() };
  const rows: { name: string | null; poa: boolean | null; jitai: boolean | null; sankaku_kettei: boolean | null; kadou_chu: boolean | null }[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await ike().from('sales_roster').select('name, poa, jitai, sankaku_kettei, kadou_chu').range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const listed = new Set<string>(); const kettei = new Set<string>(); const alive = new Set<string>();
  for (const r of rows) {
    const nn = normName(r.name); if (!nn) continue;
    listed.add(nn);
    if (r.kadou_chu || r.sankaku_kettei) kettei.add(nn);
    else if (!r.jitai && !r.poa) alive.add(nn);
  }
  const set = new Set([...listed].filter((n) => !kettei.has(n)));
  const blocked = new Set([...set].filter((n) => !alive.has(n)));
  trialCache = { at: Date.now(), set, blocked };
  return trialCache;
}
// 辞退・ぽあ の人か（上の ★）。内勤（u:）は いつも false
export async function isBlocked(subject: string): Promise<boolean> {
  try {
    if (subject.startsWith('n:')) return (await rosterGate()).blocked.has(subject.slice(2));
    if (subject.startsWith('p:')) { const { data } = await db().from('people').select('stage').eq('id', subject.slice(2)).maybeSingle(); return stageKey(String(data?.stage || '')) === '辞退'; }
  } catch (e) { console.error('kyouiku blocked', (e as Error).message); }
  return false;
}
// 受講コード → 本人のキー。辞退・ぽあ の人は null（受講URLが正しくない のと同じ扱い＝何も見せない）。受講者用の口は 全部これを通す
export async function readLearner(code: string): Promise<string | null> {
  const subject = readKyouikuCode(code);
  return subject && !(await isBlocked(subject)) ? subject : null;
}
export async function learnerInfo(subject: string): Promise<{ trial: boolean; name: string }> {
  try {
    if (subject.startsWith('n:')) return { trial: (await trialNames()).has(subject.slice(2)), name: '' };
    if (subject.startsWith('p:')) {
      const { data } = await db().from('people').select('name, stage').eq('id', subject.slice(2)).maybeSingle();
      return { trial: !data || RECRUIT_STAGE_KEYS.includes(stageKey(String(data.stage || ''))), name: String(data?.name || '') };
    }
  } catch (e) { console.error('kyouiku trial', (e as Error).message); }
  return { trial: false, name: '' };
}

export interface ProgressRow { subject_key: string; name: string; quest: string; step: number; ok: boolean; created_at: string }

export async function loadProgress(subject?: string): Promise<ProgressRow[]> {
  try { return await loadProgressRaw(subject); } catch { return []; }
}
async function loadProgressRaw(subject?: string): Promise<ProgressRow[]> {
  let q = db().from('kyouiku_progress').select('subject_key,name,quest,step,ok,created_at').eq('ok', true).order('created_at', { ascending: true }).limit(20000);
  if (subject) q = q.eq('subject_key', subject);
  const { data, error } = await q;
  if (error) return [];
  return (data || []) as ProgressRow[];
}

// 最初のアンケート。記録は kyouiku_progress に quest='_intake' の1行（detail に 答え・点・レベル・始める場所）。表を増やさずに済ませている
//   ★quest が '_' で始まる行はクエストの記録ではない（進み具合の集計では数えない）
export const INTAKE = '_intake';
export interface Intake { level: string; start: string; score: number; answers: number[] }
const asIntake = (d: unknown): Intake => { const x = (d || {}) as Partial<Intake>; return { level: String(x.level || ''), start: String(x.start || ''), score: Number(x.score || 0), answers: Array.isArray(x.answers) ? x.answers : [] }; };
export async function loadIntake(subject: string): Promise<Intake | null> {
  try {
    const { data } = await db().from('kyouiku_progress').select('detail').eq('subject_key', subject).eq('quest', INTAKE).order('id', { ascending: false }).limit(1).maybeSingle();
    return data ? asIntake(data.detail) : null;
  } catch { return null; }
}
export async function loadIntakes(): Promise<Record<string, Intake>> {
  try {
    const { data } = await db().from('kyouiku_progress').select('subject_key,detail').eq('quest', INTAKE).order('id', { ascending: true }).limit(5000);
    return Object.fromEntries((data || []).map((r) => [r.subject_key as string, asIntake(r.detail)]));
  } catch { return {}; }
}
export async function saveIntake(subject: string, name: string, ans: unknown, start: string) {
  const r = intakeResult(ans);
  const st = QUESTS.some((q) => q.id === start) ? start : r.recommend;
  return saveAttempt({ subject_key: subject, name, quest: INTAKE, step: 0, ok: true, detail: { answers: r.answers, score: r.score, level: r.level, recommend: r.recommend, start: st } });
}

// trialWorlds = おためし（参画決定前）の人が入れる 最初の n ワールド（管理画面の設定・lib/kyouiku-release-types.ts excelWorlds）
export function buildState(name: string, rows: ProgressRow[], opt: { all?: boolean; trial?: boolean; trialWorlds?: number; sheetUrl?: string; askMail?: boolean; intake?: Intake | null } = {}): KyouikuState {
  const trial = !!opt.trial && !opt.all;   // おためし: 最初の trialWorlds ワールドより先は開かない（始める場所も その中まで）
  const trialWorlds = opt.trialWorlds ?? 1; const TRIAL_QUESTS = worldOffset(trialWorlds);
  const start = Math.min(Math.max(0, QUESTS.findIndex((q) => q.id === opt.intake?.start)), trial ? worldOffset(Math.max(0, trialWorlds - 1)) : QUESTS.length);
  const doneSteps = (id: string) => new Set(rows.filter((r) => r.quest === id).map((r) => r.step));
  let prevCleared = true;
  const quests = QUESTS.map((q, k) => {
    const total = stepCount(q); const done = doneSteps(q.id).size; const cleared = total > 0 && done >= total;
    const unlocked = (prevCleared || !!opt.all || k <= start) && !(trial && k >= TRIAL_QUESTS); prevCleared = cleared;   // 選んだ始める場所までは最初から開いている
    return { id: q.id, done: Math.min(done, total), total, cleared, unlocked };
  });
  const miles = quests.reduce((s, q) => s + q.done, 0) + quests.filter((q) => q.cleared).length * 2;
  return { name, quests, miles, sheetOn: googleReady(), sheetUrl: opt.sheetUrl || '', all: !!opt.all, trial, trialWorlds, trialQuests: TRIAL_QUESTS, askMail: !!opt.askMail, needIntake: opt.intake === null, level: opt.intake?.level || '', start };
}

// タイピング コースの記録（lib/kyouiku-typing.ts）。quest が '_typing:' で始まる行。subject を省くと全員ぶん
export async function loadTyping(subject?: string): Promise<(TypingRow & { subject_key: string })[]> {
  try {
    let q = db().from('kyouiku_progress').select('subject_key,quest,ok,detail,created_at').like('quest', likePrefix(TYPING_PREFIX)).order('id', { ascending: true }).limit(20000);
    if (subject) q = q.eq('subject_key', subject);
    const { data, error } = await q;
    return error ? [] : ((data || []) as (TypingRow & { subject_key: string })[]);
  } catch { return []; }
}

// タイピング検定の記録（lib/kyouiku-typing.ts）。quest='_typingexam' の行。subject を省くと全員ぶん
export async function loadTypingExam(subject?: string): Promise<{ subject_key: string; detail: Partial<TypingExamResult> | null; created_at: string }[]> {
  try {
    let q = db().from('kyouiku_progress').select('subject_key,detail,created_at').eq('quest', TYPING_EXAM).order('id', { ascending: true }).limit(20000);
    if (subject) q = q.eq('subject_key', subject);
    const { data, error } = await q;
    return error ? [] : ((data || []) as { subject_key: string; detail: Partial<TypingExamResult> | null; created_at: string }[]);
  } catch { return []; }
}

// 実務タイピングの記録（lib/kyouiku-typing.ts）。quest が '_typingwork:' で始まる行。subject を省くと全員ぶん
export async function loadTypingWork(subject?: string): Promise<{ subject_key: string; quest: string; detail: Partial<TypingWorkResult> | null }[]> {
  try {
    let q = db().from('kyouiku_progress').select('subject_key,quest,detail').like('quest', likePrefix(TYPING_WORK)).order('id', { ascending: true }).limit(20000);
    if (subject) q = q.eq('subject_key', subject);
    const { data, error } = await q;
    return error ? [] : ((data || []) as { subject_key: string; quest: string; detail: Partial<TypingWorkResult> | null }[]);
  } catch { return []; }
}

// デザインリテラシー コースの記録（lib/design/index.ts）。quest が '_design:' で始まる行（合格も不合格も）。subject を省くと全員ぶん
export interface DesignRow { subject_key: string; quest: string; ok: boolean; created_at: string }
export async function loadDesign(subject?: string): Promise<DesignRow[]> {
  try {
    let q = db().from('kyouiku_progress').select('subject_key,quest,ok,created_at').like('quest', likePrefix(DESIGN_PREFIX)).order('id', { ascending: true }).limit(20000);
    if (subject) q = q.eq('subject_key', subject);
    const { data, error } = await q;
    return error ? [] : ((data || []) as DesignRow[]);
  } catch { return []; }
}

// 次に解くステップ（すでに正解したものは飛ばす）
export function nextStep(questId: string, rows: ProgressRow[]): number {
  const q = QUESTS.find((x) => x.id === questId); if (!q) return 0;
  const done = new Set(rows.filter((r) => r.quest === questId).map((r) => r.step));
  for (let i = 0; i < stepCount(q); i++) if (!done.has(i)) return i;
  return stepCount(q);
}

export async function saveAttempt(r: { subject_key: string; name: string; quest: string; step: number; ok: boolean; detail: unknown }) {
  try {
    const { error } = await db().from('kyouiku_progress').insert({ ...r, detail: r.detail ?? {} });
    return error ? error.message : '';
  } catch (e) { return (e as Error).message; }
}

// 受講者の表示名。n: は氏名そのもの、u: はメールの@前
export function displayName(subject: string, fallback = '') {
  if (fallback) return fallback;
  return subject.startsWith('u:') ? subject.slice(2).split('@')[0] : subject.slice(2);
}
