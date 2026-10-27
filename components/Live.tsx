'use client';

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Check, TriangleAlert } from 'lucide-react';

// 本物のデータ（今の社内システムの API）を画面で読むための道具。
//   ・useIke(path) は /api/ike/<path> を読む（GET だけ）。ログインしていない・切れたら state='sample'（名前は昔のまま。中身は「ログインしてください」＝何も出さない）
//   ・本物のときは書き込みを止める（ボタンは押せない・title に LIVE_WRITE_BLOCKED）。本物の操作は今の社内システムの画面から
//   ・<LiveBanner> は読めなかったとき・ログインが切れたときに画面の中に出す（ログインのボタン）
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
  usePoll(path ? load : null, opts?.pollMs);
  return { data, state, error, reload: load, live: state === 'live' };
}

// ---- 読み直し（pollMs）の止め方（10-25・今の live.js と同じ考え方） ----
//   ・タブが見えていないあいだは読まない。見えたら1回だけすぐ読む
//   ・15分さわらなければ（マウス・キーボード）止める。さわったら1回すぐ読んで続ける
//   ＝開きっぱなしのタブが今の社内システム（Supabase）を叩き続けない
const IDLE_MS = 15 * 60_000;
let lastInput = Date.now();
const wakers = new Set<() => void>();
let watching = false;
function watchInput() {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  const on = () => {
    const slept = Date.now() - lastInput >= IDLE_MS;
    lastInput = Date.now();
    if (slept && !document.hidden) wakers.forEach((f) => f());
  };
  window.addEventListener('pointerdown', on, { passive: true, capture: true });
  window.addEventListener('keydown', on, { capture: true });
}
/** いま読み直してよいか（見えている・15分以内にさわった） */
export const pollAwake = () => typeof document !== 'undefined' && !document.hidden && Date.now() - lastInput < IDLE_MS;

/** fn を ms ごとに呼ぶ。ただし見えていない・15分さわっていないあいだは呼ばない（上の説明） */
export function usePoll(fn: (() => void) | null, ms: number | undefined) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; }, [fn]);
  const on = !!fn && !!ms;
  useEffect(() => {
    if (!on || !ms) return;
    watchInput();
    const run = () => ref.current?.();
    const t = setInterval(() => { if (pollAwake()) run(); }, ms);
    // タブに戻ってきた＝さわったのと同じ扱い（すぐ1回読んで、また続ける）
    const vis = () => { if (!document.hidden) { lastInput = Date.now(); run(); } };
    document.addEventListener('visibilitychange', vis);
    wakers.add(run);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); wakers.delete(run); };
  }, [on, ms]);
}

// ---- 「本物のデータ／ログインしてください」は上のバーに小さく出す（10-25 見た目の整理）。画面の中の帯はやめて、読めなかったときだけ画面の中に出す ----
//   各画面の <LiveBanner> が「いまの状態」をここに届け、上のバーの <LiveIndicator> が まとめて1つ出す。
//   上のバーが無いところ（Shell の外）では、いままでどおり画面の中に出す。
const liveStates = new Map<string, LiveState>();
const liveSubs = new Set<() => void>();
let liveSnap: 'live' | 'sample' | null = null;
let hostCount = 0;
const recompute = () => {
  const v = [...liveStates.values()];
  liveSnap = v.includes('live') ? 'live' : v.includes('sample') ? 'sample' : null;
  liveSubs.forEach((f) => f());
};
const subLive = (f: () => void) => { liveSubs.add(f); return () => { liveSubs.delete(f); }; };

/** 上のバーの「本物のデータ／ログインしてください」。Shell が置く */
export function LiveIndicator() {
  const v = useSyncExternalStore(subLive, () => liveSnap, () => null);
  useEffect(() => { hostCount++; recompute(); return () => { hostCount--; recompute(); }; }, []);
  if (v === 'live') return <span className="chip" title="今の社内システムのデータを読んでいます（ここからは変えられない画面もあります）" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}><Check size={11} />本物のデータ</span>;
  if (v === 'sample') return (
    <span className="inline-flex items-center gap-2 text-sm text-muted">
      <span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>ログインが切れました</span>
      <a href="/api/ike-auth/start" className="font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--ad)' }}>ログインしてください</a>
    </span>
  );
  return null;
}

/** 画面の状態。note はその画面で本物に無いもの・違うところの一言。本物かどうかは上のバーに出し、ここには一言と、読めなかった・ログインが切れたときだけ出す */
export function LiveBanner({ state, error, note, onReload }: { state: LiveState; error?: string; note?: string; onReload?: () => void }) {
  const id = useId();
  const hosted = useSyncExternalStore(subLive, () => hostCount > 0, () => false);
  useEffect(() => { liveStates.set(id, state); recompute(); }, [id, state]);
  useEffect(() => () => { liveStates.delete(id); recompute(); }, [id]);
  if (state === 'loading') return null;
  if (state === 'sample') return hosted ? null : (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
      ログインが切れました。
      <a href="/api/ike-auth/start" className="font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--ad)' }}>ログインしてください</a>
    </div>
  );
  if (state === 'error') return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)', borderColor: 'var(--color-bad-line)' }}>
      <TriangleAlert size={14} />{error || '読めませんでした'}
      {error?.includes('ログイン') ? <a href="/api/ike-auth/start" className="ml-auto font-semibold underline">もう一度ログインする</a> : onReload && <button onClick={onReload} className="ml-auto font-semibold underline">もう一度</button>}
    </div>
  );
  // 読めたときの説明（note）は出さない（10-27 shoya「こういう説明いらない 極力スッキリ」）。出すのは読めない・ログイン切れのときだけ
  void note;
  return hosted ? null : (
    <div className="flex items-center text-xs"><span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}><Check size={11} />本物のデータ</span></div>
  );
}

/** 今の社内システムにまだ無い画面（または一部）。つなぐ先が無いので何も出さない（架空のデータは出さない）、と出す。 */
export function NotInLegacy({ what = 'この画面' }: { what?: string }) {
  return <div className="text-sm text-muted">{what}はまだありません（今の社内システムにまだ無いため）。</div>;
}
