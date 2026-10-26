// 保留の要員マップの簡易な地図の土台（駅の位置・東京湾・路線の線）。人や案件のデータは入っていない（10-26 map-sample から移した）
export type Station = { name: string; lat: number; lng: number };
export const STATIONS: Station[] = [
  { name: '大宮', lat: 35.9064, lng: 139.6239 }, { name: '浦和', lat: 35.8587, lng: 139.6571 },
  { name: '蕨', lat: 35.8279, lng: 139.6904 }, { name: '川口', lat: 35.8017, lng: 139.7173 },
  { name: '赤羽', lat: 35.7779, lng: 139.7209 }, { name: '池袋', lat: 35.7295, lng: 139.7109 },
  { name: '新宿', lat: 35.6896, lng: 139.7006 }, { name: '大手町', lat: 35.6862, lng: 139.7663 },
  { name: '渋谷', lat: 35.658, lng: 139.7016 }, { name: '大崎', lat: 35.6197, lng: 139.7286 },
  { name: '品川', lat: 35.6285, lng: 139.7387 }, { name: '浦安', lat: 35.6537, lng: 139.9017 },
  { name: '船橋', lat: 35.7019, lng: 139.9855 }, { name: '武蔵小杉', lat: 35.5762, lng: 139.6597 },
  { name: '川崎', lat: 35.5313, lng: 139.697 }, { name: '横浜', lat: 35.4657, lng: 139.6223 },
  { name: '町田', lat: 35.542, lng: 139.4467 }, { name: 'さがみ野', lat: 35.4757, lng: 139.428 },
];
export const stationOf = (n: string) => STATIONS.find((s) => s.name === n.replace(/駅$/, ''));

// ---- 簡易な地図（緯度経度 → SVG の位置。等距円筒＋緯度補正）----
export const BOX = { n: 35.95, s: 35.4, w: 139.36, e: 140.0 };
const K = 1000, COS = Math.cos((35.7 * Math.PI) / 180);
export const MAP_W = Math.round((BOX.e - BOX.w) * COS * K), MAP_H = Math.round((BOX.n - BOX.s) * K);
export const xy = (lat: number, lng: number) => ({ x: (lng - BOX.w) * COS * K, y: (BOX.n - lat) * K });
/** 東京湾（ざっくり）。[緯度, 経度] */
export const BAY: [number, number][] = [[35.4, 139.64], [35.45, 139.645], [35.5, 139.69], [35.53, 139.75], [35.58, 139.77], [35.62, 139.78], [35.64, 139.8], [35.65, 139.84], [35.64, 139.88], [35.66, 139.92], [35.68, 139.96], [35.69, 140.0], [35.4, 140.0]];
/** 背景にうすく引く路線（駅の並びだけ） */
export const RAILS: string[][] = [
  ['大宮', '浦和', '蕨', '川口', '赤羽', '大手町', '品川', '川崎', '横浜'],
  ['赤羽', '池袋', '新宿', '渋谷', '大崎', '品川'],
  ['渋谷', '武蔵小杉', '横浜'], ['大手町', '浦安', '船橋'], ['町田', '横浜'], ['さがみ野', '横浜'], ['新宿', '町田'],
];

