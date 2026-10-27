'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Crown, Handshake, MessageCircle, NotebookPen, Pencil, Phone, Trash2, X } from 'lucide-react';
import type { Memo } from '@/components/sy/compat';
import type { MemberBase } from '@/components/sy/compat';
import { LEADER_LABEL, MENDAN_LABELS } from '@/lib/sy/teiki-types';
import { fx } from '@/components/sy/compat';
import { btnGray, btnPrimary, inputCls } from '@/components/sy/ui';

// メモ・面談の記録を 直す／消す 部品と、面談の議事録の窓（2026-10-09 shoya「メモを編集・削除したい」「面談を日付ベースで議事録的に・押すと中身」）。
//   保存先は /api/s/memos（PATCH・DELETE）。いけどんの対応歴に書かれた面談は ここからは直せない（見るだけ）
export const MEMO_KINDS = [
  { key: 'memo', label: 'メモ', I: NotebookPen }, { key: 'call', label: '電話', I: Phone }, { key: 'line', label: 'LINE', I: MessageCircle }, { key: 'mendan', label: '面談', I: Handshake },
];
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const jst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3);
export const jstDay = (iso: string) => { const d = jst(iso); return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10); };
export const today = () => jstDay(new Date().toISOString());
// 2026/10/3（金）
export function fullDate(iso: string): string {
  const d = jst(iso); if (isNaN(d.getTime())) return iso;
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WD[d.getUTCDay()]}）`;
}

export type MemoDraft = { kind: string; label: string; body: string; date: string };
export async function patchMemo(id: string, d: Partial<MemoDraft>): Promise<Memo | null> {
  const r = await fetch('/api/sy/s/memos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...d }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { fx.toast(j.error || '保存に失敗しました', 'err'); return null; }
  fx.toast('直しました'); return j.memo as Memo;
}
export async function deleteMemo(id: string): Promise<boolean> {
  if (!window.confirm('この記録を消します。よろしいですか？')) return false;
  const r = await fetch(`/api/sy/s/memos?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { fx.toast(j.error || '消せませんでした', 'err'); return false; }
  fx.toast('消しました'); return true;
}

// 種類・区分・日付を選ぶ行（新しく書く欄と 直す欄で同じもの）
export function KindRow({ d, set, kinds = true }: { d: MemoDraft; set: (p: Partial<MemoDraft>) => void; kinds?: boolean }) {
  const chip = (on: boolean) => `ig-press inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${on ? 'bg-ig-text text-white' : 'bg-ig-hover text-ig-text'}`;
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {kinds && MEMO_KINDS.map((k) => <button key={k.key} type="button" onClick={() => set({ kind: k.key })} className={chip(d.kind === k.key)}><k.I size={13} strokeWidth={2} />{k.label}</button>)}
        <label className="ml-auto inline-flex items-center gap-1 text-xs text-ig-muted">日付
          <input type="date" value={d.date} max={today()} onChange={(e) => set({ date: e.target.value || today() })} className="rounded-lg border border-ig-border bg-white px-2 py-1 text-xs text-ig-text" />
        </label>
      </div>
      {d.kind === 'mendan' && (
        <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
          <span className="mr-1 text-ig-muted">区分</span>
          {MENDAN_LABELS.map((l) => <button key={l} type="button" onClick={() => set({ label: l })} className={chip(d.label === l)}>{l === LEADER_LABEL && <Crown size={12} strokeWidth={2} />}{l}</button>)}
        </div>
      )}
    </>
  );
}

// 直す欄。保存できたら onSaved に新しい中身を返す
export function MemoEditor({ id, init, rows = 4, onSaved, onCancel }: { id: string; init: MemoDraft; rows?: number; onSaved: (m: Memo) => void; onCancel: () => void }) {
  const [d, setD] = useState<MemoDraft>(init);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<MemoDraft>) => setD((x) => ({ ...x, ...p }));
  async function save() {
    if (!d.body.trim() || busy) return;
    setBusy(true);
    const m = await patchMemo(id, { ...d, label: d.kind === 'mendan' ? d.label || MENDAN_LABELS[0] : '' });
    setBusy(false);
    if (m) onSaved(m);
  }
  return (
    <div className="rounded-lg p-3 ring-1 ring-ig-border">
      <KindRow d={d} set={set} />
      <textarea autoFocus value={d.body} onChange={(e) => set({ body: e.target.value })} rows={rows}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}
        className={`${inputCls} w-full resize-y`} />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={onCancel} className={`ig-press ${btnGray}`}>やめる</button>
        <button type="button" disabled={busy || !d.body.trim()} onClick={save} className={`ig-press ${btnPrimary}`}>保存する</button>
      </div>
    </div>
  );
}

