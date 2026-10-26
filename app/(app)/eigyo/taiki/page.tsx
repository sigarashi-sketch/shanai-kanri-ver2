'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Hourglass, MapPin } from 'lucide-react';
import { SALES_REPS, TAIKI, TAIKI_STATES, taikiDays, type Taiki, type TaikiState } from '@/lib/taiki-sample';
import { STOCK, matchOf, ngReason } from '@/lib/cases-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { LiveBanner, useIke } from '@/components/Live';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { postLive } from '@/lib/live/post';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { liveTaiki, type RosterStatus } from '@/lib/live/taiki';
import { liveStock } from '@/lib/live/cases';
import { normName, ymdJst, type EngineerRows, type ProgressData } from '@/lib/live/eigyo-common';
import { PersonName } from '@/components/Person';

// 待機・再アサイン（営業）。待機中の人と、契約終了が近い「もうすぐ待機」の人を、日数つきで並べる。
//   ・次の案件の候補・担当営業・状態を選ぶだけで変える。参画決定になったら一覧から片づく
//   ・担当営業＝ミンミカの成約者。営業リストの「担当」は採用担当なので、別の列に分けて出す（混ぜない）
//   本物（ログイン中）：待機＝今の /api/proxy?action=getRosterStatus の待機チェック・待機の予約、最寄駅など＝getEngineerRows、
//     次の候補＝getProgressData の案件。状態・次の候補の保存＝/api/roster?op=eigyo&action=taiki（10-26 足した taiki_board）
//     担当営業（成約者）＝ミンミカの稼働契約の成約者（mnm_seiyakusha）。無ければ成約日報の人月担当。画面からは変えない（ミンミカが正）
//     「参画決定」にすると、確認のうえプロパーリストの「参画決定」にも付ける（今のプロパーリストのチェックと同じ口）
type TaikiBoard = { ok: boolean; error?: string; board: { nn: string; name: string; personId: string; state: TaikiState; nextCase: string; by: string; at: string }[]; sales: Record<string, { name: string; from: 'mnm' | 'nippo' }> };
type Row = Taiki & { next: string; salesFrom?: 'mnm' | 'nippo' };
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
const candidatesFrom = (stock: typeof STOCK, ng: (c: (typeof STOCK)[number]) => string | null) => (t: Taiki) => stock.filter((c) => !ng(c)).map((c) => ({ c, ...matchOf(c, t) })).sort((a, b) => b.score - a.score).slice(0, 3);
const candidatesOf = candidatesFrom(STOCK, ngReason);
// 長く待機している人 → 契約終了が近い人 の順
const sortRows = (rs: Row[], today?: string) => [...rs].sort((a, b) => (a.kind === b.kind ? (a.kind === '待機中' ? taikiDays(b, today) - taikiDays(a, today) || a.name.localeCompare(b.name, 'ja') : taikiDays(a, today) - taikiDays(b, today)) : a.kind === '待機中' ? -1 : 1));

