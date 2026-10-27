import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { loadMembers } from '@/lib/sy/roster';

export const maxDuration = 60;

export async function GET() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  try { return NextResponse.json(await loadMembers()); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
}
