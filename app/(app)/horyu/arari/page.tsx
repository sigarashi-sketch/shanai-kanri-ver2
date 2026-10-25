'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { PersonName } from '@/components/Person';
import { Card, HoryuFrame, Msg, horyuPost, inputCls, tdCls, thCls, useHoryu, yen, fmtAt } from '@/components/horyu/kit';

// 粗利試算（保留・10-25）。今の /arari-sim.html と同じ：案件の文 → 単価・現場駅を読む → 要員（最大15名）ごとの 売上・額面・社保・交通費・粗利。
//   計算すると今のシステムが試算の記録（arari_sims）に残す（今の画面と同じ）。交通費は駅すぱあと（回数に限りがある）
type Person = { id: string; name: string; eki: string; shozoku: string; gakumen: number | null; status: string; active: boolean };
type Parsed = { tanka: { monthly: number | null; method: string | null; snippet: string }; floor: { state: string; message: string }; salesDefault: number | null; station: string; stations: string[]; title: string; commute: { mode: string; label: string } };
type Row = { id: string; name: string; status: string; home: string; ok: boolean; error?: string; sales?: number; gakumen?: number; shaho?: number; fare?: number | null; gross?: number | null; grossExFare?: number; rate?: number | null; fareNote?: string; route?: string; minutes?: number | null };
type Hist = { id: number; updated_at: string; created_name: string; case_title: string; site_station: string; sales_monthly: number; name: string; gakumen: number; fare_monthly: number | null; gross: number | null; margin_rate: number | null };

const S_PEOPLE: Person[] = [
  { id: 's1', name: '佐藤 健太', eki: '川崎', shozoku: '本社', gakumen: 250000, status: '営業中', active: true },
  { id: 's2', name: '高橋 健', eki: '大宮', shozoku: '本社', gakumen: 240000, status: '営業中', active: true },
];
const S_HIST: Hist[] = [{ id: 1, updated_at: new Date().toISOString(), created_name: '営業 見本', case_title: 'インフラ運用（見本）', site_station: '品川', sales_monthly: 420000, name: '佐藤 健太', gakumen: 250000, fare_monthly: 12000, gross: 118000, margin_rate: 0.281 }];

