// 連絡パネルの見本データ（ログインしていないとき）。本物の名前ではない。形は lib/live/renraku.ts の本物と同じにしてある
import type { Bubble } from './person';
import type { CaseHaishin, ChatRow, PartnerListRes, PollDetailRes, PollRow, Recipient, StationRes } from './renraku';

const U = (n: number) => 'U' + String(n).padStart(32, '0');

export const SAMPLE_CHAT: { info: ChatRow[]; aoi: ChatRow[]; aoiGroups: ChatRow[] } = {
  info: [
    { id: 'i1', kind: 'one', name: '応募者 佐々木', last: '面談の日程、来週水曜で大丈夫です', at: '9:41', atMs: 9, ball: true, waitMs: 2, unread: 1, seg: 'other', reason: '' },
    { id: 'i2', kind: 'one', name: '入社予定 加藤', last: '基本情報フォーム送りました', at: '8:12', atMs: 8, ball: true, waitMs: 1, unread: 1, seg: 'other', reason: '' },
    { id: 'i3', kind: 'one', name: '応募者 松本', last: 'ありがとうございます！', at: '昨日', atMs: 7, ball: false, waitMs: 0, unread: 0, seg: 'other', reason: '' },
  ],
  aoi: [
    { id: 'a1', kind: 'one', name: '伊藤 誠', last: '案件の件、興味あります！', at: '10:05', atMs: 10, ball: true, waitMs: 3, unread: 1, seg: 'sales', reason: '' },
    { id: 'a2', kind: 'one', name: '鈴木 一郎', last: '面談の時間、ずらせますか？', at: '9:58', atMs: 9.5, ball: true, waitMs: 1, unread: 2, seg: 'sales', reason: '' },
    { id: 'a3', kind: 'one', name: '中村 優', last: '承知しました。よろしくお願いします', at: '9:12', atMs: 9, ball: false, waitMs: 0, unread: 0, seg: 'sales', reason: '' },
    { id: 'a4', kind: 'one', name: '山田 太郎', last: '交通費の申請しました', at: '9:30', atMs: 9.3, ball: true, waitMs: 2, unread: 1, seg: 'joined', reason: '' },
    { id: 'a5', kind: 'one', name: '高橋 健', last: '今日の退勤押し忘れました', at: '8:40', atMs: 8.4, ball: false, waitMs: 0, unread: 0, seg: 'joined', reason: '' },
    { id: 'a6', kind: 'one', name: 'たろう', sub: 'LINE：たろう', last: 'はじめまして', at: '昨日', atMs: 5, ball: true, waitMs: 0.5, unread: 1, seg: 'other', reason: '未紐付け' },
  ],
  aoiGroups: [
    { id: 'g1', kind: 'group', name: '伊藤 誠／案件連絡', last: '伊藤：資料ありがとうございます', at: '10:02', atMs: 10, ball: true, waitMs: 2, unread: 1, seg: 'sales', reason: '' },
    { id: 'g2', kind: 'group', name: '山田 太郎／C社 常駐', last: '明日の入館は8:45集合です', at: '昨日', atMs: 6, ball: false, waitMs: 0, unread: 0, seg: 'joined', reason: '' },
    { id: 'g3', kind: 'group', name: '未経験 案件出し（旧）', last: '', at: '', atMs: 0, ball: false, waitMs: 0, unread: 0, seg: 'other', reason: '氏名不明' },
  ],
};

export const SAMPLE_THREAD: Record<string, Bubble[]> = {
  a1: [
    { key: '1', out: true, who: 'あおい', text: 'お疲れ様です！\n下記の案件について、ご意向を確認させてください。\n――――――――――\n【ヘルプデスク】品川／11月〜', at: '10/25 09:30' },
    { key: '2', out: false, who: '', text: '案件の件、興味あります！', at: '10/25 10:05' },
  ],
};
export const sampleBubbles = (id: string, name: string): Bubble[] => SAMPLE_THREAD[id] ?? [{ key: 's', out: false, who: '', text: `（${name} さんとの見本のトークです）`, at: '' }];

