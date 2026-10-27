import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { getContent } from '@/lib/sy/line';

// 受信した画像などの中身（LINE側に一定期間だけ残っている）
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const { id } = await params;
  const r = await getContent(id);
  if (!r.ok) return NextResponse.json({ error: '取得できませんでした（期限切れの可能性）' }, { status: r.status });
  return new NextResponse(r.body, { headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream', 'cache-control': 'private, max-age=3600' } });
}
