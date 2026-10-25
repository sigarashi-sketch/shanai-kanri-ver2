import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';

// 名前の小窓で「チャット・基本情報・面談メモ・要約」を見たことを残す（10-25 shoya）。
//   POST { kind, target, page } → 今の社内システム POST /api/assistant?action=v2-view にそのまま渡す（誰が見たかは向こうがトークンで決める）
//   ・画面は待たない（投げっぱなし）。向こうにまだ口が無い（404）ときも黙って ok を返す
const KINDS = new Set(['chat', 'basic', 'memo', 'summary']);

export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ ok: false, error: 'not_logged_in' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { kind?: string; target?: string; page?: string };
  const kind = String(b.kind || '');
  if (!KINDS.has(kind)) return NextResponse.json({ ok: false, error: '種類が分かりません' }, { status: 400 });
  const target = String(b.target || '').slice(0, 80);
  const page = String(b.page || '').slice(0, 200);
  try {
    const r = await ikeFetch('/api/assistant?action=v2-view', { method: 'POST', body: JSON.stringify({ kind, target, page }) }, 8000);
    return NextResponse.json({ ok: r.ok || r.status === 404 });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
