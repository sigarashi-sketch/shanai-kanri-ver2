'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, CircleDashed, Minus } from 'lucide-react';
import { NEWCOMERS, STEPS, openRequired, type Newcomer, type StepKey, type StepState } from '@/lib/nyusha-sample';
import { daysFrom, fmtDate } from '@/lib/yoyaku-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';

// 入社手続き（人事管理）＝参画が決まった人・入社予定の人の手続きを、人ごとに進み具合つきで並べる。
//   ・入社日（＝手続きの期限）が近い順。必須の手続きが全部済んだ人は下の「終わった人」へ
//   ・印は押すだけ（まだ → 済み）。任意の手続きは「まだ → 済み → 対象外」と回る
//   ・freee・クラウドサインからは自動で取っていない（今のシステムと同じく手で付ける）
//   ?p=<社員id> でその人のカードを開いた状態から始める（社員ページから）
type Filter = 'すべて' | '入社予定' | '参画決定';

const next = (st: StepState, optional?: boolean): StepState => st === 'まだ' ? '済み' : st === '済み' && optional ? '対象外' : 'まだ';
const STEP_STYLE: Record<StepState, React.CSSProperties> = {
  済み: { background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)', borderColor: 'transparent' },
  対象外: { background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)', borderColor: 'transparent' },
  まだ: { borderColor: 'var(--color-field)' },
};

