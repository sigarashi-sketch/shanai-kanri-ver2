import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { ikeToken } from '@/lib/ike';
import { allowedRoles, fetchIkeikeRole, verifyAccess, type SessionUser } from './session';

export interface CurrentUser extends SessionUser { role: string }

// 人財管理（それゆけ未経験から移した処理・10-27）の関所。それゆけ lib/auth.ts の ver2 版。
//   ・トークンは ver2 のログイン（lib/ike.ts ikeToken）。それゆけと同じ Supabase なので、検証もそれゆけと同じ（会社アカウントだけ）
//   ・ロールは今の社内システムの /api/auth?action=me に聞き、同じ人の分は10分だけ手元に持つ（それゆけは署名つき Cookie に12時間）
//   ・入れるロールはそれゆけと同じ（env ALLOWED_ROLES）。それゆけの中の4段階（super admin／admin／manager／内勤一般）は lib/sy/access.ts のまま
const roles = new Map<string, { role: string | null; until: number }>();
async function roleOf(token: string): Promise<string | null> {
  const k = token.slice(-32);
  const hit = roles.get(k);
  if (hit && hit.until > Date.now()) return hit.role;
  const role = await fetchIkeikeRole(token);
  roles.set(k, { role, until: Date.now() + (role ? 10 * 60_000 : 30_000) });
  return role;
}

export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = await ikeToken();
  if (!token) return null;
  const [user, role] = await Promise.all([verifyAccess(token), roleOf(token)]);
  if (!user || !role || !allowedRoles().includes(role)) return null;
  return { ...user, role };
});

export async function requirePageUser(): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) redirect('/');
  return u;
}
