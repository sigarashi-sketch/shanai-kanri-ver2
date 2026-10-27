// それゆけ未経験の権限（2026-10-01 shoya「権限ロール入れて。ページの表示/非表示を設定できるように。いじれるのは admin と super admin だけ」）
//   super_admin … 全部見える・権限の管理ができる（super admin の付け外しは super admin だけ）
//   admin       … 権限ページを使える（admin / manager の割り当てと、ページの表示/非表示）
//   manager     … 見えるページだけ使う
//   staff       … 内勤一般（2026-10-13 shoya「内勤一般は表示だけの権限・bdsh は見れる」）。見えるページを 見るだけ＝保存・送信は API の入口で止める（lib/api.ts apiUser・app/api/[...rest]）
//   ★ログインできるかどうかは従来どおり いけどんのロール（env ALLOWED_ROLES）で決まる。ここは「入れた人に何を見せるか」
//   ★割り当てが無い人は 内勤一般（staff）。2026-10-13 までは manager だった（shoya「坂田こころ以外は内勤一般」）
export type AppRole = 'super_admin' | 'admin' | 'manager' | 'staff';
export const APP_ROLES: AppRole[] = ['super_admin', 'admin', 'manager', 'staff'];
export const ROLE_LABEL: Record<AppRole, string> = { super_admin: 'super admin', admin: 'admin', manager: 'manager', staff: '内勤一般' };
// admin 以上か（設定を変える・金額を見る 等の線引き）。manager と 内勤一般 は false
export const isAdminUp = (r: AppRole) => r === 'super_admin' || r === 'admin';
// 表示/非表示を切り替えられるロール（super admin は いつも全部見える）
export const HIDE_ROLES = ['admin', 'manager', 'staff'] as const;
export type HideRole = (typeof HIDE_ROLES)[number];
// 内勤一般が 保存・送信しようとした時に返す文
export const READONLY_MSG = '内勤一般は 表示だけの権限です（保存・送信・変更はできません）。必要な時は admin に頼んでください。';
// 表示/非表示を切り替えられるページ（ホームは常に出す。権限ページは admin 以上に常に出す）
export const PAGES: { href: string; label: string }[] = [
  { href: '/roster', label: '従業員名簿' }, { href: '/community', label: 'コミュニティ' }, { href: '/teiki', label: '定期面談' },
  { href: '/shoudaku', label: '承諾者管理' }, { href: '/chat', label: 'チャット' }, { href: '/broadcast', label: '配信' },
  { href: '/proper', label: 'プロパーリスト' }, { href: '/survey', label: '月次アンケート' }, { href: '/events', label: 'イベント出欠' }, { href: '/enquete', label: 'アンケート作成' }, { href: '/kyouiku', label: 'bdsh' }, { href: '/richmenu', label: 'リッチメニュー' },
  { href: '/rishoku', label: '離職率' }, { href: '/shikaku', label: '資格手当申請' }, { href: '/shukkin', label: '出勤ボード' },
];
export const ACCESS_PAGE = '/access';
// 粗利・LTV（要員ごとの売上・粗利）。金額が入るので 切り替えの対象にしない＝admin 以上に常に出す・manager には出さない（2026-10-07 shoya「アドミンだけ」）
export const LTV_PAGE = '/ltv';
// 離職率（未経験の要員の区分別の離職率・2026-10-08 shoya「それゆけ未経験に欲しいデータ」）。2026-10-09 shoya「マネージャーも見れるようにしていいよ」＝ふつうのページと同じ（権限ページで表示/非表示を切り替えられる）
export const RISHOKU_PAGE = '/rishoku';
export interface AccessSettings { roles: Record<string, AppRole>; hidden: Record<HideRole, string[]> }
// 最初の割り当て（shoya 指定）。画面で保存すると saiyou.settings key='access' がこれに代わる
export const DEFAULT_ACCESS: AccessSettings = {
  roles: { 's.igarashi@engineer-mikata.com': 'super_admin', 'a.yoshimura@engineer-mikata.com': 'admin', 'k.sakata@engineer-mikata.com': 'manager' },
  hidden: { admin: [], manager: [], staff: [] },
};

export function roleOf(email: string, a: AccessSettings): AppRole { return a.roles[String(email || '').toLowerCase()] || 'staff'; }
export function canSee(role: AppRole, href: string, a: AccessSettings): boolean {
  if (href === '/') return true;
  if (href === ACCESS_PAGE || href === LTV_PAGE) return isAdminUp(role);
  if (role === 'super_admin') return true;
  return !a.hidden[role].includes(href);
}
export function cleanAccess(v: unknown): AccessSettings {
  const o = (v || {}) as Partial<AccessSettings>;
  const roles: Record<string, AppRole> = {};
  Object.entries(o.roles || {}).forEach(([e, r]) => { const k = e.trim().toLowerCase(); if (/^[^@\s]+@[^@\s]+$/.test(k) && APP_ROLES.includes(r as AppRole)) roles[k] = r as AppRole; });
  const ok = new Set(PAGES.map((p) => p.href));
  const hid = (xs: unknown) => (Array.isArray(xs) ? [...new Set(xs.map(String).filter((h) => ok.has(h)))] : []);
  // staff の欄が まだ無い設定（2026-10-13 より前に保存した分）は manager と同じページを見せる
  return { roles, hidden: { admin: hid(o.hidden?.admin), manager: hid(o.hidden?.manager), staff: hid(o.hidden?.staff ?? o.hidden?.manager) } };
}
