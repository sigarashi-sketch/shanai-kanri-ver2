// 組織表（ver2 の中だけ・10-25 shoya「組織表も作りたい 一旦手打ちする ログインできてるやつ全員分 ロール定義・権限付与」）
//   ・人＝今の社内システムにログインできる全員（名前・メールは毎回そこから読む＝ここには保存しない）
//   ・組織（部署→チーム）・役職・ロール・個別の段階は、今の社内システムの v2-settings に置いて全員で共有（10-25〜）。
//     保存できるのは全体管理者（super_admin）だけ。この端末の localStorage は控え（ログインしていない・読めないときはこれで動く）。JSON で書き出し／読み込みも残す
//   ・今の社内システムのロール（staff など）は参考に出すだけ。変えない
import { LEVELS, ROLES, type Level, type Member } from './access';
import { K_NONE, KUBUN, cleanPages, kMax, toKPerms, type KPerms } from './kubun';
import { ALL_CAN, CAN_KEYS, NO_CAN, fixCan, orCan, type RoleCanRow } from './role-can';

/** can＝名前の小窓で見られるもの（チャット・要約・基本情報・単価額面。10-26 権限管理の表をやめてここへ） */
/** pages＝区分は見ないのまま「見る」で開ける画面（左メニューの href・10-27 lib/kubun.ts pageGranted） */
export type OrgRole = { id: string; label: string; perms: KPerms; manageAccess: boolean; can?: Partial<RoleCanRow>; pages?: string[] };
/** 部署（parent=null）とチーム（parent=部署の id）。並びは配列の順。headId は長。
 *  own・manageAccess＝その組織に付けた権限（10-26 shoya「組織ごとに権限付与したい」・「ロールと役職」の画面で付ける）。
 *  中の人全員に付く（部署に付けた分はチームの人にも付く） */
export type Unit = { id: string; name: string; parent: string | null; headId?: string; own?: Partial<KPerms>; manageAccess?: boolean; can?: Partial<RoleCanRow>; pages?: string[] };
export type Title = { id: string; label: string };
/** 人ごとに持つのはこれだけ（キーは今のシステムの userId） */
export type Assign = { unit?: string; title?: string; role?: string; own?: Partial<KPerms> };
export type OrgState = { v: 1; units: Unit[]; titles: Title[]; roles: OrgRole[]; people: Record<string, Assign> };

/** 画面に並べる人（今のシステムから読む・保存しない） */
export type OrgPerson = { userId: string; name: string; email: string; legacyRole: string; mikeiken: boolean; retired: boolean; isSelf?: boolean };

/** 会社のメール＝内勤、それ以外＝要員（要員はシステムに入れない・lib/innai.ts） */
export { INNAI_DOMAIN, personKind } from './innai';

export const ORG_STORAGE_KEY = 'v2_org';
export const NO_ROLE = 'none';
export const levelLabel = (l: Level) => LEVELS.find((x) => x.key === l)!.label;

export const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function initialOrg(): OrgState {
  return {
    v: 1,
    // 初めは lib/access.ts の ROLES を写す（ロールなし は消せない）
    roles: (Object.keys(ROLES) as (keyof typeof ROLES)[]).map((k) => ({ id: k, label: ROLES[k].label, perms: { ...ROLES[k].perms }, manageAccess: ROLES[k].manageAccess, can: defaultRoleCan(k) })),
    units: [
      { id: 'u_mikeiken', name: '未経験事業部', parent: null },
      { id: 'u_saiyou', name: '採用チーム', parent: 'u_mikeiken' },
      { id: 'u_eigyo', name: '営業チーム', parent: 'u_mikeiken' },
      { id: 'u_kanri', name: '管理部', parent: null },
    ],
    titles: [
      { id: 't_bucho', label: '部長' },
      { id: 't_leader', label: 'リーダー' },
      { id: 't_member', label: 'メンバー' },
    ],
    people: {},
  };
}

