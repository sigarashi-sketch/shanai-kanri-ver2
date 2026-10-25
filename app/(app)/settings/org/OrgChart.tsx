'use client';

import { useState } from 'react';
import { GripVertical, Trash2, Users } from 'lucide-react';
import { moveBefore, newId, type OrgPerson, type Unit } from '@/lib/org';
import { AddName, DND_PERSON, DND_UNIT, hasType, NameEdit, PersonChip, type Ctl } from './shared';

type Ops = {
  list: OrgPerson[]; inUnit: (id: string | undefined) => OrgPerson[]; name: (uid: string) => string;
  putPerson: (uid: string, unit: string | undefined) => void; dropUnit: (from: string, to: Unit) => void; removeUnit: (u: Unit) => void; addUnit: (nm: string, parent: string | null) => void;
};

// 組織図（木）。部署→チーム。人の札をドラッグして入れる。部署・チームもドラッグで並び替え（チームはほかの部署へも移せる）。
export function OrgChart({ ctl, list }: { ctl: Ctl; list: OrgPerson[] }) {
  const { org, commit, flash } = ctl;
  const depts = org.units.filter((u) => !u.parent);
  const known = new Set(org.units.map((u) => u.id));
  const inUnit = (id: string | undefined) => list.filter((p) => (id ? org.people[p.userId]?.unit === id : !known.has(org.people[p.userId]?.unit ?? '')));
  const name = (uid: string) => ctl.people.find((p) => p.userId === uid)?.name ?? '';

  const putPerson = (uid: string, unit: string | undefined) => {
    if ((org.people[uid]?.unit ?? undefined) === unit) return;
    const where = org.units.find((u) => u.id === unit)?.name ?? '未所属';
    commit((s) => ({ ...s, people: { ...s.people, [uid]: { ...s.people[uid], unit } } }), `${name(uid)}さんを「${where}」に入れました`, { sub: '→ 組織図と一覧の所属に反映', flash: uid });
  };
  const dropUnit = (from: string, to: Unit) => {
    const f = org.units.find((u) => u.id === from);
    if (!f || f.id === to.id) return;
    if (f.parent === to.parent) { commit((s) => ({ ...s, units: moveBefore(s.units, from, to.id) }), `「${f.name}」の並びを変えました`, { flash: from }); return; }
    if (f.parent && !to.parent) commit((s) => ({ ...s, units: s.units.map((u) => (u.id === from ? { ...u, parent: to.id } : u)) }), `「${f.name}」を「${to.name}」の中に移しました`, { sub: '→ 中の人もいっしょに移ります', flash: from });
  };
  const removeUnit = (u: Unit) => {
    const kids = new Set([u.id, ...org.units.filter((x) => x.parent === u.id).map((x) => x.id)]);
    const n = Object.values(org.people).filter((a) => a.unit && kids.has(a.unit)).length;
    commit((s) => ({
      ...s, units: s.units.filter((x) => !kids.has(x.id)),
      people: Object.fromEntries(Object.entries(s.people).map(([k, a]) => [k, a.unit && kids.has(a.unit) ? { ...a, unit: undefined } : a])),
    }), `「${u.name}」を消しました`, { sub: n ? `→ 中の${n}人は未所属に戻りました` : '→ 組織図から消えました' });
  };
  const addUnit = (nm: string, parent: string | null) => {
    const id = newId('u');
    commit((s) => ({ ...s, units: [...s.units, { id, name: nm, parent }] }), `「${nm}」を足しました`, { sub: '→ 人をドラッグして入れられます', flash: id });
  };

  const ops: Ops = { list, inUnit, name, putPerson, dropUnit, removeUnit, addUnit };
  const none = inUnit(undefined);
  const [overNone, setOverNone] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <section onDragOver={(e) => { if (hasType(e, DND_PERSON)) { e.preventDefault(); setOverNone(true); } }} onDragLeave={() => setOverNone(false)}
        onDrop={(e) => { e.preventDefault(); setOverNone(false); const p = e.dataTransfer.getData(DND_PERSON); if (p) putPerson(p, undefined); }}
        className="rounded-xl border border-dashed p-3" style={{ borderColor: overNone ? 'var(--a)' : 'var(--color-field)', background: 'var(--color-soft)' }}>
        <div className="mb-2 text-[13px] font-bold">未所属 <span className="font-normal text-faint">{none.length}人・ここから部署やチームへドラッグ</span></div>
        <div className="flex max-h-[220px] flex-wrap gap-1.5 overflow-y-auto">
          {none.map((p) => <PersonChip key={p.userId} p={p} org={org} flash={flash === p.userId} />)}
          {!none.length && <span className="text-[12px] text-faint">全員どこかに入っています</span>}
        </div>
      </section>
      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {depts.map((d) => <Box key={d.id} u={d} depth={0} ctl={ctl} ops={ops} />)}
      </div>
      <div className="flex items-center gap-2 text-[12.5px] text-muted">部署を足す <AddName placeholder="部署の名前" onAdd={(v) => addUnit(v, null)} /></div>
    </div>
  );
}

