// 案件進捗の見本データ（本物の名前・案件ではない）。
//   1行＝「1つの案件を1人に送った」。送った経路を via で持つ（あおい／グループ直接／手動配信）。
//   グループ直接＝内勤があおいを通さず、要員とのLINEグループに自分で案件を書き込んだ分。
//   今のいけどんでも社員のグループ発言は contact_events に残っている（本文は 2026-08-06 以降）ので、
//   そこから「案件らしい発言」を拾って回収候補にし、内勤が✓で確定したものだけ案件進捗に載せる（10-23 shoya Q1=A）。

export type Via = 'あおい' | 'グループ直接' | '手動配信';
export type Decision = 'OK' | 'NG' | 'その他' | '未判断';   // その他＝今の📮判断の「その他」（本物のときだけ出る）

export type Case = { no: string; name: string; place: string; price: string };
export const CASES: Case[] = [
  { no: 'C-1042', name: '浦安 ヘルプデスク', place: '浦安', price: '38万' },
  { no: 'C-1047', name: '品川 サーバー監視', place: '品川', price: '42万' },
  { no: 'C-1051', name: '大宮 キッティング', place: '大宮', price: '35万' },
  { no: 'C-1053', name: '新宿 ネットワーク運用', place: '新宿', price: '45万' },
  { no: 'C-1058', name: '川崎 PC入れ替え', place: '川崎', price: '36万' },
];

export type ProgressRow = {
  id: string; caseNo: string; person: string; personId: string; group: string;
  via: Via; sentAt: string; sender: string;
  reply: string; replyAt?: string; decision: Decision; slack?: boolean;
};

export const PROGRESS: ProgressRow[] = [
  { id: 'p1', caseNo: 'C-1053', person: '中村 優', personId: 's0441', group: '中村 優 × 内勤', via: 'あおい', sentAt: '10/23 09:12', sender: 'あおい', reply: '行きたいです！', replyAt: '09:40', decision: 'OK', slack: true },
  { id: 'p2', caseNo: 'C-1042', person: '中村 優', personId: 's0441', group: '中村 優 × 内勤', via: 'あおい', sentAt: '10/23 09:12', sender: 'あおい', reply: '', decision: '未判断' },
  { id: 'p3', caseNo: 'C-1047', person: '伊藤 誠', personId: 's0388', group: '伊藤 誠 × 内勤', via: '手動配信', sentAt: '10/22 18:05', sender: '中村', reply: '品川は少し遠いです', replyAt: '19:22', decision: 'NG' },
  { id: 'p4', caseNo: 'C-1051', person: '鈴木 一郎', personId: 's0302', group: '鈴木 一郎 × 内勤', via: 'グループ直接', sentAt: '10/22 16:30', sender: '田中', reply: 'お願いします', replyAt: '16:51', decision: 'OK', slack: false },
  { id: 'p5', caseNo: 'C-1058', person: '渡辺 涼', personId: 's0410', group: '渡辺 涼 × 内勤', via: 'あおい', sentAt: '10/22 11:00', sender: 'あおい', reply: '', decision: '未判断' },
  { id: 'p6', caseNo: 'C-1042', person: '加藤 葵', personId: 's0455', group: '加藤 葵 × 内勤', via: 'あおい', sentAt: '10/21 10:20', sender: 'あおい', reply: '検討させてください', replyAt: '10/21 21:03', decision: '未判断' },
];

// グループのやりとり（前後を見る用）。who='staff' は内勤、'person' は要員、'aoi' はあおい。
export type ChatMsg = { id: string; at: string; who: 'staff' | 'person' | 'aoi'; name: string; text: string };

export type Candidate = {
  id: string; personId: string; person: string; group: string;
  msgId: string;                 // 案件らしいと拾った発言（前後の中で光らせる）
  poster: string; postedAt: string;
  match: { caseNo: string; score: number } | null; // 案件ストックの本文と照らして一番近い案件。無ければ null
  hint?: string;                 // 拾った理由（画面に小さく出す）
  thread: ChatMsg[];
};

