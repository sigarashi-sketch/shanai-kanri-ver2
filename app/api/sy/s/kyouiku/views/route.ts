import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { buildViews } from '@/lib/sy/kyouiku-views';

export const maxDuration = 30;

// bdsh の クリック数（/kyouiku の「クリック数」タブが読む）。?days=7|30|90|0（0＝全期間）&staff=1 で内勤の分も数える
export async function GET(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const p = req.nextUrl.searchParams;
  const days = Math.max(0, Math.min(3650, Number(p.get('days') ?? 30) || 0));
  return NextResponse.json(await buildViews(days, p.get('staff') === '1'));
}
