'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, PauseCircle, TriangleAlert } from 'lucide-react';
import { PageTitle } from '@/components/ui';

// 保留（あとで決める）の画面の共通の道具（10-25）。
//   ・useHoryu(name) は /api/live/horyu/<name> を読む。ログインしていなければ error（「ログインしてください」・見本は出さない 10-26）、
//     今のシステムが 403 なら forbidden（何も出さない）
//   ・horyuPost(name, body) は同じ口の POST（行き先はサーバーで決め打ち・lib/ike-write.ts）
export type HState = 'loading' | 'live' | 'sample' | 'forbidden' | 'error';

export function useHoryu<T>(name: string | null, params?: Record<string, string | number | undefined>) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<HState>('loading');
  const [error, setError] = useState('');
  const seq = useRef(0);
  const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
  const load = useCallback(async () => {
    if (!name) return;
    const my = ++seq.current;
    try {
      const r = await fetch(`/api/live/horyu/${name}${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
      const j = (await r.json().catch(() => ({}))) as T & { error?: string | { message?: string }; ok?: boolean };
      if (my !== seq.current) return;
      if (r.status === 401 && j.error === 'not_logged_in') { setError('ログインしてください'); setState('error'); return; }
      if (r.status === 403) { setState('forbidden'); return; }
      const msg = typeof j.error === 'string' ? j.error : j.error?.message;
      if (!r.ok || (j.ok === false && msg)) { setError(msg || `読めませんでした（${r.status}）`); setState('error'); return; }
      setData(j); setError(''); setState('live');
    } catch (e) { if (my === seq.current) { setError((e as Error).message); setState('error'); } }
  }, [name, qs]);
  useEffect(() => { void load(); }, [load]);
  return { data, state, error, reload: load, live: state === 'live' };
}

export async function horyuPost<T = Record<string, unknown>>(name: string, body: unknown): Promise<{ ok: boolean; data: T; error: string }> {
  try {
    const r = await fetch(`/api/live/horyu/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    const j = (await r.json().catch(() => ({}))) as T & { error?: string | { message?: string }; hint?: string };
    const msg = typeof j.error === 'string' ? j.error : j.error?.message;
    if (!r.ok || msg) return { ok: false, data: j, error: (r.status === 403 ? '今のシステムで権限がありません' : msg) || `保存できませんでした（${r.status}）` };
    return { ok: true, data: j, error: '' };
  } catch (e) { return { ok: false, data: {} as T, error: (e as Error).message }; }
}

/** 保留の画面の枠。本物／権限なし／読めない／読み込み中 を出し分ける。 */
export function HoryuFrame({ title, sub, state, error, onReload, actions, children }: {
  title: string; sub?: string; state: HState; error?: string; onReload?: () => void; actions?: React.ReactNode; children: React.ReactNode;
}) {
  if (state === 'forbidden') return (
    <main className="px-6 pb-12 pt-[22px]">
      <div className="mo-fade-up rounded-xl border border-line bg-surface px-8 py-14 text-center">
        <Lock className="mx-auto text-faint" size={28} />
        <h1 className="mt-3 text-xl font-bold">{title}は見られません</h1>
        <p className="mt-2 text-body text-muted">今の社内システムで、この画面の権限が付いていません。</p>
      </div>
    </main>
  );
  return (
    <main className="flex flex-col gap-3.5 px-4 pb-12 pt-[22px] sm:px-6">
      <PageTitle title={title} sub={sub}>{actions}</PageTitle>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-soft px-4 py-2 text-sm text-muted">
        <PauseCircle size={14} />保留中の画面です（あとで本採用か決めます）。
        {state === 'live' && <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>本物のデータ</span>}
      </div>
      {state === 'error' && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-sm" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)', borderColor: 'var(--tone-bad-bar)' }}>
          <TriangleAlert size={14} />{error || '読めませんでした'}
          {error === 'ログインしてください' ? <a href="/api/ike-auth/start" className="ml-auto font-semibold underline">ログインする</a> : onReload && <button onClick={onReload} className="ml-auto font-semibold underline">もう一度</button>}
        </div>
      )}
      {state === 'loading' ? <div className="py-10 text-center text-body text-muted">読んでいます…</div> : children}
    </main>
  );
}

export function Card({ title, note, children, right, i = 1 }: { title?: string; note?: string; children: React.ReactNode; right?: React.ReactNode; i?: number }) {
  return (
    <section className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: i }}>
      {(title || right) && <div className="flex flex-wrap items-center gap-2 px-4 py-3">{title && <h2 className="text-md font-bold">{title}</h2>}{note && <span className="text-sm text-muted">{note}</span>}<div className="ml-auto flex flex-wrap items-center gap-2">{right}</div></div>}
      {children}
    </section>
  );
}

export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: { key: K; label: string; badge?: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}
          className="tab">
          {t.label}{t.badge ? <span className="num ml-1.5 rounded-full bg-sunken px-1.5 text-xs">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export const yen = (n: unknown) => (n == null || n === '' || !Number.isFinite(Number(n)) ? '—' : `${Math.round(Number(n)).toLocaleString('ja-JP')}円`);
export const fmtAt = (iso: unknown) => {
  const d = new Date(String(iso || ''));
  return Number.isNaN(d.getTime()) ? String(iso || '—') : d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
export const inputCls = 'rounded-lg border border-field bg-surface px-2.5 py-1.5 text-body text-ink';
export const btnCls = 'btn-secondary';
export const thCls = 'px-3 py-2.5 text-left font-semibold';
export const tdCls = 'px-3 py-2.5';

export function Msg({ text, bad }: { text: string; bad?: boolean }) {
  if (!text) return null;
  return <div role="status" className="rounded-lg px-3 py-2 text-sm" style={{ background: bad ? 'var(--tone-bad-bg)' : 'var(--tone-ok-bg)', color: bad ? 'var(--tone-bad-fg)' : 'var(--tone-ok-fg)' }}>{text}</div>;
}
