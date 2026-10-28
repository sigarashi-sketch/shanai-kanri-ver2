import 'server-only';
import { createSign } from 'node:crypto';

// Google API（Drive / Sheets）をサーバから直接叩く。いけどん api/_google.ts と同じ方式・同じサービスアカウント（2026-10-02 shoya 了承）。
//   ・サービスアカウントは Drive の容量を持たないので、新しいファイルは **共有ドライブ**（GOOGLE_DRIVE_ID）の中にだけ作れる
//   ・env: GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY（PEM。改行は実改行でも \n でも可）/ GOOGLE_DRIVE_ID（共有ドライブ or その中のフォルダ。URLごとでも可）
//   ★秘密鍵はログにもエラー文にも出さない
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets';

function privateKey() {
  let k = String(process.env.GOOGLE_SA_PRIVATE_KEY || '').trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) k = k.slice(1, -1);
  return k.replace(/\\r/g, '').replace(/\\n/g, '\n').trim() + '\n';
}
export function driveId() {
  const s = String(process.env.GOOGLE_DRIVE_ID || '').trim();
  const m = s.match(/\/(?:folders|d|drive\/folders)\/([a-zA-Z0-9_-]{10,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : s;
}
export const googleReady = () => !!String(process.env.GOOGLE_SA_EMAIL || '').trim() && privateKey().includes('BEGIN') && !!driveId();

const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url');
let cached: { token: string; exp: number } | null = null;

export async function token(): Promise<string> {
  if (!googleReady()) throw new Error('Google の鍵（GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY / GOOGLE_DRIVE_ID）が未設定です');
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ iss: String(process.env.GOOGLE_SA_EMAIL).trim(), scope: SCOPES, aud: TOKEN_URI, exp: now + 3600, iat: now }));
  let sig: string;
  try { sig = b64(createSign('RSA-SHA256').update(head + '.' + body).sign(privateKey())); }
  catch { throw new Error('GOOGLE_SA_PRIVATE_KEY の署名に失敗しました（PEM の改行が壊れている可能性）'); }
  const r = await fetch(TOKEN_URI, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }) });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error('Google トークンの取得に失敗 HTTP ' + r.status + ': ' + String(j.error || ''));
  cached = { token: j.access_token, exp: now + Number(j.expires_in || 3600) };
  return cached.token;
}

// JSON を返す Google API を叩く。失敗は Error（Google のエラー文つき）
export async function google<T = unknown>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(url, {
    method: init.method || (init.body ? 'POST' : 'GET'),
    headers: { Authorization: 'Bearer ' + (await token()), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await r.text();
  let j: { error?: { message?: string } } = {};
  try { j = text ? JSON.parse(text) : {}; } catch { /* 非JSON */ }
  if (!r.ok) throw new Error(`Google API ${r.status}: ${j.error?.message || text.slice(0, 200)}`);
  return j as T;
}
