'use client';

import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { useState } from 'react';
import { PEOPLE, SITE_HISTORY, TIMELINE } from '@/lib/sample';
import { MODULES } from '@/lib/theme';
import { Pill, PrimaryButton } from '@/components/ui';

const TABS = ['基本情報', '現場の履歴', '勤怠', '請求', '書類', '面談メモ'] as const;

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const p = PEOPLE.find((x) => x.id === id);
  const [tab, setTab] = useState<(typeof TABS)[number]>('現場の履歴');
  if (!p) notFound();

  const facts: [string, React.ReactNode][] = [
    ['現場', <b key="s">{p.site}</b>], ['契約・単価', `${p.contract}・${p.price}`],
    ['担当営業', <span key="e"><span style={{ color: 'var(--c-eigyo)' }}>●</span> {p.sales}</span>], ['採用担当', <span key="j"><span style={{ color: 'var(--c-jinji)' }}>●</span> {p.recruiter}</span>],
    ['入社日', p.joined], ['最寄駅', p.station], ['通勤', '定期 ¥15,840'], ['今月の勤怠', p.kintai.text],
  ];

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-white px-6 py-2.5 text-[13px]">
        <Link href="/jinji/staff" className="text-muted hover:underline">社員一覧</Link><span className="text-[#A3A6B8]">/</span><b>{p.name}</b>
      </div>
      <section className="mo-fade-up border-b border-line bg-white px-6 pt-5">
        <div className="flex flex-wrap items-start gap-5">
          <div aria-hidden className="flex size-[72px] shrink-0 items-center justify-center rounded-full text-[26px] font-bold" style={{ background: 'var(--as)', color: 'var(--ad)', boxShadow: '0 0 0 3px #fff, 0 0 0 5px var(--al)' }}>{p.name[0]}</div>
          <div className="w-[210px]">
            <div className="text-[12px] text-faint">{p.kana}・{p.no}</div>
            <div className="text-[22px] font-bold tracking-tight">{p.name}</div>
            <div className="mt-2 flex gap-1.5"><Pill>{p.status}</Pill>{p.reserve && <Pill>予約</Pill>}</div>
          </div>
          <dl className="grid min-w-[480px] flex-1 grid-cols-4 gap-x-5 gap-y-2.5 text-[13px]">
            {facts.map(([k, v]) => <div key={k}><dt className="text-[11.5px] text-faint">{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <button className="min-h-[34px] whitespace-nowrap rounded-full border border-[#DCDDE6] bg-white px-3 text-[12.5px] font-semibold">基準日：今日 ⌄</button>
        </div>
        <div role="tablist" className="mt-4 flex gap-1 text-[13.5px]">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="px-3 py-2.5"
              style={tab === t ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: '#5A5E75' }}>
              {t}{t === '書類' && <span className="ml-0.5 font-bold text-[#E11D48]">!</span>}
            </button>
          ))}
        </div>
      </section>

      <main key={tab} className="mo-axis flex flex-wrap items-start gap-4 px-6 pb-12 pt-[18px]">
        {tab === '現場の履歴' ? (
          <>
            <section className="min-w-0 flex-[999_1_640px] overflow-hidden rounded-xl border border-line bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2.5 px-[18px] py-3.5">
                <div><h2 className="text-[15px] font-bold">現場の履歴</h2><div className="text-[12px] text-faint">期間ごとに、勤務表の稼働と請求を並べています</div></div>
                <PrimaryButton>＋ 適用日つきで変更</PrimaryButton>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-[13px]">
                  <thead><tr className="text-left" style={{ background: 'var(--as)', color: 'var(--ad)' }}>
                    <th className="px-[18px] py-2.5 font-semibold">期間</th><th className="px-2 py-2.5 font-semibold">現場</th><th className="px-2 py-2.5 font-semibold">契約・単価</th><th className="px-2 py-2.5 text-right font-semibold">稼働（勤務表）</th><th className="px-2 py-2.5 text-right font-semibold">請求</th><th className="px-[18px] py-2.5 font-semibold">状態</th>
                  </tr></thead>
                  <tbody>
                    {SITE_HISTORY.map((h, i) => (
                      <tr key={h.period} className={`mo-fade-in border-t border-line-soft ${h.state === '予約' ? 'bg-[#FFFBF0]' : 'row'}`} style={{ ['--i' as string]: i + 3 }}>
                        <td className="px-[18px] py-2.5 font-semibold">{h.period}</td>
                        <td className={`px-2 py-2.5 ${h.terms === '—' ? 'text-muted' : ''}`}>{h.site}</td>
                        <td className="px-2 py-2.5">{h.terms}</td>
                        <td className="num px-2 py-2.5 text-right">{h.hours ?? <span className="text-[#A3A6B8]">—</span>}{h.hoursSub && <div className="text-[11.5px] text-faint">{h.hoursSub}</div>}</td>
                        <td className="px-2 py-2.5 text-right">{h.bill ?? <span className="text-[#A3A6B8]">—</span>}{h.billSub && <div className="text-[11.5px]" style={{ color: h.billTone === 'ok' ? '#116B34' : '#B45309' }}>{h.billSub}</div>}</td>
                        <td className="px-[18px] py-2.5"><Pill>{h.state}</Pill>{h.state === '予約' && <span className="ml-1.5 text-[11.5px] text-muted">通勤・様式も切替</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <aside className="min-w-0 flex-[1_1_320px] rounded-xl border border-line bg-white px-[18px] py-3.5">
              <div className="mb-2.5 flex items-center justify-between"><h2 className="text-[15px] font-bold">タイムライン</h2>
                <div className="flex gap-1.5 text-[11.5px]">{MODULES.map((m) => <span key={m.key}><span style={{ color: `var(--c-${m.key})` }}>●</span>{m.short}</span>)}</div></div>
              <div className="relative flex flex-col gap-3.5 pl-[22px] text-[13px]">
                <div className="absolute bottom-1.5 left-1.5 top-1.5 w-0.5 bg-[#ECEDF3]" />
                {TIMELINE.map((t, i) => (
                  <div key={t.when} className="mo-fade-up relative" style={{ ['--i' as string]: i + 4 }}>
                    <i className="absolute -left-[21px] top-1 size-3 rounded-full" style={t.future ? { background: '#fff', border: `2.5px dashed var(--c-${t.module})` } : { background: `var(--c-${t.module})` }} />
                    <div className={`text-[11.5px] ${t.future ? 'font-semibold text-[#8A4B00]' : 'text-faint'}`}>{t.when}</div>
                    {t.text}{t.sub && <div className="text-[11.5px] text-faint">{t.sub}</div>}
                  </div>
                ))}
              </div>
            </aside>
          </>
        ) : (
          <section className="w-full rounded-xl border border-dashed border-[#C9CBDA] bg-white px-6 py-10 text-center text-[13.5px] text-muted">「{tab}」タブはこれから作ります（今のいけどんの中身を、この型に載せ替えます）</section>
        )}
      </main>
    </div>
  );
}
