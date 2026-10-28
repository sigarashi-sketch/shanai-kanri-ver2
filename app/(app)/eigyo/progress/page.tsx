'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock, CornerUpLeft, LayoutList, MessageSquareText, Plus, Rows3, X } from 'lucide-react';
import type { Candidate, Case, ChatMsg, ProgressRow, Via } from '@/lib/types/eigyo';
import { PageTitle, PrimaryButton } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { DrawerPortal } from '@/components/DrawerPortal';
import { LiveBanner, useIke } from '@/components/Live';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { postLive } from '@/lib/live/post';
import { groupBubbles, threadBubbles, type GroupThreadRes, type ThreadRes } from '@/lib/live/person';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { gidOfRow, liveDirectRows, liveProgress, type DirectData } from '@/lib/live/progress';
import { matchGroupName, mdhm, type ProgressData, type ProgressReply } from '@/lib/live/eigyo-common';
import { PersonName } from '@/components/Person';
import { ColumnPicker, useColumns, type ColDef } from '@/components/jinji/ColumnPicker';
import { Quote } from '@/components/ChatLog';

// 案件進捗（単独の画面・2026-10-23 shoya）。
//   ・送った案件 … あおい／グループ直接／手動配信 のどれで送った分も1本で並べる。返信・OK/NG は経路に関係なく同じ扱い
//   ・回収候補 … 内勤がグループに直接書いた「案件らしい発言」。一番近い案件を当てて、内勤が✓で確定したものだけ載せる
//     どの案件か迷うものは「チャットで前後を見る」でグループのやりとりを確かめてから決める
//   見え方（10-28 shoya「まえの管理みたいな UI に・配信ごとに送ったもので」）：「配信ごと」＝今の progress.html と同じ
//     案件のカード → 送った回（送信: 日時）ごと → 送り先のチップ（✓返信あり＋何時間以内／⏳◯日経過）。チップを押すとやりとり・その場で OK/NG
//     「表」＝前のとおり1行1送り先。どちらもこの端末に覚える。引用リプライで返された返信は ↩ を付け、やりとりに引用元を出す
//   カスタム（10-27）：列（出す・並び）・並べ方・判断での絞り込み・自分のタブ（いまの絞り込みに名前を付けて残す）。どれもこの端末に覚える
//   本物（ログイン中）：今の /api/proxy?action=getProgressData と getProgressReplies（直近7日の送信）。
//     OK/NG は今の📮判断と同じ口（/api/live/eigyo judge → markSlackForwarded。OK は確認のうえ Slack の案件スレッドへ・NG は取り消せる）
//     回収候補＝/api/roster?op=eigyo&action=direct（内勤のグループ発言から拾う・10-26 足した）。✓で載せた分は「グループ直接」で送った案件に並ぶ
const VIA_STYLE: Record<Via, { bg: string; fg: string }> = {
  あおい: { bg: 'var(--tone-info-bg)', fg: 'var(--tone-info-fg)' },
  グループ直接: { bg: 'var(--tone-warn-bg)', fg: 'var(--tone-warn-fg)' },
  手動配信: { bg: 'var(--tone-purple-bg)', fg: 'var(--tone-purple-fg)' },
};
const DEC_STYLE: Record<string, { bg: string; fg: string }> = {
  OK: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)' }, NG: { bg: 'var(--tone-mute-bg)', fg: 'var(--tone-mute-fg)' }, その他: { bg: 'var(--tone-purple-bg)', fg: 'var(--tone-purple-fg)' }, 未判断: { bg: 'var(--tone-bad-bg)', fg: 'var(--tone-bad-fg)' },
};
const Chip = ({ s, children }: { s: { bg: string; fg: string }; children: React.ReactNode }) => (
  <span className="chip" style={{ background: s.bg, color: s.fg }}>{children}</span>
);
const scoreTone = (n: number) => (n >= 85 ? 'var(--color-ok)' : n >= 70 ? 'var(--color-warn)' : 'var(--color-bad)');

type TabKey = 'sent' | 'collect';
type ViewK = 'send' | 'table';
type DecF = 'すべて' | '返信待ち' | '未判断' | 'OK' | 'NG';
type SortK = 'new' | 'old' | 'reply' | 'undecided' | 'case' | 'person';
type MyTab = { name: string; via: Via | 'すべて'; dec: DecF; sort: SortK };
const COLS: ColDef[] = [
  { k: 'case', t: '案件' }, { k: 'person', t: '要員' }, { k: 'via', t: '送った経路' }, { k: 'sent', t: '送った日時' },
  { k: 'reply', t: '返信' }, { k: 'decision', t: '判断' }, { k: 'chat', t: 'チャット' },
];
const COL_DEFAULT = COLS.map((c) => c.k);
const SORTS: [SortK, string][] = [['new', '送った日時が新しい順'], ['old', '送った日時が古い順'], ['reply', '返信が新しい順'], ['undecided', '未判断を上に'], ['case', '案件No順'], ['person', '要員の名前順']];
const DECS: DecF[] = ['すべて', '返信待ち', '未判断', 'OK', 'NG'];
const MYTAB_KEY = 'v2_progress_tabs';
const PREF_KEY = 'v2_progress_prefs';
const tsOfId = (id: string) => Number(id.split(':').pop()) || 0;
const decOk = (r: ProgressRow, d: DecF) => d === 'すべて' || (d === '返信待ち' ? !r.reply : d === '未判断' ? !!r.reply && r.decision === '未判断' : r.decision === d);
function sortRows(rows: ProgressRow[], k: SortK): ProgressRow[] {
  const a = [...rows];
  if (k === 'old') a.sort((x, y) => tsOfId(x.id) - tsOfId(y.id));
  else if (k === 'reply') a.sort((x, y) => (y.replyAt || '').localeCompare(x.replyAt || '') || tsOfId(y.id) - tsOfId(x.id));
  else if (k === 'undecided') a.sort((x, y) => Number(!!y.reply && y.decision === '未判断') - Number(!!x.reply && x.decision === '未判断') || tsOfId(y.id) - tsOfId(x.id));
  else if (k === 'case') a.sort((x, y) => x.caseNo.localeCompare(y.caseNo, 'ja', { numeric: true }) || tsOfId(y.id) - tsOfId(x.id));
  else if (k === 'person') a.sort((x, y) => x.person.localeCompare(y.person, 'ja') || tsOfId(y.id) - tsOfId(x.id));
  return a;   // new は元の並び（新しい順）のまま
}
function readLs<T>(key: string): T | null { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; } }
function writeLs(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 残せなくても画面は動く */ } }
type ChatOpen = { group: string; thread: ChatMsg[]; focus?: string; cand?: Candidate; gid?: string; title?: string; row?: string; focusText?: string; focusLabel?: string };