/** 読み込んだ JSON を確かめて形をそろえる（だめなら null） */
export function parseOrg(raw: unknown): OrgState | null {
  const o = raw as Partial<OrgState> | null;
  if (!o || o.v !== 1 || !Array.isArray(o.units) || !Array.isArray(o.titles) || !Array.isArray(o.roles) || typeof o.people !== 'object' || !o.people) return null;
  // 段階は区分の形にそろえる（10-26 より前に保存した4分類 人事/労務/営業/経理 の値は、その分類の画面が入っている区分に開く・lib/kubun.ts toKPerms）
  // 名前の小窓（can）が無いのは 10-26 より前に保存したロール＝初めのロールは初めの値・作ったロールは何も見ない
  const roles = o.roles.filter((r) => r && typeof r.id === 'string' && typeof r.label === 'string' && r.perms)
    .map((r) => ({ ...r, perms: kMax(K_NONE, toKPerms(r.perms)), can: r.can && typeof r.can === 'object' ? r.can : defaultRoleCan(r.id), pages: cleanPages(r.pages) }));
  if (!roles.some((r) => r.id === NO_ROLE)) roles.push({ id: NO_ROLE, label: ROLES.none.label, perms: { ...ROLES.none.perms }, manageAccess: false, can: {}, pages: [] });
  const units = o.units.filter((u) => u && typeof u.id === 'string').map((u) => ({ ...(u.own ? { ...u, own: toKPerms(u.own) } : u), pages: cleanPages(u.pages) }));
  const people = Object.fromEntries(Object.entries(o.people as Record<string, Assign>).map(([k, a]) => [k, a && a.own ? { ...a, own: toKPerms(a.own) } : a]));
  return { v: 1, units, titles: o.titles.filter((t) => t && typeof t.id === 'string'), roles, people };
}

export function loadOrg(): OrgState {
  try { const s = localStorage.getItem(ORG_STORAGE_KEY); if (s) return parseOrg(JSON.parse(s)) ?? initialOrg(); } catch { /* noop */ }
  return initialOrg();
}
export function saveOrg(s: OrgState): boolean {
  try { localStorage.setItem(ORG_STORAGE_KEY, JSON.stringify(s)); return true; } catch { return false; }
}

// ---- 全員で共有する設定（v2-settings・10-25）。/api/live/v2-settings が今の社内システムに読み書きする ----
export const V2_SETTING_KEYS = ['org', 'members', 'roleCan', 'goals'] as const;
export type V2SettingKey = (typeof V2_SETTING_KEYS)[number];
/** 目標（10-27）。eigyoCount＝担当営業（日報②の担当の名前）ごとの毎月の成約数の目標。0 や無い担当は目標なし */
export type Goals = { eigyoCount?: Record<string, number> };
export type V2Settings = { org?: unknown; members?: Member[]; roleCan?: unknown; goals?: Goals; updatedAt?: string; updatedBy?: string };
/** 共有の状態。sample＝ログインしていない（この端末だけ）／missing＝今のシステムに置き場がまだ無い */
export type SharedState = 'loading' | 'live' | 'sample' | 'missing' | 'error';
export type SharedLoad = { state: SharedState; value: V2Settings | null; canSave: boolean; error?: string };

export async function loadShared(): Promise<SharedLoad> {
  try {
    const r = await fetch('/api/live/v2-settings', { cache: 'no-store' });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; value?: V2Settings | null; canSave?: boolean; missing?: boolean; error?: string };
    if (r.status === 401 && j.error === 'not_logged_in') return { state: 'sample', value: null, canSave: false };
    if (!r.ok) return { state: 'error', value: null, canSave: false, error: j.error || `読めませんでした（${r.status}）` };
    if (j.missing) return { state: 'missing', value: null, canSave: false };
    return { state: 'live', value: j.value ?? null, canSave: !!j.canSave };
  } catch (e) { return { state: 'error', value: null, canSave: false, error: (e as Error).message }; }
}

