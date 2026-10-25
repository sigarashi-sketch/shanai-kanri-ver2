'use client';

import { useState } from 'react';
import { GripVertical, KeyRound, Trash2 } from 'lucide-react';
import { LEVELS, type Level } from '@/lib/access';
import { MODULES } from '@/lib/theme';
import { moveBefore, newId, NO_ROLE, type OrgRole, type Title } from '@/lib/org';
import { AddName, DND_ROLE, DND_TITLE, hasType, NameEdit, type Ctl } from './shared';

// ロールの定義（4分類 × 見ない/見る/直す/承認 ＋ 権限管理ができる）と、役職の選択肢。どちらもドラッグで並び替え。
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
          <AddName placeholder="ロールの名前" onAdd={(v) => { const id = newId('r'); commit((s) => ({ ...s, roles: [...s.roles, { id, label: v, perms: { jinji: 'none', roumu: 'none', eigyo: 'none', keiri: 'none' }, manageAccess: false }] }), `ロール「${v}」を作りました`, { sub: '→ 段階を選んで、一覧で人に付けられます', flash: id }); }} />
        </div>
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
        {MODULES.map((m) => (
          <div key={m.key} className="flex items-center gap-3 text-sm">
            <span className="w-[72px] font-semibold"><span style={{ color: `var(--c-${m.key})` }}>●</span> {m.short}</span>
            <div role="radiogroup" aria-label={`${r.label}の${m.short}`} className="inline-flex overflow-hidden rounded-lg border border-field">
              {LEVELS.map((lv) => {
                const on = r.perms[m.key] === lv.key;
                return (
                  <button key={lv.key} role="radio" aria-checked={on} title={lv.hint} disabled={fixed}
                    onClick={() => { if (!on) patchRole(r.id, { perms: { ...r.perms, [m.key]: lv.key as Level } }, `「${r.label}」の${m.short}を「${lv.label}」にしました`); }}
                    className="px-2.5 py-1 text-sm disabled:cursor-not-allowed"
                    style={on ? { background: `var(--c-${m.key})`, color: `var(--o-${m.key})`, fontWeight: 700 } : { background: 'var(--color-surface)' }}>{lv.label}</button>
                );
              })}
            </div>
          </div>
        ))}
        <label className="mt-1 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={r.manageAccess} disabled={fixed} onChange={(e) => patchRole(r.id, { manageAccess: e.target.checked }, `「${r.label}」の権限管理を${e.target.checked ? '付けました' : '外しました'}`)} />
          <KeyRound size={13} />権限管理ができる（組織表・ロール・権限を変えられる）
        </label>
      </div>
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
