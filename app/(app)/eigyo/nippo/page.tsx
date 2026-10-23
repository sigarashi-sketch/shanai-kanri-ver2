'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Minus, Plus, Send } from 'lucide-react';
import { COMPANIES, METRICS, PRICES, RETIRE_CANDIDATES, SEIYAKU_PEOPLE, SHUSSHA, STARTS, type MetricKey } from '@/lib/nippo-sample';
import { SALES_REPS } from '@/lib/taiki-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';

// 成約日報（営業が毎日出す）。答えは選ぶ・数を入れるだけ。
//   ①今日の行動指標（送った案件数・面談数・成約数）②成約の中身（名前→上位会社→現場→契約）③退職者欄
//   ②の条件は請求条件の正になる（ミンミカより日報を優先）。③に載せた人は退社確定＝名簿の退社・営業リストの稼働中を外す
type Seiyaku = { person: string; company: string; site: string; price: string; start: string; shussha: string };
const EMPTY: Seiyaku = { person: '', company: '', site: '', price: '', start: '', shussha: '' };
const complete = (s: Seiyaku) => Object.values(s).every(Boolean);
const Sel = ({ label, value, opts, onChange, disabled }: { label: string; value: string; opts: string[]; onChange: (v: string) => void; disabled?: boolean }) => (
  <label className="flex flex-col gap-0.5 text-[11.5px] text-faint">{label}
    <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={`min-h-9 rounded-[10px] border bg-surface px-2 text-[13px] text-ink disabled:opacity-50 ${value ? 'border-field' : ''}`} style={value ? undefined : { borderColor: 'var(--color-warn-line)' }}>
      <option value="">選ぶ</option>{opts.map((o) => <option key={o}>{o}</option>)}
    </select>
  </label>
);