// ── 面談の議事録。日付を押すと開く。← → で この人の前後の面談へ
type Minute = MemberBase['mendanLog'][number];
// onOpenMember＝名前を押すと名簿の詳細を開く（定期面談ページから開いたときだけ渡す）
export function MinutesModal({ name, list, id, onPick, onClose, onChanged, onOpenMember }: {
  name: string; list: Minute[]; id: string; onPick: (id: string) => void; onClose: () => void; onChanged: () => void; onOpenMember?: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const i = list.findIndex((r) => r.id === id);
  const r = list[i];
  const older = list[i + 1], newer = list[i - 1];   // list は新しい順
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (edit) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && older) onPick(older.id);
      if (e.key === 'ArrowRight' && newer) onPick(newer.id);
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [edit, older, newer, onPick, onClose]);
  if (!r || typeof document === 'undefined') return null;
  const empty = !r.body && r.details.length === 0;
  return createPortal(
    <div className="ig-scrim fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={() => !edit && onClose()}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white">
        <div className="flex items-center gap-2 border-b border-ig-divider px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-base font-bold text-ig-text">{fullDate(r.at)}</span>
              <span className="inline-flex items-center gap-1 rounded bg-ig-hover px-1.5 py-0.5 text-xs font-semibold text-ig-text">{r.kind === 'leader' && <Crown size={12} strokeWidth={2} />}{r.label || '面談'}</span>
            </div>
            <div className="mt-0.5 text-xs text-ig-muted">{onOpenMember ? <button onClick={onOpenMember} title="名簿の詳細を開く" className="font-semibold text-ig-link hover:underline">{name}</button> : name}{r.by ? `・担当 ${r.by}` : ''}</div>
          </div>
          <button onClick={onClose} aria-label="閉じる"><X size={20} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
          {edit ? (
            <MemoEditor id={r.memoId} rows={10} init={{ kind: 'mendan', label: MENDAN_LABELS.includes(r.label) ? r.label : MENDAN_LABELS[0], body: r.body, date: jstDay(r.at) }}
              onCancel={() => setEdit(false)} onSaved={() => { setEdit(false); onChanged(); }} />
          ) : (
            <>
              {r.body && <p className="whitespace-pre-wrap break-words leading-relaxed text-ig-text">{r.body}</p>}
              {r.details.map((dd) => (
                <div key={dd.k} className="mt-3"><div className="text-xs font-semibold text-ig-muted">{dd.k}</div><p className="whitespace-pre-wrap break-words text-ig-text">{dd.v}</p></div>
              ))}
              {empty && <p className="text-center text-xs text-ig-muted">中身は書かれていません</p>}
            </>
          )}
        </div>
        {!edit && (
          <div className="flex items-center gap-2 border-t border-ig-divider px-4 py-2.5 text-xs">
            <button disabled={!older} onClick={() => older && onPick(older.id)} className="ig-press inline-flex items-center gap-0.5 rounded-lg px-2 py-1 font-semibold text-ig-text hover:bg-ig-hover disabled:opacity-30"><ChevronLeft size={14} />前の面談</button>
            <span className="text-ig-muted">{list.length - i} / {list.length}</span>
            <button disabled={!newer} onClick={() => newer && onPick(newer.id)} className="ig-press inline-flex items-center gap-0.5 rounded-lg px-2 py-1 font-semibold text-ig-text hover:bg-ig-hover disabled:opacity-30">次の面談<ChevronRight size={14} /></button>
            <span className="ml-auto" />
            {r.memoId ? (
              <>
                <button onClick={() => setEdit(true)} className="ig-press inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-ig-text hover:bg-ig-hover"><Pencil size={13} />直す</button>
                <button onClick={async () => { if (await deleteMemo(r.memoId)) { if (older || newer) onPick((older || newer)!.id); else onClose(); onChanged(); } }}
                  className="ig-press inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-ig-danger hover:bg-ig-danger/10"><Trash2 size={13} />消す</button>
              </>
            ) : <span className="text-ig-muted">いけどんの対応歴の記録（ここでは見るだけ）</span>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
