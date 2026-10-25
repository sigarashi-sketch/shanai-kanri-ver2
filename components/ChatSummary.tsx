'use client';

import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { DrawerPortal } from './DrawerPortal';

// チャットの「要約」ボタン（10-25 shoya）。押した人だけ・押したときだけ要約する（使い回しはサーバー側）。
//   ・直近3日が基本、7日も選べる。結果は小窓（ポップ）で出す
//   ・ログインしていない（見本）ときは見本の文を出すだけで、要約の API は呼ばない
const SAMPLE = `■ ひとことで
現場の入場日と持ち物の確認が中心（見本）
■ 起きたこと
・10/24 自社：入場日の案内と持ち物を送った
・10/24 相手：「了解です、スーツで行きます」
・10/23 自社：案件の案内を2件送った
■ 相手が待っていること／返していないこと
なし
■ 気をつけること
なし`;

type Res = { ok?: boolean; text?: string; count?: number; cached?: boolean; error?: string };

export function ChatSummary({ kind, id, name, live }: { kind: 'user' | 'group'; id: string; name: string; live: boolean }) {
  const [days, setDays] = useState<3 | 7>(3);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Res | null>(null);

  const run = async (d: 3 | 7) => {
    setDays(d); setOpen(true); setBusy(true); setRes(null);
    if (!live) { await new Promise((r) => setTimeout(r, 700)); setRes({ ok: true, text: SAMPLE, count: 6 }); setBusy(false); return; }
    try {
      const r = await fetch('/api/live/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, id, days: d }) });
      setRes((await r.json().catch(() => ({ error: `読めませんでした（${r.status}）` }))) as Res);
    } catch (e) { setRes({ error: (e as Error).message }); }
    setBusy(false);
  };

  return (
    <>
      <span className="inline-flex items-center overflow-hidden rounded-[10px] border border-field text-[12px] font-semibold">
        <button type="button" onClick={() => run(days)} title={`直近${days}日のやり取りを要約`} className="inline-flex min-h-8 items-center gap-1 px-2.5" style={{ color: 'var(--ad)' }}><Sparkles size={13} />要約</button>
        <select aria-label="要約する日数" value={days} onChange={(e) => setDays(Number(e.target.value) === 7 ? 7 : 3)} className="min-h-8 border-l border-field bg-transparent px-1.5 text-muted">
          <option value={3}>3日</option><option value={7}>7日</option>
        </select>
      </span>
      {open && (
        <DrawerPortal>
          <div className="fixed inset-0 z-[60] bg-black/30" onClick={() => setOpen(false)} />
          <div role="dialog" aria-label={`${name} の要約`} className="mo-scale-in fixed left-1/2 top-[12vh] z-[61] flex max-h-[76vh] w-[min(560px,92vw)] -translate-x-1/2 flex-col rounded-2xl border border-line bg-surface shadow-[0_18px_48px_rgba(25,27,46,.22)]">
            <div className="flex items-center gap-2 border-b border-line px-5 py-3">
              <Sparkles size={16} style={{ color: 'var(--a)' }} />
              <div className="min-w-0 flex-1"><div className="truncate text-[15px] font-bold">{name} の要約</div><div className="text-[11.5px] text-faint">直近{days}日{res?.count ? `・${res.count}件` : ''}{res?.cached ? '・前の要約（新しい書き込みなし）' : ''}{!live ? '・見本' : ''}</div></div>
              {([3, 7] as const).map((d) => (
                <button key={d} onClick={() => run(d)} disabled={busy} className="rounded-lg border px-2 py-1 text-[12px] font-semibold disabled:opacity-40" style={d === days ? { borderColor: 'var(--a)', color: 'var(--ad)' } : { borderColor: 'var(--color-field)', color: 'var(--color-muted)' }}>{d}日</button>
              ))}
              <button aria-label="閉じる" onClick={() => setOpen(false)} className="flex size-8 items-center justify-center rounded-lg border border-line"><X size={15} /></button>
            </div>
            <div className="overflow-y-auto px-5 py-4 text-[13.5px] leading-relaxed">
              {busy && <p className="text-muted">要約しています…</p>}
              {!busy && res?.error && <p className="text-bad">{res.error}{res.error.includes('ログイン') && <a href="/api/ike-auth/start" className="ml-2 underline">もう一度ログイン</a>}</p>}
              {!busy && res?.text && <p className="whitespace-pre-wrap">{res.text}</p>}
            </div>
            <div className="border-t border-line px-5 py-2 text-[11px] text-faint">AI の要約です。大事なところは会話そのものを確かめてください。</div>
          </div>
        </DrawerPortal>
      )}
    </>
  );
}
