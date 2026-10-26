'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, GripVertical, Lock } from 'lucide-react';
import { LANES, TO_LANE, type Lane } from '@/lib/types/jinji';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing } from '@/components/Motivation';
import { LiveBanner, useIke } from '@/components/Live';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { JINJI_URL, jinjiRead, type JJimuLane } from '@/lib/live/jinji';
import { normName } from '@/lib/live/staff';
import { useLiveWrite, WriteError } from '@/components/jinji/useLiveWrite';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { PersonName } from '@/components/Person';
import { toJimuLive, type IkeJimuList, type LiveHandoff } from '@/lib/live/jimu';

// 参画決定者の手続き（人事管理）＝参画が決まった人を 営業 → 人事 → 労務 → 完了 の列で引き継ぐ。
//   ・カードをドラッグして次の列へ。その列のやることが全部済んでいないと先へは進めない（戻すのはいつでも）
//   ・スマホなど ドラッグしにくいときは カードの「段階」を選んでも動かせる
//   ・入場日・現場・単価は営業の持ち物。人事は契約書、労務は勤怠の設定と通勤
//   ・ログインしていれば今の社内システムの「事務ページ」（/api/roster?op=jimu&action=list）を読むだけで出す。
//     今のシステムに列は無いので「次にやること」で列に振り分ける。
//   ★本物（10-26）：カードのドラッグ・「段階」で列を決められる（今のシステムの v2_jimu_lane に保存）。「自動」に戻すと「次にやること」で分け直す。
//     やることの✓は今のシステムの事務ページで（ここは見るだけ）
const ORDER: Lane[] = ['営業', '人事', '労務', '完了'];

