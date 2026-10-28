import 'server-only';
import { db } from './db';
import { EXAM, EXAM_LIVES, type ExamState } from './kyouiku-lessons';

// エクセルの修了テスト（さいごの しれん・lib/kyouiku-lessons.ts の EXAM）の記録。表は増やさず kyouiku_progress に quest='_exam:excel' の行で持つ。
//   step = -1 … たたかいを始めた（やり直すたびに1行）／ 0〜 … その課題の答え合わせ（ok=当たり・外れ）／ 99 … 合格（detail.miss = その回の まちがいの数）
//   いまの たたかい ＝ 最後の「始めた」より後の行。外れが EXAM_LIVES 回で 負け（もう一度 始めるまで 答え合わせできない）
export const EXAM_QUEST = '_exam:excel';
export const EXAM_START = -1;
export const EXAM_PASS = 99;
export interface ExamRow { subject_key: string; step: number; ok: boolean; detail: { miss?: number } | null; created_at: string }

export async function loadExam(subject?: string): Promise<ExamRow[]> {
  try {
    let q = db().from('kyouiku_progress').select('subject_key,step,ok,detail,created_at').eq('quest', EXAM_QUEST).order('id', { ascending: true }).limit(20000);
    if (subject) q = q.eq('subject_key', subject);
    const { data, error } = await q;
    return error ? [] : ((data || []) as ExamRow[]);
  } catch { return []; }
}

// 1人ぶんの行（古い順）から いまの状態を出す。open は 呼ぶ側が決める（全クエストクリア・おためしでない）
export function examState(rows: ExamRow[], open: boolean): ExamState & { doneSteps: number[] } {
  const total = EXAM.steps.length;
  const passes = rows.filter((r) => r.step === EXAM_PASS && r.ok);
  const last = rows.map((r) => r.step).lastIndexOf(EXAM_START);
  const run = last < 0 ? [] : rows.slice(last + 1).filter((r) => r.step >= 0 && r.step < total);
  const doneSteps = [...new Set(run.filter((r) => r.ok).map((r) => r.step))].sort((a, b) => a - b);
  const miss = run.filter((r) => !r.ok).length;
  const lives = Math.max(0, EXAM_LIVES - miss);
  return {
    open, passed: passes.length > 0, runs: rows.filter((r) => r.step === EXAM_START).length,
    live: last >= 0 && lives > 0 && doneSteps.length < total, done: doneSteps.length, total, lives: last < 0 ? EXAM_LIVES : lives,
    bestMiss: passes.length ? Math.min(...passes.map((r) => Number(r.detail?.miss ?? 0))) : null, doneSteps,
  };
}
