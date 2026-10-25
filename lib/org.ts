// 組織表（ver2 の中だけ・10-25 shoya「組織表も作りたい 一旦手打ちする ログインできてるやつ全員分 ロール定義・権限付与」）
//   ・人＝今の社内システムにログインできる全員（名前・メールは毎回そこから読む＝ここには保存しない）
//   ・組織（部署→チーム）・役職・ロール・個別の段階を、この端末の localStorage に自動保存。JSON で書き出し／読み込み
//   ・今の社内システムのロール（staff など）は参考に出すだけ。変えない
//   ・DB に置く（みんなで共有）のは shoya の承認後
import { LEVELS, ROLES, type Level, type Perms } from './access';
import { MODULES } from './theme';

export type OrgRole = { id: string; label: string; perms: Perms; manageAccess: boolean };
/** 部署（parent=null）とチーム（parent=部署の id）。並びは配列の順。headId は長。 */
export type Unit = { id: string; name: string; parent: string | null; headId?: string };
export type Title = { id: string; label: string };
/** 人ごとに持つのはこれだけ（キーは今のシステムの userId） */
export type Assign = { unit?: string; title?: string; role?: string; own?: Partial<Perms> };
export type OrgState = { v: 1; units: Unit[]; titles: Title[]; roles: OrgRole[]; people: Record<string, Assign> };

/** 画面に並べる人（今のシステムから読む・保存しない） */
export type OrgPerson = { userId: string; name: string; email: string; legacyRole: string; mikeiken: boolean; retired: boolean; isSelf?: boolean };

export const ORG_STORAGE_KEY = 'v2_org';
export const NO_ROLE = 'none';
const RANK: Record<Level, number> = { none: 0, view: 1, edit: 2, approve: 3 };
const hi = (a: Level, b: Level): Level => (RANK[a] >= RANK[b] ? a : b);
export const levelLabel = (l: Level) => LEVELS.find((x) => x.key === l)!.label;

export const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function initialOrg(): OrgState {
  return {
    v: 1,
    // 初めは lib/access.ts の ROLES を写す（ロールなし は消せない）
    roles: (Object.keys(ROLES) as (keyof typeof ROLES)[]).map((k) => ({ id: k, label: ROLES[k].label, perms: { ...ROLES[k].perms }, manageAccess: ROLES[k].manageAccess })),
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
  const roles = o.roles.filter((r) => r && typeof r.id === 'string' && typeof r.label === 'string' && r.perms);
  if (!roles.some((r) => r.id === NO_ROLE)) roles.push({ id: NO_ROLE, label: ROLES.none.label, perms: { ...ROLES.none.perms }, manageAccess: false });
  return { v: 1, units: o.units.filter((u) => u && typeof u.id === 'string'), titles: o.titles.filter((t) => t && typeof t.id === 'string'), roles, people: o.people };
}

export function loadOrg(): OrgState {
  try { const s = localStorage.getItem(ORG_STORAGE_KEY); if (s) return parseOrg(JSON.parse(s)) ?? initialOrg(); } catch { /* noop */ }
  return initialOrg();
}
export function saveOrg(s: OrgState): boolean {
  try { localStorage.setItem(ORG_STORAGE_KEY, JSON.stringify(s)); return true; } catch { return false; }
}

export const roleOf = (s: OrgState, a?: Assign) => s.roles.find((r) => r.id === (a?.role ?? NO_ROLE)) ?? s.roles.find((r) => r.id === NO_ROLE)!;

/** その人の分類ごとの段階＝ロールの段階と個別に付けた段階の高いほう（effectivePerms と同じ考え方） */
export function orgPerms(s: OrgState, a?: Assign): Perms {
  const r = roleOf(s, a).perms;
  const own = a?.own ?? {};
  return Object.fromEntries(MODULES.map((m) => [m.key, hi(r[m.key], own[m.key] ?? 'none')])) as Perms;
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
