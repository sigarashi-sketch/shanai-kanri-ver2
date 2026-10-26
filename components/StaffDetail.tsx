'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PersonBasic } from './PersonBasic';
import { PersonChat } from './PersonChat';
import { PersonMemo } from './PersonMemo';
import { Fragment, useEffect, useState } from 'react';
import { MODULES } from '@/lib/theme';
import { Pill } from '@/components/ui';
import { LiveBanner } from '@/components/Live';
import { jinjiPostRead, type JHistory } from '@/lib/live/jinji';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { slashDate, staffIdMatches, type LiveStaff, type LiveStaffList } from '@/lib/live/staff';
import { CAN_ALL, logView, memoOf, type LivePersonView, type PersonCan } from '@/lib/live/person';
import { normName } from '@/lib/live/staff';
import type { LiveStaffListX } from '@/lib/live/staff-extra';
import { PersonActions, StaffOps } from '@/components/jinji/StaffOps';
import { TaiouLog } from '@/components/jinji/TaiouLog';

// チャットは一番右のタブ（10-25 shoya「名前押したらチャットは右タブに」）。基本情報＝フォームの回答・面談メモ＝要員リストのメモ（どれも読むだけ）
// 名簿の入力・対応歴＝今の従業員名簿でできた入力（退社・待機・予約・日付・駅・採用担当・LINEグループ・対応歴）を書く（10-25）
const TABS = ['基本情報', '現場の履歴', '勤怠', '請求', '書類', '面談メモ', '名簿の入力', '対応歴', 'チャット'] as const;
type Tab = (typeof TABS)[number];

/** 名前の小窓が /api/live/person で読んだ分。渡されたら /api/live/staff・/api/live/person を読み直さない（10-25） */
export type StaffInitial = { staff: LiveStaff; proper: LivePersonView | null; month: string; everyone: string[]; can: PersonCan };

/** 社員ページの中身。ページ（/jinji/staff/[id]）と名前の小窓（embedded＝上のパンくずを出さない）で使う */
export function StaffDetail({ id, embedded = false, initial }: { id: string; embedded?: boolean; initial?: StaffInitial }) {
  // 今の名簿の人だけ（見本の人は出さない・10-26）。古い形の id でも名簿から探す
  return <LivePerson id={id} embedded={embedded} initial={initial} />;
}

/** 基本情報・面談メモ・チャットのタブの中身（どちらの人でも同じ） */
type SideProps = { tab: Tab; name: string; live: boolean; staffId?: string; personId?: string; everyone: readonly string[]; memo?: { memo: string; summary: string }; can: PersonCan };
function SideTab({ tab, name, live, staffId, personId, everyone, memo, can }: SideProps) {
  if (tab === '基本情報') return <section className="w-full rounded-xl border border-line bg-surface px-5 py-4 text-body"><PersonBasic name={name} live={live} person={personId} /></section>;
  if (tab === '面談メモ') return <section className="w-full rounded-xl border border-line bg-surface px-5 py-4 text-body"><PersonMemo name={name} live={live} id={staffId} initial={memo} /></section>;
  if (tab === 'チャット') return <section className="w-full rounded-xl border border-line bg-surface px-5 py-4 text-body"><PersonChat name={name} live={live} everyone={everyone} canSummary={can.summary} /></section>;
  return null;
}
const SIDE = new Set<Tab>(['基本情報', '面談メモ', 'チャット']);
const LOG_KIND: Partial<Record<Tab, 'basic' | 'memo' | 'chat'>> = { 基本情報: 'basic', 面談メモ: 'memo', チャット: 'chat' };

