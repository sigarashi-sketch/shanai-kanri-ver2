// 人事の「今のシステムに無かったもの」（/api/live/jinji → 今の /api/jinji-v2・表は legacy sql/0376）の型と変換（10-26）。
import type { Field, Yoyaku } from '@/lib/types/jinji';

export const JINJI_URL = '/api/live/jinji';
export const jinjiRead = (what: string) => `${JINJI_URL}?what=${what}`;

export type JinjiMe = { ok: boolean; role: string; canWrite: boolean; approve: { 単価: boolean; 通勤: boolean }; sankyu: boolean };

// ---- 変更の予約 ----
export type JYoyakuRow = {
  id: string; personId: string; name: string; normalizedName: string; field: Field; from: string; to: string; date: string;
  state: '承認待ち' | '予約中' | '適用済み' | '取り消し'; rawState: string; note: string; linkedTo: string; by: string; approvedBy: string;
  appliedAt: string | null; applyResult: string;
};
export type JYoyaku = { ok: boolean; today: string; rows: JYoyakuRow[] };
/** 画面の Yoyaku の形へ。id は v2:<uuid>（待機・退社の予約 taiki:/taisha:・転籍 t: と分ける） */
export function yoyakuFromJinji(j: JYoyaku | null): Yoyaku[] {
  return (j?.rows || []).filter((r) => r.state !== '取り消し').map((r) => ({
    id: `v2:${r.id}`, date: r.date, personId: r.personId, person: r.name, field: r.field, from: r.from || '—', to: r.to, by: r.by || '—', state: r.state,
    note: [r.note, r.state === '適用済み' && r.applyResult ? `名簿：${r.applyResult}` : ''].filter(Boolean).join('・') || undefined,
  }));
}
export const v2Id = (id: string) => (id.startsWith('v2:') ? id.slice(3) : '');

// ---- 面談（フォロー面談・離職リスク） ----
export type JMendan = { id: string; kind: 'follow' | 'rishoku'; person_id: string; normalized_name: string; name: string; by_name: string; at_text: string; state: '日程調整中' | '予定あり' | '済み'; reschedules: number; memo: string; words: string[]; updated_at: string; done_at: string | null };
export type JMendanList = { ok: boolean; rows: JMendan[] };

// ---- 資格手当の段 ----
export type JShikakuStage = { application_id: string; checked_by: string; checked_at: string | null; reflected_month: string; reflected_by: string; reflected_at: string | null };

// ---- 産休・育休 ----
export type JSankyu = { id: string; person_id: string; normalized_name: string; name: string; kind: '本人の出産' | '配偶者の出産'; due: string; multi: boolean; extend: '1y' | '18m' | '2y'; done: Record<string, boolean>; updated_at: string };

// ---- コミュニティ ----
export type JEvent = { id: string; date: string; time: string; title: string; kind: '勉強会' | 'イベント'; host: string; place: string; cap: number; called_target: string };
export type JRsvp = { event_id: string; normalized_name: string; name: string; state: '参加' | '未定' | '不参加' };
export type JCommunity = { ok: boolean; events: JEvent[]; rsvps: JRsvp[]; mendanWeek: number | null };

// ---- 参画決定者の手続き ----
export type JJimuLane = { normalized_name: string; name: string; lane: '営業' | '人事' | '労務' | '完了'; updated_by: string; updated_at: string };

// ---- ホーム人事のまとめ読み ----
export type JFeedRaw = { id: string; type: 'teiki' | 'memo' | 'reassign' | 'line'; at: string; name: string; text: string; sub: string };

// ---- 離職リスクの材料 ----
export type JRishokuPerson = { absent: number; taikiSince: string | null; overtime: (number | null)[] | null; words: string[]; lastMendan: string | null; firstStart: string | null };
export type JRishoku = { ok: boolean; months: string[]; today: string; ym: string; people: Record<string, JRishokuPerson>; warnings: string[] };

// ---- 現場の履歴 ----
export type JHistMonth = { ym: string; site: string; contract: string; note: string; start: string; end: string; sheets: number | null; sheetLast: string; billed: string; amount: number | null };
export type JHistory = { ok: boolean; months: JHistMonth[]; timeline: { at: string; kind: string; text: string }[]; money: boolean };

/** POST で読む（名前を URL に出さない） */
export async function jinjiPostRead<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const r = await fetch(JINJI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }), cache: 'no-store' });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; ok?: boolean };
  if (!r.ok || j.ok === false) throw new Error(j.error || `読めませんでした（${r.status}）`);
  return j;
}
