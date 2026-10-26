// ログインの続け方（10-26 shoya「いちいちログアウトされる」）。
//   ・v2_ike_token＝ログインのしるし（Supabase のアクセストークン・1時間で切れる）
//   ・v2_ike_refresh＝それを延ばす「更新の鍵」（14日）。どちらも httpOnly＝画面の JS からは読めない
//   ・しるしが切れそうなら proxy.ts が更新の鍵で延ばす。延ばす処理は今の社内システムの /api/auth?action=me に任せる
//     （今のいけどんが sb_refresh で自分を延ばすのと同じ道＝退社・会社アカウントの判定も同じ。公開キーを ver2 に置かない）
//   ★要員・組織表の判定はここではしない＝延ばしたあと画面ごとに app/(app)/layout.tsx（loadMe）が今までどおり確かめる
import { isInnaiEmail, tokenEmail } from './innai';

export const IKE_TOKEN_COOKIE = 'v2_ike_token';
export const IKE_REFRESH_COOKIE = 'v2_ike_refresh';
const ORIGIN = process.env.IKEIKE_ORIGIN || 'https://ikeike-app.vercel.app';
const BASE = { path: '/', httpOnly: true, secure: true, sameSite: 'lax' as const };

export const tokenCookie = (t: string, expiresIn: number) => ({ ...BASE, name: IKE_TOKEN_COOKIE, value: t, maxAge: Math.max(60, Math.min(3600, Number(expiresIn) || 3600) - 60) });
export const refreshCookie = (r: string) => ({ ...BASE, name: IKE_REFRESH_COOKIE, value: r, maxAge: 60 * 60 * 24 * 14 });

/** しるしの残り秒数（読めなければ 0＝切れている扱い） */
export function tokenLeftSec(t: string): number {
  try {
    const json = Buffer.from((t.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return Number((JSON.parse(json) as { exp?: number }).exp || 0) - Math.floor(Date.now() / 1000);
  } catch { return 0; }
}

function cookieFrom(setCookies: string[], name: string): { value: string; maxAge: number } | null {
  for (const c of setCookies) {
    if (!c.startsWith(name + '=')) continue;
    const value = decodeURIComponent(c.slice(name.length + 1).split(';')[0] || '');
    const m = /Max-Age=(\d+)/i.exec(c);
    return value ? { value, maxAge: m ? Number(m[1]) : 3600 } : null;
  }
  return null;
}

/** 更新の鍵で新しいしるしをもらう。会社アカウントでない・退社・鍵が無効なら null（＝ログインし直し） */
export async function refreshIkeSession(refresh: string): Promise<{ access: string; refresh: string; expiresIn: number } | null> {
  if (!refresh) return null;
  try {
    const r = await fetch(`${ORIGIN}/api/auth?action=me`, { headers: { Cookie: `sb_refresh=${encodeURIComponent(refresh)}` }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const me = (await r.json().catch(() => ({}))) as { authenticated?: boolean; allowed?: boolean; email?: string };
    if (!r.ok || !me.authenticated || me.allowed === false || !isInnaiEmail(me.email)) return null;
    const sc = r.headers.getSetCookie();
    const a = cookieFrom(sc, 'sb_access');
    if (!a || !isInnaiEmail(tokenEmail(a.value))) return null;
    return { access: a.value, refresh: cookieFrom(sc, 'sb_refresh')?.value || refresh, expiresIn: a.maxAge };
  } catch { return null; }
}
