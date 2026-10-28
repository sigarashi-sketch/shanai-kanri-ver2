import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { db, ike } from '../db';
import { displayName, isAllOpen, kyouikuUrl } from '../kyouiku';
import { courseGate } from '../kyouiku-release';
import { lineConfigured, pushText } from '../line';
import { KITTING_UNITS } from './seed-kitting';
import {
  COURSE_ID, COURSE_NAME, MAX_BODY, MAX_IMAGES, MAX_LINE, isAllPassed, isAutoUnit, isStale,
  type AdminLearner, type AdminState, type AdminSubmission, type LearnerState, type LearnerSubmission, type LearnerUnit, type QuizItem, type Unit, type UnitStatus,
} from './types';

// 講座「キッティングから情シスへ」の読み書き（表は supabase/0021_course.sql・saiyou スキーマ・service_role だけ）。
//   ★受講者の口（app/api/kyouiku/course）からは、必ず 受講コードから決めた subject を渡す。
//     ここの learner* / submit / saveShot は その subject の行しか読まない・書かない＝他人の進捗・提出物は取れない（RLS の代わり）
//   ★本文を改訂しても course_progress は触らない（合格は合格のまま・合格時の一文も そのまま）
//   ★通知は レビューのたびには送らない。管理画面の「結果を LINE で知らせる」で、1人1通にまとめて送る（Push の通数を抑える）
const BUCKET = 'course';
const C = COURSE_ID;
const SHOT_TTL = 60 * 60;   // スクリーンショットの署名つきURL（1時間）

interface UnitRow { unit_no: number; title: string; goal: string; minutes: string; body_md: string; practice_md: string; deliverable: string; sheet_line: string; quiz: QuizItem[] | null; published: boolean; revision: number; updated_by: string; updated_at: string }
const toUnit = (r: UnitRow): Unit => ({
  no: r.unit_no, title: r.title, goal: r.goal, minutes: r.minutes, body: r.body_md, practice: r.practice_md, deliverable: r.deliverable, sheetLine: r.sheet_line,
  quiz: Array.isArray(r.quiz) ? r.quiz : [], published: !!r.published, revision: r.revision, updatedBy: r.updated_by, updatedAt: r.updated_at,
});
export async function loadUnits(): Promise<Unit[]> {
  const { data, error } = await db().from('course_units').select('*').eq('course', C).order('unit_no');
  if (error) throw new Error(error.message);
  return (data || []).map((r) => toUnit(r as UnitRow));
}

// ---- だれが受講できるか
// 担当者がオンにしていて、参画決定前なら 管理画面で「参画決定前から」になっているとき（lib/kyouiku-release-types.ts）
export async function isCourseOn(subject: string): Promise<boolean> {
  if (!(await courseGate(subject, 'kitting'))) return false;
  try { const { data } = await db().from('course_enrollments').select('enabled').eq('course', C).eq('subject_key', subject).maybeSingle(); return !!data?.enabled; } catch { return false; }
}

