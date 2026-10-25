'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Archive, CalendarDays, Check, Clock, FileSpreadsheet, Lock, MapPin, Plus, RefreshCw, Route, Search, Sparkles, Train, Undo2, User, X } from 'lucide-react';
import {
  BAY, CAT_TONE, CATS, JOBS, MAP_H, MAP_W, MODES, OWNERS, PASTE_RESULT, PASTE_SAMPLE, RAILS, SLACK_CASES, SRC_LABEL, STATIONS, TODAY, YOUIN, YOUIN_COUNTS,
  estimate, stationOf, xy, type Cat, type Job, type Youin,
} from '@/lib/map-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import { DrawerPortal } from '@/components/DrawerPortal';
import { LIVE_WRITE_BLOCKED, LiveBanner, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { estimateAt, liveJobs, liveYouin, type CasesMapList, type MapData } from '@/lib/live/map';
import { PersonName } from '@/components/Person';

// 案件・要員マップ（営業）。今の社内システムの「案件マップ」と「要員マップ」を1画面の2つのタブにしたもの。中身・操作・言葉は今の画面どおり。
//   案件マップ：マップ／案件入力（案件文を貼る → AI が欄を埋める）／充足・終了。出発駅を選ぶと通勤の目安で並ぶ（実経路は出さない）
//   要員マップ：営業中の要員を最寄駅の丸、Slack の案件をオレンジの丸で出す。案件1件＋要員を選んで「転記＆配信先設定」
//   地図は見本の簡易な地図（SVG）。地図タイルは本物につなぐときに入れる。
//   本物（ログイン中）：案件マップ＝今の /api/cases-map?action=list、要員マップ＝/api/proxy?action=getMapData を読むだけ。
//     ピンは行の座標（lat/lng）で置く。登録・充足・同期・転記は今の画面から
const pct = (lat: number, lng: number) => { const p = xy(lat, lng); return { left: `${(p.x / MAP_W) * 100}%`, top: `${(p.y / MAP_H) * 100}%` }; };
const fmt = (s?: string) => { const m = s?.match(/\d{4}-(\d{2})-(\d{2})/); return m ? `${+m[1]}/${+m[2]}` : s ?? ''; };
const addDays = (n: number) => { const d = new Date(`${TODAY}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const daysLeft = (s: string) => Math.round((new Date(`${s}T00:00:00`).getTime() - new Date(`${TODAY}T00:00:00`).getTime()) / 86400000);
const catFg = (c: Cat) => `var(--tone-${CAT_TONE[c]}-fg)`;
const catBg = (c: Cat) => `var(--tone-${CAT_TONE[c]}-bg)`;
const sel = 'min-h-9 rounded-[10px] border border-field bg-surface px-2 text-body text-ink';
const ghost = 'inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 text-sm font-semibold disabled:opacity-40';

/** 見本の簡易な地図（湾・路線・駅）。上に children でピンを重ねる */
function BaseMap({ children, overlay, onBg }: { children: React.ReactNode; overlay?: React.ReactNode; onBg?: () => void }) {
  const pts = (list: [number, number][]) => list.map(([a, b]) => { const p = xy(a, b); return `${p.x},${p.y}`; }).join(' ');
  return (
    <div className="relative overflow-hidden rounded-lg border border-line-soft">
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="block h-auto w-full" style={{ background: 'var(--color-soft)' }} role="img" aria-label="地図" onClick={onBg}>
        <polygon points={pts(BAY)} fill="var(--tone-info-bg)" />
        {RAILS.map((r, i) => <polyline key={i} points={pts(r.map((n) => { const s = stationOf(n)!; return [s.lat, s.lng] as [number, number]; }))} fill="none" stroke="var(--color-line)" strokeWidth={2.2} />)}
        {STATIONS.map((s) => { const p = xy(s.lat, s.lng); return <g key={s.name}><circle cx={p.x} cy={p.y} r={2.4} fill="var(--color-surface)" stroke="var(--color-faint)" /><text x={p.x + 5} y={p.y + 12} fontSize={9.5} fill="var(--color-faint)">{s.name}</text></g>; })}
        {children}
      </svg>
      {overlay}
      <span className="pointer-events-none absolute bottom-1.5 right-2 text-xs text-faint">見本の簡易な地図です（地図タイルは本物につなぐときに入れます）</span>
    </div>
  );
}

export default function MapPage() {
  const [tab, setTab] = useState<'cases' | 'youin'>('cases');
  const cm = useIke<CasesMapList>('cases-map?action=list');
  const mk = useMikeiken();
  const [from, setFrom] = useState('');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('tab') === 'youin') setTab('youin');
    const f = q.get('from'); if (f && stationOf(f)) setFrom(f);
  }, []);
  const go = (t: 'cases' | 'youin') => { setTab(t); window.history.replaceState(null, '', t === 'youin' ? '?tab=youin' : window.location.pathname); };
  return (
    <main className="flex flex-col gap-3.5 px-6 pb-24 pt-[22px]">
      <PageTitle title="案件・要員マップ" sub={`今の社内システムの「案件マップ」と「要員マップ」です。通勤時間は目安${cm.live ? '' : '・見本データ'}`} />
      <LiveBanner state={cm.state} error={cm.error} onReload={cm.reload} note="今の案件マップ・要員マップの中身です。地図は簡易な地図のまま（枠の外の駅は一覧だけ）。登録・充足・同期・転記は今の画面から" />
      <MikeikenNote mk={mk} live={cm.live && tab === 'youin'} />
      <div role="tablist" className="mo-fade-up flex gap-1 border-b border-line" style={{ ['--i' as string]: 1 }}>
        {([['cases', '案件マップ'], ['youin', '要員マップ']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)} className="tab">{l}</button>
        ))}
      </div>
      <div key={tab} className="mo-axis">{tab === 'cases' ? <CasesMap from={from} setFrom={setFrom} data={cm.live ? cm.data : null} /> : <YouinMap live={cm.live} />}</div>
    </main>
  );
}

// ========================= 案件マップ =========================
type Fill = { job: Job; kind: 'now' | 'reserve' | 'close'; days: number; note: string };

function CasesMap({ from, setFrom, data }: { from: string; setFrom: (s: string) => void; data: CasesMapList | null }) {
  const live = !!data;
  const canEdit = usePerms().can('eigyo', 'edit') && !live;
  const noEdit = live ? LIVE_WRITE_BLOCKED : needText('edit');
  const lj = useMemo(() => liveJobs(data), [data]);
  const at = (n?: string) => (n ? (live ? lj.pos.get(n) ?? stationOf(n) : stationOf(n)) : undefined);
  const owners = live ? lj.owners : OWNERS;
  const { hit, toast } = useMotivation();
  const [sub, setSub] = useState<'map' | 'input' | 'done'>('map');
  const [jobsS, setJobs] = useState<Job[]>(JOBS);
  const jobs = live ? lj.jobs : jobsS;
  const [time, setTime] = useState(999), [owner, setOwner] = useState(''), [mode, setMode] = useState(''), [cats, setCats] = useState<Cat[]>([]);
  const [focus, setFocus] = useState<number | null>(null), [pop, setPop] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<number, boolean>>({}), [flash, setFlash] = useState<number | null>(null);
  const [fill, setFill] = useState<Fill | null>(null);

  const est = (j: Job) => (from && j.station ? (live ? estimateAt(stationOf(from), at(j.station), j.access) : estimate(from, j.station, j.access)) : null);
  const openJobs = jobs.filter((j) => j.status === 'open');
  const pass = (j: Job, ignoreCat = false) => j.status === 'open' && (ignoreCat || !cats.length || cats.includes(j.category)) && (!owner || j.owner === owner)
    && (!mode || j.modes.includes(mode)) && (time === 999 || (est(j)?.min ?? 0) <= time); // 出発駅が無い間は時間で絞らない
  const order = [...openJobs].sort((a, b) => (est(a)?.min ?? 9999) - (est(b)?.min ?? 9999));
  const pinned = order.filter((j) => j.station && at(j.station) && pass(j));
  const areaJobs = order.filter((j) => (!j.station || !at(j.station)) && pass(j));
  const groups = pinned.reduce<Record<string, Job[]>>((g, j) => ({ ...g, [j.station!]: [...(g[j.station!] ?? []), j] }), {});
  const fj = jobs.find((j) => j.case_no === focus && j.status === 'open');
  const fromS = from ? stationOf(from) : undefined;

  const touch = (no: number) => { setFlash(no); setTimeout(() => setFlash(null), 1300); };
  const update = (id: string, patch: Partial<Job>, text: string, subText: string) => {
    const prev = jobs.find((j) => j.id === id)!;
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)));
    touch(prev.case_no); hit();
    toast({ text, sub: subText, undo: () => setJobs((js) => js.map((j) => (j.id === id ? prev : j))) });
  };
  const confirmFill = () => {
    if (!fill) return;
    const { job, kind, days, note } = fill;
    if (kind === 'reserve') update(job.id, { reserve: addDays(days), reserveNote: note }, `No.${job.case_no} の充足を ${fmt(addDays(days))} に予約しました`, '→ その日まで「充足予定」の札つきでマップに出します・シートの「充足」列にも反映');
    else update(job.id, { status: kind === 'now' ? 'filled' : 'closed', doneOn: TODAY, doneNote: note }, `No.${job.case_no} を${kind === 'now' ? '充足' : '終了'}にしました`, '→ マップから外して「充足・終了」に移しました（記録は残ります）');
    setFill(null); if (focus === job.case_no && kind !== 'reserve') setFocus(null);
  };
  const pick = (j: Job) => { setFocus(j.case_no); setPop(j.station ?? null); };

  const card = (j: Job) => {
    const e = est(j);
    return (
      <div key={j.id} onClick={() => j.station && pick(j)} className={`cursor-pointer rounded-lg border border-line bg-surface p-3 ${focus === j.case_no ? 'ring-2' : ''} ${flash === j.case_no ? 'mo-flash' : ''}`}
        style={{ borderLeft: `4px solid ${catFg(j.category)}`, ['--tw-ring-color' as string]: 'var(--al)' }}>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="chip" style={{ background: catBg(j.category), color: catFg(j.category) }}>{j.category}</span>
          <span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}><User size={11} />{j.owner}</span>
          <span className="text-faint">{SRC_LABEL[j.source]}・No.{j.case_no}</span>
          {j.pay && <span className="ml-auto text-body font-bold">{j.pay.split('（')[0]}</span>}
        </div>
        <div className="mt-1 text-body font-bold">{j.title}</div>
        {j.company && <div className="text-sm text-muted">{j.company}</div>}
        <div className="mt-1 flex items-center gap-1.5 text-sm"><Train size={13} className="text-faint" />{j.access || j.station || j.area}
          {e && <span className="chip" title={`直線${e.km.toFixed(1)}kmからの目安`} style={{ background: 'var(--tone-info-bg)', color: 'var(--tone-info-fg)' }}>約{e.min}分</span>}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-faint">{j.hours && <span><Clock size={11} className="inline" /> {j.hours}</span>}{j.holiday && <span>休 {j.holiday}</span>}{j.start && <span>開始 {j.start}</span>}</div>
        <div className="mt-1 text-sm text-muted">{j.summary}</div>
        {j.reserve && (
          <div className="mt-1.5 flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>
            <CalendarDays size={13} />充足予定 {fmt(j.reserve)}（あと{daysLeft(j.reserve)}日）{j.reserveNote && <span className="font-normal">— {j.reserveNote}</span>}
            <button disabled={!canEdit} title={canEdit ? undefined : noEdit} onClick={(ev) => { ev.stopPropagation(); update(j.id, { reserve: undefined, reserveNote: undefined }, `No.${j.case_no} の充足予約を外しました`, '→ ふつうの案件としてマップに出します'); }} className="ml-auto underline disabled:opacity-40">予約を外す</button>
          </div>
        )}
        {open[j.case_no] && (
          <dl className="mt-2 grid grid-cols-[88px_1fr] gap-y-1 border-t border-line-soft pt-2 text-sm">
            {j.require && <><dt className="text-faint">求めているもの</dt><dd>{j.require}</dd></>}
            {j.pay && <><dt className="text-faint">単価</dt><dd>{j.pay}</dd></>}
            <dt className="text-faint">通勤手段</dt><dd>{j.modes.map((m) => MODES.find((x) => x.v === m)?.l).join('・')}</dd>
          </dl>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5" onClick={(ev) => ev.stopPropagation()}>
          <a href={from ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${from}駅`)}&destination=${encodeURIComponent(j.station ?? j.area ?? '')}&travelmode=transit&hl=ja` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.station ?? j.area ?? '')}`}
            target="_blank" rel="noopener" className={ghost} style={{ color: 'var(--ad)' }}><Route size={12} />{from ? `${from}駅 → 電車で経路` : 'マップで見る'}</a>
          <button className={ghost} onClick={() => setOpen((o) => ({ ...o, [j.case_no]: !o[j.case_no] }))}>詳細</button>
          <button className={ghost} disabled={!canEdit} title={canEdit ? '充足 / 充足予約 / 終了' : noEdit} onClick={() => setFill({ job: j, kind: 'now', days: 7, note: '' })}><Check size={12} />充足</button>
        </div>
      </div>
    );
  };

  const subTabs = [['map', 'マップ', openJobs.length], ['input', '案件入力', null], ['done', '充足・終了', jobs.length - openJobs.length]] as const;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {subTabs.map(([k, l, n]) => (
          <button key={k} onClick={() => setSub(k)} disabled={k === 'input' && !canEdit} title={k === 'input' && !canEdit ? noEdit : undefined}
            aria-pressed={sub === k} className="fchip disabled:opacity-40">
            {k === 'map' ? <MapPin size={13} /> : k === 'input' ? <Plus size={13} /> : <Archive size={13} />}{l}{n != null && <b className="num">{n}</b>}
          </button>
        ))}
      </div>

      {sub === 'map' && <>
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-sunken px-3 py-2 text-sm text-muted">
          {(['sheet', 'ike', 'juchu'] as const).map((s) => <span key={s}>{s === 'sheet' ? 'スプレッドシートから' : s === 'ike' ? '社内ツールで入力' : '案件受注から'} <b className="text-ink">{openJobs.filter((j) => j.source === s).length}</b> 件</span>)}
          <span>10分ごとに自動同期</span>
          <button className={`${ghost} ml-auto`} disabled={!canEdit} title={canEdit ? undefined : noEdit} onClick={() => { hit(); toast({ text: '今すぐ同期しました（見本）', sub: '→ シートと案件受注の新しい行をマップに取り込みます' }); }}><RefreshCw size={12} />今すぐ同期</button>
        </div>
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <label className="flex flex-col gap-1 text-sm text-muted"><span className="flex items-center gap-1"><Train size={12} />要員の出発駅（お住まい）</span>
            <select aria-label="要員の出発駅" value={from} onChange={(e) => setFrom(e.target.value)} className={sel}><option value="">選ぶ</option>{STATIONS.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm text-muted"><span className="flex items-center gap-1"><Clock size={12} />通勤時間の目安</span>
            <select aria-label="通勤時間の目安" value={time} onChange={(e) => setTime(+e.target.value)} className={sel}>{[999, 30, 45, 60, 90].map((t) => <option key={t} value={t}>{t === 999 ? '指定なし' : `〜${t}分`}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm text-muted"><span className="flex items-center gap-1"><User size={12} />担当者</span>
            <select aria-label="担当者" value={owner} onChange={(e) => setOwner(e.target.value)} className={sel}><option value="">すべて</option>{owners.map((o) => <option key={o}>{o}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm text-muted">通勤手段
            <select aria-label="通勤手段" value={mode} onChange={(e) => setMode(e.target.value)} className={sel}><option value="">すべて</option>{MODES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select></label>
          <button className={ghost} onClick={() => { setFrom(''); setTime(999); setOwner(''); setMode(''); setCats([]); setFocus(null); setPop(null); }}>リセット</button>
          {fromS && <span className="text-sm text-ok"><Check size={12} className="inline" /> {from}駅 から近い順に並べています</span>}
        </div>
        <p className="text-sm text-faint">通勤時間は目安。要員の出発駅を選んでから案件（ピンかカード）を選ぶと、乗換案内・Google マップの電車経路が開けます。充足済みの案件はここには出ません（「充足・終了」へ）。</p>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted">職種で絞り込み（複数可）</span>
          <button onClick={() => setCats([])} className="chip" style={!cats.length ? { background: 'var(--as)', color: 'var(--ad)' } : { background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>すべて</button>
          {CATS.map((c) => { const n = openJobs.filter((j) => j.category === c && pass(j, true)).length, on = cats.includes(c); return n ? (
            <button key={c} onClick={() => setCats((x) => (on ? x.filter((y) => y !== c) : [...x, c]))} className="chip" style={on ? { background: catFg(c), color: 'var(--color-surface)' } : { background: catBg(c), color: catFg(c) }}>{c}<b className="num">{n}</b></button>) : null; })}
        </div>

        <div className="grid gap-3.5 lg:grid-cols-[1.25fr_1fr]">
          <div className="self-start lg:sticky lg:top-3">
            <BaseMap onBg={() => setPop(null)} overlay={<>
              {pop && groups[pop] && (() => { const s = at(pop)!, list = groups[pop]; return (
                <div className="absolute z-10 w-[250px] -translate-x-1/2 -translate-y-[calc(100%+30px)] rounded-lg border border-line bg-surface p-2.5 text-sm shadow-lg" style={pct(s.lat, s.lng)}>
                  <button className="absolute right-1.5 top-1.5 text-faint" onClick={() => setPop(null)} aria-label="閉じる"><X size={13} /></button>
                  {list.length > 1 && <div className="mb-1 font-semibold">この場所の案件 <b>{list.length}件</b></div>}
                  <ul className="flex flex-col gap-1">{list.map((j) => (
                    <li key={j.id} onClick={() => setFocus(j.case_no)} className={`flex cursor-pointer gap-1.5 rounded p-1 ${focus === j.case_no ? 'bg-soft' : ''}`}>
                      <span className="grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold" style={{ background: catFg(j.category), color: 'var(--color-surface)' }}>{j.case_no}</span>
                      <span><b>{j.title}</b><span className="block text-faint">{j.company || `${j.owner} 担当`}{j.reserve ? `・充足予定 ${fmt(j.reserve)}` : ''}</span></span></li>))}</ul>
                  <div className="mt-1 text-faint">{list[0].access}</div>
                </div>); })()}
              {fj && from && (
                <div className="absolute inset-x-2 bottom-6 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow">
                  <b>{from}駅</b>→<b>{fj.station}駅</b><span className="text-faint">No.{fj.case_no} {fj.title}</span>
                  {est(fj) && <span><b className="text-body">約{est(fj)!.min}分</b> <span className="text-faint">直線 {est(fj)!.km.toFixed(1)}km からの目安</span></span>}
                  <a className={ghost} target="_blank" rel="noopener" href={`https://transit.yahoo.co.jp/search/result?from=${encodeURIComponent(from)}&to=${encodeURIComponent(fj.station!)}`}>乗換案内</a>
                  <a className={ghost} style={{ color: 'var(--ad)' }} target="_blank" rel="noopener" href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${from}駅`)}&destination=${encodeURIComponent(`${fj.station}駅`)}&travelmode=transit&hl=ja`}><Route size={12} />Google マップで経路（電車）</a>
                  <button className="ml-auto text-faint" onClick={() => setFocus(null)} aria-label="閉じる"><X size={14} /></button>
                </div>)}
              {!fj && from && <div className="absolute inset-x-2 bottom-6 rounded-lg bg-surface/90 px-3 py-1.5 text-sm text-muted"><Train size={12} className="inline" /> ピンかカードを選ぶと、地図に経路の目安（距離・所要時間）が出ます</div>}
            </>}>
              {fj && fromS && (() => { const a = xy(fromS.lat, fromS.lng), s = at(fj.station!)!, b = xy(s.lat, s.lng); return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--ad)" strokeWidth={3} strokeDasharray="7 6" />; })()}
              {Object.entries(groups).map(([st, list]) => {
                const s = at(st)!, p = xy(s.lat, s.lng), head = list[0], on = list.some((j) => j.case_no === focus);
                return (
                  <g key={st} transform={`translate(${p.x},${p.y})`} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); pick(head); }}>
                    <title>{list.map((j) => `No.${j.case_no} ${j.title}`).join('\n')}</title>
                    {on && <circle cy={-15} r={15} fill="var(--al)" className="mo-pulse" />}
                    <path d="M0 0C-2-6-10-9-10-16a10 10 0 1 1 20 0c0 7-8 10-10 16z" fill={catFg(head.category)} stroke="var(--color-surface)" strokeWidth={1.5} strokeDasharray={head.reserve ? '3 2' : undefined} opacity={head.reserve ? 0.75 : 1} />
                    <text y={-12.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--color-surface)">{head.case_no}</text>
                    {list.length > 1 && <g transform="translate(9,-25)"><circle r={6.5} fill="var(--color-ink)" /><text y={3} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="var(--color-surface)">{list.length}</text></g>}
                  </g>
                );
              })}
              {fromS && (() => { const p = xy(fromS.lat, fromS.lng); return <g><circle cx={p.x} cy={p.y} r={8} fill="var(--ad)" stroke="var(--color-surface)" strokeWidth={3} /><text x={p.x} y={p.y - 13} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--color-ink)">出発：{fromS.name}</text></g>; })()}
            </BaseMap>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">地図上 <b>{pinned.length}件</b>
              <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>生きている案件 {openJobs.length}件</span>
              {openJobs.some((j) => j.reserve) && <span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>充足予定 {openJobs.filter((j) => j.reserve).length}件</span>}</div>
            {pinned.map(card)}
            {!pinned.length && <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-body text-muted">条件に合う案件がありません。<br />通勤時間を長め・手段を「すべて」にしてお試しください。</div>}
          </div>
        </div>
        {areaJobs.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="flex items-center gap-1.5 text-md font-bold"><MapPin size={15} />{live ? '地図にピンを立てられない案件' : 'エリア指定の案件'}</h2>
            <p className="text-sm text-faint">{live ? 'エリア指定の案件と、簡易な地図の枠の外の駅・座標がまだ無い駅の案件。' : '勤務地が複数店舗・広域のため地図にピンを立てられない案件。'}</p>
            <div className="grid gap-2 md:grid-cols-2">{areaJobs.map(card)}</div>
          </section>
        )}
      </>}

      {sub === 'input' && <CaseInput onSave={(j) => {
        const no = Math.max(...jobs.map((x) => x.case_no)) + 1, job = { ...j, id: `new${no}`, case_no: no };
        setJobs((js) => [...js, job]); setSub('map'); setFocus(no); setPop(job.station ?? null); touch(no); hit();
        toast({ text: `No.${no}「${job.title}」を登録しました`, sub: '→ 案件マップに出しました・スプレッドシートにも同じ案件Noで書き戻します', undo: () => setJobs((js) => js.filter((x) => x.id !== job.id)) });
      }} />}

      {sub === 'done' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-faint">充足済み・終了した案件。マップからは消えていますが記録は残ります。「再掲載」でマップに戻せます。</p>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full text-body">
              <thead><tr className="th-row">{['No', '案件', '担当', '最寄駅', '状態', '日付', 'メモ', ''].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr></thead>
              <tbody>{jobs.filter((j) => j.status !== 'open').map((j) => (
                <tr key={j.id} className={`row border-t border-line-soft ${flash === j.case_no ? 'mo-flash' : ''}`}>
                  <td className="px-3 py-2 num">{j.case_no}</td><td className="px-3 py-2 font-semibold">{j.title}</td><td className="px-3 py-2">{j.owner}</td><td className="px-3 py-2">{j.station ?? j.area}</td>
                  <td className="px-3 py-2"><span className="chip" style={j.status === 'filled' ? { background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' } : { background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{j.status === 'filled' ? '充足' : '終了'}</span></td>
                  <td className="px-3 py-2">{fmt(j.doneOn)}</td><td className="px-3 py-2 text-muted">{j.doneNote}</td>
                  <td className="px-3 py-2 text-right"><button className={ghost} disabled={!canEdit} title={canEdit ? undefined : noEdit} onClick={() => update(j.id, { status: 'open', doneOn: undefined, doneNote: undefined }, `No.${j.case_no} を再掲載しました`, '→ 案件マップに戻しました')}><Undo2 size={12} />再掲載</button></td>
                </tr>))}</tbody>
            </table>
          </div>
        </div>
      )}

      {fill && (
        <DrawerPortal>
          <div className="fixed inset-0 z-40 grid place-items-center bg-sumi/40 p-4" onClick={() => setFill(null)}>
            <div className="mo-scale-in w-full max-w-[440px] rounded-xl bg-surface p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
              <h3 className="flex items-center gap-1.5 text-md font-bold"><CalendarDays size={16} />充足の設定</h3>
              <p className="mt-1 text-sm text-muted">充足した案件はマップから消えます。予約すると、その日までは札つきで表示します。</p>
              <div className="mt-2 rounded-lg bg-soft px-3 py-2 text-body"><b>No.{fill.job.case_no}</b> {fill.job.title}</div>
              <div className="mt-3 flex flex-col gap-2">
                {([['now', '今すぐ充足にする', '今この場でマップから外す（記録は「充足・終了」に残る）'], ['reserve', '充足を予約する', '決定見込みの日を入れておく。翌日に自動で充足扱い'], ['close', '終了にする', '案件そのものが無くなった（先方都合など）。マップから外す']] as const).map(([k, t, d]) => (
                  <label key={k} className="flex cursor-pointer gap-2 rounded-lg border p-2.5 text-body" style={{ borderColor: fill.kind === k ? 'var(--a)' : 'var(--color-line)' }}>
                    <input type="radio" name="fillKind" checked={fill.kind === k} onChange={() => setFill({ ...fill, kind: k })} /><span><b>{t}</b><span className="block text-sm text-muted">{d}</span></span></label>))}
              </div>
              {fill.kind === 'reserve' && <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">充足予定日 <b>{fmt(addDays(fill.days))}</b>
                {[[3, '3日後'], [7, '1週間後'], [14, '2週間後'], [30, '1ヶ月後']].map(([d, l]) => <button key={d} onClick={() => setFill({ ...fill, days: +d })} className="chip" style={fill.days === d ? { background: 'var(--as)', color: 'var(--ad)' } : { background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{l}</button>)}</div>}
              <label className="mt-3 flex flex-col gap-1 text-sm text-muted">メモ（短く）
                <input value={fill.note} maxLength={40} onChange={(e) => setFill({ ...fill, note: e.target.value })} placeholder="例：面談 10/28、内定見込み" className={`${sel} min-h-9`} /></label>
              <div className="mt-4 flex justify-end gap-2"><button className={ghost} onClick={() => setFill(null)}>やめる</button><button className="btn-primary" onClick={confirmFill}><Check size={14} />確定</button></div>
            </div>
          </div>
        </DrawerPortal>
      )}
    </div>
  );
}

/** 案件入力：案件文を貼る → AI が欄を埋める（見本は決め打ち）→ 選ぶ欄だけ選んで「登録してマップに出す」 */
function CaseInput({ onSave }: { onSave: (j: Omit<Job, 'id' | 'case_no'>) => void }) {
  const { me } = usePerms();
  const [text, setText] = useState(''), [step, setStep] = useState<'empty' | 'reading' | 'done'>('empty');
  const [cat, setCat] = useState<Cat | ''>(''), [modes, setModes] = useState<string[]>(['公共交通機関']), [rsv, setRsv] = useState(0);
  const paste = () => { setText(PASTE_SAMPLE); setStep('reading'); setTimeout(() => { setStep('done'); setCat(PASTE_RESULT.category); setModes(PASTE_RESULT.modes); }, 900); };
  const r = step === 'done' ? PASTE_RESULT : null, st = r?.station ? stationOf(r.station) : undefined;
  const ok = !!r && !!cat;
  const F = ({ l, v }: { l: string; v?: string }) => <div className="flex flex-col gap-0.5"><span className="text-xs text-faint">{l}</span><span className={`min-h-9 rounded-[10px] border border-line-soft px-2.5 py-1.5 text-body ${v ? 'mo-fade-in' : 'text-faint'}`} style={v ? { background: 'var(--as)' } : undefined}>{v || '—'}</span></div>;
  return (
    <div className="grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <h2 className="flex items-center gap-1.5 text-md font-bold"><Plus size={16} />案件を登録</h2>
        <p className="text-sm text-muted">ここで登録した案件はすぐマップに出ます。スプレッドシート連携が設定されていれば同じ行が書き戻されます（どちらで入れても同じ）。</p>
        <div className="flex items-center gap-2.5 rounded-lg bg-soft px-3 py-2 text-sm"><span className="grid size-8 place-items-center rounded-full font-bold" style={{ background: 'var(--al)', color: 'var(--ad)' }}>{me.name[0]}</span>
          <span><span className="block text-xs text-faint">担当営業（ログインから自動）</span><b>{me.name}</b></span><span className="ml-auto flex items-center gap-1 text-faint"><Lock size={12} />手で変えない</span></div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">案件文を貼る（Slack・メールの文面そのまま）</span>
          {text ? <pre className="whitespace-pre-wrap rounded-[10px] border border-field bg-sunken p-2.5 text-sm">{text}</pre>
            : <button onClick={paste} className="rounded-[10px] border border-dashed border-field px-3 py-6 text-body text-muted hover:bg-soft">ここに貼る（見本の案件文を貼ります）</button>}
          <div className="flex items-center gap-1.5 text-sm" style={{ color: step === 'done' ? 'var(--tone-ok-fg)' : 'var(--color-muted)' }}>
            {step === 'empty' && <><Search size={12} />貼ると各欄と最寄駅を自動で読み取ります（手で直した欄は上書きしません）</>}
            {step === 'reading' && <><Sparkles size={12} className="mo-pulse" />AI が読み取り中…</>}
            {step === 'done' && <><Sparkles size={12} />AI が 10 の欄を読み取りました・最寄駅「{r!.station}駅」を見つけました</>}
          </div>
        </div>
        <p className="border-t border-line-soft pt-2 text-sm font-bold text-muted">基本</p>
        <div className="grid gap-2 sm:grid-cols-2"><F l="案件名 *" v={r?.title} /><F l="会社名" v={r?.company} /></div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-0.5 text-xs text-faint">カテゴリ *<select value={cat} onChange={(e) => setCat(e.target.value as Cat)} className={sel}><option value="">選ぶ</option>{CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <F l="単価" v={r?.pay} /><F l="開始時期" v={r?.start} /></div>
        <div className="grid gap-2 sm:grid-cols-3"><F l="勤務時間" v={r?.hours} /><F l="休日" v={r?.holiday} /><F l="求めているもの" v={r?.require} /></div>
        <p className="border-t border-line-soft pt-2 text-sm font-bold text-muted">勤務地（駅でピンを立てる）</p>
        <div className="grid gap-2 sm:grid-cols-2"><F l="最寄駅 *（自動検出）" v={r?.station && `${r.station}駅`} /><F l="アクセス" v={r?.access} /></div>
        <div className="flex flex-wrap gap-3 text-body"><span className="text-sm text-muted">通勤手段</span>{MODES.map((m) => (
          <label key={m.v} className="flex items-center gap-1"><input type="checkbox" checked={modes.includes(m.v)} onChange={() => setModes((x) => (x.includes(m.v) ? x.filter((y) => y !== m.v) : [...x, m.v]))} />{m.l}</label>))}</div>
        <p className="border-t border-line-soft pt-2 text-sm font-bold text-muted">充足予約（任意）</p>
        <label className="flex items-center gap-2 text-sm text-muted">この日に充足扱いにする<select value={rsv} onChange={(e) => setRsv(+e.target.value)} className={sel}><option value={0}>しない</option>{[[7, '1週間後'], [14, '2週間後'], [30, '1ヶ月後']].map(([d, l]) => <option key={d} value={d}>{l}（{fmt(addDays(+d))}）</option>)}</select></label>
        <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
          <span className="flex-1 text-xs text-faint">案件No は自動採番（スプレッドシートと共通）。本物では読み取った欄を手で直せます。</span>
          <button className={ghost} onClick={() => { setText(''); setStep('empty'); setCat(''); setRsv(0); }}>クリア</button>
          <button className="btn-primary" disabled={!ok} title={ok ? undefined : '案件文を貼って、カテゴリを選んでください'} onClick={() => r && cat && onSave({ ...r, category: cat, modes, owner: me.name, source: 'ike', status: 'open', reserve: rsv ? addDays(rsv) : undefined })}><Check size={14} />登録してマップに出す</button>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-line bg-surface p-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-body font-bold"><MapPin size={13} />ピンのプレビュー</h3>
          <BaseMap>{st && (() => { const p = xy(st.lat, st.lng); return <g transform={`translate(${p.x},${p.y})`} className="mo-spring-in"><path d="M0 0C-2-6-10-9-10-16a10 10 0 1 1 20 0c0 7-8 10-10 16z" fill={cat ? catFg(cat) : 'var(--color-faint)'} /><text y={-12.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--color-surface)">?</text></g>; })()}</BaseMap>
          <dl className="mt-2 grid grid-cols-[72px_1fr] gap-y-0.5 text-sm"><dt className="text-faint">駅</dt><dd>{st ? `${st.name}駅` : '—'}</dd><dt className="text-faint">座標</dt><dd className="num">{st ? `${st.lat.toFixed(4)}, ${st.lng.toFixed(4)}` : '—'}</dd></dl>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3 text-sm">
          <h3 className="mb-2 flex items-center gap-1.5 text-body font-bold"><FileSpreadsheet size={13} />スプレッドシートとの両刀</h3>
          <div className="flex flex-wrap items-center gap-1.5 text-sm"><span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>営業案件管理シート</span>⇄<span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>データベース</span>⇄<span className="chip" style={{ background: 'var(--as)', color: 'var(--ad)' }}>この画面</span></div>
          <ol className="mt-2 list-decimal pl-4 text-muted">
            <li>シートに書いた行は10分ごとに取り込み（案件No で突き合わせ）</li><li>ここで登録した行はシートに書き戻し（同じ案件No）</li>
            <li>充足・充足予約は<b>この画面が正</b>。シートには「充足」列として出す</li><li>案件受注に届いた案件は自動でここに写る</li></ol>
          <div className="mt-2 rounded-lg bg-soft px-2.5 py-2 text-sm"><Check size={12} className="inline text-ok" /> 連携中：営業案件管理シート「案件マップ」タブ（見本）
            <span className="block text-faint">本物では画面でシートの URL を貼って接続します。入れられるのは全体管理者・役員・営業管理だけ。</span></div>
        </div>
      </div>
    </div>
  );
}

// ========================= 要員マップ =========================
function YouinMap({ live }: { live: boolean }) {
  const md = useIke<MapData>(live ? 'proxy?action=getMapData' : null);
  const ly = useMemo(() => liveYouin(md.live ? md.data : null), [md.live, md.data]);
  const mk = useMikeiken();   // 要員マップの人は未経験の人だけ（今のプロパーリストに入っている人）
  const YOUIN_ = live ? mk.keep(ly.youin, 'name') : YOUIN, CASES_ = live ? ly.cases : SLACK_CASES;
  const at = (n?: string) => (n ? (live ? ly.pos.get(n) ?? stationOf(n) : stationOf(n)) : undefined);
  const canEdit = usePerms().can('eigyo', 'edit') && !live;
  const { hit, toast } = useMotivation();
  const [q, setQ] = useState(''), [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [selCase, setSelCase] = useState<string | null>(null), [members, setMembers] = useState<string[]>([]);
  const [pop, setPop] = useState<string | null>(null), [detail, setDetail] = useState<Youin | null>(null);
  const [noSt, setNoSt] = useState(false), [loading, setLoading] = useState(false), [focus, setFocus] = useState<string | null>(null);

  const shown = YOUIN_.filter((y) => y.station && at(y.station) && (!q || y.name.includes(q) || y.station.includes(q)));
  const byStation = useMemo(() => shown.reduce<Record<string, Youin[]>>((g, y) => ({ ...g, [y.station!]: [...(g[y.station!] ?? []), y] }), {}), [shown]);
  const noStation = YOUIN_.filter((y) => !y.station);
  const toggle = (id: string) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const apply = () => {
    const prev = { selCase, members };
    hit();
    toast({ text: `${selCase ? `案件 ${selCase} の本文を転記し、` : ''}宛先に要員 ${members.length}名を設定しました`, sub: '→ 配信ページの本文と宛先に反映しました（見本）', undo: () => { setSelCase(prev.selCase); setMembers(prev.members); } });
    setSelCase(null); setMembers([]);
  };
  const refresh = () => { setLoading(true); setTimeout(() => { setLoading(false); toast({ text: '案件を更新しました（見本）', sub: '→ Slack から案件を取り直して地図を描き直しました' }); }, 800); };

  return (
    <div className="grid gap-3.5 lg:grid-cols-[340px_1fr]">
      <aside className="flex flex-col gap-2.5 self-start rounded-xl border border-line bg-surface p-3">
        <div className="flex items-center gap-2">
          <button className={ghost} onClick={refresh} disabled={loading || live} title={live ? LIVE_WRITE_BLOCKED : undefined}><RefreshCw size={12} className={loading ? 'animate-spin' : ''} />{loading ? '案件取得中…' : '案件を更新'}</button>
          <span className="text-sm text-muted">地図表示 <b className="text-ink">{shown.length}</b>名 / 案件 <b className="text-ink">{CASES_.length}</b>件</span>
        </div>
        <div className="rounded-lg bg-soft px-2.5 py-2 text-xs leading-relaxed text-muted">
          {live ? (<>
            {md.state === 'loading' && <>読み込み中…<br /></>}{md.state === 'error' && <span className="text-bad">{md.error}<br /></span>}
            対象 {md.data?.counts?.target ?? '—'}名（除外 {md.data?.counts?.excluded ?? '—'}名）／最寄駅あり {YOUIN_.length - noStation.length}・なし {noStation.length}<br />
            座標取得待ち {md.data?.counts?.pendingPeople ?? 0}名{ly.outside > 0 && `・簡易な地図の枠の外 ${ly.outside}名`}<br />
          </>) : (<>
          対象 {YOUIN_COUNTS.target}名（除外 {YOUIN_COUNTS.excluded}名）／最寄駅あり {YOUIN.length - noStation.length}・なし {noStation.length}（見本）<br />
          座標取得待ち {YOUIN_COUNTS.pending}名（{YOUIN_COUNTS.pendingNames.join('、')}）→ もう一度「更新」を押すと表示されます<br />
          </>)}
          <button className="font-semibold underline" style={{ color: 'var(--ad)' }} onClick={() => setNoSt((v) => !v)}>最寄駅が空の {noStation.length}名を見る</button>
          {noSt && <span className="block">{noStation.map((y) => y.name).join('、')}（営業用リストの最寄駅を埋めると地図に出ます）</span>}
        </div>
        <label className="flex items-center gap-1.5 rounded-[10px] border border-field px-2"><Search size={13} className="text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・駅で要員を絞り込み" className="min-h-9 flex-1 bg-transparent text-body outline-none" /></label>
        <div className="flex items-center justify-between border-t border-line-soft pt-2 text-body font-bold">案件情報（{CASES_.length}）
          <span className="text-xs font-normal"><button className="underline" onClick={() => setHidden({})}>全表示</button> / <button className="underline" onClick={() => setHidden(Object.fromEntries(CASES_.map((c) => [c.kNo, true])))}>全非表示</button></span></div>
        <div className="flex max-h-[520px] flex-col gap-2 overflow-y-auto">
          {CASES_.map((c) => { const isSel = selCase === c.kNo; return (
            <div key={c.kNo} className="rounded-lg border p-2.5 text-sm" style={{ borderColor: isSel ? 'var(--a)' : 'var(--color-line)', background: isSel ? 'var(--as)' : undefined }}>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-muted"><input type="checkbox" checked={!hidden[c.kNo]} onChange={() => setHidden((h) => ({ ...h, [c.kNo]: !h[c.kNo] }))} />表示</label>
                <span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>{c.kNo}</span><span className="text-faint">{c.date}</span>
                <button className={`${ghost} ml-auto`} onClick={() => setSelCase(isSel ? null : c.kNo)} style={isSel ? { color: 'var(--ad)', borderColor: 'var(--a)' } : undefined}>{isSel ? <><Check size={12} />選択中</> : '選択'}</button>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">{c.stations.map((s) => <span key={s} className="text-xs text-muted"><MapPin size={10} className="inline" />{s}</span>)}{c.remote && <span className="text-xs" style={{ color: 'var(--tone-info-fg)' }}>リモート併用</span>}</div>
              <div className="mt-1 cursor-pointer text-muted hover:text-ink" onClick={() => setFocus(c.kNo)}>{c.content}</div>
            </div>); })}
        </div>
        <div className="flex gap-3 border-t border-line-soft pt-2 text-xs text-muted">
          <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-full" style={{ background: 'var(--tone-info-fg)' }} />要員（最寄駅）</span>
          <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-full" style={{ background: 'var(--tone-warn-fg)' }} />案件</span></div>
      </aside>

      <div className="self-start lg:sticky lg:top-3">
        <BaseMap onBg={() => setPop(null)} overlay={pop && byStation[pop] && (() => { const s = at(pop)!, list = byStation[pop]; return (
          <div className="absolute z-10 w-[220px] -translate-x-1/2 -translate-y-[calc(100%+26px)] rounded-lg border border-line bg-surface p-2.5 text-sm shadow-lg" style={pct(s.lat, s.lng)}>
            <button className="absolute right-1.5 top-1.5 text-faint" onClick={() => setPop(null)} aria-label="閉じる"><X size={13} /></button>
            <div className="mb-1 font-bold"><Train size={12} className="inline" /> {pop}（{list.length}名）</div>
            {list.map((y) => <label key={y.id} className="flex items-center gap-1.5 py-0.5"><input type="checkbox" checked={members.includes(y.id)} onChange={() => toggle(y.id)} />
              <button className="font-semibold underline" style={{ color: 'var(--ad)' }} onClick={(e) => { e.preventDefault(); setDetail(y); }}>{y.name}</button></label>)}
          </div>); })()}>
          {CASES_.filter((c) => !hidden[c.kNo]).flatMap((c, ci) => c.stations.map((st) => {
            const s = at(st); if (!s) return null; const p = xy(s.lat, s.lng), on = focus === c.kNo || selCase === c.kNo;
            return <g key={c.kNo + st} transform={`translate(${p.x + 12 + (ci % 3) * 5},${p.y - 10 - (ci % 2) * 5})`} onClick={(e) => { e.stopPropagation(); setFocus(c.kNo); }} className="cursor-pointer">
              <title>{`${c.kNo}（${st}）${c.remote ? ' リモート併用' : ''}\n${c.content}`}</title>
              {on && <circle r={13} fill="var(--tone-warn-bg)" className="mo-pulse" />}<circle r={7} fill="var(--tone-warn-fg)" stroke="var(--color-surface)" strokeWidth={2} /></g>;
          }))}
          {Object.entries(byStation).map(([st, list]) => {
            const s = at(st)!, p = xy(s.lat, s.lng), r = Math.min(9 + list.length * 1.5, 22), picked = list.some((y) => members.includes(y.id));
            return <g key={st} onClick={(e) => { e.stopPropagation(); setPop(st); }} className="cursor-pointer">
              <title>{`${st} ${list.length}`}</title>
              <circle cx={p.x} cy={p.y} r={r} fill="var(--tone-info-fg)" fillOpacity={0.85} stroke={picked ? 'var(--a)' : 'var(--color-surface)'} strokeWidth={picked ? 4 : 2} />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--color-surface)">{list.length}</text></g>;
          })}
        </BaseMap>
        <p className="mt-1.5 text-xs text-faint">要員は営業用リストの最寄駅、案件は Slack に流れた案件の現場の駅に出します。駅の丸を押すと名前が出て、チェックで配信の宛先に入れられます。</p>
      </div>

      {(selCase || members.length > 0) && (
        <div className="mo-fade-up fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-body shadow-lg">
          <span>{selCase ? <>案件 <b>{selCase}</b></> : <span className="text-warn">案件 未選択</span>}　／　要員 <b>{members.length}</b> 名</span>
          <button className={ghost} onClick={() => { setSelCase(null); setMembers([]); }}>選択解除</button>
          <button className="btn-primary" disabled={!canEdit} title={canEdit ? undefined : live ? LIVE_WRITE_BLOCKED : needText('edit')} onClick={apply}>転記＆配信先設定</button>
        </div>
      )}

      {detail && (
        <DrawerPortal>
          <div className="fixed inset-0 z-40 bg-sumi/30" onClick={() => setDetail(null)} />
          <aside className="mo-drawer drawer gap-3 overflow-y-auto p-5">
            <div className="flex items-center justify-between"><h2 className="text-md font-bold">要員詳細情報</h2><button onClick={() => setDetail(null)} aria-label="閉じる"><X size={16} /></button></div>
            {live ? <div className="text-lg font-bold"><PersonName name={detail.name} className="underline-offset-2 hover:underline" /></div> : <PersonName name={detail.name} className="text-lg font-bold hover:underline underline-offset-2" />}
            {live && <p className="text-sm text-muted">サマリ・前職・面談可能日は要員リストの要員ページで見られます。<Link href={`/eigyo/proper?q=${encodeURIComponent(detail.name)}`} className="font-semibold" style={{ color: 'var(--ad)' }}>要員リストを開く</Link></p>}
            <dl className="grid grid-cols-[84px_1fr] gap-y-2 text-body">
              <dt className="text-faint">最寄駅</dt><dd>{detail.station}</dd>
              <dt className="text-faint">タグ</dt><dd className="flex flex-wrap gap-1">{detail.tags.map((t) => <span key={t} className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{t}</span>)}</dd>
              <dt className="text-faint">サマリ</dt><dd>{detail.summary}</dd><dt className="text-faint">前職経験</dt><dd>{detail.career}</dd>
            </dl>
            <div className="rounded-lg bg-soft p-3 text-sm"><div className="mb-1 font-semibold">面談可能日程</div>{detail.dates.length ? detail.dates.map((d) => <div key={d}>{d}</div>) : <span className="text-faint">まだありません</span>}</div>
            <div className="rounded-lg bg-soft p-3 text-sm"><div className="mb-1 font-semibold">メモ（送信本文には含まれません）</div>{detail.memo ?? <span className="text-faint">メモ情報なし</span>}</div>
          </aside>
        </DrawerPortal>
      )}
    </div>
  );
}
