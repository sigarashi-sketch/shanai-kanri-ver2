'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Columns3, GripVertical, RefreshCw, Search, X } from 'lucide-react';
import { Pill } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import { ProperDetail } from '@/components/ProperDetail';
import { CopyBtn, SukishiFiles, SukishiLinks, sukishiFilesText } from '@/components/SukishiFiles';
import { Dialog } from '@/components/Dialog';
import { useIke } from '@/components/Live';
import { ScoreBadge, ScoreNote, SCORE_HINT, SCORE_LABEL, useProperScores } from '@/components/ProperScore';
import { Z_MODAL } from '@/lib/layers';
import { fileUrlsOf, normName, properStatus, type EngineerRow, type EngineerRows } from '@/lib/live/eigyo-common';
import {
  COMMUTE_BLOCKS, COMMUTE_PREF, LONG_TEXT, SCORE_FILTER_OPTS, SELECT_ALIAS, SELECT_BLANK, SELECT_OPTIONS, commuteKey, shownValue, scoreFilterLabel, scoreValue,
  type CommuteDetail, type CommuteListRow, type ScoreKind,
} from '@/lib/live/proper-cols';

// プロパーリストの表（今の proper.html の列を全部・10-25 shoya「いけドンにあったのは全部いれて」「参画とか辞退ボタンとかもね」）。
//   ・行＝今の getEngineerRows（area=main）
//   ・列：スコア（スキル／参画見込／辞退リスク／営業止め見込）・最終返信・フォーム回答・LINE・通勤エリア・PDF・dropout・
//         今の全部の文字列とチェック列。どの列を出すか・並び（ドラッグ）はその人の端末に残す（localStorage）
//   ・絞り込み：「営業中のみ」が最初（切り替えで 全員／営業止め／提案禁止／辞退／参画決定／dropout／かな西／要確認）＋列ごとの絞り込み
//   ・書く：チェック・選択肢・文字は変えたらすぐ保存（/api/live/proper-save → 今の saveEngineerRow）。トーストの「取り消す」で前の値に戻す
//     参画決定ON の連動（稼働中ON・営業止め/再アサインOFF・入社案内の予約）は今のシステムがやる → 保存のあと読み直す
//   ・「稼働月を開いたときに今月へ直す」書き込みは入れない（今の画面だけの動き・10-25 指示）
//   ・dropout の印（/api/live/proper-dropout → 今の setDropout）・PDF出力／Excel出力（components/SukishiFiles → /api/live/proper-pdf → 今の /api/skillsheet pdf|xlsx）もここから

type Val = string | boolean;
type V = Record<string, Val>;
type Drop = { on: boolean; at: string; phase: string };
type PRow = { r: EngineerRow; v: V; status: string; drop: Drop };
type FilterKind = 'text' | 'select' | 'bool' | 'none';
type Col = {
  key: string; label: string; group: string; def: boolean; filter: FilterKind; opts?: readonly string[];
  text: (p: PRow) => string; num?: (p: PRow) => number | null; cell: (p: PRow) => React.ReactNode; hint?: string; minW?: number;
};

const SCOPES = [
  ['active', '営業中のみ'], ['all', '全員（営業止め・辞退・稼働中も）'], ['poa', '営業止め のみ'], ['teishi', '提案禁止 のみ'], ['jitai', '辞退 のみ'],
  ['sankaku', '参画決定 のみ'], ['dropout', 'dropout（飛び） のみ'], ['kanawest', 'かな西 のみ'], ['review', '要確認 のみ'],
] as const;
type Scope = (typeof SCOPES)[number][0];
const scopeTest: Record<Scope, (p: PRow) => boolean> = {
  active: (p) => p.r.active, all: () => true, poa: (p) => p.v.poa === true, teishi: (p) => p.v.eigyo_teishi === true, jitai: (p) => p.v.jitai === true,
  sankaku: (p) => p.v.sankaku_kettei === true, dropout: (p) => p.drop.on, kanawest: (p) => !!p.r.kanagawa, review: (p) => p.v.needs_review === true,
};

const PREF_KEY = 'v2_proper_cols_v2';
// はじめに出す列＝大事なものだけ（横スクロールなしで見える数）。ほかは列の設定で足すか、行を押して小窓で見る（10-25 shoya）
const MAIN_COLS = new Set(['status', 'score:join', 'tantou', 'eki', 'lastReply', 'sukishi', 'pdf', 'shoudaku_nyusha_bi', 'eigyo_teishi']);
type Prefs = { order: string[]; hidden: string[]; shown: string[] };
function loadPrefs(): Prefs | null { try { const s = localStorage.getItem(PREF_KEY); return s ? (JSON.parse(s) as Prefs) : null; } catch { return null; } }
function savePrefs(p: Prefs) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* 残せなくても画面は動く */ } }

