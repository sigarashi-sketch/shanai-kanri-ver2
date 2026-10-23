'use client';

import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { useState } from 'react';
import { PEOPLE, SITE_HISTORY, TIMELINE, type Person } from '@/lib/sample';
import { NEWCOMERS } from '@/lib/nyusha-sample';
import { KIHON } from '@/lib/kihon-sample';
import { HANDOFFS } from '@/lib/jimu-sample';
import { RISK_PEOPLE } from '@/lib/rishoku-sample';
import { CASES } from '@/lib/sankyu-sample';
import { MODULES } from '@/lib/theme';
import { Pill } from '@/components/ui';
import { fmtDate } from '@/lib/yoyaku-sample';
import { moduleOf, usePersonYoyaku } from '@/components/YoyakuStore';

type SiteRow = (typeof SITE_HISTORY)[number] & { key: string; pending?: boolean };

// 名簿の見本（PEOPLE）に居ない人＝入社手続き・基本情報などの画面にだけ出てくる人。
//   その画面の見本からわかる分だけで社員ページを組み立てる（リンク先が「見つからない」にならないように）
function fallbackPerson(id: string): Person | null {
  const n = NEWCOMERS.find((x) => x.id === id), k = KIHON.find((x) => x.id === id), h = HANDOFFS.find((x) => x.id === id);
  const r = RISK_PEOPLE.find((x) => x.id === id), c = CASES.find((x) => x.personId === id);
  const name = n?.name ?? k?.name ?? h?.name ?? r?.name ?? c?.person;
  if (!name) return null;
  const joining = !!(n || h || k);
  return {
    id, name, kana: '', no: `S-${id.slice(1)}`, joined: n ? n.joinOn.replaceAll('-', '/') : '—',
    status: joining && !r ? '入場予定' : '稼働中', site: h?.site ?? n?.site ?? r?.site ?? c?.site ?? '—',
    contract: h?.contract ?? '—', station: k?.station ?? '—', price: h?.price ?? '—',
    sales: h?.sales ?? r?.sales ?? c?.sales ?? '—', recruiter: n?.recruiter ?? r?.recruiter ?? '—',
    kintai: { text: joining && !r ? '入場前' : '—', tone: 'mute' },
  };
}

