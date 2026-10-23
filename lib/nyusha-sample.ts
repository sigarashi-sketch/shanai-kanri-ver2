// 入社手続き（人事管理）。見本データ（本物の名前・数字ではない）。
//   今のシステムの「入社手続きの進み具合（担当向け）」と同じ考え方：
//   ・対象は 参画が決まった人・入社予定の人（辞退した人は出さない）
//   ・印は手で付ける（freee・クラウドサインからは自動で取っていない）
//   ・必須の手続きと、人によって要らない手続き（任意＝「対象外」を選べる）がある
export type StepKey = 'keiyaku' | 'kihon' | 'mibun' | 'kouza' | 'tsukin' | 'freee' | 'kenshin' | 'gensen' | 'koyouhoken';
export type StepState = 'まだ' | '済み' | '対象外';

export const STEPS: { key: StepKey; label: string; optional?: boolean; to: string }[] = [
  { key: 'keiyaku', label: '雇用契約', to: '→ 社員ページの書類に「雇用契約（サイン済み）」を付けました' },
  { key: 'kihon', label: '基本情報フォーム', to: '→ 基本情報の一覧と、社員名簿の住所・最寄駅に反映しました' },
  { key: 'mibun', label: '身分証', to: '→ 社員ページの書類に付けました（写真は担当だけが見られます）' },
  { key: 'kouza', label: '給与の口座', to: '→ 給与の振込み先（freee に送る前の控え）に反映しました' },
  { key: 'tsukin', label: '通勤経路', to: '→ 交通費・経費の定期の申請に回しました' },
  { key: 'freee', label: 'freee 登録', to: '→ 労務の「freee 送信管理」に送信済みとして付けました' },
  { key: 'kenshin', label: '健康診断', to: '→ 受けたことだけを残しました（結果の中身は載せません）' },
  { key: 'gensen', label: '前職の源泉徴収票', optional: true, to: '→ 年末調整の書類に付けました' },
  { key: 'koyouhoken', label: '雇用保険の番号', optional: true, to: '→ 労務の雇用保険の手続きに回しました' },
];

export type Newcomer = {
  id: string; name: string; kind: '入社予定' | '参画決定';
  joinOn: string; // 入社日（手続きの期限）
  site: string; recruiter: string;
  steps: Record<StepKey, StepState>;
};

const S = (done: StepKey[], na: StepKey[] = []): Record<StepKey, StepState> =>
  Object.fromEntries(STEPS.map((s) => [s.key, done.includes(s.key) ? '済み' : na.includes(s.key) ? '対象外' : 'まだ'])) as Record<StepKey, StepState>;

export const NEWCOMERS: Newcomer[] = [
  { id: 's0479', name: '小川 陽菜', kind: '入社予定', joinOn: '2026-10-27', site: 'H社（渋谷）', recruiter: '中村', steps: S(['keiyaku', 'kihon', 'mibun'], ['gensen']) },
  { id: 's0455', name: '加藤 葵', kind: '参画決定', joinOn: '2026-11-01', site: 'E社（川崎）', recruiter: '田中', steps: S(['keiyaku', 'kihon', 'mibun', 'kouza', 'kenshin', 'gensen'], ['koyouhoken']) },
  { id: 's0483', name: '森 拓海', kind: '入社予定', joinOn: '2026-11-01', site: 'B社（大崎）', recruiter: '中村', steps: S(['keiyaku', 'kihon']) },
  { id: 's0478', name: '井上 さくら', kind: '参画決定', joinOn: '2026-11-04', site: 'F社（横浜）', recruiter: '田中', steps: S(['keiyaku', 'kihon', 'mibun', 'tsukin', 'freee', 'koyouhoken'], ['gensen']) },
  { id: 's0470', name: '佐々木 蓮', kind: '参画決定', joinOn: '2026-11-10', site: 'D社（大手町）', recruiter: '中村', steps: S(['keiyaku', 'kihon', 'mibun', 'kouza']) },
  { id: 's0486', name: '西村 大輝', kind: '入社予定', joinOn: '2026-11-17', site: 'C社（新宿）', recruiter: '田中', steps: S(['keiyaku', 'kihon', 'mibun', 'kouza', 'tsukin', 'kenshin'], ['gensen', 'koyouhoken']) },
];

/** 必須の手続きで「まだ」の数（メニューのバッジ）。 */
export const openRequired = (n: Newcomer) => STEPS.filter((s) => !s.optional && n.steps[s.key] === 'まだ').length;
