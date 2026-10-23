import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';

// 要員ページの「チャット」から LINE を送る口（2026-10-23 shoya「送信もできるように」）。
//   ・通すのは今の社内システムの POST /api/chat の2つだけ：
//       個人（あおいの 1:1）  … action=send      { userId, text }
//       グループ              … action=groupSend { groupId, text }
//     それ以外の action・添付・引用は通さない（本文だけ）
//   ・送ってよい人か（グループは全体管理者などだけ）は今の API が決める。断られたら、その理由をそのまま返す
//   ・ログインしていない（見本）ときは送らない
type Body = { kind?: string; userId?: string; groupId?: string; text?: string };

export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ ok: false, sample: true, error: '見本なので送っていません' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const text = typeof b.text === 'string' ? b.text : '';
  if (!text.trim()) return NextResponse.json({ ok: false, error: '本文が空です' }, { status: 400 });
  if (text.length > 5000) return NextResponse.json({ ok: false, error: '本文が長すぎます（5,000字まで）' }, { status: 400 });

  let path: string, payload: Record<string, string>;
  if (b.kind === 'person') {
    if (!/^U[0-9a-f]{32}$/.test(b.userId || '')) return NextResponse.json({ ok: false, error: '送り先（LINE の相手）が違います' }, { status: 400 });
    path = '/api/chat?action=send'; payload = { userId: b.userId!, text };
  } else if (b.kind === 'group') {
    if (!/^C[0-9a-f]{32}$/.test(b.groupId || '')) return NextResponse.json({ ok: false, error: '送り先（LINE グループ）が違います' }, { status: 400 });
    path = '/api/chat?action=groupSend'; payload = { groupId: b.groupId!, text };
  } else {
    return NextResponse.json({ ok: false, error: '送り先の種類が違います' }, { status: 400 });
  }

  try {
    const r = await ikeFetch(path, { method: 'POST', body: JSON.stringify(payload) }, 30000);
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string; warning?: string; hint?: string };
    if (r.status === 401) return NextResponse.json({ ok: false, error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    if (!r.ok || !j.success) return NextResponse.json({ ok: false, error: j.error || j.hint || `送れませんでした（${r.status}）` }, { status: r.ok ? 200 : r.status });
    return NextResponse.json({ ok: true, warning: j.warning });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `今の社内システムに届きませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
