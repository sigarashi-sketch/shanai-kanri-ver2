// 成約日報の見本。営業が毎日出す。答えは選ぶ・数を入れるだけ。
//   ①今日の行動指標（日報②の項目名のまま）②成約（名前→上位会社→現場→契約）③退職者欄
//   ②で答えた条件は請求条件の正になる（今のシステムの「日報が正」の方針）。③に載せたら退社確定。
import { TAIKI } from './taiki-sample';

export const METRICS = [
  { key: 'sent', label: '送った案件数', avg: 14 },
  { key: 'mendan', label: '面談数', avg: 2 },
  { key: 'seiyaku', label: '成約数', avg: 1 },
] as const;
export type MetricKey = (typeof METRICS)[number]['key'];

export const SEIYAKU_PEOPLE = TAIKI.map((t) => ({ id: t.id, name: t.name }));
export const COMPANIES: Record<string, string[]> = {
  'A社': ['品川 サーバー監視', '大手町 運用'],
  'B社': ['新宿 ネットワーク運用'],
  'C社': ['大宮 キッティング', '川崎 PC入れ替え'],
};
export const PRICES = ['33万', '35万', '36万', '38万', '40万', '42万', '45万'];
export const STARTS = ['11/1', '11/16', '12/1'];
export const SHUSSHA = ['常駐', '週2常駐', 'フルリモート'];

// 退職者欄の候補（営業リストで稼働中の人）。載せたら名簿の退社・営業リストの稼働中を外す
export const RETIRE_CANDIDATES = [
  { id: 's0412', name: '山田 太郎', site: 'A社（品川）' },
  { id: 's0302', name: '鈴木 一郎', site: 'D社（大手町）' },
  { id: 's0399', name: '高橋 健', site: 'G社（品川）' },
  { id: 's0490', name: '石田 拓', site: 'J社（池袋）' },
];
