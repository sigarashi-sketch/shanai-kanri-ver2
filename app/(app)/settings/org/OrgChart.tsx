'use client';

import { useEffect, useState } from 'react';
import { ArrowDownToLine, GripVertical, KeyRound, Trash2, Users, X } from 'lucide-react';
import { KUBUN } from '@/lib/kubun';
import { levelLabel, moveBefore, newId, unitOwnPerms, type OrgPerson, type Unit } from '@/lib/org';
import { AddName, DND_PERSON, DND_UNIT, droppedPeople, hasType, NameEdit, PersonChip, type Ctl } from './shared';

type Ops = {
  list: OrgPerson[]; inUnit: (id: string | undefined) => OrgPerson[]; name: (uid: string) => string;
  putPeople: (uids: string[], unit: string | undefined) => void; dropUnit: (from: string, to: Unit) => void; removeUnit: (u: Unit) => void; addUnit: (nm: string, parent: string | null) => void;
  sel: Set<string>; toggle: (uid: string) => void; selectAll: (uids: string[]) => void;
};

// 組織図（木）。部署→チーム。部署・チームもドラッグで並び替え（チームはほかの部署へも移せる）。
// 人を動かす（10-26 shoya「選択移動しづらい」）：札を押して何人でも選ぶ → 行き先の「ここへ移す」を押す（または上の帯で行き先を選ぶ）。
//   ドラッグも残す。選んでいる札をつかむと選んだ全員が動く。Esc で選ぶのをやめる
// 組織の権限（10-26 shoya）：箱には札だけ出す。付けるのは「ロールと役職」の「組織ごとの権限」（ロールと同じ形）
export function OrgChart({ ctl, list }: { ctl: Ctl; list: OrgPerson[] }) {
  const { org, commit, flash } = ctl;
  const depts = org.units.filter((u) => !u.parent);
  const known = new Set(org.units.map((u) => u.id));
  const inUnit = (id: string | undefined) => list.filter((p) => (id ? org.people[p.userId]?.unit === id : !known.has(org.people[p.userId]?.unit ?? '')));
  const name = (uid: string) => ctl.people.find((p) => p.userId === uid)?.name ?? '';
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(new Set()); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const toggle = (uid: string) => setSel((x) => { const n = new Set(x); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; });
  const selectAll = (uids: string[]) => setSel((x) => new Set([...x, ...uids]));

  const putPeople = (uids: string[], unit: string | undefined) => {
    const cur = (uid: string) => { const x = org.people[uid]?.unit; return x && known.has(x) ? x : undefined; };
    const todo = uids.filter((uid) => cur(uid) !== unit);
    setSel(new Set());
    if (!todo.length) return;
    const where = org.units.find((u) => u.id === unit)?.name ?? '未所属';
    const who = todo.length === 1 ? `${name(todo[0])}さん` : `${todo.length}人`;
    commit((s) => ({ ...s, people: { ...s.people, ...Object.fromEntries(todo.map((uid) => [uid, { ...s.people[uid], unit }])) } }),
      `${who}を「${where}」に入れました`, { sub: '→ 組織図と一覧の所属に反映', flash: todo.length === 1 ? todo[0] : unit });
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
    commit((s) => ({ ...s, units: [...s.units, { id, name: nm, parent }] }), `「${nm}」を足しました`, { sub: '→ 人を選んで「ここへ移す」で入れられます', flash: id });
  };

  const ops: Ops = { list, inUnit, name, putPeople, dropUnit, removeUnit, addUnit, sel, toggle, selectAll };
  const none = inUnit(undefined);
  const [overNone, setOverNone] = useState(false);
  const unitOptions = depts.flatMap((d) => [d, ...org.units.filter((t) => t.parent === d.id)]);
  return (
    <div className="flex flex-col gap-3">
      {sel.size > 0 ? (
        <div className="mo-fade-up sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-body shadow-md" style={{ borderColor: 'var(--a)', background: 'var(--as)' }}>
          <b>{sel.size}人を選んでいます</b>
          <span className="text-sm text-muted">→ 行き先の「ここへ移す」を押すか、ここで選ぶ</span>
          <select aria-label="選んだ人の行き先" value="" className="rounded-md border border-field bg-surface px-2 py-1 text-sm"
            onChange={(e) => { if (e.target.value) putPeople(Array.from(sel), e.target.value === '__none' ? undefined : e.target.value); }}>
            <option value="">行き先を選ぶ…</option>
            <option value="__none">未所属に戻す</option>
            {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.parent ? `　└ ${u.name}` : u.name}</option>)}
          </select>
          <button onClick={() => setSel(new Set())} className="ml-auto inline-flex items-center gap-1 text-sm font-semibold underline"><X size={13} />選ぶのをやめる（Esc）</button>
        </div>
      ) : (
        <p className="text-sm text-faint">名前を押すと選べます（何人でも）。選んだら行き先の「ここへ移す」を押します。ドラッグでも動かせます。</p>
      )}
      <section onDragOver={(e) => { if (hasType(e, DND_PERSON)) { e.preventDefault(); setOverNone(true); } }} onDragLeave={() => setOverNone(false)}
        onDrop={(e) => { e.preventDefault(); setOverNone(false); const ids = droppedPeople(e); if (ids.length) putPeople(ids, undefined); }}
        className="rounded-xl border border-dashed p-3" style={{ borderColor: overNone ? 'var(--a)' : 'var(--color-field)', background: 'var(--color-soft)' }}>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-body font-bold">未所属 <span className="font-normal text-faint">{none.length}人</span>
          <Pick ids={none.map((p) => p.userId)} ops={ops} />
          <MoveHere ops={ops} onMove={() => putPeople(Array.from(sel), undefined)} label="未所属に戻す" />
        </div>
        <div className="flex max-h-[220px] flex-wrap gap-1.5 overflow-y-auto">
          {none.map((p) => <PersonChip key={p.userId} p={p} org={org} flash={flash === p.userId} selected={sel.has(p.userId)} onToggle={() => toggle(p.userId)} dragIds={sel.has(p.userId) ? Array.from(sel) : undefined} />)}
          {!none.length && <span className="text-sm text-faint">全員どこかに入っています</span>}
        </div>
      </section>
      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {depts.map((d) => <Box key={d.id} u={d} depth={0} ctl={ctl} ops={ops} />)}
      </div>
      <div className="flex items-center gap-2 text-sm text-muted">部署を足す <AddName placeholder="部署の名前" onAdd={(v) => addUnit(v, null)} /></div>
    </div>
  );
}

