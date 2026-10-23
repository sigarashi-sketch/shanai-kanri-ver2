'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { APPROVALS, RESERVATIONS, TODOS, type Todo } from '@/lib/sample';
import { MODULES } from '@/lib/theme';
import { CountUp, RemainRing, useMotivation } from '@/components/Motivation';
import { usePerms } from '@/components/Perms';

const SHORT = Object.fromEntries(MODULES.map((m) => [m.key, m.short]));
const FLOW: Record<string, string> = {
  roumu: '→ 勤怠の締めに反映しました',
  eigyo: '→ 担当営業のやることに載りました',
  jinji: '→ 社員ページの履歴に残りました',
  keiri: '→ 請求書づくりの確認リストに載りました',
};

export default function HomePage() {
  const { hit, toast } = useMotivation();
  const { can, perms } = usePerms();
  // 見えない分類のものは出さない。承認は「承認」を持つ分類だけ。
  const mine = TODOS.filter((t) => can(t.module, 'view'));
  const myApprovals = APPROVALS.filter((a) => can(a.module, 'approve'));
  const myReservations = RESERVATIONS.filter((r) => can(r.module, 'view'));
  const kpis = [
    { m: 'jinji', label: '稼働中', n: 251, unit: '人', sub: '先月より +6', subC: 'var(--color-ok)' },
    { m: 'eigyo', label: '待機', n: 26, unit: '人', sub: '平均 18日', subC: 'var(--color-warn)' },
    { m: 'roumu', label: '今月の打刻漏れ', n: 41, unit: '件', sub: '未修正 12', subC: 'var(--color-muted)' },
    { m: 'keiri', label: '請求の下書き', n: 18, unit: '社', sub: '締め 11/5', subC: 'var(--color-muted)' },
  ].filter((k) => perms[k.m as keyof typeof perms] !== 'none');
  const [todos, setTodos] = useState<Todo[]>(mine);
  const [flashing, setFlashing] = useState<string | null>(null);
  const total = mine.length;

  const done = (t: Todo) => {
    setFlashing(t.text);
    setTimeout(() => {
      setTodos((xs) => xs.filter((x) => x.text !== t.text));
      setFlashing(null);
      hit();
      toast({ text: `「${t.text}」を片づけました`, sub: FLOW[t.module], undo: () => setTodos((xs) => (xs.some((x) => x.text === t.text) ? xs : [t, ...xs])) });
    }, 450);
  };

  return (
    <main className="flex flex-col gap-[18px] px-6 pb-12 pt-[22px]">
      <div className="mo-fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[12.5px] text-muted">10月22日（木）・見本データ</div>
          <h1 className="mt-0.5 text-[22px] font-bold tracking-tight">
            おはようございます。今日の対応は <span className="text-bad">{todos.length + myApprovals.length}件</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href="/jinji/yoyaku" className="btn inline-flex min-h-10 items-center rounded-[10px] border border-field bg-surface px-3.5 text-[13.5px] font-semibold">変更を予約</Link>
          <Link href="/roumu/approval" className="btn inline-flex min-h-10 items-center rounded-[10px] bg-sumi px-4 text-[13.5px] font-semibold text-white">上から順に片づける</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {kpis.map((k, i) => (
          <div key={k.label} className="mo-fade-up rounded-xl border border-line bg-surface px-[18px] py-4" style={{ ['--i' as string]: i + 1, borderTop: `3px solid var(--c-${k.m})` }}>
            <div className="text-[12.5px] text-muted">{k.label}</div>
            <div className="text-[30px] font-bold tracking-tight"><CountUp to={k.n} /><small className="ml-1 text-[13px] font-medium">{k.unit}</small></div>
            <div className="text-[12px]" style={{ color: k.subC }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 5 }}>
          <div className="flex items-center justify-between px-[18px] py-3">
            <div><h2 className="text-[15px] font-bold">対応が要るもの</h2><div className="text-[12px] text-muted">件数を押すと処理画面へ・✓で片づけ</div></div>
            <RemainRing remain={todos.length} total={total} />
          </div>
          {todos.length === 0 ? (
            <div className="mo-scale-in m-4 rounded-xl border border-ok-line bg-ok-soft px-5 py-6 text-center">
              <div className="text-[15px] font-bold text-ok">今日の対応はぜんぶ片づきました</div>
              <div className="mt-1 text-[13px] text-ok">次は「7日以内に切り替わる予約」の確認がおすすめです</div>
            </div>
          ) : (
            <div className="flex flex-col">
              {todos.map((t) => (
                <div key={t.text} className={`flex items-center gap-3 border-t border-line-soft px-[18px] py-2.5 ${flashing === t.text ? 'mo-flash' : ''}`}>
                  <i className="size-2 rounded-full" style={{ background: `var(--c-${t.module})` }} />
                  <span className="w-8 text-[11.5px] font-semibold text-muted">{SHORT[t.module]}</span>
                  <span className="flex-1 text-[13.5px]">{t.text}</span>
                  <Link href={t.href} className={`num font-bold ${t.tone === 'bad' ? 'text-bad' : t.tone === 'warn' ? 'text-warn' : ''}`}>{t.n}</Link>
                  <button onClick={() => done(t)} aria-label={`${t.text}を片づけた`} className="flex size-8 items-center justify-center rounded-lg border border-line text-muted hover:border-ok hover:text-ok"><Check size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 6 }}>
          <div className="flex items-center justify-between px-[18px] py-3.5">
            <h2 className="text-[15px] font-bold">あなたが承認する分</h2>
            <span className="rounded-full bg-[var(--tone-purple-bg)] px-2.5 py-0.5 text-[12px] text-info">✦ AIが先に確認済み・要注意 2</span>
          </div>
          {myApprovals.length === 0 && <div className="border-t border-line-soft px-[18px] py-6 text-center text-[13px] text-muted">承認の権限がある分類はありません</div>}
          {myApprovals.map((a) => (
            <Link key={a.text} href={a.href} className="row flex items-center gap-3 border-t border-line-soft px-[18px] py-2.5">
              <i className="size-2 rounded-full" style={{ background: `var(--c-${a.module})` }} />
              <span className="flex-1 text-[13.5px]">{a.text}</span>
              <b className="num">{a.n}</b><ChevronRight size={16} className="text-faint" />
            </Link>
          ))}
        </section>
      </div>

      <section className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 7 }}>
        <div className="flex items-center justify-between px-[18px] py-3.5">
          <h2 className="text-[15px] font-bold">7日以内に切り替わる予約</h2>
          <span className="flex items-center gap-1.5 text-[12px] text-muted"><i className="mo-pulse size-[7px] rounded-full bg-ok" />毎朝6:00に自動で切り替え</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead><tr className="bg-soft text-left text-muted">
              <th className="px-[18px] py-2.5 font-semibold">適用日</th><th className="px-2 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">分類</th><th className="px-2 py-2.5 font-semibold">変更前 → 変更後</th><th className="px-[18px] py-2.5 font-semibold">一緒に変わるもの</th>
            </tr></thead>
            <tbody>
              {myReservations.map((r, i) => (
                <tr key={r.person + r.field} className="row mo-fade-in border-t border-line-soft" style={{ ['--i' as string]: 8 + i }}>
                  <td className="px-[18px] py-2.5 font-semibold">{r.date}</td>
                  <td className="px-2 py-2.5">{r.person}</td>
                  <td className="px-2 py-2.5"><span className="font-bold"><span style={{ color: `var(--c-${r.module})` }}>●</span> {SHORT[r.module]}</span> {r.field}</td>
                  <td className="px-2 py-2.5"><s className="text-faint">{r.from}</s> → <b>{r.to}</b></td>
                  <td className="px-[18px] py-2.5 text-muted">{r.with}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
