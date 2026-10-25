import 'server-only';
import { ikeFetch, ikeToken } from '../ike';
import type { EngineerRows } from './eigyo-common';
import { MIKEIKEN_PATH, mikeikenSetOf, onlyMikeiken, type MikeikenSet } from './mikeiken';

// サーバ側（app/api/**）で「未経験の人だけ」に絞るときの道具。lib/live/mikeiken.ts のサーバ版。
//   ・ログインした人のトークンで今のプロパーリスト（全エリア）を読む。同じトークンなら 60 秒は控えを使う（1画面で何度も読まない）
//   ・読めなかったら Error を投げる（絞れないまま人の行を返さない）
const TTL = 60_000;
const cache = new Map<string, { at: number; p: Promise<Set<string>> }>();

export async function loadMikeikenSet(): Promise<MikeikenSet> {
  const t = await ikeToken();
  if (!t) throw new Error('not_logged_in');
  const now = Date.now();
  for (const [k, v] of cache) if (now - v.at > TTL) cache.delete(k);
  const hit = cache.get(t);
  if (hit) return hit.p;
  const p = (async () => {
    const r = await ikeFetch(MIKEIKEN_PATH);
    if (r.status === 401) throw new Error('ログインが切れました。もう一度ログインしてください');
    if (!r.ok) throw new Error(`プロパーリストが読めないので、未経験の人に絞れませんでした（${r.status}）`);
    return mikeikenSetOf((await r.json()) as EngineerRows);
  })();
  cache.set(t, { at: now, p });
  p.catch(() => cache.delete(t));
  return p;
}

export async function filterMikeiken<T>(rows: readonly T[], name: ((r: T) => unknown) | keyof T): Promise<T[]> {
  return onlyMikeiken(await loadMikeikenSet(), rows, name);
}