export const SAMPLE_CASES: CaseHaishin[] = [
  { caseNo: 'P261024-101500', title: 'ヘルプデスク（品川・11月〜）', requester: '営業 青木', requestedAt: '10/24 10:15', how: '手動配信', waiting: [], sentAt: '10/24 10:32', sentMs: 3,
    targets: [{ name: '伊藤 誠', decision: 'OK', at: '10/24 10:32' }, { name: '鈴木 一郎', decision: '未判断', at: '10/24 10:32' }, { name: '中村 優', decision: 'NG', at: '10/24 10:32' }], ok: 1, ng: 1, other: 0, undecided: 1 },
  { caseNo: 'P261023-153000', title: 'キッティング（川崎・短期）', requester: '営業 小林', requestedAt: '10/23 15:30', how: '自動配信', waiting: [], sentAt: '10/23 15:31', sentMs: 2,
    targets: [{ name: '加藤 葵', decision: 'その他', at: '10/23 15:31' }, { name: '高田 翼', decision: 'OK', at: '10/23 15:31' }], ok: 1, ng: 0, other: 1, undecided: 0 },
  { caseNo: 'P261025-090000', title: 'コールセンター SV補佐（新宿）', requester: '営業 青木', requestedAt: '10/25 09:00', how: '手動配信', waiting: ['渡辺 光', '森 翔'], sentAt: '', sentMs: 4,
    targets: [], ok: 0, ng: 0, other: 0, undecided: 0 },
];

export const SAMPLE_PARTNER: PartnerListRes = {
  ok: true,
  kadouMonths: [{ ym: 202610, label: '2026年10月' }, { ym: 202611, label: '2026年11月' }, { ym: 202612, label: '2026年12月' }],
  kadouGrace: { cur: 202610, next: 202611 },
  commute: { 伊藤誠: { any: true, blocks: [] }, 鈴木一郎: { any: false, blocks: ['b01'] }, 中村優: { any: false, blocks: ['b02'] }, 高田翼: { any: false, blocks: ['b01', 'b02'] } },
  people: [
    { id: 'p1', name: '伊藤 誠', key: '伊藤誠', eki: '大井町', kadou: '11月', kibou: 'ヘルプデスク', tags: ['シフト可'], summary: 'IT パスポート取得。接客3年' },
    { id: 'p2', name: '鈴木 一郎', key: '鈴木一郎', eki: '五反田', kadou: '即日', kibou: 'インフラ', tags: ['夜勤可', 'シフト可'], summary: 'CCNA 勉強中' },
    { id: 'p3', name: '中村 優', key: '中村優', eki: '川口', kadou: '12月', kibou: 'ヘルプデスク', tags: [], summary: '事務2年' },
    { id: 'p4', name: '加藤 葵', key: '加藤葵', eki: '溝の口', kadou: '未定', kibou: 'キッティング', tags: ['出張可'], summary: '倉庫作業1年' },
    { id: 'p5', name: '高田 翼', key: '高田翼', eki: '蒲田', kadou: '11月', kibou: 'コールセンター', tags: ['シフト可', '夜勤可'], summary: 'コールセンター2年' },
  ],
};
/** 案件文に「品川」「シフト」が入っていれば、今の API が返すのと同じ形の答えを作る（見本） */
export function sampleStation(q: string): StationRes {
  const shift = /シフト/.test(q), yakin = /夜勤/.test(q);
  const needs = { shift, yakin, shucchou: /出張/.test(q) };
  const limits = { startYms: /11月/.test(q) ? [202611] : null, headcount: /1名/.test(q) ? 1 : null, cap: /1名/.test(q) ? 3 : null, tanka: null };
  const m = /([^\s、,・()（）：:]{1,6})駅/.exec(q);
  if (!m) return { ok: true, needs, limits, resolved: false, reason: 'no_station', hint: '案件文から駅名を見つけられませんでした。駅を手で入れてください' };
  return { ok: true, needs, limits, resolved: true, station: m[1], muni: '（見本）', blockId: 'b01', blockName: '城南',
    fare: { limit: 40000, station: m[1], byId: { p3: { state: 'over', yen: 45200, src: 'calc' } } } };
}

