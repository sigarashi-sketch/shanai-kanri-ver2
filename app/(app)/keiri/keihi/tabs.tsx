'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useIke } from '@/components/Live';
import type { Mikeiken } from '@/components/Mikeiken';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import { PersonName } from '@/components/Person';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { postLive } from '@/lib/live/post';
import { CLAIMS } from '@/lib/keihi-sample';

// 交通費・経費の「月次」「稟議」タブ（10-25 今の keihi-admin.html から移し替え）。
//   月次：GET /api/keihi?action=monthly&ym= … その月の承認・支払済を人ごとに合計（給与の振込みに載せる額）
//         支払済にする（10-26）：POST /api/live/keihi {action:'markPaid'} → 今の markPaid（全員分・定期の打刻の確認が済むまでは今のシステムが止める）
//   稟議：GET /api/keihi?action=ringiList&status=申請中 … 承認・見送りは POST /api/live/keihi（本人の LINE に届く）
//   本物は未経験の人だけ（今のプロパーリストに入っている人）
const yen = (n: number) => `¥${(Number(n) || 0).toLocaleString('ja-JP')}`;
const jstYm = (back: number) => { const j = new Date(Date.now() + 9 * 3600e3); const d = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth() - back, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const ymLabel = (ym: string) => `${ym.slice(0, 4)}年${Number(ym.slice(5))}月`;

type MonthlyPerson = { name: string; claims: number; commute_yen: number; other_yen: number; total_yen: number; freee_employee_id?: string | null };
type Monthly = { ok?: boolean; ym: string; people: MonthlyPerson[]; pending: number; error?: string };

export function KeihiMonthlyTab({ live, mk }: { live: boolean; mk: Mikeiken }) {
  const canApprove = usePerms().can('keiri', 'approve');
  const { hit, toast } = useMotivation();
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [ym, setYm] = useState('');
  useEffect(() => setYm(jstYm(1)), []);
  const ike = useIke<Monthly>(live && ym ? `keihi?action=monthly&ym=${ym}` : null);
  const ok = ike.live && ike.data?.ok !== false;
  const people: MonthlyPerson[] = live
    ? (ok && ike.data ? mk.keep(ike.data.people || [], 'name') : [])
    : Object.values(CLAIMS.reduce<Record<string, MonthlyPerson>>((a, c) => {
      const p = a[c.person] || { name: c.person, claims: 0, commute_yen: 0, other_yen: 0, total_yen: 0 };
      p.claims++; p.total_yen += c.amount; if (c.kind === '出張・面談') p.other_yen += c.amount; else p.commute_yen += c.amount;
      a[c.person] = p; return a;
    }, {}));
  const sum = people.reduce((s, p) => ({ c: s.c + p.commute_yen, o: s.o + p.other_yen, t: s.t + p.total_yen }), { c: 0, o: 0, t: 0 });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-body">
        <select aria-label="月" value={ym} onChange={(e) => setYm(e.target.value)} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-body">
          {[0, 1, 2, 3, 4, 5].map((b) => jstYm(b)).map((m) => <option key={m} value={m}>{ymLabel(m)}分</option>)}
        </select>
        <div><b>承認・支払済 {people.length}人</b><span className="num ml-2 text-muted">通勤 {yen(sum.c)}・その他 {yen(sum.o)}・合計 {yen(sum.t)}</span>
          {live && ok && (ike.data?.pending || 0) > 0 && <div className="text-sm text-warn">この月の申請中・差し戻し中が {ike.data!.pending}件あります（全員分の数）</div>}
          {!live && <div className="text-sm text-faint">見本データです（ログインすると今の社内システムの月次が出ます）</div>}
        </div>
      </div>
      {live && ike.state === 'error' && <div className="rounded-xl px-4 py-2.5 text-sm" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>{ike.error}</div>}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[620px] border-collapse text-body">
          <thead><tr className="th-row text-left"><th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 text-right font-semibold">申請</th><th className="px-2 py-2.5 text-right font-semibold">通勤</th><th className="px-2 py-2.5 text-right font-semibold">その他</th><th className="px-2 py-2.5 text-right font-semibold">合計</th><th className="px-4 py-2.5 font-semibold">freee</th></tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.name} className="row border-t border-line-soft">
                <td className="px-4 py-2.5"><PersonName name={p.name} className="font-semibold underline-offset-2 hover:underline" /></td>
                <td className="num px-2 py-2.5 text-right">{p.claims}件</td>
                <td className="num px-2 py-2.5 text-right">{yen(p.commute_yen)}</td>
                <td className="num px-2 py-2.5 text-right">{yen(p.other_yen)}</td>
                <td className="num px-2 py-2.5 text-right font-semibold">{yen(p.total_yen)}</td>
                <td className="px-4 py-2.5 text-sm">{!live ? '—' : p.freee_employee_id ? <span className="text-ok">結び付き済み</span> : <span className="text-warn">未紐付け（手で確かめる）</span>}</td>
              </tr>
            ))}
            {people.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">{live && ike.state === 'loading' ? '読んでいます…' : 'この月の承認済みの申請はありません'}</td></tr>}
          </tbody>
        </table>
      </div>
      {live && ok && people.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
          <span className="text-muted">給与に載せたら、この月の承認済みを「支払済」にします（全員分。定期つきは打刻の確認が済んでから・済んでいなければ止まります）。</span>
          <button disabled={!canApprove} title={!canApprove ? needText('approve') : undefined} className="btn-secondary btn-sm ml-auto"
            onClick={() => setConfirm({
              title: `${ymLabel(ym)}分の承認済みを支払済にする`, okLabel: '支払済にする', danger: true,
              lines: ['この月の「承認」の申請を全員分（未経験以外の人も含む）支払済にします。元に戻せません', '支払月は翌月（月末締め・翌月末日払い）', '定期つきで打刻の確認がまだの申請があれば、今のシステムが止めます（毎朝9時すぎに自動で確認）'],
              run: async () => { const r = await postLive<{ count?: number }>('/api/live/keihi', { action: 'markPaid', ym }); hit(); toast({ text: `${ymLabel(ym)}分 ${r.count ?? 0}件を支払済にしました` }); ike.reload(); },
            })}>この月の承認済みを支払済にする</button>
        </div>
      )}
      {!live && <p className="text-xs text-faint">支払済にする操作は、ログインすると今の社内システムに書きます（定期の打刻の確認が済んでから）。</p>}
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

