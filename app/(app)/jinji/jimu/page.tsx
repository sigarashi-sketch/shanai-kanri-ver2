'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, GripVertical, Lock } from 'lucide-react';
import { HANDOFFS, LANES, TASKS, TO_LANE, type Handoff, type Lane } from '@/lib/jimu-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { LIVE_WRITE_BLOCKED, LiveBanner, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { PersonName } from '@/components/Person';
import { toJimuLive, type IkeJimuList, type LiveHandoff } from '@/lib/live/jimu';

// 参画決定者の手続き（人事管理）＝参画が決まった人を 営業 → 人事 → 労務 → 完了 の列で引き継ぐ。
//   ・カードをドラッグして次の列へ。その列のやることが全部済んでいないと先へは進めない（戻すのはいつでも）
//   ・スマホなど ドラッグしにくいときは カードの「段階」を選んでも動かせる
//   ・入場日・現場・単価は営業の持ち物。人事は契約書、労務は勤怠の設定と通勤
//   ・ログインしていれば今の社内システムの「事務ページ」（/api/roster?op=jimu&action=list）を読むだけで出す。
//     今のシステムに列は無いので「次にやること」で列に振り分ける。動かす・✓は押せない（今のシステムの画面で）
const ORDER: Lane[] = ['営業', '人事', '労務', '完了'];
const tasksOf = (h: Handoff, lane: Lane) => (lane === '完了' ? [] : TASKS[lane].filter((t) => !t.haken || h.contract === '派遣'));
const missing = (h: Handoff, to: Lane) => {
  const from = ORDER.indexOf(h.lane), dest = ORDER.indexOf(to);
  return ORDER.slice(from, dest).flatMap((l) => tasksOf(h, l).filter((t) => !h.done.includes(t.key)).map((t) => t.label));
};

