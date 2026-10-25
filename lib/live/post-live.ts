// 画面から /api/live/** の保存の口へ POST する小さな道具（行き先のパスは呼ぶ画面で決め打ち）。
export type PostRes<T = Record<string, unknown>> = { ok: true; j: T } | { ok: false; error: string; status: number };

export async function postLive<T = Record<string, unknown>>(url: string, body: unknown): Promise<PostRes<T>> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as T & { error?: string; hint?: string };
    if (!r.ok) return { ok: false, status: r.status, error: (j.hint as string) || j.error || `保存できませんでした（${r.status}）` };
    return { ok: true, j };
  } catch (e) {
    return { ok: false, status: 0, error: `通信できませんでした（${(e as Error).message}）` };
  }
}
