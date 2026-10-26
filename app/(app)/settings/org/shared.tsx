'use client';

import { useState } from 'react';
import { Check, GripVertical, KeyRound, Pencil } from 'lucide-react';
import { KUBUN } from '@/lib/kubun';
import { levelLabel, orgManage, orgPerms, type OrgPerson, type OrgState } from '@/lib/org';

// 組織表の部品（人の札・結果の段階・名前の直し方・ドラッグの型）
export type Commit = (fn: (s: OrgState) => OrgState, text: string, opts?: { sub?: string; flash?: string }) => void;
export type Ctl = { org: OrgState; people: OrgPerson[]; commit: Commit; flash: string | null; openRoles?: () => void };

export const DND_PERSON = 'application/x-org-person';
export const DND_UNIT = 'application/x-org-unit';
export const DND_ROLE = 'application/x-org-role';
export const DND_TITLE = 'application/x-org-title';
export const hasType = (e: React.DragEvent, t: string) => Array.from(e.dataTransfer.types).includes(t);

/** 結果の段階（ロールと個別の高いほう）。見ないは薄く。権限管理ができる人は鍵 */
export function PermChips({ org, userId }: { org: OrgState; userId: string }) {
  const a = org.people[userId];
  const eff = orgPerms(org, a);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {KUBUN.map((m) => eff[m.key] === 'none'
        ? <span key={m.key} className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)', opacity: 0.6 }}>{m.label} 見ない</span>
        : <span key={m.key} className="chip" style={{ background: `var(--s-${m.mod})`, color: `var(--d-${m.mod})` }}>{m.label} {levelLabel(eff[m.key])}</span>)}
      {orgManage(org, a) && <span className="chip" title="権限管理ができる" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }}><KeyRound size={11} />権限管理</span>}
    </span>
  );
}

/** 人の札。押すと選ぶ（もう一度押すと外す）・ドラッグで部署・チームへ（選んでいる札をつかむと選んだ全員が動く） */
export function PersonChip({ p, org, head, flash, selected, onToggle, dragIds }: { p: OrgPerson; org: OrgState; head?: boolean; flash?: boolean; selected?: boolean; onToggle?: () => void; dragIds?: string[] }) {
  const t = org.titles.find((x) => x.id === org.people[p.userId]?.title);
  return (
    <button type="button" draggable aria-pressed={selected} aria-label={p.name} onClick={onToggle}
      onDragStart={(e) => { e.dataTransfer.setData(DND_PERSON, (dragIds?.length ? dragIds : [p.userId]).join(',')); e.dataTransfer.effectAllowed = 'move'; }}
      className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border py-1 pl-1 pr-2 text-sm active:cursor-grabbing ${flash ? 'mo-flash' : ''}`}
      style={selected ? { borderColor: 'var(--a)', background: 'var(--as)', boxShadow: '0 0 0 2px var(--al)' } : { borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}
      title={selected ? 'もう一度押すと選ぶのをやめる・ドラッグで選んだ全員を動かす' : '押して選ぶ（何人でも）・ドラッグで部署・チームへ'}>
      {selected ? <Check size={12} style={{ color: 'var(--ad)' }} /> : <GripVertical size={12} className="text-faint" />}
      <span className="font-semibold">{p.name}</span>
      {t && <span className="text-xs text-muted">{t.label}</span>}
      {head && <span className="chip" style={{ background: 'var(--as)', color: 'var(--ad)' }}>長</span>}
      {p.mikeiken && <span className="chip" title="未経験事業部" style={{ background: 'var(--tone-info-bg)', color: 'var(--tone-info-fg)' }}>未</span>}
    </button>
  );
}
/** ドラッグで運ばれてきた人（カンマ区切り） */
export const droppedPeople = (e: React.DragEvent) => e.dataTransfer.getData(DND_PERSON).split(',').filter(Boolean);

/** 管理者が名前を付ける・直す（押すと欄になる。Enter/外を押すと確定、Esc でやめる） */
export function NameEdit({ value, onSave, className, label }: { value: string; onSave: (v: string) => void; className?: string; label: string }) {
  const [edit, setEdit] = useState<string | null>(null);
  if (edit === null) return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      <span>{value}</span>
      <button aria-label={`${label}の名前を変える`} title="名前を変える" onClick={() => setEdit(value)} className="rounded p-0.5 text-faint hover:text-ink"><Pencil size={12} /></button>
    </span>
  );
  const done = () => { const v = edit.trim(); setEdit(null); if (v && v !== value) onSave(v); };
  return (
    <input autoFocus aria-label={`${label}の名前`} value={edit} onChange={(e) => setEdit(e.target.value)} onBlur={done}
      onKeyDown={(e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') setEdit(null); }}
      className="w-[180px] rounded-md border border-field bg-surface px-2 py-0.5 text-body" />
  );
}

/** 選択肢を足す小さな欄（部署・チーム・ロール・役職の名前） */
export function AddName({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState('');
  const go = () => { const t = v.trim(); if (!t) return; onAdd(t); setV(''); };
  return (
    <span className="inline-flex items-center gap-1">
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} placeholder={placeholder} aria-label={placeholder}
        className="w-[150px] rounded-md border border-field bg-surface px-2 py-1 text-sm" />
      <button onClick={go} disabled={!v.trim()} className="rounded-md border border-field bg-surface px-2 py-1 text-sm font-semibold disabled:opacity-40">足す</button>
    </span>
  );
}
