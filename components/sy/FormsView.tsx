'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Copy, ExternalLink, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { fx } from '@/components/sy/compat';
import { foldSearch, normName } from '@/lib/sy/name';
import { parseSheetUrl, type FormDef, type FormSheet } from '@/lib/sy/forms-types';
import { Chip, PageHeader, Tabs, btnGray, btnPrimary, inputCls } from '@/components/sy/ui';

// イベント出欠（Googleフォームの回答シートを、月次アンケートと同じ作りで見る）。
//   設問は決め打ちしない。列を見て
//     選択式（同じ答えが繰り返し出る列）… 分布の帯・絞り込み
//     自由記述（質問事項・備考など）     … 一覧にそのまま出す・「記入あり」で絞る
//     全員同じ（勉強会日時など）         … 見出しの下に1回だけ出す
//   に分ける。★同じ人が答え直したら新しい方だけ数える（古い方は「答え直す前」として薄く出せる）
type Kind = 'choice' | 'text' | 'const';
interface Col { i: number; label: string; kind: Kind; values: [string, number][]; filled: number }
interface Ans { k: string; ts: string; name: string; cells: string[]; old: boolean }

const NEG = /不参加|欠席|^[×✕✖xXｘＸ]$/, POS = /参加|出席|^[〇○◯]$/;
const PALETTE = ['#0095f6', '#8134af', '#e07a00', '#dd2a7b', '#515bd4', '#00a3a3'];
// 答えの色。参加/出席＝緑、不参加/欠席＝赤、ほかは並び順で決まる色
const colorOf = (v: string, idx: number) => (NEG.test(v) ? '#ed4956' : POS.test(v) ? '#2e9e4f' : PALETTE[idx % PALETTE.length]);
const day = (ts: string) => ts.slice(0, 10);
const when = (ts: string) => (/^\d{4}-\d{2}-\d{2}T/.test(ts) ? `${Number(ts.slice(5, 7))}/${Number(ts.slice(8, 10))} ${ts.slice(11, 16)}` : ts);

function analyze(d: FormSheet, mainHint?: string) {
  const nameCol = d.header.findIndex((h) => /名前|氏名/.test(h));
  const ans: Ans[] = d.rows.map((cells, i) => ({ k: `${i}`, ts: d.tsCol >= 0 ? cells[d.tsCol] || '' : '', name: nameCol >= 0 ? cells[nameCol] || '' : '', cells, old: false }));
  // 同じ人の答え直し: 新しい方を残す（タイムスタンプが無いシートは下の行が新しい）
  const last = new Map<string, Ans>();
  ans.forEach((a) => { const k = normName(a.name); if (!k) return; const p = last.get(k); if (!p || a.ts >= p.ts) { if (p) p.old = true; last.set(k, a); } else a.old = true; });
  const live = ans.filter((a) => !a.old);
  const cols: Col[] = [];
  d.header.forEach((label, i) => {
    if (i === d.tsCol || i === nameCol) return;
    const cnt = new Map<string, number>();
    live.forEach((a) => { const v = a.cells[i]; if (v) cnt.set(v, (cnt.get(v) || 0) + 1); });
    const filled = [...cnt.values()].reduce((x, y) => x + y, 0);
    if (!filled) return;
    const values = [...cnt.entries()].sort((a, b) => b[1] - a[1]);
    const short = values.every(([v]) => v.length <= 24);
    const repeats = cnt.size <= 6 && short && (filled >= cnt.size * 2 || /出欠|可否|有無/.test(label));
    const kind: Kind = !repeats ? 'text' : cnt.size === 1 && filled >= live.length * 0.9 ? 'const' : 'choice';
    cols.push({ i, label, kind, values, filled });
  });
  const choices = cols.filter((c) => c.kind === 'choice');
  const main = (mainHint && choices.find((c) => c.label.includes(mainHint))) || choices.find((c) => /出欠|可否/.test(c.label)) || choices[0] || null;
  ans.sort((a, b) => b.ts.localeCompare(a.ts) || Number(b.k) - Number(a.k));
  return { ans, live, cols, main, hasName: nameCol >= 0 };
}

