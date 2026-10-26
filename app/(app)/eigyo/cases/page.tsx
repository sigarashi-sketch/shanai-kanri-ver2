'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Ban, Check, Send, Search } from 'lucide-react';
import { PageTitle, SkeletonRows } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing } from '@/components/Motivation';
import { LiveBanner, useIke } from '@/components/Live';
import { useCaseSend } from '@/components/CaseSendDialog';
import { liveCandidates, liveStock, matchOf } from '@/lib/live/cases';
import type { EngineerRows, ProgressData } from '@/lib/live/eigyo-common';
import { PersonName } from '@/components/Person';

// 案件（営業）＝案件ストックの一覧。案件を選ぶと、合いそうな要員（待機中・もうすぐ待機）を点数順に当てる。
//   ・選んだ要員に送る → 案件進捗の「送った案件」に載る（返信待ち）
//   ・アダルト・店舗運営系は送れない（ボタンが押せず理由を出す）。今のシステムの送信の共通関数と同じ考え
//   本物（ログイン中）：案件＝今の /api/proxy?action=getProgressData の cases（直近14日＋送ったことのある案件）、
//     要員＝/api/roster?action=getEngineerRows の営業中の人。送る＝確認の窓のあと今の配信画面の「送信」と同じ口（components/CaseSendDialog）
const SHOURYU_STYLE: Record<string, { bg: string; fg: string }> = {
  エンド直: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)' },
  元請けから: { bg: 'var(--tone-info-bg)', fg: 'var(--tone-info-fg)' },
  二次請けから: { bg: 'var(--tone-caution-bg)', fg: 'var(--tone-caution-fg)' },
  不明: { bg: 'var(--tone-mute-bg)', fg: 'var(--tone-mute-fg)' },
};
const scoreColor = (n: number) => (n >= 80 ? 'var(--color-ok)' : n >= 60 ? 'var(--color-warn)' : 'var(--color-faint)');

