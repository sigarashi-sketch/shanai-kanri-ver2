'use client';

import { useState } from 'react';
import { Eye, GripVertical, KeyRound, Network, Trash2 } from 'lucide-react';
import { LEVELS, atLeast, type Level } from '@/lib/access';
import { K_NONE, KUBUN } from '@/lib/kubun';
import { CAN_KEYS, moveBefore, newId, NO_ROLE, unitAndChildren, unitOwnPerms, type OrgRole, type Title, type Unit } from '@/lib/org';
import type { RoleCanRow } from '@/lib/role-can';
import { AddName, DND_ROLE, DND_TITLE, hasType, NameEdit, type Ctl } from './shared';

// ロールの定義（区分 × 見ない/見る/直す/承認 ＋ 権限管理ができる・区分は lib/kubun.ts＝今のいけどんと同じ）と、役職の選択肢。どちらもドラッグで並び替え。
// 組織ごとの権限（10-26 shoya）：部署・チームにもロールと同じ形で段階を付ける＝中の人全員に付く（部署の分はチームの人にも）
// 名前の小窓で見られるもの（チャット・要約・基本情報・単価額面）もロール・部署/チームに付ける（10-26 権限管理のロールごとの表をやめてここへ）
export function RolesEditor({ ctl }: { ctl: Ctl }) {
  const { org, commit, flash } = ctl;
  const used = (id: string) => ctl.people.filter((p) => (org.people[p.userId]?.role ?? NO_ROLE) === id).length;
  const usedT = (id: string) => Object.values(org.people).filter((a) => a.title === id).length;
  const patchRole = (id: string, patch: Partial<OrgRole>, text: string) =>
    commit((s) => ({ ...s, roles: s.roles.map((r) => (r.id === id ? { ...r, ...patch } : r)) }), text, { sub: `→ このロールの${used(id)}人の結果の段階に反映`, flash: id });

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 lg:grid-cols-2">
        {org.roles.map((r) => <RoleCard key={r.id} r={r} n={used(r.id)} flash={flash === r.id} ctl={ctl} patchRole={patchRole} />)}
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-field p-4 text-sm text-muted">ロールを作る
          <AddName placeholder="ロールの名前" onAdd={(v) => { const id = newId('r'); commit((s) => ({ ...s, roles: [...s.roles, { id, label: v, perms: { ...K_NONE }, manageAccess: false, can: {} }] }), `ロール「${v}」を作りました`, { sub: '→ 段階を選んで、一覧で人に付けられます', flash: id }); }} />
        </div>
      </section>

      <div>
        <h2 className="flex items-center gap-1.5 text-md font-bold"><Network size={16} />組織ごとの権限</h2>
        <p className="text-sm text-muted">部署・チームに付けると、中の人全員に付きます（部署に付けた分はチームの人にも）。その人の結果は ロール・個別・所属 の一番高いもの。組織は「組織図」で作ります。</p>
      </div>
      <section className="grid gap-3 lg:grid-cols-2">
        {org.units.filter((u) => !u.parent).flatMap((d) => [d, ...org.units.filter((t) => t.parent === d.id)]).map((u) => <UnitCard key={u.id} u={u} ctl={ctl} />)}
        {!org.units.length && <p className="text-sm text-faint">部署・チームがまだありません（「組織図」で作れます）</p>}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-md font-bold">役職の選択肢</h2>
        <p className="mb-3 text-sm text-muted">ここで決めた役職から、一覧で人ごとに選びます（人には選ぶだけ）。ドラッグで並び替え。</p>
        <div className="flex flex-wrap items-center gap-2">
          {org.titles.map((t) => <TitleChip key={t.id} t={t} n={usedT(t.id)} ctl={ctl} />)}
          <AddName placeholder="役職の名前" onAdd={(v) => { const id = newId('t'); commit((s) => ({ ...s, titles: [...s.titles, { id, label: v }] }), `役職「${v}」を足しました`, { sub: '→ 一覧の役職の選択肢に反映', flash: id }); }} />
        </div>
      </section>
    </div>
  );
}