export const CANDIDATES: Candidate[] = [
  {
    id: 'k1', personId: 's0441', person: '中村 優', group: '中村 優 × 内勤', msgId: 'm3', poster: '田中', postedAt: '10/23 13:42',
    match: { caseNo: 'C-1047', score: 92 }, hint: '場所・単価・勤務時間が案件 C-1047 とほぼ同じ',
    thread: [
      { id: 'm1', at: '10/23 13:30', who: 'person', name: '中村 優', text: '今週は面談いつでも大丈夫です' },
      { id: 'm2', at: '10/23 13:40', who: 'staff', name: '田中', text: 'ありがとうございます！1件おすすめがあるので送りますね' },
      { id: 'm3', at: '10/23 13:42', who: 'staff', name: '田中', text: '【品川／サーバー監視】\n9:00-18:00 シフトなし\n単価 42万〜\n未経験OK・研修あり\n11月〜長期' },
      { id: 'm4', at: '10/23 14:05', who: 'person', name: '中村 優', text: '品川なら通えます！興味あります' },
      { id: 'm5', at: '10/23 14:06', who: 'staff', name: '田中', text: '了解です、営業に回します！' },
    ],
  },
  {
    id: 'k2', personId: 's0302', person: '鈴木 一郎', group: '鈴木 一郎 × 内勤', msgId: 'n2', poster: '中村', postedAt: '10/23 11:15',
    match: { caseNo: 'C-1051', score: 74 }, hint: '場所と作業内容が近い（単価の書き方が違う）',
    thread: [
      { id: 'n1', at: '10/23 11:10', who: 'aoi', name: 'あおい', text: '【案件のご案内】大宮 キッティング（C-1051）' },
      { id: 'n2', at: '10/23 11:15', who: 'staff', name: '中村', text: '補足です！大宮のキッティング、駅から徒歩5分で残業ほぼなしです。12月スタートもいけます' },
      { id: 'n3', at: '10/23 11:52', who: 'person', name: '鈴木 一郎', text: '12月からなら大丈夫そうです' },
    ],
  },
  {
    id: 'k3', personId: 's0410', person: '渡辺 涼', group: '渡辺 涼 × 内勤', msgId: 'q2', poster: '田中', postedAt: '10/22 19:20',
    match: null, hint: '案件らしい書き方（場所・時間・単価）だが、案件ストックに近いものが無い',
    thread: [
      { id: 'q1', at: '10/22 19:10', who: 'person', name: '渡辺 涼', text: '横浜から近いところありますか？' },
      { id: 'q2', at: '10/22 19:20', who: 'staff', name: '田中', text: '【横浜／コールセンターのIT窓口】\n10:00-19:00\n単価 34万\n12月〜' },
      { id: 'q3', at: '10/22 19:31', who: 'person', name: '渡辺 涼', text: 'いいですね、詳しく聞きたいです' },
    ],
  },
  {
    id: 'k4', personId: 's0388', person: '伊藤 誠', group: '伊藤 誠 × 内勤', msgId: 'r2', poster: '中村', postedAt: '10/22 15:02',
    match: { caseNo: 'C-1053', score: 58 }, hint: '「新宿」「ネットワーク」が出てくるが、案件の紹介かどうか怪しい',
    thread: [
      { id: 'r1', at: '10/22 14:50', who: 'person', name: '伊藤 誠', text: '今の現場、ネットワークの勉強になってます' },
      { id: 'r2', at: '10/22 15:02', who: 'staff', name: '中村', text: 'いいですね！新宿のネットワーク運用の人たちも同じ資格取ってましたよ' },
      { id: 'r3', at: '10/22 15:10', who: 'person', name: '伊藤 誠', text: 'CCNA がんばります' },
    ],
  },
];

export const caseOf = (no: string) => CASES.find((c) => c.no === no);