export default function JimuPage() {
  const { can } = usePerms();
  const ike = useIke<IkeJimuList>('roster?op=jimu&action=list');
  const mk = useMikeiken();   // 本物は未経験の人だけ（今のプロパーリストに入っている人）
  const lv = ike.live && ike.data ? toJimuLive({ ...ike.data, rows: mk.keep(ike.data.rows || [], 'name') }) : null;
  const canEdit = can('jinji', 'edit') && !lv;
  // 営業の列のやること（入場日・現場・単価）は営業の持ち物 → 営業管理を「直す」で持つ人だけが✓できる
  const canTask = (lane: Lane) => (lane === '営業' ? can('eigyo', 'edit') : canEdit);
  const { hit, toast } = useMotivation();
  const [rows, setRows] = useState<Handoff[]>(HANDOFFS);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<Lane | null>(null);
  const [blocked, setBlocked] = useState<{ id: string; msg: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const remain = lv ? lv.rows.filter((r) => r.lane !== '完了').length : rows.filter((r) => r.lane !== '完了').length;
  const pulse = (id: string) => { setFlash(id); setTimeout(() => setFlash(null), 1300); };

  const move = (id: string, to: Lane) => {
    const h = rows.find((r) => r.id === id);
    if (!h || h.lane === to || !canEdit) return;
    const forward = ORDER.indexOf(to) > ORDER.indexOf(h.lane);
    const lack = forward ? missing(h, to) : [];
    if (lack.length) { setBlocked({ id, msg: `まだ済んでいません：${lack.join('・')}` }); setTimeout(() => setBlocked(null), 2600); return; }
    const from = h.lane;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, lane: to } : r)));
    pulse(id); hit();
    toast({
      text: forward ? (to === '完了' ? `${h.name} の入場の準備ができました` : `${h.name} を${to}に渡しました`) : `${h.name} を${to}に戻しました`,
      sub: forward ? TO_LANE[to] : `→ ${to}のやることに戻しました`,
      // この人の列だけ元に戻す（ほかの人の動きや✓はそのまま）
      undo: () => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, lane: from } : r))),
    });
  };
  const toggle = (h: Handoff, key: string) => {
    if (!canTask(h.lane)) return;
    setRows((rs) => rs.map((r) => (r.id === h.id ? { ...r, done: r.done.includes(key) ? r.done.filter((k) => k !== key) : [...r.done, key] } : r)));
    pulse(h.id);
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="参画決定者の手続き" sub={lv ? '参画が決まった人の、次にやること。今の社内システムの事務ページの「次にやること」で列に分けています' : '参画が決まった人の、営業 → 人事 → 労務 の引き継ぎ。カードをドラッグして次の列へ渡します・見本データ'} />
      <LiveBanner state={ike.state} error={ike.error} onReload={ike.reload}
        note={lv ? `${lv.month}の名簿で参画決定の人（見るだけ）。列は「次にやること」で分けています。稼働中で対応なしの${lv.hiddenDone}人は出していません。操作は今の社内システムの事務ページから` : undefined} />
      <MikeikenNote mk={mk} live={ike.live} />

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={remain} total={lv ? lv.rows.length : rows.length} />
        <div className="text-body"><b>引き継ぎ中 {remain}人</b>
          <div className="text-sm text-muted">{lv ? '次にやることが済むと、今の社内システムが次の列のやることに進めます。' : 'その列のやることに✓が全部付くと、次の列へ動かせます。'}{!lv && !canEdit && <span className="text-bad"> {needText('edit')}</span>}</div>
        </div>
        <Link href="/jinji/nyusha" className="ml-auto text-sm font-semibold" style={{ color: 'var(--ad)' }}>本人の入社手続きを見る</Link>
      </div>

      <div className="mo-fade-up grid gap-3 md:grid-cols-2 xl:grid-cols-4" style={{ ['--i' as string]: 2 }}>
        {LANES.map((lane) => {
          const cards = rows.filter((r) => r.lane === lane.key);
          const liveCards = lv ? lv.rows.filter((r) => r.lane === lane.key) : [];
          const isOver = over === lane.key && drag;
          return (
            <section key={lane.key}
              onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(lane.key); } }}
              onDragLeave={() => setOver((o) => (o === lane.key ? null : o))}
              onDrop={(e) => { e.preventDefault(); if (drag) move(drag, lane.key); setDrag(null); setOver(null); }}
              className="flex min-h-[260px] flex-col gap-2 rounded-xl border p-2.5 transition-colors"
              style={{ borderColor: isOver ? 'var(--a)' : 'var(--color-line)', background: isOver ? 'var(--as)' : 'var(--color-soft)' }}>
              <header className="flex items-baseline gap-2 px-1">
                <span className="text-body font-bold">{lane.key}</span>
                <span className="num text-sm text-muted">{lv ? liveCards.length : cards.length}</span>
                <span className="ml-auto text-xs text-faint">{lane.note}</span>
              </header>
              {lv && liveCards.map((h) => <LiveCard key={h.id} h={h} />)}
              {!lv && cards.map((h) => {
                const tasks = tasksOf(h, h.lane);
                const ready = tasks.every((t) => h.done.includes(t.key));
                return (
                  <article key={h.id} draggable={canEdit} onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDrag(h.id); }} onDragEnd={() => { setDrag(null); setOver(null); }}
                    title={!canEdit ? needText('edit') : 'ドラッグして列を移せます'}
                    className={`rounded-lg border border-line bg-surface p-3 ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''} ${flash === h.id ? 'mo-flash' : ''} ${blocked?.id === h.id ? 'mo-shake' : ''} ${drag === h.id ? 'opacity-50' : ''} ${h.lane === '完了' && flash === h.id ? 'mo-celebrate' : ''}`}>
                    <div className="flex items-center gap-1.5">
                      {canEdit ? <GripVertical size={14} className="text-faint" /> : <Lock size={13} className="text-faint" />}
                      <PersonName name={h.name} className="font-semibold hover:underline underline-offset-2" />
                      <span className="chip ml-auto" style={{ background: h.contract === '派遣' ? 'var(--tone-info-bg)' : 'var(--tone-purple-bg)', color: h.contract === '派遣' ? 'var(--tone-info-fg)' : 'var(--tone-purple-fg)' }}>{h.contract}</span>
                    </div>
                    <div className="num mt-1 text-sm text-muted">入場 {h.day}・{h.site}・単価 {h.price}<span className="text-faint">・営業 {h.sales}</span></div>
                    {tasks.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {tasks.map((t) => (
                          <li key={t.key}>
                            <label title={!canTask(h.lane) ? needText('edit') : undefined} className={`flex items-center gap-1.5 text-sm ${canTask(h.lane) ? 'cursor-pointer' : 'opacity-60'}`}>
                              <input type="checkbox" checked={h.done.includes(t.key)} disabled={!canTask(h.lane)} onChange={() => toggle(h, t.key)} />
                              <span className={h.done.includes(t.key) ? 'text-muted line-through' : ''}>{t.label}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                    {blocked?.id === h.id && <div className="mt-1.5 text-xs font-semibold text-bad">{blocked.msg}</div>}
                    <div className="mt-2 flex items-center gap-1.5">
                      {h.lane !== '完了' && <span className={`text-xs ${ready ? 'font-semibold text-ok' : 'text-faint'}`}>{ready ? '次の列へ渡せます' : `残り ${tasks.filter((t) => !h.done.includes(t.key)).length}`}</span>}
                      <select aria-label={`${h.name} の段階`} value={h.lane} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} onChange={(e) => move(h.id, e.target.value as Lane)}
                        className="ml-auto min-h-7 rounded-md border border-field bg-surface px-1.5 text-sm disabled:opacity-50">
                        {ORDER.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  </article>
                );
              })}
              {lane.key === '完了' && remain === 0 && (
                <div className="mo-scale-in mt-auto rounded-lg border border-line bg-surface px-3 py-4 text-center">
                  <Check className="mx-auto text-ok" size={20} />
                  <div className="mt-1 text-body font-bold">引き継ぎはぜんぶ済みました</div>
                  <div className="text-xs text-muted">新しく参画が決まると 営業の列に並びます</div>
                </div>
              )}
              {(lv ? liveCards.length : cards.length) === 0 && lane.key !== '完了' && <div className="rounded-lg border border-dashed border-line px-3 py-5 text-center text-sm text-faint">{lv ? 'いまはいません' : 'ここにドラッグ'}</div>}
            </section>
          );
        })}
      </div>
      <p className="text-xs text-faint">派遣の就業条件の明示・雇用契約の中身は、最終判断は社労士・法務に確認してください。</p>
    </main>
  );
}

