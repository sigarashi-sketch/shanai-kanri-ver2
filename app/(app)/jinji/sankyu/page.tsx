'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Baby, Check, Send } from 'lucide-react';
import { CASES, EXTEND, TODAY, TODOS, type Base, type ExtendKey, type SankyuCase, type Todo } from '@/lib/sankyu-sample';
import { PageTitle } from '@/components/ui';
import { NotInLegacy } from '@/components/Live';
import { PersonName } from '@/components/Person';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';

// 産休・育休（人事管理）。
//   ・出産の予定日を選ぶと、産前（6週・多胎は14週）・産後（8週）・育休（原則1歳の前日まで・延長は最長2歳）を自動で出す
//   ・手続きのやることを時期つきのチェックリストに。社保・給付金は「労務担当（freee）へ渡す」だけ（ここの管轄外）
//   ・状態の切り替えと復帰予定は 変更の予約（/jinji/yoyaku）で入れる
//   妊娠・出産は健康にかかわる情報 → 人事の中だけで見る。スキシ・客先に出すものには載せない
const D = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const add = (s: string, n: number) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const addMonths = (s: string, m: number) => { const d = D(s); d.setUTCMonth(d.getUTCMonth() + m); return iso(d); };
const WD = '日月火水木金土';
const fmt = (s: string) => { const d = D(s); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`; };
const daysFromToday = (s: string) => Math.round((D(s).getTime() - D(TODAY).getTime()) / 86400000);

function periods(c: SankyuCase, ext: ExtendKey) {
  const months = EXTEND.find((e) => e.key === ext)!.months;
  const self = c.kind === '本人の出産';
  const preStart = add(c.due, -(c.multi ? 14 * 7 : 6 * 7) + 1);
  const postEnd = add(c.due, 8 * 7);
  const ikujiStart = self ? add(postEnd, 1) : c.due;
  const ikujiEnd = add(addMonths(c.due, months), -1);
  return { self, preStart, postEnd, ikujiStart, ikujiEnd };
}

const WHO_TONE: Record<Todo['who'], string> = { 'うち（人事）': 'info', '現場・営業': 'caution', '労務担当（freee）へ渡す': 'purple' };

export default function SankyuPage() {
  const canEdit = usePerms().can('jinji', 'edit');
  const { hit, toast } = useMotivation();
  const [cases, setCases] = useState(CASES);
  const [curId, setCurId] = useState(CASES[0].id);
  const [ext, setExt] = useState<Record<string, ExtendKey>>({});
  const [done, setDone] = useState<Record<string, boolean>>({ 'k1:t1': true, 'k1:t2': true });
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => { const p = new URLSearchParams(window.location.search).get('id'); if (p && CASES.some((c) => c.id === p)) setCurId(p); }, []);

  const cur = cases.find((c) => c.id === curId)!;
  const e = ext[cur.id] ?? '1y';
  const p = periods(cur, e);
  const baseOf: Record<Base, string> = { due: cur.due, preStart: p.preStart, ikujiStart: p.ikujiStart, ikujiEnd: p.ikujiEnd };
  const todos = TODOS.filter((t) => !t.only || t.only === cur.kind).map((t) => ({ ...t, date: add(baseOf[t.base], t.off) })).sort((a, b) => a.date.localeCompare(b.date));
  const key = (t: Todo) => `${cur.id}:${t.id}`;
  const remain = todos.filter((t) => !done[key(t)]).length;

  const toggle = (t: Todo & { date: string }) => {
    const k = key(t); const v = !done[k];
    setDone((d) => ({ ...d, [k]: v }));
    if (!v) return;
    setFlash(k); setTimeout(() => setFlash(null), 1300); hit();
    toast({
      text: `${cur.person}：「${t.text}」を済みにしました`,
      sub: t.who === '労務担当（freee）へ渡す' ? '→ 労務担当のやることに渡しました（申請は freee 側で）' : t.who === '現場・営業' ? `→ 担当営業（${cur.sales}）のやることから外れました` : '→ 社員ページの手続きの記録に残りました',
      undo: () => setDone((d) => ({ ...d, [k]: false })),
    });
  };
  // 予定日・多胎・育休の終わりを変えたら、期間とやることの時期を出し直す（取り消しでこの人の元の値に戻す）
  const patchCase = (patch: Partial<SankyuCase>, text: string) => {
    const id = cur.id;
    const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, cur[k as keyof SankyuCase]])) as Partial<SankyuCase>;
    setCases((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    hit();
    toast({ text, sub: '→ 期間とやることの時期を出し直しました（社員ページの予定にも反映）', undo: () => setCases((cs) => cs.map((c) => (c.id === id ? { ...c, ...prev } : c))) });
  };
  const setDue = (v: string) => { if (v && v !== cur.due) patchCase({ due: v }, `${cur.person} の予定日を ${fmt(v)} にしました`); };
  const setMulti = (v: boolean) => patchCase({ multi: v }, `${cur.person} を${v ? '多胎（産前14週）' : '多胎でない（産前6週）'}にしました`);
  const setExtend = (v: ExtendKey) => {
    const id = cur.id, prev = e;
    setExt((x) => ({ ...x, [id]: v })); hit();
    toast({ text: `${cur.person} の育休を「${EXTEND.find((x) => x.key === v)!.label}」にしました`, sub: '→ 育休の終わりと、復帰に向けたやることの時期を出し直しました', undo: () => setExt((x) => ({ ...x, [id]: prev })) });
  };
  // 人ごとの残りのやること（上の人のボタンに出す）
  const remainOf = (c: SankyuCase) => TODOS.filter((t) => (!t.only || t.only === c.kind) && !done[`${c.id}:${t.id}`]).length;

  const bars = [
    ...(p.self ? [{ label: '産前', from: p.preStart, to: add(cur.due, 0), tone: 'caution' }, { label: '産後', from: add(cur.due, 1), to: p.postEnd, tone: 'warn' }] : []),
    { label: '育休', from: p.ikujiStart, to: p.ikujiEnd, tone: 'purple' },
  ];
  const span0 = D(bars[0].from).getTime(); const span = D(p.ikujiEnd).getTime() - span0 || 1;

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="産休・育休" sub="予定日を選ぶと期間とやることを自動で出します。社保・給付金の申請は労務担当（freee）へ渡すだけ・見本データ" />
      <NotInLegacy what="産休・育休の管理" />

      <div className="mo-fade-up flex flex-wrap gap-2" style={{ ['--i' as string]: 1 }}>
        {cases.map((c) => (
          <button key={c.id} onClick={() => setCurId(c.id)} className="flex min-h-12 items-center gap-2 rounded-xl border bg-surface px-3.5 text-left" style={c.id === cur.id ? { borderColor: 'var(--a)', background: 'var(--al)' } : { borderColor: 'var(--color-line)' }}>
            <Baby size={16} style={{ color: 'var(--ad)' }} />
            <span><span className="block text-[13.5px] font-bold">{c.person}<span className="num ml-1.5 text-[11.5px] font-semibold" style={{ color: remainOf(c) ? 'var(--ad)' : 'var(--color-ok)' }}>{remainOf(c) ? `残り${remainOf(c)}` : '✓ 済み'}</span></span><span className="text-[11.5px] text-muted">{c.kind}・予定日 {fmt(c.due)}</span></span>
          </button>
        ))}
      </div>

      <section key={cur.id} className="mo-spring-in rounded-xl border border-line bg-surface" style={{ boxShadow: 'var(--card-shadow)' }}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-3">
          <PersonName name={cur.person} className="text-[17px] font-bold hover:underline underline-offset-2" />
          <span className="text-[12.5px] text-muted">{cur.site}・担当営業 {cur.sales}</span>
          <label className="ml-auto flex items-center gap-1.5 text-[12.5px] text-muted">予定日
            <input type="date" value={cur.due} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} onChange={(ev) => setDue(ev.target.value)} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-[13px] text-ink" />
          </label>
          {p.self && <label title={canEdit ? undefined : needText('edit')} className="flex items-center gap-1.5 whitespace-nowrap text-[12.5px]"><input type="checkbox" checked={cur.multi} disabled={!canEdit} onChange={(ev) => setMulti(ev.target.checked)} />多胎（双子など）</label>}
          <select aria-label="育休の終わり" value={e} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} onChange={(ev) => setExtend(ev.target.value as ExtendKey)} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-[13px]">
            {EXTEND.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </div>

        <div className="grid gap-4 px-5 py-4 md:grid-cols-3">
          {p.self && <Period label={`産前（${cur.multi ? '14' : '6'}週）`} from={p.preStart} to={cur.due} />}
          {p.self && <Period label="産後（8週）" from={add(cur.due, 1)} to={p.postEnd} />}
          <Period label={p.self ? '育休' : '育休（生まれた日から取れる）'} from={p.ikujiStart} to={p.ikujiEnd} />
        </div>
        <div className="px-5 pb-4">
          <div className="relative h-6 overflow-hidden rounded-full bg-sunken">
            {bars.map((b, i) => {
              const l = ((D(b.from).getTime() - span0) / span) * 100; const w = ((D(b.to).getTime() - D(b.from).getTime()) / span) * 100;
              return <div key={b.label} className="mo-bar absolute inset-y-0 flex items-center justify-center text-[11px] font-bold" style={{ left: `${l}%`, width: `${Math.max(w, 4)}%`, background: `var(--tone-${b.tone}-bg)`, color: `var(--tone-${b.tone}-fg)`, ['--i' as string]: i }}>{b.label}</div>;
            })}
          </div>
          <p className="mt-1.5 text-[11.5px] text-faint">産後の8週は実際に生まれた日から数えます。生まれたら予定日を生まれた日に選び直してください。{!p.self && '配偶者の出産は、生まれてから8週の間に最大4週の「産後パパ育休」も取れます。'}</p>
        </div>
      </section>

      <section className="mo-fade-up rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <div className="flex items-center gap-3 border-b border-line-soft px-5 py-3">
          <RemainRing remain={remain} total={todos.length} />
          <div className="text-[13px]"><b>やること 残り {remain}件</b><span className="ml-2 text-muted">時期の早い順</span>{!canEdit && <div className="text-[12px] text-bad">{needText('edit')}</div>}</div>
        </div>
        {remain === 0 ? (
          <div className="mo-scale-in px-6 py-8 text-center"><Check className="mx-auto text-ok" size={24} /><div className="mt-2 text-[14px] font-bold">{cur.person} の手続きはぜんぶ済みました</div><div className="mt-1 text-[12.5px] text-muted">復帰したら、社員ページの状態が「稼働中」に戻っているか確かめてください。</div></div>
        ) : (
          <ul>
            {todos.map((t) => {
              const k = key(t); const d = daysFromToday(t.date); const late = !done[k] && d < 0;
              return (
                <li key={t.id} className={`flex flex-wrap items-center gap-3 border-t border-line-soft px-5 py-2.5 first:border-t-0 ${flash === k ? 'mo-flash' : ''}`}>
                  <input type="checkbox" aria-label={t.text} checked={!!done[k]} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} onChange={() => toggle(t)} />
                  <span className="num w-[112px] text-[12.5px]" style={{ color: late ? 'var(--color-bad)' : undefined }}>{fmt(t.date)}{late && <span className="block text-[11px]">過ぎています</span>}</span>
                  <span className={`min-w-[200px] flex-1 text-[13px] ${done[k] ? 'text-faint line-through' : ''}`}>{t.text}</span>
                  {t.link && <Link href={t.link.href} className="text-[12px] font-semibold" style={{ color: 'var(--ad)' }}>{t.link.label}</Link>}
                  <span className="chip whitespace-nowrap" style={{ background: `var(--tone-${WHO_TONE[t.who]}-bg)`, color: `var(--tone-${WHO_TONE[t.who]}-fg)` }}>{t.who === '労務担当（freee）へ渡す' && <Send size={11} />}{t.who}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-[11.5px] leading-relaxed text-faint">
        法令のめやす：産前は出産予定日の6週間前（多胎は14週間前）から本人が求めれば休め、産後8週間は働かせられません（6週間を過ぎて本人が望み、医師が認めた仕事は可）（労働基準法 第65条）。育休は原則子が1歳になるまで、保育所に入れない等の事情があれば1歳6か月、さらに2歳まで延ばせます（育児・介護休業法）。
        社会保険・給付金の手続きは労務担当が freee で行います。最終判断は社労士・税理士・法務に確認してください。
      </p>
    </main>
  );
}

function Period({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <div className="rounded-[10px] bg-soft px-3.5 py-3">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="num mt-0.5 text-[14px] font-bold">{fmt(from)} 〜 {fmt(to)}</div>
    </div>
  );
}
