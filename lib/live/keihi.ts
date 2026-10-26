// 交通費・経費：今の社内システムの GET /api/keihi?action=adminList&status=申請中 の形 → この画面の Claim。
//   ・判定は今のシステムのまま（通勤日は申請のときに freee 打刻と照合済み・定期は月末の見回り・バスは本人の入力）。ここで計算し直さない
//   ・今の画面（keihi-admin.html）が出している印（手入力・バス・定期・領収書なし）を「先に確かめたこと」に並べる
import type { Claim, ClaimKind, ClaimLine } from '../keihi-sample';
import type { Check } from '../kintai-sample';

export type KeihiItem = {
  id: string; claim_id: string; kind: 'transit' | 'expense' | string; used_on: string; category: string; amount_yen: number;
  from_station?: string | null; to_station?: string | null; round_trip?: boolean | null; route?: string | null;
  fare_source?: string | null; mode?: string | null; pass_start?: string | null; pass_end?: string | null;
  payee?: string | null; receipt_path?: string | null; receipt_url?: string | null; purpose?: string | null;
};
export type KeihiClaim = {
  id: string; linked_name?: string | null; ym: string; status: string; total_yen: number; commute_yen: number; other_yen: number;
  note?: string | null; submitted_at?: string | null; items?: KeihiItem[];
};
export type KeihiAdminList = { ok?: boolean; claims?: KeihiClaim[]; error?: string };

const RECEIPT_REQUIRED = new Set(['新幹線', '宿泊費']);
const isPass = (i: KeihiItem) => i.kind === 'transit' && i.mode === 'pass';
const isCommute = (i: KeihiItem) => i.kind === 'transit' && i.category === 'commute' && i.mode !== 'pass';
const md = (iso?: string | null) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : '');
const stamp = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(Date.parse(iso) + 9 * 3600e3);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const thisYm = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);

function kindOf(items: KeihiItem[]): ClaimKind {
  if (items.some(isPass)) return '定期';
  if (items.length && items.every((i) => i.kind === 'transit' && i.mode === 'bus')) return 'バス';
  if (items.some((i) => i.kind === 'expense' || (i.kind === 'transit' && i.category === 'business'))) return '出張・面談';
  return '通勤（日ごと）';
}

function detailOf(items: KeihiItem[]): string {
  const pass = items.find(isPass);
  if (pass) return `${pass.from_station || ''}→${pass.to_station || ''}（定期${pass.pass_start && pass.pass_end ? ` ${md(pass.pass_start)}〜${md(pass.pass_end)}` : '・期間の入力なし'}）`;
  const n = (f: (i: KeihiItem) => boolean) => items.filter(f).length;
  const parts = [
    [n(isCommute), '通勤費'], [n((i) => i.kind === 'transit' && i.category === 'business'), '交通費（通勤費以外）'],
    [n((i) => i.kind === 'expense'), '出張'],
  ].filter(([k]) => (k as number) > 0).map(([k, l]) => `${l} ${k}件`);
  const days = new Set(items.map((i) => i.used_on)).size;
  return `${days}日・${parts.join('・') || `${items.length}件`}`;
}

function checksOf(c: KeihiClaim, items: KeihiItem[]): Check[] {
  const out: Check[] = [];
  const noReceipt = items.filter((i) => i.kind === 'expense' && RECEIPT_REQUIRED.has(i.category) && !i.receipt_path).length;
  if (noReceipt) out.push({ tone: 'bad', text: `領収書が無い明細 ${noReceipt}件（新幹線・宿泊費は必要）` });
  const manual = items.filter((i) => i.fare_source === 'manual').length;
  if (manual) out.push({ tone: 'warn', text: `運賃が手入力の明細 ${manual}件` });
  const bus = items.filter((i) => i.mode === 'bus').length;
  if (bus) out.push({ tone: 'warn', text: `バス ${bus}件（区間と金額は本人の入力）` });
  if (items.some(isCommute)) out.push({ tone: 'ok', text: '通勤日は freee の打刻と照合済み（申請のとき）' });
  if (items.some(isPass)) out.push({ tone: 'ok', text: c.ym < thisYm() ? '定期：承認するときに打刻を確かめます（漏れがあれば自動で差し戻し）' : '定期：月の途中でも承認できます（月が終わったら打刻を自動で確認）' });
  if (!out.length) out.push({ tone: 'ok', text: '気になる印はありません' });
  return out;
}

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const dayJa = (d: string) => { const t = new Date(d + 'T00:00:00Z'); return isNaN(+t) ? d : `${t.getUTCMonth() + 1}/${t.getUTCDate()}（${DOW[t.getUTCDay()]}）`; };
const SRC: Record<string, string> = { ic: 'ICカード', ticket: '運賃検索', manual: '手入力' };
// 明細1行（10-26）：日付・種類・区間か支払先・金額・運賃の出どころ・目的
function lineOf(i: KeihiItem): ClaimLine {
  const pass = isPass(i);
  const kind = pass ? '定期' : i.kind === 'expense' ? i.category || '経費' : i.mode === 'bus' ? 'バス' : i.category === 'commute' ? '通勤' : '交通費（通勤以外）';
  const route = i.from_station || i.to_station ? `${i.from_station || '？'}→${i.to_station || '？'}${pass ? '' : i.round_trip ? '（往復）' : '（片道）'}` : '';
  const what = i.kind === 'expense' ? [i.payee, route].filter(Boolean).join('・') || '—' : [route, i.route ? `経路：${i.route}` : ''].filter(Boolean).join('　') || '—';
  const note = [pass ? (i.pass_start && i.pass_end ? `期間 ${md(i.pass_start)}〜${md(i.pass_end)}` : '期間の入力なし') : '', i.purpose || ''].filter(Boolean).join('・');
  return { id: i.id, date: pass ? '' : dayJa(i.used_on), kind, what, amount: Number(i.amount_yen) || 0, src: i.kind === 'transit' ? SRC[i.fare_source || ''] || '' : '', note, receiptUrl: i.receipt_url };
}

export function toClaims(j: KeihiAdminList | null): Claim[] {
  return (j?.claims || []).map((c) => {
    const items = c.items || [];
    return {
      id: c.id, personId: '', person: c.linked_name || '（氏名がまだ決まらない）', site: `${Number(c.ym.slice(5, 7))}月分・${items.length}件`,
      kind: kindOf(items), month: `${Number(c.ym.slice(5, 7))}月`, amount: Number(c.total_yen) || 0, detail: detailOf(items),
      source: items.some((i) => i.fare_source === 'ic') ? 'ICカードから' : '手入力', filedAt: stamp(c.submitted_at), checks: checksOf(c, items),
      lines: [...items].sort((a, b) => a.used_on.localeCompare(b.used_on)).map(lineOf),
    };
  });
}