const TABS = ['基本情報', '現場の履歴', '勤怠', '請求', '書類', '面談メモ'] as const;

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const inRoster = PEOPLE.some((x) => x.id === id);
  const p = PEOPLE.find((x) => x.id === id) ?? fallbackPerson(id);
  const [tab, setTab] = useState<(typeof TABS)[number]>('現場の履歴');
  const [base, setBase] = useState<string>('today'); // 基準日：今日 か 予約の日
  // この人のまだ切り替わっていない予約（変更の予約と同じデータ）
  const pend = usePersonYoyaku(id);
  if (!p) notFound();
  const siteNext = pend.find((r) => r.field === '現場');
  // 基準日を予約の日にすると、その日までに切り替わる予約を当てた姿で上の欄を出す
  const asOf = (f: string, now: string) => (base === 'today' ? now : [...pend].reverse().find((r) => r.field === f && r.date <= base)?.to ?? now);
  const baseDates = Array.from(new Set(pend.map((r) => r.date)));
  const priceAt = (date: string) => pend.find((r) => r.field === '単価' && r.date <= date)?.to;
  // 現場の履歴：予約した現場を先頭に足す（見本の履歴に入っていた「予約」の行は使わない）
  const history = [
    ...pend.filter((r) => r.field === '現場').reverse().map((r) => ({ period: `${r.date.replaceAll('-', '/')} 〜`, site: r.to, terms: `${p.contract}・${priceAt(r.date) ?? p.price}`, state: '予約' as const, pending: r.state === '承認待ち', key: r.id } as SiteRow)),
    // 見本の履歴は名簿の見本にいる人だけ（それ以外の人はまだ履歴なし）
    ...(inRoster ? SITE_HISTORY.filter((h) => h.state !== '予約').map((h) => ({ ...h, key: h.period } as SiteRow)) : []),
  ];
  // タイムライン：これからの予約（点線の丸）を上に、過去のできごとを下に
  const timeline = [
    ...pend.slice().reverse().map((r) => ({ module: moduleOf(r), when: `${fmtDate(r.date)} 予約`, text: `${r.field}が ${r.to} に`, sub: `登録 ${r.by}${r.state === '承認待ち' ? '・承認待ち' : ''}`, future: true, key: r.id })),
    ...(inRoster ? TIMELINE.filter((t) => !t.future).map((t) => ({ ...t, key: t.when + t.text })) : []),
  ];

  const facts: [string, React.ReactNode][] = [
    ['現場', <span key="s"><b>{asOf('現場', p.site)}</b>{siteNext && base === 'today' && <span className="block text-[11.5px] font-semibold" style={{ color: 'var(--ad)' }}>→ {fmtDate(siteNext.date)}〜 {siteNext.to}</span>}</span>], ['契約・単価', `${p.contract}・${asOf('単価', p.price)}`],
    ['担当営業', <span key="e"><span style={{ color: 'var(--c-eigyo)' }}>●</span> {p.sales}</span>], ['採用担当', <span key="j"><span style={{ color: 'var(--c-jinji)' }}>●</span> {p.recruiter}</span>],
    ['入社日', p.joined], ['最寄駅', p.station], ['通勤', base === 'today' ? (inRoster ? '定期 ¥15,840' : '—') : asOf('通勤', inRoster ? '定期 ¥15,840' : '—')], ['今月の勤怠', p.kintai.text],
  ];

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-surface px-6 py-2.5 text-[13px]">
        <Link href="/jinji/staff" className="text-muted hover:underline">社員一覧</Link><span className="text-faint">/</span><b>{p.name}</b>
      </div>
      <section className="mo-fade-up border-b border-line bg-surface px-6 pt-5">
        <div className="flex flex-wrap items-start gap-5">
          <div aria-hidden className="flex size-[72px] shrink-0 items-center justify-center rounded-full text-[26px] font-bold" style={{ background: 'var(--as)', color: 'var(--ad)', boxShadow: '0 0 0 3px var(--color-surface), 0 0 0 5px var(--al)' }}>{p.name[0]}</div>
          <div className="w-[210px]">
            <div className="text-[12px] text-faint">{[p.kana, p.no].filter(Boolean).join('・')}</div>
            <div className="text-[22px] font-bold tracking-tight">{p.name}</div>
            <div className="mt-2 flex gap-1.5"><Pill>{asOf('状態', p.status)}</Pill>{pend.length > 0 && <Pill>予約</Pill>}</div>
          </div>
          <dl className="grid min-w-[480px] flex-1 grid-cols-4 gap-x-5 gap-y-2.5 text-[13px]">
            {facts.map(([k, v]) => <div key={k}><dt className="text-[11.5px] text-faint">{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <label className="flex items-center gap-1 whitespace-nowrap text-[12px] text-muted" title="予約の日を選ぶと、その日の朝に切り替わったあとの姿で出します">基準日
            <select value={base} onChange={(e) => setBase(e.target.value)} disabled={!baseDates.length} className="min-h-[34px] rounded-full border border-field bg-surface px-3 text-[12.5px] font-semibold text-ink disabled:opacity-60">
              <option value="today">今日</option>
              {baseDates.map((d) => <option key={d} value={d}>{fmtDate(d)}（予約の日）</option>)}
            </select>
          </label>
        </div>
        <div role="tablist" className="mt-4 flex gap-1 overflow-x-auto text-[13.5px]">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="whitespace-nowrap px-3 py-2.5"
              style={tab === t ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: 'var(--color-muted)' }}>
              {t}{t === '書類' && <span className="ml-0.5 font-bold text-bad" title="確かめが要る書類があります">!</span>}
            </button>
          ))}
        </div>
      </section>

      <main key={tab} className="mo-axis flex flex-wrap items-start gap-4 px-6 pb-12 pt-[18px]">
        {tab === '現場の履歴' ? (
          <>
            <section className="min-w-0 flex-[999_1_640px] overflow-hidden rounded-xl border border-line bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-2.5 px-[18px] py-3.5">
                <div><h2 className="text-[15px] font-bold">現場の履歴</h2><div className="text-[12px] text-faint">期間ごとに、勤務表の稼働と請求を並べています</div></div>
                <Link href={`/jinji/yoyaku?new=1&p=${p.id}`} className="btn btn-primary inline-flex min-h-10 items-center rounded-[10px] px-4 text-[13.5px] font-semibold">＋ 適用日つきで変更</Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-[13px]">
                  <thead><tr className="th-row text-left">
                    <th className="px-[18px] py-2.5 font-semibold">期間</th><th className="px-2 py-2.5 font-semibold">現場</th><th className="px-2 py-2.5 font-semibold">契約・単価</th><th className="px-2 py-2.5 text-right font-semibold">稼働（勤務表）</th><th className="px-2 py-2.5 text-right font-semibold">請求</th><th className="px-[18px] py-2.5 font-semibold">状態</th>
                  </tr></thead>
                  <tbody>
                    {history.length === 0 && <tr><td colSpan={6} className="px-[18px] py-6 text-center text-[12.5px] text-muted">まだ現場の履歴はありません（入場すると、ここに期間ごとに並びます）</td></tr>}
                    {history.map((h, i) => (
                      <tr key={h.key} className={`mo-fade-in border-t border-line-soft ${h.state === '予約' ? 'bg-warn-soft' : 'row'}`} style={{ ['--i' as string]: i + 3 }}>
                        <td className="whitespace-nowrap px-[18px] py-2.5 font-semibold">{h.period}</td>
                        <td className={`px-2 py-2.5 ${h.terms === '—' ? 'text-muted' : ''}`}>{h.site}</td>
                        <td className="px-2 py-2.5">{h.terms}</td>
                        <td className="num px-2 py-2.5 text-right">{h.hours ?? <span className="text-faint">—</span>}{h.hoursSub && <div className="text-[11.5px] text-faint">{h.hoursSub}</div>}</td>
                        <td className="px-2 py-2.5 text-right">{h.bill ?? <span className="text-faint">—</span>}{h.billSub && <div className="text-[11.5px]" style={{ color: h.billTone === 'ok' ? 'var(--color-ok)' : 'var(--color-warn)' }}>{h.billSub}</div>}</td>
                        <td className="px-[18px] py-2.5"><Pill>{h.state}</Pill>{h.state === '予約' && <span className="ml-1.5 text-[11.5px] text-muted">{h.pending ? '承認待ち' : '通勤・様式も切替'}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <aside className="min-w-0 flex-[1_1_320px] rounded-xl border border-line bg-surface px-[18px] py-3.5">
              <div className="mb-2.5 flex items-center justify-between"><h2 className="text-[15px] font-bold">タイムライン</h2>
                <div className="flex gap-1.5 text-[11.5px]">{MODULES.map((m) => <span key={m.key}><span style={{ color: `var(--c-${m.key})` }}>●</span>{m.short}</span>)}</div></div>
              <div className="relative flex flex-col gap-3.5 pl-[22px] text-[13px]">
                <div className="absolute bottom-1.5 left-1.5 top-1.5 w-0.5 bg-track" />
                {timeline.length === 0 && <div className="text-[12.5px] text-muted">まだできごとはありません</div>}
                {timeline.map((t, i) => (
                  <div key={t.key} className="mo-fade-up relative" style={{ ['--i' as string]: i + 4 }}>
                    <i className="absolute -left-[21px] top-1 size-3 rounded-full" style={t.future ? { background: 'var(--color-surface)', border: `2.5px dashed var(--c-${t.module})` } : { background: `var(--c-${t.module})` }} />
                    <div className={`text-[11.5px] ${t.future ? 'font-semibold text-warn' : 'text-faint'}`}>{t.when}</div>
                    {t.text}{t.sub && <div className="text-[11.5px] text-faint">{t.sub}</div>}
                  </div>
                ))}
              </div>
            </aside>
          </>
        ) : (
          <section className="w-full rounded-xl border border-dashed border-field bg-surface px-6 py-10 text-center text-[13.5px] text-muted">「{tab}」タブはこれから作ります（今の社内システムの中身を、この型に載せ替えます）</section>
        )}
      </main>
    </div>
  );
}
