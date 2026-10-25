// プロパーリスト（今の proper.html）の列・選択肢・スコアの形。画面（components/ProperList.tsx）とサーバ（app/api/live/proper-*）の両方が読む純粋な定義。
//   ・列の並び（idx）は今の api/_op_crud.ts の COLUMNS と1つもずらさない（保存は {idx: 値} で送るため。ずれると別の列に書かれる）
//   ・画面から送るのは「列名（field）→値」。idx に直すのはサーバ（proper-save の中）だけ
//   ・ここには本物の名前・単価・顧客名を書かない（形とキー名だけ）
import { normName } from './eigyo-common';

export type ProperColType = 'text' | 'bool';
export type ProperColDef = { field: string; label: string; type: ProperColType };

/** 今の api/_op_crud.ts の COLUMNS と同じ順・同じ field（idx＝この配列の位置） */
export const LEGACY_COLUMNS: readonly ProperColDef[] = [
  { field: 'name', label: '要員名', type: 'text' },
  { field: 'tantou', label: '担当', type: 'text' },
  { field: 'eki', label: '最寄駅', type: 'text' },
  { field: 'kadou', label: '稼働', type: 'text' },
  { field: 'tsuukin', label: '通勤', type: 'text' },
  { field: 'shozoku', label: '所属', type: 'text' },
  { field: 'gakumen', label: '額面', type: 'text' },
  { field: 'sukishi', label: 'スキシ', type: 'text' },
  { field: 'summary', label: 'サマリ', type: 'text' },
  { field: 'zenshoku', label: '前職/経験/資格', type: 'text' },
  { field: 'shift', label: 'シフト', type: 'text' },
  { field: 'yakin', label: '夜勤', type: 'text' },
  { field: 'shucchou', label: '出張', type: 'text' },
  { field: 'kensaku', label: '検索', type: 'text' },
  { field: 'genba_made', label: '現場まで', type: 'text' },
  { field: 'memo', label: 'メモ', type: 'text' },
  { field: 'sentouryoku', label: '戦闘力', type: 'text' },
  { field: 'zokusei', label: '属性', type: 'text' },
  { field: 'kibou_shokushu', label: '希望職種', type: 'text' },
  { field: 'heikou_suu', label: '並行数', type: 'text' },
  { field: 'nyuujou_bi', label: '入場日', type: 'text' },
  { field: 'sankaku_bi', label: '参画日', type: 'text' },
  { field: 'shoudaku_bi', label: '承諾日', type: 'text' },
  { field: 'hearing_booking', label: '初回ヒアリング予約', type: 'text' },
  { field: 'poa', label: '営業止め', type: 'bool' },
  { field: 'jitai', label: '辞退', type: 'bool' },
  { field: 'sankaku_kettei', label: '参画決定', type: 'bool' },
  { field: 'kadou_chu', label: '稼働中', type: 'bool' },
  { field: 'sai_assign', label: '再アサイン', type: 'bool' },
  { field: 'eigyo_teishi', label: '営業停止', type: 'bool' },
  { field: 'kanagawa', label: '神奈川要員', type: 'bool' },
  { field: 'needs_review', label: '要確認', type: 'bool' },
  { field: 'application_id', label: 'application_id', type: 'text' },
  { field: 'applicant_id', label: 'applicant_id', type: 'text' },
  { field: 'shoudaku_nyusha_bi', label: '稼働可能日', type: 'text' },
  { field: 'kansai', label: '関西要員', type: 'bool' },
  // 辞退日・営業止め日（今のシステムの 0366・末尾に足した順のまま＝idx をずらさない）
  { field: 'jitai_bi', label: '辞退日', type: 'text' },
  { field: 'poa_bi', label: '営業止め日', type: 'text' },
];

/** ver2 から直してよい列（氏名・ミンミカの ID・検索用の列は直させない） */
export const EDITABLE_FIELDS: ReadonlySet<string> = new Set(
  LEGACY_COLUMNS.map((c) => c.field).filter((f) => !['name', 'application_id', 'applicant_id', 'kensaku'].includes(f)),
);
export const fieldIdx = (field: string) => LEGACY_COLUMNS.findIndex((c) => c.field === field);
export const colOfField = (field: string) => LEGACY_COLUMNS.find((c) => c.field === field) ?? null;

