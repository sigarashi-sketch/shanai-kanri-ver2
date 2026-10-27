// ステージ/状態の定義（ここが唯一の正）。
//   recruit … 候補者のステージ（採用版で管理）
//   employee … 従業員の状態（いけどん本番の名簿から判定・採用版では変えない）
//   dot … 状態バッジの点の色（DESIGN.md：灰色の地に色の点）
export type StageGroup = 'recruit' | 'employee' | 'closed';
export interface StageDef { key: string; group: StageGroup; dot: string }

export const STAGES: StageDef[] = [
  { key: '営業中', group: 'recruit', dot: '#0095f6' },   // 2026-10-01 shoya: 旧「新規」。候補者の最初の状態＝営業中
  { key: '連絡中', group: 'recruit', dot: '#0095f6' },
  { key: '面談予定', group: 'recruit', dot: '#4f5bd5' },
  { key: '面談済', group: 'recruit', dot: '#962fbf' },
  { key: '内定', group: 'recruit', dot: '#d62976' },
  { key: '辞退', group: 'recruit', dot: '#a8a8a8' },
  { key: '入社予定', group: 'employee', dot: '#962fbf' },
  { key: '稼働中', group: 'employee', dot: '#2e9e4f' },
  { key: '在籍', group: 'employee', dot: '#2e9e4f' },
  { key: '待機', group: 'employee', dot: '#e07a00' },
  { key: '退社', group: 'closed', dot: '#a8a8a8' },
];
export const STAGE_KEYS = STAGES.map((s) => s.key);
export const RECRUIT_STAGE_KEYS = STAGES.filter((s) => s.group === 'recruit').map((s) => s.key);
// 旧表記のステージを今の表記に読み替える（DBに「新規」で残っている行があっても画面は「営業中」）
export function stageKey(key: string): string { return key === '新規' ? '営業中' : key; }
export function stageDot(key: string): string {
  return STAGES.find((s) => s.key === key)?.dot || (key === '参画決定' ? '#962fbf' : '#a8a8a8');
}

// 候補者の画面に出す状態（2026-10-05 shoya「旧ぽあは営業中じゃない。プロパーリストで営業中のやつだけ営業中に」）。
//   ステージが「営業中」（＝登録したときの初期値のまま）の人は、いけどんのプロパーリストの状態（lib/roster.ts properStatus）をそのまま出す。
//   リストに居なければ「リスト外」。連絡中・面談予定 など 人が動かしたステージは そのまま
export const NOT_IN_PROPER = 'リスト外';
// 絞り込みチップに並べる順（ステージ＋プロパーリスト由来の状態）。選べるステージ（STAGES）には入れない
export const STATUS_KEYS = [...STAGE_KEYS, '参画決定', '営業止め', NOT_IN_PROPER];
export function candidateStatus(stage: string, proper: string | undefined): string {
  return stage === '営業中' ? (proper || NOT_IN_PROPER) : stage;
}
