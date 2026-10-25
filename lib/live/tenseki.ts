// 転籍台帳（人事管理）の本物。今の社内システムの「転籍台帳」（/tenseki.html）と同じ API。
//   GET /api/tenseki?action=list … 確認待ち（draft）／最近の確定・却下（200件まで）／退職だけの候補／会社名
//   ★入れるのは今のシステムで super_admin と労務事務の人だけ（それ以外は 403）
//   ★確定・却下・手直し・手動起票（POST）は呼ばない。ここは読むだけ
//   ★今のシステムの状態は 確認待ち → 確定（勤怠の紐付けを転籍日で割る）／却下 の3つだけ。ver2 の5段の手続きは無い
import { jstToday, staffIdOf } from './staff';
import { normName } from './eigyo-common';
import type { Yoyaku } from '@/lib/yoyaku-sample';

type Evidence = { items?: { source: string; match?: string; from_retire?: string; to_entry?: string }[]; date_edited?: boolean };
export type IkeLedger = {
  id: number; normalized_name: string; name: string; effective_date: string;
  from_company_id: string | null; to_company_id: string | null; source: string; status: 'draft' | 'confirmed' | 'rejected';
  evidence?: Evidence; reason?: string | null; note?: string | null; confirmed_at?: string | null; updated_at?: string | null;
};
export type IkeTensekiList = {
  ok?: boolean; today: string; snapshotDate: string | null; drafts: IkeLedger[]; done: IkeLedger[];
  retire: unknown[]; companies: Record<string, string>;
};

export type LiveTenseki = {
  id: string; personId: string; name: string; on: string; from: string; to: string;
  state: '確認待ち' | '確定' | '却下'; reason: string; proofs: string[]; note: string; closed: boolean;
};

const MATCH: Record<string, string> = { a: 'ユーザーID一致', b: 'メール一致', c: '在籍がつながる' };
function proofsOf(ev?: Evidence): string[] {
  const out = (ev?.items || []).map((e) => e.source === 'freee_snapshot' ? `freee の写し（${MATCH[e.match || ''] || e.match || ''}）`
    : e.source === 'mnm_member' ? 'ミンミカの番号/会社が変化' : e.source === 'mnm_history' ? 'ミンミカの転籍履歴' : '手動');
  if (ev?.date_edited) out.push('日付を手直し');
  return out;
}

export function toTensekiLive(j: IkeTensekiList) {
  const cname = (id: string | null) => (id ? j.companies?.[id] || `事業所 ${id}` : '（不明）');
  const map = (r: IkeLedger): LiveTenseki => {
    const f = (r.evidence?.items || []).find((e) => e.source === 'freee_snapshot');
    return {
      id: `L${r.id}`, personId: staffIdOf(r.name), name: r.name, on: String(r.effective_date || '').slice(0, 10),
      from: cname(r.from_company_id), to: cname(r.to_company_id),
      state: r.status === 'draft' ? '確認待ち' : r.status === 'confirmed' ? '確定' : '却下', closed: r.status !== 'draft',
      reason: r.reason || '', proofs: proofsOf(r.evidence),
      note: f ? `旧の退職日 ${String(f.from_retire || '').slice(0, 10) || '—'}／新の入社日 ${String(f.to_entry || '').slice(0, 10) || '未入力'}` : '',
    };
  };
  return {
    rows: [...(j.drafts || []).map(map).sort((a, b) => a.on.localeCompare(b.on)), ...(j.done || []).map(map)],
    retireCount: (j.retire || []).length, snapshotDate: j.snapshotDate || '', today: j.today || jstToday(),
  };
}

// ---- 転籍台帳はページに出さず、名簿と変更の予約に混ぜる（10-25 shoya「転籍台帳は裏で持っててさ従業員名簿にいれて」「変更の予約に転籍も入れて」） ----
/** 台帳の行 → 変更の予約の行。確認待ち＝承認待ち／確定で転籍日が明日以降＝予約中／確定で今日まで＝適用済み。却下は出さない
 *  ★「今日」の転籍は済み（適用済み）に数える。名簿の印（tensekiMarks の転籍済み）と同じ線（10-25 揃えた） */
export function tensekiYoyaku(rows: readonly LiveTenseki[], today: string): Yoyaku[] {
  return rows.filter((r) => r.state !== '却下' && r.on).map((r) => ({
    id: `tenseki:${r.id}`, date: r.on, personId: r.personId, person: r.name, field: '転籍' as const, from: r.from, to: r.to, by: '転籍台帳',
    state: r.state === '確認待ち' ? '承認待ち' as const : r.on > today ? '予約中' as const : '適用済み' as const,
    note: r.state === '確認待ち' ? `転籍台帳の確認待ち（${r.proofs.join('・') || '根拠なし'}）。確定は今の社内システムの転籍台帳から` : undefined,
  }));
}

/** 名簿の名前の下に出す1行（正規化した氏名 → 文）。これからの転籍と、30日以内に済んだ転籍だけ
 *  ・今日の転籍は「転籍済み」（tensekiYoyaku の適用済みと同じ線）
 *  ・これからの転籍がいくつもあれば、いちばん近いものを出す。これからの転籍があれば済んだものより優先
 *  ・台帳は名前でしか名簿とつながらない。rosterNames（名簿の氏名）を渡すと、名簿に同じ名前が2人以上いる人には印を付けず、
 *    ambiguous=true の注意書きだけ返す（別人に転籍の印を付けない・10-25） */
export function tensekiMarks(
  rows: readonly { name: string; on: string; from: string; to: string; state: string }[], today: string, rosterNames?: readonly string[],
): Map<string, { text: string; pending: boolean; ambiguous?: boolean }> {
  const out = new Map<string, { text: string; pending: boolean; ambiguous?: boolean }>();
  const recent = new Date(Date.parse(today) - 30 * 86400000).toISOString().slice(0, 10);
  const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
  const dupe = new Set<string>();
  if (rosterNames) {
    const n = new Map<string, number>();
    for (const x of rosterNames) { const k = normName(x); if (k) n.set(k, (n.get(k) || 0) + 1); }
    for (const [k, c] of n) if (c > 1) dupe.add(k);
  }
  for (const r of [...rows].sort((a, b) => a.on.localeCompare(b.on))) {
    if (!r.on || r.state === '却下' || r.state === '取りやめ') continue;
    const done = r.state === '確定' || r.state === '完了';
    if (done && r.on < recent) continue;
    const pending = !done || r.on > today;
    const k = normName(r.name);
    if (!k) continue;
    if (dupe.has(k)) { out.set(k, { pending: false, ambiguous: true, text: '同姓同名がいるので転籍の印は付けていません（変更の予約で確かめてください）' }); continue; }
    const cur = out.get(k);
    // 古い順に見ている：済み同士は新しいほう、これから同士は先に来た（近い）ほう、これからは済みより優先
    if (cur && cur.pending) continue;
    out.set(k, { pending, text: `${pending ? '転籍予定' : '転籍済み'} ${md(r.on)}〜 ${r.from}→${r.to}${done ? '' : `（${r.state}）`}` });
  }
  return out;
}
