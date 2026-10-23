'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Send } from 'lucide-react';
import { SHIFT_KINDS, SHIFT_MONTH, SHIFT_PEOPLE, type ShiftKind, type ShiftPerson, type ShiftState } from '@/lib/shift-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { LIVE_WRITE_BLOCKED, LiveBanner, NotInLegacy, useIke } from '@/components/Live';
import { shiftMonthOf, shiftPeopleOf, type IkeShiftDetail, type IkeShiftList, type IkeShiftMonth } from '@/lib/live/shift';

// シフト表（労務/営業管理）＝シフト勤務の人の月のシフトを「日×人」のマスで見る・直す。
//   ・マスは選ぶだけ（早番/日勤/遅番/夜勤/休み）。提出済みの月の空欄は休みとみなす（薄く「休」と出す）
//   ・未提出・下書きの人には提出のお願いを送る（あおい）。残りの人数をリングで出す
//   ・直したシフトは当日の出勤状況の「未打刻」の判定に使われる
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const KIND = Object.fromEntries(SHIFT_KINDS.map((k) => [k.k, k]));
const STATE_STYLE: Record<ShiftState, { bg: string; fg: string }> = {
  提出済み: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)' },
  下書き: { bg: 'var(--tone-caution-bg)', fg: 'var(--tone-caution-fg)' },
  未提出: { bg: 'var(--tone-bad-bg)', fg: 'var(--tone-bad-fg)' },
};