/** 決まった選択肢がある列（今の値が選択肢に無ければ、画面はその値も「今の値」として残す＝勝手に消さない） */
export const SELECT_OPTIONS: Record<string, readonly string[]> = {
  sentouryoku: ['0', '1', '2', '3', '4', '5'],          // 戦闘力 0〜5（スキルの点と半々で混ぜる）
  shift: ['可能', '要検討', '不可'],                      // 今の DB の値そのまま（スコアは 可能→可・要検討→要検討・不可→不可 と読む）
  yakin: ['可能', '要検討', '不可'],
  shucchou: ['可能', '要検討', '不可'],
};
/** 古い書き方の見え方（保存されている値は、人が選び直すまで変えない） */
export const SELECT_ALIAS: Record<string, Record<string, string>> = {
  shift: { 不可能: '不可', NG: '不可' }, yakin: { 不可能: '不可', NG: '不可' }, shucchou: { 不可能: '不可', NG: '不可' },
};
/** 空のときの見え方 */
export const SELECT_BLANK: Record<string, string> = { shift: '未入力', yakin: '未入力', shucchou: '未入力', sentouryoku: '—' };
/** 絞り込み・並べ替えに使う見え方（不可能・NG は 不可 として数える） */
export const shownValue = (field: string, v: string) => SELECT_ALIAS[field]?.[v] ?? v;
/** 自由記述のまま文字で入れる列のうち、長い文（複数行）のもの */
export const LONG_TEXT: ReadonlySet<string> = new Set(['memo', 'summary', 'zenshoku']);

// ---- スコア（GET /api/roster?op=score の返り＝今の api/_proper_score.ts の ScoreResult） ----
export type SkillPart = { label: string; points: number; max: number; note: string };
export type ScoreRow = {
  id: string;
  skill: number; skillRule: number; sento: number | null; skillThin: boolean; skillParts: SkillPart[];
  join: number; decline: number; poa: number;
  days: number | null;
  cases: { sends: number; ok: number; ng: number; undecided: number; declineWords: number; condWords: number; reschedWords: number } | null;
  resp: { outs: number; replied: number; rate: number | null; medianHours: number | null } | null;
  joinWhy: { label: string; v: number }[];
  declineWhy: { label: string; v: number }[];
};
export type ScoreMeta = {
  trained: number; samples: number; withT1: number;
  counts: { join: number; decline: number; poa: number }; base: { join: number; decline: number; poa: number };
  cvAuc: { join: number | null; decline: number | null; joinLate: number | null; declineLate: number | null };
  features: number; generatedAt: string; trainFrom: string;
};
export type ScoreRes = { ok: boolean; cached?: boolean; rows: ScoreRow[]; meta: ScoreMeta; error?: string };
export type ScoreKind = 'skill' | 'join' | 'decline' | 'poa';

