'use client';

import { useState } from 'react';
import { Check, Lock, RotateCcw } from 'lucide-react';
import { Card, HoryuFrame, Msg, horyuPost, useHoryu } from '@/components/horyu/kit';

// ロール別ページ表示（保留・10-25）。今の /page-access.html と同じ表：ページ × ロールで「出す／出さない」。
//   ・全体管理者だけ（今のシステムが 403 を返せば何も出さない）。super_admin 固定の行は変えられない
//   ・押すと今の /api/page-access?action=set（上書き）。上書きしているマスは「既定に戻す」で外せる
type PageDef = { key: string; title: string; section: string; lock?: string; kind?: string };
type Role = { role: string; label: string; custom: boolean };
type Cell = { value: boolean; overridden: boolean; def: boolean };
type Matrix = { pages: PageDef[]; roles: Role[]; cells: Record<string, Record<string, Cell>>; counts: Record<string, number>; needsMigration?: boolean };

const S: Matrix = {
  pages: [{ key: 'proper', title: 'プロパーリスト', section: '営業' }, { key: 'arari-sim', title: '粗利試算', section: '案件' }, { key: 'ops-log', title: '操作ログ', section: '管理' }, { key: 'page-access', title: 'ロール別ページ表示', section: '管理', lock: 'super' }],
  roles: [{ role: 'admin', label: '管理者', custom: false }, { role: 'sales_admin', label: '営業管理', custom: false }, { role: 'staff_sales', label: '営業', custom: false }],
  cells: {
    proper: { admin: { value: true, overridden: false, def: true }, sales_admin: { value: true, overridden: false, def: true }, staff_sales: { value: true, overridden: false, def: true } },
    'arari-sim': { admin: { value: true, overridden: false, def: true }, sales_admin: { value: true, overridden: false, def: true }, staff_sales: { value: false, overridden: true, def: true } },
    'ops-log': { admin: { value: true, overridden: false, def: true }, sales_admin: { value: false, overridden: false, def: false }, staff_sales: { value: false, overridden: false, def: false } },
    'page-access': { admin: { value: false, overridden: false, def: false }, sales_admin: { value: false, overridden: false, def: false }, staff_sales: { value: false, overridden: false, def: false } },
  },
  counts: { admin: 3, sales_admin: 2, staff_sales: 6 },
};

export default function PageAccessPage() {
  const r = useHoryu<Matrix>('page-access');
  const sample = r.state === 'sample';
  const [local, setLocal] = useState<Matrix>(S);
  const m = sample ? local : r.data;
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const sections = m ? [...new Set(m.pages.map((p) => p.section))] : [];

  const set = async (p: PageDef, role: Role, visible: boolean | null) => {
    if (!m) return;
    const label = `${p.title} を ${role.label} に${visible === null ? '既定に戻しました' : visible ? '出すようにしました' : '出さないようにしました'}`;
    if (sample) {
      const c = m.cells[p.key][role.role];
      setLocal({ ...m, cells: { ...m.cells, [p.key]: { ...m.cells[p.key], [role.role]: visible === null ? { ...c, value: c.def, overridden: false } : { ...c, value: visible, overridden: visible !== c.def } } } });
      setMsg({ text: `見本なので保存はしていません（${label}）` }); return;
    }
    setBusy(`${p.key}|${role.role}`);
    const res = await horyuPost('page-access-set', { role: role.role, key: p.key, visible });
    setBusy('');
    setMsg(res.ok ? { text: label } : { text: res.error, bad: true });
    if (res.ok) void r.reload();
  };

  return (
    <HoryuFrame title="ロール別ページ表示" sub="どのロールに、どの画面を出すか（全体管理者だけ）" state={r.state} error={r.error} onReload={r.reload}>
      {m?.needsMigration && <Msg text="今のシステムに表がまだありません" bad />}
      <Msg text={msg.text} bad={msg.bad} />
      {m && sections.map((sec, si) => (
        <Card key={sec} title={sec} i={si + 1}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]" style={{ minWidth: 240 + m.roles.length * 96 }}>
              <thead><tr className="th-row"><th className="sticky left-0 bg-inherit px-3 py-2.5 text-left font-semibold">画面</th>{m.roles.map((ro) => <th key={ro.role} className="px-2 py-2.5 text-center font-semibold">{ro.label}<div className="text-[10.5px] font-normal text-faint">{m.counts[ro.role] ?? 0}人</div></th>)}</tr></thead>
              <tbody>
                {m.pages.filter((p) => p.section === sec).map((p) => (
                  <tr key={p.key} className="border-t border-line-soft">
                    <td className="sticky left-0 bg-surface px-3 py-2">{p.title}{p.lock === 'super' && <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] text-faint"><Lock size={10} />全体管理者だけ</span>}</td>
                    {m.roles.map((ro) => {
                      const c = m.cells[p.key]?.[ro.role];
                      if (!c) return <td key={ro.role} />;
                      const locked = p.lock === 'super';
                      return (
                        <td key={ro.role} className="px-2 py-1.5 text-center">
                          <div className="inline-flex items-center gap-0.5">
                            <button disabled={locked || busy === `${p.key}|${ro.role}`} onClick={() => set(p, ro, !c.value)} aria-pressed={c.value} aria-label={`${p.title}・${ro.label}`}
                              className="flex size-8 items-center justify-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-40"
                              style={{ borderColor: c.overridden ? 'var(--a)' : 'var(--color-line)', background: c.value ? 'var(--al)' : 'transparent' }}>
                              {c.value && <Check size={15} strokeWidth={3} style={{ color: 'var(--ad)' }} />}
                            </button>
                            {c.overridden && !locked && <button onClick={() => set(p, ro, null)} title="既定に戻す" aria-label={`${p.title}・${ro.label} を既定に戻す`} className="rounded p-1 text-faint"><RotateCcw size={12} /></button>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
      <p className="text-[12px] text-muted">枠の色がついたマスは既定から変えたもの。ロールを足す・名前を変えるのは今の画面から。</p>
    </HoryuFrame>
  );
}
