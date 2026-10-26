'use client';

import { useState } from 'react';
import { Check, Lock, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Card, HoryuFrame, Msg, horyuPost, inputCls, useHoryu } from '@/components/horyu/kit';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';

// ロール別ページ表示（保留・10-25）。今の /page-access.html と同じ表：ページ × ロールで「出す／出さない」。
//   ・全体管理者だけ（今のシステムが 403 を返せば何も出さない）。super_admin 固定の行は変えられない
//   ・押すと今の /api/page-access?action=set（上書き）。上書きしているマスは「既定に戻す」で外せる
//   ・ロールを足す・名前を変える・消す（今の createRole / renameRole / deleteRole）。どれも確認の窓を出してから（10-26）
type PageDef = { key: string; title: string; section: string; lock?: string; kind?: string };
type Role = { role: string; label: string; custom: boolean; base?: string; baseLabel?: string };
type Cell = { value: boolean; overridden: boolean; def: boolean };
type Matrix = { pages: PageDef[]; roles: Role[]; cells: Record<string, Record<string, Cell>>; counts: Record<string, number>; needsMigration?: boolean; customReady?: boolean; bases?: { role: string; label: string }[] };

export default function PageAccessPage() {
  const r = useHoryu<Matrix>('page-access');
  const m = r.data;
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const sections = m ? [...new Set(m.pages.map((p) => p.section))] : [];
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newBase, setNewBase] = useState('');
  const bases = m?.bases ?? (m?.roles ?? []).filter((x) => !x.custom).map((x) => ({ role: x.role, label: x.label }));

  // ロールの作成・名前変更・削除。確認の窓 → 今のシステム（super_admin だけ通る）
  const roleOp = (spec: { title: string; lines: string[]; okLabel: string; danger?: boolean; body: Record<string, string>; done: string }) => {
    setConfirm({
      title: spec.title, lines: spec.lines, okLabel: spec.okLabel, danger: spec.danger,
      run: async () => {
        const res = await horyuPost('page-access-role', spec.body);
        if (!res.ok) throw new Error(res.error);
        setMsg({ text: spec.done });
        void r.reload();
      },
    });
  };
  const addRole = () => {
    const label = newLabel.trim().replace(/\s+/g, ' ').slice(0, 30);
    const base = bases.find((b) => b.role === newBase);
    if (!label || !base) { setMsg({ text: 'ロールの名前と土台のロールを選んでください', bad: true }); return; }
    roleOp({
      title: `ロール「${label}」を足す`, okLabel: '足す',
      lines: [`土台：${base.label}（表の値は土台のロールの今の値から始まります）`, '人への付け方は「ユーザー・権限」で。ロールの許可で守っている口は土台のロールのまま判定されます'],
      body: { op: 'create', label, base: base.role }, done: `ロール「${label}」を足しました`,
    });
    setNewLabel('');
  };
  const renameRole = (ro: Role) => {
    const label = window.prompt(`「${ro.label}」の新しい名前（30文字まで）`, ro.label)?.trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!label || label === ro.label) return;
    roleOp({ title: 'ロールの名前を変える', okLabel: '変える', lines: [`「${ro.label}」→「${label}」`, '付いている人・表の値は変わりません'], body: { op: 'rename', role: ro.role, label }, done: `ロールの名前を「${label}」にしました` });
  };
  const deleteRole = (ro: Role) => roleOp({
    title: `ロール「${ro.label}」を消す`, okLabel: '消す', danger: true,
    lines: [`付いている ${m?.counts[ro.role] ?? 0}人は土台のロール（${ro.baseLabel || ro.base || '—'}）の見え方に戻ります`, 'このロールの表の値（上書き）も消えます。元に戻せません'],
    body: { op: 'delete', role: ro.role }, done: `ロール「${ro.label}」を消しました`,
  });

  const set = async (p: PageDef, role: Role, visible: boolean | null) => {
    if (!m) return;
    const label = `${p.title} を ${role.label} に${visible === null ? '既定に戻しました' : visible ? '出すようにしました' : '出さないようにしました'}`;
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
      {m && m.customReady !== false && (
        <Card title="ロールを足す" note="土台のロールから始めて、表で画面ごとに変えられます">
          <div className="flex flex-wrap items-end gap-2 px-4 pb-4 text-sm text-muted">
            <label className="flex flex-col gap-1">名前<input value={newLabel} maxLength={30} onChange={(e) => setNewLabel(e.target.value)} className={`${inputCls} w-[200px]`} placeholder="例：営業リーダー" /></label>
            <label className="flex flex-col gap-1">土台のロール<select value={newBase} onChange={(e) => setNewBase(e.target.value)} className={inputCls}><option value="">選ぶ</option>{bases.map((b) => <option key={b.role} value={b.role}>{b.label}</option>)}</select></label>
            <button onClick={addRole} disabled={!newLabel.trim() || !newBase} className="btn-primary"><Plus size={14} />足す</button>
          </div>
        </Card>
      )}
      {m && sections.map((sec, si) => (
        <Card key={sec} title={sec} i={si + 1}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body" style={{ minWidth: 240 + m.roles.length * 96 }}>
              <thead><tr className="th-row"><th className="sticky left-0 bg-inherit px-3 py-2.5 text-left font-semibold">画面</th>{m.roles.map((ro) => (
                <th key={ro.role} className="px-2 py-2.5 text-center font-semibold">{ro.label}
                  <div className="text-xs font-normal text-faint">{m.counts[ro.role] ?? 0}人{ro.custom && ro.baseLabel ? `・土台 ${ro.baseLabel}` : ''}</div>
                  {ro.custom && <div className="mt-0.5 inline-flex gap-0.5">
                    <button onClick={() => renameRole(ro)} title="名前を変える" aria-label={`${ro.label} の名前を変える`} className="rounded p-1 text-faint"><Pencil size={12} /></button>
                    <button onClick={() => deleteRole(ro)} title="ロールを消す" aria-label={`${ro.label} を消す`} className="rounded p-1 text-faint"><Trash2 size={12} /></button>
                  </div>}
                </th>
              ))}</tr></thead>
              <tbody>
                {m.pages.filter((p) => p.section === sec).map((p) => (
                  <tr key={p.key} className="border-t border-line-soft">
                    <td className="sticky left-0 bg-surface px-3 py-2">{p.title}{p.lock === 'super' && <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-faint"><Lock size={10} />全体管理者だけ</span>}</td>
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
      <p className="text-sm text-muted">枠の色がついたマスは既定から変えたもの。足したロールは見出しの鉛筆で名前を変え、ごみ箱で消せます。</p>
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
    </HoryuFrame>
  );
}