/** 選んでいる人がいるときだけ出る「ここへ移す」 */
function MoveHere({ ops, onMove, label = 'ここへ移す' }: { ops: Ops; onMove: () => void; label?: string }) {
  if (!ops.sel.size) return null;
  return (
    <button onClick={onMove} className="mo-fade-in inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-bold" style={{ background: 'var(--btn-bg, var(--a))', color: 'var(--btn-fg, var(--ao))', border: '1px solid var(--btn-border, transparent)' }}>
      <ArrowDownToLine size={13} />{label}（{ops.sel.size}人）
    </button>
  );
}
/** この箱の人をまとめて選ぶ */
function Pick({ ids, ops }: { ids: string[]; ops: Ops }) {
  if (!ids.length || ids.every((id) => ops.sel.has(id))) return null;
  return <button onClick={() => ops.selectAll(ids)} className="text-xs font-normal text-muted underline">全員選ぶ</button>;
}

/** 組織に付けた権限の札（見るだけ）。変えるのは「ロールと役職」の「組織ごとの権限」 */
function UnitPerms({ u, ctl }: { u: Unit; ctl: Ctl }) {
  const eff = unitOwnPerms(u);
  const on = KUBUN.filter((m) => eff[m.key] !== 'none');
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm" title="変えるのは「ロールと役職」の「組織ごとの権限」">
      <span className="inline-flex items-center gap-0.5 font-semibold text-muted"><KeyRound size={12} />組織の権限</span>
      {on.length ? on.map((m) => <span key={m.key} className="chip" style={{ background: `var(--s-${m.mod})`, color: `var(--d-${m.mod})` }}>{m.label} {levelLabel(eff[m.key])}</span>)
        : <span className="text-faint">なし</span>}
      {u.manageAccess && <span className="chip" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }}>権限管理</span>}
      <button onClick={() => ctl.openRoles?.()} className="text-xs text-muted underline">変える</button>
    </div>
  );
}

