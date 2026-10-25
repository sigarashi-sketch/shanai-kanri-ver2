'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Columns3, FileSpreadsheet, GripVertical, RefreshCw, Search, X } from 'lucide-react';
import { Pill } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import { PersonName } from '@/components/Person';
import { Dialog } from '@/components/Dialog';
import { useIke } from '@/components/Live';
import { ScoreBadge, ScoreNote, SCORE_HINT, SCORE_LABEL, useProperScores } from '@/components/ProperScore';
import { Z_MODAL } from '@/lib/layers';
import { normName, properStatus, type EngineerRow, type EngineerRows } from '@/lib/live/eigyo-common';
import {
  COMMUTE_BLOCKS, COMMUTE_PREF, LONG_TEXT, SCORE_FILTER_OPTS, SELECT_OPTIONS, commuteKey, scoreFilterLabel, scoreValue,
  type CommuteDetail, type CommuteListRow, type ScoreKind,
} from '@/lib/live/proper-cols';

// プロパーリストの表（今の proper.html の列を全部・10-25 shoya「いけドンにあったのは全部いれて」「参画とか辞退ボタンとかもね」）。
//   ・行＝今の getEngineerRows（area=main）。見本のときは lib/proper-sample.ts の同じ形
//   ・列：スコア（スキル／参画見込／辞退リスク／営業止め見込）・最終返信・フォーム回答・LINE・通勤エリア・PDF・dropout・
//         今の全部の文字列とチェック列。どの列を出すか・並び（ドラッグ）はその人の端末に残す（localStorage）
//   ・絞り込み：「営業中のみ」が最初（切り替えで 全員／営業止め／営業停止／辞退／参画決定／dropout／かな西／要確認）＋列ごとの絞り込み
//   ・書く：チェック・選択肢・文字は変えたらすぐ保存（/api/live/proper-save → 今の saveEngineerRow）。トーストの「取り消す」で前の値に戻す
//     参画決定ON の連動（稼働中ON・営業止め/再アサインOFF・入社案内の予約）は今のシステムがやる → 保存のあと読み直す
//   ・「稼働月を開いたときに今月へ直す」書き込みは入れない（今の画面だけの動き・10-25 指示）
//   ・dropout の印をつける・PDF を作り直すのはここではしない（今の画面から）

type Val = string | boolean;
type V = Record<string, Val>;
type PRow = { r: EngineerRow; v: V; status: string };
type FilterKind = 'text' | 'select' | 'bool' | 'none';
type Col = {
  key: string; label: string; group: string; def: boolean; filter: FilterKind; opts?: readonly string[];
  text: (p: PRow) => string; num?: (p: PRow) => number | null; cell: (p: PRow) => React.ReactNode; hint?: string; minW?: number;
};

const SCOPES = [
  ['active', '営業中のみ'], ['all', '全員（営業止め・辞退・稼働中も）'], ['poa', '営業止め のみ'], ['teishi', '営業停止 のみ'], ['jitai', '辞退 のみ'],
  ['sankaku', '参画決定 のみ'], ['dropout', 'dropout（飛び） のみ'], ['kanawest', 'かな西 のみ'], ['review', '要確認 のみ'],
] as const;
type Scope = (typeof SCOPES)[number][0];
const scopeTest: Record<Scope, (p: PRow) => boolean> = {
  active: (p) => p.r.active, all: () => true, poa: (p) => p.v.poa === true, teishi: (p) => p.v.eigyo_teishi === true, jitai: (p) => p.v.jitai === true,
  sankaku: (p) => p.v.sankaku_kettei === true, dropout: (p) => !!p.r.dropout, kanawest: (p) => !!p.r.kanagawa, review: (p) => p.v.needs_review === true,
};

const PREF_KEY = 'v2_proper_cols_v1';
type Prefs = { order: string[]; hidden: string[]; shown: string[] };
function loadPrefs(): Prefs | null { try { const s = localStorage.getItem(PREF_KEY); return s ? (JSON.parse(s) as Prefs) : null; } catch { return null; } }
function savePrefs(p: Prefs) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* 残せなくても画面は動く */ } }

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

