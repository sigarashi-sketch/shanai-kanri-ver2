import { NextResponse } from 'next/server';
import { ikeWrite } from '@/lib/ike-write';

// 基本情報フォームの URL を発行する（10-25・今の issue.html と同じ）。今の POST /api/form-issue に氏名だけ渡す。
//   同じ人に未回答の URL があればそれを返す（二重に発行しない・回答ずみならその旨）＝決まりは今のシステムのまま
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { name?: unknown };
  const name = String(b.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: '氏名を入れてください' }, { status: 400 });
  return ikeWrite(req, '/api/form-issue', { name });
}
