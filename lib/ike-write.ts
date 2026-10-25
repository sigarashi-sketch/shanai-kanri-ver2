import 'server-only';
import { NextResponse } from 'next/server';
import { dropUserCache } from './cache';
import { ikeFetch, ikeToken } from './ike';

// ver2 から今の社内システムに「書く」ときの唯一の口（10-25 shoya「参画とか辞退ボタンとかもね」）。
//   ・呼ぶのは /api/live/** の POST ルートだけ。そのルートの中で「どの口の どの action を書くか」を決め打ちで渡す
//     （画面から行き先を指定させない＝何でも書ける口は作らない）
//   ・同じサイトからの POST だけ通す（Origin / Sec-Fetch-Site を見る）。別のサイトのリンクやフォームからは書かせない
//   ・権限の判定は今の社内システムがやる（ログインした人のトークンで呼ぶ）。403 ならその文をそのまま返す
//   ・書いたら、その人の読み取りの控え（lib/cache.ts）を捨てる＝次に開いた画面は新しい答え
//   ・ログに個人の情報を出さない

export function sameSite(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return false;
  const origin = req.headers.get('origin');
  if (!origin) return site === 'same-origin';
  try { return new URL(origin).host === new URL(req.url).host; } catch { return false; }
}

/** 今の社内システムに書いて、その答えを画面にそのまま返す。target は決め打ちのパス（例 '/api/roster?action=saveEngineerRow'） */
export async function ikeWrite(req: Request, target: string, body: unknown, opts?: { method?: 'POST' | 'GET'; timeoutMs?: number }): Promise<NextResponse> {
  if (!sameSite(req)) return NextResponse.json({ error: 'この画面の外からは保存できません' }, { status: 403 });
  const t = await ikeToken();
  if (!t) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const method = opts?.method || 'POST';
  try {
    const r = await ikeFetch(target, method === 'POST' ? { method, body: JSON.stringify(body ?? {}) } : { method }, opts?.timeoutMs ?? 30000);
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.ok) dropUserCache(t);
    if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    if (!r.ok || j.ok === false || j.success === false) {
      const e = j.error as { message?: string } | string | undefined;
      return NextResponse.json({ ...j, error: (typeof e === 'string' ? e : e?.message) || `保存できませんでした（${r.status}）` }, { status: r.ok ? 502 : r.status });
    }
    return NextResponse.json({ ok: true, ...j });
  } catch (err) {
    return NextResponse.json({ error: `今の社内システムに保存できませんでした（${(err as Error).message}）` }, { status: 502 });
  }
}