export default function TaikiPage() {
  const perm = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const rs = useIke<RosterStatus[]>('proxy?action=getRosterStatus');
  const live = rs.live;
  const er = useIke<EngineerRows>(live ? 'roster?action=getEngineerRows&area=main' : null);
  const pd = useIke<ProgressData>(live ? 'proxy?action=getProgressData' : null);
  const today = live ? ymdJst(Date.now()) : undefined;
  const lstock = useMemo(() => liveStock(pd.data), [pd.data]);
  const candOf = live ? candidatesFrom(lstock, (c) => (c as { ng?: string | null }).ng ?? null) : candidatesOf;
  // 本物は未経験の人だけ（今のプロパーリストに入っている人）
  const mk = useMikeiken();
  const tb = useIke<TaikiBoard>(live ? 'roster?op=eigyo&action=taiki' : null);
  const [over, setOver] = useState<Record<string, Partial<Row>>>({});   // 保存した直後の値（読み直しを待たない）
  const lrows = useMemo<Row[]>(() => {
    const cf = candidatesFrom(lstock, (c) => (c as { ng?: string | null }).ng ?? null);
    const board = new Map((tb.data?.ok ? tb.data.board : []).map((b) => [b.nn, b]));
    const sales = tb.data?.ok ? tb.data.sales : {};
    return mk.keep(liveTaiki(rs.data, er.data), 'name').map((t) => {
      const nn = normName(t.name), b = board.get(nn), sl = sales[nn];
      const row: Row = { ...t, next: b?.nextCase || cf(t)[0]?.c.no || '', state: b?.state ?? '案件を探す', sales: sl?.name || '不明', salesFrom: sl?.from };
      return { ...row, ...over[t.id] };
    });
  }, [rs.data, er.data, lstock, mk, tb.data, over]);
  const canEdit = perm && (!live || tb.data?.ok === true);
  const noEdit = live && tb.data && !tb.data.ok ? tb.data.error || '状態の置き場が読めません' : needText('edit');
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [rowsS, setRows] = useState<Row[]>(() => TAIKI.map((t) => ({ ...t, next: candidatesOf(t)[0]?.c.no ?? '' })));
  const rows = live ? lrows : rowsS;
  const STOCKS = live ? lstock : STOCK;
  const [filter, setFilter] = useState<Filter>('すべて');
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => { const f = new URLSearchParams(window.location.search).get('kind'); if (f === 'soon') setFilter('もうすぐ待機'); else if (f === 'now') setFilter('待機中'); }, []);

  const open = rows.filter((r) => r.state !== '参画決定');
  const shown = sortRows(open.filter((r) => filter === 'すべて' || r.kind === filter), today);
  const decided = rows.filter((r) => r.state === '参画決定');

  const change = (r: Row, patch: Partial<Row>, text: string, sub: string) => {
    // 取り消しは「この行の、この回に変えた項目」だけを戻す（ほかの行・あとの変更を巻き込まない）
    const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, r[k as keyof Row]])) as Partial<Row>;
    if (live) {
      const body = (p: Partial<Row>) => ({ action: 'taikiSave', name: r.name, ...(p.state !== undefined ? { state: p.state } : {}), ...(p.next !== undefined ? { nextCase: p.next } : {}) });
      const save = async () => {
        await postLive('/api/live/eigyo', body(patch));
        setOver((o) => ({ ...o, [r.id]: { ...o[r.id], ...patch } }));
        setFlash(r.id); setTimeout(() => setFlash(null), 1300);
        hit();
        toast({ text, sub, undo: () => { postLive('/api/live/eigyo', body(prev)).then(() => { setOver((o) => ({ ...o, [r.id]: { ...o[r.id], ...prev } })); tb.reload(); }).catch((e) => toast({ text: '取り消せませんでした', sub: (e as Error).message })); } });
        tb.reload();
      };
      if (patch.state === '参画決定') {
        // プロパーリストの「参画決定」にも付ける（成約日報の「今日の参画決定」に出る）。付けられなくても状態の保存は残す
        setConfirm({
          title: `${r.name} を「参画決定」にします`, okLabel: '参画決定にする',
          lines: ['待機の一覧から外します', 'プロパーリストの「参画決定」にもチェックを入れます（成約日報の「今日の参画決定」に出ます）'],
          run: async () => {
            await save();
            await postLive('/api/live/eigyo', { action: 'kettei', name: r.name, value: true }).catch((e) => toast({ text: 'プロパーリストの参画決定は付けられませんでした', sub: (e as Error).message }));
          },
        });
        return;
      }
      save().catch((e) => toast({ text: '保存できませんでした', sub: (e as Error).message }));
      return;
    }
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
    setFlash(r.id); setTimeout(() => setFlash(null), 1300);
    hit();
    toast({ text, sub, undo: () => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, ...prev } : x))) });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="待機・再アサイン" sub={`待機中と、契約終了が近い人。次の案件・担当営業・状態を選んで進めます${live ? '' : '・見本データ'}`} />
      <LiveBanner state={rs.state} error={rs.error} onReload={() => { rs.reload(); tb.reload(); }} note={`今の従業員名簿の「待機」チェックと「待機の予約」。担当営業はミンミカの成約者（無ければ成約日報の人月担当）。状態・次の候補はここで保存します（待機に入った日は記録がありません）${tb.data && !tb.data.ok ? `・${tb.data.error || '状態が読めませんでした'}` : ''}`} />
      <MikeikenNote mk={mk} live={live} />

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={open.length} total={rows.length} />
        <div className="text-body"><b>次が決まっていない人 {open.length}人</b>
          <span className="ml-2 text-muted">{live ? `待機中 ${open.filter((r) => r.kind === '待機中').length}人・待機の予約 ${open.filter((r) => r.kind === 'もうすぐ待機').length}人` : `待機30日以上 ${open.filter((r) => r.kind === '待機中' && taikiDays(r) >= 30).length}人・案件を探す ${open.filter((r) => r.state === '案件を探す').length}人`}</span>
          {!canEdit && <div className="text-sm text-bad">{noEdit}</div>}
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {(['すべて', '待機中', 'もうすぐ待機'] as Filter[]).map((k) => (
            <button key={k} onClick={() => setFilter(k)} className={`min-h-8 whitespace-nowrap rounded-full border px-3 text-sm ${filter === k ? 'font-semibold' : 'text-muted'}`} style={filter === k ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>
              {k} {k === 'すべて' ? open.length : open.filter((r) => r.kind === k).length}
            </button>
          ))}
        </div>
      </div>

      {open.length === 0 && !(live && rs.state === 'loading') && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-10 text-center">
          <Check className="mx-auto text-ok" size={26} /><div className="mt-2 text-md font-bold">待機の人は、全員つぎの現場が決まりました</div>
          <div className="mt-1 text-sm text-muted">今日は {decided.length}人 が参画決定。契約終了が近づいた人が出たら、ここにまた並びます。</div>
        </div>
      )}

      {open.length > 0 && shown.length === 0 && (
        <div className="rounded-xl border border-line bg-surface px-6 py-8 text-center text-body text-muted">「{filter}」の人はいま居ません。<button onClick={() => setFilter('すべて')} className="ml-1 font-semibold underline">すべてを見る</button></div>
      )}

      {shown.length > 0 && (
        <div className="mo-fade-up overflow-x-auto rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
          <table className="w-full min-w-[980px] border-collapse text-body">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">待機の日数</th><th className="px-2 py-2.5 font-semibold">次の案件の候補</th><th className="px-2 py-2.5 font-semibold">担当営業（成約者）</th><th className="px-2 py-2.5 font-semibold">採用担当</th><th className="px-4 py-2.5 font-semibold">状態</th>
            </tr></thead>
            <tbody>
              {shown.map((r, i) => {
                const d = taikiDays(r, today); const tone = d < 0 ? 'mute' : daysTone(r); const cands = candOf(r);
                return (
                  <tr key={r.id} className={`mo-fade-in border-t border-line-soft align-top ${flash === r.id ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                    <td className="px-4 py-2.5">
                      <Link href={live ? `/eigyo/proper/${r.id}` : `/jinji/staff/${r.id}`} className="font-semibold hover:underline">{r.name}</Link>
                      <div className="flex items-center gap-1 text-xs text-faint"><MapPin size={11} />{r.station}・{r.want}{r.price ? `・希望 ${r.price}万〜` : ''}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="chip whitespace-nowrap" style={{ background: `var(--tone-${tone}-bg)`, color: `var(--tone-${tone}-fg)` }}><Hourglass size={11} />{d < 0 ? '待機中' : r.kind === '待機中' ? `待機 ${d}日目` : `あと${d}日で待機`}</span>
                      <div className="mt-0.5 text-xs text-faint">{r.kind === '待機中' ? (r.since ? `${r.since.slice(5).replace('-', '/')} から` : '入った日は記録なし') : live ? `${r.contractEnd?.slice(5).replace('-', '/')} に待機へ（予約）` : `${r.site}・${r.contractEnd!.slice(5).replace('-', '/')} 契約終了`}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <select aria-label={`${r.name} の次の案件`} disabled={!canEdit} title={!canEdit ? noEdit : undefined} value={r.next} onChange={(e) => { const c = STOCKS.find((x) => x.no === e.target.value); change(r, { next: e.target.value }, `${r.name} の次の候補を「${c?.name}」にしました`, '→ 案件の「合いそうな要員」でこの人を上に出します'); }} className="min-h-9 max-w-[230px] rounded-[10px] border border-field bg-surface px-2 text-sm disabled:opacity-50">
                        {cands.length === 0 && !r.next && <option value="">候補なし</option>}
                        {r.next && !cands.some(({ c }) => c.no === r.next) && <option value={r.next}>{STOCKS.find((x) => x.no === r.next)?.name ?? r.next}（保存した候補）</option>}
                        {cands.map(({ c, score, min }) => <option key={c.no} value={c.no}>{c.name}（{score}点・約{min}分）</option>)}
                      </select>
                      {r.next && <Link href={`/eigyo/cases?case=${r.next}`} className="mt-0.5 block text-xs font-semibold" style={{ color: 'var(--ad)' }}>案件を開いて送る</Link>}
                    </td>
                    <td className="px-2 py-2.5">
                      {live ? <span className={r.sales === '不明' ? 'text-faint' : ''} title={r.salesFrom === 'mnm' ? 'ミンミカの稼働契約の成約者' : r.salesFrom === 'nippo' ? '成約日報の人月担当' : 'ミンミカに成約者が無い（4月の一括移行など）'}>{r.sales}<span className="block text-xs text-faint">{r.salesFrom === 'mnm' ? 'ミンミカの成約者' : r.salesFrom === 'nippo' ? '成約日報' : ''}</span></span> :
                      <select aria-label={`${r.name} の担当営業`} disabled={!canEdit} title={!canEdit ? noEdit : undefined} value={r.sales} onChange={(e) => change(r, { sales: e.target.value }, `${r.name} の担当営業を ${e.target.value} にしました`, '→ 要員リストの担当営業と、売上・粗利の営業別に反映しました')} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-sm disabled:opacity-50">
                        {SALES_REPS.map((s) => <option key={s}>{s}</option>)}
                      </select>}
                    </td>
                    <td className="px-2 py-2.5 text-sm text-muted">{r.recruiter}<div className="text-xs text-faint">営業の担当ではない</div></td>
                    <td className="px-4 py-2.5">
                      <select aria-label={`${r.name} の状態`} disabled={!canEdit} title={!canEdit ? noEdit : undefined} value={r.state} onChange={(e) => { const s = e.target.value as TaikiState; change(r, { state: s }, `${r.name} を「${s}」にしました`, STATE_SUB[s]); }} className="min-h-9 rounded-[10px] border px-2 text-sm font-semibold disabled:opacity-50" style={{ background: STATE_STYLE[r.state].bg, color: STATE_STYLE[r.state].fg, borderColor: 'var(--color-field)' }}>
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
          <div className="text-sm font-semibold text-muted">{live ? '参画決定にした人（待機のチェックが外れるまで出ます）' : '今日 参画決定にした人'}</div>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {decided.map((r) => (
              <li key={r.id} className="flex items-center gap-2"><span className="text-ok">参画決定</span><span><PersonName name={r.name} className="underline-offset-2 hover:underline" /> → {STOCKS.find((c) => c.no === r.next)?.name ?? '—'}（担当営業 {r.sales}）</span>
                <button disabled={!canEdit} title={!canEdit ? noEdit : '面談調整中に戻して、一覧に出し直します'} onClick={() => change(r, { state: '面談調整中' }, `${r.name} を「面談調整中」に戻しました`, '→ 待機の一覧に戻しました')} className="ml-auto shrink-0 text-sm text-muted underline disabled:opacity-40">戻す</button></li>
            ))}
          </ul>
        </div>
      )}
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
      <p className="text-xs text-faint">待機の日数は待機に入った日から、もうすぐ待機は契約終了日までを数えています。通勤は目安です（<Link href="/eigyo/map" className="font-semibold" style={{ color: 'var(--ad)' }}>案件・要員マップ</Link>）。</p>
    </main>
  );
}
