'use client';

import { useState } from 'react';
import { AlertTriangle, Hourglass, MessageCircle, Sparkles, X } from 'lucide-react';
import { Dialog } from './Dialog';
import { Z_MODAL } from '@/lib/layers';
import { logView } from '@/lib/live/person';

// チャットの「要約」ボタン（10-25 shoya）。押した人だけ・押したときだけ要約する（使い回しはサーバー側）。
//   ・直近3日が基本、7日も選べる。結果は小窓（ポップ）で出す
//   ・中身は決まった形（ひとこと・起きたこと〔主語つき〕・待っていること・気をつけること）。主語は LINE の相手＝緑の LINE の印、自社＝スタッフの印（10-25 shoya「要約見ずらい」「主語は LINE アイコンとか」）
//   ・ログインしていない（見本）ときは見本の文を出すだけで、要約の API は呼ばない
//   ・窓は Dialog（Escape はこの窓だけを閉じる＝後ろの名前の小窓は閉じない・z は lib/layers.ts）。作れたら「見た」を残す（10-25）
type Ev = { date: string; actor: 'self' | 'them' | 'member'; who: string; text: string };
type Data = { headline: string; events: Ev[]; waiting: string[]; cautions: string[] };
const SAMPLE: Data = {
  headline: '現場の入場日と持ち物の確認が中心（見本）',
  events: [
    { date: '10/24', actor: 'them', who: '相手', text: '「了解です、スーツで行きます」と返信' },
    { date: '10/24', actor: 'self', who: '自社（見本）', text: '入場日の案内と持ち物を送った' },
    { date: '10/23', actor: 'self', who: '自社', text: '案件の案内を2件送った' },
  ],
  waiting: [],
  cautions: [],
};

type Res = { ok?: boolean; text?: string; data?: Data | null; count?: number; cached?: boolean; error?: string };

export function ChatSummary({ kind, id, name, live }: { kind: 'user' | 'group'; id: string; name: string; live: boolean }) {
  const [days, setDays] = useState<3 | 7>(3);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Res | null>(null);

  const run = async (d: 3 | 7) => {
    setDays(d); setOpen(true); setBusy(true); setRes(null);
    if (!live) { await new Promise((r) => setTimeout(r, 700)); setRes({ ok: true, data: SAMPLE, count: 6 }); setBusy(false); return; }
    try {
      const r = await fetch('/api/live/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, id, days: d }) });
      const j = (await r.json().catch(() => ({ error: `読めませんでした（${r.status}）` }))) as Res;
      setRes(j);
      if (j.ok) logView('summary', name);
    } catch (e) { setRes({ error: (e as Error).message }); }
    setBusy(false);
  };

  return (
    <>
      <span className="inline-flex items-center overflow-hidden rounded-[10px] border border-field text-sm font-semibold">
        <button type="button" onClick={() => run(days)} title={`直近${days}日のやり取りを要約`} className="inline-flex min-h-8 items-center gap-1 px-2.5" style={{ color: 'var(--ad)' }}><Sparkles size={13} />要約</button>
        <select aria-label="要約する日数" value={days} onChange={(e) => setDays(Number(e.target.value) === 7 ? 7 : 3)} className="min-h-8 border-l border-field bg-transparent px-1.5 text-muted">
          <option value={3}>3日</option><option value={7}>7日</option>
        </select>
      </span>
      {open && (
        <Dialog label={`${name} の要約`} onClose={() => setOpen(false)} z={Z_MODAL} backdropClassName="bg-black/30"
          className="mo-scale-in fixed left-1/2 top-[12vh] flex max-h-[76vh] w-[min(560px,92vw)] -translate-x-1/2 flex-col panel">
            <div className="flex items-center gap-2 border-b border-line px-5 py-3">
              <Sparkles size={16} style={{ color: 'var(--a)' }} />
              <div className="min-w-0 flex-1"><div className="truncate text-md font-bold">{name} の要約</div><div className="text-xs text-faint">直近{days}日{res?.count ? `・${res.count}件` : ''}{res?.cached ? '・前の要約（新しい書き込みなし）' : ''}{!live ? '・見本' : ''}</div></div>
              {([3, 7] as const).map((d) => (
                <button key={d} onClick={() => run(d)} disabled={busy} className="rounded-lg border px-2 py-1 text-sm font-semibold disabled:opacity-40" style={d === days ? { borderColor: 'var(--a)', color: 'var(--ad)' } : { borderColor: 'var(--color-field)', color: 'var(--color-muted)' }}>{d}日</button>
              ))}
              <button aria-label="閉じる" data-dialog-close onClick={() => setOpen(false)} className="flex size-8 items-center justify-center rounded-lg border border-line"><X size={15} /></button>
            </div>
            <div className="overflow-y-auto px-5 py-4 text-body leading-relaxed">
              {busy && <p className="text-muted">要約しています…</p>}
              {!busy && res?.error && <p className="text-bad">{res.error}{res.error.includes('ログイン') && <a href="/api/ike-auth/start" className="ml-2 underline">もう一度ログイン</a>}</p>}
              {!busy && res?.data && <SummaryView d={res.data} />}
              {!busy && !res?.data && res?.text && <p className="whitespace-pre-wrap">{res.text}</p>}
            </div>
            <div className="border-t border-line px-5 py-2 text-xs text-faint">AI の要約です。大事なところは会話そのものを確かめてください。</div>
        </Dialog>
      )}
    </>
  );
}

// 主語の印：LINE の相手・メンバー＝緑の LINE の印、自社＝スタッフの頭文字（無ければ「社」）
function Actor({ e }: { e: Ev }) {
  if (e.actor === 'self') {
    const n = (e.who.match(/（(.+?)）/)?.[1] || '').replace(/[\s　]/g, '');
    return <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: 'var(--a)', color: 'var(--ao)' }}>{n ? n[0] : '社'}</span>;
  }
  return <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-[9px]" style={{ background: '#06C755' }}><MessageCircle size={15} fill="#fff" color="#fff" /></span>;
}