// 本物のカード（見るだけ）。今のシステムの「次にやること」と、ミンミカ総務手続き7項目
const STEP_TONE: Record<string, string> = { 完了: 'ok', 不要: 'mute', 対応中: 'info', 未着手: 'mute' };
function LiveCard({ h }: { h: LiveHandoff }) {
  return (
    <article title={LIVE_WRITE_BLOCKED} className="rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center gap-1.5">
        <Lock size={13} className="text-faint" />
        <PersonName name={h.name} className="font-semibold hover:underline underline-offset-2" />
        <span className="chip ml-auto" style={{ background: h.contract === '派遣' ? 'var(--tone-info-bg)' : 'var(--tone-purple-bg)', color: h.contract === '派遣' ? 'var(--tone-info-fg)' : 'var(--tone-purple-fg)' }}>{h.contract}</span>
      </div>
      <div className="num mt-1 text-sm text-muted">入場 {h.day}・{h.site}<span className="text-faint">・営業 {h.sales}・{h.status}</span></div>
      <div className={`mt-2 text-sm ${h.lane === '完了' ? 'font-semibold text-ok' : 'font-semibold'}`}>{h.lane === '完了' ? '対応なし（入場を待つだけ）' : `次にやること：${h.next}`}</div>
      {h.onboarding && (
        <div className="mt-2">
          <div className="text-xs text-faint">ミンミカの総務手続き（{h.onboarding.typeLabel}）</div>
          <ul className="mt-1 flex flex-wrap gap-1">
            {h.onboarding.steps.map((s) => {
              const t = STEP_TONE[s.text] || 'mute';
              return <li key={s.key} className="chip" style={{ background: `var(--tone-${t}-bg)`, color: `var(--tone-${t}-fg)`, fontWeight: s.text === '完了' ? 700 : 500 }}>{s.text === '完了' ? '✓ ' : ''}{s.label}{s.text !== '完了' && `：${s.text}`}</li>;
            })}
          </ul>
        </div>
      )}
      <div className="mt-2 flex items-center">
        <select aria-label={`${h.name} の段階`} value={h.lane} disabled title={LIVE_WRITE_BLOCKED} className="ml-auto min-h-7 rounded-md border border-field bg-surface px-1.5 text-sm disabled:opacity-50">
          <option value={h.lane}>{h.lane}</option>
        </select>
      </div>
    </article>
  );
}
