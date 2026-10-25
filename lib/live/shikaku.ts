// 資格手当：今の社内システムの形 → この画面の型。
//   読むのは GET /api/shikaku-apply?action=list（資格手当の管理画面 shikaku-admin.html と同じ）。
//   今のシステムの段階は 未確認／承認／却下 の3つだけ（「合格証の確認」「給与に反映」の段は無い）
//     未確認 → 確認待ち ／ 承認 → 毎月の手当に載る ／ 却下 → 差し戻し（一覧には出さない）
//   手当の額は 確定手当額（allowance_amount）→ 無ければマスタの額（master_amount）。現場経験の年数は今のシステムに無い
import type { ShikakuApp } from '@/lib/shikaku-sample';

export type IkeShikakuRow = {
  id: string; created_at: string; name: string; exam_date: string; cert: string; exam_fee: number | null;
  status: '未確認' | '承認' | '却下' | string; allowance_amount: number | null; memo: string | null; roster_id: string | null;
  master_amount: number | null; master_known: boolean; master_note?: string;
  cert_url: string | null; receipt_url: string | null;
};
export type IkeShikakuList = { ok: boolean; rows?: IkeShikakuRow[]; error?: string };

export type LiveShikakuApp = ShikakuApp & { amount: number; certUrl?: string; receiptUrl?: string; masterUnknown?: boolean; ike?: IkeShikakuRow };
export type LiveMonthly = { personId: string; name: string; cert: string; amount: number; since: string; ike?: IkeShikakuRow };

const jst = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t + 9 * 3600e3).toISOString() : ''; };
const md = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? `${m[2]}/${m[3]}` : s || '—'; };
const ym = (s: string) => { const m = /^(\d{4})-(\d{2})/.exec(s); return m ? `${m[1]}/${m[2]}` : '—'; };
const amountOfRow = (r: IkeShikakuRow) => (typeof r.allowance_amount === 'number' ? r.allowance_amount : r.master_amount ?? 0);

export function shikakuFromIke(j: IkeShikakuList | null): { apps: LiveShikakuApp[]; monthly: LiveMonthly[] } {
  const rows = j?.rows || [];
  const apps: LiveShikakuApp[] = rows.filter((r) => r.status === '未確認').sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map((r) => ({
    id: r.id, personId: '', name: r.name || '（氏名なし）', cert: r.cert || '（資格なし）',
    passedOn: md(r.exam_date), filedAt: md(jst(r.created_at)), years: -1,
    files: [...(r.cert_url ? ['合格証' as const] : []), ...(r.receipt_url ? ['領収書' as const] : [])],
    state: '確認待ち', amount: amountOfRow(r), certUrl: r.cert_url || undefined, receiptUrl: r.receipt_url || undefined, masterUnknown: !r.master_known, ike: r,
  }));
  const monthly: LiveMonthly[] = rows.filter((r) => r.status === '承認').map((r) => ({
    personId: '', name: r.name || '（氏名なし）', cert: r.cert || '（資格なし）', amount: amountOfRow(r), since: ym(jst(r.created_at)), ike: r,
  }));
  return { apps, monthly };
}
