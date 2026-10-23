// 転籍台帳（人事管理）＝グループ会社のあいだで籍を移す人の台帳。見本データ（本物の名前・会社ではない）。
//   今のシステムでは、名簿の「所属会社」が2列（契約したときの会社／今の会社）あり、転籍の印は「今の会社」と比べて付く。
//   この台帳で「完了」にすると、名簿の今の会社が転籍日から切り替わる想定。
export const COMPANIES = ['本社', 'グループA社', 'グループB社', 'グループC社'] as const;
export type Company = (typeof COMPANIES)[number];

export const T_STATES = ['打診中', '本人の同意', '退職・入社の書類', '社会保険の切り替え', '完了', '取りやめ'] as const;
export type TState = (typeof T_STATES)[number];

export const T_TO: Record<TState, string> = {
  打診中: '→ 担当のやることに残っています',
  本人の同意: '→ 同意書の控えを社員ページの書類に付けました',
  '退職・入社の書類': '→ 元の会社の退職と、先の会社の雇用契約の下書きを作りました',
  社会保険の切り替え: '→ 労務の「社保・雇用保険の手続き」に載りました',
  完了: '→ 名簿の今の所属会社を転籍日から切り替える予約を入れました',
  取りやめ: '→ 台帳に残したまま、手続きの一覧から外しました',
};

export const MONTH_STARTS = ['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01'];

export type Tenseki = { id: string; personId: string; name: string; on: string; from: Company; to: Company; state: TState; by: string };

export const TENSEKI: Tenseki[] = [
  { id: 't1', personId: 's0302', name: '鈴木 一郎', on: '2026-11-01', from: '本社', to: 'グループA社', state: '退職・入社の書類', by: '中村' },
  { id: 't2', personId: 's0410', name: '渡辺 涼', on: '2026-11-01', from: 'グループB社', to: '本社', state: '本人の同意', by: '田中' },
  { id: 't3', personId: 's0388', name: '伊藤 誠', on: '2026-12-01', from: '本社', to: 'グループC社', state: '打診中', by: '中村' },
  { id: 't4', personId: 's0412', name: '山田 太郎', on: '2026-12-01', from: 'グループA社', to: 'グループB社', state: '社会保険の切り替え', by: '田中' },
  { id: 't5', personId: 's0399', name: '高橋 健', on: '2026-10-01', from: '本社', to: 'グループA社', state: '完了', by: '中村' },
];

// 台帳に足せる人（見本）
export const CANDIDATES = [
  { id: 's0441', name: '中村 優', company: '本社' as Company },
  { id: 's0455', name: '加藤 葵', company: 'グループB社' as Company },
  { id: 's0470', name: '佐々木 蓮', company: '本社' as Company },
];
