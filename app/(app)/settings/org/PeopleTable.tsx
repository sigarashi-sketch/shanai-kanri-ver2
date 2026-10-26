'use client';

import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { PersonName } from '@/components/Person';
import { LEVELS, atLeast, type Level } from '@/lib/access';
import { MODULES } from '@/lib/theme';
import { legacyRoleLabel, personKind, roleOf, unitAndChildren, unitPath, unitPerms, type Assign, type OrgPerson } from '@/lib/org';
import { PermChips, type Ctl } from './shared';

const SC = 'rounded-md border border-field bg-surface px-1.5 py-1 text-sm';
type SetFn = (uid: string, patch: Partial<Assign>, text: string, sub?: string) => void;
type RowProps = { links?: Map<string, { kind: string; name: string }>; p: OrgPerson; ctl: Ctl; set: SetFn; sel: Set<string>; toggle: (id: string, on: boolean) => void; known: Set<string>; unitOpts: React.ReactNode };

// 一覧（表）。所属・役職・ロール・分類ごとの個別の段階を選ぶだけで付ける。チェックしてまとめてロール／所属。
// 要員（会社のメールでない人）はこのシステムに入れない（10-26・lib/innai.ts）＝ロール・段階は付けられず「入れない」と出す
// links＝教育（bdsh）で Google アカウントと紐づけた人（メール小文字 → 誰）。要員の名前の下に出す（10-25）
export function PeopleTable({ ctl, list, retired, links }: { ctl: Ctl; list: OrgPerson[]; retired: OrgPerson[]; links?: Map<string, { kind: string; name: string }> }) {
  const { org, commit } = ctl;
  const [fUnit, setFUnit] = useState('');
  const [fRole, setFRole] = useState('');
  const [fLegacy, setFLegacy] = useState('');
  const [onlyMk, setOnlyMk] = useState(false);
  const [openRetired, setOpenRetired] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const known = useMemo(() => new Set(org.units.map((u) => u.id)), [org.units]);
  const pass = (p: OrgPerson) => {
    const a = org.people[p.userId];
    if (fUnit === '__none') { if (a?.unit && known.has(a.unit)) return false; }
    else if (fUnit && !unitAndChildren(org, fUnit).has(a?.unit ?? '')) return false;
    if (fRole && roleOf(org, a).id !== fRole) return false;
    if (fLegacy && p.legacyRole !== fLegacy) return false;
    if (onlyMk && !p.mikeiken) return false;
    return true;
  };
  const rows = list.filter(pass);
  const oldRows = retired.filter(pass);
  const legacyRoles = Array.from(new Set([...list, ...retired].map((p) => p.legacyRole))).sort();

  const set = (uid: string, patch: Partial<Assign>, text: string, sub = '→ 組織図と結果の段階に反映') =>
    commit((s) => ({ ...s, people: { ...s.people, [uid]: { ...s.people[uid], ...patch } } }), text, { sub, flash: uid });
  const bulk = (patch: Partial<Assign>, what: string) => {
    const ids = Array.from(sel);
    commit((s) => ({ ...s, people: { ...s.people, ...Object.fromEntries(ids.map((id) => [id, { ...s.people[id], ...patch }])) } }), `${ids.length}人を${what}にしました`, { sub: '→ 一覧と組織図に反映' });
    setSel(new Set());
  };
  const unitOptions = org.units.filter((u) => !u.parent).flatMap((d) => [d, ...org.units.filter((t) => t.parent === d.id)]);
  const unitOpts = unitOptions.map((u) => <option key={u.id} value={u.id}>{u.parent ? `　└ ${u.name}` : u.name}</option>);
  const sc = SC;
  const toggle = (id: string, on: boolean) => setSel((x) => { const n = new Set(x); if (on) n.add(id); else n.delete(id); return n; });
  const rp = { links, ctl, set, sel, toggle, known, unitOpts };
  const allOn = rows.length > 0 && rows.every((p) => sel.has(p.userId));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select aria-label="部署で絞る" className={sc} value={fUnit} onChange={(e) => setFUnit(e.target.value)}>
          <option value="">部署：すべて</option><option value="__none">未所属だけ</option>{unitOpts}
        </select>
        <select aria-label="ロールで絞る" className={sc} value={fRole} onChange={(e) => setFRole(e.target.value)}>
          <option value="">ロール：すべて</option>{org.roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <select aria-label="今のシステムのロールで絞る" className={sc} value={fLegacy} onChange={(e) => setFLegacy(e.target.value)}>
          <option value="">今のシステムのロール：すべて</option>{legacyRoles.map((r) => <option key={r} value={r}>{legacyRoleLabel(r)}</option>)}
        </select>
        <label className="flex items-center gap-1"><input type="checkbox" checked={onlyMk} onChange={(e) => setOnlyMk(e.target.checked)} />未経験事業部だけ</label>
        <span className="ml-auto text-faint">{rows.length}人</span>
      </div>

      {sel.size > 0 && (
        <div className="mo-fade-up flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--a)', background: 'var(--as)' }}>
          <b>{sel.size}人を選択中</b>
          <select aria-label="まとめてロールを付ける" className={sc} value="" onChange={(e) => e.target.value && bulk({ role: e.target.value }, `「${org.roles.find((r) => r.id === e.target.value)?.label}」`)}>
            <option value="">まとめてロールを付ける…</option>{org.roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <select aria-label="まとめて所属を変える" className={sc} value="" onChange={(e) => e.target.value && bulk({ unit: e.target.value === '__none' ? undefined : e.target.value }, `「${org.units.find((u) => u.id === e.target.value)?.name ?? '未所属'}」所属`)}>
            <option value="">まとめて所属を変える…</option><option value="__none">未所属</option>{unitOpts}
          </select>
          <button onClick={() => setSel(new Set())} className="ml-auto font-semibold underline">選ぶのをやめる</button>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] border-collapse text-body">
            <thead><tr className="th-row text-left">
              <th className="px-3 py-2.5"><input type="checkbox" aria-label="表示中の全員を選ぶ" checked={allOn} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((p) => p.userId)) : new Set())} /></th>
              <th className="px-2 py-2.5 font-semibold">人</th>
              <th className="px-2 py-2.5 font-semibold">メール</th>
              <th className="px-2 py-2.5 font-semibold">今のシステムのロール</th>
              <th className="px-2 py-2.5 font-semibold">所属</th>
              <th className="px-2 py-2.5 font-semibold">役職</th>
              <th className="px-2 py-2.5 font-semibold">ロール</th>
              {MODULES.map((m) => <th key={m.key} className="px-1.5 py-2.5 font-semibold"><span style={{ color: `var(--c-${m.key})` }}>●</span> {m.short}（個別）</th>)}
              <th className="px-2 py-2.5 font-semibold">結果の段階</th>
            </tr></thead>
            <tbody>
              {rows.map((p) => <Row key={p.userId} p={p} {...rp} />)}
              {!rows.length && <tr><td colSpan={12} className="px-4 py-8 text-center text-muted">この絞り込みに当てはまる人はいません</td></tr>}
              {oldRows.length > 0 && (
                <tr className="border-t border-line"><td colSpan={12} className="px-3 py-2">
                  <button onClick={() => setOpenRetired((v) => !v)} className="flex items-center gap-1 text-sm font-semibold text-muted">
                    <ChevronRight size={14} style={{ transform: openRetired ? 'rotate(90deg)' : undefined, transition: 'transform 200ms' }} />退職（{oldRows.length}人）
                  </button>
                </td></tr>
              )}
              {openRetired && oldRows.map((p) => <Row key={p.userId} p={p} {...rp} />)}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-sm text-faint">結果の段階＝ロール・個別・所属（組織図で部署やチームに付けた権限）の一番高いもの。ロールや所属で持っている段階より下は選べません。要員（会社のメールでない人）はロールを付けてもこのシステムには入れません（基本情報フォーム・教育はこれまでどおり）。</p>
    </div>
  );
}

