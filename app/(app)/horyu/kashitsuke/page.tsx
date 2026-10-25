'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { PersonName } from '@/components/Person';
import { Card, HoryuFrame, Msg, btnCls, horyuPost, inputCls, tdCls, thCls, useHoryu, yen } from '@/components/horyu/kit';

// 貸付管理（保留・10-25）。今の /kashitsuke.html と同じ中身。
//   ・開けるのは今のシステムが許した人だけ（requireKashitsuke：個別に許した人と全体管理者）。それ以外は 403＝何も出さない
//   ・書く口は今の /api/kashitsuke の決まった操作だけ（足す・直す・回収の確認・返済予定 など）。貼り付けの取り込みは今の画面から
type Rep = { id: string; loan_id: string; due_on: string; amount: number; method: string; paid_on: string | null; paid_amount: number | null; memo: string };
type Sum = { planned: number; paid: number; remaining: number; overdue: number; overdueCount: number; overdueDays: number; nextDue: string; nextAmount: number; noSchedule: boolean; unplanned: number };
type Loan = { id: string; kind: string; company: string; name: string; amount: number; contract: string; lent_on: string | null; due_on: string | null; transfer: string; uriage_memo: string; status: string; memo: string; reps: Rep[]; sum: Sum; flag: string };

const KIND: Record<string, string> = { maebarai: '前払い', kashitsuke: '金銭貸付' };
const METHOD: Record<string, string> = { tenbiki: '天引き', furikomi: '振込', tewatashi: '手渡し' };
const STATUS: Record<string, string> = { open: '回収中', done: '完了', waived: '徴収不要' };
const FLAG: Record<string, string> = { taisha: '退社', taisha_yotei: '退社予定', kyushoku: '休職', taijou: '退場', taiki: '待機', unknown: '名簿に見つからない' };

const today = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const S_ROWS: Loan[] = [
  { id: 's1', kind: 'kashitsuke', company: '本社', name: '佐藤 健太', amount: 100000, contract: '有', lent_on: '2026-08-10', due_on: null, transfer: '振込済', uriage_memo: '', status: 'open', memo: '',
    reps: [{ id: 'r1', loan_id: 's1', due_on: '2026-09-30', amount: 20000, method: 'tenbiki', paid_on: '2026-09-30', paid_amount: 20000, memo: '' }, { id: 'r2', loan_id: 's1', due_on: '2026-10-31', amount: 20000, method: 'tenbiki', paid_on: null, paid_amount: null, memo: '' }],
    sum: { planned: 100000, paid: 20000, remaining: 80000, overdue: 0, overdueCount: 0, overdueDays: 0, nextDue: '2026-10-31', nextAmount: 20000, noSchedule: false, unplanned: 60000 }, flag: '' },
  { id: 's2', kind: 'maebarai', company: '本社', name: '高橋 健', amount: 50000, contract: '', lent_on: '2026-10-05', due_on: '2026-10-25', transfer: '手渡し', uriage_memo: '', status: 'open', memo: '',
    reps: [{ id: 'r3', loan_id: 's2', due_on: '2026-10-25', amount: 50000, method: 'tenbiki', paid_on: null, paid_amount: null, memo: '' }],
    sum: { planned: 50000, paid: 0, remaining: 50000, overdue: 0, overdueCount: 0, overdueDays: 0, nextDue: '2026-10-25', nextAmount: 50000, noSchedule: false, unplanned: 0 }, flag: 'taiki' },
];

type View = 'open' | 'all' | 'deleted';

