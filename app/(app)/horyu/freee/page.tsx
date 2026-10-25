'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, HoryuFrame, Msg, Tabs, btnCls, horyuPost, inputCls, tdCls, thCls, useHoryu, yen } from '@/components/horyu/kit';

// freee 請求書（保留・10-25）。今の /freee-invoices.html と同じ中身を読む（DB に取り込みずみの分だけ）。
//   ・freee そのものは呼ばない（取り込み・接続確認は今の画面と毎晩の自動取り込みのまま）
//   ・取引先→上位会社の紐づけだけここから直せる（今の map_upsert）。請求書づくり（seikyu）には触らない
type Company = { company_id: string; parent: boolean };
type Invoice = { company_id: string; invoice_id: number; invoice_number: string; subject: string; partner_label: string; joi: string; billing_date: string; payment_date: string; sending_status: string; deal_status: string; amount_including_tax: number; canceled: boolean };
type Group = { company_id: string; joi: string; mapped: boolean; label: string; count: number; total_including_tax: number; sent: number; unsent: number; canceled: number };
type Line = { position: number; description: string; quantity: number; unit: string; unit_price: number; amount_excluding_tax: number };
type Partner = { company_id: string; partner_id: number | null; partner_label: string; invoice_count: number; last_billing_date: string | null; mapped: boolean; joi: { joi_name: string; label: string }[] };

const thisYm = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 7);
const shiftYm = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

const S_COMPANIES: Company[] = [{ company_id: '1000001', parent: true }, { company_id: '1000002', parent: false }];
const S_GROUPS: Group[] = [
  { company_id: '1000001', joi: '見本システムズ', mapped: true, label: '見本システムズ', count: 6, total_including_tax: 2970000, sent: 5, unsent: 1, canceled: 0 },
  { company_id: '1000001', joi: '', mapped: false, label: '見本テック', count: 2, total_including_tax: 880000, sent: 2, unsent: 0, canceled: 0 },
  { company_id: '1000002', joi: 'サンプル商事', mapped: true, label: 'サンプル商事', count: 3, total_including_tax: 1155000, sent: 3, unsent: 0, canceled: 1 },
];
const S_INVOICES: Invoice[] = [
  { company_id: '1000001', invoice_id: 1, invoice_number: 'INV-0001', subject: '10月分 SES業務委託', partner_label: '見本システムズ', joi: '見本システムズ', billing_date: '2026-10-31', payment_date: '2026-11-30', sending_status: 'sent', deal_status: 'registered', amount_including_tax: 495000, canceled: false },
  { company_id: '1000001', invoice_id: 2, invoice_number: 'INV-0002', subject: '10月分 SES業務委託', partner_label: '見本テック', joi: '', billing_date: '2026-10-31', payment_date: '2026-11-30', sending_status: 'unsent', deal_status: 'unregistered', amount_including_tax: 440000, canceled: false },
];
const S_PARTNERS: Partner[] = [
  { company_id: '1000001', partner_id: 501, partner_label: '見本システムズ', invoice_count: 18, last_billing_date: '2026-10-31', mapped: true, joi: [{ joi_name: '見本システムズ', label: '見本システムズ' }] },
  { company_id: '1000001', partner_id: 502, partner_label: '見本テック', invoice_count: 4, last_billing_date: '2026-10-31', mapped: false, joi: [] },
];

type TabKey = 'summary' | 'list' | 'partners';