export default function NippoPage() {
  const canEdit = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const [me, setMe] = useState(SALES_REPS[0]);
  const [m, setM] = useState<Record<MetricKey, number>>({ sent: 0, mendan: 0, seiyaku: 0 });
  const [rows, setRows] = useState<Seiyaku[]>([]);
  const [retire, setRetire] = useState<'' | 'なし' | 'あり'>('');
  const [retired, setRetired] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => { const r = new URLSearchParams(window.location.search).get('rep'); if (r && SALES_REPS.includes(r)) setMe(r); }, []);
  // 成約数に合わせて②の行を増やす／減らす
  useEffect(() => { setRows((rs) => (rs.length === m.seiyaku ? rs : m.seiyaku > rs.length ? [...rs, ...Array.from({ length: m.seiyaku - rs.length }, () => ({ ...EMPTY }))] : rs.slice(0, m.seiyaku))); }, [m.seiyaku]);

  const step = (k: MetricKey, d: number) => setM((x) => ({ ...x, [k]: Math.max(0, Math.min(99, x[k] + d)) }));
  const setRow = (i: number, patch: Partial<Seiyaku>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const retiredList = RETIRE_CANDIDATES.filter((r) => retired[r.id]);
  const steps = [m.sent > 0 || m.mendan > 0, rows.every(complete), retire === 'なし' || (retire === 'あり' && retiredList.length > 0)];
  const remain = steps.filter((s) => !s).length;
  const total = rows.reduce((s, r) => s + (parseInt(r.price) || 0), 0);

  const submit = () => {
    if (!canEdit || remain) return;
    setSubmitted(true); hit(1 + rows.length + retiredList.length);
    const parts = [rows.length ? `成約 ${rows.length}件を請求条件に` : '', retiredList.length ? `${retiredList.map((r) => r.name).join('・')} を退社に` : ''].filter(Boolean);
    toast({ text: `${me} の今日の日報を出しました`, sub: `→ 売上・粗利の営業別${parts.length ? `、${parts.join('、')}` : ''}反映しました`, undo: () => setSubmitted(false) });
  };

  if (submitted) return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="成約日報" sub={`${me} ・ 10/23（金）`} />
      <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-10 text-center">
        <Check className="mx-auto text-ok" size={26} /><div className="mt-2 text-[15px] font-bold">今日の日報は出しました。おつかれさまでした</div>
        <div className="mt-1 text-[12.5px] text-muted">送った案件 {m.sent}件・面談 {m.mendan}件・成約 {m.seiyaku}件{total ? `（単価の合計 ${total}万）` : ''}{retiredList.length ? `・退職 ${retiredList.length}人` : ''}</div>
        <div className="mt-3 flex justify-center gap-3 text-[12.5px] font-semibold"><Link href="/eigyo/pl" style={{ color: 'var(--ad)' }}>今月の自分の数字を見る</Link><button onClick={() => setSubmitted(false)} className="text-muted">出した中身を直す</button></div>
      </div>
    </main>
  );

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="成約日報" sub="毎日、営業が出します。選ぶ・数を入れるだけ・見本データ">
        <label className="flex items-center gap-2 text-[12.5px] text-muted">出す人
          <select aria-label="出す人" value={me} onChange={(e) => setMe(e.target.value)} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-[13px] text-ink">{SALES_REPS.map((s) => <option key={s}>{s}</option>)}</select>
        </label>
      </PageTitle>

      <div className="mo-fade-up flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={remain} total={3} />
        <div className="text-[13px]"><b>{remain ? `のこり ${remain}つ答えると出せます` : '全部そろいました。出せます'}</b><span className="ml-2 text-muted">①行動指標 ②成約の中身 ③退職者</span>
          {!canEdit && <div className="text-[12px] text-bad">{needText('edit')}</div>}
        </div>
      </div>

      <section className="mo-fade-up rounded-xl border border-line bg-surface px-5 py-4" style={{ ['--i' as string]: 2 }}>
        <h2 className="text-[14px] font-bold">① 今日の行動指標 {steps[0] && <Check size={14} className="inline text-ok" />}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {METRICS.map((x) => (
            <div key={x.key} className="rounded-[10px] bg-soft px-3 py-2.5">
              <div className="text-[12px] text-muted">{x.label}</div>
              <div className="mt-1 flex items-center gap-2">
                <button aria-label={`${x.label}を減らす`} disabled={!canEdit} onClick={() => step(x.key, -1)} className="grid size-9 place-items-center rounded-[10px] border border-field bg-surface disabled:opacity-40"><Minus size={14} /></button>
                <input aria-label={x.label} type="number" min={0} max={99} disabled={!canEdit} value={m[x.key]} onChange={(e) => setM((v) => ({ ...v, [x.key]: Math.max(0, Math.min(99, Number(e.target.value) || 0)) }))} className="num h-9 w-16 rounded-[10px] border border-field bg-surface text-center text-[16px] font-bold" />
                <button aria-label={`${x.label}を増やす`} disabled={!canEdit} onClick={() => step(x.key, x.key === 'sent' ? 5 : 1)} className="grid size-9 place-items-center rounded-[10px] border border-field bg-surface disabled:opacity-40"><Plus size={14} /></button>
                <span className="text-[11.5px] text-faint">先週の自分 平均 {x.avg}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mo-fade-up rounded-xl border border-line bg-surface px-5 py-4" style={{ ['--i' as string]: 3 }}>
        <h2 className="text-[14px] font-bold">② 成約の中身 {m.seiyaku > 0 && steps[1] && <Check size={14} className="inline text-ok" />}</h2>
        <p className="mt-0.5 text-[12px] text-muted">ここで選んだ上位会社・現場・契約の条件が<b>請求条件の正</b>になります（ミンミカと食い違ったら、こちらを使います）。</p>
        {rows.length === 0 && <div className="mt-2 text-[12.5px] text-faint">成約数が 0 なので、答えるものはありません。</div>}
        {rows.map((r, i) => (
          <div key={i} className="mo-fade-in mt-3 grid gap-2 rounded-[10px] border border-line-soft px-3 py-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <Sel label={`成約${i + 1} 名前`} value={r.person} opts={SEIYAKU_PEOPLE.map((p) => p.name)} onChange={(v) => setRow(i, { person: v })} disabled={!canEdit} />
            <Sel label="上位会社" value={r.company} opts={Object.keys(COMPANIES)} onChange={(v) => setRow(i, { company: v, site: '' })} disabled={!canEdit} />
            <Sel label="現場" value={r.site} opts={r.company ? COMPANIES[r.company] : []} onChange={(v) => setRow(i, { site: v })} disabled={!canEdit || !r.company} />
            <Sel label="単価" value={r.price} opts={PRICES} onChange={(v) => setRow(i, { price: v })} disabled={!canEdit} />
            <Sel label="開始" value={r.start} opts={STARTS} onChange={(v) => setRow(i, { start: v })} disabled={!canEdit} />
            <Sel label="出社の形" value={r.shussha} opts={SHUSSHA} onChange={(v) => setRow(i, { shussha: v })} disabled={!canEdit} />
          </div>
        ))}
      </section>

      <section className="mo-fade-up rounded-xl border border-line bg-surface px-5 py-4" style={{ ['--i' as string]: 4 }}>
        <h2 className="text-[14px] font-bold">③ 退職者 {steps[2] && <Check size={14} className="inline text-ok" />}</h2>
        <div className="mt-2 flex gap-1.5">
          {(['なし', 'あり'] as const).map((k) => (
            <button key={k} disabled={!canEdit} onClick={() => setRetire(k)} className={`min-h-9 rounded-full border px-4 text-[13px] disabled:opacity-40 ${retire === k ? 'font-semibold' : 'text-muted'}`} style={retire === k ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>退職者は{k === 'なし' ? 'いない' : 'いる'}</button>
          ))}
        </div>
        {retire === 'あり' && (
          <div className="mo-fade-in mt-3">
            <div className="rounded-[10px] px-3 py-2 text-[12.5px]" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>ここに載せた人は<b>退社が確定</b>します。名簿を退社にし、営業リストの「稼働中」も外します（参画決定・辞退はそのまま）。</div>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {RETIRE_CANDIDATES.map((r) => (
                <li key={r.id}><label className={`flex min-h-10 items-center gap-2 rounded-[10px] border px-3 text-[13px] ${retired[r.id] ? 'mo-shake' : ''}`} style={{ borderColor: retired[r.id] ? 'var(--color-warn-line)' : 'var(--color-line-soft)' }}>
                  <input type="checkbox" disabled={!canEdit} checked={!!retired[r.id]} onChange={(e) => setRetired((s) => ({ ...s, [r.id]: e.target.checked }))} />
                  <span className="font-semibold">{r.name}</span><span className="text-[11.5px] text-faint">{r.site}</span>
                </label></li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={submit} disabled={!canEdit || remain > 0} title={!canEdit ? needText('edit') : remain ? 'まだ答えていないところがあります' : undefined} className="btn-primary inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-4 text-[13.5px] font-bold disabled:cursor-not-allowed disabled:opacity-40"><Send size={15} />今日の日報を出す</button>
        {total > 0 && <span className="text-[12.5px] text-muted">今日の成約 単価の合計 <b className="num text-ink">{total}万</b></span>}
      </div>
      <p className="text-[11.5px] text-faint">退社・契約条件の扱いは、最終判断は社労士・税理士・法務に確認してください。出すのは本物につなぐまで見本の中だけで動きます。</p>
    </main>
  );
}
