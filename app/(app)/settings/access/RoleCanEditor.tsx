'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useMotivation } from '@/components/Motivation';
import { SAVED_SHARED, saveShared, type SharedLoad } from '@/lib/org';
import { CAN_KEYS, LOGIN_ROLES, normRoleCan, type CanKey, type RoleCan } from '@/lib/role-can';

// 名前の小窓で、ロールごとに見られる中身・押せるボタン（10-25 shoya「押せるのはロールで決める」）。
//   ロールはログインのロール（今の社内システムと同じ）。押したらすぐ全員の設定に保存（全体管理者だけ）。
//   全体管理者の行は外せない。チャットを外すと要約も押せなくなる（中身を見られないものは要約もしない）
export function RoleCanEditor({ shared }: { shared: SharedLoad }) {
  const { toast, hit } = useMotivation();
  const [table, setTable] = useState<RoleCan>(() => normRoleCan(null));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (shared.state === 'live') setTable(normRoleCan(shared.value?.roleCan)); }, [shared]);
  const editable = shared.state === 'live' && shared.canSave;

  const flip = async (role: string, key: CanKey) => {
    if (!editable || busy || role === 'super_admin') return;
    const before = table;
    const on = !table[role][key];
    const row = { ...table[role], [key]: on };
    if (key === 'chat' && !on) row.summary = false;
    if (key === 'summary' && on) row.chat = true;
    const next = { ...table, [role]: row };
    setTable(next); setBusy(true);
    const r = await saveShared('roleCan', next);
    setBusy(false);
    if (!r.ok) { setTable(before); toast({ text: r.error || '保存できませんでした' }); return; }
    hit();
    const rl = LOGIN_ROLES.find((x) => x.key === role)?.label ?? role, kl = CAN_KEYS.find((x) => x.key === key)?.label ?? key;
    toast({ text: `${rl}：${kl}を${on ? '出す' : '出さない'}にしました`, sub: `→ ${SAVED_SHARED}。次に名前を押したときから反映` });
  };

  return (
    <section className="mo-fade-up rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 1 }}>
      <div className="px-5 py-3.5">
        <h2 className="text-md font-bold">名前の小窓で見られるもの（ロールごと）</h2>
        <p className="text-sm text-muted">
          ログインのロールごとに、チャット・要約・基本情報・単価額面を出すかを決めます。
          {editable ? '押すとすぐ全員に効きます。' : shared.state === 'live' ? '変えられるのは全体管理者だけです（いまの表を見るだけ）。' : 'ログインすると今の表が出ます（いまは初めの値）。'}
        </p>
      </div>
      <div className="overflow-x-auto border-t border-line-soft">
        <table className="w-full min-w-[560px] text-body">
          <thead><tr className="text-left text-sm text-muted">
            <th className="px-5 py-2 font-semibold">ロール</th>
            {CAN_KEYS.map((c) => <th key={c.key} className="px-3 py-2 text-center font-semibold" title={c.hint}>{c.label}</th>)}
          </tr></thead>
          <tbody>
            {LOGIN_ROLES.map((r) => (
              <tr key={r.key} className="border-t border-line-soft">
                <td className="px-5 py-2"><b>{r.label}</b><span className="ml-2 text-xs text-muted">{r.key}</span></td>
                {CAN_KEYS.map((c) => {
                  const on = table[r.key][c.key], fixed = r.key === 'super_admin';
                  return (
                    <td key={c.key} className="px-3 py-1.5 text-center">
                      <button type="button" role="switch" aria-checked={on} aria-label={`${r.label}の${c.label}`} onClick={() => flip(r.key, c.key)}
                        disabled={!editable || fixed || busy}
                        className="inline-flex size-8 items-center justify-center rounded-lg border disabled:cursor-default"
                        style={on ? { borderColor: 'var(--a)', background: 'var(--as)', color: 'var(--ad)' } : { borderColor: 'var(--color-field)', color: 'var(--color-muted)' }}>
                        {on ? <Check size={16} strokeWidth={3} /> : <span aria-hidden>—</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-5 py-2 text-xs text-muted">健康状況はどのロールにも出しません。表に無いロール（専用ページだけのロール）は何も見られません。</p>
    </section>
  );
}