export default function FormsView({ forms: initial, canEdit }: { forms: FormDef[]; canEdit: boolean }) {
  const [forms, setForms] = useState(initial);
  const [fid, setFid] = useState(initial[0]?.id || '');
  const [gid, setGid] = useState<number | null>(null);   // null＝登録してあるタブ
  const [data, setData] = useState<FormSheet | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const cache = useRef(new Map<string, FormSheet>());
  const form = forms.find((f) => f.id === fid) || null;

  const load = useCallback(async (id: string, g: number | null, force = false) => {
    if (!id) return;
    const key = `${id}:${g ?? ''}`;
    const hit = !force && cache.current.get(key);
    if (hit) { setData(hit); setErr(''); return; }
    setBusy(true); setErr('');
    try {
      const r = await fetch(`/api/sy/s/forms?id=${encodeURIComponent(id)}${g == null ? '' : `&gid=${g}`}`, { cache: 'no-store' });
      const j = (await r.json()) as FormSheet;
      if (!j.ok) throw new Error(j.error || `読み込みに失敗しました（${r.status}）`);
      cache.current.set(key, j); setData(j);
    } catch (e) { setData(null); setErr((e as Error).message); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { load(fid, gid); }, [fid, gid, load]);

  const a = useMemo(() => (data ? analyze(data, form?.main) : null), [data, form?.main]);
  const consts = a ? a.cols.filter((c) => c.kind === 'const') : [];
  const sub = !form ? '' : err ? '読み込めませんでした' : !a ? '読み込み中…' : [`${a.live.length}人が回答`, ...consts.map((c) => c.values[0][0])].join('・');

  return (
    <div>
      <PageHeader title="イベント出欠" sub={sub}>
        {form && <a href={`https://docs.google.com/spreadsheets/d/${form.sheetId}/edit${data ? `#gid=${data.gid}` : ''}`} target="_blank" rel="noreferrer" className={`${btnGray} inline-flex items-center gap-1.5`}><ExternalLink size={15} />シートを開く</a>}
        <button onClick={() => load(fid, gid, true)} disabled={busy || !form} className={`${btnGray} inline-flex items-center gap-1.5`}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} />更新</button>
        {canEdit && <button onClick={() => setEdit(!edit)} className={`${edit ? btnPrimary : btnGray} inline-flex items-center gap-1.5`}><Plus size={15} />フォームを足す</button>}
      </PageHeader>
      {forms.length > 0 && <Tabs value={fid} onChange={(v) => { setFid(v); setGid(null); setData(null); }} items={forms.map((f) => [f.id, f.title] as [string, string])} />}
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-4 md:px-6">
        {edit && canEdit && <Editor forms={forms} onSaved={(fs) => { setForms(fs); if (!fs.some((f) => f.id === fid)) { setFid(fs[0]?.id || ''); setGid(null); setData(null); } }} />}
        {data && data.tabs.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5"><span className="text-[11px] text-ig-muted">タブ</span>
            {data.tabs.map((t) => <Chip key={t.gid} on={t.gid === data.gid} onClick={() => { setGid(t.gid); setData(null); }}>{t.title}</Chip>)}</div>
        )}
        {!forms.length && <div className="rounded-lg border border-ig-border bg-white p-8 text-center text-sm text-ig-muted">フォームがまだありません{canEdit && '。「フォームを足す」から回答シートのURLを登録してください'}</div>}
        {err && <div className="rounded-lg border border-ig-danger/40 bg-ig-danger/5 p-4 text-sm text-ig-danger">{err}</div>}
        {!err && form && !a && <div className="rounded-lg border border-ig-border bg-white p-8 text-center text-sm text-ig-muted">読み込み中…</div>}
        {a && data && <Body key={`${fid}:${data.gid}`} a={a} />}
      </div>
    </div>
  );
}

function Body({ a }: { a: ReturnType<typeof analyze> }) {
  const { ans, live, cols, main } = a;
  const [pick, setPick] = useState<{ i: number; v: string } | null>(null);
  const [only, setOnly] = useState<number | null>(null);   // この列に記入がある人だけ
  const [showOld, setShowOld] = useState(false);
  const [q, setQ] = useState('');
  const fq = foldSearch(q);   // 検索は 空白のありなし・異体字を区別しない
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const texts = cols.filter((c) => c.kind === 'text'), choices = cols.filter((c) => c.kind === 'choice');
  const olds = ans.length - live.length;
  const toggle = (i: number, v: string) => setPick(pick && pick.i === i && pick.v === v ? null : { i, v });
  const list = ans.filter((r) => (showOld || !r.old) && (!pick || r.cells[pick.i] === pick.v) && (only == null || !!r.cells[only]) && (!fq || foldSearch(r.cells.join(' ')).includes(fq)));
  const copy = async () => {
    const names = [...new Set(list.filter((r) => !r.old).map((r) => r.name).filter(Boolean))];
    try { await navigator.clipboard.writeText(names.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* 許可されていない */ }
  };

  return (
    <>
      <Dashboard live={live} main={main} others={choices.filter((c) => c !== main)} olds={olds} pick={pick} toggle={toggle} />
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip on={!pick && only == null} onClick={() => { setPick(null); setOnly(null); }}>すべて {live.length}</Chip>
        {main?.values.map(([v, n]) => <Chip key={v} on={pick?.i === main.i && pick.v === v} onClick={() => toggle(main.i, v)}>{v} {n}</Chip>)}
        {texts.filter((c) => c.filled < live.length * 0.8).map((c) => <Chip key={c.i} on={only === c.i} onClick={() => setOnly(only === c.i ? null : c.i)}><span className="inline-block max-w-[10rem] truncate align-bottom">{c.label}</span>に記入あり {c.filled}</Chip>)}
        {olds > 0 && <Chip on={showOld} onClick={() => setShowOld(!showOld)}>答え直す前も出す {olds}</Chip>}
        <span className="ml-auto flex items-center gap-1.5">
          <label className="relative"><Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ig-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・回答で探す" className={`${inputCls} w-44 py-1.5 pl-8 text-xs`} /></label>
          {a.hasName && <button onClick={copy} className={`${btnGray} inline-flex items-center gap-1.5 !px-3 text-xs`}><Copy size={14} />{copied ? 'コピーしました' : `表示中の名前をコピー ${new Set(list.filter((r) => !r.old).map((r) => r.name).filter(Boolean)).size}`}</button>}
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-ig-border bg-white">
        <div className="hidden grid-cols-[12rem_minmax(0,1fr)_minmax(0,1.6fr)_1.25rem] gap-3 border-b border-ig-divider bg-ig-subtle px-3 py-1.5 text-[11px] font-semibold text-ig-muted lg:grid">
          <span>名前・回答した日時</span><span>選んだ答え</span><span>書いてくれたこと</span><span />
        </div>
        {list.map((r) => <Item key={r.k} r={r} main={main} choices={choices} texts={texts} open={open === r.k} onOpen={() => setOpen(open === r.k ? null : r.k)} />)}
        {list.length === 0 && <div className="p-8 text-center text-sm text-ig-muted">該当する回答がありません</div>}
      </div>
    </>
  );
}

// 1回答＝1行。閉じたままでも 選んだ答え・書いてくれたこと が読める（2行まで）。押すと全文
function Item({ r, main, choices, texts, open, onOpen }: { r: Ans; main: Col | null; choices: Col[]; texts: Col[]; open: boolean; onOpen: () => void }) {
  const clamp = open ? 'whitespace-pre-wrap' : 'line-clamp-2';
  const mv = main ? r.cells[main.i] : '';
  const mc = main && mv ? colorOf(mv, main.values.findIndex(([v]) => v === mv)) : '';
  const wrote = texts.filter((c) => r.cells[c.i]);
  return (
    <button onClick={onOpen} className={`group grid w-full grid-cols-1 gap-x-3 gap-y-1 border-b border-ig-divider px-3 py-2 text-left text-xs last:border-b-0 hover:bg-ig-subtle lg:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1.6fr)_1.25rem] ${open ? 'bg-ig-subtle' : ''} ${r.old ? 'opacity-50' : ''}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5"><span className="truncate text-sm font-semibold">{r.name || '（名前なし）'}</span>
          {r.old && <span className="shrink-0 rounded bg-ig-hover px-1 text-[10px] font-bold text-ig-muted">答え直す前</span>}</div>
        <div className="truncate text-[11px] text-ig-muted">{when(r.ts)}</div>
      </div>
      <div className="flex min-w-0 flex-wrap items-start gap-1">
        {mv && <span className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: mc }}>{mv}</span>}
        {choices.filter((c) => c !== main && r.cells[c.i]).map((c) => <span key={c.i} title={c.label} className="max-w-full truncate rounded bg-ig-hover px-1.5 py-0.5 text-[11px]"><span className="text-ig-muted">{c.label.length > 10 ? `${c.label.slice(0, 10)}…` : c.label}：</span>{r.cells[c.i]}</span>)}
        {!mv && !choices.some((c) => r.cells[c.i]) && <span className="text-ig-muted">—</span>}
      </div>
      <div className="min-w-0 space-y-0.5">
        {wrote.map((c) => <div key={c.i} className={`${clamp} break-words`}><span className="mr-1 text-ig-muted" title={c.label}>{c.label.length > 12 && !open ? `${c.label.slice(0, 12)}…` : c.label}：</span>{r.cells[c.i]}</div>)}
        {!wrote.length && <span className="text-ig-muted">—</span>}
      </div>
      <ChevronDown size={14} className={`hidden self-center text-ig-muted transition-transform lg:block ${open ? 'rotate-180' : ''}`} />
    </button>
  );
}

function Num({ value }: { value: number }) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => { fx.countUp(el.current, value); }, [value]);
  return <span ref={el} className="tabular-nums">{value}</span>;
}

// 上の帯: 数字（回答した人数＋いちばん見たい設問の内訳）＋その分布 ／ 日ごとの回答数 ／ ほかの選択式の設問
function Dashboard({ live, main, others, olds, pick, toggle }: {
  live: Ans[]; main: Col | null; others: Col[]; olds: number; pick: { i: number; v: string } | null; toggle: (i: number, v: string) => void;
}) {
  const total = main ? main.filled || 1 : 1;
  const top = main ? main.values.slice(0, 3) : [];
  const days = useMemo(() => {
    const m = new Map<string, number>();
    live.forEach((r) => { const d = day(r.ts); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) m.set(d, (m.get(d) || 0) + 1); });
    return [...m.entries()].sort((x, y) => x[0].localeCompare(y[0])).slice(-10);
  }, [live]);
  const maxN = Math.max(1, ...days.map((d) => d[1]));
  return (
    <div className={`grid grid-cols-1 gap-3 ${others.length ? 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]'}`}>
      <div className="rounded-lg border border-ig-border bg-white p-3">
        {main && <div className="mb-2 truncate text-xs font-semibold" title={main.label}>{main.label}</div>}
        <div className="grid gap-2 text-center" style={{ gridTemplateColumns: `repeat(${top.length + 1}, minmax(0, 1fr))` }}>
          <div><div className="text-[10px] text-ig-muted">回答</div><div className="text-xl font-bold leading-tight"><Num value={live.length} /></div><div className="text-[10px] text-ig-muted">{olds ? `答え直し ${olds}件` : '人'}</div></div>
          {main && top.map(([v, n], k) => (
            <button key={v} onClick={() => toggle(main.i, v)} className={`ig-press rounded-lg ${pick?.i === main.i && pick.v === v ? 'bg-ig-hover' : ''}`}>
              <div className="truncate text-[10px] text-ig-muted" title={v}>{v}</div>
              <div className="text-xl font-bold leading-tight" style={{ color: colorOf(v, k) }}><Num value={n} /></div>
              <div className="text-[10px] text-ig-muted">{Math.round((n / total) * 100)}%</div>
            </button>
          ))}
        </div>
        {main && <>
          <div className="mt-3 flex h-7 w-full overflow-hidden rounded-lg">
            {main.values.map(([v, n], k) => (
              <button key={v} onClick={() => toggle(main.i, v)} title={`${v}：${n}人`}
                className={`ig-press flex items-center justify-center overflow-hidden whitespace-nowrap text-[11px] font-semibold text-white transition-opacity ${pick && !(pick.i === main.i && pick.v === v) ? 'opacity-30' : ''}`}
                style={{ width: `${(n / total) * 100}%`, background: colorOf(v, k) }}>{n / total > 0.14 && `${v}　${n}`}</button>
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ig-muted">
            {main.values.map(([v, n], k) => <button key={v} onClick={() => toggle(main.i, v)} className={`inline-flex items-center gap-1 ${pick?.i === main.i && pick.v === v ? 'font-bold text-ig-text' : ''}`}><span className="h-2 w-2 rounded-full" style={{ background: colorOf(v, k) }} />{v}：{n}人（{Math.round((n / total) * 100)}%）</button>)}
          </div>
        </>}
        {!main && <div className="mt-2 text-[11px] text-ig-muted">選択式の設問が無いフォームです（下の一覧に回答が並びます）</div>}
      </div>
      <div className="rounded-lg border border-ig-border bg-white p-3">
        <div className="mb-2 text-xs font-semibold">日ごとの回答数</div>
        <div className="flex h-[112px] items-end gap-1.5">
          {days.map(([d, n]) => (
            <div key={d} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
              <span className="text-[10px] font-semibold tabular-nums">{n}</span>
              <div className="ig-rise ig-gradient w-full max-w-[40px] rounded-t-md" style={{ height: `${Math.max(4, (n / maxN) * 72)}px` }} title={`${d}：${n}人`} />
              <span className="whitespace-nowrap text-[10px] text-ig-muted">{Number(d.slice(5, 7))}/{Number(d.slice(8, 10))}</span>
            </div>
          ))}
          {!days.length && <div className="w-full self-center text-center text-[11px] text-ig-muted">回答日時がありません</div>}
        </div>
      </div>
      {others.length > 0 && (
        <div className="max-h-[220px] space-y-3 overflow-y-auto rounded-lg border border-ig-border bg-white p-3">
          {others.map((c) => (
            <div key={c.i}>
              <div className="mb-1 truncate text-xs font-semibold" title={c.label}>{c.label}</div>
              <div className="space-y-1">
                {c.values.map(([v, n], k) => (
                  <button key={v} onClick={() => toggle(c.i, v)} className={`block w-full rounded text-left ${pick?.i === c.i && pick.v === v ? 'bg-ig-hover' : ''}`}>
                    <div className="flex justify-between gap-2 text-[11px]"><span className="truncate">{v}</span><span className="shrink-0 tabular-nums text-ig-muted">{n}人</span></div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-ig-hover"><div className="h-full rounded-full" style={{ width: `${(n / (c.filled || 1)) * 100}%`, background: colorOf(v, k) }} /></div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// フォームを足す・外す（admin 以上）。回答シートのURLを貼るだけ。保存すると全員の画面に出る
function Editor({ forms, onSaved }: { forms: FormDef[]; onSaved: (fs: FormDef[]) => void }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (next: FormDef[]) => {
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/sy/s/forms', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forms: next }) });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || '保存できませんでした');
      onSaved(j.forms); setTitle(''); setUrl('');
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  };
  const add = () => {
    const p = parseSheetUrl(url);
    if (!title.trim()) return setMsg('名前を入れてください');
    if (!p) return setMsg('スプレッドシートのURLを貼ってください');
    save([...forms, { id: `f${Date.now().toString(36)}`, title: title.trim(), sheetId: p.sheetId, gid: p.gid }]);
  };
  return (
    <div className="space-y-2 rounded-lg border border-ig-border bg-white p-3">
      <div className="text-xs font-semibold">フォームを足す <span className="font-normal text-ig-muted">Googleフォームの回答シートを開いて、そのURLを貼ります（回答が入っているタブを開いた状態で）</span></div>
      <div className="flex flex-wrap gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="名前（例：11月 入社説明会）" className={`${inputCls} w-56 py-1.5`} />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className={`${inputCls} min-w-0 flex-1 py-1.5`} />
        <button onClick={add} disabled={busy} className={btnPrimary}>足す</button>
      </div>
      {msg && <div className="text-xs text-ig-danger">{msg}</div>}
      <div className="flex flex-wrap gap-1.5">
        {forms.map((f) => (
          <span key={f.id} className="inline-flex items-center gap-1 rounded-lg bg-ig-hover py-1 pl-2.5 pr-1 text-xs font-semibold">{f.title}
            <button disabled={busy} title="このページから外す（シートは消えません）" onClick={() => { if (confirm(`「${f.title}」をこのページから外しますか？（回答シートは消えません）`)) save(forms.filter((x) => x.id !== f.id)); }} className="rounded p-1 text-ig-muted hover:bg-ig-border hover:text-ig-danger"><Trash2 size={13} /></button>
          </span>
        ))}
      </div>
    </div>
  );
}
