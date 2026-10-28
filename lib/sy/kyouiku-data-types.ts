import type { TypingSummary } from './kyouiku-typing';
import type { DesignSummary } from './design';
import type { CheckAdmin } from './kyouiku-check-judge';
import type { MosSummary } from './mos';

// 教育データ（受講者ごとの進み具合）の形。サーバ（lib/kyouiku-data.ts）と画面（components/kyouiku/KyouikuData.tsx）の両方が使う
export interface WorldInfo { id: string; no: string; name: string; total: number; quests: { id: string; no: string; title: string; total: number }[] }
export interface QuestStat { id: string; done: number; total: number; attempts: number; wrong: number; clearedAt: string }
export interface Learner {
  key: string;                       // subject_key（n:氏名 / u:メール）
  kind: 'member' | 'staff';          // 要員 / 内勤
  name: string;
  trial: boolean;                    // おためし（参画決定前の人。何が開くかは 管理画面の「解放」タブ＝lib/kyouiku-release-types.ts）
  email: string;                     // Google アカウント（内勤はログインのメール。要員は本人がアンケートで答えたか、内勤が入れたもの。無ければ ''）
  level: string;                     // 最初のアンケートのレベル（未回答は ''）
  startNo: string;                   // 本人が選んだ始めるワールド（'ワールド1' など）
  worlds: { done: number; total: number }[];   // ワールドごとの正解ステップ数
  done: number; total: number;       // 全体
  cleared: number;                   // クリアしたクエスト数
  current: { no: string; title: string; world: string } | null;   // いま取り組んでいるクエスト（全部クリアなら null）
  attempts: number; wrong: number;   // 答え合わせの回数と、そのうち不正解
  firstAt: string; lastAt: string;   // 最初と最後の記録（アンケートを含む）
  sheetUrl: string;                  // 本人の練習用スプシ（まだ無ければ ''）
  quests: QuestStat[];
  // CCNA コース（manager がオンにした人だけ on=true）。caught/total＝図鑑、gymBest＝エリアの試験のいちばん良い点
  ccna: { on: boolean } | null;   // CCNA を配った人か（ccna_members）。図鑑あつめの数字は 2026-10-20 に消した
  ccnaLec: { done: number; total: number; current: string } | null;   // CCNA 講義（メイン・lib/ccna/lecture）。答え合わせを1回もしていない人は null
  // タイピング コース（1回でも遊んだ人だけ）。まとめの形は lib/kyouiku-typing.ts
  typing: TypingSummary | null;
  // デザインリテラシー コース（1回でも答え合わせをした人・スライドを作った人）。まとめの形は lib/design/index.ts。deckUrl = 本人の Google スライド
  design: (DesignSummary & { deckUrl: string }) | null;
  // MOS コース（1回でも触った人だけ）。まとめの形は lib/mos/index.ts
  mos: MosSummary | null;
  // 修了テスト（2026-10-05）。excel = エクセルの「さいごの しれん」（passed・runs=挑戦した回数・bestMiss=合格した回の いちばん少ない まちがい）／typing = タイピング検定の いちばん良い回（label='3級' など）
  tests: { excel: { passed: boolean; runs: number; bestMiss: number | null } | null; typing: { label: string; kpm: number; accuracy: number; passed: boolean; plays: number } | null };
  // スキルチェック（2026-10-09・lib/kyouiku-check.ts）。1科目でも受けた人だけ。科目ごとに 初回と最新の点・分野別・問題ごとの ○×。self = 本人だと確かめてから受けた
  check: CheckAdmin | null;
  recent: { no: string; step: number; ok: boolean; at: string }[];   // 最近の答え合わせ（新しい順・15件）
}
export interface KyouikuData { worlds: WorldInfo[]; learners: Learner[]; total: number; questCount: number }
