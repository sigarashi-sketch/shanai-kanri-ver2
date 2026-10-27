// 案件・要員マップ：今の社内システムの2つの口 → この画面の形。
//   ・案件マップ … /api/cases-map?action=list（今の cases-map.html と同じ。行に駅の座標 lat/lng が入っている）
//     ※今の list は読む前に「充足予約の期限切れを倒す」「案件受注を写す」を自分でやる（今の画面を開いたときと同じ動き）
//   ・要員マップ … /api/proxy?action=getMapData（今の map.html と同じ。営業中の人の最寄駅と、Slack の案件の現場の駅に座標つき）
//   ・地図は Google マップの地図タイル（日本語・鍵なし・10-27 shoya「Googleの地図にして」）を背景に敷き、その上にピンを重ねる。座標が地図の枠の外の駅は地図に出さず、一覧にだけ出す
//     タイルは枠（BOX）の決まった範囲を全部読むだけ（人や案件の場所は外へ送らない）
import { blockReason } from './eigyo-common';

// ---- 形（画面の行） ----
export type Station = { name: string; lat: number; lng: number };
export const CATS = ['事務', '軽作業', 'コールセンター', '製造', 'IT・SE', '営業', '販売', '生産管理', 'その他'] as const;
export type Cat = (typeof CATS)[number];
/** 職種の色（今の画面は職種ごとに色分け。ver2 は役割の色の名前に当てる） */
export const CAT_TONE: Record<Cat, string> = { 事務: 'info', 軽作業: 'caution', コールセンター: 'purple', 製造: 'bad', 'IT・SE': 'ok', 営業: 'warn', 販売: 'warn', 生産管理: 'purple', その他: 'mute' };
export const MODES = [{ v: '公共交通機関', l: '電車・バス' }, { v: '自動車', l: '自動車' }, { v: 'バイク', l: 'バイク' }, { v: '自転車', l: '自転車' }, { v: '徒歩', l: '徒歩' }] as const;
export const SRC_LABEL = { sheet: 'スプシ', ike: '社内ツール', juchu: '受注' } as const;
export type Src = keyof typeof SRC_LABEL;
export type Job = {
  id: string; case_no: number; title: string; company?: string; category: Cat; owner: string; source: Src;
  pay?: string; start?: string; hours?: string; holiday?: string; require?: string;
  station?: string; access?: string; area?: string; modes: string[]; summary: string;
  reserve?: string; reserveNote?: string;             // 充足予約（この日に充足扱い）
  status: 'open' | 'filled' | 'closed'; doneOn?: string; doneNote?: string;
};
/** 要員＝営業中の人（最寄駅は営業用リストの最寄駅） */
export type Youin = { id: string; name: string; station?: string; tags: string[]; summary: string; career: string; dates: string[]; memo?: string };
/** Slack に流れた案件（K番号・現場は複数ありうる） */
export type SlackCase = { kNo: string; date: string; stations: string[]; remote?: boolean; content: string };

/** 出発駅の候補（主な駅の座標。本物の行の駅はこれに足して選べる） */
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

