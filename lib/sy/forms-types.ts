// イベント出欠（Googleフォームの回答シートをそのまま見るページ・2026-10-02 shoya「月次アンケートみたいにページ作って」）
//   ・1フォーム＝1つの回答シート。設問は決め打ちしない（勉強会の出欠・入社説明会の参加可否・ヌン活 … フォームごとに列が違う）
//   ・一覧は saiyou.settings key='forms'（行が無い間は DEFAULT_FORMS）。足す・外すは admin 以上
//   ・シートを読むのは いけどん /api/survey?action=formSheet（legacy api/_form_sheet.ts）。
//     ★いけどん側は「登録済みのシートだけ」読む。DEFAULT_FORMS を変えたら いけどんの FORM_SHEETS_DEFAULT も合わせる
export interface FormDef {
  id: string; title: string; sheetId: string; gid: number | null;
  main?: string;   // 上の大きい数字に使う設問（見出しに含まれる言葉）。無ければ「出欠／可否」を含む列 → 最初の選択式の列
}
export const DEFAULT_FORMS: FormDef[] = [
  { id: 'benkyoukai', title: '土曜日勉強会', sheetId: '1tWf0s6pKZ_JjHHcldl74tONhn0X6K2iDQQ_wL0spokA', gid: 305518257 },
  { id: 'setsumeikai', title: '入社説明会', sheetId: '1uYXw6uQOGxKqutGyO8M8D89M8Hh64DpzBLZNwFHM-L0', gid: 527577243 },
  { id: 'nunkatsu', title: 'ヌン活', sheetId: '1rqQ8YdG__P_wbU7UkHnDekgi8DPY4yukcnxlfamgg9s', gid: 864373722, main: '候補日' },
];
export const FORMS_PAGE = '/events';

// いけどん /api/survey?action=formSheet の戻り。rows は見出しと同じ並びの文字列（タイムスタンプ列だけ ISO・JST）
export interface FormSheet {
  ok: boolean; error?: string;
  title: string; gid: number; tab: string; tabs: { gid: number; title: string }[];
  header: string[]; rows: string[][]; tsCol: number;
}

const SHEET_ID = /^[a-zA-Z0-9_-]{20,80}$/;
// スプレッドシートのURL（またはIDそのもの）→ シートID と gid
export function parseSheetUrl(v: string): { sheetId: string; gid: number | null } | null {
  const s = String(v || '').trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,80})/);
  const sheetId = m ? m[1] : SHEET_ID.test(s) ? s : '';
  if (!sheetId) return null;
  const g = s.match(/[#?&]gid=(\d+)/g);   // URL に2回出る（?gid= と #gid=）。後ろ＝いま開いているタブ
  return { sheetId, gid: g ? Number(g[g.length - 1].replace(/\D+/g, '')) : null };
}
export function cleanForms(v: unknown): FormDef[] {
  const xs = Array.isArray((v as { forms?: unknown })?.forms) ? (v as { forms: unknown[] }).forms : [];
  const seen = new Set<string>(); const out: FormDef[] = [];
  for (const x of xs) {
    const o = (x || {}) as Partial<FormDef>;
    const sheetId = String(o.sheetId || ''); const title = String(o.title || '').trim().slice(0, 40);
    if (!SHEET_ID.test(sheetId) || !title) continue;
    const gid = typeof o.gid === 'number' && Number.isFinite(o.gid) ? o.gid : null;
    let id = String(o.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || `f${sheetId.slice(0, 8)}${gid ?? ''}`;
    while (seen.has(id)) id += 'x';
    seen.add(id);
    const main = String(o.main || '').trim().slice(0, 40);
    out.push({ id, title, sheetId, gid, ...(main ? { main } : {}) });
    if (out.length >= 30) break;
  }
  return out;
}
