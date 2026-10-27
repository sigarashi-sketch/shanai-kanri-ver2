import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';

// 要員ページの「チャット」から LINE を送る口（2026-10-23 shoya「送信もできるように」）。
//   ・通すのは今の社内システムの POST /api/chat の2つだけ：
//       個人（あおいの 1:1）  … action=send      { userId, text }
//       グループ              … action=groupSend { groupId, text }
//     それ以外の action は通さない
//   ・添付（画像1枚＋PDF1つ）と 返信（引用）も今のチャット画面と同じ形で渡す（10-27 shoya「画像とファイル送付・リプライ機能なくなってる」）
//       image { path, previewPath } / pdf { path, name, size } … /api/live/chat-upload で上げた置き場。中身の確かめは今のシステム
//       replyTo … 引用元の LINE メッセージ ID（合言葉は今のシステムが DB から引く）
//   ・送ってよい人か（グループは全体管理者などだけ）は今の API が決める。断られたら、その理由をそのまま返す
//   ・ログインしていないときは送らない
type Body = { kind?: string; userId?: string; groupId?: string; text?: string; replyTo?: string;
  image?: { path?: unknown; previewPath?: unknown }; pdf?: { path?: unknown; name?: unknown; size?: unknown } };
const str = (v: unknown, max = 300) => (typeof v === 'string' && v.length <= max ? v : '');

/** 添付と引用（形だけ見る。置き場の形・中身は今のシステムが確かめる） */
function extras(b: Body): Record<string, unknown> | string {
  const o: Record<string, unknown> = {};
  if (b.replyTo != null && b.replyTo !== '') {
    if (!/^[0-9A-Za-z_-]{1,64}$/.test(String(b.replyTo))) return '返信先が違います';
    o.replyTo = String(b.replyTo);
  }
  if (b.image) {
    const path = str(b.image.path);
    if (!path) return '画像の置き場が違います';
    o.image = { path, previewPath: str(b.image.previewPath) };
  }
  if (b.pdf) {
    const path = str(b.pdf.path), name = str(b.pdf.name, 200), size = Number(b.pdf.size) || 0;
    if (!path || !name) return 'PDF の置き場が違います';
    o.pdf = { path, name, size };
  }
  return o;
}

export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ ok: false, error: 'ログインしてください' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const text = typeof b.text === 'string' ? b.text : '';
  const ex = extras(b);
  if (typeof ex === 'string') return NextResponse.json({ ok: false, error: ex }, { status: 400 });
  if (!text.trim() && !ex.image && !ex.pdf) return NextResponse.json({ ok: false, error: '本文が空です' }, { status: 400 });
  if (text.length > 5000) return NextResponse.json({ ok: false, error: '本文が長すぎます（5,000字まで）' }, { status: 400 });

  let path: string, payload: Record<string, unknown>;
  if (b.kind === 'person') {
    if (!/^U[0-9a-f]{32}$/.test(b.userId || '')) return NextResponse.json({ ok: false, error: '送り先（LINE の相手）が違います' }, { status: 400 });
    path = '/api/chat?action=send'; payload = { userId: b.userId!, text, ...ex };
  } else if (b.kind === 'group') {
    if (!/^C[0-9a-f]{32}$/.test(b.groupId || '')) return NextResponse.json({ ok: false, error: '送り先（LINE グループ）が違います' }, { status: 400 });
    path = '/api/chat?action=groupSend'; payload = { groupId: b.groupId!, text, ...ex };
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
