import 'server-only';
import { db } from './db';
import { ikeJson } from './ikeike';
import { normName } from './name';

// いけどんのチャットで名簿と紐付け済みの LINE（line_contact_list）を使って、採用版の未紐付けの友だちを自動で紐付ける。
//   ★LINE の userId はプロバイダー単位。採用版の公式LINEが いけどんの公式LINE と同じプロバイダーにあるときだけ一致する
//     （別プロバイダーなら1件も当たらないだけ＝害はない）。
//   ★人が手で紐付けた/外したものは上書きしない（subject_key が空の人だけ）。
//   ★いけどんへの問い合わせは重いので、同じ関数インスタンスでは60秒に1回まで。
let lastRun = 0;

interface IkeContact { line_user_id?: string; link_status?: string | null; linked_name?: string | null; linked_normalized_name?: string | null }

export async function autoLinkFromIkeike(unlinkedIds: string[]): Promise<number> {
  if (!unlinkedIds.length || Date.now() - lastRun < 60_000) return 0;
  lastRun = Date.now();
  let contacts: IkeContact[] = [];
  try { contacts = (await ikeJson<{ contacts?: IkeContact[] }>('/api/chat?action=contacts', { timeoutMs: 20000 })).contacts || []; }
  catch { return 0; }
  const want = new Set(unlinkedIds);
  let n = 0;
  for (const c of contacts) {
    if (!c.line_user_id || !want.has(c.line_user_id) || c.link_status !== 'linked' || !c.linked_name) continue;
    const nn = c.linked_normalized_name || normName(c.linked_name);
    const { error } = await db().from('line_users')
      .update({ subject_key: 'n:' + nn, subject_name: c.linked_name, updated_at: new Date().toISOString() })
      .eq('user_id', c.line_user_id).eq('subject_key', '');
    if (!error) n++;
  }
  return n;
}
