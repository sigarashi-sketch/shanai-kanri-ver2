// 待機・再アサインの見本（本物の名前ではない）。基準日は 2026-10-23。
//   sales＝担当営業＝ミンミカの成約者（matched_by）。recruiter＝採用担当（営業リストの「担当」）。混ぜない。
export const TODAY = '2026-10-23';
export const SALES_REPS = ['小林', '田中', '三枝', '博田'];
export const TAIKI_STATES = ['案件を探す', '案件を送った', '面談調整中', '参画決定', 'いったん保留'] as const;
export type TaikiState = (typeof TAIKI_STATES)[number];

export type Taiki = {
  id: string; name: string; kind: '待機中' | 'もうすぐ待機';
  since?: string;       // 待機に入った日（待機中）
  contractEnd?: string; // 今の現場の契約終了日（もうすぐ待機）
  site?: string;
  station: string; want: string; skills: string[]; price: number; // 希望単価（万）
  sales: string; recruiter: string; state: TaikiState;
};

export const TAIKI: Taiki[] = [
  { id: 's0476', name: '井上 翔', kind: '待機中', since: '2026-09-12', station: '川口', want: 'ヘルプデスク', skills: ['ITパスポート'], price: 30, sales: '博田', recruiter: '布野', state: '案件を送った' },
  { id: 's0441', name: '中村 優', kind: '待機中', since: '2026-09-30', station: '蕨', want: 'インフラ・監視運用', skills: ['CCNA', 'LPIC-1'], price: 32, sales: '田中', recruiter: '中村', state: '面談調整中' },
  { id: 's0470', name: '佐々木 蓮', kind: '待機中', since: '2026-10-10', station: '大宮', want: 'キッティング・開発', skills: ['基本情報技術者'], price: 33, sales: '三枝', recruiter: '吉村', state: '案件を探す' },
  { id: 's0472', name: '松本 結衣', kind: '待機中', since: '2026-10-17', station: '赤羽', want: 'テスト・ヘルプデスク', skills: ['MOS'], price: 30, sales: '小林', recruiter: '田中', state: '案件を探す' },
  { id: 's0477', name: '森 さくら', kind: 'もうすぐ待機', contractEnd: '2026-11-15', site: 'H社（川崎）', station: '武蔵小杉', want: 'キッティング', skills: ['ITパスポート'], price: 31, sales: '田中', recruiter: '吉村', state: '案件を探す' },
  { id: 's0388', name: '伊藤 誠', kind: 'もうすぐ待機', contractEnd: '2026-11-30', site: 'C社（新宿）', station: '赤羽', want: 'ネットワーク運用', skills: ['CCNA', 'AWS SAA'], price: 42, sales: '小林', recruiter: '田中', state: '案件を探す' },
  { id: 's0410', name: '渡辺 涼', kind: 'もうすぐ待機', contractEnd: '2026-11-30', site: 'F社（横浜）', station: '横浜', want: 'ヘルプデスク', skills: ['MOS'], price: 34, sales: '小林', recruiter: '田中', state: '案件を探す' },
];

const DAY = 86400000;
export const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY);
/** 待機中＝待機に入ってから何日目／もうすぐ待機＝契約終了まであと何日 */
export const taikiDays = (t: Taiki) => (t.kind === '待機中' ? daysBetween(t.since!, TODAY) : daysBetween(TODAY, t.contractEnd!));
