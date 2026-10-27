import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { db, ike, onIkeikeDb } from '@/lib/sy/db';
import { isLiver, liverNorms } from '@/lib/sy/livers';

export const dynamic = 'force-dynamic';

// 月次アンケートの回答（読むだけ）。/survey の画面がサーバで読んでいるものと同じ（app/(app)/survey/page.tsx）。
//   いけどん ver2 の「人財管理 → 月次アンケート」が読む（2026-10-27 shoya「それゆけ未経験も移管」）
export async function GET() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  let rows: Record<string, unknown>[] = [];
  if (onIkeikeDb()) {
    const { data } = await ike().from('monthly_survey_responses').select('id, submitted_at, name, eki, gyomu, manzoku, manzoku_score, riyu, shikaku, shikaku_riyu, mokuhyo, sonota').order('submitted_at', { ascending: false }).limit(5000);
    rows = data || [];
  }
  if (!rows.length) {
    const { data } = await db().from('survey_responses').select('*').order('submitted_at', { ascending: false }).limit(5000);
    rows = data || [];
  }
  const livers = await liverNorms();   // ライバーは対象外
  return NextResponse.json({ rows: rows.filter((r) => !isLiver(livers, String(r.name || ''))) }, { headers: { 'Cache-Control': 'no-store' } });
}
