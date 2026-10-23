'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarPlus, Check, CircleAlert } from 'lucide-react';
import { COHORTS, MENDAN_BY, MENDAN_WHEN, RISK_PEOPLE, type RiskPerson } from '@/lib/rishoku-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';

// 離職リスク・離職率（人事管理）。
//   ・リスクは点数にせず「材料」を並べる：残業の増え方・未打刻・欠勤・面談メモの気になる言葉・待機の長さ・入社からの月数
//   ・材料が2つ以上重なる人＝「早めに面談」。次の一手は面談を入れる（担当と時期を選ぶだけ）
//   ・離職率タブ：入社月ごとの 3/6/12か月の定着（初回入場から在籍通算・未経験の社員だけ・2026-02 以降の入場）
//   年齢・性別・健康の申告は材料に使わない（差が出ても選別に使わない）
type Sig = { text: string; strong: boolean };
type Lv = 'high' | 'mid' | 'low';
const LV: Record<Lv, { label: string; tone: string }> = { high: { label: '早めに面談', tone: 'bad' }, mid: { label: '気にかける', tone: 'warn' }, low: { label: 'いまは落ち着いている', tone: 'ok' } };
const STRONG_WORDS = ['辞めたい', '他の会社'];

function signals(p: RiskPerson): Sig[] {
  const s: Sig[] = [];
  const [a, , c] = p.overtime;
  if (c - a >= 15) s.push({ text: `残業が3か月で ${p.overtime.join('→')}時間 に増えた`, strong: true });
  else if (c >= 45) s.push({ text: `今月の残業が ${c}時間`, strong: true });
  if (p.absent >= 2) s.push({ text: `欠勤が直近3か月で ${p.absent}回`, strong: true });
  if (p.noPunch >= 3) s.push({ text: `今月の未打刻が ${p.noPunch}回`, strong: false });
  p.words.forEach((w) => s.push({ text: `面談メモ・日報に「${w}」`, strong: STRONG_WORDS.includes(w) }));
  if (p.taikiDays >= 30) s.push({ text: `待機が ${p.taikiDays}日 続いている`, strong: true });
  else if (p.taikiDays > 0) s.push({ text: `待機 ${p.taikiDays}日目`, strong: false });
  if (p.months <= 3) s.push({ text: `入社 ${p.months}か月目（辞めやすい時期）`, strong: false });
  return s;
}
const levelOf = (s: Sig[]): Lv => { const st = s.filter((x) => x.strong).length; return st >= 2 || (st >= 1 && s.length >= 2) ? 'high' : s.length ? 'mid' : 'low'; };
const ORDER: Lv[] = ['high', 'mid', 'low'];

export default function RishokuPage() {
  const [tab, setTab] = useState<'risk' | 'rate'>('risk');
  useEffect(() => { if (new URLSearchParams(window.location.search).get('tab') === 'rate') setTab('rate'); }, []);
  const go = (t: 'risk' | 'rate') => { setTab(t); window.history.replaceState(null, '', t === 'rate' ? '?tab=rate' : window.location.pathname); };
  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="離職リスク・離職率" sub="点数ではなく「なぜ気になるか」を並べます。勤怠・日報・面談メモから・見本データ" />
      <div role="tablist" className="mo-fade-up flex gap-1 border-b border-line" style={{ ['--i' as string]: 1 }}>
        {([['risk', '1人ずつのリスク'], ['rate', '離職率（入社月ごと）']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)} className="px-3.5 py-2.5 text-[14px]" style={tab === k ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: 'var(--color-muted)' }}>{l}</button>
        ))}
      </div>
      <div key={tab} className="mo-axis">{tab === 'risk' ? <RiskTab /> : <RateTab />}</div>
      <p className="text-[11.5px] text-faint">年齢・性別・健康の申告は材料に入れていません。退職の扱い・面談での聞き方に迷ったら、最終判断は社労士・法務に確認してください。</p>
    </main>
  );
}