function Row({ p, ctl, set, sel, toggle, known, unitOpts, links }: RowProps) {
  const { org, flash } = ctl;
  const sc = SC;
    const a = org.people[p.userId] ?? {};
    const role = roleOf(org, a);
    const yoin = personKind(p) === '要員';
    const up = unitPerms(org, a.unit);
    const noEntry = <span className="chip" title="会社のメールでない人はこのシステムに入れません" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>システムに入れない</span>;
    return (
      <tr className={`row border-t border-line-soft align-middle ${flash === p.userId ? 'mo-flash' : ''}`}>
        <td className="px-3 py-2"><input type="checkbox" aria-label={`${p.name}を選ぶ`} checked={sel.has(p.userId)} onChange={(e) => toggle(p.userId, e.target.checked)} /></td>
        <td className="px-2 py-2">
          <PersonName name={p.name} />{p.isSelf && <span className="ml-1 text-xs text-muted">（あなた）</span>}
          {p.mikeiken && <span className="chip ml-1.5" style={{ background: 'var(--tone-info-bg)', color: 'var(--tone-info-fg)' }}>未経験事業部</span>}
          {links && (() => { const l = links.get(p.email.trim().toLowerCase()); return l
            ? <div className="text-xs text-muted">紐づけ：{l.name ? <><PersonName name={l.name} />（{l.kind}）</> : l.kind}</div>
            : <div className="text-xs text-faint">教育の紐づけなし</div>; })()}
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-sm text-muted"><span className="select-all">{p.email}</span></td>
        <td className="px-2 py-2"><span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }} title="今のシステムのロール（参考・ここでは変わりません）">{legacyRoleLabel(p.legacyRole)}</span></td>
        <td className="px-2 py-2">
          <select aria-label={`${p.name}の所属`} className={sc} value={a.unit && known.has(a.unit) ? a.unit : ''}
            onChange={(e) => set(p.userId, { unit: e.target.value || undefined }, `${p.name}さんを「${org.units.find((u) => u.id === e.target.value)?.name ?? '未所属'}」にしました`)}>
            <option value="">未所属</option>{unitOpts}
          </select>
        </td>
        <td className="px-2 py-2">
          <select aria-label={`${p.name}の役職`} className={sc} value={a.title ?? ''}
            onChange={(e) => set(p.userId, { title: e.target.value || undefined }, `${p.name}さんの役職を「${org.titles.find((t) => t.id === e.target.value)?.label ?? 'なし'}」にしました`, '→ 組織図の札に反映')}>
            <option value="">なし</option>{org.titles.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </td>
        {yoin ? <td colSpan={MODULES.length + 1} className="px-2 py-2">{noEntry}</td> : <>
        <td className="px-2 py-2">
          <select aria-label={`${p.name}のロール`} className={sc} value={role.id}
            onChange={(e) => set(p.userId, { role: e.target.value }, `${p.name}さんを「${org.roles.find((r) => r.id === e.target.value)?.label}」にしました`)}>
            {org.roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </td>
        {MODULES.map((m) => {
          const fromUnit = up[m.key];
          const floor = atLeast(role.perms[m.key], fromUnit) ? role.perms[m.key] : fromUnit;
          const why = atLeast(role.perms[m.key], fromUnit) ? `ロール「${role.label}」` : `所属「${unitPath(org, a.unit)}」`;
          const own = a.own?.[m.key] ?? 'none';
          return (
            <td key={m.key} className="px-1.5 py-2">
              <select aria-label={`${p.name}の${m.short}の個別の段階`} className={sc} value={atLeast(own, floor) ? own : floor}
                title={floor !== 'none' ? `${why}で${LEVELS.find((l) => l.key === floor)!.label}まで持っています` : '個別に付ける段階'}
                onChange={(e) => set(p.userId, { own: { ...a.own, [m.key]: e.target.value as Level } }, `${p.name}さんの${m.short}を「${LEVELS.find((l) => l.key === e.target.value)!.label}」にしました`)}>
                {LEVELS.map((l) => <option key={l.key} value={l.key} disabled={!atLeast(l.key, floor)}>{l.label}</option>)}
              </select>
            </td>
          );
        })}
        </>}
        <td className="px-2 py-2">{yoin ? noEntry : <PermChips org={org} userId={p.userId} />}</td>
      </tr>
    );
  }
