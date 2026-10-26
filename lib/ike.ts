import 'server-only';
import { cookies } from 'next/headers';
import { cached, userKey } from './cache';
import { isInnaiEmail, tokenEmail } from './innai';
import { IKE_TOKEN_COOKIE } from './ike-session';

// 今の社内システム（IKEIKE_ORIGIN）を、ログインした人のトークンで呼ぶ（本物のデータの出どころはここだけ）。
//   ・DB の鍵は ver2 に置かない。見られる範囲・権限の判定は全部今の社内システムがやる
//   ・トークンが無い（ログインしていない）ときは呼ばない＝画面は出さず「ログインしてください」（app/(app)/layout.tsx）
export { IKE_TOKEN_COOKIE };
export const IKE_ORIGIN = process.env.IKEIKE_ORIGIN || 'https://ikeike-app.vercel.app';

// 要員（会社のメールでない人）のトークンは持っていても使わない＝ログインしていない扱い（lib/innai.ts）
export async function ikeToken(): Promise<string> {
  const t = (await cookies()).get(IKE_TOKEN_COOKIE)?.value || '';
  return t && isInnaiEmail(tokenEmail(t)) ? t : '';
}

function rawFetch(t: string, path: string, init?: RequestInit, timeoutMs = 25000): Promise<Response> {
  return fetch(IKE_ORIGIN + path, {
    ...init, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${t}`, Cookie: `sb_access=${t}`, 'Content-Type': 'application/json' },
  });
}

/** いまの人の区分の段階（かな西エリアで絞るか決めるため）。名簿・設定は raw で読む＝ここでは絞らない */
async function loadKPerms() {
  const [{ loadMe }, { effectivePerms }] = await Promise.all([import('./members-store'), import('./access')]);
  const m = await loadMe();
  return m.ok ? effectivePerms(m.me) : null;
}
/** この呼び出しが神奈川要員だけに絞られるか（lib/kanawest-scope.ts） */
async function scopeNow(t: string) {
  if (!t) return 'all' as const;
  const { scopeOf } = await import('./kanawest-scope');
  return scopeOf(t, loadKPerms);
}

/**
 * 今のシステムを呼ぶ口。★かな西エリア（神奈川要員だけ）の人は lib/kanawest-scope.ts の決まった読み口だけ・中身を絞って返す（10-26）
 *   raw＝絞らない（いまの人・共有の設定を読むときだけ。members-store が使う）
 */
export async function ikeFetch(path: string, init?: RequestInit, timeoutMs = 25000, raw = false): Promise<Response> {
  const t = await ikeToken();
  if (!raw && (await scopeNow(t)) === 'kanagawa') {
    const { kanawestRead } = await import('./kanawest-scope');
    const r = await kanawestRead(path, String(init?.method || 'GET').toUpperCase(), t, async (p) => {
      const x = await rawFetch(t, p, undefined, timeoutMs);
      return { ok: x.ok, status: x.status, data: await x.json().catch(() => null) };
    });
    return new Response(JSON.stringify(r.data), { status: r.status, headers: { 'content-type': 'application/json' } });
  }
  return rawFetch(t, path, init, timeoutMs);
}

/** かな西エリアだけの人か（今のシステムを ikeFetch を通さずに呼ぶ口＝請求の写し・PDF 読み取りなどはこの人には開けない） */
export async function ikeKanawestNow(): Promise<boolean> {
  return (await scopeNow(await ikeToken())) === 'kanagawa';
}

export type IkeCached<T> = { ok: boolean; status: number; data: T; hit: boolean };

/**
 * 読むだけの GET を、その人だけの控え（lib/cache.ts）から返す（10-25）。JSON の口だけ。
 *   ・キー＝その人のトークンのハッシュ＋パス（パスに月などが入っていれば月ごとに別の控え）。別の人の控えは返さない
 *   ・控えるのは 200 で ok:false でない答えだけ。keep で「読みかけ（pending）は控えない」などを足せる
 *   ・refresh=true で控えを使わず読み直す（読み直した答えで控えも入れ替える）
 *   ・かな西エリアで絞った答えは別の控え（キーに絞り方を入れる）。raw は絞らない
 */
export async function ikeFetchCached<T = unknown>(path: string, ttlMs: number, opts?: { refresh?: boolean; timeoutMs?: number; keep?: (data: T) => boolean; raw?: boolean }): Promise<IkeCached<T>> {
  const t = await ikeToken();
  const scope = opts?.raw ? 'raw' : await scopeNow(t);
  const { v, hit } = await cached<Omit<IkeCached<T>, 'hit'>>(`${userKey(t)}|ike|${scope}|${path}`, ttlMs, async () => {
    const r = await ikeFetch(path, undefined, opts?.timeoutMs, !!opts?.raw);
    const data = (await r.json().catch(() => ({}))) as T;
    return { ok: r.ok, status: r.status, data };
  }, {
    refresh: opts?.refresh,
    keep: (x) => x.ok && (x.data as { ok?: unknown } | null)?.ok !== false && (!opts?.keep || opts.keep(x.data)),
  });
  return { ...v, hit };
}
