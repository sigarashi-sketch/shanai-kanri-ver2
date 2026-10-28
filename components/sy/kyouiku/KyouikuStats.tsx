'use client';
import { useEffect, useMemo, useState } from 'react';
import { Activity, ClipboardCheck, MousePointerClick, Users, Eye } from 'lucide-react';
import { Chip } from '@/components/sy/ui';
import type { Member } from '@/components/sy/compat';
import type { StatsCheckSubject, StatsData } from '@/lib/sy/kyouiku-stats-types';

// /kyouiku「集計」（2026-10-19 shoya「bdsh の集計 クリック率とか スキルチェックの結果とか ダッシュボードで見やすく」）
//   上＝数字 ／ 直近30日の動いた人数 ／ 記録を取り始めてからの流れ（メニュー→開いた→押した→練習）／ コースごとのクリック率と練習した人 ／ スキルチェック（科目ごとの平均・点の分布・苦手な分野・正解の少ない問題）
//   数字は /api/sy/s/kyouiku/stats（lib/kyouiku-stats.ts）。稼働中の何割が使ったかは 名簿（members）と画面で突き合わせる
//   クリック率＝そのコースを押した人 ÷ 受講ページを開いた人（どちらも 記録を取り始めた日から・1人1日1回まで）
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const BAND_LABELS = ['0〜19', '20〜39', '40〜59', '60〜79', '80〜100'];
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export default function KyouikuStats({ members }: { members: Member[] | null }) {
  const [staff, setStaff] = useState(false);
  const [d, setD] = useState<StatsData | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    fetch(`/api/sy/s/kyouiku/stats${staff ? '?staff=1' : ''}`).then(async (r) => { const j = await r.json(); if (!live) return; if (!r.ok) setErr(j.error || '読み込めませんでした'); else { setErr(''); setD(j); } }).catch(() => live && setErr('通信に失敗しました'));
    return () => { live = false; };
  }, [staff]);

  const roster = useMemo(() => {
    const active = (members || []).filter((m) => m.kind === 'employee' && m.status === '稼働中').map((m) => m.key);
    if (!d) return null;
    const seen = new Set(d.seenKeys); const a7 = new Set(d.active7Keys);
    return { total: active.length, used: active.filter((k) => seen.has(k)).length, week: active.filter((k) => a7.has(k)).length };
  }, [members, d]);

  if (err) return <p className="m-6 rounded-lg bg-ig-hover p-3 text-sm text-ig-danger">{err}</p>;
  if (!d) return <p className="m-6 text-sm text-ig-muted">集計を読み込み中…</p>;

  const clickRate = pct(d.clickers, d.opened);
  const courses = [...d.courses].filter((c) => c.users || c.clickers).sort((a, b) => b.clickers - a.clickers || b.users - a.users);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-8">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ig-muted">
        <span>{d.since ? `開いた・押した の記録は ${md(d.since)} から（それより前は 練習の記録だけ）` : '開いた・押した の記録は 今日から取り始めます（それまでは 練習の記録だけで数えています）'}</span>
        <span className="ml-auto" />
        <Chip on={staff} onClick={() => setStaff((v) => !v)}>内勤も含める</Chip>
      </div>

      {/* 数字 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="稼働中の利用率" value={roster ? pct(roster.used, roster.total) : 0} unit="%" sub={roster ? `稼働中 ${roster.total}人のうち 使った ${roster.used}人` : '名簿を読み込み中…'} meter={roster ? pct(roster.used, roster.total) : 0} Icon={Users} />
        <Kpi label="この7日に動いた人" value={d.active7Keys.length} unit="人" sub={roster ? `うち稼働中 ${roster.week}人` : `記録がある人 ${d.seenKeys.length}人`} Icon={Activity} />
        <Kpi label="開いた人" value={d.opened} unit="人" sub={d.since ? `メニューから ${d.menu}人` : 'まだ記録なし'} Icon={Eye} />
        <Kpi label="クリック率" value={clickRate} unit="%" sub={d.opened ? `開いた ${d.opened}人のうち コースを押した ${d.clickers}人` : 'まだ記録なし'} meter={clickRate} Icon={MousePointerClick} />
        <Kpi label="スキルチェック受験" value={d.check.takers} unit="人" sub={`4科目すべて ${d.check.all4}人${d.check.avg !== null ? `・平均 ${d.check.avg}点` : ''}`} Icon={ClipboardCheck} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <DaysChart days={d.days} />
        <Funnel d={d} />
      </div>

      {/* コースごと */}
      <section className="mt-4 rounded-2xl border border-ig-border bg-white p-4">
        <div className="flex flex-wrap items-baseline gap-2"><h2 className="text-[15px] font-bold">コースごと</h2><span className="text-xs text-ig-muted">クリック率＝押した人 ÷ 開いた人（{d.opened}人）。練習した人＝答え合わせ・回答の記録がある人（CCNA の図鑑あつめ・キッティングは 別の記録なので 入っていません）</span></div>
        {courses.length === 0 ? <p className="mt-3 text-sm text-ig-muted">まだ記録がありません</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-ig-border text-left text-xs text-ig-muted">
                <th className="py-2 pr-3 font-medium">コース</th><th className="w-[34%] py-2 pr-3 font-medium">クリック率</th>
                <th className="py-2 pr-3 text-right font-medium">押した人</th><th className="py-2 pr-3 text-right font-medium">練習した人（累計）</th><th className="py-2 pr-3 text-right font-medium">30日</th><th className="py-2 text-right font-medium">7日</th>
              </tr></thead>
              <tbody>
                {courses.map((c) => {
                  const r = pct(c.clickers, d.opened);
                  return (
                    <tr key={c.id} className="border-b border-ig-border/60 last:border-0">
                      <td className="py-2 pr-3 font-semibold">{c.name}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2" title={`${c.name}: 開いた ${d.opened}人のうち ${c.clickers}人が押した（延べ ${c.clicks}回）`}>
                          <div className="h-2 flex-1 rounded-full bg-ig-hover"><div className="h-2 rounded-full bg-ig-primary" style={{ width: `${r}%` }} /></div>
                          <span className="w-10 text-right tabular-nums">{d.opened ? `${r}%` : '—'}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.clickers}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.users}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.active30}</td>
                      <td className="py-2 text-right tabular-nums">{c.active7}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* スキルチェック */}
      <section className="mt-4">
        <div className="flex flex-wrap items-baseline gap-2"><h2 className="text-[15px] font-bold">スキルチェックの結果</h2><span className="text-xs text-ig-muted">点は 1人ずつ いちばん新しい回。正解の割合も いちばん新しい回で数えています</span></div>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {d.check.subjects.map((s) => <CheckCard key={s.id} s={s} />)}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, unit, sub, Icon, meter }: { label: string; value: number; unit: string; sub: string; Icon: typeof Users; meter?: number }) {
  return (
    <div className="rounded-2xl border border-ig-border bg-white p-4">
      <div className="flex items-center justify-between gap-2 text-xs text-ig-muted"><span className="truncate">{label}</span><Icon size={16} strokeWidth={1.75} className="shrink-0" /></div>
      <div className="mt-1.5 text-[28px] font-bold leading-none tabular-nums">{value}<span className="ml-0.5 text-sm font-semibold text-ig-muted">{unit}</span></div>
      {meter !== undefined && <div className="mt-2 h-1.5 rounded-full bg-ig-hover"><div className="h-1.5 rounded-full bg-ig-primary" style={{ width: `${Math.min(100, meter)}%` }} /></div>}
      <div className="mt-1.5 truncate text-xs text-ig-muted">{sub}</div>
    </div>
  );
}

