'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Send } from 'lucide-react';
import { SHIFT_KINDS, type ShiftPerson, type ShiftState } from '@/lib/types/roumu';
import { PageTitle, Tabs } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { PersonName } from '@/components/Person';
import { LiveBanner, useIke } from '@/components/Live';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { postLive } from '@/lib/live/post';
import { nnOf, nudge, nudgeSub, patternOf, useMarks, type IkeShiftPatterns, type ShiftPattern } from '@/lib/live/roumu';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { JissekiTab } from './jisseki';
import { TeishutsuTab } from './teishutsu';
import { shiftMissingOf, shiftMonthOf, shiftPeopleOf, type IkeTodayTargets, type IkeShiftDetail, type IkeShiftList, type IkeShiftMonth } from '@/lib/live/shift';

// シフト表（人事管理・10-27 労務から移した）＝シフト勤務の人の月のシフトを「日×人」のマスで見る・直す。
//   ・マスは本人がスマホで入れたもの（ここからは直せない）。提出済みの月の空欄は休みとみなす（薄く「休」と出す）
//   ・未提出・下書きの人には提出のお願いを送る（あおい・確認のあと）。残りの人数をリングで出す
//   ・タブ「提出状況」＝勤務区分が平日でない人全員の提出（./teishutsu.tsx）・「当月の実績」＝今月のシフトを人ごとに（./jisseki.tsx）
type View = 'grid' | 'teishutsu' | 'jisseki';
const VIEWS: { key: View; label: string }[] = [{ key: 'grid', label: 'シフト表' }, { key: 'teishutsu', label: '提出状況' }, { key: 'jisseki', label: '当月の実績' }];
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const KIND = Object.fromEntries(SHIFT_KINDS.map((k) => [k.k, k]));
const STATE_STYLE: Record<ShiftState, { bg: string; fg: string }> = {
  提出済み: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)' },
  下書き: { bg: 'var(--tone-caution-bg)', fg: 'var(--tone-caution-fg)' },
  未提出: { bg: 'var(--tone-bad-bg)', fg: 'var(--tone-bad-fg)' },
};

