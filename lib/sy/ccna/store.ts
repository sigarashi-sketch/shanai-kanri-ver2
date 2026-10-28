import 'server-only';
import { db } from '../db';

// CCNA コースの「配る人」（ccna_members）。講義は lib/ccna/lecture、試験対策は lib/ccna/prep.ts
//   ★2026-10-20 shoya「CCNA のポケモン要素のやつ全部消していい」→ 図鑑あつめ（まち・ジム・四天王・物語・モンスター）は画面・API・下書きごと消した。
//     DB の表（ccna_monsters / ccna_questions / ccna_dex / ccna_gym / ccna_answers / ccna_flags）は残してある（どこからも読まない）
export async function isCcnaOn(subject: string): Promise<boolean> {
  try { const { data } = await db().from('ccna_members').select('enabled').eq('subject_key', subject).maybeSingle(); return !!data?.enabled; } catch { return false; }
}

// 受講データ用: 人ごとに CCNA がオンか（行がある人だけ）
export async function ccnaMembers(): Promise<Record<string, boolean>> {
  try { const { data } = await db().from('ccna_members').select('subject_key,enabled'); return Object.fromEntries((data || []).map((r) => [r.subject_key as string, !!r.enabled])); } catch { return {}; }
}