/** タブ：基本情報・面談メモ・チャットは一度開いたら出したままにする（切り替えで読み直さない）。開くたびに「見た」を残す（本物のときだけ） */
function useTabs(name: string, live: boolean) {
  const [tab, setTab] = useState<Tab>('現場の履歴');
  const [seen, setSeen] = useState<Tab[]>([]);
  const select = (t: Tab) => {
    setTab(t);
    if (SIDE.has(t)) setSeen((s) => (s.includes(t) ? s : [...s, t]));
    const k = LOG_KIND[t];
    if (live && k) logView(k, name);
  };
  return { tab, select, seen };
}
const tabsFor = (can: PersonCan) => TABS.filter((t) => (t === '基本情報' ? can.basic : t === 'チャット' ? can.chat : true));
/** 契約の区分（準委任・派遣）を状態の横に出す（10-25） */
function ContractChip({ contract }: { contract: string }) {
  const k = /派遣/.test(contract) ? '派遣' : /準委任|業務委託|SES/i.test(contract) ? '準委任' : '';
  if (!k) return null;
  return <span className="chip" style={k === '派遣' ? { background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' } : { background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{k}</span>;
}

// ---- 本物の人（今の従業員名簿）。名簿の行からわかる分だけ出す。見るだけ ------------------------------
//   名前の小窓からは initial（小窓が読んだ行）をそのまま使う＝ /api/live/staff を読まない（10-25）
function LivePerson({ id, embedded, initial }: { id: string; embedded: boolean; initial?: StaffInitial }) {
  const r = useLiveRoute<LiveStaffList & Partial<LiveStaffListX>>(initial ? null : '/api/live/staff');
  const state = initial ? 'live' : r.state;
  const live = !!initial || r.live;
  // id は a＋応募ID（人の番号）か r＋氏名の番号（前の形）。古いリンクの r… でもこの人に当たる
  const p = initial?.staff ?? (live ? r.data?.rows.find((x) => staffIdMatches(x, id)) : undefined);
  const router = useRouter();
  // 古いリンク（氏名の番号）で来て、この人の番号がわかっていれば、新しい id のページに置き換える（ページのときだけ）
  useEffect(() => { if (!embedded && !initial && p && p.id !== id) router.replace(`/jinji/staff/${encodeURIComponent(p.id)}`); }, [embedded, initial, p, id, router]);
  const month = initial?.month ?? r.data?.month ?? '';
  const can = initial?.can ?? CAN_ALL;
  const everyone = initial?.everyone ?? (r.data?.rows ?? []).map((x) => x.name);
  const everyoneRecruiters = (r.data?.rows ?? []).map((x) => x.recruiter);
  const memo = initial ? memoOf(initial.proper) : undefined;
  const { tab, select: setTab, seen } = useTabs(p?.name ?? '', live);
  const ext = embedded ? { target: '_blank', rel: 'noopener' } : {};
  const crumb = embedded ? null : (
    <div className="flex items-center gap-2 border-b border-line bg-surface px-6 py-2.5 text-body">
      <Link href="/jinji/staff" className="text-muted hover:underline">社員一覧</Link><span className="text-faint">/</span><b>{p?.name ?? '社員'}</b>
    </div>
  );
  if (!p) return (
    <div className="flex flex-col">
      {crumb}
      <main className="flex flex-col gap-3 px-4 pb-12 pt-[18px] sm:px-6">
        <LiveBanner state={state} error={r.error} onReload={r.reload} />
        {state === 'loading' && <div className="text-body text-muted">読み込み中…</div>}
        {state === 'sample' && <div className="rounded-xl border border-line bg-surface px-6 py-8 text-center text-body text-muted">この社員ページは今の社内システムの名簿の人です。ログインすると見られます。</div>}
        {live && <div className="rounded-xl border border-line bg-surface px-6 py-8 text-center text-body text-muted">{month}の名簿（未経験の人だけ＝今のプロパーリストに入っている人）にこの人は見つかりませんでした（名前が変わった・名簿やプロパーリストから外れた可能性があります）。<Link href="/jinji/staff" {...ext} className="ml-1 font-semibold underline">社員一覧へ</Link></div>}
      </main>
    </div>
  );
  const hasPrice = !!p.price && p.price !== '—';
  const rule = r.data?.rule ? { ok: r.data.rule.ok, n: r.data.rule.n[normName(p.name)] } : undefined;
  const facts: [string, React.ReactNode][] = [
    ['現場（上位会社）', <span key="s"><b>{p.site}</b>{p.siteEki && <span className="block text-xs text-faint">{p.siteEki}</span>}</span>],
    [hasPrice ? '契約・単価' : '契約', hasPrice ? `${p.contract}・${p.price}` : p.contract],
    ['担当営業', <span key="e"><span style={{ color: 'var(--c-eigyo)' }}>●</span> {p.sales}</span>], ['採用担当', <span key="j"><span style={{ color: 'var(--c-jinji)' }}>●</span> {p.recruiter}</span>],
    ['入社日', slashDate(p.joined)], ['最寄駅', p.station], ['所属会社', p.company || '—'],
    [p.statusKey === 'taisha' ? '退社日' : '入場日', p.statusKey === 'taisha' ? slashDate(p.taishaBi) : (p.nyuujou ? slashDate(p.nyuujou) : '—')],
  ];
  return (
    <div className="flex flex-col">
      {crumb}
      <section className="mo-fade-up border-b border-line bg-surface px-4 pt-5 sm:px-6">
        <div className="mb-3"><LiveBanner state={state} error={r.error} onReload={r.reload} note="今の従業員名簿の行から出しています（未経験の人だけ＝今のプロパーリストに入っている人）。退社・待機・日付・対応歴などは「名簿の入力」「対応歴」タブから入れると今の名簿にすぐ保存されます" /></div>
        <div className="flex flex-wrap items-start gap-5">
          <div aria-hidden className="flex size-[72px] shrink-0 items-center justify-center rounded-full text-2xl font-bold" style={{ background: 'var(--as)', color: 'var(--ad)', boxShadow: '0 0 0 3px var(--color-surface), 0 0 0 5px var(--al)' }}>{p.name[0]}</div>
          <div className="min-w-0 flex-1 sm:w-[210px] sm:flex-none">
            <div className="text-sm text-faint">{p.kana || ' '}</div>
            <div className="text-xl font-bold tracking-tight">{p.name}</div>
            <div className="mt-2 flex flex-wrap gap-1.5"><Pill>{p.status}</Pill><ContractChip contract={p.contract} />{p.provisional && <span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>仮</span>}</div>
          </div>
          <dl className="grid min-w-0 flex-1 basis-full grid-cols-2 gap-x-5 gap-y-2.5 text-body sm:basis-[480px] sm:grid-cols-4">
            {facts.map(([k, v]) => <div key={k} className="min-w-0 break-words"><dt className="text-xs text-faint">{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </div>
        <div className="mt-3"><PersonActions name={p.name} live={live} rule={rule} onTaiou={() => setTab('対応歴')} /></div>
        <div role="tablist" className="mt-4 flex gap-1 overflow-x-auto text-body">
          {tabsFor(can).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="tab">{t}</button>
          ))}
        </div>
      </section>
      <main className="mo-axis flex flex-col gap-3 px-4 pb-12 pt-[18px] sm:px-6">
        <Fragment key={tab}>{tab === '現場の履歴' ? (
          <>
            <section className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="px-[18px] py-3.5"><h2 className="text-md font-bold">いまの契約</h2><div className="text-sm text-faint">{month}の稼働管理情報一覧の行{p.provisional ? '（まだ一覧に載っていないので、営業リストから立てた仮の行です）' : p.carriedFrom ? `（当月の行が無いので ${p.carriedFrom} の行）` : ''}</div></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-body">
                  <thead><tr className="th-row text-left"><th className="px-[18px] py-2.5 font-semibold">期間</th><th className="px-2 py-2.5 font-semibold">上位会社</th><th className="px-2 py-2.5 font-semibold">{hasPrice ? '契約区分・単価' : '契約区分'}</th><th className="px-[18px] py-2.5 font-semibold">状態</th></tr></thead>
                  <tbody><tr className="border-t border-line-soft">
                    <td className="whitespace-nowrap px-[18px] py-2.5 font-semibold">{p.start || p.end ? `${slashDate(p.start)} 〜 ${p.end ? slashDate(p.end) : ''}` : '—'}</td>
                    <td className="px-2 py-2.5">{p.site}</td><td className="px-2 py-2.5">{hasPrice ? `${p.contract}・${p.price}` : p.contract}</td>
                    <td className="px-[18px] py-2.5"><Pill>{p.status}</Pill>{p.taijou && <span className="ml-1.5 text-xs text-muted">退場 {slashDate(p.taijou)}</span>}</td>
                  </tr></tbody>
                </table>
              </div>
            </section>
            <LiveHistory name={p.name} />
          </>
        ) : tab === '名簿の入力' ? (
          <StaffOps staff={p} live={live} recruiters={everyoneRecruiters} onDone={initial ? undefined : r.reload} />
        ) : tab === '対応歴' ? (
          <TaiouLog name={p.name} live={live} rule={rule} />
        ) : SIDE.has(tab) ? null : (
          <section className="w-full rounded-xl border border-dashed border-field bg-surface px-6 py-10 text-center text-body text-muted">「{tab}」タブはこれから作ります（今の社内システムの中身を、この型に載せ替えます）</section>
        )}</Fragment>
        {seen.filter((t) => tabsFor(can).includes(t)).map((t) => (
          <div key={t} hidden={t !== tab} className="w-full"><SideTab tab={t} name={p.name} live staffId={p.id} personId={p.personId} everyone={everyone} memo={memo} can={can} /></div>
        ))}
      </main>
    </div>
  );
}

// ---- 本物の 現場の履歴とタイムライン（10-26）。今のシステムの /api/jinji-v2?action=history（POST・名前を URL に出さない）。
//   月ごとに 稼働管理情報一覧の行（現場・契約）・ミンミカの勤務表（届いた数）・請求（状態・額は経理/営業の管理者だけ）を並べる。読むだけ（請求の仕様は変えない）
const TL_MODULE: Record<string, string> = { 現場: 'eigyo', 現場面談: 'eigyo', 状態: 'jinji', 対応歴: 'jinji', 面談: 'jinji', 変更の予約: 'jinji' };
const ymLabel = (ym: string) => `${ym.slice(0, 4)}/${ym.slice(5, 7)}`;
const atLabel = (iso: string) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return ''; const d = new Date(t + 9 * 3600e3); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
function LiveHistory({ name }: { name: string }) {
  const [h, setH] = useState<JHistory | null>(null);
  const [err, setErr] = useState('');
  const [n, setN] = useState(0);
  useEffect(() => {
    let off = false;
    setErr('');
    jinjiPostRead<JHistory>('history', { name }).then((j) => { if (!off) setH(j); }).catch((e) => { if (!off) setErr((e as Error).message); });
    return () => { off = true; };
  }, [name, n]);
  if (err) return <LiveBanner state="error" error={`現場の履歴を読めませんでした（${err}）`} onReload={() => setN((x) => x + 1)} />;
  if (!h) return <div className="text-body text-muted">現場の履歴を読み込み中…</div>;
  const now = Date.now();
  return (
    <div className="flex flex-wrap items-start gap-4">
      <section className="min-w-0 flex-[999_1_640px] overflow-hidden rounded-xl border border-line bg-surface">
        <div className="px-[18px] py-3.5"><h2 className="text-md font-bold">現場の履歴</h2><div className="text-sm text-faint">月ごとに、稼働管理情報一覧の現場と、勤務表・請求（ミンミカ）を並べています{h.money ? '' : '（請求の額は経理・営業の管理者だけに出ます）'}</div></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-body">
            <thead><tr className="th-row text-left">
              <th className="px-[18px] py-2.5 font-semibold">期間</th><th className="px-2 py-2.5 font-semibold">現場</th><th className="px-2 py-2.5 font-semibold">契約</th><th className="px-2 py-2.5 text-right font-semibold">稼働（勤務表）</th><th className="px-2 py-2.5 text-right font-semibold">請求</th><th className="px-[18px] py-2.5 font-semibold">状態</th>
            </tr></thead>
            <tbody>
              {h.months.length === 0 && <tr><td colSpan={6} className="px-[18px] py-6 text-center text-sm text-muted">まだ現場の履歴はありません（入場すると、ここに期間ごとに並びます）</td></tr>}
              {h.months.map((m, i) => (
                <tr key={m.ym} className="row mo-fade-in border-t border-line-soft" style={{ ['--i' as string]: i + 3 }}>
                  <td className="whitespace-nowrap px-[18px] py-2.5 font-semibold">{ymLabel(m.ym)}{(m.start || m.end) && <div className="text-xs font-normal text-faint">{m.start ? slashDate(m.start) : ''} 〜 {m.end ? slashDate(m.end) : ''}</div>}</td>
                  <td className={`px-2 py-2.5 ${m.site ? '' : 'text-muted'}`}>{m.site || '—'}</td>
                  <td className="px-2 py-2.5">{m.contract || '—'}</td>
                  <td className="num px-2 py-2.5 text-right">{m.sheets == null ? <span className="text-faint">—</span> : m.sheets > 0 ? `届いた ${m.sheets}件` : <span className="text-warn">まだ</span>}{m.sheetLast && <div className="text-xs text-faint">最後 {atLabel(m.sheetLast)}</div>}</td>
                  <td className="px-2 py-2.5 text-right">{m.amount != null ? <span className="num">¥{m.amount.toLocaleString()}</span> : m.billed ? '' : <span className="text-faint">—</span>}{m.billed && <div className="text-xs" style={{ color: m.billed === '振込済み' || m.billed === '送付済み' ? 'var(--color-ok)' : 'var(--color-warn)' }}>{m.billed}</div>}</td>
                  <td className="px-[18px] py-2.5">{m.note ? <Pill>{m.note}</Pill> : <span className="text-faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <aside className="min-w-0 flex-[1_1_320px] rounded-xl border border-line bg-surface px-[18px] py-3.5">
        <div className="mb-2.5 flex items-center justify-between"><h2 className="text-md font-bold">タイムライン</h2>
          <div className="flex gap-1.5 text-xs">{MODULES.map((m) => <span key={m.key}><span style={{ color: `var(--c-${m.key})` }}>●</span>{m.short}</span>)}</div></div>
        <div className="relative flex flex-col gap-3.5 pl-[22px] text-body">
          <div className="absolute bottom-1.5 left-1.5 top-1.5 w-0.5 bg-track" />
          {h.timeline.length === 0 && <div className="text-sm text-muted">まだできごとはありません</div>}
          {h.timeline.map((t, i) => {
            const future = Date.parse(t.at) > now; const mod = TL_MODULE[t.kind] || 'jinji';
            return (
              <div key={`${t.at}-${i}`} className="mo-fade-up relative" style={{ ['--i' as string]: Math.min(i, 12) + 4 }}>
                <i className="absolute -left-[21px] top-1 size-3 rounded-full" style={future ? { background: 'var(--color-surface)', border: `2.5px dashed var(--c-${mod})` } : { background: `var(--c-${mod})` }} />
                <div className={`text-xs ${future ? 'font-semibold text-warn' : 'text-faint'}`}>{atLabel(t.at)}{future ? ' 予約' : ''}・{t.kind}</div>
                {t.text}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
