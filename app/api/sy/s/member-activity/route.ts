import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { loadMemberBase, loadMemberStudy } from '@/lib/sy/member-activity';

export const maxDuration = 40;

// 要員の詳細に出す「活動の記録」（読むだけ）。
//   ?key=&name=            … 月次アンケートの回答と 面談の実施日
//   ?key=&name=&part=study … 勉強会の出欠（回答シートを毎回読むので遅い＝別に呼ぶ）
export async function GET(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const q = req.nextUrl.searchParams;
  const key = q.get('key') || ''; const name = q.get('name') || '';
  if (!/^(n|p):.+/.test(key) || !name.trim()) return NextResponse.json({ error: 'key が不正です' }, { status: 400 });
  try {
    return NextResponse.json(q.get('part') === 'study' ? await loadMemberStudy(name) : await loadMemberBase(key, name));
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
}
