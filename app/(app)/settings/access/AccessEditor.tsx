'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { atLeast, canUseApp, effectivePerms, LEVELS, ROLES, type Level, type Member, type RoleKey } from '@/lib/access';
import { MODULES } from '@/lib/theme';
import { PageTitle } from '@/components/ui';
import { useMotivation } from '@/components/Motivation';

// 人ごとに「ロール」と「分類ごとの段階」を付ける。
//   実際の段階＝ロールの段階と個別の段階の高いほう。ロールで既に持っている段階より下は選べない（灰色）。
//   何も付いていない分類は「見ない」＝その人のメニューに出ない。
export function AccessEditor({ initial, meId }: { initial: Member[]; meId: string }) {
  const router = useRouter();
  const { toast, hit } = useMotivation();
  const [members, setMembers] = useState(initial);
  const [shake, setShake] = useState<string | null>(null);

  type Patch = { role?: RoleKey; own?: Member['own'] };
  const put = async (id: string, patch: Patch, msg: string, back?: Patch) => {
    // 失敗したときは、この人だけ元に戻す（ほかの人への変更は消さない）
    const beforeM = members.find((m) => m.id === id)!;
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, ...(patch.role ? { role: patch.role } : {}), own: { ...m.own, ...(patch.own || {}) } } : m)));
    const r = await fetch('/api/members', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }) });
    if (!r.ok) {
      setMembers((ms) => ms.map((m) => (m.id === id ? beforeM : m)));
      setShake(id); setTimeout(() => setShake(null), 400);
      toast({ text: (await r.json().catch(() => ({}))).error || '保存できませんでした' });
      return;
    }
    hit();
    toast({ text: msg, sub: '→ その人のメニューとボタンに、次に開いたときから反映', undo: back ? () => { void put(id, back, `${beforeM.name}を元に戻しました`); } : undefined });
    router.refresh();
  };

  return (
    <main className="flex flex-col gap-4 px-6 pb-12 pt-[22px]">
      <PageTitle title="権限管理" sub="入れるのは未経験事業部の内勤だけ（それ以外は営業共有リストだけ）。内勤の中は分類ごとに 見ない／見る／直す／承認" />

      <section className="mo-fade-up grid gap-3 md:grid-cols-4" style={{ ['--i' as string]: 1 }}>
        {(Object.keys(ROLES) as RoleKey[]).map((k) => (
          <div key={k} className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="text-[13.5px] font-bold">{ROLES[k].label}</div>
            <div className="text-[12px] text-muted">{ROLES[k].hint}</div>
          </div>
        ))}
      </section>

      <section className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-[13px]">
            <thead><tr className="bg-soft text-left text-muted">
              <th className="px-4 py-2.5 font-semibold">人</th>
              <th className="px-2 py-2.5 font-semibold">ロール</th>
              {MODULES.map((m) => <th key={m.key} className="px-2 py-2.5 font-semibold"><span style={{ color: `var(--c-${m.key})` }}>●</span> {m.label}</th>)}
            </tr></thead>
            <tbody>
              {members.map((m, i) => {
                const inside = canUseApp(m);
                const eff = effectivePerms(m);
                const floor = ROLES[m.role].perms;
                return (
                  <tr key={m.id} className={`mo-fade-in border-t border-line-soft align-top ${shake === m.id ? 'mo-shake' : ''}`} style={{ ['--i' as string]: i + 3 }}>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{m.name}{m.id === meId && <span className="ml-1.5 text-[11px] text-muted">（あなた）</span>}</div>
                      <div className="text-[11.5px] text-faint">{m.division}・{m.kind}</div>
                    </td>
                    {inside ? (
                      <>
                        <td className="px-2 py-3">
                          <select aria-label={`${m.name}のロール`} value={m.role} onChange={(e) => put(m.id, { role: e.target.value as RoleKey }, `${m.name}を「${ROLES[e.target.value as RoleKey].label}」にしました`, { role: m.role })}
                            className="rounded-lg border border-field bg-surface px-2 py-1.5 text-[13px]">
                            {(Object.keys(ROLES) as RoleKey[]).map((k) => <option key={k} value={k}>{ROLES[k].label}</option>)}
                          </select>
                        </td>
                        {MODULES.map((mod) => (
                          <td key={mod.key} className="px-2 py-3">
                            <div role="radiogroup" aria-label={`${m.name}の${mod.label}`} className="inline-flex overflow-hidden rounded-lg border border-field">
                              {LEVELS.map((lv) => {
                                const on = eff[mod.key] === lv.key;
                                const belowRole = !atLeast(lv.key, floor[mod.key]) ;
                                return (
                                  <button key={lv.key} role="radio" aria-checked={on} disabled={belowRole}
                                    title={belowRole ? `ロール「${ROLES[m.role].label}」で${LEVELS.find((x) => x.key === floor[mod.key])!.label}まで持っています` : lv.hint}
                                    onClick={() => { if (!on) put(m.id, { own: { [mod.key]: lv.key as Level } }, `${m.name}の${mod.label}を「${lv.label}」にしました`, { own: { [mod.key]: m.own[mod.key] ?? 'none' } }); }}
                                    className="whitespace-nowrap px-2 py-1.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-35"
                                    style={on ? { background: `var(--c-${mod.key})`, color: `var(--o-${mod.key})`, fontWeight: 700 } : { background: 'var(--color-surface)' }}>
                                    {lv.label}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        ))}
                      </>
                    ) : (
                      <td colSpan={5} className="px-2 py-3 text-[12.5px] text-muted">内勤ではないので <b>営業共有リストだけ</b>（ここでは変えられません）</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-[12px] text-faint">見本の名簿です。本物のログインと名簿をつないだら、未経験事業部の内勤かどうかは名簿から自動で決まります。</p>
    </main>
  );
}
