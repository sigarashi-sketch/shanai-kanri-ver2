// 保留（/horyu）の画面の見本データ（ログインしていないときに出す）。名前・会社・数字はすべて作りもの
// ---------------- 稼働表出力（今の /api/kadohyo?action=roster の形） ----------------
export type KadoRow = {
  name: string; normName: string; shozoku: string; joukyou: string; rep: string; start?: string; end?: string;
  source: 'freee' | 'freee_ambiguous' | 'csv_required'; employeeId: string; companyId: string; empNum?: string;
  candidates?: { employee_id: string; company_id: string; name: string; num: string }[];
  taisha?: boolean; taishaBi?: string; joi: string; kinmuRoute: string; kinmuDeadline: string; kinmuSoufu?: string;
  kinmuKind: 'genba' | 'freee' | 'none'; kinmuReason?: string; fare?: { rows: number; total: number };
};
export type KadoRoster = { ok: boolean; ym: string; freee_configured?: boolean; rows: KadoRow[]; error?: unknown };
export type DayRow = { date: string; weekday: string; clockIn: string; clockOut: string; breakMins: number; note: string; worked: boolean };
export type FareRow = { date: string; carrier: string; from: string; to: string; fare: number; note?: string };

const k = (name: string, o: Partial<KadoRow>): KadoRow => ({
  name, normName: name.replace(/\s/g, ''), shozoku: 'ミカタ', joukyou: '稼働中', rep: '小林', source: 'freee', employeeId: '1001', companyId: '2001',
  joi: '株式会社サンプル商事', kinmuRoute: '本人→弊社', kinmuDeadline: '翌月3営業日', kinmuKind: 'freee', fare: { rows: 0, total: 0 }, ...o,
});
export const KADO_ROSTER: KadoRow[] = [
  k('中村 優', { fare: { rows: 20, total: 18400 } }),
  k('佐々木 蓮', { shozoku: 'ファースト', employeeId: '1002' }),
  k('松本 結衣', { source: 'csv_required', employeeId: '', companyId: '', shozoku: '協力会社A' }),
  k('井上 翔', { source: 'freee_ambiguous', employeeId: '', companyId: '', candidates: [{ employee_id: '1010', company_id: '2001', name: '井上 翔', num: '0123' }, { employee_id: '1011', company_id: '2002', name: '井上 翔', num: '0456' }] }),
  k('森 拓海', { joi: 'KMS Partners（見本）', kinmuKind: 'genba', kinmuReason: '現場フォーマット', employeeId: '1003' }),
  k('渡辺 涼', { joukyou: '終了', taisha: true, taishaBi: '2026-09-30', employeeId: '1004' }),
  k('井上 さくら', { shozoku: 'スキラボ', employeeId: '1005', fare: { rows: 4, total: 6200 } }),
];
export const sampleDays = (ym: string): DayRow[] => {
  const [y, m] = ym.split('-').map(Number), last = new Date(y, m, 0).getDate(), out: DayRow[] = [];
  for (let d = 1; d <= last; d++) {
    const dt = new Date(y, m - 1, d), wd = dt.getDay(), worked = wd !== 0 && wd !== 6;
    out.push({ date: `${ym}-${String(d).padStart(2, '0')}`, weekday: '日月火水木金土'[wd], clockIn: worked ? '09:00' : '', clockOut: worked ? '18:00' : '', breakMins: worked ? 60 : 0, note: '', worked });
  }
  return out;
};
export const SAMPLE_FARES: FareRow[] = [{ date: '', carrier: '電車', from: '蕨(往復)', to: '品川', fare: 920 }];

