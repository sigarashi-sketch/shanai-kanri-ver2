// 案件・要員マップの見本。地図ライブラリは使わず、駅を 0〜100 の格子に置いた簡易マップ。
//   通勤時間は格子の距離から出す「目安」（本物は駅すぱあと・辞書 fare_dict を先に引く想定）。
export type Station = { name: string; x: number; y: number; line: string };
export const STATIONS: Station[] = [
  { name: '大宮', x: 36, y: 6, line: '埼京・京浜東北' },
  { name: '浦和', x: 42, y: 15, line: '京浜東北' },
  { name: '蕨', x: 40, y: 21, line: '京浜東北' },
  { name: '川口', x: 44, y: 26, line: '京浜東北' },
  { name: '赤羽', x: 40, y: 31, line: '埼京・京浜東北' },
  { name: '池袋', x: 30, y: 41, line: '山手' },
  { name: '新宿', x: 26, y: 52, line: '山手' },
  { name: '大手町', x: 50, y: 50, line: '丸ノ内' },
  { name: '渋谷', x: 26, y: 62, line: '山手' },
  { name: '品川', x: 44, y: 68, line: '山手・京浜東北' },
  { name: '浦安', x: 74, y: 55, line: '東西' },
  { name: '武蔵小杉', x: 28, y: 78, line: '南武・東横' },
  { name: '川崎', x: 44, y: 82, line: '京浜東北' },
  { name: '横浜', x: 32, y: 95, line: '京浜東北・東横' },
];
export const stationOf = (n: string) => STATIONS.find((s) => s.name === n);

/** 2駅の通勤時間の目安（分）。同じ駅は 5分。 */
export function commuteMin(a: string, b: string): number | null {
  const s = stationOf(a), t = stationOf(b);
  if (!s || !t) return null;
  if (s === t) return 5;
  return Math.round(Math.hypot(s.x - t.x, s.y - t.y) * 0.75 + 8);
}
export const commuteTone = (m: number) => (m <= 45 ? 'ok' : m <= 60 ? 'warn' : 'bad');
export const commuteLabel = (m: number) => (m <= 45 ? '通える' : m <= 60 ? 'ぎりぎり' : '遠い');
