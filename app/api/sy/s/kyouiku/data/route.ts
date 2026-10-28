import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { buildKyouikuData } from '@/lib/sy/kyouiku-data';

export const maxDuration = 30;

// 教育データ（受講者ごとの進み具合）。/kyouiku の「受講データ」が読む
export async function GET() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  return NextResponse.json(await buildKyouikuData());
}
