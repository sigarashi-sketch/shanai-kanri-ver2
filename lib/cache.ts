import 'server-only';
import { createHash } from 'node:crypto';

// サーバー側の短い控え（10-25）。今の社内システム（Supabase）を同じ読み口で何度も叩かないため（過去に 504・egress 超過・CPU 枯渇）。
//   ・置き場はこのインスタンスのメモリだけ（Map）。@vercel/functions が入っていないので Vercel の Runtime Cache は使わない
//     → インスタンスが変われば控えは無い＝そのときは今のシステムを読むだけ（数字が古くなることはあっても混ざることはない）
//   ・キーには必ず「ログインした人のトークンのハッシュ」を入れる（userKey）。★別の人の控えは絶対に返さない（見られる範囲が人ごとに違う）
//   ・同じキーを同時に読みに行ったら1本にまとめる（画面を開いた直後に何本も同じ GET が飛ぶのを防ぐ）
//   ・控えるのは keep が true の答えだけ（エラー・読みかけ（pending）は控えない）
type Ent = { exp: number; v: unknown };
const store = new Map<string, Ent>();
const inflight = new Map<string, Promise<unknown>>();
const MAX = 400;

/** トークン → 人ごとの控えのキー（トークンそのものはキーに置かない） */
export const userKey = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 32);

function sweep(now: number) {
  if (store.size <= MAX) return;
  for (const [k, e] of store) if (e.exp <= now) store.delete(k);
  // まだ多ければ古く入れた順に捨てる（Map は入れた順）
  for (const k of store.keys()) { if (store.size <= MAX) break; store.delete(k); }
}

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>, opts?: { refresh?: boolean; keep?: (v: T) => boolean }): Promise<{ v: T; hit: boolean }> {
  const now = Date.now();
  if (!opts?.refresh) {
    const e = store.get(key);
    if (e && e.exp > now) return { v: e.v as T, hit: true };
    const p = inflight.get(key);
    if (p) return { v: (await p) as T, hit: true };
  }
  const p = (async () => {
    const v = await fn();
    if (ttlMs > 0 && (opts?.keep ? opts.keep(v) : true)) { store.set(key, { exp: Date.now() + ttlMs, v }); sweep(Date.now()); }
    return v;
  })();
  inflight.set(key, p);
  try { return { v: await p, hit: false }; } finally { if (inflight.get(key) === p) inflight.delete(key); }
}


/** その人の控えを全部捨てる（書き込んだあと、次に読む画面が古い答えを出さないように・10-25） */
export function dropUserCache(token: string) {
  const k = userKey(token);
  for (const key of store.keys()) if (key.startsWith(k)) store.delete(key);
}
