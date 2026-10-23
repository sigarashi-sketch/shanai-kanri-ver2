// 勤務表の届き具合の見本データ（本物の名前・数字ではない）。
//   今のシステムの「勤務表の届き具合」（取引先から届く現場の勤務表×稼働の契約）と「勤務表のまとめ読み」（毎晩読んで日ごとの時間を残す）
//   を ver2 の型に載せ替えたもの。届いた勤務表の時間と freee の打刻を比べ、1日30分未満のずれは丸めの内として数えない。
//   ★取引先の「送付不要」は「こちらから上位に送らなくてよい」の意味で、届かない理由にはしない。
export const TS_MONTH = { label: '10月分', due: '11/3' };
export type TsState = '届いた' | '未着' | '読めない';
export type Route = '上位から' | '所属会社から' | '本人から' | '流れが未設定' | '提出不要'; // 後ろ2つは本物のとき
export type TsRow = {
  id: string; partner: string; personId: string; name: string; site: string; route: Route;
  state: TsState; arrivedAt?: string; unreadable?: string;
  sheetH?: number; freeeH?: number; offDays?: number; // 30分以上ずれた日
};
export const TS_ROWS: TsRow[] = [
  { id: 't1', partner: 'ネクスト技研', personId: 's0388', name: '伊藤 誠', site: 'C社（新宿）', route: '上位から', state: '届いた', arrivedAt: '10/22', sheetH: 168.0, freeeH: 176.5, offDays: 17 },
  { id: 't2', partner: 'ネクスト技研', personId: 's0410', name: '渡辺 涼', site: 'F社（横浜）', route: '上位から', state: '読めない', arrivedAt: '10/21', unreadable: '手書きの写真で、時間の欄が読み取れない' },
  { id: 't3', partner: 'ネクスト技研', personId: 's0480', name: '森 拓海', site: 'K社（品川）', route: '上位から', state: '届いた', arrivedAt: '10/22', sheetH: 152.0, freeeH: 152.4, offDays: 0 },
  { id: 't4', partner: 'ブルーライン', personId: 's0302', name: '鈴木 一郎', site: 'D社（大手町）', route: '所属会社から', state: '未着' },
  { id: 't5', partner: 'ブルーライン', personId: 's0412', name: '山田 太郎', site: 'A社（品川）', route: '所属会社から', state: '届いた', arrivedAt: '10/20', sheetH: 160.0, freeeH: 161.0, offDays: 1 },
  { id: 't6', partner: 'サクラシステム', personId: 's0399', name: '高橋 健', site: 'G社（品川）', route: '本人から', state: '未着' },
  { id: 't7', partner: 'サクラシステム', personId: 's0461', name: '佐藤 光', site: 'H社（渋谷）', route: '本人から', state: '届いた', arrivedAt: '10/23', sheetH: 128.0, freeeH: 136.0, offDays: 2 },
  { id: 't8', partner: 'サクラシステム', personId: 's0472', name: '松本 結衣', site: 'L社（赤羽）', route: '本人から', state: '未着' },
];
export const READ_FIX = ['手で時間を確かめた（勤務表どおり）', '取引先に読める形で出し直しをお願いした'];
