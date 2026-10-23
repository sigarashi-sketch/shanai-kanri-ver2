// 案件ストックの見本（本物の案件ではない）。progress-sample の CASES に中身を足したもの。
//   送ってはいけない案件（アダルト・店舗運営系）は今のシステムの送信の共通関数と同じ考えでブロックする。
//   「店舗」だけ・店舗向けのIT（POSレジ交換・店舗向けヘルプデスク）は送ってよい。夜職の事務も対象外。
import { CASES } from './progress-sample';
import { commuteMin } from './map-sample';
import type { Taiki } from './taiki-sample';

export type Shouryu = 'エンド直' | '元請けから' | '二次請けから';
export type StockCase = {
  no: string; name: string; place: string; station: string; priceMin: number; priceMax: number;
  skills: string[]; shouryu: Shouryu; deadline: string; daysLeft: number; start: string; work: string;
};
const base = Object.fromEntries(CASES.map((c) => [c.no, c]));
const P = (no: string) => ({ no, name: base[no]?.name ?? no, place: base[no]?.place ?? '' });

export const STOCK: StockCase[] = [
  { ...P('C-1047'), station: '品川', priceMin: 40, priceMax: 44, skills: ['CCNA', 'LPIC-1'], shouryu: '元請けから', deadline: '10/24', daysLeft: 1, start: '11/1', work: 'サーバー監視・一次対応。9:00-18:00 シフトなし。未経験OK・研修あり' },
  { ...P('C-1053'), station: '新宿', priceMin: 43, priceMax: 47, skills: ['CCNA'], shouryu: 'エンド直', deadline: '10/27', daysLeft: 4, start: '12/1', work: 'ネットワーク運用・設定変更の手順書どおりの作業' },
  { ...P('C-1042'), station: '浦安', priceMin: 36, priceMax: 39, skills: ['ITパスポート', 'MOS'], shouryu: '二次請けから', deadline: '10/25', daysLeft: 2, start: '11/16', work: '社内ヘルプデスク・PCのセットアップ' },
  { ...P('C-1051'), station: '大宮', priceMin: 33, priceMax: 36, skills: ['基本情報技術者', 'ITパスポート'], shouryu: '元請けから', deadline: '10/30', daysLeft: 7, start: '12/1', work: 'キッティング・資産管理。駅から徒歩5分・残業ほぼなし' },
  { ...P('C-1058'), station: '川崎', priceMin: 34, priceMax: 37, skills: ['ITパスポート'], shouryu: '二次請けから', deadline: '10/28', daysLeft: 5, start: '11/16', work: 'PC入れ替え・店舗向けPOSレジの交換作業' },
  { no: 'C-1060', name: '横浜 IT窓口', place: '横浜', station: '横浜', priceMin: 33, priceMax: 35, skills: ['MOS'], shouryu: '元請けから', deadline: '10/29', daysLeft: 6, start: '12/1', work: 'コールセンターのIT窓口（一次切り分け）' },
  { no: 'C-1062', name: '渋谷 グッズショップ', place: '渋谷', station: '渋谷', priceMin: 30, priceMax: 32, skills: [], shouryu: '二次請けから', deadline: '10/26', daysLeft: 3, start: '11/1', work: 'グッズショップ運営（レジ・品出し・在庫）' },
  { no: 'C-1065', name: '新宿 SNS運用', place: '新宿', station: '新宿', priceMin: 35, priceMax: 38, skills: [], shouryu: '二次請けから', deadline: '10/25', daysLeft: 2, start: '11/1', work: 'SNSアカウントの運用。商材：アダルトコンテンツ' },
];

/** 送ってはいけない理由（無ければ null）。警告ではなく止める。 */
export function ngReason(c: StockCase): string | null {
  const t = `${c.name} ${c.work}`;
  if (/アダルト|成人向け/.test(t)) return 'アダルト案件のため、要員には送れません';
  if (/店舗運営|ショップ運営|ショップ|店舗スタッフ/.test(t) && !/POS|店舗向け/.test(t)) return '店舗運営系の案件のため、要員には送れません（IT の仕事ではない）';
  return null;
}

/** 案件と要員の合いそう度（0〜100）と、その理由 */
export function matchOf(c: StockCase, p: Taiki) {
  const why: string[] = [];
  let s = 30;
  const hit = c.skills.filter((k) => p.skills.includes(k));
  if (hit.length) { s += 25; why.push(`${hit.join('・')} が合う`); }
  const m = commuteMin(p.station, c.station) ?? 90;
  s += m <= 45 ? 30 : m <= 60 ? 15 : 0;
  why.push(`通勤 約${m}分`);
  if (c.priceMax >= p.price) { s += 15; why.push('希望単価の内'); } else why.push(`希望 ${p.price}万に届かない`);
  return { score: Math.min(99, s), why, min: m };
}
