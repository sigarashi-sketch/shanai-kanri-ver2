'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, FileText, FolderInput } from 'lucide-react';
import { PageTitle } from '@/components/ui';
import { RemainRing } from '@/components/Motivation';
import { LiveBanner } from '@/components/Live';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { PersonName } from '@/components/Person';
import { savedPdfUrl, stampedPdfUrl, type IkeMonthSum, type SeikyuStoreLive, type StoreCo, type StoreState } from '@/lib/live/seikyu-store';

// 請求書（経理管理）＝格納した請求書を正にした、月ごと・取引先マスタの会社ごとの一覧（10-25 shoya「請求書は請求書格納したところベースに」）。
//   ・数え方は今の格納タブと同じ（10-25「1」）：その会社の名簿の人（未経験）が全員、格納した請求書（押印ずみ・別で作った）に載っているか
//   ・ログイン中は /api/live/seikyu-store（今の GET だけ）。見るだけ。PDF を置く・人を選ぶは「請求書・勤務表の格納」ページから
//   ・ログインしていなければ見本（本物の会社名・人ではない）。★見本はログインしていないときだけ。読み込み中・読めなかったときは見本を出さない（10-25）
const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;
const TONE: Record<StoreState, string> = { 全員載っている: 'ok', 載っていない人あり: 'bad', 押印し直しが要る: 'warn', 人を選ぶ: 'warn', まだ: 'mute' };
const STATES: StoreState[] = ['載っていない人あり', '人を選ぶ', '押印し直しが要る', 'まだ', '全員載っている'];
const ymLabel = (ym: string) => `${Number(ym.slice(0, 4))}年${Number(ym.slice(5, 7))}月分`;
const md = (iso: string) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : '');

const SAMPLE: SeikyuStoreLive = {
  ym: '2026-09', savedN: 3, stampedN: 3, pending: 0, generatedAt: '',
  months: [{ ym: '2026-09', n: 3, total: 2_860_000, stamped: 2 }, { ym: '2026-08', n: 3, total: 2_640_000, stamped: 3 }],
  companies: [
    { key: 'a', company: 'A社', state: '載っていない人あり', people: 3, on: ['山田 太郎', '鈴木 一郎'], off: ['伊藤 誠'], invs: [{ id: 'i1', number: 'INV-0912', partner: 'A社', total: 1_320_000, stamped: { id: 's1', at: '2026-10-02T10:00:00Z' }, stale: false }], ext: [], cardDone: true },
    { key: 'b', company: 'B社', state: '押印し直しが要る', people: 1, on: [], off: ['渡辺 涼'], invs: [{ id: 'i2', number: 'INV-0915', partner: 'B社', total: 495_000, stamped: { id: 's2', at: '2026-10-01T10:00:00Z' }, stale: true }], ext: [], cardDone: true },
    { key: 'c', company: 'C社', state: 'まだ', people: 2, on: [], off: ['高橋 健', '中村 優'], invs: [{ id: 'i3', number: 'INV-0903', partner: 'C社', total: 1_045_000, stamped: null, stale: false }], ext: [], cardDone: false },
    { key: 'd', company: 'D社', state: '全員載っている', people: 1, on: ['加藤 葵'], off: [], invs: [], ext: [{ id: 'e1', name: 'D社_9月分_請求書', at: '2026-10-02T08:00:00Z', unread: false }], cardDone: true },
  ],
};