function RoleCard({ r, n, flash, ctl, patchRole }: { r: OrgRole; n: number; flash: boolean; ctl: Ctl; patchRole: (id: string, p: Partial<OrgRole>, t: string) => void }) {
  const [over, setOver] = useState(false);
  const fixed = r.id === NO_ROLE;
  return (
    <div draggable={!fixed} onDragStart={(e) => e.dataTransfer.setData(DND_ROLE, r.id)}
      onDragOver={(e) => { if (hasType(e, DND_ROLE)) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.getData(DND_ROLE); if (f && f !== r.id) ctl.commit((s) => ({ ...s, roles: moveBefore(s.roles, f, r.id) }), 'ロールの並びを変えました', { sub: '→ ロールの選択肢の順に反映', flash: f }); }}
      className={`rounded-xl border bg-surface p-4 ${flash ? 'mo-flash' : ''}`} style={{ borderColor: over ? 'var(--a)' : 'var(--color-line)' }}>
      <div className="flex items-center gap-2">
        {!fixed && <GripVertical size={14} className="cursor-grab text-faint" />}
        {fixed ? <b className="text-md">{r.label}</b> : <NameEdit label={r.label} value={r.label} className="text-md font-bold" onSave={(v) => patchRole(r.id, { label: v }, `ロール「${r.label}」を「${v}」にしました`)} />}
        <span className="text-xs text-faint">{n}人</span>
        {!fixed && (
          <button aria-label={`${r.label}を消す`} title="消す（付いていた人は「ロールなし」に戻る）" className="ml-auto rounded p-1 text-faint hover:text-bad"
            onClick={() => ctl.commit((s) => ({ ...s, roles: s.roles.filter((x) => x.id !== r.id), people: Object.fromEntries(Object.entries(s.people).map(([k, a]) => [k, a.role === r.id ? { ...a, role: undefined } : a])) }), `ロール「${r.label}」を消しました`, { sub: n ? `→ 付いていた${n}人は「ロールなし」に戻りました` : '→ 選択肢から消えました' })}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {KUBUN.map((m) => (
          <div key={m.key} className="flex items-center gap-3 text-sm">
            <span className="w-[100px] shrink-0 font-semibold"><span style={{ color: `var(--c-${m.mod})` }}>●</span> {m.label}</span>
            <div role="radiogroup" aria-label={`${r.label}の${m.label}`} className="inline-flex overflow-hidden rounded-lg border border-field">
              {LEVELS.map((lv) => {
                const on = r.perms[m.key] === lv.key;
                return (
                  <button key={lv.key} role="radio" aria-checked={on} title={lv.hint} disabled={fixed}
                    onClick={() => { if (!on) patchRole(r.id, { perms: { ...r.perms, [m.key]: lv.key as Level } }, `「${r.label}」の${m.label}を「${lv.label}」にしました`); }}
                    className="px-2.5 py-1 text-sm disabled:cursor-not-allowed"
                    style={on ? { background: `var(--c-${m.mod})`, color: `var(--o-${m.mod})`, fontWeight: 700 } : { background: 'var(--color-surface)' }}>{lv.label}</button>
                );
              })}
            </div>
          </div>
        ))}
        <label className="mt-1 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={r.manageAccess} disabled={fixed} onChange={(e) => patchRole(r.id, { manageAccess: e.target.checked }, `「${r.label}」の権限管理を${e.target.checked ? '付けました' : '外しました'}`)} />
          <KeyRound size={13} />権限管理ができる（組織表・ロール・権限を変えられる）
        </label>
        <CanBoxes name={r.label} can={r.can} disabled={fixed} onChange={(can, text) => patchRole(r.id, { can }, text)} />
      </div>
    </div>
  );
}

/** 名前の小窓で見られるもの。チャットを外すと要約も外れる・要約を付けるとチャットも付く。base＝部署で付いている分（外せない） */
function CanBoxes({ name, can, base, disabled, onChange }: { name: string; can?: Partial<RoleCanRow>; base?: Partial<RoleCanRow>; disabled?: boolean; onChange: (can: Partial<RoleCanRow>, text: string) => void }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="flex items-center gap-1 font-semibold"><Eye size={13} />名前の小窓</span>
      {CAN_KEYS.map((c) => {
        const fromBase = !!base?.[c.key];
        const on = fromBase || !!can?.[c.key];
        return (
          <label key={c.key} className="flex items-center gap-1" title={fromBase ? '部署で付いています' : c.hint}>
            <input type="checkbox" checked={on} disabled={disabled || fromBase}
              onChange={(e) => {
                const v = e.target.checked;
                const next = { ...can, [c.key]: v };
                if (c.key === 'chat' && !v) next.summary = false;
                if (c.key === 'summary' && v) next.chat = true;
                onChange(next, `「${name}」の名前の小窓で${c.label}を${v ? '見られるように' : '見られないように'}しました`);
              }} />
            {c.label}
          </label>
        );
      })}
    </div>
  );
}

function TitleChip({ t, n, ctl }: { t: Title; n: number; ctl: Ctl }) {
  const [over, setOver] = useState(false);
  return (
    <span draggable onDragStart={(e) => e.dataTransfer.setData(DND_TITLE, t.id)}
      onDragOver={(e) => { if (hasType(e, DND_TITLE)) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.getData(DND_TITLE); if (f && f !== t.id) ctl.commit((s) => ({ ...s, titles: moveBefore(s.titles, f, t.id) }), '役職の並びを変えました', { sub: '→ 役職の選択肢の順に反映', flash: f }); }}
      className={`inline-flex cursor-grab items-center gap-1 rounded-lg border bg-soft py-1 pl-1 pr-1.5 text-sm ${ctl.flash === t.id ? 'mo-flash' : ''}`} style={{ borderColor: over ? 'var(--a)' : 'var(--color-line)' }}>
      <GripVertical size={12} className="text-faint" />
      <NameEdit label={t.label} value={t.label} onSave={(v) => ctl.commit((s) => ({ ...s, titles: s.titles.map((x) => (x.id === t.id ? { ...x, label: v } : x)) }), `役職「${t.label}」を「${v}」にしました`, { sub: `→ ${n}人の札に反映`, flash: t.id })} />
      <span className="text-xs text-faint">{n}人</span>
      <button aria-label={`${t.label}を消す`} title="消す（付いていた人は役職なしに戻る）" className="rounded p-0.5 text-faint hover:text-bad"
        onClick={() => ctl.commit((s) => ({ ...s, titles: s.titles.filter((x) => x.id !== t.id), people: Object.fromEntries(Object.entries(s.people).map(([k, a]) => [k, a.title === t.id ? { ...a, title: undefined } : a])) }), `役職「${t.label}」を消しました`, { sub: n ? `→ ${n}人は役職なしに戻りました` : '→ 選択肢から消えました' })}>
        <Trash2 size={12} />
      </button>
    </span>
  );
}

/** 部署・チームの権限（ロールのカードと同じ形）。チームは部署で持っている段階より下は選べない */
function UnitCard({ u, ctl }: { u: Unit; ctl: Ctl }) {
  const { org, commit, flash } = ctl;
  const parent = u.parent ? org.units.find((x) => x.id === u.parent) : undefined;
  const floor = parent ? unitOwnPerms(parent) : null;
  const ids = unitAndChildren(org, u.id);
  const n = ctl.people.filter((p) => ids.has(org.people[p.userId]?.unit ?? '')).length;
  const mine = unitOwnPerms(u);
  const patch = (pt: Partial<Unit>, text: string) =>
    commit((s) => ({ ...s, units: s.units.map((x) => (x.id === u.id ? { ...x, ...pt } : x)) }), text, { sub: `→ 「${u.name}」の${n}人の結果の段階に反映`, flash: u.id });
  return (
    <div className={`rounded-xl border border-line bg-surface p-4 ${flash === u.id ? 'mo-flash' : ''}`} style={parent ? { background: 'var(--color-soft)' } : undefined}>
      <div className="flex items-center gap-2">
        {parent && <span className="text-sm text-muted">{parent.name} /</span>}
        <b className="text-md">{u.name}</b>
        <span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{parent ? 'チーム' : '部署'}</span>
        <span className="text-xs text-faint">{n}人</span>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {KUBUN.map((m) => {
          const lo: Level = floor?.[m.key] ?? 'none';
          const cur: Level = atLeast(mine[m.key], lo) ? mine[m.key] : lo;
          return (
            <div key={m.key} className="flex items-center gap-3 text-sm">
              <span className="w-[100px] shrink-0 font-semibold"><span style={{ color: `var(--c-${m.mod})` }}>●</span> {m.label}</span>
              <div role="radiogroup" aria-label={`${u.name}の${m.label}`} className="inline-flex overflow-hidden rounded-lg border border-field">
                {LEVELS.map((lv) => {
                  const on = cur === lv.key;
                  const ng = !atLeast(lv.key, lo);
                  return (
                    <button key={lv.key} role="radio" aria-checked={on} disabled={ng} title={ng ? `部署「${parent?.name}」で${LEVELS.find((x) => x.key === lo)!.label}まで持っています` : lv.hint}
                      onClick={() => { if (!on) patch({ own: { ...u.own, [m.key]: lv.key as Level } }, `「${u.name}」の${m.label}を「${lv.label}」にしました`); }}
                      className="px-2.5 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                      style={on ? { background: `var(--c-${m.mod})`, color: `var(--o-${m.mod})`, fontWeight: 700 } : { background: 'var(--color-surface)' }}>{lv.label}</button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <label className="mt-1 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!u.manageAccess || !!parent?.manageAccess} disabled={!!parent?.manageAccess}
            onChange={(e) => patch({ manageAccess: e.target.checked }, `「${u.name}」の権限管理を${e.target.checked ? '付けました' : '外しました'}`)} />
          <KeyRound size={13} />権限管理ができる（組織表・ロール・権限を変えられる）{parent?.manageAccess && <span className="text-xs text-faint">（部署で付いています）</span>}
        </label>
        <CanBoxes name={u.name} can={u.can} base={parent?.can} onChange={(can, text) => patch({ can }, text)} />
      </div>
    </div>
  );
}