export default function ProgressPage() {
  const perm = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const pd = useIke<ProgressData>('proxy?action=getProgressData');
  const pr = useIke<ProgressReply[]>(pd.live ? 'proxy?action=getProgressReplies' : null);
  const live = pd.live;
  // 本物は未経験の人だけ：送り先のグループ名に、今のプロパーリストの人の名前が入っている行だけ（今の matchRosterName と同じ当て方）
  const mk = useMikeiken();
  const dd = useIke<DirectData>(live ? 'roster?op=eigyo&action=direct' : null);
  const ddata = dd.data?.ok ? dd.data : null;
  const lp0 = useMemo(() => liveProgress(pd.data, Array.isArray(pr.data) ? pr.data : null, Date.now(), ddata), [pd.data, pr.data, ddata]);
  // 判断を押した直後の値（読み直しが返るまで画面だけ先に変える）
  const [judged, setJudged] = useState<Record<string, ProgressRow['decision']>>({});
  const lp = useMemo(() => {
    const norms = mk.set ? [...mk.set] : null;
    const keep = (g: string) => mk.state === 'none' || (!!norms && !!matchGroupName(g, norms));
    const ld = liveDirectRows(ddata, pd.data, Array.isArray(pr.data) ? pr.data : null);
    const tsOf = (id: string) => Number(id.split(':').pop()) || 0;
    const rows = [...lp0.rows, ...ld.rows].filter((r) => keep(r.group)).sort((a, b) => tsOf(b.id) - tsOf(a.id))
      .map((r) => (judged[r.id] ? { ...r, decision: judged[r.id], slack: judged[r.id] === 'OK' } : r));
    const cands: Candidate[] = (ddata?.candidates ?? []).filter((c) => keep(c.group)).map((c) => ({
      id: c.id, personId: '', person: c.group || '（名前なし）', group: c.group, msgId: c.id, poster: c.poster, postedAt: mdhm(c.ts), match: c.match,
      hint: `案件の紹介に出る言葉が ${c.words}個`, thread: [{ id: c.id, at: mdhm(c.ts), who: 'staff' as const, name: c.poster || '内勤', text: c.text }],
    }));
    const gidOf = Object.fromEntries((ddata?.candidates ?? []).map((c) => [c.id, c.groupId]));
    return { ...lp0, rows, threads: { ...lp0.threads, ...ld.threads }, cases: [...lp0.cases, ...ld.extraCases], cands, gidOf };
  }, [lp0, mk, ddata, pd.data, pr.data, judged]);
  const canEdit = perm && live;
  const noEdit = live ? needText('edit') : '案件進捗を読み込めていません';
  const caseOf = (no: string) => lp.cases.find((c) => c.no === no);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [gone, setGone] = useState<Record<string, boolean>>({});   // 本物：決めた直後に候補から消す（読み直しを待たない）
  const rows = live ? lp.rows : [];
  const cands = live ? lp.cands.filter((c) => !gone[c.id]) : [];
  const [pick, setPick] = useState<Record<string, string>>({}); // 候補ごとに内勤が選び直した案件No
  const [flash, setFlash] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatOpen | null>(null);
  const [via, setViaRaw] = useState<Via | 'すべて'>('すべて');
  const [dec, setDecRaw] = useState<DecF>('すべて');
  const [sort, setSortRaw] = useState<SortK>('new');
  const [view, setViewRaw] = useState<ViewK>('send');
  const [myTabs, setMyTabs] = useState<MyTab[]>([]);
  const [myOn, setMyOn] = useState<number | null>(null);   // いま当てている自分のタブ（絞り込みを変えたら外れる）
  const cols = useColumns('v2_progress_cols', COLS, COL_DEFAULT);
  useEffect(() => {
    const t = readLs<MyTab[]>(MYTAB_KEY);
    if (Array.isArray(t)) setMyTabs(t.filter((x) => x && typeof x.name === 'string'));
    const p = readLs<{ sort?: SortK; view?: ViewK }>(PREF_KEY);
    if (p?.sort && SORTS.some(([k]) => k === p.sort)) setSortRaw(p.sort);
    if (p?.view === 'send' || p?.view === 'table') setViewRaw(p.view);
  }, []);
  const setVia = (v: Via | 'すべて') => { setViaRaw(v); setMyOn(null); };
  const setDec = (d: DecF) => { setDecRaw(d); setMyOn(null); };
  const setSort = (k: SortK) => { setSortRaw(k); setMyOn(null); writeLs(PREF_KEY, { sort: k, view }); };
  const setView = (v: ViewK) => { setViewRaw(v); writeLs(PREF_KEY, { sort, view: v }); };
  // 送った案件のやりとり：返信だけだと前後が分からないので、内勤・あおいの発言も入った そのグループ（1:1）のトークをそのまま読む（10-28 shoya）
  //   この案件の配信（無ければ返信）を光らせて そこまで送る
  const openChat = (r: ProgressRow) => {
    const th = lp.threads[r.id] ?? [];
    const send = th.find((m) => m.who === 'aoi');
    setChat({ group: r.group, thread: th, title: caseOf(r.caseNo)?.name ?? r.caseNo, row: r.id, gid: gidOfRow(r.id) || undefined,
      focusText: send?.text || r.reply, focusLabel: send ? '↑ この案件の配信' : '↑ この案件への返信' });
  };
  // だれの依頼で送った案件か：今の画面と同じく /api/progress-live の ikouRequesters（読めなければ getProgressData に入っている分）
  const pl = useIke<{ ok?: boolean; ikouRequesters?: Record<string, string[]> }>(live ? 'progress-live' : null);
  const reqOf = (no: string) => pl.data?.ikouRequesters?.[no] ?? pd.data?.ikouRequesters?.[no] ?? [];
  const caseDateOf = (no: string) => { const c = pd.data?.cases?.find((x) => x.kNo === no); const t = parseFloat(c?.ts ?? ''); return t > 0 ? mdhm(t * 1000) : c?.date ?? ''; };
  const saveTabs = (t: MyTab[]) => { setMyTabs(t); writeLs(MYTAB_KEY, t); };
  const applyMy = (i: number) => { const t = myTabs[i]; if (!t) return; setViaRaw(t.via); setDecRaw(t.dec); setSortRaw(t.sort); setMyOn(i); setTab('sent'); window.history.replaceState(null, '', '/eigyo/progress'); };
  const addMy = () => {
    const def = [via !== 'すべて' ? via : '', dec !== 'すべて' ? dec : ''].filter(Boolean).join('・') || SORTS.find(([k]) => k === sort)![1];
    const name = window.prompt('いまの絞り込みと並べ方に名前を付けて、タブに残します（この端末に覚えます）', def)?.trim();
    if (!name) return;
    const next = [...myTabs, { name: name.slice(0, 20), via, dec, sort }];
    saveTabs(next); setMyOn(next.length - 1);
  };
  const delMy = (i: number) => { if (!window.confirm(`タブ「${myTabs[i].name}」を消します`)) return; saveTabs(myTabs.filter((_, j) => j !== i)); setMyOn(null); };
  const total = live ? lp.cands.length : 0;

  const [tab, setTab] = useState<TabKey>('sent');
  const [rowFlash, setRowFlash] = useState<string | null>(null);
  const go = (k: TabKey) => { setTab(k); setMyOn(null); window.history.replaceState(null, '', `/eigyo/progress${k === 'sent' ? '' : '?tab=collect'}`); };
  // ?tab=collect で始める。クエリは useEffect で読む
  useEffect(() => { const q = new URLSearchParams(window.location.search); if (q.get('tab') === 'collect') setTab('collect'); }, []);

  const caseFor = (c: Candidate) => pick[c.id] ?? c.match?.caseNo ?? '';

  const settle = (c: Candidate, asCase: boolean) => {
    if (!canEdit || flash === c.id) return; // 消える前に2回押しても二重に載せない
    const no = caseFor(c);
    if (!live) return;
    {
      // 本物：今のシステムの回収の表に「載せた（どの案件か）／案件ではない」を書く。取り消すと候補に戻る
      setFlash(c.id);
      postLive('/api/live/eigyo', { action: 'directDecide', id: c.id, decision: asCase ? 'case' : 'not_case', caseNo: asCase ? no : '' })
        .then((j) => {
          setChat((o) => (o?.cand?.id === c.id ? null : o));
          setGone((g) => ({ ...g, [c.id]: true }));
          hit();
          const label = no ? caseOf(no)?.name ?? no : `新しい案件（${String((j as { caseNo?: string }).caseNo || '')}）`;
          toast({
            text: asCase ? `${c.person} への ${label} を載せました` : '案件ではない、にしました',
            sub: asCase ? '→ 送った案件に「グループ直接」で載り、返信待ちに入りました' : '→ 同じ発言はもう候補に出ません',
            undo: () => { postLive('/api/live/eigyo', { action: 'directUndo', id: c.id }).then(() => { setGone((g) => { const n = { ...g }; delete n[c.id]; return n; }); dd.reload(); }).catch((e) => toast({ text: '取り消せませんでした', sub: (e as Error).message })); },
          });
          dd.reload();
        })
        .catch((e) => toast({ text: '載せられませんでした', sub: (e as Error).message }))
        .finally(() => setFlash(null));
    }
  };

  // 返信があった行の OK / NG を選ぶ（未判断を片づける）
  const decide = (r: ProgressRow, d: 'OK' | 'NG') => {
    if (!canEdit || !live) return;
    {
      // 本物：今の📮判断（markSlackForwarded）。押した時に見えていた値（未判断）のままのときだけ書く＝同時に押されたら今の値を出す
      const body = { action: 'judge', caseNo: r.caseNo, gid: gidOfRow(r.id), name: r.group };
      const name = caseOf(r.caseNo)?.name ?? r.caseNo;
      const done = () => {
        setJudged((j) => ({ ...j, [r.id]: d }));
        setRowFlash(r.id); setTimeout(() => setRowFlash(null), 1300);
        hit();
        toast({
          text: `${r.person} の ${name} を「${d}」にしました`,
          sub: d === 'OK' ? '→ Slack の案件スレッドに流しました（📮営業へ）' : '→ この案件はこの人の候補から外しました',
          undo: d === 'NG' ? () => { postLive('/api/live/eigyo', { ...body, status: '', prev: 'NG' }).then(() => { setJudged((j) => ({ ...j, [r.id]: '未判断' })); pd.reload(); }).catch((e) => toast({ text: '取り消せませんでした', sub: (e as Error).message })); } : undefined,
        });
        pd.reload();
      };
      const run = async () => { try { await postLive('/api/live/eigyo', { ...body, status: d, prev: '' }); } catch (e) { pd.reload(); throw e; } done(); };
      if (d === 'OK') setConfirm({ title: '「OK」にして営業へ回します', lines: [`${r.person}`, `案件：${name}`, `返信：${r.reply.slice(0, 60)}`], sends: 'Slack の案件スレッドに流れます（今の📮OK と同じ）', okLabel: 'OK にする', run });
      else run().catch((e) => toast({ text: '保存できませんでした', sub: (e as Error).message }));
    }
  };

  const shown = sortRows(rows.filter((r) => (via === 'すべて' || r.via === via) && decOk(r, dec)), sort);
  const head: Record<string, React.ReactNode> = {
    case: <th key="case" className="px-4 py-2.5 font-semibold">案件</th>, person: <th key="person" className="px-2 py-2.5 font-semibold">要員</th>,
    via: <th key="via" className="px-2 py-2.5 font-semibold">送った経路</th>, sent: <th key="sent" className="px-2 py-2.5 font-semibold">送った日時</th>,
    reply: <th key="reply" className="px-2 py-2.5 font-semibold">返信</th>, decision: <th key="decision" className="px-2 py-2.5 font-semibold">判断</th>, chat: <th key="chat" className="px-4 py-2.5" />,
  };
  const kpi = [
    { label: '直近7日に送った', n: rows.length, sub: `グループ直接 ${rows.filter((r) => r.via === 'グループ直接').length}件` },
    { label: '返信待ち', n: rows.filter((r) => !r.reply).length, sub: '要員からの返事がまだ' },
    { label: '未判断', n: rows.filter((r) => r.reply && r.decision === '未判断').length, sub: '返信あり・OK/NG 待ち' },
    { label: 'OK', n: rows.filter((r) => r.decision === 'OK').length, sub: `営業へ ${rows.filter((r) => r.slack).length}件` },
  ];

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="案件進捗" sub="あおい・グループ直接・手動配信で送った案件を1本で。グループに直接書いた案件も回収して載せる" />
      <LiveBanner state={pd.state} error={pd.error} onReload={() => { pd.reload(); pr.reload(); dd.reload(); }} note={`直近7日の送信 ${rows.length}件（今の案件進捗と同じ材料）。OK・NG は今の📮判断と同じに保存します${pr.state === 'error' ? '・返信が読めませんでした' : ''}${dd.state === 'error' || (dd.data && !dd.data.ok) ? '・回収候補が読めませんでした' : ''}`} />
      <MikeikenNote mk={mk} live={live} />

      <div className="mo-fade-up grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ ['--i' as string]: 1 }}>
        {kpi.map((k) => (
          <div key={k.label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="text-sm text-muted">{k.label}</div>
            <div className="num text-xl font-bold">{k.n}<span className="ml-0.5 text-body font-semibold text-muted">件</span></div>
            <div className="text-xs text-faint">{k.sub}</div>
          </div>
        ))}
      </div>

      <div role="tablist" className="mo-fade-up flex flex-wrap gap-1 border-b border-line" style={{ ['--i' as string]: 2 }}>
        {([['sent', '送った案件'], ['collect', '回収候補']] as [TabKey, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k && myOn === null} onClick={() => go(k)} className="tab">
            {l}{k === 'collect' && cands.length > 0 && <span className="num ml-1.5 rounded-full bg-bad px-1.5 text-xs font-bold text-white">{cands.length}</span>}
          </button>
        ))}
        {myTabs.map((t, i) => (
          <span key={i} className="inline-flex items-center">
            <button role="tab" aria-selected={myOn === i} onClick={() => applyMy(i)} className="tab" title={`経路 ${t.via}・判断 ${t.dec}・${SORTS.find(([k]) => k === t.sort)?.[1] ?? ''}`}>{t.name}</button>
            {myOn === i && <button aria-label={`タブ「${t.name}」を消す`} onClick={() => delMy(i)} className="-ml-1 mr-1 rounded p-0.5 text-faint hover:text-bad"><X size={13} /></button>}
          </span>
        ))}
        {tab === 'sent' && <button onClick={addMy} className="ml-auto self-center inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><Plus size={14} />いまの絞り込みをタブに</button>}
      </div>

      <div key={tab} className={`mo-axis ${chat ? 'xl:pr-[444px]' : ''}`}>
        {tab === 'sent' ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {(['すべて', 'あおい', 'グループ直接', '手動配信'] as const).map((v) => (
                <button key={v} onClick={() => setVia(v)} aria-pressed={via === v} className="fchip">
                  {v} <span className="num">{v === 'すべて' ? rows.length : rows.filter((r) => r.via === v).length}</span>
                </button>
              ))}
              <span className="mx-1 h-5 w-px bg-line" />
              {DECS.map((d) => (
                <button key={d} onClick={() => setDec(d)} aria-pressed={dec === d} className="fchip">
                  {d === 'すべて' ? '判断すべて' : d} <span className="num">{rows.filter((r) => (via === 'すべて' || r.via === via) && decOk(r, d)).length}</span>
                </button>
              ))}
              <span className="ml-auto inline-flex items-center gap-2">
                <span role="group" aria-label="見え方" className="inline-flex overflow-hidden rounded-[10px] border border-field">
                  {([['send', '配信ごと', LayoutList], ['table', '表', Rows3]] as const).map(([k, l, Icon]) => (
                    <button key={k} onClick={() => setView(k)} aria-pressed={view === k} title={k === 'send' ? '案件ごとに、送った回と送り先を並べる（今の案件進捗と同じ）' : '1行1送り先の表'}
                      className={`inline-flex min-h-9 items-center gap-1 px-2.5 text-sm font-semibold ${view === k ? 'bg-ink text-surface' : 'bg-surface text-muted hover:text-ink'}`}><Icon size={14} />{l}</button>
                  ))}
                </span>
                <select aria-label="並べ方" value={sort} onChange={(e) => setSort(e.target.value as SortK)} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-body text-ink">
                  {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                {view === 'table' && <ColumnPicker all={COLS} keys={cols.keys} onChange={(k) => cols.save(k.length ? k : ['case'])} onReset={cols.reset} />}
              </span>
            </div>
            {view === 'send' ? (
              <SendCards rows={shown} caseOf={caseOf} reqOf={reqOf} caseDateOf={caseDateOf} onChat={openChat} onDecide={decide} canEdit={canEdit} noEdit={noEdit} flashId={rowFlash}
                empty={pd.state === 'loading' ? '読み込み中…' : pd.state === 'error' ? '案件進捗を読み込めませんでした' : via === 'すべて' && dec === 'すべて' ? '送った案件はまだありません' : 'この絞り込みに当たる案件はありません'} />
            ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-body">
                  <thead><tr className="th-row text-left">{cols.keys.filter((k) => head[k]).map((k) => head[k])}</tr></thead>
                  <tbody>
                    {shown.map((r, i) => {
                      const c = caseOf(r.caseNo);
                      const cell: Record<string, React.ReactNode> = {
                        case: <td key="case" className="px-4 py-2.5"><div className="font-semibold">{c?.name ?? r.caseNo}</div><div className="text-xs text-faint">{r.caseNo}{c?.price && ` ・ ${c.price}`}</div></td>,
                        person: <td key="person" className="px-2 py-2.5"><PersonName name={r.person} /></td>,
                        via: <td key="via" className="whitespace-nowrap px-2 py-2.5"><Chip s={VIA_STYLE[r.via]}>{r.via}</Chip>{r.via !== 'あおい' && <span className="ml-1.5 text-xs text-muted">{r.sender}</span>}</td>,
                        sent: <td key="sent" className="num whitespace-nowrap px-2 py-2.5">{r.sentAt}</td>,
                        reply: <td key="reply" className="max-w-[240px] px-2 py-2.5">{r.reply ? <><span className="line-clamp-1">{r.quoted && <ReplyMark />}{r.reply}</span><span className="text-xs text-faint">{r.replyAt}</span></> : <span className="text-sm font-semibold text-bad">返信待ち</span>}</td>,
                        decision: (
                          <td key="decision" className="whitespace-nowrap px-2 py-2.5">
                            {r.reply && r.decision === '未判断' ? (
                              <span className="inline-flex gap-1">
                                {(['OK', 'NG'] as const).map((d) => (
                                  <button key={d} onClick={() => decide(r, d)} disabled={!canEdit} title={!canEdit ? noEdit : `返事を見て「${d}」にする`} className="btn-secondary btn-sm" style={d === 'OK' ? { color: 'var(--tone-ok-fg)' } : undefined}>{d}</button>
                                ))}
                              </span>
                            ) : <Chip s={DEC_STYLE[r.decision]}>{r.decision}</Chip>}
                            {r.slack && <span className="ml-1.5 text-xs text-muted">📮営業へ</span>}
                          </td>
                        ),
                        chat: (
                          <td key="chat" className="px-4 py-2.5 text-right">
                            <button onClick={() => openChat(r)} className="inline-flex min-h-8 items-center whitespace-nowrap gap-1.5 rounded-lg border px-2.5 text-sm font-semibold" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}><MessageSquareText size={14} />チャット</button>
                          </td>
                        ),
                      };
                      return (
                        <tr key={r.id} className={`mo-fade-in border-t border-line-soft ${rowFlash === r.id ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                          {cols.keys.filter((k) => cell[k]).map((k) => cell[k])}
                        </tr>
                      );
                    })}
                    {shown.length === 0 && <tr><td colSpan={Math.max(1, cols.keys.length)} className="px-4 py-10 text-center text-body text-muted">{pd.state === 'loading' ? '読み込み中…' : pd.state === 'error' ? '案件進捗を読み込めませんでした' : via === 'すべて' && dec === 'すべて' ? '送った案件はまだありません' : 'この絞り込みに当たる案件はありません'}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
              <RemainRing remain={cands.length} total={total} />
              <div className="text-body"><b>グループに直接書いた案件の回収</b><div className="text-sm text-muted">内勤の発言から案件らしいものを拾い、一番近い案件を当てています。✓で確定したものだけ「送った案件」に載ります。{`直近${ddata?.days ?? 14}日の発言から拾っています。`}</div></div>
            </div>

            {cands.length === 0 && (pd.state === 'loading' || dd.state === 'loading') && <div className="rounded-xl border border-line bg-surface px-6 py-8 text-center text-body text-muted">読み込み中…</div>}
            {cands.length === 0 && live && dd.state !== 'loading' && (
              <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-10 text-center">
                <Check className="mx-auto text-ok" size={26} />
                <div className="mt-2 text-md font-bold">回収候補はぜんぶ片づきました</div>
                <div className="mt-1 text-sm text-muted">新しくグループに書かれた案件は、ここにまた出ます。</div>
              </div>
            )}

            {cands.map((c, i) => {
              const msg = c.thread.find((m) => m.id === c.msgId)!;
              const no = caseFor(c);
              return (
                <article key={c.id} className={`mo-fade-up rounded-xl border border-line bg-surface ${flash === c.id ? 'mo-flash' : ''}`} style={{ ['--i' as string]: i }}>
                  <div className="flex flex-wrap items-start gap-4 px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted"><PersonName name={c.person} className="text-body font-bold text-ink underline-offset-2 hover:underline" /><span>{c.group}</span><span>・{c.poster} が {c.postedAt} に書き込み</span></div>
                      <p className="mt-2 whitespace-pre-line rounded-[10px] bg-soft px-3 py-2 text-body leading-relaxed">{msg.text}</p>
                      {c.hint && <div className="mt-1.5 text-xs text-faint">拾った理由：{c.hint}</div>}
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-[300px]">
                      <label className="text-xs text-faint">どの案件か
                        <select aria-label="どの案件か" value={no} onChange={(e) => setPick((p) => ({ ...p, [c.id]: e.target.value }))} className="mt-1 block min-h-9 w-full rounded-[10px] border border-field bg-surface px-2 text-body text-ink">
                          <option value="">新しい案件として登録</option>
                          {lp.cases.map((x) => <option key={x.no} value={x.no}>{x.no} {x.name}</option>)}
                        </select>
                      </label>
                      <div className="text-xs">
                        {c.match && !pick[c.id] ? <span style={{ color: scoreTone(c.match.score) }}>本文の近さ <b className="num">{c.match.score}%</b>{c.match.score < 70 && '・案件の紹介かどうか確かめてください'}</span>
                          : !no ? <span className="text-warn">近い案件がありません。確定すると「新しい案件」（G＋日時の番号）として載せます</span>
                          : <span className="text-muted">選び直しました</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft px-4 py-2.5">
                    <button onClick={() => setChat({ group: c.group, thread: c.thread, focus: c.msgId, cand: c, gid: lp.gidOf[c.id] })} className="mr-auto inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border px-3 text-body font-semibold" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}><MessageSquareText size={15} />チャットで前後を見る</button>
                    <button onClick={() => settle(c, false)} disabled={!canEdit} title={!canEdit ? noEdit : undefined} className="btn-secondary">案件ではない</button>
                    <PrimaryButton onClick={() => settle(c, true)} disabled={!canEdit} title={!canEdit ? noEdit : undefined}>
                      <span className="inline-flex items-center gap-1.5">{no ? <Check size={15} /> : <Plus size={15} />}{no ? '案件進捗に載せる' : '登録して載せる'}</span>
                    </PrimaryButton>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {chat && (
        <DrawerPortal>
          <aside key={chat.group + (chat.focus ?? '')} aria-label="グループのやりとり" className="mo-drawer drawer">
            <div className="flex items-start justify-between px-5 py-4">
              <div><div className="text-sm text-faint">{chat.title ? `${chat.title} のやりとり` : 'LINEグループのやりとり'}</div><div className="text-lg font-bold">{chat.group}</div></div>
              <button aria-label="閉じる" onClick={() => setChat(null)} className="flex size-[34px] items-center justify-center rounded-[10px] border border-line"><X size={16} /></button>
            </div>
            <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto bg-soft px-4 py-4">
              {chat.gid && <LiveGroupThread gid={chat.gid} focusText={chat.focusText ?? chat.thread[0]?.text ?? ''} focusLabel={chat.focusLabel ?? '↑ 案件として拾った発言'} />}
              {!chat.gid && chat.thread.map((m, i) => {
                const mine = m.who !== 'person';
                const focus = m.id === chat.focus;
                return (
                  <div key={m.id} className={`mo-fade-up flex flex-col ${mine ? 'items-end' : 'items-start'}`} style={{ ['--i' as string]: i }}>
                    <div className="mb-0.5 text-xs text-faint">{m.name}・{m.at}</div>
                    <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-body leading-relaxed ${focus ? 'mo-scale-in shadow-[0_0_0_3px_var(--al)]' : ''}`}
                      style={mine ? { background: focus ? 'var(--a)' : 'var(--color-surface)', color: focus ? 'var(--ao)' : 'var(--color-ink)', border: '1px solid var(--color-line)' } : { background: 'var(--tone-ok-bg)', color: 'var(--color-ink)' }}>
                      {m.quoted && <Quote q={m.quoted} />}
                      {m.text}
                    </div>
                    {focus && <div className="mt-1 text-xs font-semibold" style={{ color: 'var(--ad)' }}>↑ 案件として拾った発言</div>}
                  </div>
                );
              })}
            </div>
            {(() => {
              const r = chat.row ? rows.find((x) => x.id === chat.row) : undefined;
              if (!r?.reply || (r.decision !== '未判断' && !judged[r.id])) return null;
              return (
                <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
                  {r.decision === '未判断' ? (['NG', 'OK'] as const).map((d) => (
                    <button key={d} onClick={() => decide(r, d)} disabled={!canEdit} title={!canEdit ? noEdit : `返事を見て「${d}」にする`} className={d === 'OK' ? 'btn-primary' : 'btn-secondary'}>{d}{d === 'OK' && 'にして営業へ'}</button>
                  )) : <Chip s={DEC_STYLE[r.decision]}>{r.decision}にしました</Chip>}
                </div>
              );
            })()}
            {chat.cand && (
              <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
                <button onClick={() => settle(chat.cand!, false)} disabled={!canEdit} title={!canEdit ? noEdit : undefined} className="btn-secondary">案件ではない</button>
                <PrimaryButton onClick={() => settle(chat.cand!, true)} disabled={!canEdit} title={!canEdit ? noEdit : undefined}>{caseFor(chat.cand) ? '案件進捗に載せる' : '登録して載せる'}</PrimaryButton>
              </div>
            )}
          </aside>
        </DrawerPortal>
      )}
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
    </main>
  );
}

// ---- 配信ごと（今の progress.html の案件カードと同じ並び） ----
/** 返信までの早さ（今の _replyBucket と同じ区切り） */
function replyBucket(ms: number): string {
  const h = ms / 3600000;
  return h < 1 ? '1時間以内' : h < 3 ? '3時間以内' : h < 12 ? '12時間以内' : h < 24 ? '1日以内' : h < 48 ? '2日以内' : '3日以上';
}
const elapsedOf = (ms: number) => { const h = Math.max(0, Math.floor((Date.now() - ms) / 3600000)); return h < 24 ? `${h}時間経過` : `${Math.floor(h / 24)}日経過`; };
const ReplyMark = () => <CornerUpLeft size={12} aria-label="引用リプライ" className="mr-1 inline-block align-[-1px]" style={{ color: 'var(--ad)' }} />;
const CHIP_STYLE: Record<ProgressRow['decision'], React.CSSProperties> = {
  未判断: { background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)', borderColor: 'var(--tone-warn-fg)' },
  OK: { background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)', borderColor: 'transparent' },
  NG: { background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)', borderColor: 'transparent' },
  その他: { background: 'var(--tone-purple-bg)', color: 'var(--tone-purple-fg)', borderColor: 'transparent' },
};

function SendCards({ rows, caseOf, reqOf, caseDateOf, onChat, onDecide, canEdit, noEdit, flashId, empty }: {
  rows: ProgressRow[]; caseOf: (no: string) => Case | undefined; reqOf: (no: string) => string[]; caseDateOf: (no: string) => string; onChat: (r: ProgressRow) => void; onDecide: (r: ProgressRow, d: 'OK' | 'NG') => void;
  canEdit: boolean; noEdit: string; flashId: string | null; empty: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // 並べ方は rows の順（上で選んだ並べ方）のまま：案件 → 送った回（経路＋時刻）→ 送り先
  const cards = useMemo(() => {
    const by = new Map<string, Map<string, ProgressRow[]>>();
    for (const r of rows) {
      const sends = by.get(r.caseNo) ?? new Map<string, ProgressRow[]>();
      const k = `${r.via}:${r.sentMs ?? r.sentAt}`;
      sends.set(k, [...(sends.get(k) ?? []), r]);
      by.set(r.caseNo, sends);
    }
    return [...by].map(([no, sends]) => ({ no, sends: [...sends.values()].sort((a, b) => (b[0].sentMs ?? 0) - (a[0].sentMs ?? 0)) }));
  }, [rows]);
  if (!cards.length) return <div className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-body text-muted">{empty}</div>;
  return (
    <div className="flex flex-col gap-2.5">
      {cards.map(({ no, sends }, i) => {
        const c = caseOf(no);
        const all = sends.flat();
        const undec = all.filter((r) => r.reply && r.decision === '未判断').length;
        const replied = all.filter((r) => r.reply).length;
        const body = (c?.body ?? '').trim();
        const reqs = reqOf(no);
        const cdate = caseDateOf(no);
        return (
          <article key={no} className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: Math.min(i, 12) }}>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 pt-3">
              <span className="num rounded-md px-2 py-0.5 text-sm font-bold" style={{ background: 'var(--a)', color: 'var(--ao)' }}>{no}</span>
              <span className="min-w-0 font-bold">{c?.name ?? no}</span>
              {c?.price && <span className="text-sm text-muted">{c.price}</span>}
              {c?.place && <span className="text-sm text-muted">{c.place}</span>}
              {cdate && <span className="num text-xs text-faint">案件 {cdate}</span>}
              {reqs.length > 0 && <span className="chip" title="意向確認依頼を出した人（だれの依頼で送ったか）" style={{ background: 'var(--tone-info-bg)', color: 'var(--tone-info-fg)' }}>依頼 {reqs.join('・')}</span>}
              {undec > 0 && <span className="chip" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>未判断 {undec}</span>}
              <span className="ml-auto text-xs text-faint">送り先 <b className="num">{all.length}</b>・返信 <b className="num">{replied}</b></span>
            </div>
            {body && (
              <button onClick={() => setOpen((o) => ({ ...o, [no]: !o[no] }))} className={`block w-full px-4 pt-1 text-left text-sm text-muted hover:text-ink ${open[no] ? 'whitespace-pre-line' : 'line-clamp-1'}`} title={open[no] ? '閉じる' : '押すと案件の本文を全部出す'}>
                {open[no] ? body : body.replace(/\s+/g, ' ')}
              </button>
            )}
            <div className="mt-2.5">
              {sends.map((g) => {
                const f = g[0];
                return (
                  <div key={`${f.via}:${f.sentMs}`} className="border-t border-line-soft px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
                      <span className="num">送信: {f.sentAt}</span>
                      <Chip s={VIA_STYLE[f.via]}>{f.via}</Chip>
                      {f.via !== 'あおい' && <span>{f.sender}</span>}
                      <span>{g.length}件</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {g.map((r) => r.reply ? (
                        <span key={r.id} className={`inline-flex max-w-full items-center gap-1 rounded-full border py-0.5 pl-1 pr-1 text-sm ${flashId === r.id ? 'mo-flash' : ''}`} style={CHIP_STYLE[r.decision]}>
                          <button onClick={() => onChat(r)} title={`押すとやりとりを出す：${r.reply.slice(0, 60)}`} className="inline-flex min-w-0 items-center gap-1 rounded-full px-1.5 font-semibold hover:underline">
                            <Check size={13} className="shrink-0" /><span className="truncate">{r.person}</span>
                            {r.quoted && <ReplyMark />}
                            <span className="shrink-0 text-xs font-normal opacity-80">{r.replyMs && r.sentMs ? replyBucket(r.replyMs - r.sentMs) : r.replyAt}</span>
                            <MessageSquareText size={12} className="shrink-0 opacity-70" />
                          </button>
                          {r.decision === '未判断' ? (['OK', 'NG'] as const).map((d) => (
                            <button key={d} onClick={() => onDecide(r, d)} disabled={!canEdit} title={!canEdit ? noEdit : `返事を見て「${d}」にする`}
                              className="min-h-6 rounded-full border border-line bg-surface px-2 text-xs font-bold text-ink disabled:opacity-50" style={d === 'OK' ? { color: 'var(--tone-ok-fg)' } : undefined}>{d}</button>
                          )) : <span className="rounded-full bg-surface px-2 text-xs font-bold">{r.decision}{r.slack && '・📮営業へ'}</span>}
                        </span>
                      ) : (
                        <span key={r.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-0.5 text-sm text-muted">
                          <Clock size={13} className="shrink-0" /><span className="truncate">{r.person}</span>
                          <span className="shrink-0 text-xs text-faint">{r.sentMs ? elapsedOf(r.sentMs) : '返信待ち'}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        );
      })}
    </div>
  );
}

// 「チャットで前後を見る」（本物）：今のチャット画面と同じ口でトークを読み、拾った発言・案件の配信を光らせて そこまで送る。
//   送り先が U… は 1:1（chat?action=thread）、それ以外はグループ（groupThread）。内勤・あおいの発言も出る
function LiveGroupThread({ gid, focusText, focusLabel }: { gid: string; focusText: string; focusLabel: string }) {
  const one = gid.charAt(0) === 'U';
  const gt = useIke<GroupThreadRes>(one ? null : `chat?action=groupThread&groupId=${encodeURIComponent(gid)}&bc=1`);
  const th = useIke<ThreadRes>(one ? `chat?action=thread&userId=${encodeURIComponent(gid)}` : null);
  const q = one ? th : gt;
  const ref = useRef<HTMLDivElement | null>(null);
  const bubbles = one ? threadBubbles(th.data) : groupBubbles(gt.data);
  const key = focusText.replace(/\s+/g, '').slice(0, 30);
  let fi = -1;
  if (key) bubbles.forEach((m, i) => { if (m.text.replace(/\s+/g, '').startsWith(key)) fi = i; });   // 同じ文を何度か送っていたら いちばん新しいもの
  useEffect(() => { if (fi >= 0) ref.current?.scrollIntoView({ block: 'center' }); }, [fi, q.state]);
  if (q.state === 'loading') return <p className="text-body text-muted">読み込み中…</p>;
  if (q.state === 'error') return <p className="text-body text-bad">{q.error}</p>;
  if (!bubbles.length) return <p className="text-body text-muted">やりとりがありません</p>;
  return (<>{bubbles.map((m, i) => {
    const focus = i === fi;
    return (
      <div key={m.key} ref={focus ? ref : undefined} className={`mo-fade-up flex flex-col ${m.out ? 'items-end' : 'items-start'}`} style={{ ['--i' as string]: Math.min(i, 12) }}>
        <div className="mb-0.5 text-xs text-faint">{m.who}{m.who && '・'}{m.at}</div>
        <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-body leading-relaxed ${focus ? 'mo-scale-in shadow-[0_0_0_3px_var(--al)]' : ''}`}
          style={m.out ? { background: focus ? 'var(--a)' : 'var(--color-surface)', color: focus ? 'var(--ao)' : 'var(--color-ink)', border: '1px solid var(--color-line)' } : { background: 'var(--tone-ok-bg)', color: 'var(--color-ink)' }}>{m.quoted && <Quote q={m.quoted} />}{m.text}</div>
        {focus && <div className="mt-1 text-xs font-semibold" style={{ color: 'var(--ad)' }}>{focusLabel}</div>}
      </div>
    );
  })}</>);
}