export default function ArariPage() {
  const hist = useHoryu<{ rows: Hist[]; note?: string }>('arari-history');
  const live = hist.state !== 'sample';
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [station, setStation] = useState('');
  const [sales, setSales] = useState('');
  const [q, setQ] = useState('');
  const [qq, setQq] = useState('');
  useEffect(() => { const t = setTimeout(() => setQq(q.trim()), 400); return () => clearTimeout(t); }, [q]);
  const found = useHoryu<{ people: Person[] }>(live && qq ? 'arari-people' : null, { q: qq });
  const [picked, setPicked] = useState<Person[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const list = live ? (qq ? found.data?.people ?? [] : []) : S_PEOPLE.filter((p) => !qq || p.name.includes(qq));

  const parse = async () => {
    if (!live) { setParsed({ tanka: { monthly: 420000, method: '人月', snippet: '単価 42万' }, floor: { state: 'ok', message: '' }, salesDefault: 420000, station: '品川', stations: ['品川'], title: '見本の案件', commute: { mode: 'normal', label: '通常' } }); setStation('品川'); setSales('420000'); return; }
    setBusy('parse');
    const r = await horyuPost<Parsed>('arari-parse', { text });
    setBusy('');
    if (!r.ok) { setMsg({ text: r.error, bad: true }); return; }
    setParsed(r.data); setStation(r.data.station || ''); setSales(r.data.salesDefault ? String(r.data.salesDefault) : '');
    setMsg(r.data.floor?.state === 'under' ? { text: r.data.floor.message, bad: true } : { text: '' });
  };
  const calc = async () => {
    if (!picked.length) { setMsg({ text: '要員を選んでください', bad: true }); return; }
    if (!live) { setRows(picked.map((p) => ({ id: p.id, name: p.name, status: p.status, home: p.eki, ok: true, sales: Number(sales) || 420000, gakumen: p.gakumen ?? 250000, shaho: 37500, fare: 12000, gross: (Number(sales) || 420000) - (p.gakumen ?? 250000) - 37500 - 12000, rate: 0.28, route: `${p.eki} → ${station || '品川'}（見本）`, minutes: 35 }))); setMsg({ text: '見本の計算です（記録はしていません）' }); return; }
    setBusy('calc'); setMsg({ text: '' });
    const r = await horyuPost<{ rows: Row[]; saved: number; remaining: number | null }>('arari-calc', { text, station, sales, ids: picked.map((p) => p.id) });
    setBusy('');
    if (!r.ok) { setMsg({ text: r.error, bad: true }); return; }
    setRows(r.data.rows);
    setMsg({ text: `計算しました（記録 ${r.data.saved}件${r.data.remaining != null ? `・駅すぱあと残り ${r.data.remaining}回` : ''}）` });
    void hist.reload();
  };

  return (
    <HoryuFrame title="粗利試算" sub="案件の文と要員から、売上・給与・社保・交通費・粗利を出す（20日・160時間の月額）" state={hist.state} error={hist.error} onReload={hist.reload}>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card title="1. 案件">
          <div className="flex flex-col gap-2.5 px-4 pb-4">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} aria-label="案件の文" placeholder="案件の文（単価・最寄駅・精算など）をそのまま貼る" className={inputCls} />
            <button onClick={parse} disabled={busy !== ''} className="min-h-9 self-start rounded-[10px] border border-field bg-surface px-3 text-[13px] font-semibold disabled:opacity-40">{busy === 'parse' ? '読んでいます…' : '単価と駅を読む'}</button>
            {parsed && <p className="text-[12.5px] text-muted">{parsed.title && <b className="text-ink">{parsed.title}</b>} 単価：{parsed.tanka.snippet || '読めませんでした'}・交通費：{parsed.commute.label}</p>}
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-1.5 text-[12.5px] text-muted">現場の最寄駅<input value={station} onChange={(e) => setStation(e.target.value)} className={`${inputCls} w-[120px]`} list="arari-stations" /></label>
              <datalist id="arari-stations">{parsed?.stations.map((s) => <option key={s} value={s} />)}</datalist>
              <label className="flex items-center gap-1.5 text-[12.5px] text-muted">売上（月額）<input value={sales} onChange={(e) => setSales(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" className={`${inputCls} num w-[120px]`} /></label>
            </div>
          </div>
        </Card>
        <Card title="2. 要員（最大15名）">
          <div className="flex flex-col gap-2.5 px-4 pb-4">
            <label className="flex items-center gap-1.5 rounded-lg border border-field bg-surface px-2 py-1.5 text-[13px]">
              <Search size={14} className="shrink-0 text-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="氏名の一部で探す" aria-label="要員を探す" className="min-w-0 flex-1 bg-transparent outline-none" />
            </label>
            {list.length > 0 && (
              <ul className="max-h-[180px] overflow-y-auto rounded-lg border border-line-soft">
                {list.map((p) => {
                  const on = picked.some((x) => x.id === p.id);
                  return (
                    <li key={p.id} className="flex items-center gap-2 border-b border-line-soft px-3 py-1.5 text-[13px] last:border-0">
                      <input type="checkbox" checked={on} disabled={!on && picked.length >= 15} onChange={() => setPicked(on ? picked.filter((x) => x.id !== p.id) : [...picked, p])} aria-label={`${p.name} を選ぶ`} />
                      <PersonName name={p.name} />
                      <span className="text-[11.5px] text-faint">{p.status}・{p.eki || '駅なし'}</span>
                      <span className="num ml-auto text-[12px]">{p.gakumen ? yen(p.gakumen) : '額面なし'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex flex-wrap gap-1.5">
              {picked.map((p) => <span key={p.id} className="chip">{p.name}<button aria-label={`${p.name} を外す`} onClick={() => setPicked(picked.filter((x) => x.id !== p.id))}><X size={11} /></button></span>)}
            </div>
            <button onClick={calc} disabled={busy !== '' || !picked.length} className="btn-primary min-h-10 rounded-[10px] px-4 text-[13.5px] font-semibold disabled:opacity-40">{busy === 'calc' ? '計算しています…' : '粗利を出す'}</button>
            <Msg text={msg.text} bad={msg.bad} />
          </div>
        </Card>
      </div>
      {rows && (
        <Card title="3. 結果">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[13px]">
              <thead><tr className="th-row"><th className={thCls}>要員</th><th className={`${thCls} text-right`}>売上</th><th className={`${thCls} text-right`}>額面</th><th className={`${thCls} text-right`}>社保</th><th className={`${thCls} text-right`}>交通費</th><th className={`${thCls} text-right`}>粗利</th><th className={`${thCls} text-right`}>粗利率</th><th className={thCls}>経路・メモ</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line-soft">
                    <td className={tdCls}><PersonName name={r.name} /><div className="text-[11.5px] text-faint">{r.status}・{r.home || '駅なし'}</div></td>
                    {r.ok ? <>
                      <td className={`${tdCls} num text-right`}>{yen(r.sales)}</td><td className={`${tdCls} num text-right`}>{yen(r.gakumen)}</td><td className={`${tdCls} num text-right`}>{yen(r.shaho)}</td><td className={`${tdCls} num text-right`}>{yen(r.fare)}</td>
                      <td className={`${tdCls} num text-right font-bold`} style={{ color: (r.gross ?? 0) < 0 ? 'var(--tone-bad-fg)' : undefined }}>{yen(r.gross)}</td>
                      <td className={`${tdCls} num text-right`}>{r.rate == null ? '—' : `${Math.round(r.rate * 1000) / 10}%`}</td>
                      <td className={`${tdCls} text-[12px] text-muted`}>{[r.route, r.minutes ? `${r.minutes}分` : '', r.fareNote].filter(Boolean).join('・')}</td>
                    </> : <td colSpan={7} className={`${tdCls} text-[12.5px]`} style={{ color: 'var(--tone-bad-fg)' }}>{r.error}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Card title="最近の試算" note="全員ぶん・新しい順">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead><tr className="th-row"><th className={thCls}>いつ</th><th className={thCls}>だれが</th><th className={thCls}>案件・現場駅</th><th className={thCls}>要員</th><th className={`${thCls} text-right`}>売上</th><th className={`${thCls} text-right`}>粗利</th><th className={`${thCls} text-right`}>率</th></tr></thead>
            <tbody>
              {(live ? hist.data?.rows ?? [] : S_HIST).map((h) => (
                <tr key={h.id} className="border-t border-line-soft">
                  <td className={`${tdCls} num whitespace-nowrap`}>{fmtAt(h.updated_at)}</td><td className={tdCls}>{h.created_name || '—'}</td>
                  <td className={tdCls}>{h.case_title || '—'}<div className="text-[11.5px] text-faint">{h.site_station}</div></td>
                  <td className={tdCls}><PersonName name={h.name} /></td>
                  <td className={`${tdCls} num text-right`}>{yen(h.sales_monthly)}</td><td className={`${tdCls} num text-right font-semibold`}>{yen(h.gross)}</td>
                  <td className={`${tdCls} num text-right`}>{h.margin_rate == null ? '—' : `${Math.round(h.margin_rate * 1000) / 10}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hist.data?.note && <p className="px-4 py-2 text-[12px] text-muted">{hist.data.note}</p>}
        </div>
      </Card>
    </HoryuFrame>
  );
}