function RiskTab() {
  const canEdit = usePerms().can('jinji', 'edit');
  const { hit, toast } = useMotivation();
  const [booked, setBooked] = useState<Record<string, string>>({});
  const [by, setBy] = useState<Record<string, string>>({});
  const [when, setWhen] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [showLow, setShowLow] = useState(false);

  const rows = RISK_PEOPLE.map((p) => { const s = signals(p); return { p, s, lv: levelOf(s) }; }).sort((a, b) => ORDER.indexOf(a.lv) - ORDER.indexOf(b.lv) || b.s.length - a.s.length);
  const need = rows.filter((r) => r.lv !== 'low');
  const remain = need.filter((r) => !booked[r.p.id]).length;
  const shown = showLow ? rows : need;

  const book = (p: RiskPerson) => {
    const who = by[p.id] ?? MENDAN_BY[0]; const w = when[p.id] ?? MENDAN_WHEN[0];
    setBooked((b) => ({ ...b, [p.id]: `${who}・${w}` }));
    setFlash(p.id); setTimeout(() => setFlash(null), 1300); hit();
    toast({ text: `${p.name} の面談を入れました（${who}・${w}）`, sub: `→ ${who.split('（')[0]} のやることと、予約・面談の一覧に載りました`, undo: () => setBooked((b) => { const n = { ...b }; delete n[p.id]; return n; }) });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <RemainRing remain={remain} total={need.length} />
        <div className="text-[13px]"><b>面談を入れていない人 {remain}人</b><span className="ml-2 text-muted">早めに面談 {need.filter((r) => r.lv === 'high').length}・気にかける {need.filter((r) => r.lv === 'mid').length}</span>{!canEdit && <div className="text-[12px] text-bad">{needText('edit')}</div>}</div>
        <label className="ml-auto flex items-center gap-1.5 text-[12.5px] text-muted"><input type="checkbox" checked={showLow} onChange={(e) => setShowLow(e.target.checked)} />落ち着いている人も出す</label>
      </div>

      {remain === 0 && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-8 text-center"><Check className="mx-auto text-ok" size={24} /><div className="mt-2 text-[14px] font-bold">気になる人には、全員面談が入りました</div><div className="mt-1 text-[12.5px] text-muted">面談のあと、メモに残した言葉がまたここの材料になります。</div></div>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
          <thead><tr className="th-row text-left"><th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">見立て</th><th className="px-2 py-2.5 font-semibold">なぜ（材料）</th><th className="px-4 py-2.5 font-semibold">次の一手</th></tr></thead>
          <tbody>
            {shown.map(({ p, s, lv }, i) => (
              <tr key={p.id} className={`mo-fade-in border-t border-line-soft align-top ${flash === p.id ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                <td className="px-4 py-2.5"><Link href={`/jinji/staff/${p.id}`} className="font-semibold hover:underline">{p.name}</Link><div className="text-[11.5px] text-faint">{p.site}・入社{p.months}か月・最後の面談 {p.lastMendan}</div></td>
                <td className="px-2 py-2.5"><span className="chip" style={{ background: `var(--tone-${LV[lv].tone}-bg)`, color: `var(--tone-${LV[lv].tone}-fg)` }}>{LV[lv].label}</span></td>
                <td className="px-2 py-2.5">
                  {s.length === 0 ? <span className="text-[12.5px] text-faint">気になる材料はありません</span> : (
                    <ul className="flex flex-col gap-1">{s.map((x) => <li key={x.text} className="flex items-start gap-1.5 text-[12.5px]">{x.strong ? <AlertTriangle size={14} className="mt-0.5 shrink-0 text-bad" /> : <CircleAlert size={14} className="mt-0.5 shrink-0 text-warn" />}<span className={x.strong ? 'font-semibold' : ''}>{x.text}</span></li>)}</ul>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {booked[p.id] ? (
                    <div className="flex items-center gap-2 text-[12.5px]"><Check size={14} className="text-ok" />面談 {booked[p.id]}<button onClick={() => setBooked((b) => { const n = { ...b }; delete n[p.id]; return n; })} className="text-[12px] text-muted">戻す</button></div>
                  ) : lv !== 'low' ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select aria-label="面談の担当" value={by[p.id] ?? MENDAN_BY[0]} onChange={(e) => setBy((x) => ({ ...x, [p.id]: e.target.value }))} className="min-h-8 rounded-lg border border-field bg-surface px-1.5 text-[12.5px]">{MENDAN_BY.map((m) => <option key={m}>{m}</option>)}</select>
                      <select aria-label="面談の時期" value={when[p.id] ?? MENDAN_WHEN[0]} onChange={(e) => setWhen((x) => ({ ...x, [p.id]: e.target.value }))} className="min-h-8 rounded-lg border border-field bg-surface px-1.5 text-[12.5px]">{MENDAN_WHEN.map((m) => <option key={m}>{m}</option>)}</select>
                      <button onClick={() => book(p)} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} className="btn-primary inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-[12.5px] font-bold disabled:opacity-40"><CalendarPlus size={14} />面談を入れる</button>
                    </div>
                  ) : <span className="text-[12px] text-faint">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RateTab() {
  const pct = (v: number | null, n: number) => (v === null ? null : Math.round((v / n) * 100));
  const total = COHORTS.reduce((a, c) => a + c.n, 0);
  const judged3 = COHORTS.filter((c) => c.m3 !== null);
  const avg3 = Math.round((judged3.reduce((a, c) => a + (c.m3 ?? 0), 0) / judged3.reduce((a, c) => a + c.n, 0)) * 100);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div className="rounded-xl border border-line bg-surface px-4 py-3"><div className="text-[12px] text-muted">3か月の定着（判定が出た月）</div><div className="num text-[24px] font-bold">{avg3}<span className="text-[13px] text-muted">%</span></div></div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3"><div className="text-[12px] text-muted">対象の入場者</div><div className="num text-[24px] font-bold">{total}<span className="text-[13px] text-muted">人</span></div></div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead><tr className="th-row text-left"><th className="px-4 py-2.5 font-semibold">入社月（初回入場）</th><th className="px-2 py-2.5 font-semibold">人数</th>{['3か月', '6か月', '12か月'].map((h) => <th key={h} className="px-2 py-2.5 font-semibold">{h}後も在籍</th>)}</tr></thead>
          <tbody>
            {COHORTS.map((c, i) => (
              <tr key={c.month} className="row border-t border-line-soft">
                <td className="num px-4 py-2.5 font-semibold">{c.month.replace('-', '年')}月</td>
                <td className="num px-2 py-2.5">{c.n}人</td>
                {[c.m3, c.m6, c.m12].map((v, j) => {
                  const p = pct(v, c.n);
                  return (
                    <td key={j} className="px-2 py-2.5">
                      {p === null ? <span className="text-[12px] text-faint">まだ届いていない</span> : (
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-28 overflow-hidden rounded-full bg-sunken"><div className="mo-bar h-full rounded-full" style={{ width: `${p}%`, background: p >= 85 ? 'var(--tone-ok-bar)' : p >= 75 ? 'var(--tone-caution-bar)' : 'var(--tone-bad-bar)', ['--i' as string]: i }} /></div>
                          <span className="num text-[12.5px]">{p}%<span className="ml-1 text-faint">（{v}人）</span></span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] leading-relaxed text-faint">数え方：初回入場の日から在籍を通しで数えます（現場替え・待機を挟んでも、退社していなければ在籍）。未経験で入った社員だけ。2026年1月以前の入場は、辞めた人の記録が残っておらず高く見えるため出していません。</p>
    </div>
  );
}