// ---------------- 現場稼動表（今の /api/genba-kadohyo の形） ----------------
export type GenbaFile = { filename: string; mimeType: string; subject: string; sender: string; direction: string; receivedAt: string | null; url: string };
export type GenbaItem = { name: string; normalizedName: string; tantou: string; shozoku: string; kadouChu: boolean; jitai: boolean; lastAt: string | null; files: GenbaFile[] };
export type GenbaData = { ok: boolean; ym: string; months: string[]; items: GenbaItem[]; missing: { name: string; tantou: string; shozoku: string }[]; error?: string };
export const GENBA: GenbaData = {
  ok: true, ym: '2026-09', months: ['2026-10', '2026-09', '2026-08'],
  items: [
    { name: '中村 優', normalizedName: '中村優', tantou: '小林', shozoku: 'ミカタ', kadouChu: true, jitai: false, lastAt: '2026-10-02T10:12:00+09:00',
      files: [{ filename: '勤務表_9月.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', subject: '9月分 勤務表', sender: '現場の担当者', direction: 'in', receivedAt: '2026-10-02T10:12:00+09:00', url: '#' }] },
    { name: '森 拓海', normalizedName: '森拓海', tantou: '田中', shozoku: 'ミカタ', kadouChu: true, jitai: false, lastAt: '2026-10-01T18:40:00+09:00',
      files: [{ filename: '稼動報告書.pdf', mimeType: 'application/pdf', subject: '稼動報告（9月）', sender: '現場の担当者', direction: 'in', receivedAt: '2026-10-01T18:40:00+09:00', url: '#' }] },
  ],
  missing: [{ name: '井上 さくら', tantou: '三枝', shozoku: 'スキラボ' }],
};

// ---------------- 客先向けリンク（今の /api/client-view?action=links の形） ----------------
export type Mention = { uid: string; name: string };
export type LinkEvent = { link_id?: string; kind: 'request' | 'decline'; target_name: string; reason?: string; case_no?: string; source?: string; created_at: string };
export type ClientLink = {
  id: string; label: string; note: string; created_by: string; created_at: string; expires_at: string | null; revoked_at: string | null;
  last_seen_at: string | null; view_count: number; mention?: Mention[]; token: string; counts: { request: number; decline: number }; events: LinkEvent[];
};
export const CLIENT_LINKS: ClientLink[] = [
  { id: 'l1', label: '株式会社サンプル（見本）', note: '首都圏の案件で使う', created_by: 'eigyo@example.com', created_at: '2026-10-01T10:00:00+09:00', expires_at: null, revoked_at: null,
    last_seen_at: '2026-10-24T15:20:00+09:00', view_count: 12, mention: [{ uid: 'U' + '0'.repeat(32), name: '営業 小林' }], token: 'SAMPLEsampleSAMPLEsampleSAMPLE00', counts: { request: 2, decline: 1 },
    events: [
      { kind: 'request', target_name: '中村 優', case_no: 'P261020-101010', source: 'match', created_at: '2026-10-20T11:00:00+09:00' },
      { kind: 'request', target_name: '佐々木 蓮', source: 'catalog', created_at: '2026-10-18T09:30:00+09:00' },
      { kind: 'decline', target_name: '松本 結衣', reason: '通勤', source: 'match', created_at: '2026-10-18T09:20:00+09:00' },
    ] },
  { id: 'l2', label: '見本テック株式会社', note: '', created_by: 'eigyo@example.com', created_at: '2026-09-12T10:00:00+09:00', expires_at: null, revoked_at: '2026-10-10T10:00:00+09:00',
    last_seen_at: '2026-10-05T10:00:00+09:00', view_count: 3, token: '', counts: { request: 0, decline: 0 }, events: [] },
];
export const MENTION_CANDIDATES: Mention[] = [{ uid: 'U' + '0'.repeat(32), name: '営業 小林' }, { uid: 'U' + '1'.repeat(32), name: '営業 田中' }];