export type Band = 'hi' | 'mid' | 'lo' | 'thin';
/** 今のプロパーリストと同じ3段の色分け（スキル＝55以上/30以上/それ未満、確率＝全体平均より8ポイント良い/並み/悪い） */
export function scoreBand(kind: ScoreKind, v: number, thin: boolean, meta: ScoreMeta | null): Band {
  if (kind === 'skill') return thin ? 'thin' : v >= 55 ? 'hi' : v >= 30 ? 'mid' : 'lo';
  const b = meta ? meta.base[kind] : 40;
  const good = kind === 'join' ? v - b : b - v;   // 平均より良い側がプラス
  return good >= 8 ? 'hi' : good <= -8 ? 'lo' : 'mid';
}
export const BAND_STYLE: Record<Band, { background: string; color: string }> = {
  hi: { background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' },
  mid: { background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' },
  lo: { background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' },
  thin: { background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' },
};
export const scoreValue = (s: ScoreRow, k: ScoreKind) => (k === 'skill' ? s.skill : k === 'join' ? s.join : k === 'decline' ? s.decline : s.poa);
export const scoreText = (s: ScoreRow, k: ScoreKind) => (k === 'skill' ? String(s.skill) : `${Math.round(scoreValue(s, k))}%`);
/** 列の絞り込みの値（今の scoreFilterValue と同じ） */
export function scoreFilterLabel(s: ScoreRow | null, k: ScoreKind, meta: ScoreMeta | null): string {
  if (!s) return '対象外';
  const v = scoreValue(s, k);
  if (k === 'skill') return v >= 55 ? '55以上' : v >= 30 ? '30〜54' : '30未満';
  const b = scoreBand(k, v, false, meta);
  return b === 'hi' ? '平均より良い' : b === 'lo' ? '平均より悪い' : '平均並み';
}
export const SCORE_FILTER_OPTS: Record<ScoreKind, readonly string[]> = {
  skill: ['55以上', '30〜54', '30未満', '対象外'],
  join: ['平均より良い', '平均並み', '平均より悪い', '対象外'],
  decline: ['平均より良い', '平均並み', '平均より悪い', '対象外'],
  poa: ['平均より良い', '平均並み', '平均より悪い', '対象外'],
};

// ---- 通勤エリア（今の api/_commute.ts の「選べるブロック」だけ写す。市区町村コードは持たない＝保存時に今のシステムが展開する） ----
export type CommuteBlock = { id: string; pref: 'tokyo' | 'kanagawa' | 'saitama' | 'chiba'; name: string; sub: string; off?: boolean };
export const COMMUTE_PREF: Record<CommuteBlock['pref'], string> = { tokyo: '東京都', kanagawa: '神奈川県', saitama: '埼玉県', chiba: '千葉県' };
export const COMMUTE_BLOCKS: readonly CommuteBlock[] = [
  { id: 'b0', pref: 'tokyo', name: '東京23区・都心', sub: '新宿・渋谷・東京' },
  { id: 'b1', pref: 'tokyo', name: '東京23区・城東', sub: '上野・錦糸町・北千住' },
  { id: 'b2', pref: 'tokyo', name: '東京23区・城南', sub: '品川・大田・世田谷' },
  { id: 'b3', pref: 'tokyo', name: '東京23区・城北', sub: '池袋・板橋・練馬' },
  { id: 'b4', pref: 'tokyo', name: '多摩西部・南部', sub: '八王子・立川・町田' },
  { id: 'b5', pref: 'tokyo', name: '多摩東部', sub: '吉祥寺・府中・調布' },
  { id: 'b6', pref: 'kanagawa', name: '横浜市', sub: '横浜・新横浜・港北' },
  { id: 'b7', pref: 'kanagawa', name: '川崎市', sub: '川崎・武蔵小杉' },
  { id: 'b8', pref: 'kanagawa', name: '相模原市', sub: '相模原・橋本' },
  { id: 'b9', pref: 'kanagawa', name: '横須賀・三浦', sub: '横須賀・鎌倉・逗子' },
  { id: 'b10', pref: 'kanagawa', name: '湘南', sub: '藤沢・平塚・茅ヶ崎' },
  { id: 'b11', pref: 'kanagawa', name: '県西', sub: '小田原・南足柄・箱根' },
  { id: 'b12', pref: 'kanagawa', name: '県央', sub: '厚木・海老名・大和' },
  { id: 'b13', pref: 'saitama', name: 'さいたま市', sub: '大宮・浦和' },
  { id: 'b14', pref: 'saitama', name: '川越・比企', sub: '川越・東松山' },
  { id: 'b15', pref: 'saitama', name: '北部', sub: '熊谷・深谷・本庄', off: true },
  { id: 'b16', pref: 'saitama', name: '県南', sub: '川口・戸田・朝霞' },
  { id: 'b17', pref: 'saitama', name: '秩父', sub: '秩父・寄居', off: true },
  { id: 'b18', pref: 'saitama', name: '西部', sub: '所沢・入間・狭山' },
  { id: 'b19', pref: 'saitama', name: '県東', sub: '春日部・越谷・久喜' },
  { id: 'b20', pref: 'saitama', name: '県央', sub: '上尾・桶川・鴻巣' },
  { id: 'b21', pref: 'chiba', name: '千葉市', sub: '千葉・海浜幕張' },
  { id: 'b22', pref: 'chiba', name: '香取・海匝', sub: '銚子・成田東', off: true },
  { id: 'b23', pref: 'chiba', name: '葛南', sub: '船橋・市川・浦安' },
  { id: 'b24', pref: 'chiba', name: '夷隅・安房', sub: '館山・鴨川', off: true },
  { id: 'b25', pref: 'chiba', name: '市原・君津', sub: '市原・木更津' },
  { id: 'b26', pref: 'chiba', name: '東葛飾', sub: '柏・松戸・流山' },
  { id: 'b27', pref: 'chiba', name: '山武・長生', sub: '茂原・東金', off: true },
  { id: 'b28', pref: 'chiba', name: '印旛', sub: '成田・佐倉・印西' },
];
export const SELECTABLE_BLOCK_IDS: ReadonlySet<string> = new Set(COMMUTE_BLOCKS.filter((b) => !b.off).map((b) => b.id));

/** GET /api/commute-area?action=list の1行 */
export type CommuteListRow = { key: string; any: boolean; source: 'sales' | 'form'; short: string; full: string };
/** GET /api/commute-area?name=… の返り（使う分だけ） */
export type CommuteDetail = {
  status: 'ok' | 'legacy' | 'not_answered' | 'ambiguous'; any: boolean; blocks: { id: string }[];
  legacyLabel: string | null; sales: { any: boolean; blocks: string[] } | null; canEdit: boolean; salesError?: string;
};
/** 一覧の氏名キー（今のシステムは normalized_name で返す＝normName で当てる） */
export const commuteKey = (name: string) => normName(name);
