import 'server-only';
import { cookies } from 'next/headers';
import { VIEWER_COOKIE, type Member } from './access';
import { loadMembers } from './members-store';

/** いまの人。ログインをつなぐまでは上のバーの「見え方」で切り替え（cookie・既定は全体管理者）。 */
export async function getViewer(): Promise<Member> {
  const id = (await cookies()).get(VIEWER_COOKIE)?.value;
  const ms = await loadMembers();
  return ms.find((m) => m.id === id) ?? ms[0];
}
