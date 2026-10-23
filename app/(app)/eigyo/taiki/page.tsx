'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Hourglass, MapPin } from 'lucide-react';
import { SALES_REPS, TAIKI, TAIKI_STATES, taikiDays, type Taiki, type TaikiState } from '@/lib/taiki-sample';
import { STOCK, matchOf, ngReason } from '@/lib/cases-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';

// 待機・再アサイン（営業）。待機中の人と、契約終了が近い「もうすぐ待機」の人を、日数つきで並べる。
//   ・次の案件の候補・担当営業・状態を選ぶだけで変える。参画決定になったら一覧から片づく
//   ・担当営業＝ミンミカの成約者。営業リストの「担当」は採用担当なので、別の列に分けて出す（混ぜない）
type Row = Taiki & { next: string };
type Filter = 'すべて' | '待機中' | 'もうすぐ待機';
const STATE_STYLE: Record<TaikiState, { bg: string; fg: string }> = {
  案件を探す: { bg: 'var(--tone-bad-bg)', fg: 'var(--tone-bad-fg)' },
  案件を送った: { bg: 'var(--tone-info-bg)', fg: 'var(--tone-info-fg)' },
  面談調整中: { bg: 'var(--tone-purple-bg)', fg: 'var(--tone-purple-fg)' },
  参画決定: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)' },
  いったん保留: { bg: 'var(--tone-mute-bg)', fg: 'var(--tone-mute-fg)' },
};
const STATE_SUB: Record<TaikiState, string> = {
  案件を探す: '→ 案件の「合いそうな要員」に出し続けます',
  案件を送った: '→ 案件進捗で返信を待ちます',
  面談調整中: '→ 面談の予定と、要員リストの状態に反映しました',
  参画決定: '→ 要員リストを「参画決定」にし、待機の一覧から外しました',
  いったん保留: '→ 案件の「合いそうな要員」から外しました（待機日数は数え続けます）',
};
const daysTone = (t: Taiki) => { const d = taikiDays(t); return t.kind === '待機中' ? (d >= 30 ? 'bad' : d >= 14 ? 'warn' : 'ok') : (d <= 30 ? 'warn' : 'ok'); };
const candidatesOf = (t: Taiki) => STOCK.filter((c) => !ngReason(c)).map((c) => ({ c, ...matchOf(c, t) })).sort((a, b) => b.score - a.score).slice(0, 3);
// 長く待機している人 → 契約終了が近い人 の順
const sortRows = (rs: Row[]) => [...rs].sort((a, b) => (a.kind === b.kind ? (a.kind === '待機中' ? taikiDays(b) - taikiDays(a) : taikiDays(a) - taikiDays(b)) : a.kind === '待機中' ? -1 : 1));

