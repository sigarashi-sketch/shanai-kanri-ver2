// チャットの要約（10-25 shoya「使い回しありで自分で押す・ソネット」「7日分も任意で」「ポップで表示」）。
//   POST { kind: 'user' | 'group', id, days: 3 | 7 } → { ok, text, data, count, cached }
//   ・会話を読む・自社の書き込みの見分け（direction だけで決める）・使い回しは、全部今の社内システム側
//     （POST /api/assistant?action=chat-summary に { kind, id, days } だけ渡す・10-25）。ver2 は会話を読まない
//   ・鍵は今の ANTHROPIC_API_KEY のまま（10-25 shoya「既存のいけどんのキーじゃだめなん」）。指示文とモデルは向こうの api/_chat_summary.ts
//   ・人事の情報なので、管理者と採用の担当だけ（lib/live/role.ts）。ほかのロールは 403
import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { HR_FORBIDDEN, canSeeHr, ikeRole } from '@/lib/live/role';

export const maxDuration = 60;

type Data = { headline: string; events: { date: string; actor: 'self' | 'them' | 'member'; who: string; text: string }[]; waiting: string[]; cautions: string[] };

export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { kind?: string; id?: string; days?: number };
  const kind = b.kind === 'group' ? 'group' : 'user';
  const id = String(b.id || '');
  const days = b.days === 7 ? 7 : 3;
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(id)) return NextResponse.json({ error: '相手が分かりません' }, { status: 400 });
  if (!canSeeHr(await ikeRole())) return NextResponse.json({ error: HR_FORBIDDEN }, { status: 403 });

  let r: Response;
  try {
    r = await ikeFetch('/api/assistant?action=chat-summary', { method: 'POST', body: JSON.stringify({ kind, id, days }) }, 55000);
  } catch (e) {
    return NextResponse.json({ error: `要約に時間がかかりすぎました（${(e as Error).message}）` }, { status: 504 });
  }
  if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; text?: string; data?: Data | null; count?: number; cached?: boolean; error?: string };
  if (!r.ok || !j.ok) return NextResponse.json({ error: j.error && j.error !== 'empty' ? j.error : `要約に失敗しました（${r.status}）` }, { status: r.status >= 400 ? r.status : 502 });
  return NextResponse.json({ ok: true, text: j.text || '', data: j.data ?? null, count: j.count ?? 0, cached: !!j.cached });
}
