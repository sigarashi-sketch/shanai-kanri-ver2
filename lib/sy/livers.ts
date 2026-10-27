import 'server-only';
import { ike, onIkeikeDb } from './db';
import { normName } from './name';

// ライバー（いけどんの liver_list）は「それゆけ未経験」の対象外。名簿・紐付け先・コミュニティ・フィード・月次アンケートから外す。
//   2026-10-01 shoya「ライバーのリストも入っちゃってるから除外して」。いけどん側もプロパーリストに入れない運用（0200）。
//   読めないとき（表が無い等）は空集合＝誰も外さない。1分だけ覚える。
let cache: { at: number; set: Set<string> } | null = null;
export async function liverNorms(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.set;
  const set = new Set<string>();
  if (onIkeikeDb()) {
    try {
      const { data } = await ike().from('liver_list').select('name, normalized_name').limit(5000);
      (data || []).forEach((r) => { const n = normName(r.normalized_name || r.name); if (n) set.add(n); });
    } catch { /* 外さないだけ */ }
  }
  cache = { at: Date.now(), set };
  return set;
}
export const isLiver = (set: Set<string>, name: unknown) => set.has(normName(name));
