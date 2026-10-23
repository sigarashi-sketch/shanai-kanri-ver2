'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Train } from 'lucide-react';
import { STATIONS, commuteLabel, commuteMin, commuteTone, stationOf } from '@/lib/map-sample';
import { STOCK, ngReason } from '@/lib/cases-sample';
import { TAIKI, taikiDays } from '@/lib/taiki-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';

// 案件・要員マップ（営業）。地図ライブラリは使わず、駅を格子に置いた簡易マップ。
//   ■＝案件（送れない案件は出さない）・●＝待機中／もうすぐ待機の要員の最寄り駅
//   要員を選ぶと、各案件までの通勤時間の目安を線と一覧で出す。「候補にする」で待機・再アサインの次の案件に入れる
const CASES = STOCK.filter((c) => !ngReason(c));
const W = 100, H = 100;
const LIMITS = [45, 60, 90];
const lineColor = (m: number) => `var(--tone-${commuteTone(m)}-bar, var(--color-${commuteTone(m)}))`;

export default function MapPage() {
  const canEdit = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const [who, setWho] = useState(TAIKI[0].id);
  const [limit, setLimit] = useState(60);
  const [cand, setCand] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => { const p = new URLSearchParams(window.location.search).get('person'); if (p && TAIKI.some((t) => t.id === p)) setWho(p); }, []);

  const p = TAIKI.find((t) => t.id === who)!;
  const home = stationOf(p.station)!;
  const list = CASES.map((c) => ({ c, m: commuteMin(p.station, c.station) ?? 99 })).sort((a, b) => a.m - b.m);
  const near = list.filter((x) => x.m <= limit);
  const caseAt = (s: string) => CASES.filter((c) => c.station === s);
  const peopleAt = (s: string) => TAIKI.filter((t) => t.station === s);

  const pick = (no: string, name: string) => {
    if (!canEdit) return;
    const before = cand;
    setCand((x) => ({ ...x, [p.id]: no })); setFlash(no); setTimeout(() => setFlash(null), 1300);
    hit();
    toast({ text: `${p.name} の次の候補を「${name}」にしました`, sub: '→ 待機・再アサインの「次の案件の候補」に反映しました', undo: () => setCand(before) });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="案件・要員マップ" sub="駅ごとに案件と待機の要員を並べた簡易マップ。通勤時間は目安です・見本データ">
        <label className="flex items-center gap-2 text-[12.5px] text-muted">要員
          <select aria-label="要員を選ぶ" value={who} onChange={(e) => setWho(e.target.value)} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-[13px] text-ink">
            {TAIKI.map((t) => <option key={t.id} value={t.id}>{t.name}（{t.station}・{t.kind === '待機中' ? `待機${taikiDays(t)}日目` : `あと${taikiDays(t)}日`}）</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[12.5px] text-muted">通える目安
          <select aria-label="通える目安" value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-[13px] text-ink">{LIMITS.map((l) => <option key={l} value={l}>{l}分まで</option>)}</select>
        </label>
      </PageTitle>

      <div className="grid gap-3.5 lg:grid-cols-[1.3fr_1fr]">
        <div className="mo-fade-up rounded-xl border border-line bg-surface p-3" style={{ ['--i' as string]: 1 }}>
          <svg viewBox={`-8 -4 ${W + 22} ${H + 8}`} className="h-auto w-full" role="img" aria-label="駅ごとの案件と要員">
            {/* 線（選んだ要員の駅 → 目安内の案件） */}
            {near.map(({ c, m }) => { const s = stationOf(c.station)!; return <line key={c.no} x1={home.x} y1={home.y} x2={s.x} y2={s.y} stroke={lineColor(m)} strokeWidth={cand[p.id] === c.no ? 1.4 : 0.7} strokeDasharray={cand[p.id] === c.no ? undefined : '2 1.2'} />; })}
            {STATIONS.map((s) => {
              const cs = caseAt(s.name), ps = peopleAt(s.name), isHome = s.name === p.station;
              return (
                <g key={s.name}>
                  {isHome && <circle cx={s.x} cy={s.y} r={5.5} fill="var(--al)" className="mo-pulse" />}
                  <circle cx={s.x} cy={s.y} r={1.3} fill="var(--color-faint)" />
                  <text x={s.x + 2.6} y={s.y + 1.2} fontSize="3.2" fill="var(--color-ink)" fontWeight={isHome ? 700 : 400}>{s.name}</text>
                  {cs.map((c, i) => (
                    <g key={c.no} onClick={() => pick(c.no, c.name)} className="cursor-pointer">
                      <title>{`${c.name}（${c.priceMin}〜${c.priceMax}万）`}</title>
                      <rect x={s.x - 5 - i * 3.4} y={s.y - 6.2} width={2.8} height={2.8} rx={0.5} fill={cand[p.id] === c.no ? 'var(--color-ok)' : 'var(--a)'} />
                    </g>
                  ))}
                  {ps.map((t, i) => (
                    <g key={t.id} onClick={() => setWho(t.id)} className="cursor-pointer">
                      <title>{`${t.name}（${t.kind}）`}</title>
                      <circle cx={s.x + 3 + i * 3.2} cy={s.y - 4.6} r={1.4} fill={t.id === p.id ? 'var(--ad)' : `var(--tone-${t.kind === '待機中' ? 'warn' : 'info'}-fg)`} />
                    </g>
                  ))}
                </g>
              );
            })}
          </svg>
          <div className="mt-1 flex flex-wrap gap-3 px-1 text-[11.5px] text-muted">
            <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm" style={{ background: 'var(--a)' }} />案件</span>
            <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-full" style={{ background: 'var(--tone-warn-fg)' }} />待機中</span>
            <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-full" style={{ background: 'var(--tone-info-fg)' }} />もうすぐ待機</span>
            <span>線＝{limit}分以内の案件（緑 45分まで・黄 60分まで）</span>
          </div>
        </div>

        <div className="mo-fade-up self-start rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
          <div className="border-b border-line-soft px-4 py-3">
            <Link href={`/jinji/staff/${p.id}`} className="text-[15px] font-bold hover:underline">{p.name}</Link>
            <div className="text-[12px] text-muted">最寄り {p.station}駅（{home.line}）・{p.want}・希望 {p.price}万〜</div>
            <div className="mt-1 text-[12.5px]"><b>{near.length}件</b> が {limit}分以内{!canEdit && <span className="ml-2 text-bad">{needText('edit')}</span>}</div>
          </div>
          <ul className="flex flex-col">
            {list.map(({ c, m }) => {
              const tone = commuteTone(m), chosen = cand[p.id] === c.no;
              return (
                <li key={c.no} className={`flex items-center gap-2.5 border-t border-line-soft px-4 py-2 first:border-t-0 ${flash === c.no ? 'mo-flash' : ''} ${m > limit ? 'opacity-50' : ''}`}>
                  <Train size={14} className="shrink-0 text-faint" />
                  <div className="min-w-0 flex-1"><div className="text-[13px] font-semibold">{c.name}</div><div className="text-[11.5px] text-faint">{c.station}駅・{c.priceMin}〜{c.priceMax}万・締切 {c.deadline}</div></div>
                  <span className="chip" style={{ background: `var(--tone-${tone}-bg)`, color: `var(--tone-${tone}-fg)` }}>約{m}分・{commuteLabel(m)}</span>
                  {chosen ? <span className="flex items-center gap-1 text-[12px] font-semibold text-ok"><Check size={13} />候補</span>
                    : <button onClick={() => pick(c.no, c.name)} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} className="min-h-8 rounded-lg border px-2.5 text-[12px] font-semibold disabled:opacity-40" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}>候補にする</button>}
                </li>
              );
            })}
          </ul>
          {cand[p.id] && <div className="border-t border-line-soft px-4 py-2.5 text-[12.5px]"><Link href={`/eigyo/cases?case=${cand[p.id]}`} className="font-semibold" style={{ color: 'var(--ad)' }}>この案件を開いて {p.name} に送る</Link></div>}
        </div>
      </div>
      <p className="text-[11.5px] text-faint">通勤時間は駅の位置から出した目安です。本物では乗換案内（駅すぱあと）の結果を使い、定期が高すぎる案件は外します。アダルト・店舗運営系の案件はマップに出しません。</p>
    </main>
  );
}
