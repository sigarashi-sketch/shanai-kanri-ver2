// コミュニティ：今の社内システムの形 → この画面の型。
//   読むのは GET /api/teams?action=list（今のコミュニティの画面 teams.html と同じ。テーブル名は班のまま roster_teams）。
//   今のシステムにあるのはコミュニティの名前・リーダー・サブリーダー・メンバーだけ。勉強会・イベントの予定と出欠は無い
import type { Community } from '@/lib/types/jinji';

export type IkeTeam = {
  id: string; name: string;
  leader_norm_name: string | null; leader_name: string | null;
  subleader_norm_name: string | null; subleader_name: string | null;
  sort_order: number; members: { norm_name: string; name: string }[];
};
export type IkeTeams = { ok: boolean; teams?: IkeTeam[]; error?: string };

export function communitiesFromIke(j: IkeTeams | null): Community[] {
  return [...(j?.teams || [])]
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((t) => ({ id: t.id, name: t.name, leader: t.leader_name || '未設定', sub: t.subleader_name || undefined, members: t.members?.length || 0 }));
}
