// 見本データ（本物の名前・数字ではない）。実データにつなぐまでの仮置き。
import type { ModuleKey } from './theme';

export type Status = '稼働中' | '待機' | '入場予定' | '休職・産休' | '退社';

export type Person = {
  id: string;
  name: string;
  kana: string;
  no: string;
  joined: string;
  status: Status;
  site: string;
  contract: '準委任' | '派遣' | '—';
  station: string;
  price: string;
  sales: string;
  recruiter: string;
  kintai: { text: string; tone: 'ok' | 'warn' | 'bad' | 'mute' };
  reserve?: string;
  contractEnd?: string;
};

export const PEOPLE: Person[] = [
  { id: 's0412', name: '山田 太郎', kana: 'ヤマダ タロウ', no: 'S-0412', joined: '2025/04/01', status: '稼働中', site: 'A社（品川）', contract: '準委任', station: '川口', price: '45万', sales: '小林', recruiter: '中村', kintai: { text: '問題なし', tone: 'ok' }, reserve: '10/26〜 B社（予約）' },
  { id: 's0388', name: '伊藤 誠', kana: 'イトウ マコト', no: 'S-0388', joined: '2024/10/01', status: '稼働中', site: 'C社（新宿）', contract: '派遣', station: '赤羽', price: '42万', sales: '小林', recruiter: '田中', kintai: { text: '残業48h 見込み', tone: 'bad' }, contractEnd: '11/30 終了' },
  { id: 's0441', name: '中村 優', kana: 'ナカムラ ユウ', no: 'S-0441', joined: '2025/07/01', status: '待機', site: '—', contract: '—', station: '蕨', price: '—', sales: '田中', recruiter: '中村', kintai: { text: '対象外', tone: 'mute' } },
  { id: 's0302', name: '鈴木 一郎', kana: 'スズキ イチロウ', no: 'S-0302', joined: '2023/04/01', status: '稼働中', site: 'D社（大手町）', contract: '準委任', station: '大宮', price: '45万', sales: '小林', recruiter: '中村', kintai: { text: '打刻漏れ 1日', tone: 'warn' }, reserve: '11月度〜 48万' },
  { id: 's0455', name: '加藤 葵', kana: 'カトウ アオイ', no: 'S-0455', joined: '2025/10/01', status: '入場予定', site: 'E社（川崎）', contract: '派遣', station: '武蔵小杉', price: '38万', sales: '田中', recruiter: '田中', kintai: { text: '入場前', tone: 'mute' }, reserve: '11/1 入場' },
  { id: 's0399', name: '高橋 健', kana: 'タカハシ ケン', no: 'S-0399', joined: '2024/11/01', status: '稼働中', site: 'G社（品川）', contract: '派遣', station: '川崎', price: '40万', sales: '田中', recruiter: '中村', kintai: { text: '問題なし', tone: 'ok' }, reserve: '11/1〜 産休（予約）' },
  { id: 's0410', name: '渡辺 涼', kana: 'ワタナベ リョウ', no: 'S-0410', joined: '2025/03/01', status: '稼働中', site: 'F社（横浜）', contract: '派遣', station: '横浜', price: '41万', sales: '小林', recruiter: '田中', kintai: { text: '問題なし', tone: 'ok' }, contractEnd: '11/30 終了' },
];

export const STATUS_COUNTS: { label: Status | 'すべて'; n: number }[] = [
  { label: 'すべて', n: 339 }, { label: '稼働中', n: 251 }, { label: '入場予定', n: 14 }, { label: '待機', n: 26 }, { label: '休職・産休', n: 5 }, { label: '退社', n: 87 },
];

export type Todo = { module: ModuleKey; text: string; n: string; tone: 'bad' | 'warn' | 'plain'; href: string };
export const TODOS: Todo[] = [
  { module: 'roumu', text: '打刻漏れ（未修正）', n: '12件', tone: 'bad', href: '/roumu/today' },
  { module: 'roumu', text: '残業が締め日に45hを超える見込み', n: '1人', tone: 'bad', href: '/roumu/overtime' },
  { module: 'eigyo', text: '派遣契約が30日以内に終わる（意向未確認）', n: '2人', tone: 'warn', href: '/eigyo/contracts' },
  { module: 'jinji', text: '離職リスクが上がった人', n: '3人', tone: 'warn', href: '/jinji/rishoku' },
  { module: 'keiri', text: '勤務表が届いていない現場', n: '6件', tone: 'warn', href: '/roumu/timesheet' },
];
export const APPROVALS: Todo[] = [
  { module: 'keiri', text: '交通費・経費の申請', n: '9件', tone: 'plain', href: '/keiri/keihi' },
  { module: 'roumu', text: '打刻修正・有給・残業', n: '8件', tone: 'plain', href: '/roumu/approval' },
  { module: 'jinji', text: '引っ越し・通勤の変更（本人申請）', n: '2件', tone: 'plain', href: '/jinji/yoyaku' },
  { module: 'jinji', text: '入社情報（提出済み）', n: '3件', tone: 'plain', href: '/jinji/nyusha' },
];

export type Reservation = { date: string; person: string; module: ModuleKey; field: string; from: string; to: string; with: string };
export const RESERVATIONS: Reservation[] = [
  { date: '10/26（月）', person: '山田 太郎', module: 'eigyo', field: '現場', from: 'A社（品川）', to: 'B社（大崎）', with: '通勤・定期／勤務表の様式／請求の単価' },
  { date: '10/28（水）', person: '佐藤 花子', module: 'jinji', field: '住所', from: '赤羽', to: '蕨', with: '通勤・定期（本人申請→承認済み）' },
  { date: '11/1（日）', person: '高橋 健', module: 'jinji', field: '状態', from: '稼働中', to: '産休', with: '勤怠の対象から外す／社保の手続き' },
];

export type SiteHistory = { period: string; site: string; terms: string; hours?: string; hoursSub?: string; bill?: string; billSub?: string; billTone?: 'ok' | 'warn'; state: '予約' | '稼働中' | '待機' | '終了' };
export const SITE_HISTORY: SiteHistory[] = [
  { period: '2026/10/26 〜', site: 'B社（大崎）', terms: '準委任・45万', state: '予約' },
  { period: '2026/02/01 〜 10/25', site: 'A社（品川）', terms: '準委任・45万', hours: '1,412h', hoursSub: '平均 157h/月', bill: '[請求額]', billSub: '勤務表と一致 9/9', billTone: 'ok', state: '稼働中' },
  { period: '2026/01/14 〜 01/31', site: '待機 18日', terms: '—', state: '待機' },
  { period: '2025/06/01 〜 2026/01/13', site: 'C社（新宿）', terms: '派遣・40万', hours: '1,180h', bill: '[請求額]', billSub: '差額あり 1/8', billTone: 'warn', state: '終了' },
  { period: '2025/04/01 〜 05/31', site: '研修（自社）', terms: '—', hours: '320h', state: '終了' },
];

export type TimelineItem = { module: ModuleKey; when: string; text: string; sub?: string; future?: boolean };
export const TIMELINE: TimelineItem[] = [
  { module: 'eigyo', when: '10/26 予約', text: '現場が B社 に', sub: '営業 小林が 10/20 登録', future: true },
  { module: 'roumu', when: '10/21 9:12', text: '打刻漏れ → 本人が修正申請' },
  { module: 'keiri', when: '10/05', text: '9月分を請求（勤務表 162h と一致）' },
  { module: 'jinji', when: '06/15', text: '住所 赤羽→川口（本人申請→承認）' },
  { module: 'eigyo', when: '02/01', text: 'A社に入場（待機18日のあと）' },
];
