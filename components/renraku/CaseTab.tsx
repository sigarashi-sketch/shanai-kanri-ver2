'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useIke } from '../Live';
import type { ProgressData } from '@/lib/live/eigyo-common';
import { caseHaishinRows, type CaseHaishin, type IkouListRes } from '@/lib/live/renraku';
import { SAMPLE_CASES } from '@/lib/live/renraku-sample';
import { Note } from './parts';

// 案件配信：営業リスト（営業共有リスト・手動配信）から積んだ依頼の案件だけを並べる（2026-10-25 shoya）。
//   ・出どころ：依頼＝GET /api/ikou-requests?action=history&status=sent ＋ action=pending（案件番号）
//              送信と判断＝GET /api/proxy?action=getProgressData（案件進捗と同じ口・kNo つきの送信と 📮判断）
//   ・稼働中向けのアナウンス・案内配信・案件番号の無い送信は出ない
//   ・ここからは送らない（見るだけ）。送るのは「手動配信」タブ
const TONE: Record<string, string> = { OK: 'ok', NG: 'bad', その他: 'caution', 未判断: 'mute' };

export function CaseTab({ live, info, onManual }: { live: boolean; info: boolean; onManual: () => void }) {
  const on = live && !info;
  const sent = useIke<IkouListRes>(on ? 'ikou-requests?action=history&status=sent&limit=100' : null);
  const pend = useIke<IkouListRes>(on ? 'ikou-requests?action=pending&limit=50' : null);
  const pd = useIke<ProgressData>(on ? 'proxy?action=getProgressData' : null);
  const rows: CaseHaishin[] = on ? caseHaishinRows(pd.data, sent.data?.requests ?? [], pend.data?.requests ?? []) : SAMPLE_CASES;
  const loading = on && (sent.state === 'loading' || pend.state === 'loading' || pd.state === 'loading');
  const err = on ? sent.error || pend.error || pd.error : '';
  const [open, setOpen] = useState<string | null>(null);
  const tot = rows.reduce((a, r) => ({ ok: a.ok + r.ok, ng: a.ng + r.ng, un: a.un + r.undecided }), { ok: 0, ng: 0, un: 0 });
  // インフォメーション（それゆけ未経験の公式LINE）からは案件を送らない。案件は あおい から
  if (info) return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3">
      <Note tone="info">インフォメーションからは案件を送っていません。案件の配信は「あおい」（営業・労務・経理の画面の連絡）から送ります。</Note>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3">
      <div className="flex items-center justify-between gap-2 text-sm text-muted">
        <span>営業リストから送った案件だけ（アナウンス・案内は出しません）</span>
        <button onClick={onManual} className="shrink-0 font-semibold" style={{ color: 'var(--ad)' }}>手動配信で送る →</button>
      </div>
      {!!rows.length && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {([['OK', tot.ok, 'ok'], ['NG', tot.ng, 'bad'], ['まだ判断なし', tot.un, 'mute']] as const).map(([l, n, t]) => (
            <div key={l} className="rounded-lg py-1.5" style={{ background: `var(--tone-${t}-bg)`, color: `var(--tone-${t}-fg)` }}><div className="num text-lg font-bold">{n}</div><div className="text-xs">{l}</div></div>
          ))}
        </div>
      )}
      {loading && !rows.length && <p className="text-body text-muted">読み込み中…</p>}
      {err && <Note tone="bad">{err}</Note>}
      {!loading && !err && !rows.length && <p className="py-6 text-center text-sm text-muted">営業リストから送った案件はまだありません</p>}
      {rows.map((r, i) => {
        const isOpen = open === r.caseNo;
        return (
          <div key={r.caseNo} className="mo-fade-up rounded-xl border border-line" style={{ ['--i' as string]: Math.min(i, 10) }}>
            <button onClick={() => setOpen(isOpen ? null : r.caseNo)} aria-expanded={isOpen} className="flex w-full items-start gap-2 px-3.5 py-3 text-left">
              {isOpen ? <ChevronDown size={15} className="mt-0.5 shrink-0 text-faint" /> : <ChevronRight size={15} className="mt-0.5 shrink-0 text-faint" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><b className="truncate text-body">{r.title}</b>
                  <span className="chip shrink-0" style={{ background: r.how === '手動配信' ? 'var(--as)' : 'var(--tone-mute-bg)', color: r.how === '手動配信' ? 'var(--ad)' : 'var(--tone-mute-fg)' }}>{r.how}</span></div>
                <div className="mt-0.5 text-xs text-faint">{r.caseNo}・依頼 {r.requestedAt}{r.requester ? `（${r.requester}）` : ''}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
                  {r.targets.length ? <span className="text-muted">送った <b className="num text-ink">{r.targets.length}</b>人・{r.sentAt}</span> : <span className="text-muted">まだ送っていません</span>}
                  {r.ok > 0 && <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>OK {r.ok}</span>}
                  {r.ng > 0 && <span className="chip" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>NG {r.ng}</span>}
                  {r.other > 0 && <span className="chip" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }}>その他 {r.other}</span>}
                  {r.undecided > 0 && <span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>判断待ち {r.undecided}</span>}
                  {r.waiting.length > 0 && <span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>送信待ち {r.waiting.length}</span>}
                </div>
              </div>
            </button>
            {isOpen && (
              <div className="mo-fade-in border-t border-line-soft px-3.5 py-2.5">
                {r.targets.map((t) => (
                  <div key={t.name + t.at} className="flex items-center justify-between py-1 text-sm">
                    <span>{t.name}</span>
                    <span className="flex items-center gap-2"><span className="text-xs text-faint">{t.at}</span>
                      <span className="chip" style={{ background: `var(--tone-${TONE[t.decision]}-bg)`, color: `var(--tone-${TONE[t.decision]}-fg)` }}>{t.decision}</span></span>
                  </div>
                ))}
                {r.waiting.map((n) => <div key={n} className="flex items-center justify-between py-1 text-sm text-muted"><span>{n}</span><span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>送信待ち</span></div>)}
                <p className="mt-1.5 text-xs text-faint">OK/NG は案件進捗の 📮判断と同じです。判断は案件進捗の画面でします。</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
