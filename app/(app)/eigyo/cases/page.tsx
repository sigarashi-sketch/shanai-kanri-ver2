'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ban, Check, Send, Search } from 'lucide-react';
import { STOCK, matchOf, ngReason, type StockCase } from '@/lib/cases-sample';
import { TAIKI } from '@/lib/taiki-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';

// 案件（営業）＝案件ストックの一覧。案件を選ぶと、合いそうな要員（待機中・もうすぐ待機）を点数順に当てる。
//   ・選んだ要員に送る → 案件進捗の「送った案件」に載る（返信待ち）
//   ・アダルト・店舗運営系は送れない（ボタンが押せず理由を出す）。今のシステムの送信の共通関数と同じ考え
const SHOURYU_STYLE: Record<string, { bg: string; fg: string }> = {
  エンド直: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)' },
  元請けから: { bg: 'var(--tone-info-bg)', fg: 'var(--tone-info-fg)' },
  二次請けから: { bg: 'var(--tone-caution-bg)', fg: 'var(--tone-caution-fg)' },
};
const scoreColor = (n: number) => (n >= 80 ? 'var(--color-ok)' : n >= 60 ? 'var(--color-warn)' : 'var(--color-faint)');

export default function CasesPage() {
  const canEdit = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const [q, setQ] = useState('');
  const [cur, setCur] = useState<string>(STOCK[0].no);
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [sent, setSent] = useState<Record<string, string[]>>({});
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => { const c = new URLSearchParams(window.location.search).get('case'); if (c && STOCK.some((s) => s.no === c)) setCur(c); }, []);

  const rows = STOCK.filter((c) => !q || `${c.name}${c.place}${c.skills.join('')}${c.work}`.includes(q));
  const sendable = STOCK.filter((c) => !ngReason(c));
  const remain = sendable.filter((c) => !sent[c.no]).length;
  const c = STOCK.find((x) => x.no === cur)!;
  const ng = ngReason(c);
  const matches = TAIKI.map((p) => ({ p, ...matchOf(c, p) })).sort((a, b) => b.score - a.score);
  const picked = matches.filter((m) => pick[m.p.id] && !(sent[c.no] ?? []).includes(m.p.id));

  const choose = (no: string) => { setCur(no); setPick({}); window.history.replaceState(null, '', `?case=${no}`); };
  const send = () => {
    if (!canEdit || ng || !picked.length) return;
    const before = sent;
    setSent((s) => ({ ...s, [c.no]: [...(s[c.no] ?? []), ...picked.map((m) => m.p.id)] }));
    setPick({}); setFlash(c.no); setTimeout(() => setFlash(null), 1300);
    hit(picked.length);
    toast({ text: `${c.name} を ${picked.map((m) => m.p.name).join('・')} に送りました`, sub: '→ 案件進捗の「送った案件」に載せました（返信待ち）', undo: () => setSent(before) });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="案件" sub="案件ストックと、合いそうな要員。選んで送ると案件進捗に載ります・見本データ">
        <Link href="/eigyo/progress" className="inline-flex min-h-10 items-center rounded-[10px] border border-field bg-surface px-3.5 text-[13px] font-semibold">案件進捗を開く</Link>
      </PageTitle>

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={remain} total={sendable.length} />
        <div className="text-[13px]"><b>まだ誰にも送っていない案件 {remain}件</b><span className="ml-2 text-muted">締切が2日以内 {sendable.filter((x) => !sent[x.no] && x.daysLeft <= 2).length}件・送れない案件 {STOCK.length - sendable.length}件</span>
          {!canEdit && <div className="text-[12px] text-bad">{needText('edit')}</div>}
        </div>
        <label className="ml-auto flex min-h-9 items-center gap-1.5 rounded-[10px] border border-field bg-surface px-2.5 text-[13px]">
          <Search size={14} className="text-faint" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="案件名・場所・スキルで探す" className="w-52 bg-transparent outline-none" />
        </label>
      </div>

      {remain === 0 && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-6 text-center">
          <Check className="mx-auto text-ok" size={24} /><div className="mt-1.5 text-[14.5px] font-bold">送れる案件は、ぜんぶ誰かに送りました</div>
          <div className="mt-1 text-[12.5px] text-muted">返信は <Link href="/eigyo/progress" className="font-semibold" style={{ color: 'var(--ad)' }}>案件進捗</Link> で見られます。</div>
        </div>
      )}

      <div className="grid gap-3.5 lg:grid-cols-[1.25fr_1fr]">
        <div className="mo-fade-up overflow-x-auto rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">案件</th><th className="px-2 py-2.5 font-semibold">単価</th><th className="px-2 py-2.5 font-semibold">スキル</th><th className="px-2 py-2.5 font-semibold">商流</th><th className="px-2 py-2.5 font-semibold">締切</th><th className="px-4 py-2.5 font-semibold">送った</th>
            </tr></thead>
            <tbody>
              {rows.map((r: StockCase, i) => {
                const bad = ngReason(r);
                return (
                  <tr key={r.no} onClick={() => choose(r.no)} className={`mo-fade-in cursor-pointer border-t border-line-soft align-top ${flash === r.no ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i, ...(cur === r.no ? { background: 'var(--al)' } : {}) }}>
                    <td className="px-4 py-2.5"><div className="font-semibold">{r.name}</div><div className="text-[11.5px] text-faint">{r.no}・{r.station}駅・{r.start}〜</div></td>
                    <td className="num px-2 py-2.5">{r.priceMin}〜{r.priceMax}万</td>
                    <td className="px-2 py-2.5"><div className="flex flex-wrap gap-1">{r.skills.length ? r.skills.map((s) => <span key={s} className="chip" style={{ background: 'var(--as)', color: 'var(--ad)' }}>{s}</span>) : <span className="text-faint">—</span>}</div></td>
                    <td className="px-2 py-2.5"><span className="chip" style={{ background: SHOURYU_STYLE[r.shouryu].bg, color: SHOURYU_STYLE[r.shouryu].fg }}>{r.shouryu}</span></td>
                    <td className="num px-2 py-2.5"><span className={r.daysLeft <= 2 ? 'font-bold text-bad' : ''}>{r.deadline}</span><div className="text-[11.5px] text-faint">あと{r.daysLeft}日</div></td>
                    <td className="px-4 py-2.5">{bad ? <span className="chip" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}><Ban size={11} />送れない</span> : sent[r.no] ? <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>{sent[r.no].length}人</span> : <span className="text-faint">まだ</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <article key={c.no} className="mo-spring-in self-start rounded-xl border border-line bg-surface">
          <div className="border-b border-line-soft px-5 py-3">
            <div className="text-[16px] font-bold">{c.name}</div>
            <div className="mt-0.5 text-[12.5px] text-muted">{c.station}駅・{c.priceMin}〜{c.priceMax}万・{c.shouryu}・{c.start}〜・締切 {c.deadline}</div>
            <div className="mt-2 rounded-[10px] bg-soft px-3 py-2 text-[12.5px]">{c.work}</div>
          </div>
          {ng ? (
            <div className="mo-shake m-4 flex items-start gap-2 rounded-[10px] border px-3 py-2.5 text-[13px]" style={{ borderColor: 'var(--color-bad-line)', background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>
              <Ban size={16} className="mt-0.5 shrink-0" /><div><b>{ng}</b><div className="mt-0.5 text-[12px]">この種類の案件は、誰にも送らない決まりです。送るボタンは押せません。</div></div>
            </div>
          ) : null}
          <div className="px-5 py-3">
            <div className="text-[12px] font-semibold text-muted">合いそうな要員（待機中・もうすぐ待機）</div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {matches.map(({ p, score, why }) => {
                const done = (sent[c.no] ?? []).includes(p.id);
                return (
                  <li key={p.id} className="flex items-center gap-2.5 rounded-[10px] border border-line-soft px-3 py-2">
                    <input type="checkbox" aria-label={`${p.name} を選ぶ`} disabled={!!ng || done || !canEdit} checked={done || !!pick[p.id]} onChange={(e) => setPick((s) => ({ ...s, [p.id]: e.target.checked }))} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/jinji/staff/${p.id}`} className="text-[13px] font-semibold hover:underline">{p.name}</Link>
                      <span className="ml-1.5 text-[11.5px] text-faint">{p.kind}・{p.station}・{p.want}</span>
                      <div className="text-[11.5px] text-muted">{why.join('・')}</div>
                    </div>
                    {done ? <span className="text-[12px] text-ok">送りました</span> : <span className="num w-9 text-right text-[14px] font-bold" style={{ color: scoreColor(score) }}>{score}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-5 py-3">
            <button onClick={send} disabled={!canEdit || !!ng || !picked.length} title={!canEdit ? needText('edit') : ng ?? (!picked.length ? '送る人を選んでください' : undefined)} className="btn-primary inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-4 text-[13.5px] font-bold disabled:cursor-not-allowed disabled:opacity-40"><Send size={15} />選んだ {picked.length}人に送って案件進捗に載せる</button>
            {sent[c.no] && <Link href="/eigyo/progress" className="text-[12.5px] font-semibold" style={{ color: 'var(--ad)' }}>案件進捗で返信を見る</Link>}
          </div>
        </article>
      </div>
      <p className="text-[11.5px] text-faint">点数は スキル・通勤時間の目安・希望単価 から出した見本です。送るのは本物につなぐまで見本の中だけで動きます。</p>
    </main>
  );
}