function Box({ u, depth, ctl, ops }: { u: Unit; depth: 0 | 1; ctl: Ctl; ops: Ops }) {
  const { org, commit, flash } = ctl;
  const { list, inUnit, name, putPeople, dropUnit, removeUnit, addUnit, sel, toggle } = ops;
    const [over, setOver] = useState(false);
    const teams = depth === 0 ? org.units.filter((x) => x.parent === u.id) : [];
    const mine = inUnit(u.id);
    const cand = depth === 0 ? list.filter((p) => { const a = org.people[p.userId]?.unit; return a === u.id || teams.some((t) => t.id === a); }) : mine;
    return (
      <div
        onDragOver={(e) => { if (hasType(e, DND_PERSON) || hasType(e, DND_UNIT)) { e.preventDefault(); e.stopPropagation(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); const ids = droppedPeople(e); const f = e.dataTransfer.getData(DND_UNIT); if (ids.length) putPeople(ids, u.id); else if (f) dropUnit(f, u); }}
        className={`rounded-xl border bg-surface ${depth === 0 ? 'p-3' : 'p-2.5'} ${flash === u.id ? 'mo-flash' : ''}`}
        style={{ borderColor: over ? 'var(--a)' : 'var(--color-line)', boxShadow: over ? '0 0 0 3px var(--al)' : undefined, background: depth ? 'var(--color-soft)' : undefined }}>
        <div className="flex flex-wrap items-center gap-2">
          <span draggable onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData(DND_UNIT, u.id); }} title="ドラッグで並び替え" className="cursor-grab text-faint"><GripVertical size={14} /></span>
          <NameEdit label={u.name} value={u.name} className={depth ? 'text-body font-semibold' : 'text-md font-bold'}
            onSave={(v) => commit((s) => ({ ...s, units: s.units.map((x) => (x.id === u.id ? { ...x, name: v } : x)) }), `「${u.name}」を「${v}」にしました`, { flash: u.id })} />
          <span className="text-xs text-faint"><Users size={11} className="mr-0.5 inline" />{cand.length}人</span>
          <MoveHere ops={ops} onMove={() => putPeople(Array.from(sel), u.id)} />
          <label className="ml-auto flex items-center gap-1 text-xs text-muted">長
            <select aria-label={`${u.name}の長`} value={u.headId ?? ''} className="max-w-[140px] rounded-md border border-field bg-surface px-1.5 py-0.5 text-sm"
              onChange={(e) => { const h = e.target.value || undefined; commit((s) => ({ ...s, units: s.units.map((x) => (x.id === u.id ? { ...x, headId: h } : x)) }), h ? `「${u.name}」の長を${name(h)}さんにしました` : `「${u.name}」の長を外しました`, { sub: '→ 組織図の「長」の札に反映', flash: u.id }); }}>
              <option value="">決めない</option>
              {(cand.length ? cand : list).map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
            </select>
          </label>
          <button aria-label={`${u.name}を消す`} title="消す（中の人は未所属に戻る）" onClick={() => removeUnit(u)} className="rounded p-1 text-faint hover:text-bad"><Trash2 size={13} /></button>
        </div>
        <UnitPerms u={u} ctl={ctl} />
        <div className="mt-2 flex min-h-8 flex-wrap items-center gap-1.5">
          {mine.map((p) => <PersonChip key={p.userId} p={p} org={org} head={u.headId === p.userId} flash={flash === p.userId} selected={sel.has(p.userId)} onToggle={() => toggle(p.userId)} dragIds={sel.has(p.userId) ? Array.from(sel) : undefined} />)}
          {!mine.length && <span className="text-sm text-faint">人を選んで「ここへ移す」（ドラッグでも入れられます）</span>}
          <Pick ids={mine.map((p) => p.userId)} ops={ops} />
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