export default function FreeeInvoicesPage() {
  const [ym, setYm] = useState(thisYm);
  const [company, setCompany] = useState('');
  const [tab, setTab] = useState<TabKey>('summary');
  const sum = useHoryu<{ groups: Group[] }>('freee-summary', { ym, company_id: company });
  const list = useHoryu<{ invoices: Invoice[]; companies: Company[] }>(tab === 'list' || tab === 'summary' ? 'freee-list' : null, { ym, company_id: company });
  const live = sum.state !== 'sample';
  const companies = (live ? list.data?.companies : S_COMPANIES) ?? [];
  const cLabel = (id: string) => { const i = companies.findIndex((c) => c.company_id === id); return i < 0 ? `事業所 ${id}` : i === 0 ? '親会社' : `事業所${i + 1}`; };
  const groups = live ? sum.data?.groups ?? [] : S_GROUPS;
  const total = groups.reduce((s, g) => s + g.total_including_tax, 0);

  return (
    <HoryuFrame title="freee 請求書" sub="freee に出した請求書を、月・事業所・上位会社ごとに見る（取り込みずみの分）" state={sum.state} error={sum.error} onReload={sum.reload}>
      <div className="mo-fade-up flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <button className={btnCls} onClick={() => setYm(shiftYm(ym, -1))}>前の月</button>
        <input type="month" value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} aria-label="請求月" className={inputCls} />
        <button className={btnCls} onClick={() => setYm(shiftYm(ym, 1))}>次の月</button>
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted">事業所
          <select value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls}>
            <option value="">すべて</option>
            {companies.map((c) => <option key={c.company_id} value={c.company_id}>{cLabel(c.company_id)}</option>)}
          </select>
        </label>
        <span className="num ml-auto text-[13px]">合計（税込）<b className="ml-1 text-[16px]">{yen(total)}</b></span>
      </div>
      <Tabs<TabKey> value={tab} onChange={setTab} tabs={[{ key: 'summary', label: '上位会社ごと' }, { key: 'list', label: '請求書の一覧' }, { key: 'partners', label: '取引先の紐づけ' }]} />
      {tab === 'summary' && <SummaryTab groups={groups} cLabel={cLabel} />}
      {tab === 'list' && <ListTab live={live} invoices={live ? list.data?.invoices ?? [] : S_INVOICES} loading={live && list.state === 'loading'} cLabel={cLabel} />}
      {tab === 'partners' && <PartnersTab live={live} company={company} cLabel={cLabel} />}
    </HoryuFrame>
  );
}