// 見本の連絡まわり（最終返信・フォーム回答・LINE・通勤エリア）
const SAMPLE_AUX = {
  replies: [{ ts: Date.now() - 2 * 3600e3, groupName: '中村優 案件G' }, { ts: Date.now() - 30 * 3600e3, groupName: '松本結衣 案件G' }],
  forms: ['中村優', '加藤葵', '伊藤誠'],
  groups: ['中村優 案件G', '松本結衣 案件G', '加藤葵 案件G', '伊藤誠 案件G'],
  commute: [{ key: '中村優', any: false, source: 'form', short: '城北・県南', full: '東京23区・城北、埼玉 県南' }, { key: '加藤葵', any: true, source: 'sales', short: '1都3県OK', full: '1都3県どこでも' }] as CommuteListRow[],
};

export function ProperList({ data, live, reload, onSukishi, sukishiDone }: {
  data: EngineerRows | null; live: boolean; reload: () => unknown; onSukishi: (id: string) => void; sukishiDone?: ReadonlySet<string>;
}) {
  const canEdit = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const scores = useProperScores(live);
  const replies = useIke<{ ts: number; groupName: string }[]>(live ? 'proxy?action=getReplies' : null);
  const forms = useIke<{ success?: boolean; names: string[] | null }>(live ? 'basic-info?action=names' : null);
  const groups = useIke<{ id: string; name: string }[]>(live ? 'proxy?action=getGroupNames' : null);
  const commute = useIke<{ ok: boolean; rows: CommuteListRow[] }>(live ? 'commute-area?action=list' : null);

  // ---- 手元で直した値（保存の結果を待たずに出す）。見本はここだけで持つ ----
  const [over, setOver] = useState<Record<string, V>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [commuteOver, setCommuteOver] = useState<Record<string, CommuteListRow | null>>({});

  const rows: PRow[] = useMemo(() => (data?.rows ?? []).map((r) => {
    const v: V = {};
    for (const c of data!.columns) { const x = r.cells[c.idx]; v[c.col] = c.type === 'bool' ? x === true : String(x ?? '').trim(); }
    Object.assign(v, over[r.row]);
    const cs: Record<string, string> = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, s(x)]));
    return { r, v, status: properStatus(r, cs) };
  }), [data, over]);

  // ---- 連絡まわりの当て方（今の proper.html と同じ：グループ名（畳む）に氏名（畳む・2文字以上）が入っているか） ----
  const aux = useMemo(() => {
    const rep = live ? (Array.isArray(replies.data) ? replies.data : null) : SAMPLE_AUX.replies;
    const fm = live ? (Array.isArray(forms.data?.names) ? forms.data!.names : null) : SAMPLE_AUX.forms;
    const gp = live ? (Array.isArray(groups.data) ? groups.data.map((g) => g.name) : null) : SAMPLE_AUX.groups;
    const cm = live ? (commute.data?.ok ? commute.data.rows : null) : SAMPLE_AUX.commute;
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
    if (!live) {
      done(); hit();
      toast({ text: opts?.undo ? `${p.r.name}：元に戻しました（見本）` : `${p.r.name}：${what}（見本なので保存していません）`, undo: opts?.undo ? undefined : () => { void save({ ...p, v: { ...p.v, ...patch } }, prev, { undo: true }); } });
      return;
    }
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
        sub: opts?.undo ? undefined : side ? `→ ${side}${patch.sankaku_kettei === true ? '。1時間以内に外せば入社案内は送られません' : ''}` : '→ 今のプロパーリストにも出ます',
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
  const ro = !canEdit;
  const roTitle = ro ? needText('edit') : undefined;
  const isBusy = (p: PRow, f: string) => busy.has(`${p.r.row}:${f}`);

  // ---- 列 ----
  const cols: Col[] = useMemo(() => {
    const txt = (f: string, label: string, group: string, def: boolean, minW = 110): Col => ({
      key: f, label, group, def, filter: SELECT_OPTIONS[f] ? 'select' : 'text', opts: SELECT_OPTIONS[f], minW, text: (p) => s(p.v[f]),
      num: f === 'sentouryoku' || f === 'heikou_suu' ? (p) => (s(p.v[f]) === '' ? null : Number(s(p.v[f])) || 0) : undefined,
      cell: (p) => SELECT_OPTIONS[f]
        ? <SelectCell value={s(p.v[f])} opts={SELECT_OPTIONS[f]} disabled={ro} title={roTitle} busy={isBusy(p, f)} label={label} onPick={(x) => save(p, { [f]: x })} />
        : <TextCell value={s(p.v[f])} multiline={LONG_TEXT.has(f)} disabled={ro} title={roTitle} busy={isBusy(p, f)} label={label} onCommit={(x) => save(p, { [f]: x })} />,
    });
    const chk = (f: string, label: string, def: boolean): Col => ({
      key: f, label, group: 'チェック', def, filter: 'bool', text: (p) => (p.v[f] === true ? '✓' : ''),
      cell: (p) => (f === 'eigyo_teishi' && p.r.beforeSales && p.v[f] === true
        ? <span className="inline-flex items-center gap-1"><BoolCell on disabled={ro} title={roTitle ?? '初回ヒアリング前のため営業開始前（済めば自動で外れます）。押すと手で外す'} busy={isBusy(p, f)} label={label} onToggle={() => save(p, { [f]: false })} /><span className="whitespace-nowrap text-[11px] text-warn">営業開始前</span></span>
        : <BoolCell on={p.v[f] === true} disabled={ro} title={roTitle} busy={isBusy(p, f)} label={label} onToggle={() => save(p, { [f]: !(p.v[f] === true) })} />),
    });
    const score = (k: ScoreKind, def: boolean): Col => ({
      key: `score:${k}`, label: SCORE_LABEL[k], group: 'スコア', def, filter: 'select', opts: SCORE_FILTER_OPTS[k], hint: SCORE_HINT[k],
      text: (p) => scoreFilterLabel(scores.map.get(p.r.row) ?? null, k, scores.meta),
      num: (p) => { const x = scores.map.get(p.r.row); return x ? scoreValue(x, k) : null; },
      cell: (p) => <ScoreBadge s={scores.map.get(p.r.row)} kind={k} meta={scores.meta} name={p.r.name} />,
    });
    const scoreCols = scores.state === 'off' ? [] : [score('skill', true), score('join', true), score('decline', true), score('poa', false)];
    return [
      { key: 'status', label: '状態', group: '基本', def: true, filter: 'select', opts: ['営業中', '参画決定', '稼働中', '止め・辞退'], text: (p) => p.status, cell: (p) => <Pill>{p.status}</Pill> },
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
            {c === undefined ? <span className="text-faint">-</span> : c ? <>{c.short}{c.source === 'sales' && <span className="ml-1 text-[10.5px] text-faint">営業</span>}</> : <span className="text-faint">未設定</span>}
          </button>); } },
      txt('kadou', '稼働', '条件', true, 90),
      txt('tsuukin', '通勤', '条件', false, 80),
      txt('shozoku', '所属', '基本', false, 100),
      txt('gakumen', '額面', '基本', true, 90),
      { key: 'sukishi', label: 'スキシ', group: 'スキシ', def: true, filter: 'select', opts: ['作成済み', '未作成', '要確認'],
        text: (p) => (sukishiDone?.has(p.r.row) ? '作成済み' : sukishiState(p.v)),
        cell: (p) => { const st = sukishiDone?.has(p.r.row) ? '作成済み' : sukishiState(p.v); const u = s(p.v.sukishi); return (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="chip" style={SK_TONE[st]}>{st}</span>
            {isUrl(u) && <a href={u} target="_blank" rel="noreferrer" className="text-[12px] underline" style={{ color: 'var(--ad)' }}>開く</a>}
            <button type="button" onClick={() => onSukishi(p.r.row)} className="inline-flex min-h-7 items-center gap-1 rounded-md border px-1.5 text-[11.5px] font-semibold" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}><FileSpreadsheet size={12} />{st === '作成済み' ? '見る' : '作る'}</button>
          </span>); } },
      { key: 'pdf', label: 'PDF', group: 'スキシ', def: false, filter: 'none', text: (p) => (p.r.pdfUrl || p.r.pdfAnonUrl ? 'あり' : ''),
        cell: (p) => <PdfLinks r={p.r} /> },
      txt('summary', 'サマリ', 'スキシ', false, 200),
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
      chk('poa', '営業止め', true),
      chk('jitai', '辞退', true),
      { key: 'dropout', label: 'dropout', group: 'チェック', def: true, filter: 'bool', text: (p) => (p.r.dropout ? '✓' : ''),
        cell: (p) => (p.r.dropout ? <span className="chip whitespace-nowrap" style={SK_TONE.要確認} title={`飛び ${p.r.dropoutAt || ''} ${p.r.dropoutPhase || ''}（印をつける・外すのは今の画面から）`}>飛び{p.r.dropoutAt ? ` ${p.r.dropoutAt.slice(5).replace('-', '/')}` : ''}</span> : <span className="text-faint">—</span>) },
      chk('sankaku_kettei', '参画決定', true),
      chk('kadou_chu', '稼働中', true),
      chk('sai_assign', '再アサイン', false),
      chk('eigyo_teishi', '営業停止', false),
      chk('kanagawa', '神奈川', false),
      chk('kansai', '関西', false),
      chk('needs_review', '要確認', false),
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, aux, ro, roTitle, busy, save, sukishiDone, onSukishi]);

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
    if (!live) { toast({ text: '見本なので取り込んでいません', sub: 'ログインすると、ミンミカの営業開始前の人をいま取り込めます' }); return; }
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
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 px-3.5 py-3">
          <label className="flex min-h-9 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border border-field px-3 text-faint sm:max-w-[300px]"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} aria-label="この一覧を検索" placeholder="名前・最寄駅・希望・メモ・担当" className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none" /></label>
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} aria-label="どの人を出すか" className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-[13px]" style={scope !== 'active' ? { borderColor: 'var(--a)', color: 'var(--ad)', fontWeight: 600 } : undefined}>
            {SCOPES.map(([k, l]) => <option key={k} value={k}>{l}（{count(k)}）</option>)}
          </select>
          {filtered && <button onClick={() => { setScope('active'); setQ(''); setFlt({}); }} className="text-[12.5px] text-muted underline">絞り込みを外す</button>}
          <span className="ml-auto text-[12.5px] text-muted"><span className="num">{shown.length}</span>人</span>
          <button type="button" onClick={() => setPicker(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-field px-3 text-[13px] font-semibold"><Columns3 size={15} />列</button>
          <button type="button" onClick={pull} disabled={pulling || !canEdit} title={!canEdit ? needText('edit') : 'ミンミカで営業開始前になった未経験の人を、15分おきの自動を待たずにいま取り込みます'}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-field px-3 text-[13px] font-semibold disabled:opacity-50"><RefreshCw size={14} className={pulling ? 'animate-spin' : ''} />{pulling ? '取り込み中…' : 'ミンミカ取り込み'}</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="th-row text-left">
                <th className="sticky left-0 z-[1] bg-surface px-3 py-2.5 font-semibold" style={{ backgroundImage: 'linear-gradient(var(--th-bg, var(--as)), var(--th-bg, var(--as)))' }}><button type="button" onClick={() => clickSort('__name')} className="font-semibold">要員{sort?.key === '__name' ? (sort.dir < 0 ? ' ▼' : ' ▲') : ''}</button></th>
                {visible.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-2 py-2.5 font-semibold" title={c.hint}>
                    <button type="button" onClick={() => clickSort(c.key)} className="font-semibold">{c.label}<span className="text-[10px] opacity-70">{sort?.key === c.key ? (sort.dir < 0 ? ' ▼' : ' ▲') : ''}</span></button>
                  </th>
                ))}
              </tr>
              <tr className="border-b border-line">
                <th className="sticky left-0 z-[1] bg-surface px-3 py-1" />
                {visible.map((c) => (
                  <th key={c.key} className="px-1.5 py-1 font-normal">
                    {c.filter === 'none' ? null : c.filter === 'text' ? (
                      <input value={flt[c.key] ?? ''} onChange={(e) => setFlt((f) => ({ ...f, [c.key]: e.target.value }))} aria-label={`${c.label}で絞る`} placeholder="含む…" className="h-7 w-full min-w-[60px] rounded-md border border-field bg-surface px-1.5 text-[12px] outline-none" />
                    ) : (
                      <select value={flt[c.key] ?? ''} onChange={(e) => setFlt((f) => ({ ...f, [c.key]: e.target.value }))} aria-label={`${c.label}で絞る`} className="h-7 w-full min-w-[60px] rounded-md border border-field bg-surface px-1 text-[12px]" style={flt[c.key] ? { borderColor: 'var(--a)', color: 'var(--ad)', fontWeight: 600 } : undefined}>
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
                <tr key={p.r.row} className="row border-t border-line-soft align-middle" style={!p.r.active ? { opacity: 0.72 } : undefined}>
                  <td className="sticky left-0 z-[1] whitespace-nowrap bg-surface px-3 py-2 font-semibold">
                    <PersonName name={p.r.name} id={p.r.row} className="hover:underline underline-offset-2" />
                    {p.r.kanagawa && <span className="ml-1 rounded bg-sunken px-1 text-[10.5px] font-normal text-muted">かな西</span>}
                    {p.r.kansai && <span className="ml-1 rounded bg-sunken px-1 text-[10.5px] font-normal text-muted">関西</span>}
                    {p.v.needs_review === true && <span className="ml-1 text-[10.5px] font-normal text-warn">要確認</span>}
                  </td>
                  {visible.map((c) => <td key={c.key} className="px-2 py-1.5" style={c.minW ? { minWidth: c.minW } : undefined}>{c.cell(p)}</td>)}
                </tr>
              ))}
              {shown.length > limit && <tr><td colSpan={visible.length + 1} className="px-4 py-3 text-center text-[12.5px] text-muted">はじめの{limit}人を出しています <button type="button" onClick={() => setLimit((l) => l + 300)} className="ml-2 font-semibold underline" style={{ color: 'var(--ad)' }}>もっと出す</button></td></tr>}
              {shown.length === 0 && <tr><td colSpan={visible.length + 1} className="px-4 py-10 text-center text-[13px] text-muted">この条件の要員はいません</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {picker && <ColPicker cols={ordered} isShown={shownCol} onToggle={toggleCol} onOrder={(order) => setPrefsSave({ ...(prefs ?? { hidden: [], shown: [] }), order })} onReset={() => { setPrefsSave({ order: [], hidden: [], shown: [] }); }} onClose={() => setPicker(false)} />}
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

function SelectCell({ value, opts, disabled, title, busy, label, onPick }: { value: string; opts: readonly string[]; disabled: boolean; title?: string; busy: boolean; label: string; onPick: (v: string) => void }) {
  const list = value && !opts.includes(value) ? [value, ...opts] : opts;   // 今の値が選択肢に無ければそのまま残す
  return (
    <select value={value} disabled={disabled || busy} title={title} aria-label={label} onChange={(e) => onPick(e.target.value)}
      className="h-8 w-full min-w-[64px] rounded-md border border-transparent bg-transparent px-1 text-[13px] hover:border-field disabled:cursor-not-allowed" style={busy ? { opacity: 0.5 } : undefined}>
      <option value="">—</option>
      {list.map((o) => <option key={o} value={o}>{o}{o === value && !opts.includes(o) ? '（今の値）' : ''}</option>)}
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
      className: 'w-full rounded-md border bg-surface px-1.5 py-1 text-[13px] outline-none', style: { borderColor: 'var(--a)' },
    };
    return multiline ? <textarea {...common} rows={4} className={`${common.className} min-w-[240px] resize-y`} /> : <input {...common} />;
  }
  return (
    <button type="button" onClick={start} disabled={disabled} title={disabled ? title : `${value ? value.slice(0, 300) + '\n\n' : ''}押すと直す（${multiline ? '⌘/Ctrl+Enter' : 'Enter'}・欄から出ると保存／Esc で取りやめ）`}
      className="block min-h-8 w-full rounded-md px-1 text-left hover:bg-sunken disabled:cursor-default disabled:hover:bg-transparent" style={busy ? { opacity: 0.5 } : undefined}>
      {value ? <span className={multiline ? 'line-clamp-2 whitespace-pre-line text-[12.5px]' : 'block max-w-[220px] truncate'}>{value}</span> : <span className="text-faint">—</span>}
    </button>
  );
}

function PdfLinks({ r }: { r: EngineerRow }) {
  const one = (label: string, url?: string) => (url && isUrl(url) ? <a key={label} href={url} target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--ad)' }}>{label}</a> : null);
  const links = [one('PDF 本名', r.pdfUrl), one('PDF ｲﾆｼｬﾙ', r.pdfAnonUrl), one('XLS 本名', r.xlsxUrl), one('XLS ｲﾆｼｬﾙ', r.xlsxAnonUrl)].filter(Boolean);
  return links.length ? <span className="flex flex-col gap-0.5 whitespace-nowrap text-[12px]">{links}</span> : <span className="text-faint">—</span>;
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
    <Dialog label="出す列を選ぶ" onClose={onClose} z={Z_MODAL} className="fixed inset-x-3 top-[10vh] mx-auto flex max-h-[80vh] max-w-[440px] flex-col rounded-xl border border-line bg-surface shadow-xl">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div><div className="text-[15px] font-bold">出す列</div><div className="text-[12px] text-faint">この端末に残ります。つまみ（⋮⋮）をドラッグで並べ替え</div></div>
        <button aria-label="閉じる" data-dialog-close onClick={onClose} className="flex size-8 items-center justify-center rounded-lg border border-line"><X size={15} /></button>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 py-2" onPointerMove={move} onPointerUp={drop} onPointerCancel={drop} style={drag ? { touchAction: 'none', userSelect: 'none' } : undefined}>
        {order.map((k) => { const c = byKey.get(k); if (!c) return null; return (
          <li key={k} data-colkey={k} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px]" style={drag === k ? { background: 'var(--as)' } : undefined}>
            <span onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); setDrag(k); }} className="cursor-grab touch-none text-faint" aria-label={`${c.label}を並べ替える`}><GripVertical size={16} /></span>
            <label className="flex flex-1 cursor-pointer items-center gap-2"><input type="checkbox" checked={isShown(c)} onChange={() => onToggle(c)} style={{ accentColor: 'var(--a)' }} />{c.label}</label>
            <span className="text-[11px] text-faint">{c.group}</span>
          </li>); })}
      </ul>
      <div className="flex justify-between border-t border-line px-4 py-3">
        <button type="button" onClick={onReset} className="text-[12.5px] text-muted underline">はじめの形に戻す</button>
        <button type="button" onClick={onClose} className="btn-primary min-h-9 rounded-[10px] px-4 text-[13px] font-semibold">閉じる</button>
      </div>
    </Dialog>
  );
}

