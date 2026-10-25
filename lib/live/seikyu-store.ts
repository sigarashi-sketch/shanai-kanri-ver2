// 請求書（経理管理）＝「格納」した請求書を正にした一覧（10-25 shoya「請求書は請求書格納したところベースにしていれてね」）。
//   読むのは今の社内システムの GET だけ（/ik/api/seikyu 経由・今の請求書作成の格納タブと同じ口）：
//     action=month-summary … 月ごとの 保存した請求書の数・合計・押印PDFのある数
//     action=saved-list&ym … その月に保存した請求書（取引先＝group_key ごとに何回でも保存し直せる。最後の版が正）
//     action=stamped-list&ym … その月に格納した PDF（saved_id あり＝保存した版に押印したもの／空＝別で作った請求書）
//   ★金額・番号・宛先は保存した版の値のまま（ver2 で計算し直さない）。誰が載っているかの判定は格納ページ（今の画面）が正
//   ★「格納ずみ」＝最後に保存した版に押印 PDF がある、または別で作った請求書が置いてある。
//     保存し直したあと押印 PDF を上げ直していなければ「押印し直しが要る」（今の格納タブの「光らない」と同じ考え）

export type IkeSaved = {
  id: string; ym: string; group_key: string; partner: string; issuer: string; number: string; billing_date: string; due_date: string;
  subtotal: number; tax: number; total: number; members: { key: string; name: string }[]; file_name: string; saved_by: string; saved_at: string;
};
export type IkeStamped = { id: string; ym: string; group_key: string; saved_id: string | null; number: string; partner: string; total: number; file_name: string; uploaded_by: string; uploaded_at: string };
export type IkeMonthSum = { ym: string; n: number; total: number; stamped: number };

export type StoreState = '格納ずみ' | '押印し直しが要る' | '押印PDFまだ';
export type StoreRow = {
  key: string; partner: string; issuer: string; number: string; total: number | null; members: number; billingDate: string; dueDate: string;
  state: StoreState; external: boolean;   // external＝別で作った請求書だけ（保存した版が無い）
  savedId: string | null; savedAt: string;
  files: { id: string; name: string; at: string; kind: '押印' | '別で作った' }[];
};

/** 保存した版と格納した PDF を、取引先（group_key）ごとの1行にまとめる（純関数） */
export function storeRows(saved: readonly IkeSaved[], stamped: readonly IkeStamped[]): StoreRow[] {
  const last = new Map<string, IkeSaved>();
  for (const s of saved) { const c = last.get(s.group_key); if (!c || s.saved_at > c.saved_at) last.set(s.group_key, s); }
  const files = new Map<string, IkeStamped[]>();
  for (const f of stamped) files.set(f.group_key, [...(files.get(f.group_key) || []), f]);
  const keys = new Set([...last.keys(), ...files.keys()]);
  const out: StoreRow[] = [];
  for (const k of keys) {
    const s = last.get(k) || null;
    const fs = (files.get(k) || []).slice().sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
    const ext = fs.filter((f) => !f.saved_id);
    const stampedLatest = !!s && fs.some((f) => f.saved_id === s.id);
    const state: StoreState = stampedLatest || ext.length ? '格納ずみ' : s && fs.some((f) => f.saved_id) ? '押印し直しが要る' : '押印PDFまだ';
    out.push({
      key: k, partner: s?.partner || fs[0]?.partner || '（宛先なし）', issuer: s?.issuer || '', number: s?.number || '',
      total: s ? Number(s.total) || 0 : null, members: s?.members?.length || 0, billingDate: s?.billing_date || '', dueDate: s?.due_date || '',
      state, external: !s, savedId: s?.id || null, savedAt: s?.saved_at || '',
      files: fs.map((f) => ({ id: f.id, name: f.file_name, at: f.uploaded_at, kind: f.saved_id ? '押印' : '別で作った' })),
    });
  }
  const rank: Record<StoreState, number> = { 押印PDFまだ: 0, 押印し直しが要る: 1, 格納ずみ: 2 };
  return out.sort((a, b) => rank[a.state] - rank[b.state] || a.partner.localeCompare(b.partner, 'ja'));
}

export const stampedPdfUrl = (id: string) => `/ik/api/seikyu?action=stamped-pdf&id=${encodeURIComponent(id)}`;
export const savedPdfUrl = (id: string) => `/ik/api/seikyu?action=saved-pdf&raw=1&id=${encodeURIComponent(id)}`;
