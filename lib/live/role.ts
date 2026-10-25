import 'server-only';
import { ikeFetch, ikeToken } from '../ike';
import type { PersonCan } from './person';

// ログインした人のロール（今の社内システムの /api/auth?action=me）で、名前の小窓に出してよい中身を決める（10-25）。
//   ・ロール名は今のシステム（api/_auth.ts・api/_page_access.ts）と同じ
//       super_admin / admin / executive / sales_admin / staff_sales / staff_recruit / kanawest_sales
//       （staff・list_viewer・keiri・applicant_support・retired は「専用ページだけ」のロール）
//   ・単価・額面 … 全体管理者・管理者・executive・営業（今の「粗利試算」「契約報告の雛形」と同じく採用には出さない）
//   ・チャット・基本情報・要約 … 全体管理者・管理者・executive・採用（人事の情報）
//   ・同じトークンなら 60 秒は控えを使う（1回の小窓で何度も聞かない）。読めなければ ''＝何も見せない側に倒す
export const PRICE_ROLES = ['super_admin', 'admin', 'executive', 'sales_admin', 'staff_sales', 'kanawest_sales'] as const;
export const HR_ROLES = ['super_admin', 'admin', 'executive', 'staff_recruit'] as const;
export const HR_FORBIDDEN = 'この中身（チャット・基本情報・要約）は、管理者と採用の担当だけが見られます';

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

export const canSeePrice = (role: string) => (PRICE_ROLES as readonly string[]).includes(role);
export const canSeeHr = (role: string) => (HR_ROLES as readonly string[]).includes(role);
export const canOf = (role: string): PersonCan => ({ chat: canSeeHr(role), basic: canSeeHr(role), price: canSeePrice(role) });
