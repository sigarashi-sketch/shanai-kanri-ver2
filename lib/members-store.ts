import 'server-only';
import { isListOnlyIkeRole, isRoleKey, roleFromIke, type Member, type Perms } from './access';
import { ikeFetchCached, ikeToken } from './ike';
import { isInnaiEmail, tokenEmail } from './innai';

// いまの人と名簿（10-26 見本の5人をやめて本物に）。
//   ・いまの人＝ログインした本人。メールはトークン（lib/innai.ts tokenEmail）、ロールと「未経験事業部か」は今の社内システムの /api/auth?action=me
//     名前はトークンの中の Google の表示名（今の権限管理の画面と同じ full_name / name）。無ければメールの @ の前
//   ・ver2 のロール（owner/manager/viewer_all/none＋個別の段階）は、全員で共有している設定（v2-settings の members）に
//     その人のメールで載っていればそれ。載っていなければ今のシステムのロールから決める（lib/access.ts roleFromIke の対応表）
//   ・名簿（権限管理・組織の画面が並べる人）は、今の権限管理の画面と同じ一覧（/api/admin?action=list・super_admin だけが読める）の
//     会社のアカウントの人＋共有の設定に入っている人。super_admin でなければ読めないので、共有の設定の人＋本人だけ
//   ・保存は共有の設定（/api/live/v2-settings）だけ。この端末・サーバーの手元には持たない

type IkeMe = { authenticated?: boolean; email?: string; role?: string; listOnly?: boolean; ippass?: boolean; error?: string };
type AdminRow = { email?: string; name?: string; role?: string; mikeiken?: boolean; inDomain?: boolean };

export type MeLoad = { ok: true; me: Member; ikeRole: string } | { ok: false; reason: 'not_logged_in' | 'error'; error?: string };

const norm = (e: unknown) => String(e || '').trim().toLowerCase();

/** トークンの中の表示名（Google の full_name / name）。署名の確かめは今の社内システムがやる */
function tokenName(t: string): string {
  try {
    const part = t.split('.')[1] || '';
    const j = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as { user_metadata?: Record<string, unknown> };
    const m = j.user_metadata || {};
    return String(m.full_name || m.name || m.display_name || '').trim();
  } catch { return ''; }
}

/** 全員で共有している設定の members（メールで引く）。読めなければ空 */
async function sharedMembers(): Promise<Map<string, Member>> {
  const out = new Map<string, Member>();
  try {
    const r = await ikeFetchCached<{ value?: { members?: unknown } | null }>('/api/assistant?action=v2-settings', 30_000, { timeoutMs: 8000 });
    const ms = r.ok ? r.data?.value?.members : null;
    if (!Array.isArray(ms)) return out;
    for (const x of ms as Partial<Member>[]) {
      const email = norm(x?.email || x?.id);
      if (!isInnaiEmail(email)) continue; // メールで指せない行（昔の手元の名簿の id など）と要員は使わない
      out.set(email, {
        id: email, email, name: String(x.name || email.split('@')[0]),
        division: x.division === '未経験事業部' ? '未経験事業部' : 'その他', kind: '内勤',
        role: isRoleKey(x.role) ? x.role : 'none',
        own: x.own && typeof x.own === 'object' ? (x.own as Partial<Perms>) : {},
      });
    }
  } catch { /* 読めなければ空 */ }
  return out;
}

/** 共有の設定に載っていればそのロールと段階、無ければ今のシステムのロールから。super_admin は常に owner */
function withRole(base: Omit<Member, 'role' | 'own'>, ikeRole: string, shared: Map<string, Member>): Member {
  const s = shared.get(base.email);
  const r = ikeRole === 'super_admin' ? { role: 'owner' as const, own: s?.own ?? {} } : s ? { role: s.role, own: s.own } : roleFromIke(ikeRole);
  return { ...base, ...r };
}

/** いまの人（ログインした本人）。ログインしていない・切れたら not_logged_in */
export async function loadMe(): Promise<MeLoad> {
  const t = await ikeToken();
  if (!t) return { ok: false, reason: 'not_logged_in' };
  const email = norm(tokenEmail(t));
  try {
    const [r, shared] = await Promise.all([
      ikeFetchCached<IkeMe>('/api/auth?action=me', 30_000, { timeoutMs: 10000 }),
      sharedMembers(),
    ]);
    if (r.status === 401 || r.data?.authenticated === false) return { ok: false, reason: 'not_logged_in' };
    if (!r.ok) return { ok: false, reason: 'error', error: `今の社内システムに入れるか聞けませんでした（${r.status}）` };
    if (norm(r.data.email) !== email) return { ok: false, reason: 'not_logged_in' };
    const ikeRole = String(r.data.role || '');
    // 未経験事業部か＝今のシステムの ippass（#未経験-クローズ の参加者・super_admin は常に true）。営業共有リストだけのロールは入れない
    const inside = (r.data.ippass === true || ikeRole === 'super_admin') && !(r.data.listOnly ?? isListOnlyIkeRole(ikeRole));
    const me = withRole({ id: email, email, name: tokenName(t) || shared.get(email)?.name || email.split('@')[0], division: inside ? '未経験事業部' : 'その他', kind: '内勤' }, ikeRole, shared);
    return { ok: true, me, ikeRole };
  } catch (e) {
    return { ok: false, reason: 'error', error: (e as Error).message };
  }
}

/** 名簿（権限管理・組織の画面）。並びは名前順。いまの人は必ず入る */
export async function loadMembers(): Promise<Member[]> {
  const got = await loadMe();
  if (!got.ok) return [];
  const shared = await sharedMembers();
  const by = new Map<string, Member>();
  if (got.ikeRole === 'super_admin') {
    try {
      const r = await ikeFetchCached<{ rows?: AdminRow[] }>('/api/admin?action=list', 60_000, { timeoutMs: 15000 });
      for (const x of (r.ok && Array.isArray(r.data?.rows) ? r.data.rows : [])) {
        const email = norm(x.email);
        const ikeRole = String(x.role || 'staff');
        if (!isInnaiEmail(email) || x.inDomain === false || ikeRole === 'retired') continue; // 会社のアカウントの人だけ（要員・退社は出さない）
        const inside = (x.mikeiken === true || ikeRole === 'super_admin') && !isListOnlyIkeRole(ikeRole);
        by.set(email, withRole({ id: email, email, name: String(x.name || '').trim() || email.split('@')[0], division: inside ? '未経験事業部' : 'その他', kind: '内勤' }, ikeRole, shared));
      }
    } catch { /* 読めなければ共有の設定の人だけ */ }
  }
  for (const [email, m] of shared) if (!by.has(email)) by.set(email, m);
  by.set(got.me.email, got.me);
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

/** 名簿の保存は共有の設定（/api/live/v2-settings）でやる。ここでは何もしない（手元のファイルには持たない） */
export async function saveMembers(_ms: Member[]): Promise<void> {}