const PHASE_LABEL: Record<string, string> = { eigyo: '参画決定の前', kettei: '参画決定の後・入場前', kadou: '現場に入った後' };
const fmtMd = (iso: string) => { const t = Date.parse(iso); if (Number.isNaN(t)) return ''; const d = new Date(t + 9 * 3600e3); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
const s = (v: Val | undefined) => (typeof v === 'boolean' ? (v ? 'true' : '') : String(v ?? ''));
const isUrl = (x: string) => /^https?:\/\//.test(x);
function elapsed(ts: number | null): string {
  if (!ts) return '';
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  return m < 60 ? `${m}分前` : m < 1440 ? `${Math.floor(m / 60)}時間前` : `${Math.floor(m / 1440)}日前`;
}
function sukishiState(v: V): '作成済み' | '未作成' | '要確認' {
  if (s(v.sukishi)) return '作成済み';
  return /(?:^|\n)\s*氏\s*名\s*[：:]\s*[^\s(（\n]+/.test(s(v.summary)) ? '未作成' : '要確認';
}
const SK_TONE: Record<string, React.CSSProperties> = {
  作成済み: { background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }, 未作成: { background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }, 要確認: { background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' },
};

export function ProperList({ data, live, reload, onSukishi, sukishiDone }: {
  data: EngineerRows | null; live: boolean; reload: () => unknown; onSukishi: (id: string) => void; sukishiDone?: ReadonlySet<string>;
}) {
  const canEdit = usePerms().can('eigyo', 'edit') && live;
  const { hit, toast } = useMotivation();
  const scores = useProperScores(live);
  const replies = useIke<{ ts: number; groupName: string }[]>(live ? 'proxy?action=getReplies' : null);
  const forms = useIke<{ success?: boolean; names: string[] | null }>(live ? 'basic-info?action=names' : null);
  const groups = useIke<{ id: string; name: string }[]>(live ? 'proxy?action=getGroupNames' : null);
  const commute = useIke<{ ok: boolean; rows: CommuteListRow[] }>(live ? 'commute-area?action=list' : null);

  // ---- 手元で直した値（保存の結果を待たずに出す） ----
  const [over, setOver] = useState<Record<string, V>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [commuteOver, setCommuteOver] = useState<Record<string, CommuteListRow | null>>({});
  const [dropOver, setDropOver] = useState<Record<string, Drop>>({});

  const rows: PRow[] = useMemo(() => (data?.rows ?? []).map((r) => {
    const v: V = {};
    for (const c of data!.columns) { const x = r.cells[c.idx]; v[c.col] = c.type === 'bool' ? x === true : String(x ?? '').trim(); }
    Object.assign(v, over[r.row]);
    const cs: Record<string, string> = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, s(x)]));
    return { r, v, status: properStatus(r, cs), drop: dropOver[r.row] ?? { on: !!r.dropout, at: r.dropoutAt || '', phase: r.dropoutPhase || '' } };
  }), [data, over, dropOver]);

  // ---- 連絡まわりの当て方（今の proper.html と同じ：グループ名（畳む）に氏名（畳む・2文字以上）が入っているか） ----
  const aux = useMemo(() => {
    const rep = live && Array.isArray(replies.data) ? replies.data : null;
    const fm = live && Array.isArray(forms.data?.names) ? forms.data!.names : null;
    const gp = live && Array.isArray(groups.data) ? groups.data.map((g) => g.name) : null;
    const cm = live && commute.data?.ok ? commute.data.rows : null;
    const repN = rep?.map((x) => ({ n: normName(x.groupName), ts: Number(x.ts) || 0 })) ?? null;
    const gpN = gp?.map(normName) ?? null;
    const fmSet = fm ? new Set(fm.map(normName)) : null;
    const cmMap = cm ? new Map(cm.map((x) => [normName(x.key), x])) : null;
    return {
      lastReply: (name: string): number | null | undefined => { if (!repN) return undefined; const k = normName(name); if (k.length < 2) return null; let b = 0; for (const g of repN) if (g.n.includes(k) && g.ts > b) b = g.ts; return b || null; },
      form: (name: string) => (fmSet ? (fmSet.has(normName(name)) ? '回答済' : '未回答') : '-'),
      line: (name: string) => { if (!gpN) return '-'; const k = normName(name); return k.length >= 2 && gpN.some((g) => g.includes(k)) ? 'あり' : '未作成'; },
      commute: (name: string): CommuteListRow | null | undefined => { const k = commuteKey(name); if (k in commuteOver) return commuteOver[k]; return cmMap ? cmMap.get(k) ?? null : undefined; },
    };
  }, [live, replies.data, forms.data, groups.data, commute.data, commuteOver]);

  // ---- 保存（チェック・選択肢・文字）。取り消す＝前の値をもう一度保存 ----
  const save = useCallback(async (p: PRow, patch: V, opts?: { undo?: boolean }) => {
    const id = p.r.row;
    const prev: V = {};
    for (const k of Object.keys(patch)) prev[k] = p.v[k] ?? (typeof patch[k] === 'boolean' ? false : '');
    // 参画決定ON は今のシステムが 稼働中ON・営業止めOFF・再アサインOFF も一緒にする → 取り消すときはそれも前に戻す
    if (patch.sankaku_kettei === true && !opts?.undo) for (const k of ['kadou_chu', 'poa', 'sai_assign']) prev[k] = p.v[k] === true;
    const keys = Object.keys(patch).map((k) => `${id}:${k}`);
    setBusy((b) => new Set([...b, ...keys]));
    setOver((o) => ({ ...o, [id]: { ...o[id], ...patch } }));
    const label = Object.keys(patch).map((k) => data?.columns.find((c) => c.col === k)?.label ?? k).join('・');
    const one = Object.entries(patch)[0];
    const what = typeof one?.[1] === 'boolean' ? `${label} を ${one[1] ? 'ON' : 'OFF'}` : `${label} を保存`;
    const done = () => setBusy((b) => { const n = new Set(b); keys.forEach((k) => n.delete(k)); return n; });
    if (!live) { done(); setOver((o) => ({ ...o, [id]: { ...o[id], ...prev } })); return; }
    try {
      const res = await fetch('/api/live/proper-save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ row: id, cells: patch }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; autoSet?: Record<string, string>; saiAssignOff?: boolean; poaOff?: boolean; taikiOff?: boolean };
      done();
      if (!res.ok || !j.ok) {
        setOver((o) => ({ ...o, [id]: { ...o[id], ...prev } }));
        toast({ text: `${p.r.name}：保存できませんでした`, sub: j.error || `（${res.status}）` });
        return;
      }
      // 今のシステムが自動で入れた列（メモ → 初回ヒアリング予約）を手元にも
      const auto: V = {};
      for (const [idx, val] of Object.entries(j.autoSet ?? {})) { const c = data?.columns.find((x) => String(x.idx) === idx); if (c) auto[c.col] = val; }
      if (Object.keys(auto).length) { setOver((o) => ({ ...o, [id]: { ...o[id], ...auto } })); for (const k of Object.keys(auto)) prev[k] = p.v[k] ?? ''; }
      const side = [patch.sankaku_kettei === true && '稼働中ON（連動）', j.poaOff && '営業止めOFF', j.saiAssignOff && '再アサインOFF', j.taikiOff && '待機OFF', auto.hearing_booking && '初回ヒアリング予約を入れました'].filter(Boolean).join('・');
      hit();
      toast({
        text: opts?.undo ? `${p.r.name}：元に戻しました` : `${p.r.name}：${what}`,
        sub: opts?.undo ? undefined : patch.sankaku_kettei === true ? `→ ${side}。入社案内を送る設定なら、1時間後に本人へ送られます。「取り消す」（または1時間以内に参画決定を外す）と送られません` : side ? `→ ${side}` : '→ 今のプロパーリストにも出ます',
        undo: opts?.undo ? undefined : () => { void save({ ...p, v: { ...p.v, ...patch, ...auto } }, prev, { undo: true }); },
      });
      // チェックは連動があるので読み直す（読み直したら手元の値は捨てる＝本物の値に揃える）
      if (Object.values(patch).some((x) => typeof x === 'boolean')) {
        await reload();
        setOver((o) => { const n = { ...o }; delete n[id]; return n; });
      }
    } catch (e) {
      done();
      setOver((o) => ({ ...o, [id]: { ...o[id], ...prev } }));
      toast({ text: `${p.r.name}：保存できませんでした`, sub: (e as Error).message });
    }
  }, [live, data, hit, toast, reload]);

  const [commuteFor, setCommuteFor] = useState<PRow | null>(null);
  const [dropFor, setDropFor] = useState<PRow | null>(null);
  const [statusFor, setStatusFor] = useState<{ p: PRow; tab?: string } | null>(null);
  // 表示の形：リスト（今の既定＝9列だけ＋押すと右に詳細）／全列表（今の従来の表）。その人の端末に残す
  const [mode, setModeRaw] = useState<'list' | 'table'>('list');
  useEffect(() => { try { if (localStorage.getItem('v2_proper_mode') === 'table') setModeRaw('table'); } catch { /* なくても動く */ } }, []);
  const setMode = (m: 'list' | 'table') => { setModeRaw(m); try { localStorage.setItem('v2_proper_mode', m); } catch { /* なくても動く */ } };
  const [selRow, setSelRow] = useState<string | null>(null);
  const selP = selRow ? rows.find((p) => p.r.row === selRow) ?? null : null;
  const paneRef = useRef<HTMLElement | null>(null);
  useEffect(() => { if (selRow) paneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [selRow]);

  // ---- dropout（飛び）の印。取り消す＝印を戻し、一緒に変わったチェック（辞退・参画決定・稼働中）も前の値で保存し直す ----
  const setDrop = useCallback(async (p: PRow, on: boolean, phase: string, after: string, undo?: boolean) => {
    const prevDrop = p.drop;
    const prevV = { jitai: p.v.jitai === true, sankaku_kettei: p.v.sankaku_kettei === true, kadou_chu: p.v.kadou_chu === true };
    let d: { ok?: boolean; error?: string; dropoutAt?: string; phase?: string; sales?: Record<string, boolean>; status?: Record<string, boolean>; saiAssignOn?: boolean; salesNote?: string } = { ok: true };
    if (live) {
      try {
        const r = await fetch('/api/live/proper-dropout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: p.r.name, row: p.r.row, on, phase, after }) });
        d = await r.json().catch(() => ({ error: `（${r.status}）` }));
        if (!r.ok || !d.ok) { toast({ text: `${p.r.name}：dropout を保存できませんでした`, sub: d.error }); return; }
      } catch (e) { toast({ text: `${p.r.name}：dropout を保存できませんでした`, sub: (e as Error).message }); return; }
    }
    const now: Drop = on ? { on: true, at: d.dropoutAt || new Date().toISOString(), phase: d.phase || phase } : { on: false, at: '', phase: '' };
    setDropOver((o) => ({ ...o, [p.r.row]: now }));
    const sales = d.sales ?? {};
    const st = d.status ?? {};
    const m = [sales.sankaku_kettei === true && '参画決定ON', sales.jitai === true && '辞退ON', sales.kadou_chu === false && '稼働中OFF', st.taisha === true && '退社', st.taiki === true && `待機${d.saiAssignOn ? '・再アサインON' : ''}`].filter(Boolean) as string[];
    const changed = Object.fromEntries(Object.entries(prevV).filter(([k]) => k in sales && sales[k] !== prevV[k as keyof typeof prevV]));
    hit();
    toast({
      text: undo ? `${p.r.name}：dropout を元に戻しました` : on ? `${p.r.name}：dropout（飛び）にしました` : `${p.r.name}：dropout の印を外しました`,
      sub: undo ? undefined : on ? (m.length ? `→ ${m.join('・')}${st.taisha || st.taiki ? '（退社・待機は取り消しでは戻りません。従業員名簿で直してください）' : ''}` : '→ 印だけ付けました') : '→ 辞退・参画決定・退社・待機はそのままです',
      undo: undo ? undefined : async () => {
        await setDrop({ ...p, drop: now }, !on, prevDrop.phase || 'eigyo', 'mark', true);
        if (on && Object.keys(changed).length && live) await save({ ...p, v: { ...p.v, ...sales } }, changed, { undo: true });
      },
    });
    if (live) { await reload(); setDropOver((o) => { const n = { ...o }; delete n[p.r.row]; return n; }); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, hit, toast, reload, save]);

  const ro = !canEdit;
  const roTitle = ro ? needText('edit') : undefined;
  const isBusy = (p: PRow, f: string) => busy.has(`${p.r.row}:${f}`);

  // ---- 列 ----
  const cols: Col[] = useMemo(() => {
    const txt = (f: string, label: string, group: string, def: boolean, minW = 110): Col => ({
      key: f, label, group, def, filter: SELECT_OPTIONS[f] ? 'select' : 'text', opts: SELECT_OPTIONS[f], minW, text: (p) => shownValue(f, s(p.v[f])),
      num: f === 'sentouryoku' || f === 'heikou_suu' ? (p) => (s(p.v[f]) === '' ? null : Number(s(p.v[f])) || 0) : undefined,
      cell: (p) => SELECT_OPTIONS[f]
        ? <SelectCell value={s(p.v[f])} opts={SELECT_OPTIONS[f]} alias={SELECT_ALIAS[f]} blank={SELECT_BLANK[f] ?? '—'} disabled={ro} title={roTitle} busy={isBusy(p, f)} label={label} onPick={(x) => save(p, { [f]: x })} />
        : <TextCell value={s(p.v[f])} multiline={LONG_TEXT.has(f)} disabled={ro} title={roTitle} busy={isBusy(p, f)} label={label} onCommit={(x) => save(p, { [f]: x })} />,
    });
    const chk = (f: string, label: string, def: boolean): Col => ({
      key: f, label, group: 'チェック', def, filter: 'bool', text: (p) => (p.v[f] === true ? '✓' : ''),
      cell: (p) => (f === 'eigyo_teishi' && p.r.beforeSales && p.v[f] === true
        ? <span className="inline-flex items-center gap-1"><BoolCell on disabled={ro} title={roTitle ?? '初回ヒアリング前のため営業開始前（済めば自動で外れます）。押すと手で外す'} busy={isBusy(p, f)} label={label} onToggle={() => save(p, { [f]: false })} /><span className="whitespace-nowrap text-xs text-warn">営業開始前</span></span>
        : <BoolCell on={p.v[f] === true} disabled={ro} title={roTitle} busy={isBusy(p, f)} label={label} onToggle={() => save(p, { [f]: !(p.v[f] === true) })} />),
    });
    const score = (k: ScoreKind, def: boolean): Col => ({
      key: `score:${k}`, label: SCORE_LABEL[k], group: 'スコア', def, filter: 'select', opts: SCORE_FILTER_OPTS[k], hint: SCORE_HINT[k],
      text: (p) => scoreFilterLabel(scores.map.get(p.r.row) ?? null, k, scores.meta),
      num: (p) => { const x = scores.map.get(p.r.row); return x ? scoreValue(x, k) : null; },
      cell: (p) => <ScoreBadge s={scores.map.get(p.r.row)} kind={k} meta={scores.meta} name={p.r.name} />,
    });
    const scoreCols = scores.state === 'off' ? [] : [score('skill', true), score('join', true), score('decline', true), score('poa', false)];
    const all: Col[] = [
      { key: 'status', label: '状態', group: '基本', def: true, filter: 'select', opts: ['営業中', '参画決定', '稼働中', '止め・辞退'], text: (p) => p.status, cell: (p) => <button type="button" disabled={ro} title={roTitle ?? '押すと状態を変える（参画決定・辞退などは日付も入れます）'} onClick={() => setStatusFor({ p })} className="disabled:cursor-not-allowed"><Pill>{p.status}</Pill></button> },
      ...scoreCols,
      txt('sentouryoku', '戦闘力', '基本', true, 70),
      { key: 'lastReply', label: '最終返信', group: '連絡', def: true, filter: 'select', opts: ['24時間以内', '3日以内', 'なし'], hint: '直近3日の LINE グループの返信',
        text: (p) => { const t = aux.lastReply(p.r.name); return t === undefined ? '-' : !t ? 'なし' : Date.now() - t < 864e5 ? '24時間以内' : '3日以内'; },
        num: (p) => aux.lastReply(p.r.name) || null,
        cell: (p) => { const t = aux.lastReply(p.r.name); return t === undefined ? <span className="text-faint">-</span> : !t ? <span className="text-faint">—</span> : <span className="num whitespace-nowrap" style={{ color: Date.now() - t < 864e5 ? 'var(--tone-ok-fg)' : 'var(--tone-warn-fg)' }} title={new Date(t).toLocaleString('ja-JP')}>{elapsed(t)}</span>; } },
      { key: 'form', label: 'フォーム回答', group: '連絡', def: true, filter: 'select', opts: ['回答済', '未回答'], text: (p) => aux.form(p.r.name),
        cell: (p) => { const x = aux.form(p.r.name); return x === '-' ? <span className="text-faint">-</span> : <span className="chip" style={x === '回答済' ? SK_TONE.作成済み : SK_TONE.要確認}>{x}</span>; } },
      { key: 'line', label: 'LINE', group: '連絡', def: true, filter: 'select', opts: ['あり', '未作成'], text: (p) => aux.line(p.r.name),
        cell: (p) => { const x = aux.line(p.r.name); return x === '-' ? <span className="text-faint">-</span> : x === '未作成' ? <span className="font-semibold text-bad">未作成</span> : <span className="text-muted">あり</span>; } },
      txt('tantou', '採用担当', '基本', true, 90),
      txt('eki', '最寄駅', '条件', true, 100),
      { key: 'commute', label: '通勤エリア', group: '条件', def: true, filter: 'text', minW: 120,
        text: (p) => aux.commute(p.r.name)?.short ?? '',
        cell: (p) => { const c = aux.commute(p.r.name); return (
          <button type="button" onClick={() => setCommuteFor(p)} title={c ? `${c.full}（${c.source === 'sales' ? '営業が入力' : '本人の回答'}）・押すと直す` : '押すと見る・直す'} className="max-w-[160px] truncate text-left hover:underline">
            {c === undefined ? <span className="text-faint">-</span> : c ? <>{c.short}{c.source === 'sales' && <span className="ml-1 text-xs text-faint">営業</span>}</> : <span className="text-faint">未設定</span>}
          </button>); } },
      txt('kadou', '稼働', '条件', true, 90),
      txt('tsuukin', '通勤', '条件', false, 80),
      txt('shozoku', '所属', '基本', false, 100),
      txt('gakumen', '額面', '基本', true, 90),
      { key: 'sukishi', label: 'スキシ', group: 'スキシ', def: true, filter: 'select', opts: ['作成済み', '未作成', '要確認'],
        text: (p) => (sukishiDone?.has(p.r.row) ? '作成済み' : sukishiState(p.v)),
        cell: (p) => { const st = sukishiDone?.has(p.r.row) ? '作成済み' : sukishiState(p.v); return (
          <span className="inline-flex items-center gap-1">
            <button type="button" onClick={() => onSukishi(p.r.row)} title={st === '作成済み' ? '押すとスキシを見る（右にプレビュー）' : '押すとスキシを作る'} className="chip whitespace-nowrap" style={SK_TONE[st]}>{st}</button>
            {/* 10-28 shoya：サマリのコピー・スキシ単体の URL（新しいタブ／コピー）を表から1回で */}
            {s(p.v.summary).trim() && <CopyBtn text={s(p.v.summary)} what={`${p.r.name}のサマリ`} />}
            <SukishiLinks url={s(p.v.sukishi)} name={p.r.name} compact />
          </span>); } },
      // 今の proper.html の PDF 列と同じ（本名版／イニシャル版 × PDF／Excel の閲覧・DL と、スキシがあれば PDF出力・Excel出力）。スキシの隣にはじめから出す
      { key: 'pdf', label: 'PDF', group: 'スキシ', def: true, filter: 'text', hint: '本名版／イニシャル版の PDF・Excel を閲覧・DL／その場で出力', text: (p) => sukishiFilesText(p.r),
        cell: (p) => <SukishiFiles files={fileUrlsOf(p.r)} row={p.r.row} name={p.r.name} canMake={isUrl(s(p.v.sukishi))} live={live} onMade={reload} /> },
      { ...txt('summary', 'サマリ', 'スキシ', false, 200),
        cell: (p) => <span className="flex items-start gap-1"><span className="min-w-0 flex-1"><TextCell value={s(p.v.summary)} multiline disabled={ro} title={roTitle} busy={isBusy(p, 'summary')} label="サマリ" onCommit={(x) => save(p, { summary: x })} /></span>{s(p.v.summary).trim() && <CopyBtn text={s(p.v.summary)} what={`${p.r.name}のサマリ`} />}</span> },
      txt('zenshoku', '前職/経験/資格', 'スキシ', false, 200),
      txt('kibou_shokushu', '希望職種', '条件', true, 120),
      txt('shift', 'シフト', '条件', false, 90),
      txt('yakin', '夜勤', '条件', false, 90),
      txt('shucchou', '出張', '条件', false, 90),
      txt('genba_made', '現場まで', '条件', false, 90),
      txt('memo', 'メモ', '基本', true, 200),
      txt('zokusei', '属性', '基本', false, 120),
      txt('heikou_suu', '並行数', '基本', false, 70),
      txt('nyuujou_bi', '入場日', '日付', false, 100),
      txt('sankaku_bi', '参画日', '日付', false, 100),
      txt('shoudaku_bi', '承諾日', '日付', false, 100),
      txt('shoudaku_nyusha_bi', '稼働可能日', '日付', true, 100),
      txt('hearing_booking', '初回ヒアリング予約', '日付', false, 140),
      txt('jitai_bi', '辞退日', '日付', false, 100),
      txt('poa_bi', '営業止め日', '日付', false, 100),
      chk('poa', '営業止め', true),
      chk('jitai', '辞退', true),
      { key: 'dropout', label: 'dropout', group: 'チェック', def: true, filter: 'bool', text: (p) => (p.drop.on ? '✓' : ''),
        cell: (p) => <button type="button" disabled={ro} title={roTitle ?? (p.drop.on ? `飛び（${PHASE_LABEL[p.drop.phase] || '時期不明'}）。押すと印を外す` : '押すと dropout（飛び）にする')} onClick={() => setDropFor(p)}
          className="chip whitespace-nowrap disabled:cursor-not-allowed" style={p.drop.on ? SK_TONE.要確認 : { background: 'transparent', color: 'var(--color-faint)', boxShadow: 'inset 0 0 0 1px var(--color-field)' }}>{p.drop.on ? `飛び${p.drop.at ? ` ${fmtMd(p.drop.at)}` : ''}` : 'dropout'}</button> },
      chk('sankaku_kettei', '参画決定', true),
      chk('kadou_chu', '稼働中', true),
      chk('sai_assign', '再アサイン', false),
      // 10-28 shoya「営業停止→提案禁止」：中身は今のシステムの営業停止（eigyo_teishi）のまま・名前だけ変えて はじめから出す
      chk('eigyo_teishi', '提案禁止', true),
      chk('kanagawa', '神奈川', false),
      chk('kansai', '関西', false),
      chk('needs_review', '要確認', false),
    ];
    return all.map((c) => ({ ...c, def: MAIN_COLS.has(c.key) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, aux, ro, roTitle, busy, save, sukishiDone, onSukishi, live, reload]);

  // ---- 出す列・並び（その人の端末に残す） ----
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  useEffect(() => { setPrefs(loadPrefs()); }, []);
  const ordered = useMemo(() => {
    const order = prefs?.order ?? [];
    const pos = (k: string) => { const i = order.indexOf(k); return i < 0 ? 1000 + cols.findIndex((c) => c.key === k) : i; };
    return [...cols].sort((a, b) => pos(a.key) - pos(b.key));
  }, [cols, prefs]);
  const shownCol = (c: Col) => (prefs?.hidden.includes(c.key) ? false : prefs?.shown.includes(c.key) ? true : c.def);
  const visible = ordered.filter(shownCol);
  const setPrefsSave = (p: Prefs) => { setPrefs(p); savePrefs(p); };
  const toggleCol = (c: Col) => {
    const p = prefs ?? { order: [], hidden: [], shown: [] };
    const on = shownCol(c);
    setPrefsSave({ ...p, hidden: on ? [...p.hidden.filter((k) => k !== c.key), c.key] : p.hidden.filter((k) => k !== c.key), shown: on ? p.shown.filter((k) => k !== c.key) : [...p.shown.filter((k) => k !== c.key), c.key] });
  };
  const [picker, setPicker] = useState(false);

  // ---- 絞り込み・並べ替え ----
  const [scope, setScope] = useState<Scope>('active');
  const [q, setQ] = useState('');
  const [flt, setFlt] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [limit, setLimit] = useState(200);
  useEffect(() => { const u = new URLSearchParams(window.location.search); const sc = u.get('scope') as Scope | null; if (sc && sc in scopeTest) setScope(sc); const qq = u.get('q'); if (qq) setQ(qq); }, []);
  const colByKey = useMemo(() => new Map(cols.map((c) => [c.key, c])), [cols]);
  const shown = useMemo(() => {
    const nq = normName(q).toLowerCase();
    let out = rows.filter((p) => scopeTest[scope](p));
    if (nq) out = out.filter((p) => normName(`${p.r.name}${s(p.v.eki)}${s(p.v.kibou_shokushu)}${s(p.v.memo)}${s(p.v.zokusei)}${s(p.v.tantou)}`).toLowerCase().includes(nq));
    for (const [k, val] of Object.entries(flt)) {
      const c = colByKey.get(k);
      if (!c || !val || !shownCol(c)) continue;
      if (c.filter === 'bool') out = out.filter((p) => (c.text(p) === '✓') === (val === 'on'));
      else if (c.filter === 'select') out = out.filter((p) => (val === '(空)' ? c.text(p) === '' : c.text(p) === val));
      else out = out.filter((p) => normName(c.text(p)).toLowerCase().includes(normName(val).toLowerCase()));
    }
    if (sort) {
      const c = colByKey.get(sort.key);
      if (c) out = out.map((p, i) => ({ p, i })).sort((a, b) => {
        const av = c.num ? c.num(a.p) : c.text(a.p), bv = c.num ? c.num(b.p) : c.text(b.p);
        const ae = av === null || av === '', be = bv === null || bv === '';
        if (ae || be) return ae && be ? a.i - b.i : ae ? 1 : -1;   // 空は常に末尾
        const d = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'ja');
        return d ? d * sort.dir : a.i - b.i;
      }).map((x) => x.p);
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, scope, q, flt, sort, colByKey, prefs]);
  const filtered = scope !== 'active' || !!q || Object.values(flt).some(Boolean);
  const clickSort = (k: string) => setSort((x) => (!x || x.key !== k ? { key: k, dir: -1 } : x.dir === -1 ? { key: k, dir: 1 } : null));
  const optsOf = (c: Col): string[] => (c.opts ? [...c.opts] : Array.from(new Set(rows.map((p) => c.text(p)).filter(Boolean))).sort().slice(0, 60));

  // ---- ミンミカ取り込み ----
  const [pulling, setPulling] = useState(false);
  const pull = async () => {
    if (!live) return;
    setPulling(true);
    try {
      const r = await fetch('/api/live/proper-mnmpull', { method: 'POST' });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; skipped?: string; added?: number; updated?: number };
      if (!r.ok || !j.ok) toast({ text: 'ミンミカから取り込めませんでした', sub: j.error || `（${r.status}）` });
      else { hit(); toast({ text: j.skipped ? '取り込みは今は止めてあります' : `ミンミカから取り込みました（追加 ${j.added ?? 0}・更新 ${j.updated ?? 0}）`, sub: '→ 一覧を読み直しました' }); }
    } catch (e) { toast({ text: 'ミンミカから取り込めませんでした', sub: (e as Error).message }); }
    finally { await reload(); setPulling(false); }
  };

  const count = (sc: Scope) => rows.filter(scopeTest[sc]).length;

  return (
    <div className="flex flex-col gap-3">
      <ScoreNote scores={scores} />
      {/* 押した人は一覧の上に出す（右ではない・10-26 shoya「上に表示しろ」） */}
      {selP && (
        <aside aria-label={`${selP.r.name} の詳細`} ref={paneRef} className="mo-fade-in flex flex-col overflow-hidden rounded-xl border-2 bg-surface" style={{ borderColor: 'var(--a)' }}>
          <div className="border-b border-line px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><div className="truncate text-md font-bold">{selP.r.name}</div>
                <div className="truncate text-sm text-muted">担当 {s(selP.v.tantou) || '未割当'}　／　{s(selP.v.shozoku) || '所属未入力'}{selP.r.active ? '' : '　／　営業中ではありません'}</div></div>
              <button aria-label="閉じる" onClick={() => setSelRow(null)} className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line"><X size={15} /></button>
            </div>
            {scores.state !== 'off' && <div className="mt-1.5 flex flex-wrap gap-1.5">{(['skill', 'join', 'decline'] as ScoreKind[]).map((k) => <ScoreBadge key={k} s={scores.map.get(selP.r.row)} kind={k} meta={scores.meta} name={selP.r.name} />)}</div>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(['営業中', '営業止め', '参画決定', '辞退'] as const).map((t) => {
                const now = t === '営業中' ? selP.status === '営業中' : t === '営業止め' ? selP.v.poa === true : t === '参画決定' ? selP.v.sankaku_kettei === true : selP.v.jitai === true;
                return <button key={t} type="button" disabled={ro} title={roTitle ?? `押すと「${t}」にする（日付も入れます）`} onClick={() => setStatusFor({ p: selP, tab: t })} aria-pressed={now}
                  className="min-h-8 rounded-lg border px-2.5 text-sm font-semibold disabled:opacity-40" style={now ? { background: 'var(--a)', color: 'var(--ao)', borderColor: 'var(--a)' } : { borderColor: 'var(--color-field)' }}>{t}</button>;
              })}
              {colByKey.get('dropout')?.cell(selP)}
              {/* 10-28 shoya「（詳細の上に提案禁止が）なくね」：中身は今のシステムの営業停止（eigyo_teishi）。押すと付け外し */}
              {(() => { const on = selP.v.eigyo_teishi === true; const pre = on && selP.r.beforeSales; return (
                <button type="button" disabled={ro || isBusy(selP, 'eigyo_teishi')} aria-pressed={on} onClick={() => save(selP, { eigyo_teishi: !on })}
                  title={roTitle ?? (pre ? '初回ヒアリング前のため営業開始前（済めば自動で外れます）。押すと手で外す' : on ? '提案禁止。押すと外す' : '押すと提案禁止にする（案件を出さない）')}
                  className="chip whitespace-nowrap disabled:cursor-not-allowed" style={on ? SK_TONE.要確認 : { background: 'transparent', color: 'var(--color-faint)', boxShadow: 'inset 0 0 0 1px var(--color-field)' }}>{pre ? '提案禁止（営業開始前）' : '提案禁止'}</button>); })()}
            </div>
          </div>
          <div>
            <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4 lg:grid-cols-7 gap-y-1.5 border-b border-line px-4 py-3 text-sm">
              {PANE_KEYS.map((k) => { const c = colByKey.get(k); return c ? <label key={k} className="flex min-w-0 flex-col"><span className="text-xs text-muted">{c.label}</span><span className="min-w-0 [&>button.block]:truncate">{c.cell(selP)}</span></label> : null; })}
              {colByKey.get('memo') && <label className="col-span-full flex flex-col"><span className="text-xs text-muted">メモ</span>{colByKey.get('memo')!.cell(selP)}</label>}
            </div>
            <ProperDetail key={selP.r.row} id={selP.r.row} embedded chatSend />
          </div>
        </aside>
      )}
      <div className="flex items-start gap-3">
      <div className="@container min-w-0 flex-1 overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 px-3.5 py-3">
          <label className="flex min-h-9 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border border-field px-3 text-faint sm:max-w-[300px]"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} aria-label="この一覧を検索" placeholder="名前・最寄駅・希望・メモ・担当" className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none" /></label>
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} aria-label="どの人を出すか" className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-body" style={scope !== 'active' ? { borderColor: 'var(--a)', color: 'var(--ad)', fontWeight: 600 } : undefined}>
            {SCOPES.map(([k, l]) => <option key={k} value={k}>{l}（{count(k)}）</option>)}
          </select>
          {filtered && <button onClick={() => { setScope('active'); setQ(''); setFlt({}); }} className="text-sm text-muted underline">絞り込みを外す</button>}
          <span className="ml-auto text-sm text-muted"><span className="num">{shown.length}</span>人</span>
          <div role="tablist" aria-label="表示の形" className="flex rounded-[10px] border border-field p-0.5">
            {([['list', 'リスト'], ['table', '全列表']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className="rounded-lg px-3 py-1 text-sm font-semibold" style={mode === k ? { background: 'var(--as)', color: 'var(--ad)' } : { color: 'var(--color-muted)' }}>{l}</button>)}
          </div>
          {mode === 'table' && <button type="button" onClick={() => setPicker(true)} className="btn-secondary"><Columns3 size={15} />列</button>}
          <button type="button" onClick={pull} disabled={pulling || !canEdit} title={!canEdit ? needText('edit') : 'ミンミカで営業開始前になった未経験の人を、15分おきの自動を待たずにいま取り込みます'}
            className="btn-secondary"><RefreshCw size={14} className={pulling ? 'animate-spin' : ''} />{pulling ? '取り込み中…' : 'ミンミカ取り込み'}</button>
        </div>
        {mode === 'list' && <ProperListView rows={shown.slice(0, limit)} sel={selRow} onPick={(id) => setSelRow((x) => (x === id ? null : id))} aux={aux} />}
        {mode === 'list' && shown.length > limit && <div className="border-t border-line-soft px-4 py-3 text-center text-sm text-muted">はじめの{limit}人を出しています <button type="button" onClick={() => setLimit((l) => l + 300)} className="ml-2 font-semibold underline" style={{ color: 'var(--ad)' }}>もっと出す</button></div>}
        {mode === 'table' && <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="th-row text-left">
                <th className="sticky left-0 z-[1] bg-surface px-3 py-2.5 font-semibold" style={{ backgroundImage: 'linear-gradient(var(--th-bg, var(--as)), var(--th-bg, var(--as)))' }}><button type="button" onClick={() => clickSort('__name')} className="font-semibold">要員{sort?.key === '__name' ? (sort.dir < 0 ? ' ▼' : ' ▲') : ''}</button></th>
                {visible.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-2 py-2.5 font-semibold" title={c.hint}>
                    <button type="button" onClick={() => clickSort(c.key)} className="font-semibold">{c.label}<span className="text-xs opacity-70">{sort?.key === c.key ? (sort.dir < 0 ? ' ▼' : ' ▲') : ''}</span></button>
                  </th>
                ))}
              </tr>
              <tr className="border-b border-line">
                <th className="sticky left-0 z-[1] bg-surface px-3 py-1" />
                {visible.map((c) => (
                  <th key={c.key} className="px-1.5 py-1 font-normal">
                    {c.filter === 'none' ? null : c.filter === 'text' ? (
                      <input value={flt[c.key] ?? ''} onChange={(e) => setFlt((f) => ({ ...f, [c.key]: e.target.value }))} aria-label={`${c.label}で絞る`} placeholder="含む…" className="h-7 w-full min-w-[60px] rounded-md border border-field bg-surface px-1.5 text-sm outline-none" />
                    ) : (
                      <select value={flt[c.key] ?? ''} onChange={(e) => setFlt((f) => ({ ...f, [c.key]: e.target.value }))} aria-label={`${c.label}で絞る`} className="h-7 w-full min-w-[60px] rounded-md border border-field bg-surface px-1 text-sm" style={flt[c.key] ? { borderColor: 'var(--a)', color: 'var(--ad)', fontWeight: 600 } : undefined}>
                        <option value="">すべて</option>
                        {c.filter === 'bool' ? <><option value="on">✓あり</option><option value="off">✓なし</option></> : <>{optsOf(c).map((o) => <option key={o} value={o}>{o}</option>)}<option value="(空)">（空）</option></>}
                      </select>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(sort?.key === '__name' ? [...shown].sort((a, b) => a.r.name.localeCompare(b.r.name, 'ja') * sort.dir) : shown).slice(0, limit).map((p) => (
                <tr key={p.r.row} className="row cursor-pointer border-t border-line-soft align-middle" style={!p.r.active ? { opacity: 0.72 } : undefined}
                  onClick={(e) => { if ((e.target as HTMLElement).closest('button,a,input,select,textarea,label')) return; setSelRow((x) => (x === p.r.row ? null : p.r.row)); }}>
                  <td className="sticky left-0 z-[1] max-w-[150px] bg-surface px-3 py-2 font-semibold">
                    <button type="button" onClick={() => setSelRow((x) => (x === p.r.row ? null : p.r.row))} className="font-semibold hover:underline underline-offset-2">{p.r.name}</button>
                    <Link href={`/eigyo/proper/${encodeURIComponent(p.r.row)}`} className="ml-0.5 inline-flex rounded p-0.5 align-middle hover:bg-soft" aria-label={`${p.r.name}の要員ページを開く`}><ChevronRight size={14} className="text-faint" /></Link>
                    {p.r.kanagawa && <span className="ml-1 rounded bg-sunken px-1 text-xs font-normal text-muted">かな西</span>}
                    {p.r.kansai && <span className="ml-1 rounded bg-sunken px-1 text-xs font-normal text-muted">関西</span>}
                    {p.v.needs_review === true && <span className="ml-1 text-xs font-normal text-warn">要確認</span>}
                  </td>
                  {visible.map((c) => <td key={c.key} className="max-w-[112px] px-1.5 py-1.5 [&>button.block]:truncate">{c.cell(p)}</td>)}
                </tr>
              ))}
              {shown.length > limit && <tr><td colSpan={visible.length + 1} className="px-4 py-3 text-center text-sm text-muted">はじめの{limit}人を出しています <button type="button" onClick={() => setLimit((l) => l + 300)} className="ml-2 font-semibold underline" style={{ color: 'var(--ad)' }}>もっと出す</button></td></tr>}
              {shown.length === 0 && <tr><td colSpan={visible.length + 1} className="px-4 py-10 text-center text-body text-muted">この条件の要員はいません</td></tr>}
            </tbody>
          </table>
        </div>}
      </div>
      </div>
      {picker && <ColPicker cols={ordered} isShown={shownCol} onToggle={toggleCol} onOrder={(order) => setPrefsSave({ ...(prefs ?? { hidden: [], shown: [] }), order })} onReset={() => { setPrefsSave({ order: [], hidden: [], shown: [] }); }} onClose={() => setPicker(false)} />}
      {statusFor && <StatusDialog p={statusFor.p} start={statusFor.tab} hasCol={(k) => !!data?.columns.some((c) => c.col === k)} onClose={() => setStatusFor(null)} onGo={(patch) => { const p = statusFor.p; setStatusFor(null); void save(p, patch); }} />}
      {dropFor && <DropoutDialog p={dropFor} onClose={() => setDropFor(null)} onGo={(on, phase, after) => { setDropFor(null); void setDrop(dropFor, on, phase, after); }} />}
      {commuteFor && <CommuteEditor p={commuteFor} live={live} canEdit={canEdit} onClose={() => setCommuteFor(null)}
        onSaved={(row) => { setCommuteOver((o) => ({ ...o, [commuteKey(commuteFor.r.name)]: row })); }} />}
    </div>
  );
}

// ---- セルの入力 ----
function BoolCell({ on, disabled, title, busy, label, onToggle }: { on: boolean; disabled: boolean; title?: string; busy: boolean; label: string; onToggle: () => void }) {
  return (
    <label className="flex min-h-8 cursor-pointer items-center justify-center" title={title ?? `${label}（押すとすぐ保存）`}>
      <input type="checkbox" checked={on} disabled={disabled || busy} onChange={onToggle} aria-label={label} className="size-[18px] cursor-pointer disabled:cursor-not-allowed" style={{ accentColor: 'var(--a)', opacity: busy ? 0.5 : 1 }} />
    </label>
  );
}

function SelectCell({ value, opts, alias, blank, disabled, title, busy, label, onPick }: { value: string; opts: readonly string[]; alias?: Record<string, string>; blank: string; disabled: boolean; title?: string; busy: boolean; label: string; onPick: (v: string) => void }) {
  // 今の値が選択肢に無ければそのまま残す（古い書き方 不可能・NG は「不可」と見せるが、保存された値は選び直すまで変えない）
  const list = value && !opts.includes(value) ? [value, ...opts] : opts;
  return (
    <select value={value} disabled={disabled || busy} title={title} aria-label={label} onChange={(e) => onPick(e.target.value)}
      className="h-8 w-full min-w-[64px] rounded-md border border-transparent bg-transparent px-1 text-body hover:border-field disabled:cursor-not-allowed" style={busy ? { opacity: 0.5 } : undefined}>
      <option value="">{blank}</option>
      {list.map((o) => <option key={o} value={o}>{alias?.[o] ?? o}{o === value && !opts.includes(o) && !alias?.[o] ? '（今の値）' : ''}</option>)}
    </select>
  );
}

function TextCell({ value, multiline, disabled, title, busy, label, onCommit }: { value: string; multiline: boolean; disabled: boolean; title?: string; busy: boolean; label: string; onCommit: (v: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(value);
  const done = useRef(false);
  const start = () => { if (disabled || busy) return; setDraft(value); done.current = false; setEdit(true); };
  const finish = (commit: boolean) => { if (done.current) return; done.current = true; setEdit(false); if (commit && draft !== value) onCommit(draft); };
  if (edit) {
    const common = {
      autoFocus: true, value: draft, 'aria-label': label,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: () => finish(true),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); finish(true); }
      },
      className: 'w-full rounded-md border bg-surface px-1.5 py-1 text-body outline-none', style: { borderColor: 'var(--a)' },
    };
    return multiline ? <textarea {...common} rows={4} className={`${common.className} min-w-[240px] resize-y`} /> : <input {...common} />;
  }
  return (
    <button type="button" onClick={start} disabled={disabled} title={disabled ? title : `${value ? value.slice(0, 300) + '\n\n' : ''}押すと直す（${multiline ? '⌘/Ctrl+Enter' : 'Enter'}・欄から出ると保存／Esc で取りやめ）`}
      className="block min-h-8 w-full rounded-md px-1 text-left hover:bg-sunken disabled:cursor-default disabled:hover:bg-transparent" style={busy ? { opacity: 0.5 } : undefined}>
      {value ? <span className={multiline ? 'line-clamp-2 whitespace-pre-line text-sm' : 'block max-w-[220px] truncate'}>{value}</span> : <span className="text-faint">—</span>}
    </button>
  );
}

// ---- 列を選ぶ（出す/出さない・ドラッグで並べ替え・この端末に残す） ----
function ColPicker({ cols, isShown, onToggle, onOrder, onReset, onClose }: {
  cols: Col[]; isShown: (c: Col) => boolean; onToggle: (c: Col) => void; onOrder: (order: string[]) => void; onReset: () => void; onClose: () => void;
}) {
  const [order, setOrder] = useState(cols.map((c) => c.key));
  const [drag, setDrag] = useState<string | null>(null);
  const byKey = new Map(cols.map((c) => [c.key, c]));
  useEffect(() => { setOrder(cols.map((c) => c.key)); }, [cols]);
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-colkey]') as HTMLElement | null;
    const over = el?.dataset.colkey;
    if (!over || over === drag) return;
    setOrder((o) => { const n = o.filter((k) => k !== drag); n.splice(n.indexOf(over) + (o.indexOf(over) > o.indexOf(drag) ? 1 : 0), 0, drag); return n; });
  };
  const drop = () => { if (drag) onOrder(order); setDrag(null); };
  return (
    <Dialog label="出す列を選ぶ" onClose={onClose} z={Z_MODAL} className="fixed inset-x-3 top-[10vh] mx-auto flex max-h-[80vh] max-w-[460px] flex-col panel">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div><div className="text-md font-bold">出す列</div><div className="text-sm text-faint">この端末に残ります。つまみ（⋮⋮）をドラッグで並べ替え</div></div>
        <button aria-label="閉じる" data-dialog-close onClick={onClose} className="flex size-8 items-center justify-center rounded-lg border border-line"><X size={15} /></button>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 py-2" onPointerMove={move} onPointerUp={drop} onPointerCancel={drop} style={drag ? { touchAction: 'none', userSelect: 'none' } : undefined}>
        {order.map((k) => { const c = byKey.get(k); if (!c) return null; return (
          <li key={k} data-colkey={k} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-body" style={drag === k ? { background: 'var(--as)' } : undefined}>
            <span onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); setDrag(k); }} className="cursor-grab touch-none text-faint" aria-label={`${c.label}を並べ替える`}><GripVertical size={16} /></span>
            <label className="flex flex-1 cursor-pointer items-center gap-2"><input type="checkbox" checked={isShown(c)} onChange={() => onToggle(c)} style={{ accentColor: 'var(--a)' }} />{c.label}</label>
            <span className="text-xs text-faint">{c.group}</span>
          </li>); })}
      </ul>
      <div className="flex justify-between border-t border-line px-4 py-3">
        <button type="button" onClick={onReset} className="text-sm text-muted underline">はじめの形に戻す</button>
        <button type="button" onClick={onClose} className="btn-primary">閉じる</button>
      </div>
    </Dialog>
  );
}

// ---- 通勤エリア（本人の回答／営業の入力。ブロックを押すたびに保存・取り消せる） ----
function CommuteEditor({ p, live, canEdit, onClose, onSaved }: { p: PRow; live: boolean; canEdit: boolean; onClose: () => void; onSaved: (row: CommuteListRow | null) => void }) {
  const { hit, toast } = useMotivation();
  const d = useIke<CommuteDetail>(live ? `commute-area?name=${encodeURIComponent(p.r.name)}` : null);
  const det: CommuteDetail | null = live ? d.data : null;
  const [cur, setCur] = useState<{ any: boolean; blocks: string[]; sales: boolean } | null>(null);
  useEffect(() => {
    if (!det || cur) return;
    setCur(det.sales ? { any: det.sales.any, blocks: det.sales.blocks, sales: true } : { any: det.any, blocks: det.blocks.map((b) => b.id), sales: false });
  }, [det, cur]);
  const [busy, setBusy] = useState(false);
  const editable = canEdit && !!det?.canEdit;
  const send = async (next: { any: boolean; blocks: string[] } | null, prev: { any: boolean; blocks: string[]; sales: boolean }, undo?: boolean) => {
    setBusy(true);
    const body = next ? { name: p.r.name, any: next.any, blocks: next.blocks } : { name: p.r.name, clear: true };
    let ok = true, err = '', short = '', full = '';
    if (live) {
      try {
        const r = await fetch('/api/live/commute-area', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; hint?: string; short?: string; full?: string };
        ok = r.ok && !!j.ok; err = j.hint || j.error || `（${r.status}）`; short = j.short || ''; full = j.full || '';
      } catch (e) { ok = false; err = (e as Error).message; }
    } else { ok = false; err = '読み込めていません'; }
    setBusy(false);
    if (!ok) { toast({ text: `${p.r.name}：通勤エリアを保存できませんでした`, sub: err }); return; }
    const after = next ? { ...next, sales: true } : null;
    setCur(after ?? (det ? { any: det.any, blocks: det.blocks.map((b) => b.id), sales: false } : null));
    onSaved(next ? { key: commuteKey(p.r.name), any: next.any, source: 'sales', short, full } : null);
    hit();
    toast({
      text: undo ? `${p.r.name}：通勤エリアを元に戻しました` : next ? `${p.r.name}：通勤エリアを保存` : `${p.r.name}：本人の回答に戻しました`,
      undo: undo ? undefined : () => { void send(prev.sales ? { any: prev.any, blocks: prev.blocks } : null, after ?? prev, true); },
    });
  };
  const toggleBlock = (id: string) => { if (!cur) return; const blocks = cur.blocks.includes(id) ? cur.blocks.filter((x) => x !== id) : [...cur.blocks, id]; void send({ any: false, blocks }, cur); };
  const prefs = Object.keys(COMMUTE_PREF) as (keyof typeof COMMUTE_PREF)[];
  return (
    <Dialog label={`${p.r.name} の通勤エリア`} onClose={onClose} z={Z_MODAL} className="fixed inset-x-3 top-[6vh] mx-auto flex max-h-[88vh] max-w-[560px] flex-col panel">
      <div className="flex items-start justify-between border-b border-line px-5 py-3">
        <div><div className="text-sm text-faint">通勤エリア</div><div className="text-md font-bold">{p.r.name}</div></div>
        <button aria-label="閉じる" data-dialog-close onClick={onClose} className="flex size-8 items-center justify-center rounded-lg border border-line"><X size={15} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 text-body">
        {live && d.state === 'loading' && <p className="text-muted">読み込み中…</p>}
        {live && d.state === 'error' && <p className="text-bad">{d.error}</p>}
        {det && (
          <>
            <p className="mb-2 text-sm text-muted">
              {det.status === 'ambiguous' ? '同姓同名が複数いるため、誰の回答か決められません（直せません）'
                : det.status === 'not_answered' ? '本人はまだ回答していません'
                : det.status === 'legacy' ? `本人の回答（旧形式）：${det.legacyLabel ?? ''}`
                : `本人の回答：${det.any ? '1都3県どこでも' : `${det.blocks.length}エリア`}`}
              {cur?.sales && <span className="ml-2 font-semibold" style={{ color: 'var(--ad)' }}>いまは営業の入力を出しています</span>}
              {det.salesError && <span className="ml-2 text-bad">営業の入力を読めないので見るだけです</span>}
            </p>
            {cur && (
              <>
                <label className="mb-3 flex items-center gap-2 font-semibold"><input type="checkbox" checked={cur.any} disabled={!editable || busy} onChange={() => send({ any: !cur.any, blocks: cur.any ? cur.blocks : [] }, cur)} style={{ accentColor: 'var(--a)' }} />1都3県どこでも行ける</label>
                {prefs.map((pf) => (
                  <fieldset key={pf} className="mb-3" disabled={!editable || busy || cur.any}>
                    <legend className="mb-1 text-sm font-semibold text-muted">{COMMUTE_PREF[pf]}</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {COMMUTE_BLOCKS.filter((b) => b.pref === pf).map((b) => {
                        const on = cur.any || cur.blocks.includes(b.id);
                        return (
                          <button key={b.id} type="button" disabled={b.off || !editable || busy || cur.any} onClick={() => toggleBlock(b.id)} title={b.off ? '対象外のエリア' : b.sub} aria-pressed={on}
                            className="min-h-8 rounded-full border px-2.5 text-sm disabled:cursor-not-allowed" style={b.off ? { borderColor: 'var(--color-line)', color: 'var(--color-faint)', textDecoration: 'line-through' } : on ? { borderColor: 'var(--a)', background: 'var(--as)', color: 'var(--ad)', fontWeight: 700 } : { borderColor: 'var(--color-field)' }}>
                            {b.name}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </>
            )}
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm text-faint">
        <span>押すたびに保存します（本人の回答は消えません）</span>
        {cur?.sales && <button type="button" disabled={!editable || busy} onClick={() => send(null, cur)} className="min-h-9 rounded-[10px] border border-field px-3 text-body font-semibold text-ink disabled:opacity-50">本人の回答に戻す</button>}
      </div>
    </Dialog>
  );
}

// ---- dropout（飛び）にする／印を外す（今の dropout.js と同じ問い） ----
const PHASES = [
  { v: 'eigyo', t: '参画決定の前（営業中に連絡が取れなくなった）', d: '辞退にします。' },
  { v: 'kettei', t: '参画決定の後・現場に入る前（当日飛びを含む）', d: '参画決定を付けたまま辞退にします（参画決定が付いていなければ付けます）。従業員名簿にも飛びの印が出ます。' },
  { v: 'kadou', t: '現場に入った後（案件参画中）', d: '辞退にはしません。このあとの扱いを下で選びます。' },
];
const AFTERS = [
  { v: 'mark', t: '印だけ付ける', d: '退社・待機は変えません（あとで人が決める）。' },
  { v: 'taisha', t: '退社にする', d: '退社チェックを付けます（退社日が空なら今日）。' },
  { v: 'taiki', t: '待機にする', d: '待機チェックを付けます（在籍のまま現場から外す。再アサインもONになります）。' },
];
function DropoutDialog({ p, onClose, onGo }: { p: PRow; onClose: () => void; onGo: (on: boolean, phase: string, after: string) => void }) {
  const on = p.drop.on;
  const [phase, setPhase] = useState(p.v.kadou_chu === true ? 'kadou' : p.v.sankaku_kettei === true ? 'kettei' : 'eigyo');
  const [after, setAfter] = useState('mark');
  const Radio = ({ o, sel, set, name }: { o: { v: string; t: string; d: string }; sel: string; set: (v: string) => void; name: string }) => (
    <label className="flex cursor-pointer gap-2 rounded-lg border px-3 py-2" style={sel === o.v ? { borderColor: 'var(--a)', background: 'var(--as)' } : { borderColor: 'var(--color-line)' }}>
      <input type="radio" name={name} checked={sel === o.v} onChange={() => set(o.v)} style={{ accentColor: 'var(--a)' }} />
      <span><b className="text-body">{o.t}</b><span className="block text-sm text-muted">{o.d}</span></span>
    </label>
  );
  return (
    <Dialog label={on ? `${p.r.name} の dropout を外す` : `${p.r.name} を dropout にする`} onClose={onClose} z={Z_MODAL} className="fixed inset-x-3 top-[8vh] mx-auto flex max-h-[84vh] max-w-[560px] flex-col panel">
      <div className="flex items-start justify-between border-b border-line px-5 py-3">
        <div className="text-md font-bold">{on ? `${p.r.name} さんの dropout の印を外す` : `${p.r.name} さんを dropout（飛び）にする`}</div>
        <button aria-label="閉じる" data-dialog-close onClick={onClose} className="flex size-8 items-center justify-center rounded-lg border border-line"><X size={15} /></button>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3 text-body">
        {on ? (<>
          <p>いまの記録：{PHASE_LABEL[p.drop.phase] || '時期不明'}{p.drop.at && `（${fmtMd(p.drop.at)}）`}</p>
          <p className="text-muted">飛びの印だけ外します。辞退・参画決定・退社・待機は自動では戻りません。</p>
        </>) : (<>
          <p className="text-muted">いまの参画決定：{p.v.sankaku_kettei === true ? 'あり' : 'なし'}</p>
          <p className="font-semibold">いつ飛びましたか？</p>
          {PHASES.map((o) => <Radio key={o.v} o={o} sel={phase} set={setPhase} name="dropout-phase" />)}
          {phase === 'kadou' && <><p className="mt-1 font-semibold">このあとの扱い</p>{AFTERS.map((o) => <Radio key={o.v} o={o} sel={after} set={setAfter} name="dropout-after" />)}</>}
        </>)}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
        <button type="button" onClick={onClose} className="btn-secondary">やめる</button>
        <button type="button" onClick={() => onGo(!on, phase, phase === 'kadou' ? after : 'mark')} className="btn-primary">{on ? '印を外す' : 'dropout にする'}</button>
      </div>
    </Dialog>
  );
}

// ---- 状態を変える（タブで選ぶ・参画決定／辞退／営業止めは日付も一緒に答える・10-25 shoya） ----
const STATUS_TABS = [
  { v: '営業中', date: '', d: '営業止め・辞退・参画決定を外して、営業中に戻します。' },
  { v: '営業止め', date: 'poa_bi', d: '営業止めにします。' },
  { v: '参画決定', date: 'sankaku_bi', d: '参画決定にします（今のシステムが稼働中ON・営業止めOFF も一緒にします）。' },
  { v: '辞退', date: 'jitai_bi', d: '辞退にします。' },
] as const;
const DATE_LABEL: Record<string, string> = { poa_bi: '営業止めにした日', sankaku_bi: '参画日', jitai_bi: '辞退した日' };
const todayIso = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
function StatusDialog({ p, start, hasCol, onClose, onGo }: { p: PRow; start?: string; hasCol: (k: string) => boolean; onClose: () => void; onGo: (patch: V) => void }) {
  const cur = p.v.jitai === true ? '辞退' : p.v.sankaku_kettei === true ? '参画決定' : p.v.poa === true ? '営業止め' : '営業中';
  const [tab, setTab] = useState<string>(start ?? (cur === '営業中' ? '参画決定' : '営業中'));
  const t = STATUS_TABS.find((x) => x.v === tab)!;
  const old = t.date ? s(p.v[t.date]).replace(/\//g, '-') : '';
  const [date, setDate] = useState(todayIso());
  useEffect(() => { setDate(/^\d{4}-\d{2}-\d{2}$/.test(old) ? old : todayIso()); }, [tab, old]);
  const colOk = !t.date || hasCol(t.date);
  const go = () => {
    const patch: V = {};
    if (tab === '営業中') { for (const k of ['poa', 'jitai', 'sankaku_kettei']) if (p.v[k] === true) patch[k] = false; }
    else {
      const flag = tab === '営業止め' ? 'poa' : tab === '参画決定' ? 'sankaku_kettei' : 'jitai';
      if (p.v[flag] !== true) patch[flag] = true;
      if (tab === '辞退' && p.v.poa === true) patch.poa = false;
      if (t.date && colOk) patch[t.date] = date.replace(/-/g, '/');
    }
    onGo(patch);
  };
  const same = tab === cur && (!t.date || !colOk || s(p.v[t.date]) === date.replace(/-/g, '/'));
  return (
    <Dialog label={`${p.r.name} の状態を変える`} onClose={onClose} z={Z_MODAL} className="fixed inset-x-3 top-[10vh] mx-auto flex max-w-[460px] flex-col panel">
      <div className="flex items-start justify-between border-b border-line px-5 py-3">
        <div><div className="text-md font-bold">{p.r.name} さんの状態</div><div className="text-sm text-muted">いま：{p.status}</div></div>
        <button aria-label="閉じる" data-dialog-close onClick={onClose} className="flex size-8 items-center justify-center rounded-lg border border-line"><X size={15} /></button>
      </div>
      <div role="tablist" aria-label="状態" className="flex gap-1 border-b border-line px-4 pt-2">
        {STATUS_TABS.map((x) => (
          <button key={x.v} type="button" role="tab" aria-selected={tab === x.v} onClick={() => setTab(x.v)}
            className="whitespace-nowrap px-3 py-2 text-body" style={tab === x.v ? { borderBottom: '2px solid var(--a)', color: 'var(--ad)', fontWeight: 700 } : { borderBottom: '2px solid transparent', color: 'var(--color-muted)' }}>{x.v}</button>
        ))}
      </div>
      <div className="flex flex-col gap-3 px-5 py-4 text-body">
        <p className="text-muted">{t.d}</p>
        {t.date && (colOk
          ? <label className="flex flex-col gap-1"><span className="font-semibold">{DATE_LABEL[t.date]}</span>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="min-h-10 w-[200px] rounded-[10px] border border-field bg-surface px-3" /></label>
          : <p className="text-sm text-warn">{DATE_LABEL[t.date]}を入れる欄は、今のシステムでまだ準備中です（いまは状態だけ保存します）</p>)}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
        <button type="button" onClick={onClose} className="btn-secondary">やめる</button>
        <button type="button" disabled={same || (!!t.date && colOk && !date)} onClick={go} className="btn-primary disabled:opacity-40">{tab}にする</button>
      </div>
    </Dialog>
  );
}

// ---- リスト表示（今の proper-views.js の「リスト」を写す：9列だけ・稼働の月ごとに区切る・押すと右に詳細） ----
const PANE_KEYS = ['kadou', 'gakumen', 'eki', 'tantou', 'shozoku', 'zokusei', 'kibou_shokushu', 'heikou_suu', 'shift', 'yakin', 'shucchou', 'shoudaku_nyusha_bi', 'hearing_booking', 'shoudaku_bi'];
function kadouBucket(v: string): { k: number; label: string } {
  if (/^\s*即日/.test(v)) return { k: 0, label: '即日' };
  const m = v.match(/\d{4}[/\-年](\d{1,2})/) || v.match(/(\d{1,2})\s*月/);
  const n = m ? Number(m[1]) : NaN;
  if (!(n >= 1 && n <= 12)) return { k: 99, label: '未定・その他' };
  const cur = new Date(Date.now() + 9 * 3600e3).getUTCMonth() + 1;
  return { k: 1 + ((((n - cur) % 12) + 12) % 12), label: `${n}月` };
}
function man(v: string): string {
  const n = parseFloat(v.replace(/[,，円\s]/g, ''));
  if (!n) return '';
  return `${n >= 1000 ? Math.round(n / 1000) / 10 : n}万`;
}
// 一覧の幅で列を減らす（右に詳細を出して狭くなっても横にはみ出さない）：狭い＝6列 → @2xl で属性・担当 → @4xl でメモ
const LIST_GRID = 'grid grid-cols-[76px_minmax(96px,1.3fr)_60px_44px_minmax(64px,1fr)_88px] @2xl:grid-cols-[76px_minmax(96px,1.3fr)_60px_44px_minmax(64px,1fr)_88px_minmax(64px,1fr)_56px] @4xl:grid-cols-[76px_minmax(96px,1.3fr)_60px_44px_minmax(64px,1fr)_88px_minmax(64px,1fr)_56px_minmax(80px,1.4fr)] items-center gap-x-2';
function ProperListView({ rows, sel, onPick, aux }: {
  rows: PRow[]; sel: string | null; onPick: (id: string) => void;
  aux: { lastReply: (n: string) => number | null | undefined; form: (n: string) => string; line: (n: string) => string };
}) {
  const groups = useMemo(() => {
    const m = new Map<number, { label: string; rows: PRow[] }>();
    for (const p of rows) { const b = kadouBucket(s(p.v.kadou)); const g = m.get(b.k) ?? { label: b.label, rows: [] }; g.rows.push(p); m.set(b.k, g); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, g]) => ({ k, ...g }));
  }, [rows]);
  if (!rows.length) return <div className="px-4 py-10 text-center text-body text-muted">この条件の要員はいません</div>;
  return (
    <div className="border-t border-line text-sm">
      <div className={`${LIST_GRID} th-row px-3 py-2 font-semibold`}>
        <span>状態</span><span>要員名 ／ 所属</span><span>稼働</span><span className="text-right">額面</span><span>最寄駅</span><span>連絡</span><span className="hidden @2xl:block">属性・希望</span><span className="hidden @2xl:block">担当</span><span className="hidden @4xl:block">メモ</span>
      </div>
      {groups.map((g) => (
        <div key={g.k}>
          <div className="bg-sunken px-3 py-1 text-xs font-bold text-muted">{g.label}<span className="ml-1.5 font-normal">{g.rows.length}名</span></div>
          {g.rows.map((p) => {
            const t = aux.lastReply(p.r.name), f = aux.form(p.r.name), ln = aux.line(p.r.name);
            const g2 = man(s(p.v.gakumen)), eki = s(p.v.eki), zok = s(p.v.zokusei) || s(p.v.kibou_shokushu);
            const st = p.status + (p.drop.on ? '・飛び' : '');
            return (
              <button key={p.r.row} type="button" onClick={() => onPick(p.r.row)} aria-pressed={sel === p.r.row}
                className={`${LIST_GRID} row w-full border-t border-line-soft px-3 py-2 text-left`} style={sel === p.r.row ? { background: 'var(--as)' } : !p.r.active ? { opacity: 0.72 } : undefined}>
                <span className="min-w-0"><Pill>{st}</Pill></span>
                <span className="min-w-0"><b className="block truncate text-body">{p.r.name}</b><small className="block truncate text-xs text-muted">{s(p.v.shozoku)}</small></span>
                <span className="truncate">{kadouBucket(s(p.v.kadou)).k === 99 ? s(p.v.kadou) || '未定' : kadouBucket(s(p.v.kadou)).label}</span>
                <span className={`num text-right ${g2 ? '' : 'text-faint'}`}>{g2 || '額?'}</span>
                <span className={`truncate ${eki ? '' : 'text-faint'}`}>{eki || '駅未入力'}</span>
                <span className="flex flex-wrap gap-1 text-xs">
                  <span title="最終返信" style={{ color: t ? (Date.now() - t < 864e5 ? 'var(--tone-ok-fg)' : 'var(--tone-warn-fg)') : 'var(--color-faint)' }}>{t === undefined ? '…' : t ? elapsed(t) : '—'}</span>
                  <span className={f === '未回答' ? 'font-semibold text-bad' : 'text-muted'}>{f === '未回答' ? 'フォーム未' : 'フォーム'}</span>
                  <span className={ln === '未作成' ? 'font-semibold text-bad' : 'text-muted'}>{ln === '未作成' ? 'LINE無' : 'LINE'}</span>
                </span>
                <span className={`hidden truncate @2xl:block ${zok ? '' : 'text-faint'}`}>{zok || '—'}</span>
                <span className="hidden truncate @2xl:block">{s(p.v.tantou) || '—'}</span>
                <span className="hidden truncate text-muted @4xl:block">{s(p.v.memo).split('\n')[0]}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