export default function ShiftPage() {
  const canEdit = usePerms().can('roumu', 'edit');
  const { hit, toast } = useMotivation();
  const [people, setPeople] = useState<ShiftPerson[]>(SHIFT_PEOPLE);
  const [asked, setAsked] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<string | null>(null);
  // 本物：開く月 → その月の一覧 → 1人ずつ日ごと（GET だけ・同時に6人まで）
  const mq = useIke<IkeShiftMonth>('shift-calendar?action=month');
  const month = mq.live ? mq.data?.month || '' : '';
  const lq = useIke<IkeShiftList>(month ? `shift-calendar?action=list&month=${month}` : null);
  const live = mq.live && lq.live;
  const [details, setDetails] = useState<Record<string, IkeShiftDetail | undefined>>({});
  useEffect(() => {
    if (!live || !lq.data?.rows) return;
    let stop = false;
    const ids = lq.data.rows.map((r) => r.lineUserId);
    (async () => {
      for (let i = 0; i < ids.length && !stop; i += 6) {
        const got = await Promise.all(ids.slice(i, i + 6).map((u) => fetch(`/api/ike/shift-calendar?action=detail&month=${month}&user=${encodeURIComponent(u)}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null) as Promise<IkeShiftDetail | null>));
        if (!stop) setDetails((d) => ({ ...d, ...Object.fromEntries(got.filter((x): x is IkeShiftDetail => !!x?.ok).map((x) => [x.lineUserId, x])) }));
      }
    })();
    return () => { stop = true; };
  }, [live, lq.data, month]);
  const M = live ? shiftMonthOf(month) : SHIFT_MONTH;
  const livePeople = live ? shiftPeopleOf(lq.data, details, month) : null;
  const rowsP: (ShiftPerson & { times?: string[] })[] = livePeople || people;
  const okEdit = canEdit && !live;
  const block = live ? LIVE_WRITE_BLOCKED : !canEdit ? needText('edit') : undefined;
  const days = Array.from({ length: M.days }, (_, i) => ({ d: i + 1, dow: (M.firstDow + i) % 7 }));
  const waiting = rowsP.filter((p) => p.state !== '提出済み' && !asked[p.personId]);
  const notSubmitted = rowsP.filter((p) => p.state !== '提出済み');

  const setCell = (p: ShiftPerson, i: number, k: ShiftKind) => {
    const prev = p.days[i];
    const put = (val: ShiftKind) => setPeople((ps) => ps.map((x) => (x.personId === p.personId ? { ...x, days: x.days.map((v, j) => (j === i ? val : v)) } : x)));
    put(k);
    setFlash(`${p.personId}-${i}`); setTimeout(() => setFlash(null), 1300);
    hit();
    toast({ text: `${p.name} の ${SHIFT_MONTH.month}/${i + 1} を「${k || '空欄'}」にしました`, sub: '→ 当日の出勤状況（未打刻の判定）と、本人のシフト画面に反映しました', undo: () => put(prev) });
  };
  const ask = (ps: ShiftPerson[]) => {
    const ids = ps.map((p) => p.personId);
    setAsked((a) => ({ ...a, ...Object.fromEntries(ids.map((id) => [id, true])) }));
    hit(ps.length);
    toast({ text: ps.length > 1 ? `${ps.length}人に提出のお願いを送りました` : `${ps[0].name} に提出のお願いを送りました`, sub: `→ あおいから本人に「${SHIFT_MONTH.label}のシフトを ${SHIFT_MONTH.deadline} までに」と送りました`, undo: () => setAsked((a) => { const n = { ...a }; ids.forEach((id) => delete n[id]); return n; }) });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="シフト表" sub={live ? `${M.year}年${M.label}・本人が入れたシフト（20日を過ぎたら翌月を集める）` : `${SHIFT_MONTH.year}年${SHIFT_MONTH.label}・シフト勤務の人だけ・提出の締切は ${SHIFT_MONTH.deadline}・見本データ`}>
        <Link href="/roumu/today" className="inline-flex min-h-9 items-center rounded-[10px] border border-field bg-surface px-3 text-[12.5px] font-semibold">当日の出勤状況へ</Link>
      </PageTitle>
      <LiveBanner state={mq.live ? lq.state : mq.state} error={mq.error || lq.error} onReload={() => { mq.reload(); lq.reload(); }} note="見るだけです。シフトは本人がスマホで入れます（ここからは直せません）。提出のお願いは今の社内システムの配信から" />
      {live && <NotInLegacy what="まだ1日も入れていない人（未提出）の一覧と、早番・遅番などの名前" />}

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={waiting.length} total={notSubmitted.length || 1} />
        <div className="text-[13px]"><b>{live ? '下書きのままの人' : 'まだ出していない人'} {notSubmitted.length}人</b><span className="ml-2 text-muted">お願いを送っていない人 {waiting.length}人</span>
          {!canEdit && <div className="text-[12px] text-bad">{needText('edit')}</div>}
        </div>
        <button onClick={() => waiting.length && ask(waiting)} disabled={!okEdit || waiting.length === 0} title={block} className="btn-primary ml-auto inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-4 text-[13px] font-bold disabled:opacity-40"><Send size={15} />{waiting.length}人にまとめてお願い（あおい）</button>
      </div>

      {notSubmitted.length > 0 && waiting.length === 0 && (
        <div className="mo-scale-in flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[13px]"><Check size={18} className="text-ok" />まだ出していない人には、全員お願いを送りました。届いたら、ここが「提出済み」に変わります。</div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        {SHIFT_KINDS.filter((k) => k.k && (live ? k.k === '出勤' || k.k === '休み' : k.k !== '出勤')).map((k) => <span key={k.k} className="chip" style={{ background: `var(--tone-${k.tone}-bg)`, color: `var(--tone-${k.tone}-fg)` }}>{k.short} {k.k}{k.time && ` ${k.time}`}</span>)}
        <span>提出済みの月の空欄は休みとみなします（薄い「休」）{live && '・「出」のマスに指を置くと時間が出ます'}</span>
      </div>

      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <div className="overflow-x-auto">
          <table className="border-collapse text-[12px]">
            <thead><tr className="th-row">
              <th className="sticky left-0 z-10 min-w-[200px] bg-soft px-3 py-2 text-left font-semibold">社員</th>
              {days.map(({ d, dow }) => <th key={d} className={`w-8 px-0 py-1.5 text-center font-semibold ${dow === 0 ? 'text-bad' : dow === 6 ? 'text-ok' : ''}`}><div className="num">{d}</div><div className="text-[10px] font-normal text-faint">{DOW[dow]}</div></th>)}
              <th className="px-3 py-2 text-left font-semibold">出勤</th>
            </tr></thead>
            <tbody>
              {live && rowsP.length === 0 && <tr><td colSpan={M.days + 2} className="px-4 py-6 text-center text-[13px] text-muted">{M.label}のシフトを入れた人はまだいません</td></tr>}
              {rowsP.map((p, pi) => {
                const work = p.days.filter((k) => k && k !== '休み').length;
                return (
                  <tr key={p.personId} className="mo-fade-in row border-t border-line-soft" style={{ ['--i' as string]: pi }}>
                    <td className="sticky left-0 z-10 bg-surface px-3 py-2 align-top">
                      {live ? <span className="font-semibold">{p.name}</span> : <Link href={`/jinji/staff/${p.personId}`} className="font-semibold hover:underline">{p.name}</Link>}
                      <div className="text-[11px] text-faint">{p.site}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="chip" style={{ background: STATE_STYLE[p.state].bg, color: STATE_STYLE[p.state].fg }}>{p.state}</span>
                        {p.state !== '提出済み' && (asked[p.personId]
                          ? <span className="text-[11px] text-ok">お願い済み</span>
                          : <button onClick={() => ask([p])} disabled={!okEdit} title={block} className="text-[11px] font-semibold disabled:opacity-40" style={{ color: 'var(--ad)' }}>お願いする</button>)}
                      </div>
                    </td>
                    {p.days.map((k, i) => {
                      const implied = !k && p.state === '提出済み';
                      const meta = KIND[k] || KIND[''];
                      const tone = implied ? 'mute' : meta.tone;
                      return (
                        <td key={i} className={`p-0.5 ${flash === `${p.personId}-${i}` ? 'mo-flash' : ''}`}>
                          <select aria-label={`${p.name} ${M.month}/${i + 1}`} value={k} disabled={!okEdit} title={live ? (p.times?.[i] ? `${p.times[i]}（${LIVE_WRITE_BLOCKED}）` : LIVE_WRITE_BLOCKED) : !canEdit ? needText('edit') : meta.time || undefined}
                            onChange={(e) => setCell(p, i, e.target.value as ShiftKind)}
                            className="h-8 w-8 cursor-pointer appearance-none rounded-md text-center text-[12px] font-semibold disabled:cursor-not-allowed"
                            style={{ background: k || implied ? `var(--tone-${tone}-bg)` : 'transparent', color: `var(--tone-${tone}-fg)`, opacity: implied ? 0.55 : 1, border: k || implied ? 'none' : '1px dashed var(--color-line)' }}>
                            <option value="">{implied ? '休' : ''}</option>
                            {SHIFT_KINDS.filter((x) => x.k && (live ? x.k === '出勤' || x.k === '休み' : x.k !== '出勤')).map((x) => <option key={x.k} value={x.k}>{x.short}</option>)}
                          </select>
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
      <p className="text-[11.5px] text-faint">本人はスマホのシフト画面から1日ずつ入れて提出します。ここで直したものも本人の画面に出ます（見本の中だけで動きます）。</p>
    </main>
  );
}