function SummaryView({ d }: { d: Data }) {
  const who = (e: Ev) => (e.actor === 'self' ? e.who.replace(/^自社（(.+)）$/, '$1') || '自社' : e.who);
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl px-4 py-3 text-md font-bold leading-snug" style={{ background: 'var(--as)', color: 'var(--ad)' }}>{d.headline}</p>
      <section>
        <div className="mb-2 text-sm font-bold text-muted">起きたこと（新しい順）</div>
        {d.events.length === 0 ? <p className="text-faint">なし</p> : (
          <ol className="flex flex-col">
            {d.events.map((e, i) => (
              <li key={i} className="flex gap-3 border-b border-line-soft py-2 last:border-0">
                <Actor e={e} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 text-xs"><b className="text-ink">{who(e)}</b><span className="text-faint">{e.actor === 'self' ? (who(e) === '自社' ? '' : '自社・') : 'LINE・'}{e.date}</span></div>
                  <div className="mt-0.5 break-words">{e.text}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        <Box icon={<Hourglass size={14} />} title="待っていること／まだ返していないこと" items={d.waiting} tone="var(--color-warn, #b45309)" />
        <Box icon={<AlertTriangle size={14} />} title="気をつけること" items={d.cautions} tone="var(--color-bad, #b91c1c)" />
      </div>
    </div>
  );
}

function Box({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items: string[]; tone: string }) {
  const none = items.length === 0;
  return (
    <section className="rounded-xl border px-3.5 py-2.5" style={{ borderColor: none ? 'var(--color-line)' : tone }}>
      <div className="mb-1 flex items-center gap-1.5 text-sm font-bold" style={{ color: none ? 'var(--color-muted)' : tone }}>{icon}{title}</div>
      {none ? <p className="text-sm text-faint">なし</p> : <ul className="flex flex-col gap-1 text-body">{items.map((x, i) => <li key={i}>・{x}</li>)}</ul>}
    </section>
  );
}
