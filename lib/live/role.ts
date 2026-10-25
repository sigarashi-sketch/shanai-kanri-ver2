import 'server-only';
import { ikeFetch, ikeFetchCached, ikeToken } from '../ike';
import { canRow, normRoleCan, type CanKey, type RoleCan } from '../role-can';
import type { PersonCan } from './person';

// ログインした人のロール（今の社内システムの /api/auth?action=me）で、名前の小窓に出してよい中身を決める（10-25）。
//   ・ロール名は今のシステム（api/_auth.ts・api/_page_access.ts）と同じ
//       super_admin / admin / executive / sales_admin / staff_sales / staff_recruit / kanawest_sales
//       （staff・list_viewer・keiri・applicant_support・retired は「専用ページだけ」のロール）
//   ・見られる中身（チャット・要約・基本情報・単価額面）はロールごとの表で決める（lib/role-can.ts・権限管理で全体管理者が切り替える）
//   ・同じトークンなら 60 秒は控えを使う（1回の小窓で何度も聞かない）。読めなければ ''＝何も見せない側に倒す
export const FORBIDDEN: Record<CanKey, string> = {
  chat: 'あなたのロールではチャットを見られません（権限管理で全体管理者が変えられます）',
  summary: 'あなたのロールでは要約を押せません（権限管理で全体管理者が変えられます）',
  basic: 'あなたのロールでは基本情報を見られません（権限管理で全体管理者が変えられます）',
  price: 'あなたのロールでは単価・額面を見られません',
};

const TTL = 60_000;
const cache = new Map<string, { at: number; p: Promise<string> }>();

export async function ikeRole(): Promise<string> {
  const t = await ikeToken();
  if (!t) return '';
  const now = Date.now();
  for (const [k, v] of cache) if (now - v.at > TTL) cache.delete(k);
  const hit = cache.get(t);
  if (hit) return hit.p;
  const p = (async () => {
    const r = await ikeFetch('/api/auth?action=me', undefined, 10000);
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json().catch(() => ({}))) as { authenticated?: boolean; role?: string };
    return j.authenticated === false ? '' : String(j.role || '');
  })();
  cache.set(t, { at: now, p });
  p.catch(() => cache.delete(t));
  return p.catch(() => '');
}

/** ロールごとの表（全員で共有している設定。30秒は控え。読めなければ初めの値） */
export async function roleCanTable(): Promise<RoleCan> {
  try {
    const r = await ikeFetchCached<{ value?: { roleCan?: unknown } | null }>('/api/assistant?action=v2-settings', 30_000, { timeoutMs: 8000 });
    return normRoleCan(r.ok ? r.data?.value?.roleCan : null);
  } catch { return normRoleCan(null); }
}
export async function canOf(role: string): Promise<PersonCan> {
  return canRow(await roleCanTable(), role);
}
export async function roleCan(key: CanKey): Promise<boolean> {
  return (await canOf(await ikeRole()))[key];
}