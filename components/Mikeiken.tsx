'use client';

import { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { isMikeiken, mikeikenSetOf, onlyMikeiken, type MikeikenSet } from '@/lib/live/mikeiken';
import type { EngineerRows } from '@/lib/live/eigyo-common';

// 画面で「未経験の人だけ」に絞る道具（正＝今のプロパーリストに入っている人・全エリア・lib/live/mikeiken.ts）。
//   ・プロパーリストは1回だけ読んで、ページをまたいで使い回す（モジュール内の控え・10分）
//   ・ログインしていない・切れたら state='none'。keep() は空＝人を出さない（10-26 見本をなくしたので、そのまま通す必要がない）
//   ・読み込み中・読めなかったときは keep() は空＝絞れないまま人を出さない
type MkState = 'loading' | 'ready' | 'none' | 'error';
type Loaded = { state: 'ready'; set: Set<string> } | { state: 'none' } | { state: 'error'; error: string };

const TTL = 10 * 60_000;
let memo: { at: number; p: Promise<Loaded> } | null = null;

function load(): Promise<Loaded> {
  if (memo && Date.now() - memo.at < TTL) return memo.p;
  const p = (async (): Promise<Loaded> => {
    try {
      const r = await fetch('/api/ike/roster?action=getEngineerRows', { cache: 'no-store' });
      const j = (await r.json().catch(() => ({}))) as EngineerRows & { error?: string };
      if (r.status === 401 && j.error === 'not_logged_in') return { state: 'none' };
      if (!r.ok) return { state: 'error', error: j.error || `プロパーリストが読めませんでした（${r.status}）` };
      return { state: 'ready', set: mikeikenSetOf(j) };
    } catch (e) { return { state: 'error', error: (e as Error).message }; }
  })();
  memo = { at: Date.now(), p };
  p.then((v) => { if (v.state !== 'ready' && memo?.p === p) memo = null; });
  return p;
}

export type Mikeiken = {
  state: MkState; error: string; set: MikeikenSet | null;
  /** この名前は未経験（プロパーリストにいる）か。ログインしていない・読めないときは false */
  has: (name: unknown) => boolean;
  /** 人の行を未経験の人だけに。ログインしていない・読み込み中・読めないときは空 */
  keep: <T>(rows: readonly T[], name: ((r: T) => unknown) | keyof T) => T[];
};

export function useMikeiken(): Mikeiken {
  const [v, setV] = useState<Loaded | null>(null);
  useEffect(() => { let on = true; load().then((x) => { if (on) setV(x); }); return () => { on = false; }; }, []);
  return useMemo(() => {
    const state: MkState = v ? v.state : 'loading';
    const set = v?.state === 'ready' ? v.set : null;
    return {
      state, error: v?.state === 'error' ? v.error : '', set,
      has: (name) => (set ? isMikeiken(set, name) : false),
      keep: (rows, name) => (set ? onlyMikeiken(set, rows, name) : []),
    };
  }, [v]);
}

/** 本物のときに画面の上に出す一言（LiveBanner の下）。ログインしていないときは出さない */
export function MikeikenNote({ mk, live }: { mk: Mikeiken; live: boolean }) {
  if (!live || mk.state === 'none' || mk.state === 'ready') return null;   // 絞れたときの説明は出さない（10-27 shoya「極力スッキリ」）
  const text = mk.state === 'loading' ? '未経験の人（今のプロパーリストに入っている人）を確かめています…'
      : `未経験の人に絞れないので、人の行は出していません（${mk.error}）`;
  return (
    <div className="flex items-center gap-1.5 text-xs text-faint" style={mk.state === 'error' ? { color: 'var(--tone-bad-fg)' } : undefined}>
      <Users size={12} />{text}
    </div>
  );
}