export default function KashitsukePage() {
  const [view, setView] = useState<View>('open');
  const r = useHoryu<{ rows: Loan[]; today: string }>('kashitsuke', { deleted: view === 'deleted' ? 1 : undefined });
  const sample = r.state === 'sample';
  const [open, setOpen] = useState('');
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const all = sample ? S_ROWS : r.data?.rows ?? [];
  const rows = view === 'open' ? all.filter((l) => l.status === 'open') : all;
  const totalRemain = rows.reduce((s, l) => s + (l.status === 'open' ? l.sum.remaining : 0), 0);
  const totalOver = rows.reduce((s, l) => s + l.sum.overdue, 0);

  const act = async (body: Record<string, unknown>, done: string) => {
    if (sample) { setMsg({ text: `見本なので保存はしていません（${done}）` }); return false; }
    const res = await horyuPost('kashitsuke', body);
    setMsg(res.ok ? { text: done } : { text: res.error, bad: true });
    if (res.ok) void r.reload();
    return res.ok;
  };

  return (
    <HoryuFrame title="貸付管理" sub="前払い・金銭貸付と、その回収（天引き・振込・手渡し）" state={r.state} error={r.error} onReload={r.reload}
      actions={<button onClick={() => setAdding(!adding)} className="btn-primary"><Plus size={15} />貸付を足す</button>}>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface px-4 py-3"><div className="text-sm text-muted">回収の残り</div><div className="num text-xl font-bold">{yen(totalRemain)}</div></div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3"><div className="text-sm text-muted">期日を過ぎた分</div><div className="num text-xl font-bold" style={{ color: totalOver ? 'var(--tone-bad-fg)' : undefined }}>{yen(totalOver)}</div></div>
        <label className="flex flex-col justify-center gap-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">見るもの
          <select value={view} onChange={(e) => setView(e.target.value as View)} className={inputCls}><option value="open">回収中</option><option value="all">すべて</option><option value="deleted">削除ずみ</option></select>
        </label>
      </div>
      <Msg text={msg.text} bad={msg.bad} />
      {adding && <AddForm onSave={async (b) => { const ok = await act({ action: 'add', ...b }, `${b.name} の貸付を足しました`); if (ok || sample) setAdding(false); }} />}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-body">
            <thead><tr className="th-row"><th className={thCls} /><th className={thCls}>氏名</th><th className={thCls}>種別</th><th className={`${thCls} text-right`}>貸した額</th><th className={`${thCls} text-right`}>残り</th><th className={thCls}>次の期日</th><th className={thCls}>遅れ</th><th className={thCls}>状態</th></tr></thead>
            <tbody>
              {rows.map((l) => (
                <Fragment key={l.id}>
                  <tr className="row border-t border-line-soft">
                    <td className="pl-3"><button aria-label="中身を開く" aria-expanded={open === l.id} onClick={() => setOpen(open === l.id ? '' : l.id)} className="rounded p-1 text-muted">{open === l.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button></td>
                    <td className={tdCls}><PersonName name={l.name} />{l.flag && <span className="chip ml-1.5" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>{FLAG[l.flag] ?? l.flag}</span>}<div className="text-xs text-faint">{l.company}</div></td>
                    <td className={tdCls}>{KIND[l.kind] ?? l.kind}<div className="text-xs text-faint">{l.lent_on}</div></td>
                    <td className={`${tdCls} num text-right`}>{yen(l.amount)}</td>
                    <td className={`${tdCls} num text-right font-semibold`}>{l.status === 'open' ? yen(l.sum.remaining) : '—'}</td>
                    <td className={`${tdCls} num`}>{l.sum.noSchedule ? <span className="text-warn">返済予定なし</span> : l.sum.nextDue ? `${l.sum.nextDue}・${yen(l.sum.nextAmount)}` : '—'}</td>
                    <td className={tdCls}>{l.sum.overdueCount ? <span style={{ color: 'var(--tone-bad-fg)' }}>{l.sum.overdueCount}回・{l.sum.overdueDays}日</span> : <span className="text-faint">なし</span>}</td>
                    <td className={tdCls}>
                      <select value={l.status} onChange={(e) => act({ action: 'update', id: l.id, status: e.target.value }, `${l.name} を「${STATUS[e.target.value]}」にしました`)} className={inputCls} aria-label="状態" disabled={view === 'deleted'}>
                        {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                  </tr>
                  {open === l.id && <tr><td colSpan={8} className="bg-soft px-4 py-3"><LoanDetail loan={l} deleted={view === 'deleted'} act={act} /></td></tr>}
                </Fragment>
              ))}
              {r.state !== 'loading' && !rows.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">ありません</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </HoryuFrame>
  );
}

function AddForm({ onSave }: { onSave: (b: Record<string, string>) => void }) {
  const [f, setF] = useState<Record<string, string>>({ kind: 'kashitsuke', lent_on: today(), contract: '', transfer: '' });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title="貸付を足す" note="前払いは本来の支給日に全額を天引きする1行を自動で作ります">
      <div className="flex flex-wrap items-end gap-2 px-4 pb-4 text-sm text-muted">
        <label className="flex flex-col gap-1">種別<select value={f.kind} onChange={set('kind')} className={inputCls}><option value="kashitsuke">金銭貸付</option><option value="maebarai">前払い</option></select></label>
        <label className="flex flex-col gap-1">氏名<input value={f.name || ''} onChange={set('name')} className={`${inputCls} w-[140px]`} /></label>
        <label className="flex flex-col gap-1">所属<input value={f.company || ''} onChange={set('company')} className={`${inputCls} w-[110px]`} /></label>
        <label className="flex flex-col gap-1">金額<input value={f.amount || ''} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d]/g, '') })} inputMode="numeric" className={`${inputCls} num w-[110px]`} /></label>
        <label className="flex flex-col gap-1">貸した日<input type="date" value={f.lent_on || ''} onChange={set('lent_on')} className={inputCls} /></label>
        {f.kind === 'maebarai' && <label className="flex flex-col gap-1">本来の支給日<input type="date" value={f.due_on || ''} onChange={set('due_on')} className={inputCls} /></label>}
        <label className="flex flex-col gap-1">契約書<select value={f.contract} onChange={set('contract')} className={inputCls}><option value="">—</option><option>有</option><option>無</option></select></label>
        <label className="flex flex-col gap-1">渡し方<select value={f.transfer} onChange={set('transfer')} className={inputCls}><option value="">—</option><option>予約済</option><option>振込済</option><option>手渡し</option></select></label>
        <button className="btn-primary" disabled={!f.name?.trim() || !Number(f.amount)} onClick={() => onSave(f)}>足す</button>
      </div>
    </Card>
  );
}