function SummaryTab({ groups, cLabel }: { groups: Group[]; cLabel: (id: string) => string }) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead><tr className="th-row"><th className={thCls}>事業所</th><th className={thCls}>上位会社（freee 取引先）</th><th className={`${thCls} text-right`}>件数</th><th className={`${thCls} text-right`}>税込合計</th><th className={thCls}>送付</th></tr></thead>
          <tbody>
            {groups.map((g, i) => (
              <tr key={`${g.company_id}-${g.label}-${i}`} className="row border-t border-line-soft">
                <td className={tdCls}>{cLabel(g.company_id)}</td>
                <td className={tdCls}><b>{g.label}</b>{!g.mapped && <span className="chip ml-1.5" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>未紐づけ</span>}{g.canceled ? <span className="ml-1.5 text-[11.5px] text-faint">取消 {g.canceled}</span> : null}</td>
                <td className={`${tdCls} num text-right`}>{g.count}</td>
                <td className={`${tdCls} num text-right font-semibold`}>{yen(g.total_including_tax)}</td>
                <td className={tdCls}>{g.unsent ? <span className="text-warn">未送付 {g.unsent}</span> : <span className="text-faint">すべて送付</span>}</td>
              </tr>
            ))}
            {!groups.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">この月の請求書はありません</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ListTab({ live, invoices, loading, cLabel }: { live: boolean; invoices: Invoice[]; loading: boolean; cLabel: (id: string) => string }) {
  const [open, setOpen] = useState('');
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead><tr className="th-row"><th className={thCls} /><th className={thCls}>請求日</th><th className={thCls}>番号・件名</th><th className={thCls}>取引先</th><th className={thCls}>事業所</th><th className={`${thCls} text-right`}>税込</th><th className={thCls}>送付</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">読んでいます…</td></tr>}
            {invoices.map((v) => {
              const k = `${v.company_id}:${v.invoice_id}`;
              return (
                <Fragment key={k}>
                  <tr className="row border-t border-line-soft" style={v.canceled ? { opacity: 0.5 } : undefined}>
                    <td className="pl-3"><button aria-label="明細を開く" aria-expanded={open === k} onClick={() => setOpen(open === k ? '' : k)} className="rounded p-1 text-muted">{open === k ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button></td>
                    <td className={`${tdCls} num whitespace-nowrap`}>{v.billing_date}</td>
                    <td className={tdCls}><div className="font-semibold">{v.subject || '—'}</div><div className="text-[11.5px] text-faint">{v.invoice_number}{v.canceled ? '・取消' : ''}</div></td>
                    <td className={tdCls}>{v.joi || v.partner_label}</td>
                    <td className={tdCls}>{cLabel(v.company_id)}</td>
                    <td className={`${tdCls} num text-right font-semibold`}>{yen(v.amount_including_tax)}</td>
                    <td className={tdCls}>{v.sending_status === 'sent' ? '送付ずみ' : v.sending_status === 'unsent' ? <span className="text-warn">未送付</span> : v.sending_status || '—'}</td>
                  </tr>
                  {open === k && <tr><td colSpan={7} className="bg-soft px-4 py-3"><Lines live={live} companyId={v.company_id} invoiceId={v.invoice_id} /></td></tr>}
                </Fragment>
              );
            })}
            {!loading && !invoices.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">この月の請求書はありません</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Lines({ live, companyId, invoiceId }: { live: boolean; companyId: string; invoiceId: number }) {
  const r = useHoryu<{ lines: Line[] }>(live ? 'freee-lines' : null, { company_id: companyId, invoice_id: invoiceId });
  const lines: Line[] = live ? r.data?.lines ?? [] : [{ position: 0, description: '10月分 業務委託（見本）', quantity: 1, unit: '式', unit_price: 450000, amount_excluding_tax: 450000 }];
  if (live && r.state === 'loading') return <span className="text-[12.5px] text-muted">読んでいます…</span>;
  if (!lines.length) return <span className="text-[12.5px] text-muted">明細はまだ取り込まれていません</span>;
  return (
    <table className="w-full text-[12.5px]">
      <thead><tr className="text-left text-muted"><th className="py-1 pr-2">品名</th><th className="py-1 pr-2 text-right">数量</th><th className="py-1 pr-2 text-right">単価</th><th className="py-1 text-right">税抜</th></tr></thead>
      <tbody>{lines.map((l) => <tr key={l.position}><td className="py-1 pr-2">{l.description}</td><td className="num py-1 pr-2 text-right">{l.quantity}{l.unit}</td><td className="num py-1 pr-2 text-right">{yen(l.unit_price)}</td><td className="num py-1 text-right">{yen(l.amount_excluding_tax)}</td></tr>)}</tbody>
    </table>
  );
}

function PartnersTab({ live, company, cLabel }: { live: boolean; company: string; cLabel: (id: string) => string }) {
  const r = useHoryu<{ partners: Partner[]; joiOptions: string[] }>(live ? 'freee-partners' : null, { company_id: company });
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const [busy, setBusy] = useState('');
  const partners = live ? r.data?.partners ?? [] : S_PARTNERS;
  const options = live ? r.data?.joiOptions ?? [] : ['見本システムズ', '見本テック', 'サンプル商事'];
  const save = async (p: Partner, joi: string) => {
    if (!live) { setMsg({ text: `見本なので保存はしていません（${p.partner_label} → ${joi || '外す'}）` }); return; }
    const key = `${p.company_id}:${p.partner_id}`;
    setBusy(key);
    const res = await horyuPost('freee-map', { company_id: p.company_id, partner_id: p.partner_id, joi_name: joi, partner_display_name: p.partner_label });
    setBusy('');
    setMsg(res.ok ? { text: `${p.partner_label} を「${joi || '紐づけなし'}」にしました` } : { text: res.error, bad: true });
    if (res.ok) void r.reload();
  };
  return (
    <Card title="freee 取引先 → 上位会社" note="上位会社の選択肢は直近3か月の名簿から">
      <div className="px-4 pb-2"><Msg text={msg.text} bad={msg.bad} /></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-[13px]">
          <thead><tr className="th-row"><th className={thCls}>事業所</th><th className={thCls}>freee 取引先</th><th className={`${thCls} text-right`}>請求書</th><th className={thCls}>最後の請求日</th><th className={thCls}>上位会社</th></tr></thead>
          <tbody>
            {live && r.state === 'loading' && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">読んでいます…</td></tr>}
            {partners.map((p) => {
              const cur = p.joi[0]?.label || '';
              const key = `${p.company_id}:${p.partner_id}`;
              return (
                <tr key={key} className="row border-t border-line-soft">
                  <td className={tdCls}>{cLabel(p.company_id)}</td>
                  <td className={tdCls}><b>{p.partner_label}</b></td>
                  <td className={`${tdCls} num text-right`}>{p.invoice_count}</td>
                  <td className={`${tdCls} num`}>{p.last_billing_date || '—'}</td>
                  <td className={tdCls}>
                    {p.partner_id == null ? <span className="text-faint">取引先が未設定</span> : (
                      <select value={cur} disabled={busy === key} onChange={(e) => save(p, e.target.value)} aria-label={`${p.partner_label} の上位会社`} className={inputCls}>
                        <option value="">（紐づけなし）</option>
                        {cur && !options.includes(cur) && <option value={cur}>{cur}</option>}
                        {options.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