export const SAMPLE_RECIPIENTS: Recipient[] = [
  { name: '伊藤 誠', userId: U(1), eki: '大井町', kadou: '11月', tantou: '青木' },
  { name: '鈴木 一郎', userId: U(2), eki: '五反田', kadou: '即日', tantou: '小林' },
  { name: '中村 優', userId: U(3), eki: '川口', kadou: '12月', tantou: '青木' },
  { name: '高田 翼', userId: U(5), eki: '蒲田', kadou: '11月', tantou: '小林' },
  { name: '渡辺 光', userId: U(6), eki: '赤羽', kadou: '即日', tantou: '青木' },
];
export const SAMPLE_JOINED: Recipient[] = [
  { name: '山田 太郎', userId: U(11), eki: '品川', kadou: '', tantou: '青木' },
  { name: '高橋 健', userId: U(12), eki: '川崎', kadou: '', tantou: '小林' },
  { name: '加藤 葵', userId: U(13), eki: '溝の口', kadou: '', tantou: '青木' },
];

export const SAMPLE_POLLS: PollRow[] = [
  { id: '00000000-0000-4000-8000-000000000001', title: 'オンライン勉強会のご案内', message: '11/2（土）と11/9（土）に勉強会をします。参加できる回を返信してください。',
    choices: [{ key: '1', label: '11/2（土）', ng: false }, { key: '2', label: '11/9（土）', ng: false }, { key: '3', label: '参加しない', ng: true }],
    audience: 'sales', createdBy: '', createdAt: '2026-10-20T01:00:00Z', sentAt: '2026-10-20T01:00:00Z', closedAt: '',
    summary: { total: 5, delivered: 5, answered: 3, ng: 1, unanswered: 2, cardSent: 5, byKey: { 1: 1, 2: 1, 3: 1 } }, replied: 4 },
  { id: '00000000-0000-4000-8000-000000000002', title: '11月のシフト提出のお願い', message: '11月のシフトを今週中に提出してください。',
    choices: [], audience: 'joined', createdBy: '', createdAt: '2026-10-22T00:00:00Z', sentAt: '2026-10-22T00:00:00Z', closedAt: '',
    summary: { total: 3, delivered: 3, answered: 0, ng: 0, unanswered: 3, cardSent: 0, byKey: {} }, replied: 2 },
];
export const samplePollDetail = (id: string): PollDetailRes => {
  const poll = SAMPLE_POLLS.find((p) => p.id === id) ?? SAMPLE_POLLS[0];
  const people = poll.audience === 'joined' ? SAMPLE_JOINED : SAMPLE_RECIPIENTS;
  const keys = poll.choices.length ? ['1', '2', '3', null, null] : [null, null, null];
  return {
    ok: true, poll, summary: poll.summary,
    targets: people.map((p, i) => ({ line_user_id: p.userId, name: p.name, delivered: true, card_sent_at: poll.choices.length ? poll.sentAt : null,
      answer_key: keys[i] ?? null, answer_via: keys[i] ? (i === 0 ? 'button' : 'auto') : null, answered_at: keys[i] ? poll.sentAt : null })),
    replies: { [people[1].userId]: [{ text: poll.choices.length ? '9日でお願いします' : '了解です、今週出します', at: '2026-10-22T03:00:00Z' }],
      [people[2].userId]: [{ text: '承知しました', at: '2026-10-22T04:00:00Z' }] },
  };
};