// ---------------- 客先向けの画面（今の /api/client-view?action=list の形。名前は出ない） ----------------
export type ClientPerson = {
  ref: string; no: string; initial: string; age: string; gender: string; kadou: string; kibou: string; jobs: { job: string; years: string }[];
  shikaku: string; tools: string; tokui: string; tags: string[]; eki: string; summary: string; pdf: string;
  fit?: { ok: boolean | null; text: string }[]; mustAll?: boolean;
};
export type MatchRead = { station: string; stationUnresolved?: boolean; stationTried?: string; start: string; needs?: { shift?: boolean; yakin?: boolean; shucchou?: boolean }; must: string[]; want: string[] };
export type HistoryGroup = { at: string; kind: string; source: string; caseNo: string; caseTitle: string; reason: string; people: { ref: string; no: string; initial: string; listed: boolean }[] };
export type ClientList = { ok: boolean; client: string; expiresAt: string | null; people: ClientPerson[]; mine: Record<string, string>; kadouMonths: { ym: number; label: string }[]; declineReasons: string[]; coords?: Record<string, [number, number]> };
const cp = (no: string, initial: string, o: Partial<ClientPerson>): ClientPerson => ({
  ref: 'r' + no, no, initial, age: '20代後半', gender: '', kadou: '即日', kibou: 'ヘルプデスク', jobs: [], shikaku: '', tools: '', tokui: '', tags: [], eki: '', summary: '', pdf: '', ...o,
});
export const CLIENT_LIST: ClientList = {
  ok: true, client: '株式会社サンプル（見本）', expiresAt: null, mine: { r002: 'request' },
  kadouMonths: [{ ym: 202610, label: '10月' }, { ym: 202611, label: '11月' }, { ym: 202612, label: '12月' }, { ym: 202701, label: '1月' }], declineReasons: ['経験・スキルが合わない', '通勤', '稼働時期', 'その他'],
  people: [
    cp('001', 'Y.N.', { gender: '男性', kibou: 'インフラ', shikaku: 'CCNA / LPIC-1', tools: 'Excel', tokui: '手順どおりの作業', jobs: [{ job: '飲食店 店長', years: '4年' }], eki: '蕨', tags: ['資格あり', '即日OK'], summary: 'シフト管理と発注を任されていました。CCNA を取って IT の現場をめざしています。' }),
    cp('002', 'R.S.', { age: '20代前半', gender: '男性', kibou: '開発', shikaku: '基本情報', tools: 'Java（学習中）', jobs: [{ job: '物流倉庫', years: '2年' }], eki: '大宮', kadou: '11月' }),
    cp('003', 'Y.M.', { age: '30代前半', gender: '女性', kibou: 'テスト', shikaku: 'MOS', jobs: [{ job: 'コールセンター', years: '3年' }], eki: '赤羽', tags: ['シフト可'] }),
    cp('004', 'S.I.', { gender: '女性', kibou: '事務', shikaku: '日商簿記2級', jobs: [{ job: '施工管理の事務', years: '2年' }], eki: '横浜', kadou: '12月' }),
  ],
};

// ---------------- 案件受注（今の /api/kaitaku-cases?action=list の形） ----------------
export type JuchuCase = {
  id: string; company_name: string; company_pref?: string; company_area?: string; company_phone?: string; owner_name?: string; headline: string;
  station?: string; duties?: string; work_hours?: string; break_time?: string; work_days?: string; holidays?: string; start_text?: string; tanka?: string; notes?: string;
  case_text?: string; stock_case_no?: string | null; archived?: boolean; received_at: string; pushed_by?: string;
};
export const JUCHU: JuchuCase[] = [
  { id: 'c1', company_name: '見本物流株式会社', company_pref: '神奈川県', company_area: '厚木', owner_name: '博田', headline: '倉庫の在庫管理（PC入力あり）', station: '本厚木駅', duties: '・入出庫の入力\n・在庫の照合', work_hours: '8:30-17:30', break_time: '60分', work_days: '週5', holidays: '土日', start_text: '11月〜', tanka: '30万', notes: '車通勤可',
    case_text: '【案件】倉庫の在庫管理\n最寄駅：本厚木駅\n…', stock_case_no: null, archived: false, received_at: '2026-10-24T10:00:00+09:00', pushed_by: 'eigyo@example.com' },
  { id: 'c2', company_name: 'サンプル電機', company_pref: '神奈川県', company_area: '海老名', owner_name: '博田', headline: 'ヘルプデスク（工場内）', station: '海老名駅', duties: '・社員の PC 問い合わせ', work_hours: '9:00-18:00', start_text: '12月〜', tanka: '33万',
    case_text: '【案件】ヘルプデスク\n…', stock_case_no: 'P261020-090000', archived: false, received_at: '2026-10-20T09:00:00+09:00', pushed_by: 'eigyo@example.com' },
];
