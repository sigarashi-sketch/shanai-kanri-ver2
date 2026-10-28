// 講座（提出して レビューを受ける型）の決まり。画面とサーバの両方が読む（server-only にしない）。
//   最初の講座は「キッティングから情シスへ」（2026-10-09 shoya）。表は supabase/0021_course.sql
//   ★受講者が見る文言に「それゆけ」「未経験」を書かない（bdsh の中のコース）
export const COURSE_ID = 'kitting';
export const COURSE_NAME = 'キッティングから情シスへ';
// 修了の条件にする資格試験。★最初の指示書は MS-900 だったが、MS-900（Microsoft 365 Certified: Fundamentals）は 廃止済み（2026-10-09 に Microsoft Learn で確認・shoya の指摘）。
//   後継は AB-900（Microsoft 365 Certified: Copilot and Agent Administration Fundamentals）。どれにするかは shoya が決める＝決まるまで null（受講画面には「準備中」と出す）。
//   決まったら { code, name } を入れる。★資格手当の一覧（lib/richmenu-types.ts SHIKAKU_CERTS＝いけどん _shikaku_master.ts）にも その資格が要る（いまは Microsoft の基礎資格が1つも無い）
//   ★2026-10-09 shoya「AB-900 で組み直して」＝AB-900 に決定。試験対策編（第9〜11回）を足した。試験は 45分・日本語あり・初級（Microsoft Learn で確認）
export const FINISH_EXAM: { code: string; name: string } | null = { code: 'AB-900', name: 'Microsoft 365 認定: Copilot とエージェント管理の基礎' };
export const EXAM_FROM = 9;   // この番号からの回は 試験対策編（AB-900 の出題範囲の整理・確認テストで合格）
export const STALE_DAYS = 14;            // これだけ動きが無いと 管理画面で目立たせる（LINE は送らない）
export const MAX_IMAGES = 4;             // 1回の提出に付けられるスクリーンショット
export const MAX_BODY = 8000;
export const MAX_LINE = 300;

export type UnitStatus = 'none' | 'submitted' | 'returned' | 'passed';
export const STATUS_LABEL: Record<UnitStatus, string> = { none: '未着手', submitted: '提出済', returned: '差し戻し', passed: '合格' };

export interface QuizItem { q: string; choices: string[]; answer: number; explain: string }
// 下書き（lib/course/seed-kitting.ts）と DB の行（course_units）の共通の形
export interface UnitDraft {
  no: number; title: string; goal: string; minutes: string;
  body: string; practice: string; deliverable: string; sheetLine: string; quiz?: QuizItem[];
}
export interface Unit extends UnitDraft { published: boolean; revision: number; updatedBy: string; updatedAt: string }

// 受講者に返す形（確認テストの正解は入れない）
// auto = 基礎編（確認テストに全問正解すると その場で合格・レビューなし）。成果物を出してレビューを受けるのは 実践編だけ（2026-10-09 shoya「成果物は実践編でやる」）
export interface LearnerUnitHead { no: number; title: string; goal: string; minutes: string; status: UnitStatus; hasQuiz: boolean; draft: boolean; auto: boolean }
export interface LearnerSubmission {
  id: number; attempt: number; body: string; images: string[]; sheetLine: string; status: 'submitted' | 'returned' | 'passed' | 'withdrawn';
  comment: string; reviewedAt: string; createdAt: string; quizScore?: string;
}
export interface LearnerUnit extends LearnerUnitHead {
  body: string; practice: string; deliverable: string; sheetLine: string;
  quiz: { q: string; choices: string[] }[]; submissions: LearnerSubmission[];
}
export interface LearnerState {
  on: boolean; name: string; units: LearnerUnitHead[];
  lines: { no: number; title: string; line: string }[];   // 合格した回の「スキルシート用の一文」（積み上がる）
  allPassed: boolean;
}

// 管理画面に返す形
export interface AdminLearner {
  key: string; name: string; enabled: boolean; target: boolean; enrolledAt: string;
  status: Record<number, UnitStatus>; lines: { no: number; line: string }[];
  last: string;            // 最後の動き（提出・レビュー・受講開始の いちばん新しい時刻）
  stale: boolean;          // STALE_DAYS 日 動きが無い（全回合格の人は含めない）
  allPassed: boolean;      // 公開中の回が ぜんぶ合格＝提案候補
  line: 'linked' | 'none'; // 公式LINE に つながっているか（none＝未連携・通知は飛ばない）
}
export interface AdminSubmission {
  id: number; key: string; name: string; no: number; attempt: number; unitRevision: number;
  body: string; images: string[]; sheetLine: string; quizScore: string;
  status: 'submitted' | 'returned' | 'passed' | 'withdrawn'; comment: string; reviewedBy: string; reviewedAt: string; notifiedAt: string; createdAt: string;
}
export interface AdminState {
  units: Unit[]; learners: AdminLearner[]; pending: AdminSubmission[];
  toNotify: { people: number; items: number; unlinked: number };
  seed: { total: number; missing: number }; canEdit: boolean; lineReady: boolean;
}

// 基礎編か: 「提出するもの」が空で 確認テストがある回。表に列は足していない（中身で決まる）＝管理画面で 提出するものを書けば 実践編になる
export const isAutoUnit = (u: { deliverable: string; quiz?: unknown[] }) => !u.deliverable.trim() && (u.quiz || []).length > 0;
// 回の3つのまとまり: 基礎編（読んで確認テスト）／実践編（成果物を出してレビュー）／試験対策編（EXAM_FROM から・確認テスト）
export type Part = 'basic' | 'practice' | 'exam';
export const PARTS: Part[] = ['basic', 'practice', 'exam'];
export const PART_LABEL: Record<Part, string> = { basic: '基礎編', practice: '実践編', exam: '試験対策編' };
export const PART_NOTE: Record<Part, string> = { basic: '読んで、確認テストに答えると合格です', practice: '実習の成果物を出して、レビューを受けます', exam: '資格試験 AB-900 の出題範囲を整理します。確認テストに答えると合格です' };
export const partOf = (u: { no: number; auto: boolean }): Part => (u.no >= EXAM_FROM ? 'exam' : u.auto ? 'basic' : 'practice');
export const isAllPassed = (units: { no: number; published: boolean }[], status: Record<number, UnitStatus>) => {
  const pub = units.filter((u) => u.published);
  return pub.length > 0 && pub.every((u) => status[u.no] === 'passed');
};
export const isStale = (lastIso: string, now = Date.now()) => !!lastIso && now - new Date(lastIso).getTime() > STALE_DAYS * 86400000;
