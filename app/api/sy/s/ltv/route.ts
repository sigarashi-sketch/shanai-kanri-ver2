import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { appRole, loadAccess } from '@/lib/sy/access';
import { loadLtv } from '@/lib/sy/ltv';
import { normName } from '@/lib/sy/name';
import { isAdminUp } from '@/lib/sy/access-types';

export const maxDuration = 120;   // ためていないときは いけどん側の集計を待つ（40秒ほど）

// 粗利・LTV（admin と super admin だけ。2026-10-07 shoya）。?key=n:<名前> を付けると その1人ぶんだけ返す（名簿の詳細の欄）
export async function GET(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  if (!isAdminUp(appRole(u, await loadAccess()))) return NextResponse.json({ error: 'この数字は admin と super admin だけが見られます' }, { status: 403 });
  try {
    const d = await loadLtv();
    const key = req.nextUrl.searchParams.get('key');
    if (key === null) return NextResponse.json(d, { headers: { 'Cache-Control': 'no-store' } });
    const norm = key.replace(/^n:/, '');
    const person = d.people.find((p) => normName(p.name) === norm) || null;
    return NextResponse.json({ at: d.at, months: d.months, basis: d.basis, person }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
