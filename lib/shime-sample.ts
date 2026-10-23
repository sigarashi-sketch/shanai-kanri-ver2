// 勤怠の締めの見本データ（本物の名前・数字ではない）。
//   今のシステムの「勤怠の締め」（勤務表×freee 打刻を人×月で突合・1日30分未満のずれは丸めの内）を ver2 の型に載せ替えたもの。
//   ★freee の「月度」は暦の月と1か月ずれる（10/1〜10/31 は freee では「11月度」）。画面は暦の月で出し、freee の呼び名を横に添える。
export const SHIME_MONTH = { label: '10月', period: '10/1〜10/31', freeeLabel: 'freee の「11月度」', closeOn: '11/5' };
export const OT_LINE = 45; // 残業見込みがこれを超える人は、理由を選んでから締める

export type SheetState = '届いた' | '未着' | '読めない';
export type ShimeRow = {
  personId: string; name: string; site: string; sales: string;
  missingPunch: number;     // 打刻漏れの日数
  pendingReq: number;       // 未承認の申請
  otProjection: number;     // 締め日の残業見込み（時間）
  sheet: SheetState;        // 現場の勤務表
  diffNote?: string;        // 勤務表と freee の差（30分未満/日は合っている扱い）
};
export const SHIME_ROWS: ShimeRow[] = [
  { personId: 's0388', name: '伊藤 誠', site: 'C社（新宿）', sales: '小林', missingPunch: 0, pendingReq: 1, otProjection: 48, sheet: '届いた', diffNote: 'freee のほうが毎日30分前後長い（休憩の扱い？）' },
  { personId: 's0302', name: '鈴木 一郎', site: 'D社（大手町）', sales: '小林', missingPunch: 1, pendingReq: 1, otProjection: 14, sheet: '未着' },
  { personId: 's0410', name: '渡辺 涼', site: 'F社（横浜）', sales: '小林', missingPunch: 2, pendingReq: 1, otProjection: 9, sheet: '読めない' },
  { personId: 's0461', name: '佐藤 光', site: 'H社（渋谷）', sales: '田中', missingPunch: 0, pendingReq: 1, otProjection: 6, sheet: '届いた' },
  { personId: 's0412', name: '山田 太郎', site: 'A社（品川）', sales: '小林', missingPunch: 0, pendingReq: 2, otProjection: 17, sheet: '届いた' },
  { personId: 's0399', name: '高橋 健', site: 'G社（品川）', sales: '田中', missingPunch: 0, pendingReq: 1, otProjection: 11, sheet: '未着' },
  { personId: 's0480', name: '森 拓海', site: 'K社（品川）', sales: '小林', missingPunch: 1, pendingReq: 0, otProjection: 22, sheet: '届いた' },
  { personId: 's0472', name: '松本 結衣', site: 'L社（赤羽）', sales: '小林', missingPunch: 0, pendingReq: 0, otProjection: 4, sheet: '届いた' },
];
export const OT_REASONS = ['特別条項の範囲で確認した', '現場と残業を減らす調整をした', '今月だけの臨時の対応'];
export const UNREADABLE_FIX = ['手で時間を確かめた（勤務表どおり）', '手で時間を確かめた（freee どおり）'];
