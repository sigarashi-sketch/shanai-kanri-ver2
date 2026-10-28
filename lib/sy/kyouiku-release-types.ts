import { WORLDS } from './kyouiku-lessons';

// bdsh のコースを いつ開くか（2026-10-09 shoya「参画決定になるまでは エクセルのショートカットキー編と タイピングだけ。参画決定になったら CCNA と キッティング以外 全部解放。管理ページで設定できるように」）
//   ・「参画決定前」＝ いけどんのプロパーリストに居て、参画決定／稼働中 の行が1つも無い人（lib/kyouiku.ts trialNames・画面では「おためし」）
//     プロパーリストに居ない社員・内勤（u:）は 参画決定前 にしない
//   ・エクセル: 参画決定前は 最初の excelWorlds ワールドまで（0＝エクセルごと閉じる）。参画決定後は 全部
//   ・ほかのコース: 'all'＝参画決定前から開く／'kettei'＝参画決定から開く
//     キッティングは 担当者が人ごとにオンにした人だけ。ここで決めるのは「オンでも 参画決定前は 閉じるか」
//     CCNA は 担当者がオンにした人 ＋ 勉強会（火・木・土）の回答に名前がある人（ccnaStudy・出席／リモート。先の日付の参加予定も含む・欠席だけの人は入れない・2026-10-09 shoya「CCNAは勉強会参加した人だけ 参加予定も含めて」）
//     CCNA 試験対策は 完全に手作業（担当者が人ごとにオンにした人だけ・参画決定にも勉強会にも関係しない・2026-10-09 shoya）＝ここには出さない
//     MOS・デザイン・ITパスポートは 元栓（MOS_LIVE／DESIGN_LIVE／IPASS_LIVE）が閉じている間は ここに関係なく閉じたまま
//   保存先は saiyou.settings key='kyouiku_release'（lib/kyouiku-release.ts）。行が無い間は DEFAULT_RELEASE
export type Gate = 'all' | 'kettei';
export const GATE_COURSES = [
  { id: 'typing', name: 'タイピング', person: false },
  { id: 'design', name: 'デザインリテラシー', person: false },
  { id: 'mos', name: 'MOS Excel', person: false },
  { id: 'ipass', name: 'ITパスポート', person: false },   // 2026-10-12。スマホで解ける4択なので 待機中の人にも開く（最初は 参画決定前から）
  { id: 'ccna', name: 'CCNA', person: true },
  { id: 'kitting', name: 'キッティングから情シスへ', person: true },
] as const;
export type GateCourse = typeof GATE_COURSES[number]['id'];
export interface ReleaseSettings { excelWorlds: number; ccnaStudy: boolean; gates: Record<GateCourse, Gate> }
export const DEFAULT_RELEASE: ReleaseSettings = {
  excelWorlds: 1,   // ワールド0「キーボードとセルの基本」（ショートカットキー編）だけ
  ccnaStudy: true,
  gates: { typing: 'all', design: 'kettei', mos: 'kettei', ipass: 'all', ccna: 'all', kitting: 'kettei' },   // CCNA は 勉強会に来る人（入社前の人も）に開くので 参画決定前から
};
export function cleanRelease(v: unknown): ReleaseSettings {
  const x = (v || {}) as Partial<ReleaseSettings>;
  const n = Math.round(Number(x.excelWorlds));
  const g = (x.gates || {}) as Partial<Record<string, unknown>>;
  return {
    excelWorlds: Number.isFinite(n) ? Math.min(Math.max(0, n), WORLDS.length) : DEFAULT_RELEASE.excelWorlds,
    ccnaStudy: typeof x.ccnaStudy === 'boolean' ? x.ccnaStudy : DEFAULT_RELEASE.ccnaStudy,
    gates: Object.fromEntries(GATE_COURSES.map((c) => [c.id, g[c.id] === 'all' || g[c.id] === 'kettei' ? g[c.id] : DEFAULT_RELEASE.gates[c.id]])) as Record<GateCourse, Gate>,
  };
}
// trial＝参画決定前。参画決定後は いつも開く
export const gateOpen = (s: ReleaseSettings, id: GateCourse, trial: boolean) => !trial || s.gates[id] === 'all';
export const KETTEI_NOTE = '参画が決まると開きます。';