function Box({ u, depth, ctl, ops }: { u: Unit; depth: 0 | 1; ctl: Ctl; ops: Ops }) {
  const { org, commit, flash } = ctl;
  const { list, inUnit, name, putPerson, dropUnit, removeUnit, addUnit } = ops;
    const [over, setOver] = useState(false);
    const teams = depth === 0 ? org.units.filter((x) => x.parent === u.id) : [];
    const mine = inUnit(u.id);
    const cand = depth === 0 ? list.filter((p) => { const a = org.people[p.userId]?.unit; return a === u.id || teams.some((t) => t.id === a); }) : mine;
    return (
      <div
        onDragOver={(e) => { if (hasType(e, DND_PERSON) || hasType(e, DND_UNIT)) { e.preventDefault(); e.stopPropagation(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); const p = e.dataTransfer.getData(DND_PERSON); const f = e.dataTransfer.getData(DND_UNIT); if (p) putPerson(p, u.id); else if (f) dropUnit(f, u); }}
        className={`rounded-xl border bg-surface ${depth === 0 ? 'p-3' : 'p-2.5'} ${flash === u.id ? 'mo-flash' : ''}`}
        style={{ borderColor: over ? 'var(--a)' : 'var(--color-line)', boxShadow: over ? '0 0 0 3px var(--al)' : undefined, background: depth ? 'var(--color-soft)' : undefined }}>
        <div className="flex flex-wrap items-center gap-2">
          <span draggable onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData(DND_UNIT, u.id); }} title="ドラッグで並び替え" className="cursor-grab text-faint"><GripVertical size={14} /></span>
          <NameEdit label={u.name} value={u.name} className={depth ? 'text-[13px] font-semibold' : 'text-[14.5px] font-bold'}
            onSave={(v) => commit((s) => ({ ...s, units: s.units.map((x) => (x.id === u.id ? { ...x, name: v } : x)) }), `「${u.name}」を「${v}」にしました`, { flash: u.id })} />
          <span className="text-[11.5px] text-faint"><Users size={11} className="mr-0.5 inline" />{cand.length}人</span>
          <label className="ml-auto flex items-center gap-1 text-[11.5px] text-muted">長
            <select aria-label={`${u.name}の長`} value={u.headId ?? ''} className="max-w-[140px] rounded-md border border-field bg-surface px-1.5 py-0.5 text-[12px]"
              onChange={(e) => { const h = e.target.value || undefined; commit((s) => ({ ...s, units: s.units.map((x) => (x.id === u.id ? { ...x, headId: h } : x)) }), h ? `「${u.name}」の長を${name(h)}さんにしました` : `「${u.name}」の長を外しました`, { sub: '→ 組織図の「長」の札に反映', flash: u.id }); }}>
              <option value="">決めない</option>
              {(cand.length ? cand : list).map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
            </select>
          </label>
          <button aria-label={`${u.name}を消す`} title="消す（中の人は未所属に戻る）" onClick={() => removeUnit(u)} className="rounded p-1 text-faint hover:text-bad"><Trash2 size={13} /></button>
        </div>
        <div className="mt-2 flex min-h-8 flex-wrap gap-1.5">
          {mine.map((p) => <PersonChip key={p.userId} p={p} org={org} head={u.headId === p.userId} flash={flash === p.userId} />)}
          {!mine.length && <span className="text-[12px] text-faint">ここに人をドラッグ</span>}
        </div>
        {depth === 0 && (
          <div className="mt-3 flex flex-col gap-2 border-l-2 pl-3" style={{ borderColor: 'var(--al)' }}>
            {teams.map((t) => <Box key={t.id} u={t} depth={1} ctl={ctl} ops={ops} />)}
            <div><AddName placeholder="チームの名前" onAdd={(v) => addUnit(v, u.id)} /></div>
          </div>
        )}
      </div>
    );
  }
