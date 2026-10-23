// コミュニティ（人事管理）の見本データ。本物の名前ではない。
//   社員は1人1つのコミュニティに入る（リーダー1人・サブリーダーは任意で1人）。勉強会・イベントはコミュニティ単位か全体で開く。
//   コミュニティの面談（吉村さんの空き時間から本人が予約）は今のシステムにあり、ここでは件数だけ出す。
export type Community = { id: string; name: string; leader: string; sub?: string; members: number };
export const COMMUNITIES: Community[] = [
  { id: 'c1', name: 'インフラ部', leader: '伊藤 誠', sub: '山田 太郎', members: 9 },
  { id: 'c2', name: '開発もくもく会', leader: '渡辺 涼', members: 6 },
  { id: 'c3', name: '資格チャレンジ', leader: '鈴木 一郎', sub: '高橋 健', members: 11 },
];

export type Attendee = { id: string; name: string; state: '参加' | '未定' | '不参加' };
export type CEvent = { id: string; date: string; time: string; title: string; kind: '勉強会' | 'イベント'; host: string; place: string; cap: number; attendees: Attendee[] };
export const EVENTS: CEvent[] = [
  { id: 'e1', date: '2026-10-25', time: '19:00', title: 'CCNA 模試を一緒に解く会', kind: '勉強会', host: '資格チャレンジ', place: 'オンライン', cap: 15, attendees: [
    { id: 's0302', name: '鈴木 一郎', state: '参加' }, { id: 's0441', name: '中村 優', state: '参加' }, { id: 's0470', name: '佐々木 蓮', state: '未定' }] },
  { id: 'e2', date: '2026-10-29', time: '19:30', title: 'Linux コマンド 30分ドリル', kind: '勉強会', host: 'インフラ部', place: 'オンライン', cap: 20, attendees: [
    { id: 's0388', name: '伊藤 誠', state: '参加' }, { id: 's0412', name: '山田 太郎', state: '参加' }, { id: 's0472', name: '松本 結衣', state: '未定' }, { id: 's0455', name: '加藤 葵', state: '参加' }] },
  { id: 'e3', date: '2026-11-07', time: '18:30', title: '秋の交流会（入社1年未満の人むけ）', kind: 'イベント', host: '全体', place: '本社 会議室', cap: 30, attendees: [
    { id: 's0410', name: '渡辺 涼', state: '参加' }, { id: 's0470', name: '佐々木 蓮', state: '不参加' }] },
];

export const TARGETS = ['このコミュニティの全員', '社員みんな', '入社3か月以内の人', '待機中の人'] as const;
export const MENDAN_THIS_WEEK = 4;
