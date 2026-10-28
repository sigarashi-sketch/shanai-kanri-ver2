import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { buildStats } from '@/lib/sy/kyouiku-stats';

export const maxDuration = 30;

// bdsh の集計（開いた・押した・練習した人数／スキルチェックの結果）。/kyouiku の「集計」が読む。?staff=1 で内勤も入れる
export async function GET(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  try { return NextResponse.json(await buildStats(req.nextUrl.searchParams.get('staff') === '1')); }
  catch (e) { return NextResponse.json({ error: `集計を読めませんでした（${(e as Error).message}）` }, { status: 500 }); }
}
