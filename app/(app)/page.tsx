'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { APPROVALS, TODOS, type Todo } from '@/lib/sample';
import { FIELD_RULES, daysFrom, fmtDate } from '@/lib/yoyaku-sample';
import { moduleOf, useYoyaku, within } from '@/components/YoyakuStore';
import { MODULES } from '@/lib/theme';
import { CountUp, RemainRing, useMotivation } from '@/components/Motivation';
import { needText, usePerms } from '@/components/Perms';
import { LIVE_WRITE_BLOCKED, LiveBanner, NotInLegacy, type LiveState } from '@/components/Live';
import { PersonName } from '@/components/Person';

// 本物（ログイン中）：/api/live/home（今の社内システムの読むだけの GET を3つまとめて件数だけ）。
//   出せるのは 稼働中・待機（ダッシュボードの workforce）／交通費・経費の承認待ち（keihi adminList）／請求で止まっている人（seikyu list の前回の結果）。
//   それ以外の「対応が要るもの」は、それぞれの画面を本物につないでから足す。✓で片づけるは本物では押せない
type HomeLive = {
  workforce: { active: number | null; roster: number | null; taisha: number | null; taiki: number | null } | null;
  keihi: { pending: number; yen: number } | null;
  seikyu: { ym: string; people: number; stop: number; review: number } | null;
  errors: Record<string, string>;
};
function useHomeLive() {
  const [data, setData] = useState<HomeLive | null>(null);
  const [state, setState] = useState<LiveState>('loading');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/live/home', { cache: 'no-store' });
      const j = (await r.json().catch(() => ({}))) as HomeLive & { error?: string };
      if (r.status === 401 && j.error === 'not_logged_in') { setState('sample'); return; }
      if (!r.ok) { setError(j.error || `読めませんでした（${r.status}）`); setState('error'); return; }
      setData(j); setError(''); setState('live');
    } catch (e) { setError((e as Error).message); setState('error'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { data, state, error, reload: load };
}
const todayJa = () => { const d = new Date(Date.now() + 9 * 3600e3); return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${'日月火水木金土'[d.getUTCDay()]}）`; };

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
  // 変更の予約と同じもの（7日以内に切り替わる・見られる分類だけ）
  const { rows: yoyaku } = useYoyaku();
  const myReservations = within(yoyaku, 7).filter((r) => can(moduleOf(r), 'view'));
  const kpis = [
    { m: 'jinji', label: '稼働中', n: 251, unit: '人', sub: '先月より +6', subC: 'var(--color-ok)' },
    { m: 'eigyo', label: '待機', n: 26, unit: '人', sub: '平均 18日', subC: 'var(--color-warn)' },
    { m: 'roumu', label: '今月の打刻漏れ', n: 41, unit: '件', sub: '未修正 12', subC: 'var(--color-muted)' },
    { m: 'keiri', label: '請求の下書き', n: 18, unit: '社', sub: '締め 11/5', subC: 'var(--color-muted)' },
  ].filter((k) => perms[k.m as keyof typeof perms] !== 'none');
  const [todos0, setTodos] = useState<Todo[]>(mine);
  const hl = useHomeLive();
  const L = hl.state === 'live' ? hl.data : null;
  // 本物のときは、本物で数えられるものだけ並べる（見本と混ぜない）
  const liveTodos: Todo[] = L?.seikyu && L.seikyu.stop > 0 ? [{ module: 'keiri', text: '請求で止まっている人（勤務表待ち・要対応）', n: `${L.seikyu.stop}人`, tone: 'warn', href: '/keiri/seikyu' }] : [];
  const liveApprovals: Todo[] = L?.keihi ? [{ module: 'keiri', text: '交通費・経費の申請', n: `${L.keihi.pending}件`, tone: 'plain', href: '/keiri/keihi' }] : [];
  const todos = L ? liveTodos.filter((t) => can(t.module, 'view')) : todos0;
  const approvalsShown = L ? liveApprovals.filter((a) => can(a.module, 'approve')) : myApprovals;
  const liveKpis = L ? [
    ...(L.workforce?.active != null ? [{ m: 'jinji', label: '稼働中', n: L.workforce.active, unit: '人', sub: `名簿 ${L.workforce.roster ?? '—'}人から退社・待機などを引いた数`, subC: 'var(--color-muted)' }] : []),
    ...(L.workforce?.taiki != null ? [{ m: 'eigyo', label: '待機', n: L.workforce.taiki, unit: '人', sub: '名簿で待機になっている人', subC: 'var(--color-warn)' }] : []),
    ...(L.keihi ? [{ m: 'keiri', label: '交通費・経費の承認待ち', n: L.keihi.pending, unit: '件', sub: `¥${L.keihi.yen.toLocaleString('ja-JP')}`, subC: 'var(--color-muted)' }] : []),
    ...(L.seikyu ? [{ m: 'keiri', label: '請求で止まっている', n: L.seikyu.stop, unit: '人', sub: `${Number(L.seikyu.ym.slice(5, 7))}月分・確認待ち ${L.seikyu.review}人`, subC: 'var(--color-muted)' }] : []),
  ].filter((k) => perms[k.m as keyof typeof perms] !== 'none') : null;
  const [flashing, setFlashing] = useState<string | null>(null);
  const total = L ? todos.length : mine.length;

  const done = (t: Todo) => {
    setFlashing(t.text);
    setTimeout(() => {
      setTodos((xs) => xs.filter((x) => x.text !== t.text));
      setFlashing(null);
      hit();
      toast({ text: `「${t.text}」を片づけました`, sub: FLOW[t.module], undo: () => setTodos((xs) => (xs.some((x) => x.text === t.text) ? xs : mine.filter((m) => m === t || xs.some((x) => x.text === m.text)))) });
    }, 450);
  };

  return (
    <main className="flex flex-col gap-[18px] px-6 pb-12 pt-[22px]">
      <div className="mo-fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[12.5px] text-muted">{L ? todayJa() : '10月23日（金）・見本データ'}</div>
          <h1 className="mt-0.5 text-[22px] font-bold tracking-tight">
            おはようございます。今日の対応は <span className="text-bad">{L ? todos.length + approvalsShown.length : todos.length + myApprovals.length}件</span>
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/jinji/yoyaku?new=1" className="btn inline-flex min-h-10 items-center rounded-[10px] border border-field bg-surface px-3.5 text-[13.5px] font-semibold">変更を予約</Link>
          <Link href="/roumu/approval" className="btn inline-flex min-h-10 items-center rounded-[10px] bg-sumi px-4 text-[13.5px] font-semibold text-white">上から順に片づける</Link>
        </div>
      </div>

      <LiveBanner state={hl.state} error={hl.error} onReload={hl.reload} note="本物で数えられる件数だけ出しています（稼働中・待機・交通費の承認待ち・請求で止まっている人）。稼働中・待機・交通費は未経験の人だけ（今のプロパーリストに入っている人）で数えています（請求は絞っていません）。片づけは各画面から" />

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {(liveKpis ?? kpis).map((k, i) => (
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
                  <span className="w-8 shrink-0 text-[11.5px] font-semibold text-muted">{SHORT[t.module]}</span>
                  <span className="min-w-0 flex-1 text-[13.5px]">{t.text}</span>
                  <Link href={t.href} className={`num whitespace-nowrap font-bold ${t.tone === 'bad' ? 'text-bad' : t.tone === 'warn' ? 'text-warn' : ''}`}>{t.n}</Link>
                  <button onClick={() => done(t)} disabled={!!L || !can(t.module, 'edit') || flashing === t.text} title={L ? LIVE_WRITE_BLOCKED : !can(t.module, 'edit') ? needText('edit') : undefined} aria-label={`${t.text}を片づけた`} className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line text-muted hover:border-ok hover:text-ok disabled:cursor-not-allowed disabled:opacity-40"><Check size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 6 }}>
          <div className="flex items-center justify-between px-[18px] py-3.5">
            <h2 className="text-[15px] font-bold">あなたが承認する分</h2>
            {!L && <span className="rounded-full bg-[var(--tone-purple-bg)] px-2.5 py-0.5 text-[12px] text-info">✦ AIが先に確認済み・要注意 2</span>}
          </div>
          {approvalsShown.length === 0 && <div className="border-t border-line-soft px-[18px] py-6 text-center text-[13px] text-muted">承認の権限がある分類はありません</div>}
          {approvalsShown.map((a) => (
            <Link key={a.text} href={a.href} className="row flex items-center gap-3 border-t border-line-soft px-[18px] py-2.5">
              <i className="size-2 rounded-full" style={{ background: `var(--c-${a.module})` }} />
              <span className="min-w-0 flex-1 text-[13.5px]">{a.text}</span>
              <b className="num whitespace-nowrap">{a.n}</b><ChevronRight size={16} className="text-faint" />
            </Link>
          ))}
        </section>
      </div>

      {L && <div className="text-[12px] text-faint">労務・人事の「対応が要るもの」と承認の件数は、それぞれの画面を本物につないでから、ここにも出します。</div>}
      {L && <NotInLegacy what="変更の予約" />}
      <section className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 7 }}>
        <div className="flex items-center justify-between px-[18px] py-3.5">
          <h2 className="text-[15px] font-bold">7日以内に切り替わる予約 <span className="num text-muted">{myReservations.length}</span></h2>
          <span className="flex items-center gap-3 text-[12px] text-muted"><span className="flex items-center gap-1.5"><i className="mo-pulse size-[7px] rounded-full bg-ok" />毎朝6:00に自動で切り替え</span><Link href="/jinji/yoyaku" className="font-semibold" style={{ color: 'var(--ad)' }}>すべての予約</Link></span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead><tr className="bg-soft text-left text-muted">
              <th className="px-[18px] py-2.5 font-semibold">適用日</th><th className="px-2 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">分類</th><th className="px-2 py-2.5 font-semibold">変更前 → 変更後</th><th className="px-[18px] py-2.5 font-semibold">一緒に変わるもの</th>
            </tr></thead>
            <tbody>
              {myReservations.length === 0 && <tr><td colSpan={5} className="px-[18px] py-6 text-center text-muted">7日以内に切り替わる予約はありません</td></tr>}
              {myReservations.map((r, i) => (
                <tr key={r.id} className="row mo-fade-in border-t border-line-soft" style={{ ['--i' as string]: 8 + i }}>
                  <td className="px-[18px] py-2.5"><b>{fmtDate(r.date)}</b><div className="text-[11.5px] text-faint">{daysFrom(r.date) === 0 ? '今日' : `あと${daysFrom(r.date)}日`}</div></td>
                  <td className="px-2 py-2.5"><PersonName name={r.person} className="underline-offset-2 hover:underline" /></td>
                  <td className="px-2 py-2.5"><span className="font-bold"><span style={{ color: `var(--c-${moduleOf(r)})` }}>●</span> {SHORT[moduleOf(r)]}</span> {r.field}{r.state === '承認待ち' && <span className="chip ml-1.5" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>承認待ち</span>}</td>
                  <td className="px-2 py-2.5"><s className="text-faint">{r.from}</s> → <b>{r.to}</b></td>
                  <td className="px-[18px] py-2.5 text-muted">{FIELD_RULES[r.field].with.join('／')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
