// 保留（/horyu）の画面から自分のサーバーの /api/live/horyu/** を呼ぶ（画面側）。書き込みの行き先はサーバーのルートが決め打ちで持つ
export type PostRes<T> = { ok: boolean; status: number; data: T & { error?: string } };
export async function horyuPost<T = Record<string, unknown>>(route: string, body: unknown): Promise<PostRes<T>> {
  try {
    const r = await fetch(`/api/live/horyu/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    const data = (await r.json().catch(() => ({}))) as T & { error?: string };
    return { ok: r.ok && !data.error, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: (e as Error).message } as T & { error?: string } };
  }
}
export const errText = (r: PostRes<unknown>) => (r.status === 401 ? 'ログインが切れました。もう一度ログインしてください' : r.data.error || `できませんでした（${r.status}）`);