// ---- スクリーンショット（非公開バケット 'course'）。置き場は 人ごとのフォルダ＝他人のパスを 自分の提出に混ぜられない
const dirOf = (subject: string) => `${C}/${createHash('sha256').update(subject).digest('hex').slice(0, 24)}/`;
function decodeJpeg(dataUrl: unknown): Buffer | null {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  return buf.length >= 4 && buf.length <= 3 * 1024 * 1024 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff ? buf : null;
}
export async function saveShot(subject: string, dataUrl: unknown): Promise<{ path: string; url: string } | { error: string }> {
  const buf = decodeJpeg(dataUrl);
  if (!buf) return { error: '画像を読めませんでした（大きすぎるか、形式が違います）' };
  const path = dirOf(subject) + randomUUID() + '.jpg';
  const st = ike().storage.from(BUCKET);
  const up = await st.upload(path, buf, { contentType: 'image/jpeg' });
  if (up.error) return { error: '画像を保存できませんでした: ' + up.error.message };
  const s = await st.createSignedUrl(path, SHOT_TTL);
  return { path, url: s.data?.signedUrl || '' };
}
async function signAll(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>(); const uniq = [...new Set(paths)].filter(Boolean);
  if (!uniq.length) return out;
  const { data } = await ike().storage.from(BUCKET).createSignedUrls(uniq, SHOT_TTL);
  for (const d of data || []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}
const pathsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

// ---- 受講者
interface ProgRow { subject_key: string; unit_no: number; status: UnitStatus; sheet_line: string; submitted_at: string | null; reviewed_at: string | null; updated_at: string }
async function progOf(subject: string): Promise<ProgRow[]> {
  const { data, error } = await db().from('course_progress').select('subject_key,unit_no,status,sheet_line,submitted_at,reviewed_at,updated_at').eq('course', C).eq('subject_key', subject);
  if (error) throw new Error(error.message);
  return (data || []) as ProgRow[];
}
export async function learnerState(subject: string): Promise<LearnerState> {
  const name = displayName(subject);
  const all = await isAllOpen(subject);
  const on = all || (await isCourseOn(subject));
  if (!on) return { on: false, name, units: [], lines: [], allPassed: false };
  const [units, prog] = await Promise.all([loadUnits(), progOf(subject)]);
  const st = new Map(prog.map((p) => [p.unit_no, p]));
  const vis = units.filter((u) => u.published || all);   // 公開前の回は super admin（確認用）にだけ出す
  const status = Object.fromEntries(prog.map((p) => [p.unit_no, p.status])) as Record<number, UnitStatus>;
  return {
    on: true, name,
    units: vis.map((u) => ({ no: u.no, title: u.title, goal: u.goal, minutes: u.minutes, status: st.get(u.no)?.status || 'none', hasQuiz: (u.quiz || []).length > 0, draft: !u.published, auto: isAutoUnit(u) })),
    lines: prog.filter((p) => p.status === 'passed' && p.sheet_line).sort((a, b) => a.unit_no - b.unit_no).map((p) => ({ no: p.unit_no, title: units.find((u) => u.no === p.unit_no)?.title || '', line: p.sheet_line })),
    allPassed: isAllPassed(units, status),
  };
}

interface SubRow { id: number; subject_key: string; name: string; unit_no: number; attempt: number; unit_revision: number; body: string; images: unknown; sheet_line: string; quiz: { score?: string } | null; status: AdminSubmission['status']; review_comment: string; reviewed_by: string; reviewed_at: string | null; notified_at: string | null; created_at: string }
const SUB_COLS = 'id,subject_key,name,unit_no,attempt,unit_revision,body,images,sheet_line,quiz,status,review_comment,reviewed_by,reviewed_at,notified_at,created_at';

export async function learnerUnit(subject: string, no: number): Promise<LearnerUnit | { error: string }> {
  const all = await isAllOpen(subject);
  if (!all && !(await isCourseOn(subject))) return { error: 'この講座は まだ開かれていません' };
  const units = await loadUnits(); const u = units.find((x) => x.no === no);
  if (!u || (!u.published && !all)) return { error: 'この回は まだ公開されていません' };
  const [prog, subs] = await Promise.all([
    progOf(subject),
    db().from('course_submissions').select(SUB_COLS).eq('course', C).eq('subject_key', subject).eq('unit_no', no).order('attempt', { ascending: false }),   // ★本人の行だけ
  ]);
  if (subs.error) return { error: subs.error.message };
  const rows = (subs.data || []) as SubRow[];
  const urls = await signAll(rows.flatMap((r) => pathsOf(r.images)));
  const submissions: LearnerSubmission[] = rows.map((r) => ({
    id: r.id, attempt: r.attempt, body: r.body, images: pathsOf(r.images).map((p) => urls.get(p) || '').filter(Boolean), sheetLine: r.sheet_line, status: r.status,
    comment: r.review_comment, reviewedAt: r.reviewed_at || '', createdAt: r.created_at, quizScore: r.quiz?.score || '',
  }));
  return {
    no: u.no, title: u.title, goal: u.goal, minutes: u.minutes, status: prog.find((p) => p.unit_no === no)?.status || 'none', hasQuiz: (u.quiz || []).length > 0, draft: !u.published, auto: isAutoUnit(u),
    body: u.body, practice: u.practice, deliverable: u.deliverable, sheetLine: u.sheetLine,
    quiz: (u.quiz || []).map((q) => ({ q: q.q, choices: q.choices })),   // 正解・解説は返さない
    submissions,
  };
}

export async function submit(subject: string, no: number, v: { body?: unknown; images?: unknown; line?: unknown; quiz?: unknown }): Promise<{ ok: true } | { error: string; wrong?: number[]; explains?: Record<number, string> }> {
  const all = await isAllOpen(subject);
  if (!all && !(await isCourseOn(subject))) return { error: 'この講座は まだ開かれていません' };
  const units = await loadUnits(); const u = units.find((x) => x.no === no);
  if (!u || (!u.published && !all)) return { error: 'この回は まだ公開されていません' };
  const body = String(v.body || '').trim().slice(0, MAX_BODY);
  const dir = dirOf(subject);
  const images = pathsOf(v.images).filter((p) => p.startsWith(dir) && /^[\w/-]+\.jpg$/.test(p)).slice(0, MAX_IMAGES);   // 自分のフォルダの画像だけ
  const auto = isAutoUnit(u);   // 基礎編: 確認テストだけ（文章・画像は要らない）。全問正解で その場で合格にする
  if (!auto && !body && !images.length) return { error: '提出物が空です。文章を書くか、スクリーンショットを付けてください' };
  const line = String(v.line || '').trim().slice(0, MAX_LINE);

  // 確認テストがある回は 全問正解で提出できる（何度でもやり直せる）
  const quiz = u.quiz || []; let quizRec: Record<string, unknown> = {};
  if (quiz.length) {
    const ans = Array.isArray(v.quiz) ? v.quiz.map((x) => Number(x)) : [];
    const wrong = quiz.map((q, i) => (ans[i] === q.answer ? -1 : i)).filter((i) => i >= 0);
    if (wrong.length) return { error: `確認テストが ${quiz.length}問中 ${quiz.length - wrong.length}問 正解です。まちがえた問題を見直して、もう一度答えてください`, wrong, explains: Object.fromEntries(wrong.map((i) => [i, quiz[i].explain])) };
    quizRec = { answers: ans.slice(0, quiz.length), score: `${quiz.length}/${quiz.length}` };
  }

  const prev = await db().from('course_submissions').select('id,attempt,status').eq('course', C).eq('subject_key', subject).eq('unit_no', no).order('attempt', { ascending: false });
  if (prev.error) return { error: prev.error.message };
  if ((prev.data || []).some((r) => r.status === 'passed')) return { error: 'この回は すでに合格しています' };
  // レビュー前に出し直した分は「取り下げ」にして残す（履歴は消さない）
  const waiting = (prev.data || []).filter((r) => r.status === 'submitted').map((r) => r.id);
  if (waiting.length) { const w = await db().from('course_submissions').update({ status: 'withdrawn' }).in('id', waiting); if (w.error) return { error: w.error.message }; }
  const now = new Date().toISOString();
  const ins = await db().from('course_submissions').insert({
    course: C, subject_key: subject, name: displayName(subject), unit_no: no, attempt: ((prev.data || [])[0]?.attempt || 0) + 1, unit_revision: u.revision,
    body, images, sheet_line: line, quiz: quizRec, created_at: now,
    // 基礎編は レビューなしで合格（reviewed_by='auto'）。LINE で知らせる対象にもしない（その場で画面に出る）
    ...(auto ? { status: 'passed', reviewed_by: 'auto', reviewed_at: now, notified_at: now } : { status: 'submitted' }),
  });
  if (ins.error) return { error: ins.error.message };
  const up = await db().from('course_progress').upsert({
    course: C, subject_key: subject, unit_no: no, submitted_at: now, updated_at: now,
    ...(auto ? { status: 'passed', sheet_line: line || u.sheetLine, reviewed_at: now, reviewed_by: 'auto' } : { status: 'submitted' }),
  }, { onConflict: 'course,subject_key,unit_no' });
  if (up.error) return { error: up.error.message };
  return { ok: true };
}

// ---- 管理
async function lineLinks(keys: string[]): Promise<Map<string, string>> {
  // 公式LINE に つながっている人（紐付いた友だちが ちょうど1人）→ userId。2人以上・0人は 未連携として送らない
  const out = new Map<string, string>(); if (!keys.length) return out;
  const { data } = await db().from('line_users').select('user_id,subject_key,followed').in('subject_key', keys).limit(5000);
  const by = new Map<string, string[]>();
  for (const r of data || []) if (r.followed) by.set(r.subject_key as string, [...(by.get(r.subject_key as string) || []), r.user_id as string]);
  for (const [k, ids] of by) if (ids.length === 1) out.set(k, ids[0]);
  return out;
}
const toAdminSub = (r: SubRow, urls: Map<string, string>): AdminSubmission => ({
  id: r.id, key: r.subject_key, name: r.name || displayName(r.subject_key), no: r.unit_no, attempt: r.attempt, unitRevision: r.unit_revision, body: r.body,
  images: pathsOf(r.images).map((p) => urls.get(p) || '').filter(Boolean), sheetLine: r.sheet_line, quizScore: r.quiz?.score || '', status: r.status,
  comment: r.review_comment, reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at || '', notifiedAt: r.notified_at || '', createdAt: r.created_at,
});

export async function adminState(canEdit: boolean): Promise<AdminState> {
  const [units, enr, prog, pend, unsent] = await Promise.all([
    loadUnits(),
    db().from('course_enrollments').select('subject_key,name,enabled,is_target,enrolled_at').eq('course', C),
    db().from('course_progress').select('subject_key,unit_no,status,sheet_line,submitted_at,reviewed_at,updated_at').eq('course', C).limit(20000),
    db().from('course_submissions').select(SUB_COLS).eq('course', C).eq('status', 'submitted').order('created_at'),
    db().from('course_submissions').select('id,subject_key').eq('course', C).in('status', ['passed', 'returned']).is('notified_at', null),
  ]);
  for (const r of [enr, prog, pend, unsent]) if (r.error) throw new Error(r.error.message);
  const progs = (prog.data || []) as ProgRow[];
  const keys = (enr.data || []).map((e) => e.subject_key as string);
  const links = await lineLinks([...new Set([...keys, ...(unsent.data || []).map((r) => r.subject_key as string)])]);
  const learners = (enr.data || []).map((e): AdminLearner => {
    const mine = progs.filter((p) => p.subject_key === e.subject_key);
    const status = Object.fromEntries(mine.map((p) => [p.unit_no, p.status])) as Record<number, UnitStatus>;
    const last = [e.enrolled_at as string, ...mine.map((p) => p.updated_at)].filter(Boolean).sort().pop() || '';
    const allPassed = isAllPassed(units, status);
    return {
      key: e.subject_key, name: e.name || displayName(e.subject_key), enabled: !!e.enabled, target: !!e.is_target, enrolledAt: e.enrolled_at, status,
      lines: mine.filter((p) => p.status === 'passed' && p.sheet_line).sort((a, b) => a.unit_no - b.unit_no).map((p) => ({ no: p.unit_no, line: p.sheet_line })),
      last, stale: !!e.enabled && !allPassed && isStale(last), allPassed, line: links.has(e.subject_key) ? 'linked' : 'none',
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const rows = (pend.data || []) as SubRow[];
  const urls = await signAll(rows.flatMap((r) => pathsOf(r.images)));
  const un = unsent.data || []; const unPeople = new Set(un.map((r) => r.subject_key as string));
  const have = new Set(units.map((u) => u.no));
  return {
    units, learners, pending: rows.map((r) => ({ ...toAdminSub(r, urls), name: learners.find((l) => l.key === r.subject_key)?.name || r.name || displayName(r.subject_key) })),   // 名前は 受講者の一覧と同じものを出す
    toNotify: { people: [...unPeople].filter((k) => links.has(k)).length, items: un.filter((r) => links.has(r.subject_key as string)).length, unlinked: [...unPeople].filter((k) => !links.has(k)).length },
    seed: { total: KITTING_UNITS.length, missing: KITTING_UNITS.filter((d) => !have.has(d.no)).length }, canEdit, lineReady: lineConfigured(),
  };
}

// 1人ぶんの提出の履歴（レビュー画面の右・再提出の前の分も）
export async function historyOf(key: string): Promise<AdminSubmission[]> {
  const { data, error } = await db().from('course_submissions').select(SUB_COLS).eq('course', C).eq('subject_key', key).order('unit_no').order('attempt', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data || []) as SubRow[]; const urls = await signAll(rows.flatMap((r) => pathsOf(r.images)));
  return rows.map((r) => toAdminSub(r, urls));
}

// 下書きを取り込む: まだ無い回を足すだけ（DB で直した中身は上書きしない）。published=false で入る
export async function seedUnits(by: string): Promise<{ added: number } | { error: string }> {
  const have = new Set((await loadUnits()).map((u) => u.no));
  const rows = KITTING_UNITS.filter((d) => !have.has(d.no)).map((d) => ({
    course: C, unit_no: d.no, title: d.title, goal: d.goal, minutes: d.minutes, body_md: d.body, practice_md: d.practice, deliverable: d.deliverable, sheet_line: d.sheetLine,
    quiz: d.quiz || [], published: false, revision: 1, updated_by: by,
  }));
  if (rows.length) { const { error } = await db().from('course_units').insert(rows); if (error) return { error: error.message }; }
  return { added: rows.length };
}

const TEXT_FIELDS = { title: 'title', goal: 'goal', minutes: 'minutes', body: 'body_md', practice: 'practice_md', deliverable: 'deliverable', sheetLine: 'sheet_line' } as const;
function cleanQuiz(v: unknown): QuizItem[] | null {
  if (!Array.isArray(v)) return null;
  const out: QuizItem[] = [];
  for (const x of v) {
    const q = x as Partial<QuizItem>;
    if (typeof q.q !== 'string' || !Array.isArray(q.choices) || q.choices.length < 2 || q.choices.some((c) => typeof c !== 'string')) return null;
    const a = Number(q.answer); if (!Number.isInteger(a) || a < 0 || a >= q.choices.length) return null;
    out.push({ q: q.q, choices: q.choices, answer: a, explain: String(q.explain || '') });
  }
  return out;
}
// 本文を直す（revision を1つ上げる）。受講者の状態（course_progress）は 触らない
export async function saveUnit(no: number, patch: Record<string, unknown>, by: string): Promise<{ unit: Unit } | { error: string }> {
  const row: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(TEXT_FIELDS)) if (typeof patch[k] === 'string') row[col] = (patch[k] as string).slice(0, 60000);
  if (patch.quiz !== undefined) { const q = cleanQuiz(patch.quiz); if (!q) return { error: '確認テストの形が正しくありません' }; row.quiz = q; }
  if (!Object.keys(row).length) return { error: '変えるところがありません' };
  const cur = await db().from('course_units').select('revision').eq('course', C).eq('unit_no', no).maybeSingle();
  if (cur.error || !cur.data) return { error: cur.error?.message || 'その回が見つかりません' };
  const { data, error } = await db().from('course_units').update({ ...row, revision: cur.data.revision + 1, updated_by: by, updated_at: new Date().toISOString() }).eq('course', C).eq('unit_no', no).select('*').single();
  if (error) return { error: error.message };
  return { unit: toUnit(data as UnitRow) };
}
export async function setPublished(no: number, published: boolean, by: string): Promise<{ ok: true } | { error: string }> {
  const { data, error } = await db().from('course_units').update({ published, updated_by: by, updated_at: new Date().toISOString() }).eq('course', C).eq('unit_no', no).select('unit_no');
  if (error) return { error: error.message };
  return data?.length ? { ok: true } : { error: 'その回が見つかりません' };
}

// 受講者を足す・受講のオン／オフ・対象者フラグ。行が無ければ作る（enrolled_at は最初の1回だけ）
export async function enroll(key: string, name: string, v: { enabled?: boolean; target?: boolean }, by: string): Promise<{ ok: true } | { error: string }> {
  const now = new Date().toISOString();
  const cur = await db().from('course_enrollments').select('subject_key').eq('course', C).eq('subject_key', key).maybeSingle();
  if (cur.error) return { error: cur.error.message };
  const set = { ...(typeof v.enabled === 'boolean' ? { enabled: v.enabled } : {}), ...(typeof v.target === 'boolean' ? { is_target: v.target } : {}), updated_by: by, updated_at: now };
  const r = cur.data
    ? await db().from('course_enrollments').update(set).eq('course', C).eq('subject_key', key)
    : await db().from('course_enrollments').insert({ course: C, subject_key: key, name: name || displayName(key), enabled: v.enabled ?? true, is_target: v.target ?? true, enrolled_by: by, enrolled_at: now, updated_by: by, updated_at: now });
  return r.error ? { error: r.error.message } : { ok: true };
}

// レビュー: 合格／差し戻し＋コメント。合格の時は「スキルシート用の一文」を確定させる（レビューする人が直せる）
export async function review(id: number, verdict: 'passed' | 'returned', comment: string, line: string, by: string): Promise<{ ok: true; key: string; no: number } | { error: string }> {
  const cur = await db().from('course_submissions').select('id,subject_key,unit_no,status,sheet_line').eq('id', id).eq('course', C).maybeSingle();
  if (cur.error || !cur.data) return { error: cur.error?.message || '提出が見つかりません' };
  if (cur.data.status !== 'submitted') return { error: 'この提出は すでにレビュー済みか、本人が出し直しています。画面を読み込み直してください' };
  if (verdict === 'returned' && !comment.trim()) return { error: '差し戻す時は、どこを直せばよいかをコメントに書いてください' };
  const now = new Date().toISOString(); const key = cur.data.subject_key as string; const no = cur.data.unit_no as number;
  let fixed = '';
  if (verdict === 'passed') {
    fixed = (line.trim() || String(cur.data.sheet_line || '').trim()).slice(0, MAX_LINE);
    if (!fixed) { const u = (await loadUnits()).find((x) => x.no === no); fixed = u?.sheetLine || ''; }
  }
  const up = await db().from('course_submissions').update({ status: verdict, review_comment: comment.trim().slice(0, 2000), reviewed_by: by, reviewed_at: now, notified_at: null }).eq('id', id).eq('status', 'submitted').select('id');
  if (up.error) return { error: up.error.message };
  if (!up.data?.length) return { error: 'ほかの人が先にレビューしました。画面を読み込み直してください' };
  const pr = await db().from('course_progress').upsert({ course: C, subject_key: key, unit_no: no, status: verdict, sheet_line: fixed, reviewed_at: now, reviewed_by: by, updated_at: now }, { onConflict: 'course,subject_key,unit_no' });
  if (pr.error) return { error: pr.error.message };
  return { ok: true, key, no };
}

// 結果を LINE で知らせる: まだ知らせていない 合格／差し戻しを、1人1通にまとめて送る。未連携の人は飛ばす（notified_at は null のまま＝連携したら次で送られる）
export function notifyText(name: string, items: { no: number; title: string; status: string; comment: string }[], url: string): string {
  const lines = items.map((x) => `・第${x.no}回「${x.title}」：${x.status === 'passed' ? '合格' : 'もう一度（差し戻し）'}${x.comment ? `\n　${x.comment.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`);
  const anyBack = items.some((x) => x.status === 'returned');
  return `${name}さん\n講座「${COURSE_NAME}」のレビュー結果です。\n\n${lines.join('\n')}\n\n${anyBack ? '差し戻しの回は、コメントを見て出し直してください。' : 'おつかれさまでした。'}\n${url}`;
}
export async function notifyAll(by: { email: string; name: string }): Promise<{ sent: number; items: number; skipped: number; failed: { name: string; error: string }[] } | { error: string }> {
  if (!lineConfigured()) return { error: 'LINE の鍵が設定されていません（この環境からは送れません）' };
  const { data, error } = await db().from('course_submissions').select('id,subject_key,unit_no,status,review_comment').eq('course', C).in('status', ['passed', 'returned']).is('notified_at', null).order('unit_no');
  if (error) return { error: error.message };
  const rows = data || []; if (!rows.length) return { sent: 0, items: 0, skipped: 0, failed: [] };
  const units = await loadUnits(); const keys = [...new Set(rows.map((r) => r.subject_key as string))];
  const links = await lineLinks(keys);
  let sent = 0, items = 0, skipped = 0; const failed: { name: string; error: string }[] = [];
  for (const key of keys) {
    const uid = links.get(key); if (!uid) { skipped++; continue; }
    const mine = rows.filter((r) => r.subject_key === key);
    // 同じ回は いちばん新しい結果だけ（出し直して合格した回の 前の差し戻しは もう知らせない）
    const latest = new Map<number, typeof mine[number]>(); for (const r of mine) { const c = latest.get(r.unit_no); if (!c || r.id > c.id) latest.set(r.unit_no, r); }
    const name = displayName(key);
    const text = notifyText(name, [...latest.values()].map((r) => ({ no: r.unit_no, title: units.find((u) => u.no === r.unit_no)?.title || '', status: r.status, comment: r.review_comment })), kyouikuUrl(key));
    const r = await pushText(uid, text);
    if (!r.ok) { failed.push({ name, error: r.error }); continue; }
    const at = new Date().toISOString();
    await db().from('course_submissions').update({ notified_at: at }).in('id', mine.map((x) => x.id));
    await db().from('line_messages').insert({ user_id: uid, direction: 'out', type: 'text', text, payload: { course: { id: C, items: mine.map((x) => x.id) } }, sender_email: by.email, sender_name: by.name, created_at: at });
    await db().from('line_users').update({ last_message_at: at, last_text: text.slice(0, 200), last_direction: 'out', updated_at: at }).eq('user_id', uid);
    sent++; items += latest.size;
  }
  return { sent, items, skipped, failed };
}