// 直近30日の 動いた人数（何かの記録がある人）。棒にのせると その日の数字
function DaysChart({ days }: { days: StatsData['days'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((x) => x.active));
  const total = days.reduce((s, x) => s + x.active, 0);
  const h = hover === null ? null : days[hover];
  return (
    <section className="rounded-2xl border border-ig-border bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-[15px] font-bold">直近30日の 動いた人数</h2>
        <span className="text-xs text-ig-muted">1日に 何か記録（開いた・練習・チェック）がある人</span>
        <span className="ml-auto text-xs tabular-nums text-ig-muted">{h ? `${md(h.d)}　動いた ${h.active}人・開いた ${h.opened}人` : `30日の延べ ${total}人`}</span>
      </div>
      <div className="relative mt-4 flex h-36 items-end gap-[2px] border-b border-ig-border" onMouseLeave={() => setHover(null)} role="img" aria-label={days.map((x) => `${md(x.d)} ${x.active}人`).join('、')}>
        <span className="pointer-events-none absolute -top-1 left-0 text-[10px] tabular-nums text-ig-muted">{max}人</span>
        {days.map((x, i) => (
          <div key={x.d} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
            <div className={`w-full rounded-t-[4px] ${hover === i ? 'bg-ig-primary-hover' : 'bg-ig-primary'}`} style={{ height: x.active ? `${Math.max(3, (x.active / max) * 100)}%` : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-ig-muted"><span>{md(days[0].d)}</span><span>{md(days[14].d)}</span><span>今日</span></div>
    </section>
  );
}

// 記録を取り始めてからの流れ。棒の長さは 開いた人を 100% とした割合
function Funnel({ d }: { d: StatsData }) {
  const steps = [
    { label: '受講ページを開いた', n: d.opened, note: '' },
    { label: 'コースを押した', n: d.clickers, note: '' },
    { label: '練習した', n: d.practiced, note: '開いた あとに 答え合わせ・回答の記録' },
  ];
  return (
    <section className="rounded-2xl border border-ig-border bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-2"><h2 className="text-[15px] font-bold">開いてから練習するまで</h2><span className="text-xs text-ig-muted">{d.since ? `${md(d.since)} から` : 'これから数えます'}</span></div>
      <div className="mt-4 space-y-3">
        {steps.map((s, i) => (
          <div key={s.label}>
            <div className="flex items-baseline justify-between gap-2 text-sm"><span className="font-semibold">{s.label}</span><span className="tabular-nums">{s.n}人{i > 0 && d.opened ? <span className="ml-1 text-xs text-ig-muted">（{pct(s.n, d.opened)}%）</span> : null}</span></div>
            <div className="mt-1 h-2.5 rounded-full bg-ig-hover"><div className="h-2.5 rounded-full bg-ig-primary" style={{ width: `${d.opened ? pct(s.n, d.opened) : 0}%` }} /></div>
            {s.note && <div className="mt-0.5 text-[11px] text-ig-muted">{s.note}</div>}
          </div>
        ))}
        <p className="text-xs text-ig-muted">公式LINEのメニューの bdsh から来た人 {d.menu}人</p>
      </div>
    </section>
  );
}

function CheckCard({ s }: { s: StatsCheckSubject }) {
  const maxD = Math.max(1, ...s.dist);
  const typing = s.id === 'typing';
  return (
    <div className="rounded-2xl border border-ig-border bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold">{s.name}<span className="ml-1.5 font-normal text-ig-muted">{s.n}人</span></span>
        <span className="text-[22px] font-bold leading-none tabular-nums">{s.avg ?? '—'}<span className="ml-0.5 text-xs font-semibold text-ig-muted">点 平均</span></span>
      </div>
      {s.n === 0 ? <p className="mt-3 text-sm text-ig-muted">まだ受けた人がいません</p> : (
        <>
          {/* 点の分布 */}
          <div className="mt-3 grid grid-cols-5 items-end gap-1.5" role="img" aria-label={s.dist.map((n, k) => `${BAND_LABELS[k]}点 ${n}人`).join('、')}>
            {s.dist.map((n, k) => (
              <div key={k} className="flex flex-col items-center" title={`${BAND_LABELS[k]}点: ${n}人`}>
                <span className="text-[11px] tabular-nums text-ig-muted">{n || ''}</span>
                <div className="flex h-16 w-full items-end"><div className="w-full rounded-t-[4px] bg-ig-primary" style={{ height: n ? `${Math.max(6, (n / maxD) * 100)}%` : 0 }} /></div>
                <span className="mt-1 text-[10px] tabular-nums text-ig-muted">{BAND_LABELS[k]}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-ig-muted">
            {typing ? `平均 ${s.kpm}打/分・正確さ ${s.accuracy}%` : null}
            {s.retakers > 0 ? `${typing ? '・' : ''}受け直した ${s.retakers}人: 初回 ${s.firstAvg}点 → 最新 ${s.retakeAvg}点` : typing ? '' : '受け直した人はまだいません'}
          </div>
          {!typing && (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold text-ig-muted">分野ごとの正解（低い順）</div>
                <ul className="mt-1.5 space-y-1.5">
                  {s.tags.map((t) => (
                    <li key={t.tag} title={`${t.tag}: 正解 ${t.rate}%（${t.n}人）`}>
                      <div className="flex justify-between gap-2 text-xs"><span className="truncate">{t.tag}</span><span className="tabular-nums">{t.rate}%</span></div>
                      <div className="mt-0.5 h-1.5 rounded-full bg-ig-hover"><div className={`h-1.5 rounded-full ${t.rate < 50 ? 'bg-ig-danger' : 'bg-ig-primary'}`} style={{ width: `${t.rate}%` }} /></div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold text-ig-muted">正解の少ない問題</div>
                <ul className="mt-1.5 space-y-1">
                  {s.items.slice(0, 5).map((it) => (
                    <li key={it.label} className="flex items-baseline justify-between gap-2 text-xs" title={`${it.label}（${it.tag}）: 正解 ${it.rate}%・わからない ${it.dk}%`}>
                      <span className="truncate">{it.label}</span>
                      <span className="shrink-0 tabular-nums">{it.rate}%{it.dk > 0 && <span className="ml-1 text-ig-muted">わからない {it.dk}%</span>}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
