// 申請の承認・当日の出勤状況の見本データ（本物の名前・数字ではない）。
//   今のシステムの「当日の出勤状況」（freee 打刻＋シフト＋勤怠連絡＋出発コール）と、
//   打刻修正・残業・有給・欠勤の申請を、ver2 の型（上から順に片づける）に載せ替えたもの。

export const NOW = { date: '10/23（金）', time: '9:40' };

// ---- 申請 ----
export type ReqKind = '打刻修正' | '残業' | '有給' | '欠勤' | '遅刻・早退';
export type Check = { tone: 'ok' | 'warn' | 'bad'; text: string };
export type Req = {
  id: string; kind: ReqKind; personId: string; person: string; site: string;
  day: string; detail: string; reason: string; filedAt: string;
  facts: [string, string][];   // 判断に要る事実（freee の打刻・シフト・勤務表など）
  checks: Check[];             // 先に確かめた結果（AI＋決まり）。bad があると「要注意」
};

export const REQUESTS: Req[] = [
  {
    id: 'r1', kind: '残業', personId: 's0388', person: '伊藤 誠', site: 'C社（新宿）', day: '10/22（木）', detail: '18:00〜21:30（3.5h）', reason: '障害対応', filedAt: '10/22 21:40',
    facts: [['freee の打刻', '9:02 出勤 → 21:34 退勤'], ['今月の残業', '35h（この申請を入れると 38.5h）'], ['締め日の見込み', '48h → 承認すると 52h']],
    checks: [{ tone: 'bad', text: '承認すると締め日の見込みが 52h。月45h を超える（今年5回目）' }, { tone: 'ok', text: '打刻と申請の時間が合っている' }],
  },
  {
    id: 'r2', kind: '打刻修正', personId: 's0302', person: '鈴木 一郎', site: 'D社（大手町）', day: '10/21（水）', detail: '退勤の打刻漏れ → 18:05', reason: '打ち忘れ', filedAt: '10/22 9:15',
    facts: [['freee の打刻', '8:58 出勤 → 退勤なし'], ['シフト', '9:00〜18:00'], ['勤務表（現場）', '9:00〜18:00 と記入']],
    checks: [{ tone: 'ok', text: '現場の勤務表と時間が合っている' }, { tone: 'ok', text: '今月の打刻漏れは1回目' }],
  },
  {
    id: 'r3', kind: '有給', personId: 's0412', person: '山田 太郎', site: 'A社（品川）', day: '11/14（金）', detail: '全日', reason: '私用', filedAt: '10/23 8:30',
    facts: [['残りの有給', '7日（取った日数 3日／年5日の義務）'], ['現場への連絡', '担当営業が現場に確認済み']],
    checks: [{ tone: 'ok', text: '年5日の義務が4日目になる' }, { tone: 'ok', text: '同じ日に同じ現場で休む人はいない' }],
  },
  {
    id: 'r4', kind: '打刻修正', personId: 's0410', person: '渡辺 涼', site: 'F社（横浜）', day: '10/20（月）', detail: '出勤の打刻 9:30 → 9:00', reason: '打刻の機械が動かなかった', filedAt: '10/21 18:02',
    facts: [['freee の打刻', '9:30 出勤 → 18:01 退勤'], ['シフト', '9:00〜18:00'], ['勤務表（現場）', '9:00〜18:00 と記入']],
    checks: [{ tone: 'warn', text: '今月3回目の「出勤を早める」修正' }, { tone: 'ok', text: '現場の勤務表と時間が合っている' }],
  },
  {
    id: 'r5', kind: '欠勤', personId: 's0461', person: '佐藤 光', site: 'H社（渋谷）', day: '10/23（金）', detail: '全日', reason: '体調不良', filedAt: '10/23 7:10',
    facts: [['今月の欠勤', '2回目'], ['勤怠連絡', '7:10 本人から LINE で連絡'], ['現場への連絡', 'まだ']],
    checks: [{ tone: 'bad', text: '現場への連絡がまだ（担当営業に知らせる）' }, { tone: 'warn', text: '今月2回目の欠勤（離職リスクの材料になる）' }],
  },
  {
    id: 'r6', kind: '残業', personId: 's0412', person: '山田 太郎', site: 'A社（品川）', day: '10/22（木）', detail: '18:00〜19:00（1h）', reason: 'リリース作業', filedAt: '10/22 19:20',
    facts: [['freee の打刻', '9:00 出勤 → 19:03 退勤'], ['今月の残業', '12h'], ['締め日の見込み', '17h']],
    checks: [{ tone: 'ok', text: '打刻と申請の時間が合っている' }, { tone: 'ok', text: '36協定の上限まで余裕がある' }],
  },
  {
    id: 'r7', kind: '遅刻・早退', personId: 's0399', person: '高橋 健', site: 'G社（品川）', day: '10/24（土）', detail: '15:00 早退', reason: '通院', filedAt: '10/23 9:01',
    facts: [['シフト', '10:00〜19:00（土曜出勤）'], ['現場への連絡', '本人が現場リーダーに連絡済み']],
    checks: [{ tone: 'ok', text: '現場に連絡済み' }],
  },
];

export const REJECT_REASONS = ['時間が打刻・勤務表と合わない', '現場の確認が取れていない', '申請の日付が違う', '理由を詳しく書き直してほしい', '同じ日の申請が二重'];

// ---- 当日の出勤状況 ----
export type Today = '出勤済み' | '未打刻' | '遅刻の連絡' | '欠勤の連絡' | '休み' | '出発コール未着';
export type TodayRow = {
  personId: string; person: string; site: string; sales: string;
  shift: string; state: Today; punch?: string; contact?: string; late?: number; memo?: string;
};
export const TODAY_ROWS: TodayRow[] = [
  { personId: 's0410', person: '渡辺 涼', site: 'F社（横浜）', sales: '小林', shift: '9:00〜18:00', state: '未打刻', late: 40, memo: '先週も 1 回あり（本人は打ち忘れ）' },
  { personId: 's0470', person: '林 さくら', site: 'J社（池袋）', sales: '田中', shift: '9:00〜18:00', state: '未打刻', late: 40 },
  { personId: 's0480', person: '森 拓海', site: 'K社（品川）', sales: '小林', shift: '9:30〜18:30', state: '未打刻', late: 10 },
  { personId: 's0399', person: '高橋 健', site: 'G社（品川）', sales: '田中', shift: '10:00〜19:00', state: '出発コール未着', memo: '出発コールは 9:00 まで' },
  { personId: 's0461', person: '佐藤 光', site: 'H社（渋谷）', sales: '田中', shift: '9:00〜18:00', state: '欠勤の連絡', contact: '7:10 体調不良（LINE）' },
  { personId: 's0302', person: '鈴木 一郎', site: 'D社（大手町）', sales: '小林', shift: '9:00〜18:00', state: '遅刻の連絡', contact: '8:40 電車遅延・10時着' },
  { personId: 's0412', person: '山田 太郎', site: 'A社（品川）', sales: '小林', shift: '9:00〜18:00', state: '出勤済み', punch: '8:52' },
  { personId: 's0388', person: '伊藤 誠', site: 'C社（新宿）', sales: '小林', shift: '9:00〜18:00', state: '出勤済み', punch: '8:57' },
  { personId: 's0455', person: '加藤 葵', site: 'E社（川崎）', sales: '田中', shift: '—', state: '休み', contact: 'シフト休（提出済みシフトの空欄）' },
];
// 全体の数（見本）。上の一覧は「対応が要る人」＋数人だけ
export const TODAY_TOTAL = { planned: 214, done: 203 };
