'use client';

import { useMemo, useState } from 'react';
import { Check, MapPin, RefreshCw, Search, Train, X } from 'lucide-react';
import { BAY, MAP_H, MAP_W, RAILS, STATIONS, stationOf, xy } from '@/lib/map-geo';
import type { Youin } from '@/lib/live/map';
import { liveYouin, type MapData } from '@/lib/live/map';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import { DrawerPortal } from '@/components/DrawerPortal';
import { LiveBanner, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { PersonName } from '@/components/Person';
import { errText, horyuPost } from '@/lib/horyu-post';
import { HoryuNote } from '../HoryuNote';

// 要員マップ（保留）。今の社内システムの「要員マップ」（map.html）を1枚の画面にしたもの。
//   ・営業中の要員を最寄駅の丸、Slack の案件をオレンジの丸で出す（今と同じ）。60秒ごとに読み直す（今と同じ・見えていないタブは読まない）
//   ・本物：/api/proxy?action=getMapData（読む）。駅の丸から名前の「詳細」＝ /api/live/horyu/youin-detail（getGroups → getPersonDetail を読む）
//   ・「案件を更新」＝ Slack から案件を取り直す（今の proxy?action=syncSlackCache・/api/live/horyu/sync-slack）
//   ・「転記＆配信先設定」は今は配信ページの中に埋め込んだときだけ動く。ver2 では配信ページにつなぐ先がまだ無いので、案件文と名前を写すだけ
//   ・人は未経験の人だけ。名前を押すと人の小窓（PersonName）
//   ・地図は簡易な地図（SVG）。座標が枠の外の駅は一覧だけ
const pct = (lat: number, lng: number) => { const p = xy(lat, lng); return { left: `${(p.x / MAP_W) * 100}%`, top: `${(p.y / MAP_H) * 100}%` }; };
const ghost = 'inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 text-[12px] font-semibold disabled:opacity-40';

type Detail = {
  ok?: boolean; name?: string; eki?: string; kadou?: string; zokusei?: string; kibou?: string; shifts?: string[]; summary?: string; experience?: string;
  gakumen?: string; priceHidden?: boolean; sukishi?: string; availability?: { items?: { label: string; val: string }[]; updatedAt?: string }; error?: string;
};

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
      <span className="pointer-events-none absolute bottom-1.5 right-2 text-[10.5px] text-faint">簡易な地図です（地図タイルはあとで入れます）</span>
    </div>
  );
}

/** タグの札（今の map.html の色分けをそのまま言葉で） */
function Tag({ t }: { t: string }) {
  const tone = t.startsWith('[稼働]') ? 'ok' : t.startsWith('[希望]') ? 'info' : t.startsWith('[属性]') ? 'purple' : 'mute';
  return <span className="chip" style={{ background: `var(--tone-${tone}-bg)`, color: `var(--tone-${tone}-fg)` }}>{t.replace(/^\[(稼働|属性|希望|並行|経験)\]/, '')}</span>;
}