export default function CasesPage() {
  const perm = usePerms().can('eigyo', 'edit');
  const pd = useIke<ProgressData>('proxy?action=getProgressData');
  const live = pd.live;
  const er = useIke<EngineerRows>(live ? 'roster?action=getEngineerRows&area=main' : null);
  const STOCKS = useMemo(() => liveStock(live ? pd.data : null), [live, pd.data]);
  const PEOPLE_ = useMemo(() => liveCandidates(er.data), [er.data]);
  const canEdit = perm && live;
  const cs = useCaseSend();
  const ngOf = (x: (typeof STOCKS)[number]) => x.ng ?? null;
  const sentN = (x: (typeof STOCKS)[number]) => (x.sentTo ?? 0) + (sent[x.no]?.length ?? 0);
  const [q, setQ] = useState('');
  const [cur, setCur] = useState<string>('');
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [sent, setSent] = useState<Record<string, string[]>>({});
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => { const c = new URLSearchParams(window.location.search).get('case'); if (c) setCur(c); }, []);

  const rows = STOCKS.filter((c) => !q || `${c.name}${c.place}${c.skills.join('')}${c.work}`.includes(q));
  const sendable = STOCKS.filter((c) => !ngOf(c));
  const remain = sendable.filter((c) => !sentN(c)).length;
  const c = STOCKS.find((x) => x.no === cur) ?? STOCKS[0];
  const ng = c ? ngOf(c) : null;
  const matches = c ? PEOPLE_.map((p) => ({ p, ...matchOf(c, p) })).sort((a, b) => b.score - a.score).slice(0, 20) : [];
  const picked = c ? matches.filter((m) => pick[m.p.id] && !(sent[c.no] ?? []).includes(m.p.id)) : [];

  const choose = (no: string) => { setCur(no); setPick({}); window.history.replaceState(null, '', `?case=${no}`); };
  const send = () => {
    if (!canEdit || !c || ng || !picked.length) return;
    const no = c.no, ids = picked.map((m) => m.p.id);
    cs.open(no, picked.map((m) => m.p.name), () => { setSent((s) => ({ ...s, [no]: [...(s[no] ?? []), ...ids] })); setPick({}); setFlash(no); setTimeout(() => setFlash(null), 1300); pd.reload(); });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="案件" sub="案件ストックと、合いそうな要員。選んで送ると案件進捗に載ります">
        <Link href="/eigyo/progress" className="btn-secondary">案件進捗を開く</Link>
      </PageTitle>
      <LiveBanner state={pd.state} error={pd.error} onReload={pd.reload} note={`今の案件ストック（直近14日＋送ったことのある案件）${STOCKS.length}件。単価・駅・スキルは本文から読める分だけ。送るときは送り先と本文を確かめてから送ります`} />

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={remain} total={sendable.length} />
        <div className="text-body"><b>まだ誰にも送っていない案件 {remain}件</b><span className="ml-2 text-muted">送れない案件 {STOCKS.length - sendable.length}件</span>
          {!canEdit && <div className="text-sm text-bad">{needText('edit')}</div>}
        </div>
        <label className="ml-auto flex min-h-9 items-center gap-1.5 rounded-[10px] border border-field bg-surface px-2.5 text-body">
          <Search size={14} className="text-faint" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="案件名・場所・スキルで探す" className="w-52 min-w-0 bg-transparent outline-none" />
        </label>
      </div>

      {remain === 0 && STOCKS.length > 0 && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-6 text-center">
          <Check className="mx-auto text-ok" size={24} /><div className="mt-1.5 text-md font-bold">送れる案件は、ぜんぶ誰かに送りました</div>
          <div className="mt-1 text-sm text-muted">返信は <Link href="/eigyo/progress" className="font-semibold" style={{ color: 'var(--ad)' }}>案件進捗</Link> で見られます。</div>
        </div>
      )}

      <div className="grid gap-3.5 lg:grid-cols-[1.25fr_1fr]">
        <div className="mo-fade-up overflow-x-auto rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
          <table className="w-full min-w-[720px] border-collapse text-body">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">案件</th><th className="px-2 py-2.5 font-semibold">単価</th><th className="px-2 py-2.5 font-semibold">スキル</th><th className="px-2 py-2.5 font-semibold">商流</th><th className="px-2 py-2.5 font-semibold">登録</th><th className="px-4 py-2.5 font-semibold">送った</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const bad = ngOf(r);
                return (
                  <tr key={r.no} onClick={() => choose(r.no)} className={`mo-fade-in cursor-pointer border-t border-line-soft align-top ${flash === r.no ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i, ...(cur === r.no ? { background: 'var(--al)' } : {}) }}>
                    <td className="px-4 py-2.5"><div className="font-semibold">{r.name}</div><div className="text-xs text-faint">{r.no}{r.station && `・${r.station}駅`}{r.start !== '—' && `・${r.start}〜`}</div></td>
                    <td className="num whitespace-nowrap px-2 py-2.5">{r.priceMax ? (r.priceMin === r.priceMax ? `${r.priceMax}万` : `${r.priceMin}〜${r.priceMax}万`) : <span className="text-faint">本文に</span>}</td>
                    <td className="px-2 py-2.5"><div className="flex flex-wrap gap-1">{r.skills.length ? r.skills.map((s) => <span key={s} className="chip" style={{ background: 'var(--as)', color: 'var(--ad)' }}>{s}</span>) : <span className="text-faint">—</span>}</div></td>
                    <td className="whitespace-nowrap px-2 py-2.5"><span className="chip" style={{ background: SHOURYU_STYLE[r.shouryu].bg, color: SHOURYU_STYLE[r.shouryu].fg }}>{r.shouryu}</span></td>
                    <td className="num whitespace-nowrap px-2 py-2.5"><span className={r.daysLeft <= 2 ? 'font-bold text-bad' : ''}>{r.deadline}</span><div className="text-xs text-faint">{`${r.ageDays}日前`}</div></td>
                    <td className="whitespace-nowrap px-4 py-2.5">{bad ? <span className="chip" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}><Ban size={11} />送れない</span> : sentN(r) ? <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>{sentN(r)}人</span> : <span className="text-faint">まだ</span>}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-body text-muted">{q ? <>「{q}」に合う案件はありません。<button onClick={() => setQ('')} className="ml-1 font-semibold underline">検索を消す</button></> : pd.state === 'loading' ? '読み込み中…' : pd.state === 'error' ? '案件を読み込めませんでした' : '案件はまだありません'}</td></tr>}
            </tbody>
          </table>
        </div>

        {!c ? <div className="self-start rounded-xl border border-line bg-surface px-5 py-8 text-center text-body text-muted">{pd.state === 'loading' ? <SkeletonRows rows={4} cols={2} /> : '案件がありません'}</div> : (
        <article key={c.no} className="mo-spring-in self-start rounded-xl border border-line bg-surface">
          <div className="border-b border-line-soft px-5 py-3">
            <div className="text-md font-bold">{c.name}</div>
            <div className="mt-0.5 text-sm text-muted">{`${c.no}・登録 ${c.deadline}${c.station ? `・${c.station}駅` : ''}`}</div>
            <div className="mt-2 max-h-52 overflow-y-auto whitespace-pre-line rounded-[10px] bg-soft px-3 py-2 text-sm">{c.content}</div>
          </div>
          {ng ? (
            <div className="mo-shake m-4 flex items-start gap-2 rounded-[10px] border px-3 py-2.5 text-body" style={{ borderColor: 'var(--color-bad-line)', background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>
              <Ban size={16} className="mt-0.5 shrink-0" /><div><b>{ng}</b><div className="mt-0.5 text-sm">この種類の案件は、誰にも送らない決まりです。送るボタンは押せません。</div></div>
            </div>
          ) : null}
          <div className="px-5 py-3">
            <div className="text-sm font-semibold text-muted">合いそうな要員（プロパーリストの営業中・上位20人）</div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {!matches.length && <li className="px-3 py-2 text-sm text-muted">{er.state === 'loading' ? '読み込み中…' : er.state === 'error' ? '要員を読み込めませんでした' : '営業中の要員はまだいません'}</li>}
              {matches.map(({ p, score, why }) => {
                const done = (sent[c.no] ?? []).includes(p.id);
                return (
                  <li key={p.id} className="flex items-center gap-2.5 rounded-[10px] border border-line-soft px-3 py-2">
                    <input type="checkbox" aria-label={`${p.name} を選ぶ`} disabled={!!ng || done || !canEdit} checked={done || !!pick[p.id]} onChange={(e) => setPick((s) => ({ ...s, [p.id]: e.target.checked }))} />
                    <div className="min-w-0 flex-1">
                      <PersonName name={p.name} className="text-body font-semibold underline-offset-2 hover:underline" />
                      <span className="ml-1.5 text-xs text-faint">営業中・{p.station || '駅なし'}・{p.want}</span>
                      <div className="text-xs text-muted">{why.join('・')}</div>
                    </div>
                    {done ? <span className="text-sm text-ok">送りました</span> : <span className="num w-9 text-right text-body font-bold" style={{ color: scoreColor(score) }}>{score}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-5 py-3">
            <button onClick={send} disabled={!canEdit || !!ng || !picked.length || cs.busy} title={!canEdit ? needText('edit') : ng ?? (!picked.length ? '送る人を選んでください' : undefined)} className="btn-primary"><Send size={15} />{cs.busy ? '送り先を確かめています…' : `選んだ ${picked.length}人に送って案件進捗に載せる`}</button>
            {sentN(c) > 0 && <Link href="/eigyo/progress" className="text-sm font-semibold" style={{ color: 'var(--ad)' }}>案件進捗で返信を見る</Link>}
          </div>
        </article>
        )}
      </div>
      <p className="text-xs text-faint">点数は スキル（本文とサマリから拾った資格名）・通勤時間の目安 から出した目安です（駅の場所が分からない人は通勤90分として数えます）。送るのは本人の LINE グループ（今の配信画面と同じ口）。</p>
      {cs.node}
    </main>
  );
}
