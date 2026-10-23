// 案件・要員マップ：今の社内システムの2つの口 → この画面の形。
//   ・案件マップ … /api/cases-map?action=list（今の cases-map.html と同じ。行に駅の座標 lat/lng が入っている）
//     ※今の list は読む前に「充足予約の期限切れを倒す」「案件受注を写す」を自分でやる（今の画面を開いたときと同じ動き）
//   ・要員マップ … /api/proxy?action=getMapData（今の map.html と同じ。営業中の人の最寄駅と、Slack の案件の現場の駅に座標つき）
//   ・地図は見本の簡易な地図（SVG）のまま。座標が地図の枠の外の駅は地図に出さず、一覧にだけ出す
import { BOX, CATS, kmBetween, lastMile, type Cat, type Job, type SlackCase, type Station, type Youin } from '../map-sample';
import { blockReason } from './eigyo-common';

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