// ---- 通勤エリア（本人の回答／営業の入力。ブロックを押すたびに保存・取り消せる） ----
function CommuteEditor({ p, live, canEdit, onClose, onSaved }: { p: PRow; live: boolean; canEdit: boolean; onClose: () => void; onSaved: (row: CommuteListRow | null) => void }) {
  const { hit, toast } = useMotivation();
  const d = useIke<CommuteDetail>(live ? `commute-area?name=${encodeURIComponent(p.r.name)}` : null);
  const det: CommuteDetail | null = live ? d.data : { status: 'ok', any: false, blocks: [{ id: 'b3' }, { id: 'b16' }], legacyLabel: null, sales: null, canEdit: true };
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
    } else { short = next ? (next.any ? '1都3県OK' : `${next.blocks.length}エリア`) : ''; full = short; }
    setBusy(false);
    if (!ok) { toast({ text: `${p.r.name}：通勤エリアを保存できませんでした`, sub: err }); return; }
    const after = next ? { ...next, sales: true } : null;
    setCur(after ?? (det ? { any: det.any, blocks: det.blocks.map((b) => b.id), sales: false } : null));
    onSaved(next ? { key: commuteKey(p.r.name), any: next.any, source: 'sales', short, full } : null);
    hit();
    toast({
      text: undo ? `${p.r.name}：通勤エリアを元に戻しました` : next ? `${p.r.name}：通勤エリアを保存${live ? '' : '（見本）'}` : `${p.r.name}：本人の回答に戻しました`,
      undo: undo ? undefined : () => { void send(prev.sales ? { any: prev.any, blocks: prev.blocks } : null, after ?? prev, true); },
    });
  };
  const toggleBlock = (id: string) => { if (!cur) return; const blocks = cur.blocks.includes(id) ? cur.blocks.filter((x) => x !== id) : [...cur.blocks, id]; void send({ any: false, blocks }, cur); };
  const prefs = Object.keys(COMMUTE_PREF) as (keyof typeof COMMUTE_PREF)[];
  return (
    <Dialog label={`${p.r.name} の通勤エリア`} onClose={onClose} z={Z_MODAL} className="fixed inset-x-3 top-[6vh] mx-auto flex max-h-[88vh] max-w-[560px] flex-col rounded-xl border border-line bg-surface shadow-xl">
      <div className="flex items-start justify-between border-b border-line px-4 py-3">
        <div><div className="text-[12px] text-faint">通勤エリア{!live && '（見本）'}</div><div className="text-[16px] font-bold">{p.r.name}</div></div>
        <button aria-label="閉じる" data-dialog-close onClick={onClose} className="flex size-8 items-center justify-center rounded-lg border border-line"><X size={15} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 text-[13px]">
        {live && d.state === 'loading' && <p className="text-muted">読み込み中…</p>}
        {live && d.state === 'error' && <p className="text-bad">{d.error}</p>}
        {det && (
          <>
            <p className="mb-2 text-[12.5px] text-muted">
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
                    <legend className="mb-1 text-[12px] font-semibold text-muted">{COMMUTE_PREF[pf]}</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {COMMUTE_BLOCKS.filter((b) => b.pref === pf).map((b) => {
                        const on = cur.any || cur.blocks.includes(b.id);
                        return (
                          <button key={b.id} type="button" disabled={b.off || !editable || busy || cur.any} onClick={() => toggleBlock(b.id)} title={b.off ? '対象外のエリア' : b.sub} aria-pressed={on}
                            className="min-h-8 rounded-full border px-2.5 text-[12.5px] disabled:cursor-not-allowed" style={b.off ? { borderColor: 'var(--color-line)', color: 'var(--color-faint)', textDecoration: 'line-through' } : on ? { borderColor: 'var(--a)', background: 'var(--as)', color: 'var(--ad)', fontWeight: 700 } : { borderColor: 'var(--color-field)' }}>
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
      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3 text-[12px] text-faint">
        <span>押すたびに保存します（本人の回答は消えません）</span>
        {cur?.sales && <button type="button" disabled={!editable || busy} onClick={() => send(null, cur)} className="min-h-9 rounded-[10px] border border-field px-3 text-[13px] font-semibold text-ink disabled:opacity-50">本人の回答に戻す</button>}
      </div>
    </Dialog>
  );
}
