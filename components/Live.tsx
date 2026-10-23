'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';

// 本物のデータ（今の社内システムの API）を画面で読むための道具。
//   ・useIke(path) は /api/ike/<path> を読む（GET だけ）。ログインしていなければ state='sample'＝画面は見本データのまま
//   ・本物のときは書き込みを止める（ボタンは押せない・title に LIVE_WRITE_BLOCKED）。本物の操作は今の社内システムの画面から
//   ・<LiveBanner> は画面の上に「見本／本物」を出す。見本のときはログインのボタン
export type LiveState = 'loading' | 'live' | 'sample' | 'error';
export const LIVE_WRITE_BLOCKED = '本物のデータでは、ここからは変えられません（今の社内システムの画面で操作してください）';

export function useIke<T>(path: string | null, opts?: { pollMs?: number }) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<LiveState>('loading');
  const [error, setError] = useState('');
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const my = ++seq.current;
    try {
      const r = await fetch(`/api/ike/${path}`, { cache: 'no-store' });
      const j = (await r.json().catch(() => ({}))) as T & { error?: string };
      if (my !== seq.current) return;
      if (r.status === 401 && j.error === 'not_logged_in') { setState('sample'); return; }
      if (!r.ok) { setError(j.error || `読めませんでした（${r.status}）`); setState('error'); return; }
      setData(j); setError(''); setState('live');
    } catch (e) { if (my === seq.current) { setError((e as Error).message); setState('error'); } }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!opts?.pollMs) return;
    const t = setInterval(load, opts.pollMs);
    return () => clearInterval(t);
  }, [load, opts?.pollMs]);
  return { data, state, error, reload: load, live: state === 'live' };
}

/** 画面の上に出す「見本／本物」。note はその画面で本物に無いもの・違うところの一言。 */
export function LiveBanner({ state, error, note, onReload }: { state: LiveState; error?: string; note?: string; onReload?: () => void }) {
  if (state === 'loading') return null;
  if (state === 'sample') return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-soft px-4 py-2.5 text-[12.5px] text-muted">
      いまは見本データです（本物の名前ではありません）。
      <a href="/api/ike-auth/start" className="btn-primary ml-auto inline-flex min-h-8 items-center px-3 text-[12px]">会社のアカウントでログインして本物を見る</a>
    </div>
  );
  if (state === 'error') return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-[12.5px]" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)', borderColor: 'var(--tone-bad-bar)' }}>
      <TriangleAlert size={14} />{error || '読めませんでした'}
      {error?.includes('ログイン') ? <a href="/api/ike-auth/start" className="ml-auto font-semibold underline">もう一度ログインする</a> : onReload && <button onClick={onReload} className="ml-auto font-semibold underline">もう一度</button>}
    </div>
  );
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] text-faint">
      <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}><Check size={11} />本物のデータ</span>
      {note ?? 'ここからは変えられません（見るだけ）。操作は今の社内システムの画面から'}
    </div>
  );
}

/** 今の社内システムにまだ無い画面（または一部）。本物につなぐ先が無いので見本のまま、と出す。 */
export function NotInLegacy({ what = 'この画面' }: { what?: string }) {
  return <div className="rounded-xl border border-line bg-soft px-4 py-2.5 text-[12.5px] text-muted">{what}は今の社内システムにまだ無いので、見本データのままです。</div>;
}
