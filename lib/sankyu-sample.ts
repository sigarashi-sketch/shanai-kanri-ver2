// 産休・育休（人事管理）の見本データ。本物の名前・日付ではない。
//   期間は予定日から自動で出す（産前6週・多胎14週／産後8週／育休は原則1歳の前日まで・延長は1歳6か月→2歳）。
//   社保・給付金の申請そのものは労務担当（freee）の仕事 → ここでは「渡す」項目として並べるだけ。
export const TODAY = '2026-10-23';

export type Kind = '本人の出産' | '配偶者の出産';
export type SankyuCase = { id: string; personId: string; person: string; site: string; sales: string; kind: Kind; due: string; multi: boolean };

export const CASES: SankyuCase[] = [
  { id: 'k1', personId: 's0399', person: '高橋 健', site: 'G社（品川）', sales: '田中', kind: '本人の出産', due: '2026-12-13', multi: false },
  { id: 'k2', personId: 's0475', person: '小川 さくら', site: 'H社（渋谷）', sales: '小林', kind: '本人の出産', due: '2027-03-02', multi: true },
  { id: 'k3', personId: 's0302', person: '鈴木 一郎', site: 'D社（大手町）', sales: '小林', kind: '配偶者の出産', due: '2027-01-20', multi: false },
];

export const EXTEND = [
  { key: '1y', label: '1歳まで（原則）', months: 12 },
  { key: '18m', label: '1歳6か月まで（延長）', months: 18 },
  { key: '2y', label: '2歳まで（再延長・最長）', months: 24 },
] as const;
export type ExtendKey = (typeof EXTEND)[number]['key'];

// やること。base＝どの日を起点にするか、off＝その日から何日ずらすか。who＝誰がやるか。
export type Base = 'due' | 'preStart' | 'ikujiStart' | 'ikujiEnd';
export type Todo = { id: string; text: string; base: Base; off: number; who: 'うち（人事）' | '現場・営業' | '労務担当（freee）へ渡す'; link?: { href: string; label: string }; only?: Kind };
export const TODOS: Todo[] = [
  { id: 't1', text: '担当営業に知らせる（現場への伝え方と時期を相談）', base: 'preStart', off: -120, who: '現場・営業' },
  { id: 't2', text: '現場に休みの期間を伝え、代わりの人の要否を決める', base: 'preStart', off: -90, who: '現場・営業' },
  { id: 't3', text: '産休・育休の申出書を受け取る', base: 'preStart', off: -30, who: 'うち（人事）' },
  { id: 't4', text: '状態を「産休」にする予約を入れる', base: 'preStart', off: 0, who: 'うち（人事）', link: { href: '/jinji/yoyaku', label: '変更の予約へ' }, only: '本人の出産' },
  { id: 't5', text: '社会保険料の免除の申出（産前産後）', base: 'preStart', off: 0, who: '労務担当（freee）へ渡す', only: '本人の出産' },
  { id: 't6', text: '出産の連絡を受け、生まれた日を確かめる', base: 'due', off: 0, who: 'うち（人事）' },
  { id: 't7', text: '出産手当金・出産育児一時金の書類', base: 'due', off: 14, who: '労務担当（freee）へ渡す', only: '本人の出産' },
  { id: 't8', text: '育児休業の給付金・社会保険料の免除の申出', base: 'ikujiStart', off: 0, who: '労務担当（freee）へ渡す' },
  { id: 't9', text: '復帰面談（働き方・時短・現場の希望を聞く）', base: 'ikujiEnd', off: -45, who: 'うち（人事）' },
  { id: 't10', text: '復帰予定日の予約を入れる（状態を「稼働中」に戻す）', base: 'ikujiEnd', off: -30, who: 'うち（人事）', link: { href: '/jinji/yoyaku', label: '変更の予約へ' } },
  { id: 't11', text: '復帰先の現場を営業と決める', base: 'ikujiEnd', off: -30, who: '現場・営業' },
];
