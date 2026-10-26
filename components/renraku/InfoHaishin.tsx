'use client';

import { useIke } from '../Live';
import { isoMdhm } from '@/lib/live/renraku';
import { Note } from './parts';

// 公式LINE「インフォメーション」（それゆけ未経験）の配信の履歴（10-26）。
//   ・本物：今の社内システムの GET /api/chat?action=infoBroadcasts（saiyou スキーマの配信の記録を読むだけ・宛先の一覧は返らない）
//   ・ここからは送らない。インフォメーションのチャネルの鍵は それゆけ未経験 にしか無いので、配信は それゆけ未経験 の「配信」画面から
//   ・手動配信・案内配信のタブで、インフォメーションのときに出す（あおいの送る画面は出さない）
type InfoBroadcast = { id: string; text: string; all: boolean; label: string; target: number | null; sent: number | null; failed: number; by: string; at: string | null; error: boolean };
type InfoBroadcastsRes = { broadcasts: InfoBroadcast[]; error?: string };

export function InfoHaishin({ live, what }: { live: boolean; what: '手動配信' | '案内配信' }) {
  const r = useIke<InfoBroadcastsRes>(live ? 'chat?action=infoBroadcasts' : null);
  const rows = live ? r.data?.broadcasts ?? [] : [];
  const err = live ? r.data?.error || r.error : '';
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3">
      <Note tone="info">インフォメーションからの{what}は それゆけ未経験 の「配信」画面から送ります（このアカウントの送る鍵は それゆけ未経験 にしか無く、ここからは送れません）。下は送った履歴です。</Note>
      {(!live || r.state === 'loading') && <p className="text-body text-muted">読み込み中…</p>}
      {err && <Note tone="bad">{err}</Note>}
      {!err && live && r.state !== 'loading' && !rows.length && <p className="py-6 text-center text-sm text-muted">インフォメーションから送った配信はまだありません</p>}
      {rows.map((b, i) => (
        <div key={b.id} className="mo-fade-up rounded-xl border border-line px-3.5 py-3" style={{ ['--i' as string]: Math.min(i, 10) }}>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="chip" style={{ background: 'var(--as)', color: 'var(--ad)' }}>{b.label || '絞り込み'}</span>
            {b.all ? <span className="text-muted">友だち全員</span> : <span className="text-muted">送った <b className="num text-ink">{b.sent ?? 0}</b>/{b.target ?? 0}人</span>}
            {b.failed > 0 && <span className="chip" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>届かなかった {b.failed}</span>}
            {b.error && <span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>エラーあり</span>}
            <span className="ml-auto text-xs text-faint">{b.at ? isoMdhm(b.at) : ''}{b.by ? `・${b.by}` : ''}</span>
          </div>
          <div className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-body">{b.text}</div>
        </div>
      ))}
    </div>
  );
}
