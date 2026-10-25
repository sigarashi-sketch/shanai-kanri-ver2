'use client';

import { useMemo, useState } from 'react';
import { Archive, CalendarDays, Check, RotateCcw, Sparkles, Undo2 } from 'lucide-react';
import { CATS, JOBS, MODES, PASTE_RESULT, PASTE_SAMPLE, SRC_LABEL, type Cat } from '@/lib/map-sample';
import type { CaseMapRow } from '@/lib/live/map';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import { LiveBanner, useIke } from '@/components/Live';
import { errText, horyuPost } from '@/lib/horyu-post';
import { HoryuNote } from '../HoryuNote';

// 案件の抽出・修正（保留）。今の社内システムの「案件マップ」（cases-map.html）の「案件入力」と、登録ずみの案件を直す・充足・終了するところ。
//   ・案件文を貼る →「自動で読み取る」＝今の POST /api/cases-map?action=extract（AI が欄に分ける。使えなければ見出しで拾う）。保存はしない
//     触っていない欄だけ埋める（今と同じ）
//   ・「登録する」＝ create（担当はログインした人。登録すると #未経験-案件共有 に1本流れる＝今と同じ）
//   ・一覧から選ぶ →「修正を保存」＝ update（担当は変えない）。充足・充足予約・終了・予約を外す・再掲載も今と同じ口
//   ・書き込みは /api/live/horyu/cases-map から（行き先はサーバーが決め打ち）
type Row = CaseMapRow & { address?: string; pinnable?: boolean; case_text?: string };
type List = { ok: boolean; rows: Row[]; today: string; can_edit: boolean; error?: string };
type Form = {
  title: string; company: string; category: Cat; pinnable: boolean; station: string; access: string; address: string; area: string;
  pay: string; hours: string; holiday: string; start_text: string; require_text: string; summary: string; commute_modes: string[];
};
const EMPTY: Form = { title: '', company: '', category: 'その他', pinnable: true, station: '', access: '', address: '', area: '', pay: '', hours: '', holiday: '', start_text: '', require_text: '', summary: '', commute_modes: ['公共交通機関'] };
const LABEL: Record<keyof Omit<Form, 'category' | 'pinnable' | 'commute_modes'>, string> = {
  title: '案件名', company: '就業先', station: '最寄駅', access: '行き方', address: '住所', area: 'エリア', pay: '単価', hours: '勤務時間', holiday: '休日', start_text: '開始', require_text: '求めるもの', summary: '業務内容',
};
const inp = 'min-h-9 w-full rounded-[10px] border border-field bg-surface px-2.5 text-[13px] text-ink';
const ghost = 'inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 text-[12px] font-semibold disabled:opacity-40';
const STATUS: Record<string, string> = { open: '掲載中', filled: '充足', closed: '終了' };

function sampleRows(): Row[] {
  return JOBS.map((j) => ({
    id: j.id, case_no: j.case_no, source: j.source, owner_name: j.owner, company: j.company ?? '', title: j.title, category: j.category,
    station: j.station ?? '', access: j.access ?? '', area: j.area ?? '', lat: null, lng: null, summary: j.summary, pay: j.pay ?? '', hours: j.hours ?? '', holiday: j.holiday ?? '',
    start_text: j.start ?? '', require_text: j.require ?? '', commute_modes: j.modes, status: j.status, reserve_date: j.reserve ?? null, reserve_note: j.reserveNote ?? '',
    filled_at: j.doneOn ?? null, filled_note: j.doneNote ?? '', pinnable: !j.area,
  }));
}
const toForm = (r: Row): Form => ({
  title: r.title, company: r.company, category: (CATS as readonly string[]).includes(r.category) ? (r.category as Cat) : 'その他', pinnable: r.pinnable !== false && !r.area,
  station: r.station, access: r.access, address: r.address ?? '', area: r.area, pay: r.pay, hours: r.hours, holiday: r.holiday, start_text: r.start_text,
  require_text: r.require_text, summary: r.summary, commute_modes: r.commute_modes?.length ? r.commute_modes : ['公共交通機関'],
});