/** key の分だけ全員の設定に保存（super_admin だけ。だめなら error に理由） */
export async function saveShared(key: V2SettingKey, value: unknown): Promise<{ ok: boolean; error?: string; status: number }> {
  try {
    const r = await fetch('/api/live/v2-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return r.ok && j.ok ? { ok: true, status: r.status } : { ok: false, error: j.error || `保存できませんでした（${r.status}）`, status: r.status };
  } catch (e) { return { ok: false, error: (e as Error).message, status: 0 }; }
}
export const SAVED_SHARED = '保存しました（全員に効きます）';

export const roleOf = (s: OrgState, a?: Assign) => s.roles.find((r) => r.id === (a?.role ?? NO_ROLE)) ?? s.roles.find((r) => r.id === NO_ROLE)!;

/** その人が入っている組織（チームなら 部署→チーム の順）。未所属なら空 */
export function unitChain(s: OrgState, unitId?: string): Unit[] {
  const u = s.units.find((x) => x.id === unitId);
  if (!u) return [];
  const p = u.parent ? s.units.find((x) => x.id === u.parent) : undefined;
  return p ? [p, u] : [u];
}
/** 組織そのものに付けた段階 */
export function unitOwnPerms(u: Unit): KPerms {
  return kMax(K_NONE, u.own ?? {});
}
/** 所属から付く段階（部署とチームの高いほう） */
export function unitPerms(s: OrgState, unitId?: string): KPerms {
  return unitChain(s, unitId).map(unitOwnPerms).reduce((acc, p) => kMax(acc, p), K_NONE);
}

/** その人の区分ごとの段階＝ロール・個別・所属（部署とチーム）の一番高いもの */
export function orgPerms(s: OrgState, a?: Assign): KPerms {
  return kMax(kMax(roleOf(s, a).perms, a?.own ?? {}), unitPerms(s, a?.unit));
}
/** 「見るだけ」で開ける画面＝ロールと所属（部署・チーム）に付いた分を合わせたもの */
export function orgPages(s: OrgState, a?: Assign): string[] {
  return [...new Set([...(roleOf(s, a).pages ?? []), ...unitChain(s, a?.unit).flatMap((u) => u.pages ?? [])])];
}
/** 組織表でその人に何か付いているか（ロール・個別・所属のどれか）。付いていなければ組織表では決めない */
export const orgAssigned = (s: OrgState, a?: Assign) => !!a && (!!(a.role && a.role !== NO_ROLE) || !!(a.unit && s.units.some((u) => u.id === a.unit)) || Object.values(a.own ?? {}).some((l) => l && l !== 'none'));
/** 組織表でこのシステムに入れる人か＝ロール・個別・所属（部署とチーム）のどれかで、どこかの区分に「見る」以上か権限管理が付いている（10-26 shoya「組織表でロールを割り振った内勤だけ」） */
export const orgGrants = (s: OrgState, a?: Assign) => orgAssigned(s, a) && (Object.values(orgPerms(s, a)).some((l) => l && l !== 'none') || orgManage(s, a) || orgPages(s, a).length > 0);
export { KUBUN };
/** 権限管理ができるか＝本人のロールか、所属の組織のロールで持っている */
/** 初めのロールの名前の小窓（全体管理者・管理者・全体を見る＝全部／ロールなし・作ったロール＝なし） */
export function defaultRoleCan(id: string): RoleCanRow {
  return id === 'owner' || id === 'manager' || id === 'viewer_all' ? { ...ALL_CAN } : { ...NO_CAN };
}
/** その人が名前の小窓で見られるもの＝ロールと所属（部署・チーム）のどれかで付いていれば見られる */
export function orgCan(s: OrgState, a?: Assign): RoleCanRow {
  return fixCan([roleOf(s, a).can, ...unitChain(s, a?.unit).map((u) => u.can)].reduce<RoleCanRow>((acc, c) => orCan(acc, c), { ...NO_CAN }));
}
export { CAN_KEYS };
export function orgManage(s: OrgState, a?: Assign): boolean {
  return roleOf(s, a).manageAccess || unitChain(s, a?.unit).some((u) => !!u.manageAccess);
}

/** 部署の中のチーム id もふくめた集合（部署で絞るとき用） */
export function unitAndChildren(s: OrgState, id: string): Set<string> {
  return new Set([id, ...s.units.filter((u) => u.parent === id).map((u) => u.id)]);
}
export function unitPath(s: OrgState, id?: string): string {
  const u = s.units.find((x) => x.id === id);
  if (!u) return '未所属';
  const p = u.parent ? s.units.find((x) => x.id === u.parent) : null;
  return p ? `${p.name} / ${u.name}` : u.name;
}

/** 配列の中で from を to の前に動かす（ドラッグの並び替え） */
export function moveBefore<T extends { id: string }>(xs: T[], from: string, to: string): T[] {
  if (from === to) return xs;
  const item = xs.find((x) => x.id === from);
  if (!item) return xs;
  const rest = xs.filter((x) => x.id !== from);
  const i = rest.findIndex((x) => x.id === to);
  rest.splice(i < 0 ? rest.length : i, 0, item);
  return rest;
}

/** 今のシステムのロール名を日本語で（参考表示だけ） */
export const LEGACY_ROLE_LABEL: Record<string, string> = {
  super_admin: '全体管理者', admin: '管理者', sales_admin: '営業管理', staff: 'スタッフ', staff_recruit: '採用スタッフ',
  list_viewer: 'リスト閲覧', applicant_support: '応募者サポート', kanawest_sales: '関西営業', retired: '退職',
};
export const legacyRoleLabel = (r: string) => LEGACY_ROLE_LABEL[r] ?? r;

/** 今のシステムの admin?action=list の形 */
export type AdminListRow = { userId: string; email: string; name: string; role: string; customRole?: string | null; jimuRole?: string | null; mikeiken?: boolean; inDomain: boolean; isSelf: boolean; isTopAdmin: boolean };
export type AdminList = { rows: AdminListRow[]; roles: string[]; customRoles: { key: string; label: string; base_role: string }[] };

export function peopleFromAdmin(d: AdminList | null): OrgPerson[] {
  return (d?.rows ?? []).map((r) => ({
    userId: r.userId, name: r.name || r.email.split('@')[0], email: r.email,
    legacyRole: r.role, mikeiken: !!r.mikeiken, retired: r.role === 'retired', isSelf: r.isSelf,
  }));
}
