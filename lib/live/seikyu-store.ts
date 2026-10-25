// 請求書（経理管理）＝「格納」した請求書を正にした一覧（10-25 shoya「請求書は請求書格納したところベースにしていれてね」）。
//   数え方は今の請求書作成の格納タブ（legacy public/seikyu-make.html の invCompanies / invHas / fileWho / stampOf / extOf）と
//   同じにする（10-25 shoya「1」＝会社の名簿の人が全員、格納した請求書に載っているか）。下の関数はその写し。直すときは今の画面と一緒に
//   読むのは今の社内システムの GET だけ：action=make&ym（取引先マスタの会社×その月の名簿の人＝genba）・saved-list・stamped-list・month-summary
//   ★金額・番号・宛先・誰が載っているかは今のデータのまま。ver2 で計算し直さない（判定の式を同じにしているだけ）

export type IkeSaved = {
  id: string; ym: string; group_key: string; partner: string; number: string; total: number; members?: { key: string; name: string }[];
  pdf_path?: string; saved_at: string;
};
export type IkeStamped = {
  id: string; ym: string; group_key: string; saved_id: string | null; number: string; partner: string; file_name: string; uploaded_at: string;
  body_text?: string | null; body_state?: string | null; persons_manual?: string[] | null;
};
export type IkeMonthSum = { ym: string; n: number; total: number; stamped: number };
type GPerson = { key: string; name: string; off?: boolean; meibo?: boolean; shozoku?: string };
export type IkeGenba = { companies?: { coKey: string; company: string; sites?: { people?: GPerson[] }[] }[] };

