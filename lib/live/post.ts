// 画面から ver2 の書く口（/api/live/** の POST）を呼ぶ道具（10-25 労務・経理の移し替え）。
//   ・行き先（今の社内システムのどの口か）はサーバのルートが決め打ち。ここは ver2 のルートの URL と中身を渡すだけ
//   ・ok でない答えは Error にして投げる（画面は確認の窓にその文を出す）
export async function postLive<T = Record<string, unknown>>(url: string, body: unknown): Promise<T & { ok: true }> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}), cache: 'no-store' });
  const j = (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: unknown; hint?: string };
  if (!r.ok || j.ok === false) {
    const e = j.error as { message?: string } | string | undefined;
    throw new Error((typeof e === 'string' ? e : e?.message) || j.hint || `うまくいきませんでした（${r.status}）`);
  }
  return j as T & { ok: true };
}