export default function SeikyuPage() {
  const [ym, setYm] = useState('');
  const lv = useLiveRoute<SeikyuStoreLive>(`/api/live/seikyu-store${ym ? `?ym=${ym}` : ''}`);
  const live = lv.live && !!lv.data;
  const d: SeikyuStoreLive | null = live ? lv.data! : lv.state === 'sample' ? SAMPLE : null;
  const busy = live && !!ym && d!.ym !== ym;
  const [filter, setFilter] = useState<'すべて' | StoreState>('すべて');
  const cs = useMemo(() => d?.companies ?? [], [d]);
  const count = (s: StoreState) => cs.filter((c) => c.state === s).length;
  const withPeople = cs.filter((c) => c.people > 0);
  const allOn = withPeople.filter((c) => !c.off.length && c.state === '全員載っている').length;
  const offN = cs.reduce((n, c) => n + c.off.length, 0);
  const shown = useMemo(() => cs.filter((c) => filter === 'すべて' || c.state === filter).sort((a, b) => STATES.indexOf(a.state) - STATES.indexOf(b.state)), [cs, filter]);
  const stampDone = cs.reduce((n, c) => n + c.invs.filter((x) => x.stamped).length, 0), invN = cs.reduce((n, c) => n + c.invs.length, 0);

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="請求書" sub={`格納した請求書を正にした一覧です。会社の名簿の人が全員、格納した請求書に載っているかを見ます${lv.state === 'sample' ? '・見本データ' : ''}`}>
        <Link href="/keiri/kakunou" className="btn-primary inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-3.5 text-[13px] font-bold"><FolderInput size={15} />格納する</Link>
      </PageTitle>
      <LiveBanner state={lv.state} error={lv.error} onReload={lv.reload} note="今の請求書作成の「格納」タブと同じデータ・同じ数え方です（見るだけ）。全員ぶんの下書きを読むので、開くのに10〜20秒かかります" />
      {!d && lv.state === 'loading' && <div className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-[13px] text-muted">今の格納の中身を読んでいます…（10〜20秒）</div>}

      {d && <div className="mo-fade-up flex flex-wrap gap-2" style={{ ['--i' as string]: 1 }}>
        {d.months.map((m: IkeMonthSum) => (
          <button key={m.ym} onClick={() => live && setYm(m.ym)} aria-pressed={m.ym === (ym || d.ym)} className="min-h-[58px] rounded-xl border px-3.5 py-2 text-left text-[12px]"
            style={m.ym === (ym || d.ym) ? { borderColor: 'var(--a)', background: 'var(--as)' } : { borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}>
            <div className="text-[13.5px] font-bold" style={m.ym === (ym || d.ym) ? { color: 'var(--ad)' } : undefined}>{ymLabel(m.ym)}</div>
            <div className="num text-muted">保存 {m.n}枚・{yen(m.total)}・押印 {m.stamped}/{m.n}</div>
          </button>
        ))}
      </div>}

      {busy ? <div className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-[13px] text-muted">{ymLabel(ym)}を読んでいます…（10〜20秒）</div> : d && (
        <>
          <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 2 }}>
            <RemainRing remain={withPeople.length - allOn} total={withPeople.length} />
            <div className="text-[13px]"><b>{ymLabel(d.ym)} 名簿の人が全員載っている {allOn}／{withPeople.length}社</b>
              <div className="text-[12px] text-muted">請求書に載っていない人 <b className="num">{offN}</b>人・保存した請求書の押印ずみ <span className="num">{stampDone}／{invN}</span>枚{d.pending ? `・中身をまだ読んでいるファイル ${d.pending}件（少しあとで読み直してください）` : ''}</div>
            </div>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {(['すべて', ...STATES] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`min-h-8 rounded-full border px-3 text-[12.5px] ${filter === f ? 'font-semibold' : 'text-muted'}`}
                  style={filter === f ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>
                  {f} {f === 'すべて' ? cs.length : count(f)}
                </button>
              ))}
            </div>
          </div>

          {withPeople.length > 0 && allOn === withPeople.length && filter === 'すべて' && (
            <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-5 text-center"><Check className="mx-auto text-ok" size={24} /><div className="mt-1 text-[14px] font-bold">この月は、名簿の人が全員どれかの請求書に載っています</div></div>
          )}

          <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 3 }}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] border-collapse text-[13px]">
                <thead><tr className="th-row text-left">
                  <th className="px-4 py-2.5 font-semibold">取引先</th><th className="px-2 py-2.5 font-semibold">名簿の人</th><th className="px-2 py-2.5 font-semibold">保存した請求書</th><th className="px-2 py-2.5 font-semibold">別で作った請求書</th><th className="px-4 py-2.5 font-semibold">状態</th>
                </tr></thead>
                <tbody>
                  {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">この条件の会社はありません</td></tr>}
                  {shown.map((c: StoreCo, i) => (
                    <tr key={c.key} className="mo-fade-in row border-t border-line-soft align-top" style={{ ['--i' as string]: Math.min(i, 24) }}>
                      <td className="px-4 py-2.5"><b>{c.company}</b><div className="text-[11.5px] text-faint">{c.people ? `${c.people}名` : '名簿の人なし'}</div></td>
                      <td className="max-w-[340px] px-2 py-2.5">
                        {c.off.length > 0 && <div className="flex flex-wrap items-center gap-1"><span className="text-[11.5px] font-semibold text-bad">載っていない {c.off.length}名</span>{c.off.map((n) => <span key={n} className="chip" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}><PersonName name={n} /></span>)}</div>}
                        {c.on.length > 0 && <div className="mt-1 flex flex-wrap items-center gap-1"><span className="text-[11.5px] font-semibold text-ok">載っている {c.on.length}名</span>{c.on.map((n) => <span key={n} className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}><PersonName name={n} /></span>)}</div>}
                        {!c.people && <span className="text-faint">—</span>}
                      </td>
                      <td className="px-2 py-2.5">
                        {c.invs.length === 0 ? <span className="text-faint">—</span> : <ul className="flex flex-col gap-1">{c.invs.map((x) => (
                          <li key={x.id} className="text-[12.5px]"><span className="num">{x.number || '（番号なし）'}</span> <span className="num text-muted">{yen(x.total)}</span>
                            <span className="ml-1 text-[11.5px]" style={{ color: x.stale ? 'var(--color-warn)' : x.stamped ? 'var(--color-ok)' : 'var(--color-bad)' }}>{x.stale ? '押印のあと保存し直した' : x.stamped ? `押印ずみ ${md(x.stamped.at.slice(0, 10))}` : '押印まだ'}</span>
                            {live && <span className="ml-1.5 text-[11.5px]"><a href={savedPdfUrl(x.id)} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: 'var(--ad)' }}>PDF</a>{x.stamped && <> ・<a href={stampedPdfUrl(x.stamped.id)} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: 'var(--ad)' }}>押印PDF</a></>}</span>}</li>
                        ))}</ul>}
                      </td>
                      <td className="max-w-[300px] px-2 py-2.5">
                        {c.ext.length === 0 ? <span className="text-faint">—</span> : <ul className="flex flex-col gap-1">{c.ext.map((f) => (
                          <li key={f.id} className="flex items-start gap-1.5 text-[12.5px]"><FileText size={13} className="mt-0.5 shrink-0 text-faint" />
                            <span className="min-w-0 break-all">{live ? <a href={stampedPdfUrl(f.id)} target="_blank" rel="noreferrer" className="hover:underline">{f.name}</a> : f.name}{f.unread && <span className="ml-1 text-[11px] font-semibold text-warn">人を選ぶ</span>}</span></li>
                        ))}</ul>}
                      </td>
                      <td className="px-4 py-2.5"><span className="chip" style={{ background: `var(--tone-${TONE[c.state]}-bg)`, color: `var(--tone-${TONE[c.state]}-fg)` }}>{c.state}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[11.5px] text-faint">「人を選ぶ」＝中身を読めない・名前が見つからないファイル。格納ページでそのファイルの「人を選ぶ」から選ぶと、ここにも反映されます。</p>
        </>
      )}
    </main>
  );
}
