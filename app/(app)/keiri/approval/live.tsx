'use client';

import Link from 'next/link';
import { Check, ExternalLink } from 'lucide-react';
import { useIke } from '@/components/Live';
import type { Mikeiken } from '@/components/Mikeiken';
import { PersonName } from '@/components/Person';
import { RemainRing } from '@/components/Motivation';
import type { KeihiAdminList } from '@/lib/live/keihi';
import type { IkeShikakuList } from '@/lib/live/shikaku';

// 申請の承認（本物・10-25）。今の社内システムにある「承認待ち」を1か所に集めて、片づける画面へ案内する。
//   ・交通費・経費（申請中）／稟議（申請中）… /keiri/keihi で承認・差し戻し（本物に書ける）
//   ・資格手当（未確認）… /jinji/shikaku
//   ・面談可能日の返信（承認待ちの候補）… 今の社内システムの面談可能日の画面で反映
//   ・画面の外のタスク（承認待ち）… 内勤のマイルの申請。今の社内システムのたまげたポンの承認で
//   ★打刻修正・残業・有給など freee の申請は、今の社内システムに一覧が無い（freee の画面で承認）
//   ★人は未経験の人だけ（画面の外のタスクは内勤の申請なので絞らない）
type Item = { id: string; name: string; what: string; when: string; amount?: number; person: boolean };
type Src = { key: string; label: string; href?: string; where: string; state: string; error: string; items: Item[] };
type RingiList = { ok?: boolean; ringi?: { id: string; linked_name?: string | null; title: string; amount_yen: number; created_at: string }[] };
type Avail = { ok?: boolean; candidates?: { normalizedName: string; name: string; status: 'new' | 'updated' | 'same'; items: { date: string }[] }[] };
type Bikkura = { ok?: boolean; pending?: { id: string; name: string; kind: string; minutes: number; at: string }[] };
// freee 人事労務（申請の承認は freee の中で）
const FREEE_HR_URL = 'https://p.secure.freee.co.jp/';
const yen = (n: number) => `¥${(Number(n) || 0).toLocaleString('ja-JP')}`;
const md = (iso?: string | null) => { const t = Date.parse(String(iso || '')); if (!Number.isFinite(t)) return ''; const d = new Date(t + 9 * 3600e3); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
const errOf = (x: { state: string; error: string; data: unknown }) => (x.state === 'error' ? x.error : (x.data as { ok?: boolean; error?: unknown } | null)?.ok === false ? String((x.data as { error?: unknown }).error || '読めませんでした') : '');

export function ApprovalLive({ mk }: { mk: Mikeiken }) {
  const keihi = useIke<KeihiAdminList>(`keihi?action=adminList&status=${encodeURIComponent('申請中')}`);
  const ringi = useIke<RingiList>(`keihi?action=ringiList&status=${encodeURIComponent('申請中')}`);
  const shikaku = useIke<IkeShikakuList>('shikaku-apply?action=list');
  const avail = useIke<Avail>('availability?action=candidates&days=21');
  const bik = useIke<Bikkura>('bikkura?action=approvals');

  const srcs: Src[] = [
    { key: 'keihi', label: '交通費・経費', href: '/keiri/keihi', where: 'ここから承認・差し戻しできます', state: keihi.state, error: errOf(keihi),
      items: mk.keep(keihi.data?.claims || [], 'linked_name').map((c) => ({ id: c.id, name: c.linked_name || '', what: `${Number(c.ym.slice(5))}月分・${(c.items || []).length}件`, when: md(c.submitted_at), amount: c.total_yen, person: true })) },
    { key: 'ringi', label: '稟議', href: '/keiri/keihi?tab=ringi', where: 'ここから承認・見送りできます', state: ringi.state, error: errOf(ringi),
      items: mk.keep(ringi.data?.ringi || [], 'linked_name').map((r) => ({ id: r.id, name: r.linked_name || '', what: r.title, when: md(r.created_at), amount: r.amount_yen, person: true })) },
    { key: 'shikaku', label: '資格手当', href: '/jinji/shikaku', where: '資格手当の画面で確かめます', state: shikaku.state, error: errOf(shikaku),
      items: mk.keep((shikaku.data?.rows || []).filter((r) => r.status === '未確認'), 'name').map((r) => ({ id: r.id, name: r.name, what: r.cert, when: md(r.created_at), person: true })) },
    { key: 'avail', label: '面談可能日の返信', where: '今の社内システムの「面談可能日」で反映します（ここでは反映しません）', state: avail.state, error: errOf(avail),
      items: mk.keep((avail.data?.candidates || []).filter((c) => c.status !== 'same'), 'name').map((c) => ({ id: c.normalizedName, name: c.name, what: `${c.status === 'new' ? '新しく' : '変わった'}・${c.items.length}日ぶん`, when: c.items[0] ? md(c.items[0].date) + '〜' : '', person: true })) },
    { key: 'bikkura', label: '画面の外のタスク（内勤）', where: '今の社内システムのたまげたポンの承認で決めます', state: bik.state, error: bik.state === 'error' && /403|forbidden|承認者/.test(bik.error) ? '承認者に指名された人だけが見られます' : errOf(bik),
      items: (bik.data?.pending || []).map((p) => ({ id: p.id, name: p.name, what: `${p.kind}・${p.minutes}分`, when: md(p.at), person: false })) },
  ];
  const total = srcs.reduce((s, x) => s + x.items.length, 0);
  const loading = srcs.some((s) => s.state === 'loading');

  return (
    <>
      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={total} total={Math.max(total, 1)} />
        <div className="text-body"><b>承認待ち {total}件</b>{loading && <span className="ml-2 text-faint">読んでいます…</span>}
          <div className="text-sm text-muted">{srcs.filter((s) => s.items.length).map((s) => `${s.label} ${s.items.length}`).join('・') || '今の時点で承認待ちはありません'}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-soft px-4 py-2.5 text-sm text-muted">
        <span>打刻修正・残業・有給・欠勤・遅刻早退の申請は <b className="text-ink">freee の中で承認してください</b>（今の freee 連携の権限では申請を読めないので、ここには出ません）。</span>
        <a href={FREEE_HR_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm ml-auto inline-flex items-center gap-1"><ExternalLink size={13} />freee 人事労務を開く</a>
      </div>
      {!loading && total === 0 && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-8 text-center"><Check className="mx-auto text-ok" size={26} /><div className="mt-2 text-md font-bold">承認待ちはぜんぶ片づいています</div></div>
      )}
      {srcs.map((s, si) => (
        <section key={s.key} className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: si + 2 }}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5">
            <b className="text-body">{s.label}</b><span className="chip" style={{ background: s.items.length ? 'var(--tone-warn-bg)' : 'var(--tone-mute-bg)', color: s.items.length ? 'var(--tone-warn-fg)' : 'var(--tone-mute-fg)' }}>{s.state === 'loading' ? '…' : `${s.items.length}件`}</span>
            <span className="text-sm text-faint">{s.where}</span>
            {s.href && s.items.length > 0 && <Link href={s.href} className="ml-auto text-sm font-semibold" style={{ color: 'var(--ad)' }}>片づけに行く</Link>}
          </div>
          {s.error && <div className="px-4 py-2 text-sm" style={{ color: 'var(--tone-bad-fg)' }}>{s.error}</div>}
          {s.items.length > 0 && (
            <ul className="text-body">
              {s.items.slice(0, 30).map((it) => (
                <li key={it.id} className="row flex flex-wrap items-center gap-3 border-t border-line-soft px-4 py-2 first:border-t-0">
                  {it.person ? <PersonName name={it.name || '（氏名がまだ決まらない）'} className="font-semibold underline-offset-2 hover:underline" /> : <span className="font-semibold">{it.name}</span>}
                  <span className="text-muted">{it.what}</span>
                  {it.amount != null && <span className="num">{yen(it.amount)}</span>}
                  <span className="num ml-auto text-sm text-faint">{it.when}</span>
                </li>
              ))}
              {s.items.length > 30 && <li className="border-t border-line-soft px-4 py-2 text-sm text-faint">ほか {s.items.length - 30}件</li>}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
