// 資格手当（人事管理）。見本データ（本物の名前・数字ではない）。
//   今のシステムの決まり：
//   ・本人が LINE の「資格手当申請」から、資格をプルダウンで選び、合格証・領収書を付けて申請する
//   ・手当の額は資格から一意に決まる（資格取得支援の手当一覧）。本人には額を入れさせない
//   ・「現場経験N年で＋X円」の加算は自動では効かせない → 承認のときに担当が選ぶ
//   ・流れは 合格証の確認 → 承認 → 給与に反映（毎月の手当に足す）
export const MASTER: Record<string, { amount: number; plus?: { label: string; amount: number } }> = {
  'ITパスポート試験': { amount: 1000 },
  '基本情報技術者試験': { amount: 15000 },
  '情報セキュリティマネジメント試験': { amount: 25000 },
  'CCNA': { amount: 10000, plus: { label: '現場経験1年', amount: 5000 } },
  'LPIC-1（102試験）': { amount: 10000 },
  'AWS認定 クラウドプラクティショナー': { amount: 5000 },
  'AWS認定 Solutions Architect – Associate': { amount: 10000 },
  'Oracle認定 Java Silver SE': { amount: 5000 },
  'CCNP': { amount: 30000, plus: { label: '現場経験2年', amount: 20000 } },
};

export type SState = '確認待ち' | '承認待ち' | '反映待ち' | '反映ずみ' | '差し戻し';
export type ShikakuApp = {
  id: string; personId: string; name: string; cert: string;
  passedOn: string; filedAt: string; years: number; // 現場経験（年）
  files: ('合格証' | '領収書')[];
  state: SState; plus?: boolean; reason?: string;
};

export const APPS: ShikakuApp[] = [
  { id: 'a1', personId: 's0441', name: '中村 優', cert: 'CCNA', passedOn: '10/12', filedAt: '10/14', years: 0, files: ['合格証', '領収書'], state: '確認待ち' },
  { id: 'a2', personId: 's0388', name: '伊藤 誠', cert: 'AWS認定 Solutions Architect – Associate', passedOn: '10/05', filedAt: '10/08', years: 2, files: ['合格証', '領収書'], state: '承認待ち' },
  { id: 'a3', personId: 's0470', name: '佐々木 蓮', cert: '基本情報技術者試験', passedOn: '10/01', filedAt: '10/03', years: 0, files: ['合格証', '領収書'], state: '反映待ち' },
  { id: 'a4', personId: 's0412', name: '山田 太郎', cert: 'CCNA', passedOn: '10/16', filedAt: '10/18', years: 1, files: ['合格証', '領収書'], state: '確認待ち' },
  { id: 'a5', personId: 's0472', name: '松本 結衣', cert: 'ITパスポート試験', passedOn: '10/18', filedAt: '10/20', years: 0, files: ['領収書'], state: '確認待ち' },
  { id: 'a6', personId: 's0410', name: '渡辺 涼', cert: 'LPIC-1（102試験）', passedOn: '10/19', filedAt: '10/21', years: 1, files: ['合格証', '領収書'], state: '承認待ち' },
];

export const S_REJECT = ['合格証の名前が違う', '合格証が読めない', '合格証が付いていない', '手当一覧にない資格'] as const;

// いま毎月 手当が付いている人（見本）
export const MONTHLY: { personId: string; name: string; cert: string; amount: number; since: string }[] = [
  { personId: 's0302', name: '鈴木 一郎', cert: '基本情報技術者試験', amount: 15000, since: '2025/06' },
  { personId: 's0388', name: '伊藤 誠', cert: 'CCNA（現場経験1年）', amount: 15000, since: '2025/02' },
  { personId: 's0399', name: '高橋 健', cert: 'LPIC-1（102試験）', amount: 10000, since: '2025/09' },
  { personId: 's0455', name: '加藤 葵', cert: 'ITパスポート試験', amount: 1000, since: '2026/04' },
];

export const PAY_MONTH = '11月分';
export const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;
export const amountOf = (a: ShikakuApp) => { const m = MASTER[a.cert]; return m ? m.amount + (a.plus && m.plus ? m.plus.amount : 0) : 0; };
