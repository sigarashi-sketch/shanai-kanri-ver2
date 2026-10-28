import { L1 } from './l1';
import { L2 } from './l2';
import { L3 } from './l3';
import type { Lesson, Level } from './types';

// デザインリテラシー コース（2026-10-02 shoya）。パワポでセンスの良いビジネス資料を作れるようになるための3つの級。
//   初級「読める資料」→ 中級「整った資料」→ 上級「伝わる資料」。各級 7レッスン＋まとめ課題
//   ・作業は 本人用の Google スライド（サーバが作って配る・lib/design/slides.ts）。答え合わせは サーバがそのスライドを読んで採点する
//   ・レッスンは 1つずつ順番に受ける（前のレッスンに合格すると 次が開く）。まとめ課題に合格すると 次の級が開く。合格したレッスンは いつでもやり直せる
//   ・記録は kyouiku_progress に quest='_design:<レッスンid>'（'_' で始まる＝スプシ講座の集計には入らない）。ok = 全チェック合格
//   ・営業中（おためし）の人には出さない。稼働中の人と内勤だけ（判定は lib/kyouiku.ts learnerInfo）
//   ★DESIGN_LIVE = 受講者に開くかどうかの元栓。false の間は super admin だけが入れる（ほかの人には「準備中」）。
//     2026-10-02: Slides API を shoya がオンにし、本番で 24レッスンぜんぶ「最初は不合格／お手本を当てると合格／最初に戻す」を通してから true にした（docs/kyouiku-design.md）
export const DESIGN_LIVE = true;
export const DESIGN_PREFIX = '_design:';
export const LEVELS: Level[] = [
  { id: 'basic', name: '初級', theme: '読める資料', sub: '文字の大きさ・タイトル・フォント・強調・行間。まず「読める」ようにする', lessons: L1 },
  { id: 'middle', name: '中級', theme: '整った資料', sub: '余白・色・整列・表・写真。見た瞬間に「ちゃんとしている」と思わせる', lessons: L2 },
  { id: 'advanced', name: '上級', theme: '伝わる資料', sub: '結論・視線の流れ・グラフ・図解。言いたいことが1回で伝わるようにする', lessons: L3 },
];
export const LESSONS: Lesson[] = LEVELS.flatMap((l) => l.lessons);
export const lessonById = (id: string) => LESSONS.find((l) => l.id === id) || null;

// どのレッスンに入れるか。cleared = 合格したレッスンの id、all = super admin（全部入れる）
export interface LessonState { id: string; cleared: boolean; open: boolean }
export function designStates(cleared: Set<string> | string[], all = false): LessonState[] {
  const c = cleared instanceof Set ? cleared : new Set(cleared);
  let prev = true;   // 1つずつ順番に受ける（2026-10-02 shoya「1こずつ受けるようにして」）: 前のレッスンに合格すると 次が開く。級をまたぐ所も同じ（まとめ課題 → 次の級のレッスン1）
  return LESSONS.map((l) => { const open = all || prev; prev = c.has(l.id); return { id: l.id, cleared: c.has(l.id), open }; });
}
// いま入れる級（スライドに作るページを決める）
export const openLessons = (cleared: Set<string> | string[], all = false): Lesson[] => {
  const c = cleared instanceof Set ? cleared : new Set(cleared);
  let open = true; const out: Lesson[] = [];
  for (const lv of LEVELS) { if (all || open) out.push(...lv.lessons); open = open && lv.lessons.filter((l) => l.boss).every((l) => c.has(l.id)); }
  return out;
};
export interface DesignSummary { cleared: number; total: number; level: string; attempts: number; wrong: number; lastAt: string; ids: string[] }
export function designSummary(rows: { quest: string; ok: boolean; created_at: string }[]): DesignSummary {
  const ids = new Set<string>(); let attempts = 0, wrong = 0, lastAt = '';
  for (const r of rows) {
    const id = r.quest.slice(DESIGN_PREFIX.length); if (!lessonById(id)) continue;
    attempts++; if (r.ok) ids.add(id); else wrong++;
    if (r.created_at > lastAt) lastAt = r.created_at;
  }
  const lv = LEVELS.find((l) => !l.lessons.every((x) => ids.has(x.id)));
  return { cleared: ids.size, total: LESSONS.length, level: lv ? lv.name : '修了', attempts, wrong, lastAt, ids: [...ids] };
}
