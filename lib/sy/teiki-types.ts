// 定期面談ページ（/teiki）の型と既定の設定。画面とサーバの両方から読む（lib/teiki.ts は server-only）
export interface TeikiTantou { id: string; name: string; email: string; color: string }
export interface TeikiSettings { tantou: TeikiTantou[]; keywords: string[] }
// 実施した定期面談の記録1件。tantou は書いた人のメール（分からなければ ''）
// leader＝リーダー面談（吉村さんが各コミュニティのリーダーとする面談。メモの区分 label が LEADER_LABEL のもの）
export interface TeikiRecord { id: string; key: string; name: string; at: string; label: string; body: string; tantou: string; tantouName: string; details: { k: string; v: string }[]; source: 'soreike' | 'ikeike'; leader: boolean }
// 面談メモの区分（要員の詳細で「面談」を選んだときに選ぶ）。リーダー面談は予定の件名の合言葉にもなる（設定に無くても必ず拾う）
export const LEADER_LABEL = 'リーダー面談';
export const FOLLOW_LABEL = 'フォロー面談';
export const MENDAN_LABELS = ['定期面談', FOLLOW_LABEL, LEADER_LABEL];
// 件数の表（/teiki のいちばん上）の3区分。区分なし・「面談」は定期面談に数える
export const MENDAN_KINDS = ['leader', 'follow', 'teiki'] as const;
export type MendanKind = (typeof MENDAN_KINDS)[number];
export const MENDAN_KIND_NAME: Record<MendanKind, string> = { leader: 'リーダー', follow: 'フォロー', teiki: '定期' };
export const mendanKindOf = (r: { label: string; leader: boolean }): MendanKind => (r.leader ? 'leader' : r.label.includes('フォロー') ? 'follow' : 'teiki');
// Google カレンダーの予定（いけどん /api/gcal?action=teikiEvents が返す形）
export interface TeikiEvent { id: string; cal: string; start: string; end: string; allDay: boolean; summary: string; community: boolean }

// 定期面談を担当している2人（2026-10-07 原崎 → 坂田こころ）。色・人・合言葉はページの「設定」から変えられる（saiyou.settings key='teiki'）
export const DEFAULT_TEIKI: TeikiSettings = {
  tantou: [
    { id: 'yoshimura', name: '吉村', email: 'a.yoshimura@engineer-mikata.com', color: '#0095f6' },
    { id: 'sakata', name: '坂田こころ', email: 'k.sakata@engineer-mikata.com', color: '#d62976' },
  ],
  keywords: ['定期面談'],   // 件名にこの言葉がある予定だけ出す（2026-10-01 shoya「定期面談ってついてるのだけ」）
};
export const OTHER_COLOR = '#a8a8a8';   // 担当が分からない記録

const EMAIL_RE = /^[a-z0-9._%+-]+@engineer-mikata\.com$/;
// 画面から来た設定を検める（壊れた値は捨てる）
export function cleanTeikiSettings(v: unknown): TeikiSettings {
  const o = (v || {}) as Partial<TeikiSettings>;
  const tantou = (Array.isArray(o.tantou) ? o.tantou : []).map((t, i) => ({
    id: String(t?.id || `t${i}`).slice(0, 40), name: String(t?.name || '').trim().slice(0, 20),
    email: String(t?.email || '').trim().toLowerCase(), color: /^#[0-9a-fA-F]{6}$/.test(String(t?.color || '')) ? String(t.color) : '#0095f6',
  })).filter((t) => t.name && (!t.email || EMAIL_RE.test(t.email))).slice(0, 6);
  const keywords = (Array.isArray(o.keywords) ? o.keywords : []).map((k) => String(k || '').trim()).filter((k) => k.length >= 2 && k.length <= 20).slice(0, 8);
  return { tantou: tantou.length ? tantou : DEFAULT_TEIKI.tantou, keywords: keywords.length ? keywords : DEFAULT_TEIKI.keywords };
}
