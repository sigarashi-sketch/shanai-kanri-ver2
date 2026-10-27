'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Member } from '@/components/sy/compat';
import { RECRUIT_STAGE_KEYS, STATUS_KEYS } from '@/lib/sy/stages';
import MemberDrawer from '@/components/sy/MemberDrawer';
import { MemberTags } from '@/components/sy/Tags';
import { tagsOf } from '@/lib/sy/tags';
import { BulkTag } from '@/components/sy/TagEditor';
import { useRoster, type Club } from '@/components/sy/useRoster';
import { ArrowDown, ArrowUp, Crown, Dumbbell, Filter, Plus, Search, UsersRound, X } from 'lucide-react';
import { fx } from '@/components/sy/compat';
import { Avatar, Chip, PageHeader, StageBadge, Tabs, ago, btnPrimary, inputCls } from '@/components/sy/ui';
import { useKept } from '@/components/sy/compat';

type Tab = 'list' | 'community' | 'club';

// 一覧の列。見出しの じょうごの印から 列ごとに絞り込める（2026-10-13 shoya「各カラムでフィルタリングできるように」）。
//   kind: text＝文字を含む／set＝値を選ぶ（複数可）／month＝入社日を 月単位で選ぶ（タグで「◯月入社」を持たずに 日付から絞る）
//   vals は その人が その列で持つ値（空欄は ''）。選んだ値の どれかを持つ人が残る
type ColId = 'name' | 'status' | 'nyusha' | 'line' | 'rt' | 'st' | 'company' | 'tags';
const COLS: { id: ColId; label: string; kind: 'text' | 'set' | 'month'; vals: (m: Member) => string[] }[] = [
  { id: 'name', label: '名前', kind: 'text', vals: (m) => [m.name + ' ' + m.kana] },
  { id: 'status', label: '状態', kind: 'set', vals: (m) => [m.status] },
  { id: 'nyusha', label: '入社日', kind: 'month', vals: (m) => [ymdOf(m.nyusha).slice(0, 7)] },
  { id: 'line', label: '採用LINE', kind: 'set', vals: (m) => [m.lineIn ? '届いた' : 'まだ'] },
  { id: 'rt', label: '採用担当', kind: 'set', vals: (m) => [m.recruitTantou] },
  { id: 'st', label: '営業担当', kind: 'set', vals: (m) => [m.salesTantou] },
  { id: 'company', label: '所属会社', kind: 'set', vals: (m) => [m.company] },
  { id: 'tags', label: 'タグ', kind: 'set', vals: (m) => { const t = tagsOf(m).map((x) => x.label); return t.length ? t : ['']; } },
];
const COL = Object.fromEntries(COLS.map((c) => [c.id, c])) as Record<ColId, (typeof COLS)[number]>;
// 入社日は 書き方が まちまち（2026-10-01／2026/10/1／2026年10月1日）なので 'YYYY-MM-DD' に そろえる。日が無ければ 'YYYY-MM'・読めなければ ''
function ymdOf(s: string): string {
  const m = /(\d{4})\s*[-/.年]\s*(\d{1,2})(?:\s*[-/.月]\s*(\d{1,2}))?/.exec(s || '');
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}` + (m[3] ? `-${m[3].padStart(2, '0')}` : '');
}
// 並び替えに使う値（名前は ふりがな・入社日は日付・採用LINEは 届いた日時）。空欄は 昇順でも降順でも いちばん下
type Sort = { id: ColId; dir: 'asc' | 'desc' };
const sortVal = (id: ColId, m: Member) => (id === 'name' ? m.kana || m.name : id === 'nyusha' ? ymdOf(m.nyusha) : id === 'line' ? m.lineIn
  : id === 'status' ? String(100 + STATUS_KEYS.indexOf(m.status as (typeof STATUS_KEYS)[number])) : COL[id].vals(m).join(' '));
const squash = (s: string) => s.replace(/[\s　]+/g, '').toLowerCase();
const valLabel = (id: ColId, v: string) => (!v ? '（空欄）' : id === 'nyusha' ? `${v.slice(0, 4)}年${Number(v.slice(5, 7))}月` : v);
const colHit = (id: ColId, m: Member, sel: string[]) => {
  if (!sel.length) return true;
  const vs = COL[id].vals(m);
  return COL[id].kind === 'text' ? squash(vs[0]).includes(squash(sel[0])) : sel.some((v) => vs.includes(v));
};

export default function RosterView() {
  const sp = useSearchParams();
  const { members, clubs, setClubs, month, warnings, error, reload, patchMember } = useRoster();
  const [tab, setTab] = useKept<Tab>('tab', (sp.get('tab') as Tab) || 'list', !!sp.get('tab'));   // 更新しても戻す（lib/keep.ts）
  const [q, setQ] = useState('');
  const [stages, setStages] = useState<string[]>(sp.get('stage') ? [sp.get('stage')!] : []);
  const [hideTaisha, setHideTaisha] = useState(!sp.get('stage'));
  const [cf, setCf] = useState<Partial<Record<ColId, string[]>>>({});   // 列ごとの絞り込み（状態・採用LINE は 上のチップと同じ値を使うので ここには入れない）
  const [sort, setSort] = useState<Sort | null>(null);   // 列での並び替え（1列だけ）
  const [fcol, setFcol] = useState<{ id: ColId; x: number; y: number } | null>(null);   // 開いている絞り込みの窓
  const [openKey, setOpenKey] = useKept<string | null>('open', sp.get('open'), !!sp.get('open'));
  const [adding, setAdding] = useState(false);
  const [lineF, setLineF] = useState<'' | 'in' | 'none'>('');   // 採用LINEが届いた人 / まだの人
  const [onlyStop, setOnlyStop] = useState(false);   // ぼうさん（接触禁止・lib/bousan.ts）だけに絞る
  const [bulkTag, setBulkTag] = useState(false);   // 表示中の人にまとめてタグを付ける帯

  // 絞り込みは 人ごとに覚える（/api/s/roster-prefs）。開いたときに戻し、変えたら少し待って保存する。検索の文字とタブは覚えない。
  //   URL で 状態を指定して開いたとき（?stage=）は その指定を優先して、状態と「退社を隠す」は戻さない
  const loaded = useRef(false);
  useEffect(() => {
    fetch('/api/sy/s/roster-prefs').then((r) => (r.ok ? r.json() : null)).then((j) => {
      const p = j?.prefs as { stages?: string[]; hideTaisha?: boolean; lineF?: '' | 'in' | 'none'; onlyStop?: boolean; sort?: Sort | null; cf?: Partial<Record<ColId, string[]>> } | null;
      if (p) {
        if (!sp.get('stage')) { if (Array.isArray(p.stages)) setStages(p.stages); if (typeof p.hideTaisha === 'boolean') setHideTaisha(p.hideTaisha); }
        if (p.lineF === 'in' || p.lineF === 'none') setLineF(p.lineF);
        if (p.onlyStop) setOnlyStop(true);
        if (p.sort && p.sort.id in COL && (p.sort.dir === 'asc' || p.sort.dir === 'desc')) setSort({ id: p.sort.id, dir: p.sort.dir });
        if (p.cf && typeof p.cf === 'object') setCf(Object.fromEntries(Object.entries(p.cf).filter(([k, v]) => k in COL && Array.isArray(v) && v.length)));
      }
    }).catch(() => {}).finally(() => { setTimeout(() => { loaded.current = true; }, 0); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      fetch('/api/sy/s/roster-prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefs: { stages, hideTaisha, lineF, onlyStop, cf, sort } }) }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [stages, hideTaisha, lineF, onlyStop, cf, sort]);

  const all = members || [];
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
  const rts = useMemo(() => uniq(all.map((m) => m.recruitTantou)), [all]);
  const sts = useMemo(() => uniq(all.map((m) => m.salesTantou)), [all]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; all.forEach((m) => { c[m.status] = (c[m.status] || 0) + 1; }); return c; }, [all]);
  const selOf = (id: ColId): string[] => (id === 'status' ? stages : id === 'line' ? (lineF ? [lineF === 'in' ? '届いた' : 'まだ'] : []) : cf[id] || []);
  const setSel = (id: ColId, vs: string[]) => {
    if (id === 'status') setStages(vs);
    else if (id === 'line') setLineF(vs.length === 1 ? (vs[0] === '届いた' ? 'in' : 'none') : '');
    else setCf((x) => ({ ...x, [id]: vs }));
  };
  // 検索・状態・列ごとの絞り込み（skip の列だけ 外して数える＝窓の中の人数に使う）
  const passCore = useCallback((m: Member, skip?: ColId) => {
    const t = squash(q.trim());
    return (skip === 'status' || (stages.length ? stages.includes(m.status) : !(hideTaisha && m.status === '退社'))) &&
      (Object.keys(cf) as ColId[]).every((id) => id === skip || colHit(id, m, cf[id] || [])) &&
      (!t || squash([m.name, m.kana, m.company, m.siteEki, m.community, m.clubs.join(' '), m.tags.join(' '), m.recruitTantou, m.salesTantou].join(' ')).includes(t));
  }, [q, stages, hideTaisha, cf]);
  const base0 = useMemo(() => all.filter((m) => passCore(m)), [all, passCore]);
  const rt = cf.rt?.length === 1 ? cf.rt[0] : '', st = cf.st?.length === 1 ? cf.st[0] : '';
  const setRt = (v: string) => setSel('rt', v ? [v] : []), setSt = (v: string) => setSel('st', v ? [v] : []);
  const nStop = base0.filter((m) => m.bousan).length;
  const base = useMemo(() => (onlyStop ? base0.filter((m) => m.bousan) : base0), [base0, onlyStop]);
  const nIn = base.filter((m) => m.lineIn).length;
  const rows = useMemo(() => {
    const r = base.filter((m) => !lineF || (lineF === 'in') === !!m.lineIn);
    if (!sort) return r;
    const k = new Map(r.map((m) => [m.key, sortVal(sort.id, m)]));
    const d = sort.dir === 'asc' ? 1 : -1;
    return [...r].sort((a, b) => { const x = k.get(a.key)!, y = k.get(b.key)!; return !x ? (y ? 1 : 0) : !y ? -1 : d * x.localeCompare(y, 'ja'); });
  }, [base, lineF, sort]);
  const copyNames = () => { navigator.clipboard?.writeText(rows.map((m) => m.name).join('\n')).then(() => fx.toast(`${rows.length}人の名前をコピーしました`), () => fx.toast('コピーできませんでした', 'err')); };
  // 開いている窓に並べる値と、その値を選んだら何人になるか（ほかの絞り込みは効かせたまま）
  const fopts = useMemo(() => {
    if (!fcol || COL[fcol.id].kind === 'text') return [];
    const id = fcol.id, n = new Map<string, number>();
    all.forEach((m) => {
      if (!passCore(m, id) || (onlyStop && !m.bousan) || (id !== 'line' && lineF && (lineF === 'in') !== !!m.lineIn)) return;
      COL[id].vals(m).forEach((v) => n.set(v, (n.get(v) || 0) + 1));
    });
    selOf(id).forEach((v) => { if (!n.has(v)) n.set(v, 0); });
    const ord = (v: string) => STATUS_KEYS.indexOf(v as (typeof STATUS_KEYS)[number]);
    return [...n.entries()].map(([v, c]) => ({ v, n: c })).sort((a, b) => (!a.v ? 1 : !b.v ? -1
      : id === 'nyusha' ? b.v.localeCompare(a.v) : id === 'status' ? ord(a.v) - ord(b.v) : a.v.localeCompare(b.v, 'ja')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fcol, all, passCore, onlyStop, lineF]);
  const active = (Object.keys(cf) as ColId[]).filter((id) => cf[id]?.length);
  const open = all.find((m) => m.key === openKey) || null;
  const onClose = useCallback(() => setOpenKey(null), []);
  const onPatch = useCallback((p: Partial<Member>) => openKey && patchMember(openKey, p), [openKey, patchMember]);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await fetch('/api/sy/s/people', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: f.get('name'), kana: f.get('kana'), stage: f.get('stage'), recruit_tantou: f.get('rt') }) });
    const j = await r.json();
    if (!r.ok) { alert(j.error || '追加に失敗しました'); return; }
    setAdding(false); reload(); setOpenKey(j.key); fx.fanfare({ title: '候補者を登録しました', name: String(f.get('name') || ''), sub: 'ようこそ！' });
  }

  return (
    <div>
      <PageHeader title="従業員名簿" sub={members ? `${rows.length} / ${all.length}人${month ? `・${month}` : ''}` : '読み込み中…'}>
        <label className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ig-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・会社・駅・コミュニティ・部活・タグ" className={`${inputCls} w-64 pl-9`} /></label>
        <select value={rt} onChange={(e) => setRt(e.target.value)} className={inputCls}>
          <option value="">採用担当: すべて</option>{rts.map((o) => <option key={o}>{o}</option>)}
        </select>
        <select value={st} onChange={(e) => setSt(e.target.value)} className={inputCls}>
          <option value="">営業担当: すべて</option>{sts.map((o) => <option key={o}>{o}</option>)}
        </select>
        <button onClick={() => setAdding(true)} className={`ig-press inline-flex items-center gap-1 ${btnPrimary}`}><Plus size={16} strokeWidth={2.4} />候補者</button>
      </PageHeader>

      <Tabs value={tab} onChange={setTab} items={[['list', '一覧'], ['community', 'コミュニティ別'], ['club', '部活別']]} />

      <div className="flex flex-wrap items-center gap-1.5 px-4 md:px-8 pt-4">
        <button onClick={() => setStages([])} className={`rounded-full px-3 py-1 text-xs ring-1 ${!stages.length ? 'bg-ig-text text-white ring-ig-text' : 'bg-white ring-ig-border text-ig-text'}`}>すべて</button>
        {STATUS_KEYS.filter((s) => counts[s]).map((s) => {
          const on = stages.includes(s);
          return <button key={s} onClick={() => setStages((x) => (on ? x.filter((y) => y !== s) : [...x, s]))}
            className={`rounded-full px-3 py-1 text-xs ring-1 ${on ? 'bg-ig-primary text-white ring-ig-text' : 'bg-white ring-ig-border text-ig-text'}`}>{s} {counts[s]}</button>;
        })}
        {!stages.length && <label className="ml-2 flex items-center gap-1 text-xs text-ig-muted"><input type="checkbox" checked={hideTaisha} onChange={(e) => setHideTaisha(e.target.checked)} />退社を隠す</label>}
      </div>
      {/* 採用LINEが届いたか（「1通送ってください」に応えた人／まだの人）。上の絞り込みの中で数える */}
      {members && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pt-2 md:px-8">
          <span className="text-xs text-ig-muted">採用LINE</span>
          <button onClick={() => setLineF(lineF === 'in' ? '' : 'in')} className={`rounded-full px-3 py-1 text-xs ring-1 ${lineF === 'in' ? 'bg-ig-ok text-white ring-ig-ok' : 'bg-white ring-ig-border'}`}>届いた {nIn}</button>
          <button onClick={() => setLineF(lineF === 'none' ? '' : 'none')} className={`rounded-full px-3 py-1 text-xs ring-1 ${lineF === 'none' ? 'bg-ig-danger text-white ring-ig-danger' : 'bg-white ring-ig-border'}`}>まだ {base.length - nIn}</button>
          <button onClick={() => setOnlyStop((x) => !x)} className={`ml-2 rounded-full px-3 py-1 text-xs ring-1 ${onlyStop ? 'bg-ig-stop text-white ring-ig-stop' : 'bg-white ring-ig-stop text-ig-stop'}`}>ぼうさん {nStop}</button>
          <button onClick={copyNames} className="ml-1 text-xs text-ig-primary underline">表示中の {rows.length}人の名前をコピー</button>
          <button onClick={() => setBulkTag((x) => !x)} className="ml-1 text-xs text-ig-primary underline">表示中の {rows.length}人にタグを付ける</button>
        </div>
      )}
      {/* 列で絞り込んでいる中身（コミュニティ別・部活別のタブでも 効いているのが分かるように ここに出す） */}
      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pt-2 md:px-8">
          <span className="text-xs text-ig-muted">列の絞り込み</span>
          {active.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-ig-text py-1 pl-3 pr-1.5 text-xs text-white">
              {COL[id].label}: {COL[id].kind === 'text' ? cf[id]![0] : cf[id]!.map((v) => valLabel(id, v)).join('・')}
              <button onClick={() => setSel(id, [])} aria-label={`${COL[id].label}の絞り込みを外す`} className="grid h-4 w-4 place-items-center rounded-full hover:bg-white/25"><X size={12} /></button>
            </span>
          ))}
          <button onClick={() => setCf({})} className="ml-1 text-xs text-ig-primary underline">すべて外す</button>
        </div>
      )}
      {sort && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pt-2 md:px-8">
          <span className="text-xs text-ig-muted">並び替え</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-ig-text py-1 pl-3 pr-1.5 text-xs text-white">
            {COL[sort.id].label}（{sort.dir === 'asc' ? '昇順' : '降順'}）
            <button onClick={() => setSort(null)} aria-label="並び替えをやめる" className="grid h-4 w-4 place-items-center rounded-full hover:bg-white/25"><X size={12} /></button>
          </span>
        </div>
      )}
      {bulkTag && <BulkTag people={rows} onClose={() => setBulkTag(false)}
        onDone={(name, on) => rows.forEach((m) => patchMember(m.key, { tags: on ? [...new Set([...m.tags, name])] : m.tags.filter((x) => x !== name) }))} />}
      {warnings.length > 0 && <p className="mx-4 md:mx-6 mt-2 rounded-lg bg-ig-subtle px-3 py-2 text-xs text-ig-warn">一部が読めませんでした：{warnings.join(' / ')}</p>}

      <div className="p-4 md:px-8">
        {error ? <div className="rounded-lg bg-ig-subtle p-6 text-center text-sm text-ig-danger">{error}<button onClick={reload} className="ml-3 underline">再読み込み</button></div>
          : !members ? <div className="p-10 text-center text-sm text-ig-muted">いけいけどんどんから名簿を読み込んでいます…（10秒ほど）</div>
          : tab === 'list' ? <Table rows={rows} onOpen={setOpenKey} isOn={(id) => selOf(id).length > 0} sort={sort}
              onFilter={(id, r) => setFcol({ id, x: r.left, y: r.bottom })} />
          : tab === 'community' ? <Groups rows={rows} groupsOf={(m) => (m.community ? [m.community] : [])} empty="コミュニティ未所属" icon="community" onOpen={setOpenKey} />
          : <ClubTab rows={rows} clubs={clubs} setClubs={setClubs} onOpen={setOpenKey} />}
      </div>

      {fcol && <ColFilter key={fcol.id} id={fcol.id} x={fcol.x} y={fcol.y} opts={fopts} sel={selOf(fcol.id)} onChange={(vs) => setSel(fcol.id, vs)}
        dir={sort?.id === fcol.id ? sort.dir : null} onSort={(d) => setSort(d ? { id: fcol.id, dir: d } : null)} onClose={() => setFcol(null)} />}
      {open && <MemberDrawer m={open} clubs={clubs} onClose={onClose} onPatch={onPatch} />}

      {adding && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setAdding(false)}>
          <form onSubmit={add} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="font-bold">候補者を追加</h2>
            <input name="name" required placeholder="氏名（必須）" className="w-full rounded-lg border border-ig-border px-3 py-2 text-sm" />
            <input name="kana" placeholder="ふりがな" className="w-full rounded-lg border border-ig-border px-3 py-2 text-sm" />
            <input name="rt" placeholder="採用担当" className="w-full rounded-lg border border-ig-border px-3 py-2 text-sm" />
            <select name="stage" defaultValue="営業中" className="w-full rounded-lg border border-ig-border px-3 py-2 text-sm">
              {RECRUIT_STAGE_KEYS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAdding(false)} className="rounded-lg px-3 py-1.5 text-sm text-ig-text">やめる</button>
              <button className="rounded-lg bg-ig-primary px-3 py-1.5 text-sm text-white">追加する</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// 列の絞り込みの窓（見出しの じょうごの印の すぐ下に出す。表は横スクロールの箱の中なので 画面に対して置く）
function ColFilter({ id, x, y, opts, sel, onChange, dir, onSort, onClose }: {
  id: ColId; x: number; y: number; opts: { v: string; n: number }[]; sel: string[]; onChange: (vs: string[]) => void;
  dir: 'asc' | 'desc' | null; onSort: (d: 'asc' | 'desc' | null) => void; onClose: () => void;
}) {
  const [find, setFind] = useState('');
  const text = COL[id].kind === 'text';
  const shown = opts.filter((o) => !find || squash(valLabel(id, o.v)).includes(squash(find)));
  const toggle = (v: string) => onChange(sel.includes(v) ? sel.filter((s) => s !== v) : [...sel, v]);
  const left = Math.max(8, Math.min(x, (typeof window === 'undefined' ? 9999 : window.innerWidth) - 272));
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ left, top: y + 4 }} className="fixed z-50 w-64 rounded-lg bg-white p-3 text-sm shadow-xl ring-1 ring-ig-border">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-bold">{COL[id].label}{id === 'nyusha' && <span className="ml-1 text-xs font-normal text-ig-muted">月で絞る</span>}</span>
          {sel.length > 0 && <button onClick={() => onChange([])} className="text-xs text-ig-primary underline">外す</button>}
        </div>
        {/* 並び替え（押してある方を もう一度押すと やめる） */}
        <div className="mb-2 grid grid-cols-2 gap-1.5 border-b border-ig-divider pb-2">
          {([['asc', id === 'nyusha' ? '古い順' : '昇順', ArrowUp], ['desc', id === 'nyusha' ? '新しい順' : '降順', ArrowDown]] as const).map(([d, label, Icon]) => (
            <button key={d} onClick={() => onSort(dir === d ? null : d)}
              className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${dir === d ? 'bg-ig-text text-white' : 'bg-ig-hover text-ig-text hover:bg-ig-border'}`}><Icon size={13} />{label}</button>
          ))}
        </div>
        {text ? (
          <input autoFocus value={sel[0] || ''} onChange={(e) => onChange(e.target.value ? [e.target.value] : [])} onKeyDown={(e) => e.key === 'Enter' && onClose()}
            placeholder="名前・ふりがなの一部" className={`${inputCls} w-full`} />
        ) : (
          <>
            {opts.length > 8 && <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="候補を探す" className={`${inputCls} mb-2 w-full py-1.5`} />}
            <ul className="max-h-72 overflow-y-auto">
              {shown.map((o) => (
                <li key={o.v}><label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-ig-hover">
                  <input type="checkbox" checked={sel.includes(o.v)} onChange={() => toggle(o.v)} />
                  <span className={`flex-1 truncate ${o.v ? '' : 'text-ig-muted'}`}>{valLabel(id, o.v)}</span>
                  <span className="text-xs tabular-nums text-ig-muted">{o.n}</span>
                </label></li>
              ))}
              {shown.length === 0 && <li className="px-1 py-2 text-xs text-ig-muted">候補がありません</li>}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function Table({ rows, onOpen, isOn, sort, onFilter }: { rows: Member[]; onOpen: (k: string) => void; isOn: (id: ColId) => boolean; sort: Sort | null; onFilter: (id: ColId, r: DOMRect) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-ig-border">
      <table className="w-full text-sm">
        <thead className="bg-ig-subtle text-left text-xs text-ig-muted">
          <tr>{COLS.map((c) => (
            <th key={c.id} className="px-3 py-2 font-medium whitespace-nowrap">
              <button onClick={(e) => onFilter(c.id, e.currentTarget.getBoundingClientRect())} title={`${c.label}で絞り込む・並び替える`}
                className={`inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-ig-hover ${isOn(c.id) ? 'bg-ig-text text-white hover:bg-ig-text' : sort?.id === c.id ? 'text-ig-text font-bold' : ''}`}>
                {c.label}{sort?.id === c.id && (sort.dir === 'asc' ? <ArrowUp size={12} strokeWidth={2.6} /> : <ArrowDown size={12} strokeWidth={2.6} />)}<Filter size={12} strokeWidth={2.2} className={isOn(c.id) ? '' : 'opacity-50'} />
              </button>
            </th>
          ))}</tr>
        </thead>
        <tbody className="divide-y divide-ig-divider">
          {rows.map((m) => (
            <tr key={m.key} data-ctx-name={m.name} data-ctx-key={m.key} onClick={() => onOpen(m.key)} className="cursor-pointer transition-colors hover:bg-ig-subtle">
              <td className="px-3 py-2"><div className="flex items-center gap-2"><Avatar name={m.name} src={m.photo} size="sm" ring={m.kind === 'candidate'} />
                <div><div className="font-semibold whitespace-nowrap">{m.name}{m.kind === 'candidate' && <span className="ml-1 rounded bg-ig-hover px-1 text-[10px] text-ig-primary">候補</span>}{m.bousan && <span className="ml-1 rounded bg-ig-stop px-1 text-[10px] font-semibold text-white">ぼうさん</span>}</div>
                  <div className="text-[11px] text-ig-muted">{m.kana}</div></div></div></td>
              <td className="px-3 py-2"><StageBadge stage={m.status} /></td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums text-ig-text">{ymdOf(m.nyusha).replace(/-/g, '/') || m.nyusha || <span className="text-ig-border">—</span>}</td>
              <td className="px-3 py-2 whitespace-nowrap text-xs">{m.lineIn ? <span suppressHydrationWarning className="font-semibold text-ig-ok">届いた<span className="ml-1 font-normal text-ig-muted">{ago(m.lineIn)}</span></span> : <span className="text-ig-danger">まだ</span>}</td>
              <td className="px-3 py-2 text-ig-text whitespace-nowrap">{m.recruitTantou || <span className="text-ig-border">—</span>}</td>
              <td className="px-3 py-2 text-ig-text whitespace-nowrap">{m.salesTantou || <span className="text-ig-border">—</span>}</td>
              <td className="px-3 py-2 text-ig-text whitespace-nowrap">{m.company}</td>
              <td className="px-3 py-2"><MemberTags m={m} max={4} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="p-8 text-center text-sm text-ig-muted">該当する人がいません</div>}
    </div>
  );
}

function Groups({ rows, groupsOf, empty, icon, onOpen, order }: {
  rows: Member[]; groupsOf: (m: Member) => string[]; empty: string; icon: 'community' | 'club'; onOpen: (k: string) => void; order?: string[];
}) {
  const map = new Map<string, Member[]>();
  (order || []).forEach((g) => map.set(g, []));
  rows.forEach((m) => { const gs = groupsOf(m); (gs.length ? gs : [empty]).forEach((g) => map.set(g, [...(map.get(g) || []), m])); });
  const lead = icon === 'community';
  // その人がこのコミュニティのリーダーか（コミュニティ名＝リーダーの氏名、で見分ける）
  const isLead = (m: Member, g: string) => lead && m.name.replace(/[\s　]+/g, '') === g.replace(/[\s　]+/g, '');
  const keys = [...map.keys()].sort((a, b) => (a === empty ? 1 : b === empty ? -1 : order ? 0 : (map.get(b)!.length - map.get(a)!.length)));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {keys.map((g) => (
        <section key={g} className={`ig-lift rounded-lg bg-white ring-1 ring-ig-border ${g === empty ? 'opacity-70' : ''}`}>
          {/* コミュニティ別は見出し＝リーダー名（コミュニティはリーダーの名前で呼ぶ）。大きく太く出す */}
          <header className={`flex items-center justify-between border-b border-ig-divider px-4 ${lead && g !== empty ? 'py-3' : 'py-2.5'}`}>
            {lead && g !== empty ? (
              <h3 className="flex min-w-0 items-center gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#fff4e5] text-ig-warn"><Crown size={17} strokeWidth={2.2} /></span>
                <span className="min-w-0"><span className="block text-[10px] font-bold leading-none tracking-wider text-ig-warn">リーダー</span><span className="block truncate text-lg font-extrabold leading-tight">{g}</span></span>
              </h3>
            ) : <h3 className="flex items-center gap-2 font-bold text-sm">{g !== empty && (icon === 'club' ? <Dumbbell size={16} /> : <UsersRound size={16} />)}{g}</h3>}
            <span className="shrink-0 text-xs text-ig-muted tabular-nums">{map.get(g)!.length}人</span>
          </header>
          <ul className="max-h-80 overflow-y-auto divide-y divide-ig-divider">
            {[...map.get(g)!].sort((a, b) => Number(isLead(b, g)) - Number(isLead(a, g))).map((m) => (
              <li key={m.key} data-ctx-name={m.name} data-ctx-key={m.key}><button onClick={() => onOpen(m.key)} className={`flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-ig-hover ${isLead(m, g) ? 'bg-[#fffaf1]' : ''}`}>
                <Avatar name={m.name} src={m.photo} size="sm" ring={isLead(m, g)} />
                <span className={`flex-1 truncate ${isLead(m, g) ? 'text-base font-bold' : 'text-sm'}`}>{m.name}{isLead(m, g) && <Crown size={13} className="ml-1 inline -mt-0.5 text-ig-warn" />}</span>
                <StageBadge stage={m.status} />
              </button></li>
            ))}
            {map.get(g)!.length === 0 && <li className="px-4 py-3 text-xs text-ig-muted">まだ誰もいません（人を開いて部活を選ぶ）</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ClubTab({ rows, clubs, setClubs, onOpen }: { rows: Member[]; clubs: Club[]; setClubs: (c: Club[]) => void; onOpen: (k: string) => void }) {
  const [name, setName] = useState('');
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch('/api/sy/s/clubs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const j = await r.json();
    if (!r.ok) { alert(j.error); return; }
    setClubs([...clubs, j.club]); setName(''); fx.toast(`「${j.club.name}」を作りました`);
  }
  return (
    <div className="space-y-4">
      <form onSubmit={create} className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-3 ring-1 ring-ig-border">
        <span className="text-sm font-medium">部活を作る</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="部活名（例：フットサル部）" className={`${inputCls} w-56`} />
        <button className={`ig-press ${btnPrimary}`}>作る</button>
        <span className="text-xs text-ig-muted">人を開いて部活を選ぶと、ここに並びます</span>
      </form>
      <Groups rows={rows} groupsOf={(m) => m.clubs} empty="部活なし" icon="club" onOpen={onOpen} order={clubs.map((c) => c.name)} />
    </div>
  );
}
