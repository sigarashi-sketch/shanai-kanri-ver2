import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { properRows } from '@/lib/sy/proper-flags';

// 要員の詳細に出す「プロパーリスト」の状態（読むだけ・GET しか無い）。?name=
export async function GET(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const name = req.nextUrl.searchParams.get('name') || '';
  if (!name.trim()) return NextResponse.json({ error: 'name がありません' }, { status: 400 });
  try {
    return NextResponse.json({ rows: await properRows(name) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
}
