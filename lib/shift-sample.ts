// シフト表の見本データ（本物の名前・数字ではない）。
//   今のシステムのシフト提出（本人がカレンダーで1日ずつ入れる・下書きと提出を分ける）を ver2 の型に載せ替えたもの。
//   ★提出済みの月で空欄の日は「休み」とみなす（本人は空欄＝休みのつもりで出している）。未提出の月の空欄は「まだ入っていない」。
//   20日を過ぎたら翌月のシフトを集める（今日は 10/23 なので 11月）。
export const SHIFT_MONTH = { label: '11月', year: 2026, month: 11, days: 30, firstDow: 0 /* 11/1 は日曜 */, deadline: '10/25（日）' };
export type ShiftKind = '早番' | '日勤' | '遅番' | '夜勤' | '出勤' | '休み' | ''; // 出勤＝本物のとき（今のシステムは 出勤（時間つき）／休み の2つだけ）
export const SHIFT_KINDS: { k: ShiftKind; short: string; time: string; tone: string }[] = [
  { k: '早番', short: '早', time: '7:00〜16:00', tone: 'info' },
  { k: '日勤', short: '日', time: '9:00〜18:00', tone: 'ok' },
  { k: '遅番', short: '遅', time: '13:00〜22:00', tone: 'caution' },
  { k: '夜勤', short: '夜', time: '20:00〜翌5:00', tone: 'purple' },
  { k: '出勤', short: '出', time: '', tone: 'ok' },
  { k: '休み', short: '休', time: '', tone: 'mute' },
  { k: '', short: '', time: '', tone: 'mute' },
];
export type ShiftState = '提出済み' | '下書き' | '未提出';
export type ShiftPerson = { personId: string; name: string; site: string; state: ShiftState; days: ShiftKind[] };

// 曜日でだいたいの型を作る（見本）
const make = (pat: ShiftKind[], fill: number) => Array.from({ length: 30 }, (_, i) => (i < fill ? pat[i % pat.length] : '')) as ShiftKind[];
export const SHIFT_PEOPLE: ShiftPerson[] = [
  { personId: 's0388', name: '伊藤 誠', site: 'C社（新宿）・監視', state: '提出済み', days: make(['夜勤', '夜勤', '', '', '夜勤', '夜勤', '夜勤'], 30) },
  { personId: 's0399', name: '高橋 健', site: 'G社（品川）・ヘルプデスク', state: '提出済み', days: make(['', '日勤', '日勤', '日勤', '日勤', '日勤', '早番'], 30) },
  { personId: 's0480', name: '森 拓海', site: 'K社（品川）・監視', state: '下書き', days: make(['早番', '早番', '遅番', '遅番', '休み', '休み', '日勤'], 12) },
  { personId: 's0461', name: '佐藤 光', site: 'H社（渋谷）・コールセンター', state: '未提出', days: make([''], 0) },
  { personId: 's0441', name: '中村 優', site: 'M社（蕨）・監視（11/4 入場）', state: '未提出', days: make([''], 0) },
];
