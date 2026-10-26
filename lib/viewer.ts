import 'server-only';
import type { Member } from './access';
import { loadMe } from './members-store';

/** ログインしていない・確かめられなかったときの人（何も見られない・営業共有リストの扱い） */
export const GUEST: Member = { id: '', email: '', name: 'ログインしていません', division: 'その他', kind: 'その他', role: 'none', own: {} };

/**
 * いまの人＝ログインした本人（lib/members-store.ts loadMe・10-26）。
 *   前の「見え方」（cookie で架空の人に切り替え）はやめた。cookie が残っていても読まない＝本人以外の権限にはならない
 */
export async function getViewer(): Promise<Member> {
  const got = await loadMe();
  return got.ok ? got.me : GUEST;
}
