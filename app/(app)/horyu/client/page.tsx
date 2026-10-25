'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, FileText, Search, Train, Users, X } from 'lucide-react';
import { PageTitle } from '@/components/ui';
import { useMotivation } from '@/components/Motivation';
import { DrawerPortal } from '@/components/DrawerPortal';
import { errText, horyuPost } from '@/lib/horyu-post';
import { CLIENT_LIST, type ClientList, type ClientPerson, type HistoryGroup, type MatchRead } from '@/lib/horyu-sample';
import { HoryuNote } from '../HoryuNote';

// 客先向けの画面（保留）。今の社内システムの客先の画面（client.html「ご紹介可能なメンバー」）を写したもの。
//   ・鍵は客先向けリンクの URL の #k=…（サーバーには送らず、この画面が X-Client-Key で渡す＝今と同じ）。URL を貼っても開ける
//   ・一覧（list）＝★今のシステムが「最後に見た日時・見た回数」を書く。客先の画面を開いたときだけ読む（社内の一覧では読まない）
//   ・案件から探す（match）＝案件文 → 条件を読み取って合う人。並びは「必須が全部合う人」が先、その中は 歓迎条件の一致×10＋通勤の回答あり
//   ・意向を確認してほしい（request）＝意向確認依頼に「客先：○○」で積む・よろずやに知らせる／今回は見送り（decline）＝理由の記録だけ
//   ・お名前は出ない（イニシャル・年代・スキルだけ）。体のこと（既往歴）は今のシステムが「ないと答えた人」だけに絞っていて、中身は返ってこない
//   ・ログインしていないときは見本
type Tab = 'match' | 'catalog' | 'map' | 'history';
const keyFromHash = (h: string) => /[#&]k=([A-Za-z0-9_-]+)/.exec(h)?.[1] ?? '';
const ghost = 'inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 text-[12px] font-semibold disabled:opacity-40';
const inp = 'min-h-9 w-full rounded-[10px] border border-field bg-surface px-2.5 text-[13px] text-ink';
const tone = (t: string) => ({ background: `var(--tone-${t}-bg)`, color: `var(--tone-${t}-fg)` });
const when = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function sampleMatch(people: ClientPerson[], text: string): { read: MatchRead; results: ClientPerson[] } {
  const want = ['ITパスポート', 'CCNA', 'MOS'].filter((w) => text.includes(w)), must = ['Excel'].filter((w) => text.includes(w));
  const results = people.map((p) => {
    const hits = want.filter((w) => p.shikaku.includes(w));
    const fit = [...must.map((m) => ({ ok: p.tools.includes(m) ? true : false, text: p.tools.includes(m) ? m : `${m}（経験の記載なし）` })), ...hits.map((h) => ({ ok: true as boolean | null, text: `${h}（歓迎条件）` })), { ok: null, text: '通勤エリアは担当から確認します' }];
    return { ...p, fit, mustAll: must.every((m) => p.tools.includes(m)), score: hits.length * 10 };
  }).sort((a, b) => (a.mustAll === b.mustAll ? b.score - a.score : a.mustAll ? -1 : 1));
  return { read: { station: '', start: /(\d{1,2})月/.exec(text)?.[0] ?? '', must, want }, results };
}

export default function ClientPage() {
  const [key, setKey] = useState(''), [paste, setPaste] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'live' | 'sample' | 'error'>('idle'), [err, setErr] = useState('');
  const [d, setD] = useState<ClientList | null>(null);
  const [tab, setTab] = useState<Tab>('match');
  const [caseText, setCaseText] = useState(''), [station, setStation] = useState(''), [matching, setMatching] = useState(false);
  const [read, setRead] = useState<MatchRead | null>(null), [results, setResults] = useState<ClientPerson[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set()), [declining, setDeclining] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClientPerson | null>(null), [confirm, setConfirm] = useState(false), [sending, setSending] = useState(false);
  const [history, setHistory] = useState<HistoryGroup[] | null>(null);
  const [cat, setCat] = useState({ job: '', month: '', q: '' }), [mapQ, setMapQ] = useState(''), [mapPick, setMapPick] = useState<string | null>(null);
  const { toast } = useMotivation();
  const live = state === 'live';

  const load = async (k: string) => {
    setState('loading'); setErr('');
    const r = await horyuPost<ClientList>('client', { op: 'list', key: k });
    if (r.status === 401 && r.data.error === 'not_logged_in') { setD(CLIENT_LIST); setState('sample'); return; }
    if (!r.ok) { setErr(r.data.error === 'revoked' ? 'このリンクは停止されています' : r.data.error === 'invalid' ? 'リンクが正しくありません' : errText(r)); setState('error'); return; }
    setD(r.data); setState('live');
  };
  useEffect(() => {
    const k = keyFromHash(window.location.hash);
    if (k) { setKey(k); load(k); }
    else { // 鍵が無くても、ログインしていなければ見本を出す
      fetch('/api/ike/client-view?action=links', { cache: 'no-store' }).then((r) => { if (r.status === 401) { setD(CLIENT_LIST); setState('sample'); } }).catch(() => {});
    }
  }, []);
  const openPasted = () => {
    const k = keyFromHash(paste) || (/^[A-Za-z0-9_-]{16,128}$/.test(paste.trim()) ? paste.trim() : '');
    if (!k) { toast({ text: '客先向けリンクの URL（#k= がついたもの）を貼ってください' }); return; }
    window.history.replaceState(null, '', `#k=${k}`); setKey(k); load(k);
  };

  const people = useMemo(() => d?.people ?? [], [d]);
  const mine = d?.mine ?? {};
  const find = (ref: string) => (results ?? []).find((p) => p.ref === ref) ?? people.find((p) => p.ref === ref);
  const toggle = (ref: string) => setSel((s) => { const n = new Set(s); if (n.has(ref)) n.delete(ref); else { if (n.size >= 10) { toast({ text: '一度に選べるのは10名までです' }); return s; } n.add(ref); } return n; });

  const runMatch = async () => {
    const t = caseText.trim();
    if (!t) { toast({ text: '案件情報を貼り付けてください' }); return; }
    setMatching(true);
    if (!live) { const m = sampleMatch(people, t); setRead(m.read); setResults(m.results); setMatching(false); return; }
    const r = await horyuPost<{ read: MatchRead; results: ClientPerson[] }>('client', { op: 'match', key, caseText: t, station });
    setMatching(false);
    if (!r.ok) { toast({ text: errText(r) }); return; }
    setRead(r.data.read); setResults(r.data.results);
  };
  const request = async () => {
    const refs = [...sel];
    setSending(true);
    if (!live) { await new Promise((r) => setTimeout(r, 400)); setD((x) => x && { ...x, mine: { ...x.mine, ...Object.fromEntries(refs.map((r) => [r, 'request'])) } }); }
    else {
      const r = await horyuPost<{ accepted?: string[] }>('client', { op: 'request', key, refs, source: tab === 'match' ? 'match' : 'catalog', caseText: tab === 'match' ? caseText : '' });
      if (!r.ok) { setSending(false); setConfirm(false); toast({ text: errText(r) }); return; }
      setD((x) => x && { ...x, mine: { ...x.mine, ...Object.fromEntries((r.data.accepted ?? []).map((a) => [a, 'request'])) } });
    }
    setSending(false); setConfirm(false); setSel(new Set()); setHistory(null);
    toast({ text: `受け付けました。担当からご連絡します${live ? '' : '（見本）'}` });
  };
  const decline = async (ref: string, reason: string) => {
    setDeclining(null);
    if (live) { const r = await horyuPost('client', { op: 'decline', key, ref, reason, caseText }); if (!r.ok) { toast({ text: errText(r) }); return; } }
    setD((x) => x && { ...x, mine: { ...x.mine, [ref]: 'decline' } }); setSel((s) => { const n = new Set(s); n.delete(ref); return n; });
    toast({ text: `見送りにしました${live ? '' : '（見本）'}` });
  };
  useEffect(() => {
    if (tab !== 'history' || history !== null || !d) return;
    if (!live) { setHistory(Object.keys(mine).length ? [{ at: new Date().toISOString(), kind: 'request', source: 'catalog', caseNo: '', caseTitle: '', reason: '', people: Object.keys(mine).map((r) => ({ ref: r, no: find(r)?.no ?? '', initial: find(r)?.initial ?? '', listed: true })) }] : []); return; }
    horyuPost<{ history: HistoryGroup[] }>('client', { op: 'history', key }).then((r) => setHistory(r.ok ? r.data.history : []));
  }, [tab, history, d]); // eslint-disable-line react-hooks/exhaustive-deps

  const card = (p: ClientPerson) => {
    const st = mine[p.ref], on = sel.has(p.ref);
    return (
      <article key={p.ref} className="flex flex-col gap-2 rounded-xl border bg-surface p-3.5 text-[12.5px]" style={{ borderColor: on ? 'var(--a)' : 'var(--color-line)' }}>
        <div className="flex items-center gap-2.5">
          <div className="flex size-11 items-center justify-center rounded-full bg-soft text-[13px] font-bold">{p.initial || '非公開'}</div>
          <div><div className="font-bold">{p.initial || '候補者'}</div><div className="text-[11.5px] text-muted">{[p.age || '年代非公開', p.gender].filter(Boolean).join('・')}</div><div className="text-[11px] text-faint">No.{p.no}</div></div>
          <button aria-pressed={on} aria-label="選ぶ" onClick={() => toggle(p.ref)} className="ml-auto flex size-8 items-center justify-center rounded-full border" style={on ? { background: 'var(--a)', borderColor: 'var(--a)', color: 'var(--ao, #fff)' } : { borderColor: 'var(--color-line)' }}><Check size={15} /></button>
        </div>
        <div className="flex flex-wrap gap-1">{p.kadou && <span className="chip" style={tone('ok')}>{p.kadou}{/[〜~から]$|即/.test(p.kadou) ? '' : '〜'} 稼働可</span>}{p.tags.map((t) => <span key={t} className="chip" style={tone('mute')}>{t}</span>)}</div>
        {p.fit && p.fit.length > 0 && <div className="flex flex-col gap-0.5">{p.fit.map((f, i) => <div key={i} style={{ color: f.ok === true ? 'var(--tone-ok-fg)' : f.ok === false ? 'var(--tone-warn-fg)' : 'var(--color-muted)' }}>{f.ok === true ? '✓' : f.ok === false ? '△' : '？'} {f.text}</div>)}</div>}
        <dl className="grid grid-cols-[48px_1fr] gap-y-1">
          <dt className="text-faint">経験</dt><dd>{p.jobs.length ? p.jobs.map((j) => `${j.job}${j.years ? `（${j.years}）` : ''}`).join('・') : '—'}</dd>
          <dt className="text-faint">資格</dt><dd>{p.shikaku || '—'}</dd><dt className="text-faint">最寄駅</dt><dd>{p.eki || '—'}</dd>
        </dl>
        {p.pdf && /^https:\/\/(drive|docs)\.google\.com\//.test(p.pdf) && <a href={p.pdf} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--ad)' }}><FileText size={13} />スキルシート（PDF）を開く</a>}
        {(p.tools || p.tokui || p.kibou || p.summary) && <button className="self-start text-[12px] text-muted underline" onClick={() => setDetail(p)}>ツール・得意分野・紹介文を見る</button>}
        {st === 'request' && <div className="rounded-lg px-2 py-1" style={tone('ok')}>意向確認を依頼済みです（結果は担当からご連絡します）</div>}
        {st === 'decline' && <div className="rounded-lg px-2 py-1" style={tone('mute')}>前回は見送りにしました</div>}
        {declining === p.ref ? (
          <div className="flex flex-col gap-1.5"><span className="text-muted">見送りの理由を教えてください（今後のご提案に活かします）</span>
            <div className="flex flex-wrap gap-1.5">{(d?.declineReasons ?? []).map((r) => <button key={r} className={ghost} onClick={() => decline(p.ref, r)}>{r}</button>)}<button className="text-[12px] text-muted underline" onClick={() => setDeclining(null)}>戻る</button></div></div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <button className={on ? ghost : 'btn-primary min-h-8 rounded-lg px-3 text-[12px] font-semibold'} onClick={() => toggle(p.ref)}>{on ? '選択を外す' : st === 'request' ? 'もう一度依頼する' : 'この人財を選ぶ'}</button>
            {tab === 'match' && <button className={ghost} onClick={() => setDeclining(p.ref)}>今回は見送り</button>}
          </div>
        )}
      </article>
    );
  };

  const jobs = useMemo(() => { const c: Record<string, number> = {}; people.forEach((p) => p.jobs.forEach((j) => { c[j.job] = (c[j.job] || 0) + 1; })); return Object.keys(c).sort((a, b) => c[b] - c[a]); }, [people]);
  const catHit = (p: ClientPerson) => {
    if (cat.job && !p.jobs.some((j) => j.job === cat.job)) return false;
    if (cat.month) { const km = /(\d{1,2})\s*月/.exec(p.kadou); const mm = Number(cat.month); if (!(km ? Number(km[1]) === mm : /即/.test(p.kadou) && mm === new Date().getMonth() + 1)) return false; }
    if (cat.q) { const hay = [p.shikaku, p.tools, p.tokui, p.kibou, p.eki, ...p.jobs.map((j) => j.job)].join(' ').toLowerCase(); if (!cat.q.toLowerCase().split(/[\s　]+/).filter(Boolean).every((w) => hay.includes(w))) return false; }
    return true;
  };
  const mapHit = (p: ClientPerson) => { const w = mapQ.toLowerCase().split(/[\s　]+/).filter(Boolean); const hay = [p.initial, p.eki, p.shikaku, p.tools, p.kibou, ...p.jobs.map((j) => j.job)].join(' ').toLowerCase(); return w.every((x) => hay.includes(x)); };
  const byEki = useMemo(() => people.filter(mapHit).reduce<Record<string, ClientPerson[]>>((g, p) => (p.eki ? { ...g, [p.eki]: [...(g[p.eki] ?? []), p] } : g), {}), [people, mapQ]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-28 pt-[22px]">
      <PageTitle title="客先向けの画面" sub="客先向けリンクを開いた客先が見る画面です（ご紹介可能なメンバー）" />
      <HoryuNote from="客先向けの画面（client.html）" />
      {state === 'idle' || state === 'error' ? (
        <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
          {state === 'error' && <div className="rounded-lg px-3 py-2 text-[12.5px]" style={tone('bad')}>{err}</div>}
          <p className="text-[12.5px] text-muted">客先向けリンクの URL（#k= がついたもの）で開いた客先の画面です。社内で中身を見るときは URL を貼ってください。
            <b>開くと、そのリンクの「最終閲覧・閲覧回数」が1回増えます</b>（客先が見た記録と区別できません）。</p>
          <div className="flex flex-wrap gap-2"><input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="https://…/client.html#k=…" className={`${inp} flex-1`} /><button className="btn-primary min-h-9 rounded-[10px] px-4 text-[13px] font-semibold" onClick={openPasted}>開く</button></div>
        </section>
      ) : state === 'loading' || !d ? <div className="py-10 text-center text-[13px] text-faint">読み込み中…</div> : (<>
        {state === 'sample' && <div className="rounded-xl border border-line bg-soft px-4 py-2.5 text-[12.5px] text-muted">いまは見本データです（本物の客先の画面はログインして、客先向けリンクの URL で開きます）。</div>}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3">
          <Users size={18} /><b>ご紹介可能なメンバー</b><span className="text-[12px] text-faint">{new Date().getMonth() + 1}月{new Date().getDate()}日時点</span>
          <b className="ml-auto">{d.client} 様</b>
        </div>
        <div role="tablist" className="flex gap-1 border-b border-line">
          {([['match', '案件から探す'], ['catalog', '人財カタログ'], ['map', 'MAP'], ['history', '送信履歴']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setDeclining(null); }} className="px-3.5 py-2.5 text-[14px]"
              style={tab === k ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: 'var(--color-muted)' }}>{l}</button>))}
        </div>

        {tab === 'match' && (<div className="flex flex-col gap-3">
          <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
            <b>案件情報を貼り付けてください</b><span className="text-[12px] text-muted">最寄駅・開始時期・必須スキルなどを読み取り、条件に合うメンバーをお出しします。</span>
            <textarea rows={6} value={caseText} onChange={(e) => { setCaseText(e.target.value); setStation(''); }} className="w-full rounded-[10px] border border-field bg-surface p-2.5 text-[13px]"
              placeholder={'例）\n【案件】社内ヘルプデスク（PCキッティング含む）\n最寄駅: 浜松町駅\n開始: 11月〜\n必須: Excel\n歓迎: ITパスポート'} />
            <div className="flex flex-wrap items-center gap-2"><button className="btn-primary inline-flex min-h-9 items-center gap-1 rounded-[10px] px-4 text-[13px] font-semibold disabled:opacity-40" disabled={matching} onClick={runMatch}><Search size={14} />{matching ? '探しています…' : '候補を探す'}</button>
              <span className="text-[11.5px] text-faint">貼り付けた案件情報は当社の担当営業にも共有されます</span></div>
          </section>
          {read && (
            <section className="flex flex-col gap-2 rounded-xl border border-line bg-soft p-3 text-[12.5px]">
              <b>読み取った条件</b>
              <div className="flex flex-wrap gap-1">{read.station && <span className="chip" style={tone('info')}>最寄：{read.station}</span>}
                <span className="chip" style={tone(read.start ? 'info' : 'mute')}>{read.start ? `${read.start}から稼働` : '開始時期の記載なし'}</span>
                {read.needs?.shift && <span className="chip" style={tone('info')}>シフト勤務</span>}{read.needs?.yakin && <span className="chip" style={tone('info')}>夜勤</span>}{read.needs?.shucchou && <span className="chip" style={tone('info')}>出張</span>}
                {read.must.map((t) => <span key={t} className="chip" style={tone('warn')}>必須：{t}</span>)}{read.want.map((t) => <span key={t} className="chip" style={tone('ok')}>歓迎：{t}</span>)}</div>
              {!read.station && (<div className="flex flex-col gap-1"><span>{read.stationTried ? `「${read.stationTried}」の場所を特定できませんでした。` : '最寄駅を読み取れませんでした。'}現場の最寄駅を入力してください</span>
                <div className="flex gap-2"><input value={station} onChange={(e) => setStation(e.target.value)} placeholder="例）浜松町" className={`${inp} max-w-[200px]`} /><button className={ghost} onClick={runMatch}>この駅で探す</button></div>
                <span className="text-[11.5px] text-faint">入力するまでは、通勤できるかどうかでは絞っていません。</span></div>)}
            </section>)}
          {results && (() => { const full = results.filter((x) => x.mustAll), part = results.filter((x) => !x.mustAll); return (<>
            <div className="text-[13px]"><b className="text-[18px]">{full.length}</b> 名が条件に合います{part.length > 0 && `（一部の条件に合う方 ${part.length}名）`}</div>
            {!results.length && <div className="rounded-xl border border-line bg-surface p-6 text-center text-[12.5px] text-muted">条件に合うメンバーが見つかりませんでした。条件を緩めるか、担当営業にご相談ください。</div>}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{full.map(card)}</div>
            {part.length > 0 && <><div className="text-[12.5px] font-semibold text-muted">必須スキルの一部に経験の記載がない方</div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{part.map(card)}</div></>}
          </>); })()}
        </div>)}

        {tab === 'catalog' && (<div className="flex flex-col gap-3">
          <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-3.5 text-[12px] text-muted">
            <div className="flex flex-col gap-1">経験のある職種<div className="flex flex-wrap gap-1">{['', ...jobs].map((j) => (
              <button key={j || 'all'} className={ghost} aria-pressed={cat.job === j} onClick={() => setCat((c) => ({ ...c, job: j }))} style={cat.job === j ? { color: 'var(--ad)', borderColor: 'var(--a)', background: 'var(--as)' } : undefined}>{j || 'すべて'}</button>))}</div></div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1">稼働開始<select value={cat.month} onChange={(e) => setCat((c) => ({ ...c, month: e.target.value }))} className={inp}><option value="">指定しない</option>{(d.kadouMonths ?? []).map((o) => <option key={o.ym} value={String(o.ym % 100)}>{o.label}</option>)}</select></label>
              <label className="flex flex-col gap-1">スキル・資格・駅で探す<input value={cat.q} onChange={(e) => setCat((c) => ({ ...c, q: e.target.value }))} placeholder="例）Excel CCNA 横浜" className={inp} /></label>
            </div>
          </section>
          {(() => { const list = people.filter(catHit); return (<>
            <div className="text-[13px]"><b className="text-[18px]">{list.length}</b> 名のメンバー</div>
            {list.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.map(card)}</div> : <div className="rounded-xl border border-line bg-surface p-6 text-center text-[12.5px] text-muted">条件に合うメンバーがいません。</div>}
          </>); })()}
        </div>)}

        {tab === 'map' && (<div className="flex flex-col gap-3">
          <input value={mapQ} onChange={(e) => setMapQ(e.target.value)} placeholder="イニシャル・駅・スキルで絞り込み" className={inp} />
          <div className="text-[12.5px] text-muted">駅ごとのメンバー（地図はあとで入れます）・地図表示 <b className="text-ink">{Object.values(byEki).reduce((a, b) => a + b.length, 0)}</b>名</div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(byEki).sort((a, b) => b[1].length - a[1].length).map(([eki, list]) => (
            <div key={eki} className="rounded-xl border border-line bg-surface p-3 text-[12.5px]">
              <button className="flex w-full items-center gap-1.5 font-bold" onClick={() => setMapPick(mapPick === eki ? null : eki)}><Train size={13} />{eki}<span className="ml-auto chip" style={tone('info')}>{list.length}名</span></button>
              {mapPick === eki && <div className="mt-2 flex flex-col gap-1">{list.map((p) => (
                <div key={p.ref} className="flex items-center gap-1.5"><label className="flex items-center gap-1"><input type="checkbox" checked={sel.has(p.ref)} onChange={() => toggle(p.ref)} />選ぶ</label>
                  <button className="font-semibold underline" style={{ color: 'var(--ad)' }} onClick={() => setDetail(p)}>{p.initial || '候補者'}</button>
                  <span className="text-muted">{[p.age, p.gender].filter(Boolean).join('・')}{mine[p.ref] === 'request' && '・依頼済み'}</span></div>))}</div>}
            </div>))}</div>
        </div>)}

        {tab === 'history' && (history === null ? <div className="py-8 text-center text-[13px] text-faint">読み込み中…</div> : !history.length
          ? <div className="rounded-xl border border-line bg-surface p-6 text-center text-[12.5px] text-muted">まだ依頼はありません。「案件から探す」「人財カタログ」でメンバーを選んで依頼できます。</div>
          : <div className="flex flex-col gap-2"><div className="text-[13px]"><b className="text-[18px]">{history.filter((g) => g.kind === 'request').length}</b> 件の依頼</div>
            {history.map((g, i) => { const req = g.kind === 'request'; return (
              <article key={i} className="rounded-xl border border-line bg-surface p-3 text-[12.5px]">
                <div className="flex items-center gap-2"><span className="chip" style={tone(req ? 'info' : 'mute')}>{req ? '依頼' : '見送り'}</span><b>{req ? `意向確認を依頼（${g.people.length}名）` : `見送り${g.reason ? `：${g.reason}` : ''}`}</b><span className="ml-auto text-faint">{when(g.at)}</span></div>
                {(req ? g.caseTitle || (g.source === 'catalog' ? '人財カタログから（案件なし）' : '案件情報なし') : g.caseTitle) && <div className="mt-1 text-muted">{req ? g.caseTitle || (g.source === 'catalog' ? '人財カタログから（案件なし）' : '案件情報なし') : g.caseTitle}</div>}
                <div className="mt-1 flex flex-wrap gap-1">{g.people.map((x) => <span key={x.ref} className="chip" style={tone(x.listed ? 'mute' : 'bad')}>{x.listed ? `${x.initial || ''} No.${x.no}` : `No.${x.no}（掲載終了）`}</span>)}</div>
              </article>); })}</div>)}

        <p className="text-[11.5px] leading-relaxed text-faint">掲載しているのは、現在ご紹介可能な当社メンバーです。個人情報保護のため、お名前はイニシャルで表示しています。「意向を確認してほしい」を押すと、当社からご本人に意向を確認し、結果を担当営業からご連絡します。</p>
      </>)}

      {sel.size > 0 && (
        <div className="mo-fade-up fixed bottom-5 left-1/2 z-30 flex max-w-[calc(100%-32px)] -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] shadow-lg">
          {confirm ? (<>
            <span><b>{sel.size}</b>名の意向確認を依頼します（{[...sel].map((r) => find(r)?.initial || `No.${find(r)?.no ?? ''}`).join('・')}）</span>
            <button className={ghost} onClick={() => setConfirm(false)}>やめる</button>
            <button className="btn-primary min-h-8 rounded-lg px-3 text-[12.5px] font-semibold disabled:opacity-40" disabled={sending} onClick={request}>{sending ? '送信中…' : '依頼する'}</button>
          </>) : (<>
            <span><b>{sel.size}</b>名を選択中</span>
            <button className={ghost} onClick={() => setSel(new Set())}>解除</button>
            <button className="btn-primary min-h-8 rounded-lg px-3 text-[12.5px] font-semibold" onClick={() => setConfirm(true)}>意向を確認してほしい</button>
          </>)}
        </div>
      )}

      {detail && (
        <DrawerPortal>
          <div className="fixed inset-0 z-40 bg-sumi/30" onClick={() => setDetail(null)} />
          <aside className="mo-drawer fixed inset-y-0 right-0 z-50 flex w-full max-w-[380px] flex-col gap-3 overflow-y-auto bg-surface p-5 shadow-xl text-[13px]">
            <div className="flex items-center gap-2"><b className="text-[16px]">{detail.initial || '候補者'}</b><span className="text-muted">{[detail.age, detail.gender, detail.eki].filter(Boolean).join('・')}</span><button className="ml-auto" onClick={() => setDetail(null)} aria-label="閉じる"><X size={16} /></button></div>
            {([['希望職種', detail.kibou], ['資格', detail.shikaku], ['ツール', detail.tools], ['得意分野', detail.tokui], ['紹介文', detail.summary]] as const).filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><div className="text-[11.5px] text-faint">{k}</div><div className="whitespace-pre-wrap">{v}</div></div>))}
            <button className="btn-primary min-h-9 rounded-[10px] px-4 text-[13px] font-semibold" onClick={() => { toggle(detail.ref); setDetail(null); }}>{sel.has(detail.ref) ? '選択を外す' : mine[detail.ref] === 'request' ? 'もう一度依頼する' : 'この人財を選ぶ'}</button>
          </aside>
        </DrawerPortal>
      )}
    </main>
  );
}