export default function JimuPage() {
  const { can } = usePerms();
  const ike = useIke<IkeJimuList>('roster?op=jimu&action=list');
  const mk = useMikeiken();   // 本物は未経験の人だけ（今のプロパーリストに入っている人）
  const lv = ike.live && ike.data ? toJimuLive({ ...ike.data, rows: mk.keep(ike.data.rows || [], 'name') }) : null;
  const canLive = can('jinji', 'edit');
  const jl = useLiveRoute<{ ok: boolean; rows: JJimuLane[] }>(lv ? jinjiRead('jimu') : null);
  const { send, error: wErr, setError: setWErr } = useLiveWrite(!!lv, jl.reload);
  const ov = useMemo(() => new Map((jl.data?.rows || []).map((x) => [x.normalized_name, x.lane as Lane])), [jl.data]);
  const liveRows: (LiveHandoff & { auto: Lane; pinned: boolean })[] = useMemo(() => (lv?.rows || []).map((r) => { const o = ov.get(normName(r.name)); return { ...r, auto: r.lane, lane: o ?? r.lane, pinned: !!o }; }), [lv, ov]);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<Lane | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const remain = liveRows.filter((r) => r.lane !== '完了').length;
  const pulse = (id: string) => { setFlash(id); setTimeout(() => setFlash(null), 1300); };

  const moveLive = (id: string, to: Lane | '') => {
    const h = liveRows.find((r) => r.id === id);
    if (!h || !canLive) return;
    if ((to === '' && !h.pinned) || (to !== '' && to === h.lane && h.pinned)) return;
    const prev = h.pinned ? h.lane : '';
    send({ url: JINJI_URL, body: { action: 'jimu-lane', name: h.name, normalized_name: normName(h.name), lane: to }, text: to ? `${h.name} を${to}の列にしました` : `${h.name} の列を自動（次にやることから）に戻しました`, sub: to ? TO_LANE[to] : undefined, undo: () => ({ url: JINJI_URL, body: { action: 'jimu-lane', name: h.name, normalized_name: normName(h.name), lane: prev } }) })
      .then((x) => { if (x) pulse(id); });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="参画決定者の手続き" sub="参画が決まった人の、次にやること。今の社内システムの事務ページの「次にやること」で列に分けています" />
      <LiveBanner state={ike.state} error={ike.error} onReload={ike.reload}
        note={lv ? `${lv.month}の名簿で参画決定の人。列は「次にやること」で分けています（ドラッグか「段階」で決めるとすぐ保存・「自動」で戻す）。稼働中で対応なしの${lv.hiddenDone}人は出していません。やることの✓は今の社内システムの事務ページから` : undefined} />
      <WriteError error={wErr} onClose={() => setWErr('')} />
      <MikeikenNote mk={mk} live={ike.live} />

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={remain} total={liveRows.length} />
        <div className="text-body"><b>引き継ぎ中 {remain}人</b>
          <div className="text-sm text-muted">{lv ? '次にやることが済むと、今の社内システムが次の列のやることに進めます。' : ike.state === 'error' ? '読めませんでした' : '読み込み中…'}</div>
        </div>
        <Link href="/jinji/nyusha" className="ml-auto text-sm font-semibold" style={{ color: 'var(--ad)' }}>本人の入社手続きを見る</Link>
      </div>

      <div className="mo-fade-up grid gap-3 md:grid-cols-2 xl:grid-cols-4" style={{ ['--i' as string]: 2 }}>
        {LANES.map((lane) => {
          const liveCards = lv ? liveRows.filter((r) => r.lane === lane.key) : [];
          const isOver = over === lane.key && drag;
          return (
            <section key={lane.key}
              onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(lane.key); } }}
              onDragLeave={() => setOver((o) => (o === lane.key ? null : o))}
              onDrop={(e) => { e.preventDefault(); if (drag) moveLive(drag, lane.key); setDrag(null); setOver(null); }}
              className="flex min-h-[260px] flex-col gap-2 rounded-xl border p-2.5 transition-colors"
              style={{ borderColor: isOver ? 'var(--a)' : 'var(--color-line)', background: isOver ? 'var(--as)' : 'var(--color-soft)' }}>
              <header className="flex items-baseline gap-2 px-1">
                <span className="text-body font-bold">{lane.key}</span>
                <span className="num text-sm text-muted">{liveCards.length}</span>
                <span className="ml-auto text-xs text-faint">{lane.note}</span>
              </header>
              {lv && liveCards.map((h) => <LiveCard key={h.id} h={h} canEdit={canLive} drag={drag === h.id} flash={flash === h.id} onDragStart={() => setDrag(h.id)} onDragEnd={() => { setDrag(null); setOver(null); }} onLane={(l) => moveLive(h.id, l)} />)}
              {lane.key === '完了' && lv && remain === 0 && (
                <div className="mo-scale-in mt-auto rounded-lg border border-line bg-surface px-3 py-4 text-center">
                  <Check className="mx-auto text-ok" size={20} />
                  <div className="mt-1 text-body font-bold">引き継ぎはぜんぶ済みました</div>
                  <div className="text-xs text-muted">新しく参画が決まると 営業の列に並びます</div>
                </div>
              )}
              {liveCards.length === 0 && lane.key !== '完了' && <div className="rounded-lg border border-dashed border-line px-3 py-5 text-center text-sm text-faint">{lv ? 'いまはいません' : ike.state === 'loading' ? '読み込み中…' : '—'}</div>}
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
function LiveCard({ h, canEdit, drag, flash, onDragStart, onDragEnd, onLane }: { h: LiveHandoff & { auto: Lane; pinned: boolean }; canEdit: boolean; drag: boolean; flash: boolean; onDragStart: () => void; onDragEnd: () => void; onLane: (l: Lane | '') => void }) {
  return (
    <article draggable={canEdit} onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }} onDragEnd={onDragEnd} title={!canEdit ? needText('edit') : 'ドラッグして列を移せます'}
      className={`rounded-lg border border-line bg-surface p-3 ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''} ${drag ? 'opacity-50' : ''} ${flash ? 'mo-flash' : ''}`}>
      <div className="flex items-center gap-1.5">
        {canEdit ? <GripVertical size={14} className="text-faint" /> : <Lock size={13} className="text-faint" />}
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
        {h.pinned && <span className="text-xs text-faint">手で決めた列（自動なら{h.auto}）</span>}
        <select aria-label={`${h.name} の段階`} value={h.pinned ? h.lane : ''} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} onChange={(e) => onLane(e.target.value as Lane | '')} className="ml-auto min-h-7 rounded-md border border-field bg-surface px-1.5 text-sm disabled:opacity-50">
          <option value="">自動（{h.auto}）</option>
          {ORDER.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
    </article>
  );
}
