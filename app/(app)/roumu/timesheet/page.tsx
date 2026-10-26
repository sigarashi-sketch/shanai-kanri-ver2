'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, RefreshCw, Send } from 'lucide-react';
import type { TsRow, TsState } from '@/lib/types/roumu';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { LiveBanner, useIke } from '@/components/Live';
import { MARK_CHOICES, nnOf, setMark, useMarks, type IkeShimeUnread } from '@/lib/live/roumu';
import type { IkeShimeBoard } from '@/lib/live/shime';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { postLive } from '@/lib/live/post';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { tsFromIke, type IkeTimesheet } from '@/lib/live/timesheet';
import { PersonName } from '@/components/Person';

// 勤務表の届き具合（労務/営業管理）＝現場の勤務表（客先の様式）の今月分が届いたかを、取引先ごと・人ごとに見る。
//   ・届いた／未着／読めない。未着は本人・取引先にお願い（あおい）、読めないは「どうしたか」を選ぶ
//   ・届いた勤務表は毎晩読み、日ごとの時間を freee の打刻と比べる（1日30分未満のずれは数えない）
//   ・?view=person で人ごとの表から開く
type View = 'partner' | 'person';
const ST: Record<TsState | 'お願い済み', { bg: string; fg: string }> = {
  届いた: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)' },
  未着: { bg: 'var(--tone-bad-bg)', fg: 'var(--tone-bad-fg)' },
  読めない: { bg: 'var(--tone-warn-bg)', fg: 'var(--tone-warn-fg)' },
  お願い済み: { bg: 'var(--tone-info-bg)', fg: 'var(--tone-info-fg)' },
};
const isOpen = (r: TsRow, asked: (r: TsRow) => boolean) => (r.state === '未着' && !asked(r)) || r.state === '読めない';
const REASK = '取引先に読める形で出し直しをお願いした';

