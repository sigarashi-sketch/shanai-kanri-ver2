// ログイン（いけいけどんどんと同じアカウント）。
//   ・認証そのものは いけどんの Supabase Auth（Google SSO）に任せる。
//   ・このアプリは受け取ったトークンを HttpOnly Cookie に入れるだけ。
//   ・ロールは いけどん本体の /api/auth?action=me に聞き、署名付きCookie(sa_role)に12時間控える。
//   ★proxy.ts（Edge/Node両方）からも使うので Web Crypto と fetch だけで書く。

export const C_ACCESS = 'sa_access';
export const C_REFRESH = 'sa_refresh';
export const C_ROLE = 'sa_role';
export const ALLOWED_DOMAIN = '@engineer-mikata.com';
const ROLE_TTL_SEC = 12 * 3600;

// ver2（10-27）：URL と anon（公開してよい鍵）は今の社内システムと同じものを既定にする＝ver2 の Vercel に足す鍵を減らす
export const IKE_SUPABASE_URL = () => String(process.env.IKEIKE_SUPABASE_URL || 'https://pdoppvhuimcinyamtuvm.supabase.co').replace(/\/$/, '');
function authBase() { return IKE_SUPABASE_URL() + '/auth/v1'; }
function anon() { return String(process.env.IKEIKE_SUPABASE_ANON_KEY || 'sb_publishable_dXRc2TPTm9-dQITFFEdzGQ_mKMENMbS'); }
export function allowedRoles(): string[] {
  return String(process.env.ALLOWED_ROLES || 'super_admin,admin,sales_admin,applicant_support,staff_recruit')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

export interface SessionUser { id: string; email: string; name: string }

export async function verifyAccess(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const r = await fetch(`${authBase()}/user`, { headers: { apikey: anon(), Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!r.ok) return null;
    const u = (await r.json()) as { id?: string; email?: string; user_metadata?: { full_name?: string; name?: string } };
    if (!u.id || !u.email) return null;
    // ★会社アカウントだけ（2026-10-09 shoya「社内には絶対個人アドレスはアクセスさせない」）。
    //   入社ポータル（いけどん api/portal.ts）は個人の Gmail でも Google ログインできるので、同じ Supabase に会社外の利用者ができる。
    //   その人のトークンは ここで「ログインしていない」扱いにする＝ログイン（session）・関所（proxy）・本検証（currentUser）のどれも通らない。
    if (!u.email.toLowerCase().endsWith(ALLOWED_DOMAIN)) return null;
    return { id: u.id, email: u.email, name: u.user_metadata?.full_name || u.user_metadata?.name || '' };
  } catch { return null; }
}

export async function refreshTokens(refresh: string): Promise<{ access: string; refresh: string; expiresIn: number } | null> {
  try {
    const r = await fetch(`${authBase()}/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: anon(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }), cache: 'no-store',
    });
    if (!r.ok) return null;
    const t = (await r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!t.access_token) return null;
    return { access: t.access_token, refresh: t.refresh_token || refresh, expiresIn: t.expires_in || 3600 };
  } catch { return null; }
}

// いけどん本体にロールを聞く。取れなければ null（＝入れない）。
export async function fetchIkeikeRole(access: string): Promise<string | null> {
  const base = String(process.env.IKEIKE_APP_URL || process.env.IKEIKE_ORIGIN || 'https://ikeike-app.vercel.app').replace(/\/$/, '');
  try {
    const r = await fetch(`${base}/api/auth?action=me`, { headers: { Cookie: `sb_access=${access}` }, cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { authenticated?: boolean; role?: string };
    return j.authenticated && j.role ? j.role : null;
  } catch { return null; }
}

// JWT の exp だけ読む（署名検証はしない＝期限切れの目安にだけ使う）。
export function jwtExp(token: string | undefined): number {
  if (!token) return 0;
  try {
    const p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return Number(JSON.parse(atob(p)).exp || 0);
  } catch { return 0; }
}

// ---- sa_role（email|role|exp の HMAC 署名付き） -----------------------------
async function hmac(data: string): Promise<string> {
  const secret = String(process.env.SESSION_SECRET || '');
  if (!secret) throw new Error('SESSION_SECRET 未設定');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
export async function signRole(email: string, role: string): Promise<string> {
  const payload = `${email}|${role}|${Math.floor(Date.now() / 1000) + ROLE_TTL_SEC}`;
  return `${btoa(unescape(encodeURIComponent(payload)))}.${await hmac(payload)}`;
}
export async function readRole(cookie: string | undefined): Promise<{ email: string; role: string } | null> {
  if (!cookie) return null;
  const [b, sig] = cookie.split('.');
  try {
    const payload = decodeURIComponent(escape(atob(b)));
    if ((await hmac(payload)) !== sig) return null;
    const [email, role, exp] = payload.split('|');
    if (Number(exp) < Date.now() / 1000) return null;
    return { email, role };
  } catch { return null; }
}

export const cookieOpts = (maxAge: number) => ({
  httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge,
});