export default function CaseInputPage() {
  const cm = useIke<List>('cases-map?action=list');
  const live = cm.live;
  const [local, setLocal] = useState<Row[]>(sampleRows);
  const rows = live ? cm.data?.rows ?? [] : local;
  const can = usePerms().can('eigyo', 'edit') && (!live || cm.data?.can_edit !== false);
  const { hit, toast } = useMotivation();
  const [text, setText] = useState(''), [form, setForm] = useState<Form>(EMPTY), [touched, setTouched] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Row | null>(null), [busy, setBusy] = useState(''), [readNote, setReadNote] = useState('');
  const [filter, setFilter] = useState<'open' | 'filled' | 'closed'>('open'), [q, setQ] = useState('');
  const [reserve, setReserve] = useState<{ id: string; date: string; note: string } | null>(null);
  const shown = useMemo(() => rows.filter((r) => r.status === filter && (!q || `${r.title}${r.company}${r.station}${r.area}${r.case_no}`.includes(q))), [rows, filter, q]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((f) => ({ ...f, [k]: v })); setTouched((t) => new Set(t).add(k)); };
  const reset = () => { setForm(EMPTY); setTouched(new Set()); setEditing(null); setReadNote(''); };

  const extract = async () => {
    if (text.trim().length < 10) { toast({ text: '案件文が短すぎます' }); return; }
    setBusy('extract');
    let fields: Partial<Form> & { commute_modes?: string[] };
    if (!live) { await new Promise((r) => setTimeout(r, 700)); const p = PASTE_RESULT; fields = { title: p.title, category: p.category, pay: p.pay, start_text: p.start, hours: p.hours, holiday: p.holiday, require_text: p.require, station: p.station, access: p.access, summary: p.summary, commute_modes: p.modes }; setReadNote('見本の読み取りです'); }
    else {
      const r = await horyuPost<{ via?: string; note?: string; fields?: Record<string, unknown>; station?: { ok?: boolean; station?: string; reason?: string } | null }>('cases-map', { op: 'extract', text });
      if (!r.ok) { setBusy(''); toast({ text: `読み取れませんでした：${errText(r)}` }); return; }
      const f = r.data.fields || {};
      fields = Object.fromEntries(Object.entries(f).filter(([, v]) => (Array.isArray(v) ? v.length : String(v ?? '').trim()))) as Partial<Form>;
      if (fields.station) fields.station = String(fields.station).replace(/駅$/, '');
      if (!fields.station && fields.area) fields.pinnable = false;
      setReadNote(`${r.data.via === 'llm' ? 'AI で読み取りました' : '見出しから読み取りました'}${r.data.note ? `（${r.data.note}）` : ''}${r.data.station && !r.data.station.ok ? `・駅「${r.data.station.station}」の場所が分かりませんでした` : ''}`);
    }
    setForm((cur) => {
      const next = { ...cur };
      for (const [k, v] of Object.entries(fields)) if (!touched.has(k) && v !== undefined) (next as Record<string, unknown>)[k] = v;
      if (!touched.has('category') && fields.category && !(CATS as readonly string[]).includes(fields.category)) next.category = 'その他';
      return next;
    });
    setBusy('');
  };

  const save = async () => {
    if (!form.title.trim()) { toast({ text: '案件名は必須です' }); return; }
    if (form.pinnable && !form.station.trim()) { toast({ text: '最寄駅は必須です（駅が無い案件はエリア指定に）' }); return; }
    if (!form.pinnable && !form.area.trim()) { toast({ text: 'エリア指定の案件はエリア名が必須です' }); return; }
    const body = { ...form, station: form.pinnable ? form.station : '', area: form.pinnable ? '' : form.area, case_text: text };
    setBusy('save');
    if (!live) {
      await new Promise((r) => setTimeout(r, 400));
      if (editing) setLocal((l) => l.map((r) => (r.id === editing.id ? { ...r, ...body } : r)));
      else setLocal((l) => [...l, { ...sampleRows()[0], ...body, id: `n${Date.now()}`, case_no: Math.max(...l.map((x) => x.case_no)) + 1, source: 'ike', owner_name: 'あなた', status: 'open', reserve_date: null, reserve_note: '', filled_at: null, filled_note: '' }]);
    } else {
      const r = await horyuPost<{ notify?: { posted?: boolean; error?: string }; row?: Row }>('cases-map', editing ? { op: 'update', id: editing.id, ...body } : { op: 'create', ...body });
      if (!r.ok) { setBusy(''); toast({ text: `保存できませんでした：${errText(r)}` }); return; }
      cm.reload();
    }
    setBusy(''); hit();
    toast({ text: editing ? `No.${editing.case_no} を直しました${live ? '' : '（見本）'}` : `案件を登録しました${live ? '' : '（見本）'}`, sub: editing ? undefined : '→ 案件マップに出ます（#未経験-案件共有 にも1本流れます）' });
    reset(); setText('');
  };

  const act = async (r: Row, op: 'fill' | 'close' | 'unreserve' | 'reopen', extra: Record<string, unknown> = {}) => {
    const label = op === 'fill' ? (extra.kind === 'reserve' ? '充足予約' : '充足') : op === 'close' ? '終了' : op === 'unreserve' ? '予約を外す' : '再掲載';
    if (!live) {
      setLocal((l) => l.map((x) => x.id !== r.id ? x : op === 'fill' && extra.kind === 'reserve' ? { ...x, reserve_date: String(extra.date), reserve_note: String(extra.note ?? '') }
        : op === 'fill' ? { ...x, status: 'filled', filled_at: '2026-10-25', filled_note: '手動で充足', reserve_date: null } : op === 'close' ? { ...x, status: 'closed', filled_at: '2026-10-25', filled_note: '終了', reserve_date: null }
          : op === 'unreserve' ? { ...x, reserve_date: null, reserve_note: '' } : { ...x, status: 'open', filled_at: null, filled_note: '' }));
      toast({ text: `No.${r.case_no} を「${label}」にしました（見本）` }); return;
    }
    setBusy(r.id + op);
    const res = await horyuPost('cases-map', { op, id: r.id, ...extra });
    setBusy('');
    if (!res.ok) { toast({ text: `${label}できませんでした：${errText(res)}` }); return; }
    hit(); toast({ text: `No.${r.case_no} を「${label}」にしました` }); cm.reload();
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-24 pt-[22px]">
      <PageTitle title="案件の抽出・修正" sub={`案件文を貼ると欄に分けます。登録ずみの案件を直す・充足・終了もここから${live ? '' : '・見本データ'}`} />
      <HoryuNote from="案件マップ（案件入力）" />
      <LiveBanner state={cm.state} error={cm.error} onReload={cm.reload} note="今の案件マップの案件です。ここで保存すると今の案件マップに入ります" />
      <div className="grid gap-3.5 lg:grid-cols-[1fr_420px]">
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold">{editing ? `No.${editing.case_no} を直す` : '新しい案件'}</h2>
            {editing && <button className={ghost} onClick={reset}><Undo2 size={12} />新しい案件に戻す</button>}
          </div>
          {!editing && <>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder={`Slack やメールの案件文をそのまま貼り付け\n\n例）\n${PASTE_SAMPLE}`} className="w-full rounded-[10px] border border-field bg-surface p-2.5 text-[13px]" />
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary inline-flex min-h-9 items-center gap-1 rounded-[10px] px-3 text-[13px] font-semibold disabled:opacity-40" disabled={!can || busy === 'extract'} title={can ? undefined : needText('edit')} onClick={extract}>
                <Sparkles size={14} />{busy === 'extract' ? '読み取り中…' : '自動で読み取る'}</button>
              {!live && <button className={ghost} onClick={() => setText(PASTE_SAMPLE)}>見本の案件文を入れる</button>}
              {readNote && <span className="text-[12px] text-muted">{readNote}（手で直した欄はそのまま）</span>}
            </div>
          </>}
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[12px] text-muted sm:col-span-2">{LABEL.title}<input className={inp} value={form.title} onChange={(e) => set('title', e.target.value)} /></label>
            <label className="flex flex-col gap-1 text-[12px] text-muted">{LABEL.company}<input className={inp} value={form.company} onChange={(e) => set('company', e.target.value)} /></label>
            <label className="flex flex-col gap-1 text-[12px] text-muted">職種
              <select className={inp} value={form.category} onChange={(e) => set('category', e.target.value as Cat)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
            <div className="flex flex-col gap-1 text-[12px] text-muted sm:col-span-2">場所
              <div className="flex gap-1">{([[true, '駅で指定'], [false, 'エリアで指定']] as const).map(([v, l]) => (
                <button key={l} type="button" onClick={() => set('pinnable', v)} className={ghost} style={form.pinnable === v ? { color: 'var(--ad)', borderColor: 'var(--a)', background: 'var(--as)' } : undefined}>{l}</button>))}</div></div>
            {form.pinnable ? <>
              <label className="flex flex-col gap-1 text-[12px] text-muted">{LABEL.station}<input className={inp} value={form.station} onChange={(e) => set('station', e.target.value)} placeholder="例）品川" /></label>
              <label className="flex flex-col gap-1 text-[12px] text-muted">{LABEL.access}<input className={inp} value={form.access} onChange={(e) => set('access', e.target.value)} placeholder="例）品川駅から徒歩6分" /></label>
            </> : <label className="flex flex-col gap-1 text-[12px] text-muted sm:col-span-2">{LABEL.area}<input className={inp} value={form.area} onChange={(e) => set('area', e.target.value)} placeholder="例）神奈川県内の指定店舗" /></label>}
            <label className="flex flex-col gap-1 text-[12px] text-muted sm:col-span-2">{LABEL.address}<input className={inp} value={form.address} onChange={(e) => set('address', e.target.value)} /></label>
            {(['pay', 'start_text', 'hours', 'holiday'] as const).map((k) => <label key={k} className="flex flex-col gap-1 text-[12px] text-muted">{LABEL[k]}<input className={inp} value={form[k]} onChange={(e) => set(k, e.target.value)} /></label>)}
            <label className="flex flex-col gap-1 text-[12px] text-muted sm:col-span-2">{LABEL.require_text}<input className={inp} value={form.require_text} onChange={(e) => set('require_text', e.target.value)} /></label>
            <label className="flex flex-col gap-1 text-[12px] text-muted sm:col-span-2">{LABEL.summary}<textarea rows={3} className="w-full rounded-[10px] border border-field bg-surface p-2.5 text-[13px] text-ink" value={form.summary} onChange={(e) => set('summary', e.target.value)} /></label>
            <div className="flex flex-col gap-1 text-[12px] text-muted sm:col-span-2">通勤手段
              <div className="flex flex-wrap gap-1">{MODES.map((m) => { const on = form.commute_modes.includes(m.v); return (
                <button key={m.v} type="button" className={ghost} style={on ? { color: 'var(--ad)', borderColor: 'var(--a)', background: 'var(--as)' } : undefined}
                  onClick={() => set('commute_modes', on ? form.commute_modes.filter((x) => x !== m.v) : [...form.commute_modes, m.v])}>{on && <Check size={11} />}{m.l}</button>); })}</div></div>
          </div>
          <div className="flex justify-end gap-2 border-t border-line-soft pt-3">
            <button className={ghost} onClick={reset}>クリア</button>
            <button className="btn-primary min-h-9 rounded-[10px] px-4 text-[13px] font-semibold disabled:opacity-40" disabled={!can || busy === 'save'} title={can ? undefined : needText('edit')} onClick={save}>
              {busy === 'save' ? '保存中…' : editing ? '修正を保存' : '登録する'}</button>
          </div>
        </section>

        <aside className="flex flex-col gap-2.5 self-start rounded-xl border border-line bg-surface p-3">
          <div className="flex gap-1 border-b border-line">
            {(['open', 'filled', 'closed'] as const).map((s) => (
              <button key={s} onClick={() => setFilter(s)} className="px-3 py-2 text-[13px]" style={filter === s ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: 'var(--color-muted)' }}>
                {STATUS[s]}（{rows.filter((r) => r.status === s).length}）</button>))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="案件名・会社・駅・番号で絞り込み" className={inp} />
          <div className="flex max-h-[640px] flex-col gap-2 overflow-y-auto">
            {shown.length === 0 && <div className="py-6 text-center text-[12px] text-faint">{cm.state === 'loading' ? '読み込み中…' : '該当する案件がありません'}</div>}
            {shown.map((r) => (
              <div key={r.id} className="rounded-lg border p-2.5 text-[12.5px]" style={{ borderColor: editing?.id === r.id ? 'var(--a)' : 'var(--color-line)' }}>
                <div className="flex items-center gap-1.5">
                  <span className="num font-bold">No.{r.case_no}</span>
                  <span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{SRC_LABEL[r.source as keyof typeof SRC_LABEL] ?? r.source}</span>
                  <span className="ml-auto text-[11.5px] text-faint">担当 {r.owner_name || '—'}</span>
                </div>
                <div className="mt-1 font-semibold">{r.title}</div>
                <div className="text-[11.5px] text-muted">{[r.company, r.station ? `${r.station}駅` : r.area, r.pay].filter(Boolean).join('・')}</div>
                {r.reserve_date && <div className="mt-1 text-[11.5px]" style={{ color: 'var(--tone-warn-fg)' }}><CalendarDays size={11} className="inline" /> {r.reserve_date} に充足予定{r.reserve_note && `（${r.reserve_note}）`}</div>}
                {r.status !== 'open' && <div className="mt-1 text-[11.5px] text-faint">{r.filled_at} {r.filled_note}</div>}
                {reserve?.id === r.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-soft p-2">
                    <input type="date" value={reserve.date} onChange={(e) => setReserve({ ...reserve, date: e.target.value })} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-[12px]" />
                    <input value={reserve.note} onChange={(e) => setReserve({ ...reserve, note: e.target.value })} placeholder="メモ（任意）" className="min-h-8 flex-1 rounded-lg border border-field bg-surface px-2 text-[12px]" />
                    <button className={ghost} disabled={!reserve.date} onClick={() => { act(r, 'fill', { kind: 'reserve', date: reserve.date, note: reserve.note }); setReserve(null); }}>予約する</button>
                    <button className="text-[12px] text-muted underline" onClick={() => setReserve(null)}>やめる</button>
                  </div>)}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button className={ghost} disabled={!can} title={can ? undefined : needText('edit')} onClick={() => { setEditing(r); setForm(toForm(r)); setTouched(new Set()); setText(r.case_text ?? ''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>直す</button>
                  {r.status === 'open' ? <>
                    <button className={ghost} disabled={!can || busy === r.id + 'fill'} onClick={() => act(r, 'fill', { kind: 'now' })}><Check size={11} />充足</button>
                    {r.reserve_date ? <button className={ghost} disabled={!can} onClick={() => act(r, 'unreserve')}>予約を外す</button>
                      : <button className={ghost} disabled={!can} onClick={() => setReserve({ id: r.id, date: '', note: '' })}><CalendarDays size={11} />充足予約</button>}
                    <button className={ghost} disabled={!can || busy === r.id + 'close'} onClick={() => act(r, 'close')}><Archive size={11} />終了</button>
                  </> : <button className={ghost} disabled={!can} onClick={() => act(r, 'reopen')}><RotateCcw size={11} />再掲載</button>}
                </div>
              </div>))}
          </div>
        </aside>
      </div>
    </main>
  );
}