function LoanDetail({ loan, deleted, act }: { loan: Loan; deleted: boolean; act: (b: Record<string, unknown>, done: string) => Promise<boolean> }) {
  const [sch, setSch] = useState<Record<string, string>>({ count: '5', method: 'tenbiki' });
  const [one, setOne] = useState<Record<string, string>>({ method: 'tenbiki' });
  return (
    <div className="flex flex-col gap-3 text-sm">
      <table className="w-full max-w-[720px]">
        <thead><tr className="text-left text-muted"><th className="py-1 pr-2">期日</th><th className="py-1 pr-2 text-right">額</th><th className="py-1 pr-2">方法</th><th className="py-1 pr-2">回収</th><th className="py-1" /></tr></thead>
        <tbody>
          {loan.reps.map((p) => (
            <tr key={p.id} className="border-t border-line-soft">
              <td className="num py-1.5 pr-2" style={{ color: !p.paid_on && p.due_on < today() ? 'var(--tone-bad-fg)' : undefined }}>{p.due_on}</td>
              <td className="num py-1.5 pr-2 text-right">{yen(p.amount)}</td>
              <td className="py-1.5 pr-2">{METHOD[p.method] ?? p.method}</td>
              <td className="py-1.5 pr-2">{p.paid_on ? `${p.paid_on} 確認ずみ${p.paid_amount != null && p.paid_amount !== p.amount ? `（${yen(p.paid_amount)}）` : ''}` : <span className="text-faint">まだ</span>}</td>
              <td className="py-1.5 whitespace-nowrap">
                {!deleted && (p.paid_on
                  ? <button className={btnCls} onClick={() => act({ action: 'unpay', repId: p.id }, '回収の確認を取り消しました')}>取り消す</button>
                  : <>
                    <button className={btnCls} onClick={() => act({ action: 'pay', repId: p.id, paid_on: today() }, `${p.due_on} の分を回収ずみにしました`)}>回収した</button>
                    <button className={`${btnCls} ml-1`} onClick={() => act({ action: 'rep-delete', repId: p.id }, '返済の行を外しました')}>外す</button>
                  </>)}
              </td>
            </tr>
          ))}
          {!loan.reps.length && <tr><td colSpan={5} className="py-2 text-muted">返済予定がまだありません</td></tr>}
        </tbody>
      </table>
      {!deleted && <>
        <div className="flex flex-wrap items-end gap-2 text-muted">
          <b className="w-full text-ink">返済予定をまとめて作る（月1回）</b>
          <label className="flex flex-col gap-1">初回の期日<input type="date" value={sch.firstDue || ''} onChange={(e) => setSch({ ...sch, firstDue: e.target.value })} className={inputCls} /></label>
          <label className="flex flex-col gap-1">回数<select value={sch.count} onChange={(e) => setSch({ ...sch, count: e.target.value })} className={inputCls}>{Array.from({ length: 24 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label>
          <label className="flex flex-col gap-1">月々<input value={sch.monthly || ''} onChange={(e) => setSch({ ...sch, monthly: e.target.value.replace(/[^\d]/g, '') })} inputMode="numeric" className={`${inputCls} num w-[100px]`} /></label>
          <label className="flex flex-col gap-1">最終回だけ<input value={sch.lastAmount || ''} onChange={(e) => setSch({ ...sch, lastAmount: e.target.value.replace(/[^\d]/g, '') })} inputMode="numeric" className={`${inputCls} num w-[100px]`} /></label>
          <label className="flex flex-col gap-1">方法<select value={sch.method} onChange={(e) => setSch({ ...sch, method: e.target.value })} className={inputCls}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <button className={btnCls} disabled={!sch.firstDue || !Number(sch.monthly)} onClick={() => act({ action: 'schedule', id: loan.id, ...sch, replace: true }, '返済予定を作り直しました（回収ずみの行は残しています）')}>作る（まだの分は作り直し）</button>
        </div>
        <div className="flex flex-wrap items-end gap-2 text-muted">
          <b className="w-full text-ink">返済を1行足す</b>
          <label className="flex flex-col gap-1">期日<input type="date" value={one.due_on || ''} onChange={(e) => setOne({ ...one, due_on: e.target.value })} className={inputCls} /></label>
          <label className="flex flex-col gap-1">額<input value={one.amount || ''} onChange={(e) => setOne({ ...one, amount: e.target.value.replace(/[^\d]/g, '') })} inputMode="numeric" className={`${inputCls} num w-[100px]`} /></label>
          <label className="flex flex-col gap-1">方法<select value={one.method} onChange={(e) => setOne({ ...one, method: e.target.value })} className={inputCls}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <button className={btnCls} disabled={!one.due_on || !Number(one.amount)} onClick={() => act({ action: 'rep-add', id: loan.id, ...one }, '返済を1行足しました')}>足す</button>
        </div>
      </>}
      <div>
        {deleted
          ? <button className={btnCls} onClick={() => act({ action: 'restore', id: loan.id }, `${loan.name} の貸付を戻しました`)}>戻す</button>
          : <button className={btnCls} onClick={() => { if (window.confirm(`${loan.name} の貸付に削除の印をつけます（あとで戻せます）`)) void act({ action: 'delete', id: loan.id }, `${loan.name} の貸付に削除の印をつけました`); }}>削除の印をつける</button>}
      </div>
    </div>
  );
}
