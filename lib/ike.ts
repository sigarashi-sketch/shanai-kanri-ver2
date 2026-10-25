import 'server-only';
import { cookies } from 'next/headers';
import { cached, userKey } from './cache';

// 今の社内システム（IKEIKE_ORIGIN）を、ログインした人のトークンで呼ぶ（本物のデータの出どころはここだけ）。
//   ・DB の鍵は ver2 に置かない。見られる範囲・権限の判定は全部今の社内システムがやる
//   ・トークンが無い（ログインしていない）ときは呼ばない＝画面は見本データ
export const IKE_TOKEN_COOKIE = 'v2_ike_token';
export const IKE_ORIGIN = process.env.IKEIKE_ORIGIN || 'https://ikeike-app.vercel.app';

export async function ikeToken(): Promise<string> {
  return (await cookies()).get(IKE_TOKEN_COOKIE)?.value || '';
}

export async function ikeFetch(path: string, init?: RequestInit, timeoutMs = 25000): Promise<Response> {
  const t = await ikeToken();
  return fetch(IKE_ORIGIN + path, {
    ...init, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${t}`, Cookie: `sb_access=${t}`, 'Content-Type': 'application/json' },
  });
}

export type IkeCached<T> = { ok: boolean; status: number; data: T; hit: boolean };

/**
 * 読むだけの GET を、その人だけの控え（lib/cache.ts）から返す（10-25）。JSON の口だけ。
 *   ・キー＝その人のトークンのハッシュ＋パス（パスに月などが入っていれば月ごとに別の控え）。別の人の控えは返さない
 *   ・控えるのは 200 で ok:false でない答えだけ。keep で「読みかけ（pending）は控えない」などを足せる
 *   ・refresh=true で控えを使わず読み直す（読み直した答えで控えも入れ替える）
 */
export async function ikeFetchCached<T = unknown>(path: string, ttlMs: number, opts?: { refresh?: boolean; timeoutMs?: number; keep?: (data: T) => boolean }): Promise<IkeCached<T>> {
  const t = await ikeToken();
  const { v, hit } = await cached<Omit<IkeCached<T>, 'hit'>>(`${userKey(t)}|ike|${path}`, ttlMs, async () => {
    const r = await ikeFetch(path, undefined, opts?.timeoutMs);
    const data = (await r.json().catch(() => ({}))) as T;
    return { ok: r.ok, status: r.status, data };
  }, {
    refresh: opts?.refresh,
    keep: (x) => x.ok && (x.data as { ok?: unknown } | null)?.ok !== false && (!opts?.keep || opts.keep(x.data)),
  });
  return { ...v, hit };
}
