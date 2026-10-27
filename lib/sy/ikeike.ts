import 'server-only';
import { ikeToken } from '@/lib/ike';

// いけどん本体（ikeike-app）の API をログイン中の本人の権限で叩く。
//   トークンは同じ Supabase Auth のものなので、いけどん側の requireUser がそのまま通る（Bearer）。
//   /api/auth?action=me だけは Cookie を読むので sb_access も付ける。
export const IKEIKE_BASE = () => String(process.env.IKEIKE_APP_URL || process.env.IKEIKE_ORIGIN || 'https://ikeike-app.vercel.app').replace(/\/$/, '');

export async function ikeHeaders(): Promise<Record<string, string>> {
  const t = await ikeToken();   // ver2 のログイン（それゆけでは sa_access の Cookie）
  return { Authorization: `Bearer ${t}`, Cookie: `sb_access=${t}` };
}

export async function ikeJson<T = unknown>(path: string, init?: { method?: string; body?: unknown; timeoutMs?: number }): Promise<T> {
  const h = await ikeHeaders();
  const r = await fetch(IKEIKE_BASE() + path, {
    method: init?.method || 'GET',
    headers: { ...h, ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(init?.timeoutMs || 45000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`いけどん ${path.split('?')[0]} ${r.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}
