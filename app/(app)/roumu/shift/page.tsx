'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Send } from 'lucide-react';
import { SHIFT_KINDS, SHIFT_MONTH, SHIFT_PEOPLE, type ShiftKind, type ShiftPerson, type ShiftState } from '@/lib/shift-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';

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
  const days = Array.from({ length: SHIFT_MONTH.days }, (_, i) => ({ d: i + 1, dow: (SHIFT_MONTH.firstDow + i) % 7 }));
  const waiting = people.filter((p) => p.state !== '提出済み' && !asked[p.personId]);
  const notSubmitted = people.filter((p) => p.state !== '提出済み');

  const setCell = (p: ShiftPerson, i: number, k: ShiftKind) => {
    const before = people;
    setPeople((ps) => ps.map((x) => (x.personId === p.personId ? { ...x, days: x.days.map((v, j) => (j === i ? k : v)) } : x)));
    setFlash(`${p.personId}-${i}`); setTimeout(() => setFlash(null), 1300);
    hit();
    toast({ text: `${p.name} の ${SHIFT_MONTH.month}/${i + 1} を「${k || '空欄'}」にしました`, sub: '→ 当日の出勤状況（未打刻の判定）と、本人のシフト画面に反映しました', undo: () => setPeople(before) });
  };
  const ask = (ps: ShiftPerson[]) => {
    const before = asked;
    setAsked((a) => ({ ...a, ...Object.fromEntries(ps.map((p) => [p.personId, true])) }));
    hit(ps.length);
    toast({ text: ps.length > 1 ? `${ps.length}人に提出のお願いを送りました` : `${ps[0].name} に提出のお願いを送りました`, sub: `→ あおいから本人に「${SHIFT_MONTH.label}のシフトを ${SHIFT_MONTH.deadline} までに」と送りました`, undo: () => setAsked(before) });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="シフト表" sub={`${SHIFT_MONTH.year}年${SHIFT_MONTH.label}・シフト勤務の人だけ・提出の締切は ${SHIFT_MONTH.deadline}・見本データ`}>
        <Link href="/roumu/today" className="inline-flex min-h-9 items-center rounded-[10px] border border-field bg-surface px-3 text-[12.5px] font-semibold">当日の出勤状況へ</Link>
      </PageTitle>

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={waiting.length} total={notSubmitted.length || 1} />
        <div className="text-[13px]"><b>まだ出していない人 {notSubmitted.length}人</b><span className="ml-2 text-muted">お願いを送っていない人 {waiting.length}人</span>
          {!canEdit && <div className="text-[12px] text-bad">{needText('edit')}</div>}
        </div>
        <button onClick={() => waiting.length && ask(waiting)} disabled={!canEdit || waiting.length === 0} title={!canEdit ? needText('edit') : undefined} className="btn-primary ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-4 text-[13px] font-bold disabled:opacity-40"><Send size={15} />{waiting.length}人にまとめてお願い（あおい）</button>
      </div>

      {notSubmitted.length > 0 && waiting.length === 0 && (
        <div className="mo-scale-in flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[13px]"><Check size={18} className="text-ok" />まだ出していない人には、全員お願いを送りました。届いたら、ここが「提出済み」に変わります。</div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        {SHIFT_KINDS.filter((k) => k.k).map((k) => <span key={k.k} className="chip" style={{ background: `var(--tone-${k.tone}-bg)`, color: `var(--tone-${k.tone}-fg)` }}>{k.short} {k.k}{k.time && ` ${k.time}`}</span>)}
        <span>提出済みの月の空欄は休みとみなします（薄い「休」）</span>
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
              {people.map((p, pi) => {
                const work = p.days.filter((k) => k && k !== '休み').length;
                return (
                  <tr key={p.personId} className="mo-fade-in row border-t border-line-soft" style={{ ['--i' as string]: pi }}>
                    <td className="sticky left-0 z-10 bg-surface px-3 py-2 align-top">
                      <Link href={`/jinji/staff/${p.personId}`} className="font-semibold hover:underline">{p.name}</Link>
                      <div className="text-[11px] text-faint">{p.site}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="chip" style={{ background: STATE_STYLE[p.state].bg, color: STATE_STYLE[p.state].fg }}>{p.state}</span>
                        {p.state !== '提出済み' && (asked[p.personId]
                          ? <span className="text-[11px] text-ok">お願い済み</span>
                          : <button onClick={() => ask([p])} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} className="text-[11px] font-semibold disabled:opacity-40" style={{ color: 'var(--ad)' }}>お願いする</button>)}
                      </div>
                    </td>
                    {p.days.map((k, i) => {
                      const implied = !k && p.state === '提出済み';
                      const meta = KIND[k] || KIND[''];
                      const tone = implied ? 'mute' : meta.tone;
                      return (
                        <td key={i} className={`p-0.5 ${flash === `${p.personId}-${i}` ? 'mo-flash' : ''}`}>
                          <select aria-label={`${p.name} ${SHIFT_MONTH.month}/${i + 1}`} value={k} disabled={!canEdit} title={!canEdit ? needText('edit') : meta.time || undefined}
                            onChange={(e) => setCell(p, i, e.target.value as ShiftKind)}
                            className="h-8 w-8 cursor-pointer appearance-none rounded-md text-center text-[12px] font-semibold disabled:cursor-not-allowed"
                            style={{ background: k || implied ? `var(--tone-${tone}-bg)` : 'transparent', color: `var(--tone-${tone}-fg)`, opacity: implied ? 0.55 : 1, border: k || implied ? 'none' : '1px dashed var(--color-line)' }}>
                            <option value="">{implied ? '休' : ''}</option>
                            {SHIFT_KINDS.filter((x) => x.k).map((x) => <option key={x.k} value={x.k}>{x.short}</option>)}
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
