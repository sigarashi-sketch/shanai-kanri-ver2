import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { ike, onIkeikeDb } from '@/lib/sy/db';
import { ikeJson } from '@/lib/sy/ikeike';
import { liverNorms } from '@/lib/sy/livers';

// コミュニティ（いけどん roster_teams / roster_team_members）の一覧。読みは DB から直接。
//   書き込みは画面から /api/teams（いけどんの口・同姓同名チェック等をそのまま通す）へ。
export interface TeamOut {
  id: string; name: string; sort_order: number;
  leader_name: string | null; leader_norm_name: string | null; subleader_name: string | null; subleader_norm_name: string | null;
  members: { norm_name: string; name: string; added_at: string | null }[];
}

export async function GET() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  try {
    if (!onIkeikeDb()) {
      const j = await ikeJson<{ teams?: TeamOut[] }>('/api/teams?action=list');
      return NextResponse.json({ teams: j.teams || [], source: 'api' });
    }
    const [t, m] = await Promise.all([
      ike().from('roster_teams').select('id, name, sort_order, leader_name, leader_norm_name, subleader_name, subleader_norm_name').order('sort_order').order('created_at'),
      ike().from('roster_team_members').select('team_id, norm_name, name, added_at').limit(5000),
    ]);
    if (t.error) throw new Error(t.error.message);
    const livers = await liverNorms();   // ライバーは対象外＝コミュニティにも出さない（いけどん側の所属は触らない）
    const by = new Map<string, TeamOut['members']>();
    (m.data || []).filter((r) => !livers.has(r.norm_name)).forEach((r) => by.set(r.team_id, [...(by.get(r.team_id) || []), { norm_name: r.norm_name, name: r.name, added_at: r.added_at }]));
    const teams = (t.data || []).map((x) => ({ ...x, members: by.get(x.id) || [] }));
    return NextResponse.json({ teams, source: 'db' });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
}
