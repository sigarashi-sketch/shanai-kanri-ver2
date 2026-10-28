// タイピング コース（2026-10-02 shoya「それゆけ未経験のタイピングに実装して」）。
//   中身は 別リポジトリ ~/Desktop/love-type のゲーム（会話の文をローマ字で打ってつなぐ・3章＋延長戦）。
//   ビルドした一式を public/bdash/typing/ に置き、受講ページから iframe で開く（components/kyouiku/typing/TypingView.tsx）。
//   入れ替えは love-type 側で `sh scripts/publish-to-bdash.sh` → こちらでコミットしてデプロイ。
//   1回遊び終わるたびに、ゲームが結果を知らせてくる → /api/kyouiku action=typing が kyouiku_progress に1行残す。
//     quest = '_typing:<章>'（'_' で始まる＝スプシ講座のクエストの集計には入らない）・ok = 最後まで行けたか・detail = 成績
//   ★おためし（営業中）の人にも、内勤にも、全員に開いている。レベルのアンケートも要らない
export const TYPING_SRC = '/bdash/typing/index.html';
export const TYPING_PREFIX = '_typing:';
export const TYPING_CHAPTERS = [
  { id: 'ch1', name: '第1章' },
  { id: 'ch2', name: '第2章' },
  { id: 'ch3', name: '第3章' },
] as const;
const PLAY_IDS = [...TYPING_CHAPTERS.map((c) => c.id as string), 'endless'];

export interface TypingResult {
  chapterId: string; mode: 'story' | 'endless'; difficulty: 'easy' | 'normal' | 'hard'; cleared: boolean; rank: string;
  kpm: number; accuracy: number; timeSec: number; minMood: number; affection: number; score: number; maxCombo: number;
}
export interface TypingRow { quest: string; ok: boolean; detail: Partial<TypingResult>; created_at: string }
// 受講ページ・管理画面に出す まとめ
export interface TypingSummary {
  plays: number;                 // 遊んだ回数（途中で終わった回も含む）
  cleared: number;               // 最後まで行けた章の数
  total: number;                 // 章の数
  bestKpm: number;               // 1分あたりの打鍵数のいちばん良い値
  bestAccuracy: number;          // 正確率のいちばん良い値（0〜1）
  chapters: { id: string; name: string; cleared: boolean; rank: string; kpm: number; accuracy: number; plays: number }[];
  lastAt: string;
}

const num = (v: unknown, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };

// ゲームから届いた結果を、決まった形・範囲に整える（知らない章や壊れた値は受け付けない）
export function cleanTypingResult(raw: unknown): TypingResult | null {
  const r = (raw || {}) as Record<string, unknown>;
  const chapterId = String(r.chapterId || '');
  if (!PLAY_IDS.includes(chapterId)) return null;
  const difficulty = ['easy', 'normal', 'hard'].includes(String(r.difficulty)) ? (String(r.difficulty) as TypingResult['difficulty']) : 'normal';
  const rank = ['S', 'A', 'B', 'C', 'D'].includes(String(r.rank)) ? String(r.rank) : 'D';
  return {
    chapterId, mode: chapterId === 'endless' ? 'endless' : 'story', difficulty, cleared: r.cleared === true, rank,
    kpm: Math.round(num(r.kpm, 0, 2000)), accuracy: Math.round(num(r.accuracy, 0, 1) * 1000) / 1000, timeSec: Math.round(num(r.timeSec, 0, 36000)),
    minMood: Math.round(num(r.minMood, 0, 100)), affection: Math.round(num(r.affection, 0, 1) * 100) / 100, score: Math.round(num(r.score, 0, 100)), maxCombo: Math.round(num(r.maxCombo, 0, 100000)),
  };
}

