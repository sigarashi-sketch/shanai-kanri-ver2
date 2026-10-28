import 'server-only';
import { db, likePrefix } from '../db';
import { saveAttempt } from '../kyouiku';
import type { MosRow } from './index';

// 手元の確認用（MOS_FAKE_DB=1）: DB に書かず、サーバのメモリに持つ。本番の記録を汚さずに 画面と採点を最後まで通すため。Vercel には この変数を置かない
export const MOS_FAKE = process.env.MOS_FAKE_DB === '1';
type Row = MosRow & { subject_key: string };
const mem: Row[] = ((globalThis as unknown as { __mosMem?: Row[] }).__mosMem ||= []);
export async function saveMos(r: { subject_key: string; name: string; quest: string; step: number; ok: boolean; detail: unknown }) {
  if (MOS_FAKE) { mem.push({ subject_key: r.subject_key, quest: r.quest, step: r.step, ok: r.ok, detail: (r.detail || {}) as Record<string, unknown>, created_at: new Date().toISOString() }); return ''; }
  return saveAttempt(r);
}

// MOS コースの記録（kyouiku_progress の quest が '_mos' で始まる行＝レッスン・版・模擬試験）。subject を省くと全員ぶん
export async function loadMos(subject?: string): Promise<(MosRow & { subject_key: string })[]> {
  if (MOS_FAKE) return mem.filter((r) => !subject || r.subject_key === subject);
  try {
    let q = db().from('kyouiku_progress').select('subject_key,quest,step,ok,detail,created_at').like('quest', likePrefix('_mos')).order('id', { ascending: true }).limit(20000);
    if (subject) q = q.eq('subject_key', subject);
    const { data, error } = await q;
    return error ? [] : ((data || []) as (MosRow & { subject_key: string })[]);
  } catch { return []; }
}