export default function ShiftPage() {
  const [view, setView] = useState<View>('grid');
  useEffect(() => { const t = new URLSearchParams(window.location.search).get('tab'); if (VIEWS.some((v) => v.key === t)) setView(t as View); }, []);
  const pick = (v: View) => { setView(v); window.history.replaceState(null, '', v === 'grid' ? window.location.pathname : `?tab=${v}`); };
  const canEdit = usePerms().can('roumu', 'edit');
  const { hit, toast } = useMotivation();
  // 本物：開く月 → その月の一覧 → 1人ずつ日ごと（GET だけ・同時に6人まで）
  const mq = useIke<IkeShiftMonth>('shift-calendar?action=month');
  const month = mq.live ? mq.data?.month || '' : '';
  const lq = useIke<IkeShiftList>(month ? `shift-calendar?action=list&month=${month}` : null);
  // 未提出＝シフト提出が要る勤務区分（シフト・夜勤）の人のうち、この月に1日も入れていない人（今日の出勤状況の対象から）
  const tq = useIke<IkeTodayTargets>(month ? 'kintai-today?stale=1' : null);
  const live = mq.live && lq.live;
  // 本物は未経験の人だけ（今のプロパーリストに入っている人）。日ごとも未経験の人の分だけ読む
  const mk = useMikeiken();
  const lrows = useMemo(() => mk.keep(lq.data?.rows || [], 'name'), [lq.data, mk]);
  const lq2 = useMemo(() => (lq.data ? { ...lq.data, rows: lrows } : null), [lq.data, lrows]);
  const tq2 = useMemo(() => (tq.data ? { ...tq.data, rows: mk.keep(tq.data.rows || [], 'name') } : null), [tq.data, mk]);
  const [details, setDetails] = useState<Record<string, IkeShiftDetail | undefined>>({});
  useEffect(() => {
    if (!live || !lq.data?.rows) return;
    let stop = false;
    const ids = lrows.map((r) => r.lineUserId);
    (async () => {
      for (let i = 0; i < ids.length && !stop; i += 6) {
        const got = await Promise.all(ids.slice(i, i + 6).map((u) => fetch(`/api/ike/shift-calendar?action=detail&month=${month}&user=${encodeURIComponent(u)}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null) as Promise<IkeShiftDetail | null>));
        if (!stop) setDetails((d) => ({ ...d, ...Object.fromEntries(got.filter((x): x is IkeShiftDetail => !!x?.ok).map((x) => [x.lineUserId, x])) }));
      }
    })();
    return () => { stop = true; };
  }, [live, lq.data, lrows, month]);
  const M = shiftMonthOf(month || new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7));
  const rowsP: (ShiftPerson & { times?: string[] })[] = live ? [...(tq.live ? shiftMissingOf(tq2, lq.data?.rows || [], month) : []), ...shiftPeopleOf(lq2, details, month)] : [];
  const okEdit = canEdit;
  const block = !canEdit ? needText('edit') : undefined;
  // 本物（10-26）：シフトの呼び名（shift_patterns）・提出のお願い（LINE・既定は送らない＝印だけ）
  const pq = useIke<IkeShiftPatterns>(live ? 'roster?op=roumu&action=shift-patterns' : null);
  const pats = pq.data?.ok ? pq.data.rows : [];
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const sm = useMarks(['nudge-shift'], today.slice(0, 7), live);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const askedOf = (p: ShiftPerson) => !!sm.get('nudge-shift', `${today}|${nnOf(p.name)}`);
  const CELL_LOCK = '本人がスマホで入れたシフトです（ここからは直せません）';
  const days = Array.from({ length: M.days }, (_, i) => ({ d: i + 1, dow: (M.firstDow + i) % 7 }));
  const waiting = rowsP.filter((p) => p.state !== '提出済み' && !askedOf(p));
  const notSubmitted = rowsP.filter((p) => p.state !== '提出済み');

  const askedName = (name: string) => !!sm.get('nudge-shift', `${today}|${nnOf(name)}`);
  const ask = (ps: Pick<ShiftPerson, 'name'>[]) => {
    if (!live) return;
    setConfirm({
      title: ps.length > 1 ? `${ps.length}人にシフトの提出をお願いする` : `${ps[0].name} にシフトの提出をお願いする`, okLabel: 'お願いする',
      lines: ['本人の公式LINE（1:1）に決まった文を1通ずつ送ります（30人まで）', 'いまは送信を止めている設定なら、送らずに「お願いした」の印だけ残します'],
      run: async () => { const j = await nudge('shift', today, ps.slice(0, 30).map((p) => ({ nn: nnOf(p.name) }))); hit(ps.length); sm.reload(); toast({ text: ps.length > 1 ? `${ps.length}人に提出のお願いをしました` : `${ps[0].name} に提出のお願いをしました`, sub: nudgeSub(j) }); },
    });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="シフト表" sub={live ? `${M.year}年${M.label}・本人が入れたシフト（20日を過ぎたら翌月を集める）` : '本人が入れたシフト（20日を過ぎたら翌月を集める）'}>
        <Link href="/jinji/today" className="btn-secondary">当日の出勤状況へ</Link>
      </PageTitle>
      <Tabs<View> tabs={VIEWS} value={view} onChange={pick} />
      {view === 'teishutsu' && <TeishutsuTab targets={tq2} list={lq2} monthLabel={`${M.year}年${M.label}`} loading={!live || tq.state === 'loading'} askedOf={askedName} ask={(names) => ask(names.map((name) => ({ name })))} canEdit={okEdit && live} block={block} />}
      {view === 'jisseki' && <JissekiTab />}
      {view === 'grid' && <>
      <LiveBanner state={mq.live ? lq.state : mq.state} error={mq.error || lq.error} onReload={() => { mq.reload(); lq.reload(); }} note="シフトは本人がスマホで入れます（ここからは直せません）。提出のお願い（LINE）は確認のあとで送ります（送信を止めている間は印だけ）。呼び名は時間がぴったり合うシフトに付きます" />
      <MikeikenNote mk={mk} live={live} />
      {live && <PatternBar pats={pats} canEdit={canEdit} reload={pq.reload} onDone={(t) => { hit(); toast({ text: t, sub: '→ 今の社内システムに残しました' }); }} />}
      {live && tq.state === 'loading' && <div className="text-sm text-faint">まだ出していない人（未提出）を探しています…</div>}

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={waiting.length} total={notSubmitted.length || 1} />
        <div className="text-body"><b>まだ出していない人 {notSubmitted.length}人</b>{live && <span className="ml-2 text-muted">未提出 {rowsP.filter((p) => p.state === '未提出').length}・下書き {rowsP.filter((p) => p.state === '下書き').length}</span>}<span className="ml-2 text-muted">お願いを送っていない人 {waiting.length}人</span>
          {!canEdit && <div className="text-sm text-bad">{needText('edit')}</div>}
        </div>
        <button onClick={() => waiting.length && ask(waiting)} disabled={!okEdit || !live || waiting.length === 0} title={block} className="btn-primary ml-auto"><Send size={15} />{waiting.length}人にまとめてお願い（あおい）</button>
      </div>

      {live && notSubmitted.length > 0 && waiting.length === 0 && (
        <div className="mo-scale-in flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-body"><Check size={18} className="text-ok" />まだ出していない人には、全員お願いを送りました。届いたら、ここが「提出済み」に変わります。</div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {SHIFT_KINDS.filter((k) => k.k).map((k) => <span key={k.k} className="chip" style={{ background: `var(--tone-${k.tone}-bg)`, color: `var(--tone-${k.tone}-fg)` }}>{k.short} {k.k}{k.time && ` ${k.time}`}</span>)}
      </div>

      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead><tr className="th-row">
              <th className="sticky left-0 z-10 min-w-[200px] bg-soft px-3 py-2 text-left font-semibold">社員</th>
              {days.map(({ d, dow }) => <th key={d} className={`w-8 px-0 py-1.5 text-center font-semibold ${dow === 0 ? 'text-bad' : dow === 6 ? 'text-ok' : ''}`}><div className="num">{d}</div><div className="text-xs font-normal text-faint">{DOW[dow]}</div></th>)}
              <th className="px-3 py-2 text-left font-semibold">出勤</th>
            </tr></thead>
            <tbody>
              {rowsP.length === 0 && <tr><td colSpan={M.days + 2} className="px-4 py-6 text-center text-body text-muted">{live ? `${M.label}のシフトを入れた人はまだいません` : mq.state === 'loading' || lq.state === 'loading' ? '読み込み中…' : '読めませんでした'}</td></tr>}
              {rowsP.map((p, pi) => {
                const work = p.days.filter((k) => k && k !== '休み').length;
                return (
                  <tr key={p.personId} className="mo-fade-in row border-t border-line-soft" style={{ ['--i' as string]: pi }}>
                    <td className="sticky left-0 z-10 bg-surface px-3 py-2 align-top">
                      <PersonName name={p.name} />
                      <div className="text-xs text-faint">{p.site}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="chip" style={{ background: STATE_STYLE[p.state].bg, color: STATE_STYLE[p.state].fg }}>{p.state}</span>
                        {p.state !== '提出済み' && (askedOf(p)
                          ? <span className="text-xs text-ok">お願い済み</span>
                          : <button onClick={() => ask([p])} disabled={!okEdit} title={block} className="text-xs font-semibold disabled:opacity-40" style={{ color: 'var(--ad)' }}>お願いする</button>)}
                      </div>
                    </td>
                    {p.days.map((k, i) => {
                      const pat = k === '出勤' ? patternOf(p.times?.[i] || '', pats) : undefined;
                      const tone = pat ? pat.tone : !k && p.state === '提出済み' ? 'mute' : KIND[k]?.tone || 'mute';
                      const label = pat ? pat.short : k === '出勤' ? '出' : k === '休み' ? '休' : !k && p.state === '提出済み' ? '休' : '';
                      return (
                        <td key={i} className="p-0.5">
                          <span title={`${p.times?.[i] ? `${pat ? `${pat.name} ` : ''}${p.times[i]}・` : ''}${CELL_LOCK}`} className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold"
                            style={{ background: label ? `var(--tone-${tone}-bg)` : 'transparent', color: `var(--tone-${tone}-fg)`, opacity: !k && p.state === '提出済み' ? 0.55 : 1, border: label ? 'none' : '1px dashed var(--color-line)' }}>{label}</span>
                        </td>
                      );
                    })}
                    <td className="num px-3 py-2 text-muted">{work}日</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </>}
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
    </main>
  );
}

// シフトの呼び名（早番・遅番など）。本人が入れた時間がぴったり合えば、その名前と1文字でマスに出す（本人の入力は変えない）。内勤が足す・消す
const PTONES = [['ok', '緑'], ['info', '青'], ['caution', '黄'], ['warn', '橙'], ['purple', '紫'], ['mute', '灰']] as const;
function PatternBar({ pats, canEdit, reload, onDone }: { pats: ShiftPattern[]; canEdit: boolean; reload: () => void; onDone: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', short: '', start: '', end: '', tone: 'ok' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const lock = !canEdit ? needText('edit') : undefined;
  const add = async () => {
    setBusy(true); setErr('');
    try { await postLive('/api/live/roumu', { action: 'shift-pattern-save', ...f, sort: pats.length }); setF({ name: '', short: '', start: '', end: '', tone: 'ok' }); reload(); onDone(`呼び名「${f.name}」を足しました`); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const remove = (p: ShiftPattern) => setConfirm({ title: `呼び名「${p.name}」を消す`, okLabel: '消す', danger: true, lines: ['本人が入れたシフトは消えません。マスの名前が「出」に戻るだけです'],
    run: async () => { await postLive('/api/live/roumu', { action: 'shift-pattern-remove', id: p.id }); reload(); onDone(`呼び名「${p.name}」を消しました`); } });
  const inp = 'min-h-8 rounded-lg border border-field bg-surface px-2 text-sm';
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <b>シフトの呼び名</b>
        {pats.length === 0 && <span className="text-muted">まだありません（時間のマスは「出」で出ます）</span>}
        {pats.map((p) => (
          <span key={p.id} className="chip inline-flex items-center gap-1" style={{ background: `var(--tone-${p.tone}-bg)`, color: `var(--tone-${p.tone}-fg)` }}>
            {p.short} {p.name} {p.start_time.replace(/^0/, '')}〜{p.end_time.replace(/^0/, '')}
            {open && <button aria-label={`${p.name} を消す`} onClick={() => remove(p)} disabled={!canEdit} title={lock} className="ml-0.5 disabled:opacity-40">×</button>}
          </span>
        ))}
        <button onClick={() => setOpen((v) => !v)} className="ml-auto text-sm font-semibold" style={{ color: 'var(--ad)' }}>{open ? '閉じる' : '呼び名を足す・消す'}</button>
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="名前" placeholder="早番" maxLength={12} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={`${inp} w-24`} />
          <input aria-label="1文字" placeholder="早" maxLength={2} value={f.short} onChange={(e) => setF({ ...f, short: e.target.value })} className={`${inp} w-14`} />
          <input aria-label="始まり" type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} className={inp} />
          <span>〜</span>
          <input aria-label="終わり" type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} className={inp} />
          <select aria-label="色" value={f.tone} onChange={(e) => setF({ ...f, tone: e.target.value })} className={inp}>{PTONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <button onClick={add} disabled={!canEdit || busy || !f.name || !f.short || !f.start || !f.end} title={lock} className="btn-primary btn-sm">{busy ? '足しています…' : '足す'}</button>
          {err && <span className="text-bad">{err}</span>}
        </div>
      )}
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
