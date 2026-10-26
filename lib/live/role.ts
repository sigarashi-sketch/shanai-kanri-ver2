import 'server-only';
import { ikeFetch, ikeFetchCached, ikeToken } from '../ike';
import { ALL_CAN, DEFAULT_ROLE_CAN, NO_CAN, fixCan, type CanKey } from '../role-can';
import { orgAssigned, orgCan } from '../org';
import { sharedOrg, tokenSub } from '../members-store';
import type { PersonCan } from './person';

// ログインした人のロール（今の社内システムの /api/auth?action=me）で、名前の小窓に出してよい中身を決める（10-25）。
//   ・ロール名は今のシステム（api/_auth.ts・api/_page_access.ts）と同じ
//       super_admin / admin / executive / sales_admin / staff_sales / staff_recruit / kanawest_sales
//       （staff・list_viewer・keiri・applicant_support・retired は「専用ページだけ」のロール）
//   ・見られる中身（チャット・要約・基本情報・単価額面）は組織表で決める（lib/org.ts orgCan・10-26）。組織表で何も付いていない人だけロールの初めの値
//   ・同じトークンなら 60 秒は控えを使う（1回の小窓で何度も聞かない）。読めなければ ''＝何も見せない側に倒す
export const FORBIDDEN: Record<CanKey, string> = {
  chat: 'あなたはチャットを見られません（組織表で変えられます）',
  summary: 'あなたは要約を押せません（組織表で変えられます）',
  basic: 'あなたは基本情報を見られません（組織表で変えられます）',
  price: 'あなたは単価・額面を見られません（組織表で変えられます）',
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

/** いまの人が名前の小窓で見られるもの。super_admin は全部／組織表で付いていれば組織表／付いていなければロールの初めの値 */
export async function myCan(): Promise<PersonCan> {
  const t = await ikeToken();
  if (!t) return { ...NO_CAN };
  const [role, org] = await Promise.all([ikeRole(), sharedOrg()]);
  if (role === 'super_admin') return { ...ALL_CAN };
  const a = org ? org.people[tokenSub(t)] : undefined;
  if (org && orgAssigned(org, a)) return orgCan(org, a);
  return fixCan(DEFAULT_ROLE_CAN[role] ?? NO_CAN);
}
export async function roleCan(key: CanKey): Promise<boolean> {
  return (await myCan())[key];
}
