// 経理・保留（keiri / horyu）の画面で使う型（10-26 見本データの -sample.ts から型だけ移した。中身は今の API の形のまま）。
export type Check = { tone: 'ok' | 'warn' | 'bad'; text: string };

// ---------------- 交通費・経費（今の /api/keihi?action=adminList の形を画面用に直したもの） ----------------
export type ClaimKind = '通勤（日ごと）' | '定期' | 'バス' | '出張・面談';
export type Claim = {
  id: string; personId: string; person: string; site: string; kind: ClaimKind; month: string;
  amount: number; detail: string; source: 'ICカードから' | '手入力'; filedAt: string; checks: Check[];
  /** 明細（本物だけ・10-26 shoya「中身見れないの」） */
  lines?: ClaimLine[];
};
export type ClaimLine = { id: string; date: string; kind: string; what: string; amount: number; src: string; note: string; receiptUrl?: string | null };
/** 差し戻す理由（選ぶだけ・本人の LINE に届く） */
export const KEIHI_REJECT = ['出勤の打刻が無い日が入っている', '運賃が経路と合わない', '領収書が読めない・無い', '定期の期間が書かれていない', '現場が変わる（経路を直してほしい）'];

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

// ---------------- 現場稼動表（今の /api/genba-kadohyo の形） ----------------
export type GenbaFile = { filename: string; mimeType: string; subject: string; sender: string; direction: string; receivedAt: string | null; url: string };
export type GenbaItem = { name: string; normalizedName: string; tantou: string; shozoku: string; kadouChu: boolean; jitai: boolean; lastAt: string | null; files: GenbaFile[] };
export type GenbaData = { ok: boolean; ym: string; months: string[]; items: GenbaItem[]; missing: { name: string; tantou: string; shozoku: string }[]; error?: string };

// ---------------- 客先向けリンク（今の /api/client-view?action=links の形） ----------------
export type Mention = { uid: string; name: string };
export type LinkEvent = { link_id?: string; kind: 'request' | 'decline'; target_name: string; reason?: string; case_no?: string; source?: string; created_at: string };
export type ClientLink = {
  id: string; label: string; note: string; created_by: string; created_at: string; expires_at: string | null; revoked_at: string | null;
  last_seen_at: string | null; view_count: number; mention?: Mention[]; token: string; counts: { request: number; decline: number }; events: LinkEvent[];
};

// ---------------- 客先向けの画面（今の /api/client-view?action=list の形。名前は出ない） ----------------
export type ClientPerson = {
  ref: string; no: string; initial: string; age: string; gender: string; kadou: string; kibou: string; jobs: { job: string; years: string }[];
  shikaku: string; tools: string; tokui: string; tags: string[]; eki: string; summary: string; pdf: string;
  fit?: { ok: boolean | null; text: string }[]; mustAll?: boolean;
};
export type MatchRead = { station: string; stationUnresolved?: boolean; stationTried?: string; start: string; needs?: { shift?: boolean; yakin?: boolean; shucchou?: boolean }; must: string[]; want: string[] };
export type HistoryGroup = { at: string; kind: string; source: string; caseNo: string; caseTitle: string; reason: string; people: { ref: string; no: string; initial: string; listed: boolean }[] };
export type ClientList = { ok: boolean; client: string; expiresAt: string | null; people: ClientPerson[]; mine: Record<string, string>; kadouMonths: { ym: number; label: string }[]; declineReasons: string[]; coords?: Record<string, [number, number]> };

// ---------------- 案件受注（今の /api/kaitaku-cases?action=list の形） ----------------
export type JuchuCase = {
  id: string; company_name: string; company_pref?: string; company_area?: string; company_phone?: string; owner_name?: string; headline: string;
  station?: string; duties?: string; work_hours?: string; break_time?: string; work_days?: string; holidays?: string; start_text?: string; tanka?: string; notes?: string;
  case_text?: string; stock_case_no?: string | null; archived?: boolean; received_at: string; pushed_by?: string;
};