// ---- 地図（緯度経度 → 位置。地図タイルと同じメルカトル図法）----
export const BOX = { n: 35.95, s: 35.4, w: 139.36, e: 140.0 };
const Z = 11, WORLD = 256 * 2 ** Z, COS = Math.cos((35.7 * Math.PI) / 180);
const mx = (lng: number) => ((lng + 180) / 360) * WORLD;
const my = (lat: number) => { const s = Math.sin((lat * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WORLD; };
const SC = (COS * 1000) / (WORLD / 360);   // 地図の単位（ピンの大きさ・字の大きさを今のままにする倍率）
const X0 = mx(BOX.w), Y0 = my(BOX.n), X1 = mx(BOX.e), Y1 = my(BOX.s);
export const MAP_W = Math.round((X1 - X0) * SC), MAP_H = Math.round((Y1 - Y0) * SC);
export const xy = (lat: number, lng: number) => ({ x: (mx(lng) - X0) * SC, y: (my(lat) - Y0) * SC });
/** 背景の地図タイル（Google マップ・日本語・高解像度 scale=2）。位置は地図の枠に対する％。サーバは mt0〜3 に振り分ける */
export const TILES = (() => {
  const out: { src: string; left: number; top: number; w: number; h: number }[] = [];
  for (let tx = Math.floor(X0 / 256); tx <= Math.floor(X1 / 256); tx++)
    for (let ty = Math.floor(Y0 / 256); ty <= Math.floor(Y1 / 256); ty++)
      out.push({ src: `https://mt${(tx + ty) % 4}.google.com/vt/lyrs=m&hl=ja&gl=JP&scale=2&x=${tx}&y=${ty}&z=${Z}`, left: ((tx * 256 - X0) / (X1 - X0)) * 100, top: ((ty * 256 - Y0) / (Y1 - Y0)) * 100, w: (256 / (X1 - X0)) * 100, h: (256 / (Y1 - Y0)) * 100 });
  return out;
})();

// ---- 通勤時間の目安（今の cases-map と同じ式）----
export function kmBetween(a: Station, b: Station) {
  const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
/** 駅から先の分（アクセス欄の「徒歩N分」「バスN分」。バスは待ち5分を足す。書いてなければ徒歩8分） */
export function lastMile(access = '') {
  let m = 0, hit = false;
  for (const x of access.matchAll(/徒歩\s*約?\s*(\d{1,2})\s*分/g)) { m += +x[1]; hit = true; }
  for (const x of access.matchAll(/バス\s*約?\s*(\d{1,2})\s*分/g)) { m += +x[1] + 5; hit = true; }
  if (!hit && /バス/.test(access)) { m += 20; hit = true; }
  return hit ? m : 8;
}

export type CaseMapRow = {
  id: string; case_no: number; source: 'ike' | 'sheet' | 'juchu'; owner_name: string; company: string; title: string; category: string;
  station: string; access: string; area: string; lat: number | null; lng: number | null; summary: string; pay: string; hours: string; holiday: string;
  start_text: string; require_text: string; commute_modes: string[]; status: 'open' | 'filled' | 'closed';
  reserve_date: string | null; reserve_note: string; filled_at: string | null; filled_note: string;
};
export type CasesMapList = { ok: boolean; rows: CaseMapRow[]; today: string; can_edit: boolean; error?: string };

export type MapData = {
  engineers: { name: string; station: string; lat: number; lng: number }[];
  cases: { kNo: string; ts: string; content: string; date: string; stations: { name: string; lat: number; lng: number }[]; remote: boolean }[];
  counts?: { total: number; excluded: number; target: number; withStation: number; withoutStation: number; mapped: number; pendingPeople: number };
  noStationNames?: string[]; unknown?: string[]; pending?: number;
};

const inBox = (lat?: number | null, lng?: number | null) => lat != null && lng != null && lat <= BOX.n && lat >= BOX.s && lng >= BOX.w && lng <= BOX.e;
const st = (s: string) => s.replace(/駅$/, '').trim();

export type Positions = Map<string, Station>;
/** 出発駅 → 案件の駅 の目安（今の cases-map と同じ式）。座標は本物の行のもの */
export function estimateAt(a?: Station, b?: Station, access?: string) {
  if (!a || !b) return null;
  const km = kmBetween(a, b), ride = km < 1.2 ? 0 : ((km * 1.2) / 40) * 60 + 6;
  return { km, min: Math.max(5, Math.round((ride + lastMile(access)) / 5) * 5) };
}

export function liveJobs(d: CasesMapList | null): { jobs: Job[]; pos: Positions; owners: string[] } {
  const pos: Positions = new Map();
  if (!d?.rows) return { jobs: [], pos, owners: [] };
  const jobs = d.rows.map((r): Job => {
    const name = st(r.station || '');
    if (name && inBox(r.lat, r.lng)) pos.set(name, { name, lat: r.lat!, lng: r.lng! });
    return {
      id: r.id, case_no: r.case_no, title: r.title || `No.${r.case_no}`, company: r.company || undefined,
      category: (CATS as readonly string[]).includes(r.category) ? (r.category as Cat) : 'その他',
      owner: r.owner_name || '—', source: r.source, pay: r.pay || undefined, start: r.start_text || undefined, hours: r.hours || undefined,
      holiday: r.holiday || undefined, require: r.require_text || undefined, station: name || undefined, access: r.access || undefined,
      area: r.area || undefined, modes: r.commute_modes ?? [], summary: r.summary,
      reserve: r.reserve_date ?? undefined, reserveNote: r.reserve_note || undefined, status: r.status,
      doneOn: r.filled_at ? r.filled_at.slice(0, 10) : undefined, doneNote: r.filled_note || undefined,
    };
  });
  return { jobs, pos, owners: [...new Set(jobs.map((j) => j.owner))].filter((o) => o !== '—').sort() };
}

export function liveYouin(d: MapData | null): { youin: Youin[]; cases: SlackCase[]; pos: Positions; outside: number } {
  const pos: Positions = new Map();
  if (!d) return { youin: [], cases: [], pos, outside: 0 };
  let outside = 0;
  const youin: Youin[] = (d.engineers ?? []).map((e, i) => {
    const name = st(e.station || '');
    if (name && inBox(e.lat, e.lng)) pos.set(name, { name, lat: e.lat, lng: e.lng }); else if (name) outside++;
    return { id: `m${i}`, name: e.name, station: name || undefined, tags: [], summary: '', career: '', dates: [] };
  });
  for (const n of d.noStationNames ?? []) youin.push({ id: `n:${n}`, name: n, tags: [], summary: '', career: '', dates: [] });
  const cases: SlackCase[] = (d.cases ?? [])
    .filter((c) => !blockReason(c.content))   // 送れない案件（アダルト・店舗運営系）は地図に出さない
    .map((c) => {
      for (const s of c.stations ?? []) { const n = st(s.name); if (n && inBox(s.lat, s.lng)) pos.set(n, { name: n, lat: s.lat, lng: s.lng }); }
      return { kNo: c.kNo, date: c.date.slice(5, 10), stations: (c.stations ?? []).map((s) => st(s.name)), remote: c.remote, content: c.content.slice(0, 300) };
    });
  return { youin, cases, pos, outside };
}
