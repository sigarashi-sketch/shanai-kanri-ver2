// 参画決定者の手続き（人事管理）＝参画が決まった人の、営業 → 人事 → 労務 の引き継ぎ。見本データ（本物の名前・数字ではない）。
//   ・入場日・現場・単価は営業の持ち物（営業が確定させてから人事へ渡す）
//   ・人事は契約書（派遣なら就業条件の明示も）、労務は勤怠の設定と通勤
//   ・その段のやることが全部済むと次の段へ動かせる（戻すのはいつでもできる）
export type Lane = '営業' | '人事' | '労務' | '完了';
export const LANES: { key: Lane; who: string; note: string }[] = [
  { key: '営業', who: '担当営業', note: '入場日・現場・単価を確定' },
  { key: '人事', who: '人事', note: '契約書を交わす' },
  { key: '労務', who: '労務', note: '勤怠の設定・通勤' },
  { key: '完了', who: '', note: '入場の準備ができた人' },
];

export const TASKS: Record<Exclude<Lane, '完了'>, { key: string; label: string; haken?: boolean }[]> = {
  営業: [{ key: 'day', label: '入場日' }, { key: 'site', label: '現場' }, { key: 'price', label: '単価' }],
  人事: [{ key: 'contract', label: '雇用契約書' }, { key: 'meiji', label: '就業条件の明示（派遣）', haken: true }],
  労務: [{ key: 'kintai', label: '勤怠の設定（freee）' }, { key: 'tsukin', label: '通勤経路・定期' }],
};

export const TO_LANE: Record<Lane, string> = {
  営業: '→ 担当営業のやることに戻しました',
  人事: '→ 人事のやることに載りました（契約書の下書きを作りました）',
  労務: '→ 労務のやることに載りました（freee の勤怠と交通費の申請待ちに入りました）',
  完了: '→ 入場日カレンダーと、勤怠の対象（入場日から）に反映しました',
};

export type Handoff = {
  id: string; name: string; sales: string; contract: '派遣' | '準委任';
  day: string; site: string; price: string;
  lane: Lane; done: string[];
};

export const HANDOFFS: Handoff[] = [
  { id: 's0479', name: '小川 陽菜', sales: '小林', contract: '準委任', day: '10/27', site: 'H社（渋谷）', price: '32万', lane: '労務', done: ['day', 'site', 'price', 'contract', 'kintai'] },
  { id: 's0455', name: '加藤 葵', sales: '田中', contract: '派遣', day: '11/1', site: 'E社（川崎）', price: '38万', lane: '人事', done: ['day', 'site', 'price', 'contract'] },
  { id: 's0483', name: '森 拓海', sales: '小林', contract: '準委任', day: '11/1', site: 'B社（大崎）', price: '33万', lane: '人事', done: ['day', 'site', 'price', 'contract'] },
  { id: 's0478', name: '井上 さくら', sales: '田中', contract: '派遣', day: '11/4', site: 'F社（横浜）', price: '35万', lane: '営業', done: ['day', 'site'] },
  { id: 's0470', name: '佐々木 蓮', sales: '小林', contract: '準委任', day: '11/10', site: 'D社（大手町）', price: '—', lane: '営業', done: ['day', 'site'] },
  { id: 's0472', name: '松本 結衣', sales: '小林', contract: '派遣', day: '10/26', site: 'G社（品川）', price: '30万', lane: '完了', done: ['day', 'site', 'price', 'contract', 'meiji', 'kintai', 'tsukin'] },
];