export default function TaikiPage() {
  const canEdit = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const [rows, setRows] = useState<Row[]>(() => TAIKI.map((t) => ({ ...t, next: candidatesOf(t)[0]?.c.no ?? '' })));
  const [filter, setFilter] = useState<Filter>('すべて');
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => { const f = new URLSearchParams(window.location.search).get('kind'); if (f === 'soon') setFilter('もうすぐ待機'); else if (f === 'now') setFilter('待機中'); }, []);

  const open = rows.filter((r) => r.state !== '参画決定');
  const shown = sortRows(open.filter((r) => filter === 'すべて' || r.kind === filter));
  const decided = rows.filter((r) => r.state === '参画決定');

  const change = (r: Row, patch: Partial<Row>, text: string, sub: string) => {
    // 取り消しは「この行の、この回に変えた項目」だけを戻す（ほかの行・あとの変更を巻き込まない）
    const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, r[k as keyof Row]])) as Partial<Row>;
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
    setFlash(r.id); setTimeout(() => setFlash(null), 1300);
    hit();
    toast({ text, sub, undo: () => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, ...prev } : x))) });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="待機・再アサイン" sub="待機中と、契約終了が近い人。次の案件・担当営業・状態を選んで進めます・見本データ" />

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={open.length} total={rows.length} />
        <div className="text-[13px]"><b>次が決まっていない人 {open.length}人</b>
          <span className="ml-2 text-muted">待機30日以上 {open.filter((r) => r.kind === '待機中' && taikiDays(r) >= 30).length}人・案件を探す {open.filter((r) => r.state === '案件を探す').length}人</span>
          {!canEdit && <div className="text-[12px] text-bad">{needText('edit')}</div>}
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {(['すべて', '待機中', 'もうすぐ待機'] as Filter[]).map((k) => (
            <button key={k} onClick={() => setFilter(k)} className={`min-h-8 whitespace-nowrap rounded-full border px-3 text-[12.5px] ${filter === k ? 'font-semibold' : 'text-muted'}`} style={filter === k ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>
              {k} {k === 'すべて' ? open.length : open.filter((r) => r.kind === k).length}
            </button>
          ))}
        </div>
      </div>

      {open.length === 0 && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-10 text-center">
          <Check className="mx-auto text-ok" size={26} /><div className="mt-2 text-[15px] font-bold">待機の人は、全員つぎの現場が決まりました</div>
          <div className="mt-1 text-[12.5px] text-muted">今日は {decided.length}人 が参画決定。契約終了が近づいた人が出たら、ここにまた並びます。</div>
        </div>
      )}

      {open.length > 0 && shown.length === 0 && (
        <div className="rounded-xl border border-line bg-surface px-6 py-8 text-center text-[13px] text-muted">「{filter}」の人はいま居ません。<button onClick={() => setFilter('すべて')} className="ml-1 font-semibold underline">すべてを見る</button></div>
      )}

      {shown.length > 0 && (
        <div className="mo-fade-up overflow-x-auto rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
          <table className="w-full min-w-[980px] border-collapse text-[13px]">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">待機の日数</th><th className="px-2 py-2.5 font-semibold">次の案件の候補</th><th className="px-2 py-2.5 font-semibold">担当営業（成約者）</th><th className="px-2 py-2.5 font-semibold">採用担当</th><th className="px-4 py-2.5 font-semibold">状態</th>
            </tr></thead>
            <tbody>
              {shown.map((r, i) => {
                const d = taikiDays(r); const tone = daysTone(r); const cands = candidatesOf(r);
                return (
                  <tr key={r.id} className={`mo-fade-in border-t border-line-soft align-top ${flash === r.id ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                    <td className="px-4 py-2.5">
                      <Link href={`/jinji/staff/${r.id}`} className="font-semibold hover:underline">{r.name}</Link>
                      <div className="flex items-center gap-1 text-[11.5px] text-faint"><MapPin size={11} />{r.station}・{r.want}・希望 {r.price}万〜</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="chip whitespace-nowrap" style={{ background: `var(--tone-${tone}-bg)`, color: `var(--tone-${tone}-fg)` }}><Hourglass size={11} />{r.kind === '待機中' ? `待機 ${d}日目` : `あと${d}日で待機`}</span>
                      <div className="mt-0.5 text-[11.5px] text-faint">{r.kind === '待機中' ? `${r.since!.slice(5).replace('-', '/')} から` : `${r.site}・${r.contractEnd!.slice(5).replace('-', '/')} 契約終了`}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <select aria-label={`${r.name} の次の案件`} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} value={r.next} onChange={(e) => { const c = STOCK.find((x) => x.no === e.target.value); change(r, { next: e.target.value }, `${r.name} の次の候補を「${c?.name}」にしました`, '→ 案件の「合いそうな要員」でこの人を上に出します'); }} className="min-h-9 max-w-[230px] rounded-[10px] border border-field bg-surface px-2 text-[12.5px] disabled:opacity-50">
                        {cands.map(({ c, score, min }) => <option key={c.no} value={c.no}>{c.name}（{score}点・約{min}分）</option>)}
                      </select>
                      {r.next && <Link href={`/eigyo/cases?case=${r.next}`} className="mt-0.5 block text-[11.5px] font-semibold" style={{ color: 'var(--ad)' }}>案件を開いて送る</Link>}
                    </td>
                    <td className="px-2 py-2.5">
                      <select aria-label={`${r.name} の担当営業`} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} value={r.sales} onChange={(e) => change(r, { sales: e.target.value }, `${r.name} の担当営業を ${e.target.value} にしました`, '→ 要員リストの担当営業と、売上・粗利の営業別に反映しました')} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-[12.5px] disabled:opacity-50">
                        {SALES_REPS.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2.5 text-[12.5px] text-muted">{r.recruiter}<div className="text-[11px] text-faint">営業の担当ではない</div></td>
                    <td className="px-4 py-2.5">
                      <select aria-label={`${r.name} の状態`} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} value={r.state} onChange={(e) => { const s = e.target.value as TaikiState; change(r, { state: s }, `${r.name} を「${s}」にしました`, STATE_SUB[s]); }} className="min-h-9 rounded-[10px] border px-2 text-[12.5px] font-semibold disabled:opacity-50" style={{ background: STATE_STYLE[r.state].bg, color: STATE_STYLE[r.state].fg, borderColor: 'var(--color-field)' }}>
                        {TAIKI_STATES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {decided.length > 0 && (
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <div className="text-[12px] font-semibold text-muted">今日 参画決定にした人</div>
          <ul className="mt-2 flex flex-col gap-1 text-[12.5px]">
            {decided.map((r) => (
              <li key={r.id} className="flex items-center gap-2"><span className="text-ok">参画決定</span><span>{r.name} → {STOCK.find((c) => c.no === r.next)?.name ?? '—'}（担当営業 {r.sales}）</span>
                <button disabled={!canEdit} title={!canEdit ? needText('edit') : '面談調整中に戻して、一覧に出し直します'} onClick={() => change(r, { state: '面談調整中' }, `${r.name} を「面談調整中」に戻しました`, '→ 待機の一覧に戻しました')} className="ml-auto shrink-0 text-[12px] text-muted underline disabled:opacity-40">戻す</button></li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11.5px] text-faint">待機の日数は待機に入った日から、もうすぐ待機は契約終了日までを数えています。通勤は目安です（<Link href="/eigyo/map" className="font-semibold" style={{ color: 'var(--ad)' }}>案件・要員マップ</Link>）。</p>
    </main>
  );
}