export default function NyushaPage() {
  const canEdit = usePerms().can('jinji', 'edit');
  const { hit, toast } = useMotivation();
  const [rows, setRows] = useState<Newcomer[]>(NEWCOMERS);
  const [filter, setFilter] = useState<Filter>('すべて');
  const [flash, setFlash] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => { const p = new URLSearchParams(window.location.search).get('p'); if (p) setFocus(p); }, []);
  // 社員ページから来たら、その人のカードまで送る
  useEffect(() => { if (focus) document.getElementById(`nc-${focus}`)?.scrollIntoView({ block: 'center' }); }, [focus]);

  const totalOpen = NEWCOMERS.reduce((s, n) => s + openRequired(n), 0);
  const remain = rows.reduce((s, n) => s + openRequired(n), 0);
  const sorted = [...rows].sort((a, b) => a.joinOn.localeCompare(b.joinOn));
  const working = sorted.filter((n) => openRequired(n) > 0 && (filter === 'すべて' || n.kind === filter));
  const finished = sorted.filter((n) => openRequired(n) === 0);

  const mark = (n: Newcomer, key: StepKey) => {
    const step = STEPS.find((s) => s.key === key)!;
    const prev = n.steps[key];
    const nv = next(prev, step.optional);
    const after = rows.map((r) => (r.id === n.id ? { ...r, steps: { ...r.steps, [key]: nv } } : r));
    setRows(after);
    setFlash(n.id); setTimeout(() => setFlash(null), 1300);
    if (nv === 'まだ') return; // 戻しただけなら数えない
    hit();
    const left = openRequired(after.find((r) => r.id === n.id)!);
    toast({
      text: nv === '対象外' ? `${n.name} の${step.label}を「対象外」にしました` : left === 0 ? `${n.name} の必須の手続きがぜんぶ済みました` : `${n.name} の${step.label}を済みにしました（残り ${left}）`,
      sub: nv === '対象外' ? '→ この人の手続きの一覧から外しました' : left === 0 ? '→ 参画決定者の手続き（労務への引き継ぎ）に回しました' : step.to,
      // その印だけ元に戻す（続けて2つ押してから1つ目を取り消しても、2つ目は残る）
      undo: () => setRows((rs) => rs.map((r) => (r.id === n.id ? { ...r, steps: { ...r.steps, [key]: prev } } : r))),
    });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="入社手続き" sub="参画が決まった人・入社予定の人の手続き。入社日が近い順に、終わったものに印を付けます・見本データ" />

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={remain} total={totalOpen} />
        <div className="text-[13px]"><b>残りの手続き {remain}件</b><span className="ml-2 text-muted">{rows.filter((r) => openRequired(r) > 0).length}人ぶん</span>
          <div className="text-[12px] text-muted">freee・クラウドサインからは自動で取っていません。確かめたら印を押してください。{!canEdit && <span className="text-bad"> {needText('edit')}</span>}</div>
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {(['すべて', '入社予定', '参画決定'] as Filter[]).map((f) => {
            const n = rows.filter((r) => openRequired(r) > 0 && (f === 'すべて' || r.kind === f)).length;
            return <button key={f} onClick={() => setFilter(f)} className={`min-h-8 rounded-full border px-3 text-[12.5px] ${filter === f ? 'font-semibold' : 'text-muted'}`} style={filter === f ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>{f} {n}</button>;
          })}
        </div>
      </div>

      {remain === 0 ? (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-10 text-center">
          <Check className="mx-auto text-ok" size={26} />
          <div className="mt-2 text-[15px] font-bold">入社の手続きはぜんぶ済みました</div>
          <div className="mt-1 text-[12.5px] text-muted">新しく参画が決まった人は、ここに自動で並びます。</div>
        </div>
      ) : working.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-6 py-8 text-center text-[13px] text-muted">「{filter}」で手続きが残っている人はいません。</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {working.map((n, i) => {
            const req = STEPS.filter((s) => !s.optional);
            const done = req.filter((s) => n.steps[s.key] === '済み').length;
            const d = daysFrom(n.joinOn);
            const tone = d <= 5 ? 'bad' : d <= 10 ? 'warn' : 'info';
            return (
              <article key={n.id} id={`nc-${n.id}`} className={`mo-fade-up rounded-xl border bg-surface p-4 ${flash === n.id ? 'mo-flash' : ''}`} style={{ ['--i' as string]: i + 2, borderColor: focus === n.id ? 'var(--a)' : 'var(--color-line)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/jinji/staff/${n.id}`} className="text-[15px] font-bold hover:underline">{n.name}</Link>
                  <span className="chip" style={{ background: n.kind === '参画決定' ? 'var(--tone-ok-bg)' : 'var(--tone-info-bg)', color: n.kind === '参画決定' ? 'var(--tone-ok-fg)' : 'var(--tone-info-fg)' }}>{n.kind}</span>
                  <span className="text-[12px] text-faint">{n.site}・採用 {n.recruiter}</span>
                  <span className="num ml-auto whitespace-nowrap text-[12.5px] font-semibold" style={{ color: `var(--tone-${tone}-fg)` }}>入社 {fmtDate(n.joinOn)}・あと{d}日</span>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
                    <div key={done} className="mo-bar h-full rounded-full" style={{ width: `${(done / req.length) * 100}%`, background: 'var(--tone-ok-bar)' }} />
                  </div>
                  <span className="num text-[12px] text-muted">{done}/{req.length}</span>
                </div>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {STEPS.map((s) => {
                    const st = n.steps[s.key];
                    const Icon = st === '済み' ? Check : st === '対象外' ? Minus : CircleDashed;
                    return (
                      <li key={s.key}>
                        <button onClick={() => mark(n, s.key)} disabled={!canEdit} title={!canEdit ? needText('edit') : s.optional ? '任意：まだ → 済み → 対象外' : 'まだ ⇄ 済み'}
                          aria-label={`${n.name} の${s.label}（${st}）`} className={`inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-50 ${st === 'まだ' ? '' : 'font-semibold'}`} style={STEP_STYLE[st]}>
                          <Icon size={13} className={st === 'まだ' ? 'text-faint' : ''} />{s.label}{s.optional && <span className="text-[10.5px] opacity-70">任意</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      )}

      {finished.length > 0 && (
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <div className="text-[12px] font-semibold text-muted">必須の手続きが終わった人</div>
          <ul className="mt-2 flex flex-col gap-1 text-[12.5px]">
            {finished.map((n) => (
              <li key={n.id} className={`flex flex-wrap items-center gap-2 rounded-md ${flash === n.id ? 'mo-flash' : ''}`}>
                <Check size={14} className="text-ok" />
                <Link href={`/jinji/staff/${n.id}`} className="font-semibold hover:underline">{n.name}</Link>
                <span className="text-faint">入社 {fmtDate(n.joinOn)}・{n.site}</span>
                <Link href="/jinji/jimu" className="ml-auto text-[12px] font-semibold" style={{ color: 'var(--ad)' }}>労務への引き継ぎを見る</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11.5px] text-faint">雇用契約・社会保険・雇用保険の手続きの要否や期限は、最終判断は社労士に確認してください。健康診断は受けたかどうかだけを残し、結果の中身は載せません。</p>
    </main>
  );
}