export default function TimesheetPage() {
  const canEdit = usePerms().can('roumu', 'edit');
  const { hit, toast } = useMotivation();
  const [view, setView] = useState<View>('partner');
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('view') === 'person') setView('person'); }, []);
  const [ym, setYm] = useState('');
  const ike = useIke<IkeTimesheet>(`roster?op=timesheet&action=list${ym ? `&ym=${ym}` : ''}`);
  const live = ike.live && !!ike.data?.ok;
  // 本物は未経験の人だけ（今のプロパーリストに入っている人）。提出不要の件数も絞った人で数え直す
  const mk = useMikeiken();
  const tsItems = live && ike.data ? mk.keep(ike.data.items || [], 'name') : [];
  const L = live && ike.data ? tsFromIke({ ...ike.data, items: tsItems, counts: { ...ike.data.counts, na: tsItems.filter((r) => r.arrival === 'na').length } }) : null;
  // 本物（10-26）：「読めない」と freee との差は勤怠の締めの突き合わせ（shime:board／unread）から。読めないをどうしたか・お願いした は印（roumu_marks）
  const tym = ike.data?.ym || '';
  const board = useIke<IkeShimeBoard>(live && tym ? 'roster?op=shime&action=board' : null);
  const unread = useIke<IkeShimeUnread>(live && tym ? `roster?op=shime&action=unread&ym=${tym}` : null);
  const tm = useMarks(['ts-read', 'ts-ask'], tym, live && !!tym);
  const cellOf = new Map((board.data?.ok ? board.data.rows : []).map((r) => [r.key, r.cells[tym]]));
  const whyOf = new Map((unread.data?.ok ? unread.data.rows : []).map((r) => [r.key, r.why]));
  const mkey = (r: TsRow) => `${tym}|${nnOf(r.name)}`;
  const all: TsRow[] = L ? L.rows.map((r) => {
    const c = cellOf.get(nnOf(r.name));
    const fix = tm.get('ts-read', mkey(r))?.value;
    let x: TsRow = r;
    if (c && c.sheetMins != null) x = { ...x, sheetH: Math.round(c.sheetMins / 6) / 10, freeeH: Math.round(c.freeeMins / 6) / 10, offDays: c.diffDays };
    if (c?.status === 'unread' && r.state === '届いた') x = fix ? { ...x, unreadable: fix, state: fix === REASK ? '未着' : '届いた' } : { ...x, state: '読めない', unreadable: whyOf.get(nnOf(r.name)) || '読み取り待ち' };
    return x;
  }) : [];
  const askedOf = (r: TsRow) => !!tm.get('ts-ask', mkey(r)) || tm.get('ts-read', mkey(r))?.value === REASK;
  const [werr, setWerr] = useState('');
  const okEdit = canEdit;
  // 本物で「お願い（あおい）」を送る口は今の社内システムに無い（勤務表の口は 一覧・元メールを読む・取り直す だけ）＝押せない
  const block = !canEdit ? needText('edit') : undefined;
  // ミンミカからいま取り直す（10-25）：今の POST roster?op=timesheet&action=refresh。メールは送らない
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const askRefresh = () => setConfirm({
    title: 'ミンミカから勤務表の届き具合を取り直す', okLabel: '取り直す',
    lines: ['直近3か月の届き具合と、直近2日ぶんの元メールをミンミカから読み直します（1分ほどかかることがあります）', 'ふだんは1時間ごとに自動で取り込んでいます。メールは送りません'],
    run: async () => { await postLive('/api/live/timesheet', { action: 'refresh' }); hit(); toast({ text: 'ミンミカから取り直しました', sub: '→ 一覧を読み直しました' }); ike.reload(); },
  });
  const missingOf = (name: string) => all.filter((r) => r.partner === name && r.state !== '届いた').length;

  const open = all.filter((r) => isOpen(r, askedOf));
  const initial = open.length;
  const partners = [...new Set(all.map((r) => r.partner))].map((name) => ({ name, rs: all.filter((r) => r.partner === name) }))
    .sort((a, b) => missingOf(b.name) - missingOf(a.name) || a.name.localeCompare(b.name, 'ja'));
  const pulse = (id: string) => { setFlash(id); setTimeout(() => setFlash(null), 1300); };

  const ask = (rs: TsRow[]) => {
    if (!live) return;
    // 本物は「お願いした」の印だけ（勤務表のお願いを送る口は今のシステムに無い＝連絡はチャット・電話で）
    setWerr('');
    Promise.all(rs.map((r) => setMark('ts-ask', mkey(r), 'お願いした', { nn: nnOf(r.name), ym: tym })))
      .then(() => { hit(rs.length); tm.reload(); toast({ text: rs.length > 1 ? `${rs.length}人ぶんに「お願いした」の印を付けました` : `${rs[0].name} に「お願いした」の印を付けました`, sub: '→ 連絡そのものはチャット・電話で（ここからは送りません）', undo: () => { Promise.all(rs.map((r) => setMark('ts-ask', mkey(r), ''))).then(() => tm.reload()).catch((e) => setWerr((e as Error).message)); } }); })
      .catch((e) => setWerr((e as Error).message));
  };
  const resolve = (r: TsRow, how: string) => {
    if (!live) return;
    setWerr('');
    setMark('ts-read', mkey(r), how, { nn: nnOf(r.name), ym: tym })
      .then(() => { pulse(r.id); hit(); tm.reload(); toast({ text: `${r.name} の勤務表を「${how}」にしました`, sub: '→ 今の社内システムに残しました（締めるのは勤怠の締めの画面で）', undo: () => { setMark('ts-read', mkey(r), '').then(() => tm.reload()).catch((e) => setWerr((e as Error).message)); } }); })
      .catch((e) => setWerr(`${r.name}：${(e as Error).message}`));
  };

  const diff = (r: TsRow) => {
    if (r.sheetH == null || r.freeeH == null) return <span className="text-sm text-faint">{r.state === '届いた' ? '手で確かめた' : '—'}</span>;
    const d = Math.round((r.freeeH - r.sheetH) * 10) / 10;
    const off = r.offDays ?? 0;
    const big = off >= 3;
    return <div className="text-sm"><span className="num whitespace-nowrap">勤務表 {r.sheetH}h／freee {r.freeeH}h</span>
      <div className={big ? 'font-semibold text-warn' : off ? 'text-muted' : 'text-ok'}>{off ? `差 ${d > 0 ? '+' : ''}${d}h・30分以上ずれた日 ${off}日${big ? '' : '（少ないので様子見）'}` : '合っている（ずれは丸めの内）'}</div></div>;
  };
  const action = (r: TsRow) => {
    if (r.state === '未着') return askedOf(r) ? <span className="chip" style={{ background: ST['お願い済み'].bg, color: ST['お願い済み'].fg }}>お願い済み</span>
      : <button onClick={() => ask([r])} disabled={!okEdit} title={block} className="btn-secondary btn-sm">お願いした</button>;
    if (r.state === '読めない') return <select aria-label="どうしたか" value="" disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} onChange={(e) => e.target.value && resolve(r, e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-1.5 text-sm disabled:opacity-40"><option value="">どうしたか選ぶ</option>{MARK_CHOICES['ts-read'].map((x) => <option key={x}>{x}</option>)}</select>;
    return <span className="text-sm text-faint">{r.arrivedAt} 着</span>;
  };
  // 部品にせず関数で描く（描くたびに行が作り直されて選択中の欄が閉じないように）
  const row = (r: TsRow, showPartner?: boolean) => (
    <tr key={r.id} className={`border-t border-line-soft align-top ${flash === r.id ? 'mo-flash' : 'row'}`}>
      <td className="px-4 py-2.5"><PersonName name={r.name} className="font-semibold underline-offset-2 hover:underline" /><div className="text-xs text-faint">{r.site}</div></td>
      {showPartner && <td className="px-2 py-2.5 text-sm">{r.partner}</td>}
      <td className="px-2 py-2.5 text-sm text-muted">{r.route}</td>
      <td className="px-2 py-2.5"><span className="chip" style={{ background: ST[r.state].bg, color: ST[r.state].fg }}>{r.state}</span>{r.state !== '届いた' && r.unreadable && <div className="mt-1 text-xs text-muted">{r.unreadable}</div>}</td>
      <td className="px-2 py-2.5">{diff(r)}</td>
      <td className="px-4 py-2.5">{action(r)}</td>
    </tr>
  );
  const head = (showPartner?: boolean) => <thead><tr className="th-row text-left"><th className="px-4 py-2 font-semibold">社員</th>{showPartner && <th className="px-2 py-2 font-semibold">取引先</th>}<th className="px-2 py-2 font-semibold">届く道すじ</th><th className="px-2 py-2 font-semibold">今月分</th><th className="px-2 py-2 font-semibold">freee の打刻との差</th><th className="px-4 py-2 font-semibold" /></tr></thead>;
  const waitingAsk = all.filter((r) => r.state === '未着' && !askedOf(r));

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="勤務表の届き具合" sub={L ? `現場の勤務表（客先の様式）の${L.label}・ミンミカの稼働契約ごと（提出不要の ${L.na}件は外しています）${L.synced ? `・${L.synced} にミンミカから取り込み` : ''}` : '現場の勤務表（客先の様式）・ミンミカの稼働契約ごと'}>
        {live && (
          <select aria-label="月" value={ike.data?.ym || ''} onChange={(e) => setYm(e.target.value)} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-body">
            {(ike.data?.months || []).map((m) => <option key={m} value={m}>{Number(m.slice(5))}月分</option>)}
          </select>
        )}
        <div className="flex rounded-[10px] border border-field bg-surface p-0.5 text-sm font-semibold">
          {([['partner', '取引先ごと'], ['person', '人ごと']] as const).map(([k, l]) => <button key={k} onClick={() => setView(k)} className={`min-h-8 rounded-lg px-3 ${view === k ? 'text-white' : 'text-muted'}`} style={view === k ? { background: 'var(--a)', color: 'var(--ao)' } : undefined}>{l}</button>)}
        </div>
      </PageTitle>
      <LiveBanner state={ike.live && !ike.data?.ok ? 'error' : ike.state} error={ike.error || ike.data?.error} onReload={ike.reload} note="「ミンミカから取り直す」・読めない勤務表をどうしたか・お願いした の印は本物に書きます。お願いの連絡そのものは送りません（チャット・電話で）。読めない／freee との差は勤怠の締めと同じ突き合わせです" />
      {werr && <div className="rounded-xl px-4 py-2.5 text-sm" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>{werr}</div>}
      <MikeikenNote mk={mk} live={live} />
      {live && board.state === 'error' && <div className="text-sm text-muted">読めない・freee との差は読めませんでした（{board.error}）</div>}

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={open.length} total={initial} />
        <div className="text-body"><b>手を打つ勤務表 残り {open.length}件</b>
          <span className="ml-2 text-muted">届いた {all.filter((r) => r.state === '届いた').length}・未着 {all.filter((r) => r.state === '未着').length}（お願い済み {all.filter((r) => r.state === '未着' && askedOf(r)).length}）・読めない {all.filter((r) => r.state === '読めない').length}</span>
          {!canEdit && <div className="text-sm text-bad">{needText('edit')}</div>}
        </div>
        <button onClick={() => waitingAsk.length && ask(waitingAsk)} disabled={!okEdit || !live || waitingAsk.length === 0} title={block} className="btn-primary ml-auto"><Send size={15} />未着 {waitingAsk.length}人に「お願いした」の印</button>
        {live && <button onClick={askRefresh} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} className="btn-secondary"><RefreshCw size={14} />ミンミカから取り直す</button>}
        <Link href="/roumu/shime" className="text-sm font-semibold" style={{ color: 'var(--ad)' }}>勤怠の締めへ</Link>
      </div>

      {!live && <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-body text-muted">{ike.state === 'loading' ? '読み込み中…' : '読めませんでした'}</div>}
      {live && open.length === 0 && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-8 text-center">
          <Check className="mx-auto text-ok" size={26} />
          <div className="mt-2 text-md font-bold">今月の勤務表は、手を打つものがなくなりました</div>
          <div className="mt-1 text-sm text-muted">お願いした分が届いたら、毎晩の読み取りで freee との差が出ます。</div>
        </div>
      )}

      {view === 'partner' ? partners.map((p, i) => (
        <section key={p.name} className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: i + 2 }}>
          <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5"><b className="text-body">{p.name}</b><span className="text-sm text-muted">{p.rs.filter((r) => r.state === '届いた').length} / {p.rs.length}人 届いた</span></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-body">{head()}<tbody>{p.rs.map((r) => row(r))}</tbody></table></div>
        </section>
      )) : (
        <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
          <div className="overflow-x-auto"><table className="w-full min-w-[860px] border-collapse text-body">{head(true)}<tbody>{[...all].sort((a, b) => Number(b.state !== '届いた') - Number(a.state !== '届いた')).map((r) => row(r, true))}</tbody></table></div>
        </div>
      )}
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
      <p className="text-xs text-faint">取引先の「送付不要」は、こちらから上位に送らなくてよいという意味で、届かない理由にはしていません。勤務表は届いたものを毎晩読み、1日30分未満のずれは合っている扱いにしています。</p>
    </main>
  );
}