type Ringi = { id: string; linked_name?: string | null; title: string; detail?: string | null; amount_yen: number; planned_on?: string | null; status: string; created_at: string; decision_comment?: string | null };
type RingiList = { ok?: boolean; ringi: Ringi[]; error?: string };
const RINGI_SAMPLE: Ringi[] = [
  { id: 's1', linked_name: '見本 太郎', title: '資格の参考書', detail: '基本情報の問題集', amount_yen: 3080, planned_on: '2026-11-01', status: '申請中', created_at: '2026-10-22T01:00:00Z' },
  { id: 's2', linked_name: '見本 花子', title: '研修の受講料', detail: 'オンライン講座', amount_yen: 12000, planned_on: '2026-11-10', status: '申請中', created_at: '2026-10-23T02:00:00Z' },
];

export function KeihiRingiTab({ live, mk }: { live: boolean; mk: Mikeiken }) {
  const canApprove = usePerms().can('keiri', 'approve');
  const { hit, toast } = useMotivation();
  const ike = useIke<RingiList>(live ? `keihi?action=ringiList&status=${encodeURIComponent('申請中')}` : null);
  const [done, setDone] = useState<Record<string, string>>({});
  // 見送りの理由はその都度手で打つ（本人の LINE に届く・10-25 shoya）
  const [why, setWhy] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const rows = (live ? (ike.data?.ringi ? mk.keep(ike.data.ringi, 'linked_name') : []) : RINGI_SAMPLE).filter((r) => !done[r.id]);
  const decide = (r: Ringi, decision: 'approve' | 'reject', comment = '') => {
    const name = r.linked_name || '（氏名がまだ決まらない）';
    if (!live) { setDone((d) => ({ ...d, [r.id]: decision })); hit(); toast({ text: `${name} の稟議を${decision === 'approve' ? '承認' : '見送り'}にしました（見本）`, undo: () => setDone((d) => { const n = { ...d }; delete n[r.id]; return n; }) }); return; }
    setConfirm({
      title: `${name} の稟議「${r.title}」を${decision === 'approve' ? '承認する' : '見送る'}`, okLabel: decision === 'approve' ? '承認する' : '見送る', danger: decision === 'reject',
      lines: [`金額：${yen(r.amount_yen)}${r.planned_on ? `・予定日 ${r.planned_on}` : ''}`, ...(comment ? [`理由：${comment}`] : [])],
      sends: '本人の LINE に結果が届きます',
      run: async () => { await postLive('/api/live/keihi', { action: 'ringiDecide', id: r.id, decision, comment }); hit(); toast({ text: `${name} の稟議を${decision === 'approve' ? '承認' : '見送り'}にしました`, sub: '→ 本人の LINE に届けました' }); ike.reload(); },
    });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-line bg-surface px-4 py-3 text-body"><b>判断待ちの稟議 {rows.length}件</b>
        {!canApprove && <span className="ml-2 text-sm text-bad">{needText('approve')}</span>}
        {!live && <div className="text-sm text-faint">見本データです（ログインすると今の社内システムの稟議が出ます）</div>}
      </div>
      {live && ike.state === 'error' && <div className="rounded-xl px-4 py-2.5 text-sm" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>{ike.error}</div>}
      {rows.length === 0 && (live ? ike.state !== 'loading' : true) && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-8 text-center"><Check className="mx-auto text-ok" size={24} /><div className="mt-2 text-body font-bold">判断待ちの稟議はありません</div></div>
      )}
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <div className="min-w-[220px] flex-1">
            <PersonName name={r.linked_name || '（氏名がまだ決まらない）'} className="font-semibold underline-offset-2 hover:underline" />
            <div className="mt-0.5 text-body font-semibold">{r.title}<span className="num ml-2">{yen(r.amount_yen)}</span></div>
            {r.detail && <div className="text-sm text-muted">{r.detail}</div>}
            <div className="text-xs text-faint">申請 {r.created_at.slice(5, 10).replace('-', '/')}{r.planned_on ? `・予定日 ${r.planned_on.slice(5).replace('-', '/')}` : ''}</div>
          </div>
          <div className="flex flex-col gap-1.5">
            <button onClick={() => decide(r, 'approve')} disabled={!canApprove} title={!canApprove ? needText('approve') : undefined} className="btn-primary btn-sm">承認</button>
            <textarea aria-label="見送る理由" rows={2} value={why[r.id] || ''} disabled={!canApprove} onChange={(e) => setWhy((w) => ({ ...w, [r.id]: e.target.value }))} placeholder="見送る理由（本人に届きます）" className="w-[220px] rounded-lg border border-field bg-surface px-2 py-1 text-sm disabled:opacity-50" />
            <button onClick={() => decide(r, 'reject', (why[r.id] || '').trim())} disabled={!canApprove || !(why[r.id] || '').trim()} className="min-h-8 rounded-lg border border-line px-3 text-sm font-bold text-bad disabled:opacity-40">見送る</button>
          </div>
        </div>
      ))}
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
