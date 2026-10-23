import 'server-only';
import { cookies } from 'next/headers';

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
