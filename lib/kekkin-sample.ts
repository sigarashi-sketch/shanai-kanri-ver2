// 欠勤管理の見本データ（本物の名前・本文ではない）。
//   今のシステムの「欠勤管理」（勤怠連絡の欠勤を1人1日1行・理由は選ぶだけ）と、
//   ★キーワードで欠勤と決めつけない考え方（休みの連絡・遅刻・後日の相談・無関係が混ざる）を ver2 の型に載せ替えたもの。
//   連絡の本文をそのまま並べ、欠勤かどうかは人が読んで選ぶ。前夜の「明日休みます」も拾う。
export type Kind = '欠勤' | '遅刻' | '後日の相談' | '欠勤ではない' | '未確認';
export const KINDS: Kind[] = ['未確認', '欠勤', '遅刻', '後日の相談', '欠勤ではない'];
export const REASONS = ['未分類', '体調不良', '通院', '家庭の事情', '交通機関', '寝坊', '連絡なし（無断の可能性）', 'その他'];
export type Route = 'グループLINE' | '公式LINE（1:1）' | '電話' | '連絡なし';
export type Absence = {
  id: string; personId: string; name: string; site: string; sales: string;
  month: '9月' | '10月'; day: string; at: string; route: Route; text: string;
  kind: Kind; reason: string; siteNotified: boolean;
};
const A = (id: string, p: [string, string, string, string], month: '9月' | '10月', day: string, at: string, route: Route, text: string, kind: Kind, reason: string, siteNotified: boolean): Absence =>
  ({ id, personId: p[0], name: p[1], site: p[2], sales: p[3], month, day, at, route, text, kind, reason, siteNotified });
const SATO: [string, string, string, string] = ['s0461', '佐藤 光', 'H社（渋谷）', '田中'];
const WATA: [string, string, string, string] = ['s0410', '渡辺 涼', 'F社（横浜）', '小林'];
const MORI: [string, string, string, string] = ['s0480', '森 拓海', 'K社（品川）', '小林'];
const SUZU: [string, string, string, string] = ['s0302', '鈴木 一郎', 'D社（大手町）', '小林'];
const YAMA: [string, string, string, string] = ['s0412', '山田 太郎', 'A社（品川）', '小林'];
export const ABSENCES: Absence[] = [
  A('k1', SATO, '10月', '10/23（金）', '10/23 7:10', 'グループLINE', '本日体調不良のため、お休みさせていただきたいです。', '未確認', '未分類', false),
  A('k2', SATO, '10月', '10/16（金）', '10/15 23:20', '公式LINE（1:1）', '明日お休みをいただきたいです。熱が下がりません。', '欠勤', '体調不良', true),
  A('k3', SATO, '10月', '10/9（金）', '—', '連絡なし', '（連絡なし・打刻なし。担当営業が電話でつながったのは昼すぎ）', '欠勤', '連絡なし（無断の可能性）', true),
  A('k4', WATA, '10月', '10/20（月）', '10/20 8:05', 'グループLINE', '電車が止まっていて、すぐの出勤が難しいため遅れて向かいます。', '未確認', '未分類', false),
  A('k5', WATA, '10月', '10/6（月）', '10/6 7:40', '電話', '家の用事で今日は休ませてください。', '欠勤', '家庭の事情', true),
  A('k6', MORI, '10月', '10/30（金）', '10/22 12:02', '公式LINE（1:1）', '30日に病院があるので、休むことはできますか？', '未確認', '未分類', false),
  A('k7', SUZU, '10月', '10/14（火）', '10/14 9:30', 'グループLINE', 'お休み中にすみません、勤務表を送りました。', '未確認', '未分類', false),
  A('k8', SATO, '9月', '9/25（木）', '9/25 7:00', 'グループLINE', '体調が悪く、本日お休みさせてください。', '欠勤', '体調不良', true),
  A('k9', YAMA, '9月', '9/12（金）', '9/12 7:30', '公式LINE（1:1）', '通院のため午前休みたいです。', '遅刻', '通院', true),
];
// 段階の対応（今のシステムの決まり・10/5〜数える）。④は目安で、処分は人が決める
export const STEPS = ['', '① 営業との面談', '② 来社しての面談（採用＋営業）', '③ 書面での注意・改善の計画', '④ けん責を検討（処分は人が決める）'];