// ---- 今の画面の写し ----
const nk = (s: unknown) => String(s || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const GK_VAR: Record<string, string> = { '髙': '高', '﨑': '崎', '邊': '辺', '邉': '辺', '齋': '斎', '齊': '斉', '齌': '斉', '澤': '沢', '濱': '浜', '濵': '浜', '德': '徳', '廣': '広', '曾': '曽', '眞': '真', '靑': '青', '惠': '恵', '槇': '槙', '渕': '淵', '冨': '富', '籠': '篭', '桒': '桑', '國': '国', '萬': '万' };
export const gkNameKey = (s: unknown) => nk(s).replace(/[髙﨑邊邉齋齊齌澤濱濵德廣曾眞靑惠槇渕冨籠桒國萬]/g, (ch) => GK_VAR[ch] || ch).replace(/𠮷/g, '吉');

function fileWho(f: IkeStamped, people: { name: string }[]) {
  const man = Array.isArray(f.persons_manual) ? f.persons_manual.map(gkNameKey) : null;
  const hay = gkNameKey(String(f.file_name || '')) + '\n' + gkNameKey(String(f.body_text || ''));
  const hit = people.filter((p) => { const k = gkNameKey(p.name); return k.length >= 2 && (man ? man.includes(k) : hay.includes(k)); });
  return { hit, unread: !man && (f.body_state !== 'ok' || !hit.length) };
}
const whoHas = (files: IkeStamped[], people: { name: string }[], p: { name: string }) => {
  const k = gkNameKey(p.name);
  return files.filter((f) => fileWho(f, people).hit.some((x) => gkNameKey(x.name) === k));
};
function lastSaved(saved: readonly IkeSaved[]): IkeSaved[] {
  const by = new Map<string, IkeSaved>();
  for (const x of saved) { const c = by.get(x.group_key); if (!c || x.saved_at > c.saved_at) by.set(x.group_key, x); }
  return [...by.values()].sort((a, b) => String(a.number || '~').localeCompare(String(b.number || '~')) || String(a.partner).localeCompare(String(b.partner), 'ja'));
}

export type StoreState = '全員載っている' | '載っていない人あり' | '押印し直しが要る' | '人を選ぶ' | 'まだ';
export type StoreCo = {
  key: string; company: string; state: StoreState;
  people: number; on: string[]; off: string[];          // 名簿の人（未経験）のうち、格納した請求書に載っている／載っていない人
  invs: { id: string; number: string; partner: string; total: number; stamped: { id: string; at: string } | null; stale: boolean }[];
  ext: { id: string; name: string; at: string; unread: boolean }[];
  cardDone: boolean;                                      // 今の格納タブで会社のカードが緑か（ファイルがそろって「人を選ぶ」が残っていない）
};

/** 今の格納タブ（請求書）と同じ並び・同じ判定で、会社ごとの行を作る（純関数） */
export function storeCompanies(genba: IkeGenba | null, saved: readonly IkeSaved[], stamped: readonly IkeStamped[]): StoreCo[] {
  const stampOf = (gk: string) => stamped.filter((s) => s.group_key === gk && s.saved_id)[0] || null;
  const extOf = (gk: string) => stamped.filter((s) => s.group_key === gk && !s.saved_id).reverse();
  type C = { key: string; company: string; invs: IkeSaved[]; ppl: number; people: { name: string }[] };
  const by = new Map<string, C>(); const order: string[] = [];
  const co = (k: string, name: string) => { if (!by.has(k)) { by.set(k, { key: k, company: name || k, invs: [], ppl: 0, people: [] }); order.push(k); } return by.get(k)!; };
  for (const c of genba?.companies || []) {
    const x = co('gb:' + c.coKey, c.company); const seen = new Set<string>();
    for (const st of c.sites || []) for (const p of st.people || []) if (!p.off && p.meibo && !seen.has(p.key)) { seen.add(p.key); x.ppl++; x.people.push({ name: p.name }); }
  }
  for (const x of lastSaved(saved)) {
    const k = by.has(x.group_key) || /^gb:/.test(x.group_key) ? x.group_key : '__other';
    co(k, /^gb:/.test(x.group_key) ? x.partner : '取引先マスタ以外の請求書').invs.push(x);
  }
  return order.map((k) => by.get(k)!).filter((c) => c.ppl || c.invs.length).map((c) => {
    const ext = extOf(c.key);
    const invHas = (p: { name: string }) => {
      const k = gkNameKey(p.name); if (k.length < 2) return false;
      const inv = c.invs.some((x) => { const s = stampOf(x.group_key); return !!s && !(x.saved_at > s.uploaded_at) && (x.members || []).some((m) => gkNameKey(m.name) === k); });
      return inv || whoHas(ext, c.people, p).length > 0;
    };
    const st = c.invs.filter((x) => stampOf(x.group_key)).length;
    const extUnk = ext.filter((g) => c.key !== '__other' && fileWho(g, c.people).unread).length;
    const on = c.people.filter(invHas).map((p) => p.name).sort((a, b) => a.localeCompare(b, 'ja'));
    const off = c.people.filter((p) => !invHas(p)).map((p) => p.name).sort((a, b) => a.localeCompare(b, 'ja'));
    const invs = c.invs.map((x) => { const s = stampOf(x.group_key); return { id: x.id, number: x.number, partner: x.partner, total: Number(x.total) || 0, stamped: s ? { id: s.id, at: s.uploaded_at } : null, stale: !!s && x.saved_at > s.uploaded_at }; });
    const anyFile = st > 0 || ext.length > 0;
    const state: StoreState = !anyFile ? 'まだ' : extUnk ? '人を選ぶ' : invs.some((x) => x.stale) ? '押印し直しが要る' : c.ppl && off.length ? '載っていない人あり' : '全員載っている';
    return {
      key: c.key, company: c.company, state, people: c.ppl, on, off, invs,
      ext: ext.map((g) => ({ id: g.id, name: g.file_name, at: g.uploaded_at, unread: c.key !== '__other' && fileWho(g, c.people).unread })),
      cardDone: c.invs.length ? st === c.invs.length && !extUnk : ext.length > 0 && !extUnk,
    };
  });
}

export type SeikyuStoreLive = { ym: string; months: IkeMonthSum[]; companies: StoreCo[]; savedN: number; stampedN: number; pending: number; generatedAt: string };

export const stampedPdfUrl = (id: string) => `/ik/api/seikyu?action=stamped-pdf&id=${encodeURIComponent(id)}`;
export const savedPdfUrl = (id: string) => `/ik/api/seikyu?action=saved-pdf&raw=1&id=${encodeURIComponent(id)}`;
