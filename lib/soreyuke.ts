import 'server-only';

// それゆけ未経験（採用版・別アプリ）の API を、ログインした人のトークンで呼ぶ（10-27 shoya「それゆけ未経験も移管・人財管理ってメニューで」）。
//   ・それゆけのログインは今の社内システムと同じ Supabase（同じトークン）。それゆけの Cookie（sa_access）にそのトークンを入れて呼ぶ
//   ・見られる範囲・権限・保存の決まりは全部それゆけ側（lib/api.ts apiUser・内勤一般は見るだけ）。ver2 は写しを持たない
//   ・それゆけはロールを署名した Cookie（sa_role）を返す。同じ人の分は 11時間だけ手元に持つ（毎回いけどんにロールを聞かせない）
export const SY_ORIGIN = process.env.SOREYUKE_ORIGIN || 'https://soreyuke.vercel.app';

const roles = new Map<string, { v: string; until: number }>();
const keyOf = (t: string) => t.slice(-32);

export async function syFetch(token: string, path: string, init?: { method?: string; body?: BodyInit | null; contentType?: string | null; timeoutMs?: number }): Promise<Response> {
  const k = keyOf(token);
  const role = roles.get(k);
  const cookie = [`sa_access=${token}`, role && role.until > Date.now() ? `sa_role=${role.v}` : ''].filter(Boolean).join('; ');
  const r = await fetch(SY_ORIGIN + path, {
    method: init?.method || 'GET', body: init?.body, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(init?.timeoutMs ?? 60000),
    headers: { Cookie: cookie, Accept: 'application/json', ...(init?.contentType ? { 'Content-Type': init.contentType } : {}) },
  });
  for (const c of r.headers.getSetCookie?.() || []) {
    const m = /^sa_role=([^;]+)/.exec(c);
    if (m) roles.set(k, { v: m[1], until: Date.now() + 11 * 3600_000 });
  }
  if (r.status === 401) roles.delete(k);
  return r;
}