// ---- タイピング検定（2026-10-05 shoya「各コースにテスト。タイピングは 速さと正確さの検定」）----
//   ゲームとは別の 飾りのない画面（components/kyouiku/typing/TypingExam.tsx）で、決まった文を EXAM_SEC 秒 打つ。
//   速さ＝正しく打ったキーの数（1分あたり）、正確さ＝正しいキー ÷ 押したキー。級は下の表（★数字は Claude が仮に置いたもの。shoya が後で決める）
//   正確さが EXAM_MIN_ACC に届かない回は 級なし。EXAM_PASS_GRADE 級以上で 合格（修了）。記録は kyouiku_progress の quest='_typingexam'
export const TYPING_EXAM = '_typingexam';
export const EXAM_SEC = 60;
export const EXAM_MIN_ACC = 0.9;
export const EXAM_PASS_GRADE = 3;
export const EXAM_GRADES = [{ grade: 1, kpm: 300 }, { grade: 2, kpm: 240 }, { grade: 3, kpm: 180 }, { grade: 4, kpm: 120 }, { grade: 5, kpm: 60 }] as const;
export const gradeOf = (kpm: number, accuracy: number): number => (accuracy < EXAM_MIN_ACC ? 0 : EXAM_GRADES.find((g) => kpm >= g.kpm)?.grade || 0);   // 0 = 級なし
export const gradeLabel = (g: number) => (g ? `${g}級` : '級なし');
export interface TypingExamResult { kpm: number; accuracy: number; keys: number; miss: number; grade: number; passed: boolean }
// 画面から届いた結果を整える。級と合否は ここで（サーバで）決め直す
export function cleanExamResult(raw: unknown): TypingExamResult | null {
  const r = (raw || {}) as Record<string, unknown>;
  const keys = Math.round(num(r.keys, 0, 5000)); const miss = Math.round(num(r.miss, 0, 5000));
  if (keys + miss < 10) return null;                       // ほとんど打っていない回は残さない
  const kpm = Math.round((keys * 60) / EXAM_SEC); const accuracy = Math.round((keys / (keys + miss)) * 1000) / 1000;
  const grade = gradeOf(kpm, accuracy);
  return { kpm, accuracy, keys, miss, grade, passed: grade > 0 && grade <= EXAM_PASS_GRADE };
}
// いちばん良い回（級が上 → 同じ級なら速い方）
export function examBest(rows: { detail: Partial<TypingExamResult> | null }[]): TypingExamResult | null {
  let best: TypingExamResult | null = null;
  for (const r of rows) {
    const d = cleanExamResult(r.detail); if (!d) continue;
    const rank = (x: TypingExamResult) => (x.grade ? 10 - x.grade : 0) * 10000 + x.kpm;
    if (!best || rank(d) > rank(best)) best = d;
  }
  return best;
}

// ---- 実務タイピング（電話対応・ビジネスメール。lib/typing/work-texts.ts）----
//   1つの場面を 最後まで打ち終えるたびに1行。quest='_typingwork:<場面のid>'・detail = 速さ・正確さ・かかった秒数。合否は付けない（練習）
export const TYPING_WORK = '_typingwork:';
export interface TypingWorkResult { set: string; kpm: number; accuracy: number; keys: number; miss: number; sec: number }
export function cleanWorkResult(raw: unknown, setIds: readonly string[]): TypingWorkResult | null {
  const r = (raw || {}) as Record<string, unknown>;
  const set = String(r.set || ''); if (!setIds.includes(set)) return null;
  const keys = Math.round(num(r.keys, 0, 5000)); const miss = Math.round(num(r.miss, 0, 5000)); const sec = Math.round(num(r.sec, 1, 3600));
  if (keys < 20) return null;
  return { set, kpm: Math.min(1500, Math.round((keys * 60) / sec)), accuracy: Math.round((keys / (keys + miss)) * 1000) / 1000, keys, miss, sec };
}
// 場面ごとの いちばん速かった回
export function workBest(rows: { quest: string; detail: Partial<TypingWorkResult> | null }[]): Record<string, { kpm: number; accuracy: number; plays: number }> {
  const out: Record<string, { kpm: number; accuracy: number; plays: number }> = {};
  for (const r of rows) {
    const id = r.quest.slice(TYPING_WORK.length); const kpm = Number(r.detail?.kpm || 0); const accuracy = Number(r.detail?.accuracy || 0);
    const cur = out[id] || (out[id] = { kpm: 0, accuracy: 0, plays: 0 });
    cur.plays++; if (kpm > cur.kpm) { cur.kpm = kpm; cur.accuracy = accuracy; }
  }
  return out;
}

const RANKS = 'DCBAS';
export function typingSummary(rows: TypingRow[]): TypingSummary {
  const chapters = TYPING_CHAPTERS.map((c) => ({ id: c.id as string, name: c.name as string, cleared: false, rank: '', kpm: 0, accuracy: 0, plays: 0 }));
  let bestKpm = 0, bestAccuracy = 0, lastAt = '';
  for (const r of rows) {
    const d = r.detail || {};
    if (r.created_at > lastAt) lastAt = r.created_at;
    // 速さ・正確さの「いちばん」は、ある程度の長さを打った回だけで見る（すぐやめた回の値は当てにならない）
    if (Number(d.timeSec || 0) >= 20) { bestKpm = Math.max(bestKpm, Number(d.kpm || 0)); bestAccuracy = Math.max(bestAccuracy, Number(d.accuracy || 0)); }
    const c = chapters.find((x) => TYPING_PREFIX + x.id === r.quest); if (!c) continue;
    c.plays++;
    if (!r.ok) continue;
    c.cleared = true;
    if (RANKS.indexOf(String(d.rank || 'D')) >= RANKS.indexOf(c.rank || 'D') || !c.rank) { c.rank = String(d.rank || 'D'); c.kpm = Number(d.kpm || 0); c.accuracy = Number(d.accuracy || 0); }
  }
  return { plays: rows.length, cleared: chapters.filter((c) => c.cleared).length, total: chapters.length, bestKpm, bestAccuracy, chapters, lastAt };
}