export default function YouinMapPage() {
  const md = useIke<MapData>('proxy?action=getMapData', { pollMs: 60_000 });
  const live = md.live;
  const ly = useMemo(() => liveYouin(live ? md.data : null), [live, md.data]);
  const mk = useMikeiken();
  const YOUIN_ = live ? mk.keep(ly.youin, 'name') : [], CASES_ = live ? ly.cases : [];
  const at = (n?: string) => (n ? (live ? ly.pos.get(n) ?? stationOf(n) : stationOf(n)) : undefined);
  const canEdit = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const [q, setQ] = useState(''), [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [selCase, setSelCase] = useState<string | null>(null), [members, setMembers] = useState<string[]>([]);
  const [pop, setPop] = useState<string | null>(null), [detail, setDetail] = useState<Youin | null>(null);
  const [got, setGot] = useState<Detail | null>(null);
  const [noSt, setNoSt] = useState(false), [loading, setLoading] = useState(false), [focus, setFocus] = useState<string | null>(null);

  const shown = YOUIN_.filter((y) => y.station && at(y.station) && (!q || y.name.includes(q) || y.station.includes(q)));
  const byStation = useMemo(() => shown.reduce<Record<string, Youin[]>>((g, y) => ({ ...g, [y.station!]: [...(g[y.station!] ?? []), y] }), {}), [shown]);
  const noStation = YOUIN_.filter((y) => !y.station);
  const toggle = (id: string) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  const openDetail = async (y: Youin) => {
    setDetail(y); setGot(null);
    if (!live) return;
    const r = await horyuPost<Detail>('youin-detail', { name: y.name });
    setGot(r.ok ? r.data : { error: errText(r) });
  };
  const refresh = async () => {
    if (!live) return;
    setLoading(true);
    const r = await horyuPost<{ added?: number }>('sync-slack', {});
    setLoading(false);
    if (!r.ok) { toast({ text: `案件を更新できませんでした：${errText(r)}` }); return; }
    hit(); toast({ text: '案件を更新しました', sub: `→ Slack から案件を取り直しました${r.data.added != null ? `（新しく ${r.data.added} 件）` : ''}` });
    md.reload();
  };
  const apply = async () => {
    const c = CASES_.find((x) => x.kNo === selCase);
    const names = YOUIN_.filter((y) => members.includes(y.id)).map((y) => y.name);
    const text = `${c ? c.content : ''}${names.length ? `\n\n宛先：${names.join('、')}` : ''}`.trim();
    try { await navigator.clipboard.writeText(text); } catch { /* 写せなくても選んだ内容は出す */ }
    hit();
    toast({ text: `案件 ${selCase ?? '（なし）'}・要員 ${names.length}名を写しました`, sub: '配信ページへの転記は、ver2 の配信につなぐときに決めます（いまは案件文と名前をコピーしただけ）' });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-24 pt-[22px]">
      <PageTitle title="要員マップ" sub={`営業中の要員を最寄駅に、Slack の案件を現場の駅に出します`} />
      <HoryuNote from="要員マップ" />
      <LiveBanner state={md.state} error={md.error} onReload={md.reload} note="今の要員マップの中身です（60秒ごとに読み直し）。地図は簡易な地図のまま（枠の外の駅は一覧だけ）" />
      <MikeikenNote mk={mk} live={live} />
      <div className="grid gap-3.5 lg:grid-cols-[340px_1fr]">
        <aside className="flex flex-col gap-2.5 self-start rounded-xl border border-line bg-surface p-3">
          <div className="flex items-center gap-2">
            <button className={ghost} onClick={refresh} disabled={!live || loading || !canEdit} title={canEdit ? undefined : needText('edit')}><RefreshCw size={12} className={loading ? 'animate-spin' : ''} />{loading ? '案件取得中…' : '案件を更新'}</button>
            <span className="text-[12px] text-muted">地図表示 <b className="text-ink">{shown.length}</b>名 / 案件 <b className="text-ink">{CASES_.length}</b>件</span>
          </div>
          <div className="rounded-lg bg-soft px-2.5 py-2 text-[11.5px] leading-relaxed text-muted">
            {live ? (<>
              対象 {md.data?.counts?.target ?? '—'}名（除外 {md.data?.counts?.excluded ?? '—'}名）／最寄駅あり {YOUIN_.length - noStation.length}・なし {noStation.length}<br />
              {(md.data?.counts?.pendingPeople ?? 0) > 0 && <>座標取得待ち {md.data?.counts?.pendingPeople}名 → もう一度読み直すと表示されます<br /></>}
              {ly.outside > 0 && <>簡易な地図の枠の外 {ly.outside}名<br /></>}
            </>) : md.state === 'loading' ? <>読み込み中…<br /></> : null}
            <button className="font-semibold underline" style={{ color: 'var(--ad)' }} onClick={() => setNoSt((v) => !v)}>最寄駅が空の {noStation.length}名を見る</button>
            {noSt && <span className="block">{noStation.map((y, i) => <span key={y.id}>{i > 0 && '、'}<PersonName name={y.name} /></span>)}（営業用リストの最寄駅を埋めると地図に出ます）</span>}
          </div>
          <label className="flex items-center gap-1.5 rounded-[10px] border border-field px-2"><Search size={13} className="text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・駅で要員を絞り込み" className="min-h-9 flex-1 bg-transparent text-[13px] outline-none" /></label>
          <div className="flex items-center justify-between border-t border-line-soft pt-2 text-[13px] font-bold">案件情報（{CASES_.length}）
            <span className="text-[11.5px] font-normal"><button className="underline" onClick={() => setHidden({})}>全表示</button> / <button className="underline" onClick={() => setHidden(Object.fromEntries(CASES_.map((c) => [c.kNo, true])))}>全非表示</button></span></div>
          <div className="flex max-h-[520px] flex-col gap-2 overflow-y-auto">
            {live && CASES_.length === 0 && <div className="py-4 text-center text-[12px] text-faint">案件がありません</div>}
            {CASES_.map((c) => { const isSel = selCase === c.kNo; return (
              <div key={c.kNo} className="rounded-lg border p-2.5 text-[12px]" style={{ borderColor: isSel ? 'var(--a)' : 'var(--color-line)', background: isSel ? 'var(--as)' : undefined }}>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-muted"><input type="checkbox" checked={!hidden[c.kNo]} onChange={() => setHidden((h) => ({ ...h, [c.kNo]: !h[c.kNo] }))} />表示</label>
                  {c.kNo && <span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>{c.kNo}</span>}<span className="text-faint">{c.date}</span>
                  <button className={`${ghost} ml-auto`} onClick={() => setSelCase(isSel ? null : c.kNo)} style={isSel ? { color: 'var(--ad)', borderColor: 'var(--a)' } : undefined}>{isSel ? <><Check size={12} />選択中</> : '選択'}</button>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">{c.stations.map((s) => <span key={s} className="text-[11px] text-muted"><MapPin size={10} className="inline" />{s}</span>)}{c.remote && <span className="text-[11px]" style={{ color: 'var(--tone-info-fg)' }}>リモート併用</span>}</div>
                <div className="mt-1 cursor-pointer text-muted hover:text-ink" onClick={() => setFocus(c.kNo)}>{c.content.slice(0, 160)}</div>
              </div>); })}
          </div>
          <div className="flex gap-3 border-t border-line-soft pt-2 text-[11.5px] text-muted">
            <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-full" style={{ background: 'var(--tone-info-fg)' }} />要員（最寄駅）</span>
            <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-full" style={{ background: 'var(--tone-warn-fg)' }} />案件</span></div>
        </aside>

        <div className="self-start lg:sticky lg:top-3">
          <BaseMap onBg={() => setPop(null)} overlay={pop && byStation[pop] && (() => { const s = at(pop)!, list = byStation[pop]; return (
            <div className="absolute z-10 w-[220px] -translate-x-1/2 -translate-y-[calc(100%+26px)] rounded-lg border border-line bg-surface p-2.5 text-[12.5px] shadow-lg" style={pct(s.lat, s.lng)}>
              <button className="absolute right-1.5 top-1.5 text-faint" onClick={() => setPop(null)} aria-label="閉じる"><X size={13} /></button>
              <div className="mb-1 font-bold"><Train size={12} className="inline" /> {pop}（{list.length}名）</div>
              {list.map((y) => <div key={y.id} className="flex items-center gap-1.5 py-0.5">
                <input type="checkbox" aria-label={`${y.name}を宛先に入れる`} checked={members.includes(y.id)} onChange={() => toggle(y.id)} />
                <PersonName name={y.name} />
                <button className="ml-auto text-[11px] text-muted underline" onClick={() => openDetail(y)}>詳細</button></div>)}
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
          <p className="mt-1.5 text-[11.5px] text-faint">要員は営業用リストの最寄駅、案件は Slack に流れた案件の現場の駅に出します。駅の丸を押すと名前が出ます。チェックで宛先に入れ、案件を1件選んで「転記＆配信先設定」。</p>
        </div>
      </div>

      {(selCase || members.length > 0) && (
        <div className="mo-fade-up fixed bottom-5 left-1/2 z-30 flex max-w-[calc(100%-32px)] -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] shadow-lg">
          <span>{selCase ? <>案件 <b>{selCase}</b></> : <span className="text-warn">案件 未選択</span>}　／　要員 <b>{members.length}</b> 名</span>
          <button className={ghost} onClick={() => { setSelCase(null); setMembers([]); }}>選択解除</button>
          <button className="btn-primary min-h-8 rounded-lg px-3 text-[12.5px] font-semibold" onClick={apply}>転記＆配信先設定</button>
        </div>
      )}

      {detail && (
        <DrawerPortal>
          <div className="fixed inset-0 z-40 bg-sumi/30" onClick={() => setDetail(null)} />
          <aside className="mo-drawer fixed inset-y-0 right-0 z-50 flex w-full max-w-[380px] flex-col gap-3 overflow-y-auto bg-surface p-5 shadow-xl">
            <div className="flex items-center justify-between"><h2 className="text-[15px] font-bold">要員詳細情報</h2><button onClick={() => setDetail(null)} aria-label="閉じる"><X size={16} /></button></div>
            <PersonName name={detail.name} className="self-start text-[17px] font-bold underline-offset-2 hover:underline" />
            {live ? (!got ? <div className="text-[12.5px] text-faint">情報を取得中…</div> : got.error ? <div className="text-[12.5px] text-bad">情報を取得できませんでした：{got.error}</div> : (<>
              <dl className="grid grid-cols-[84px_1fr] gap-y-2 text-[13px]">
                {got.eki && <><dt className="text-faint">最寄駅</dt><dd>{got.eki}</dd></>}
                {(got.kadou || got.zokusei || got.kibou || got.shifts?.length) ? <><dt className="text-faint">タグ</dt><dd className="flex flex-wrap gap-1">
                  {got.kadou && <Tag t={`[稼働]${got.kadou}`} />}{got.zokusei && <Tag t={`[属性]${got.zokusei}`} />}{got.kibou && <Tag t={`[希望]${got.kibou}`} />}{got.shifts?.map((s) => <Tag key={s} t={s} />)}</dd></> : null}
                {got.summary && <><dt className="text-faint">サマリ</dt><dd className="whitespace-pre-wrap">{got.summary}</dd></>}
                {got.experience && <><dt className="text-faint">前職経験</dt><dd className="whitespace-pre-wrap">{got.experience}</dd></>}
                {got.gakumen ? <><dt className="text-faint">額面</dt><dd>{got.gakumen}</dd></> : got.priceHidden ? <><dt className="text-faint">額面</dt><dd className="text-faint">あなたのロールでは見られません</dd></> : null}
                {got.sukishi && <><dt className="text-faint">スプシ</dt><dd>{/^https:\/\//.test(got.sukishi) ? <a href={got.sukishi} target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: 'var(--ad)' }}>別窓で開く</a> : got.sukishi}</dd></>}
              </dl>
              <div className="rounded-lg bg-soft p-3 text-[12.5px]"><div className="mb-1 font-semibold">面談可能日程{got.availability?.updatedAt && <span className="ml-1 font-normal text-faint">（{got.availability.updatedAt} 取込）</span>}</div>
                {got.availability?.items?.length ? got.availability.items.map((d) => <div key={d.label} className="flex gap-2"><span className="w-24 text-muted">{d.label}</span>{d.val}</div>) : <span className="text-faint">まだありません</span>}</div>
            </>)) : null}
            <p className="text-[11.5px] text-faint">営業用リストのメモはここには出しません（出すかはあとで決めます）。</p>
          </aside>
        </DrawerPortal>
      )}
    </main>
  );
}
