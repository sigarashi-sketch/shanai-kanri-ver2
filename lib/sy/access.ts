import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { currentUser, requirePageUser, type CurrentUser } from './auth';
import { db } from './db';
import { isAdminUp, DEFAULT_ACCESS, canSee, cleanAccess, roleOf, type AccessSettings, type AppRole } from './access-types';

// 権限の読み書きと、ページの関所。設定は saiyou.settings key='access'（無ければ DEFAULT_ACCESS）。
export const loadAccess = cache(async (): Promise<AccessSettings> => {
  const { data } = await db().from('settings').select('value').eq('key', 'access').maybeSingle();
  return data?.value ? cleanAccess(data.value) : DEFAULT_ACCESS;
});
export function appRole(u: CurrentUser, a: AccessSettings): AppRole {
  if (u.id === 'dev') return 'super_admin';   // 手元の確認用ユーザー（本番では存在しない）
  return roleOf(u.email, a);
}
export async function myAccess(): Promise<{ u: CurrentUser; role: AppRole; access: AccessSettings } | null> {
  const u = await currentUser(); if (!u) return null;
  const access = await loadAccess();
  return { u, role: appRole(u, access), access };
}
// ページの入口で呼ぶ。見せない設定のページはホームへ戻す（メニューから消すだけでなく、URLを直接開いても入れない）
export async function requirePage(href: string): Promise<{ u: CurrentUser; role: AppRole }> {
  const u = await requirePageUser();
  const access = await loadAccess();
  const role = appRole(u, access);
  if (!canSee(role, href, access)) redirect('/');
  return { u, role };
}
// 保存。by は操作した人。決まり: ①admin 以上だけ ②super admin の付け外しは super admin だけ ③super admin を0人にしない
export async function saveAccess(v: unknown, by: CurrentUser): Promise<{ access?: AccessSettings; error?: string }> {
  const cur = await loadAccess(); const myRole = appRole(by, cur);
  if (!isAdminUp(myRole)) return { error: '権限を変えられるのは admin と super admin だけです' };
  const next = cleanAccess(v);
  if (myRole !== 'super_admin') {
    const emails = new Set([...Object.keys(cur.roles), ...Object.keys(next.roles)]);
    for (const e of emails) if ((cur.roles[e] === 'super_admin') !== (next.roles[e] === 'super_admin')) return { error: 'super admin の付け外しは super admin だけができます' };
  }
  if (!Object.values(next.roles).includes('super_admin')) return { error: 'super admin を0人にはできません' };
  const { error } = await db().from('settings').upsert({ key: 'access', value: next, updated_by: by.email, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return error ? { error: error.message } : { access: next };
}
