// 保留（/horyu）のメニューを、今の社内システムのページ権限（/api/auth?action=me の pageAccess）で出し分ける（10-26）。
//   ・左は ver2 の画面、右は今のシステムの台帳（api/_page_access.ts PAGES）の key。台帳に無い画面は誰にでも出す（今と同じ）
//   ・'super' は台帳に行が無く、今のシステムで super_admin だけが開ける画面（freee 請求書・bot のモデル比較）
//   ・画面そのものも今のシステムが 403 を返せば中身を出さない（ここはメニューの出し分けだけ）
export const HORYU_PAGE_KEY: Record<string, string> = {
  '/horyu/dashboard': 'dashboard',
  '/horyu/nyuujou': 'nyuujou',
  '/horyu/shoudaku': 'shoudaku',
  '/horyu/narratives': 'narratives',
  '/horyu/cohort': 'shoudaku',
  '/horyu/richmenu': 'richmenu-stats',
  '/horyu/bot-ab': 'super',
  '/horyu/office': 'office',
  '/horyu/links': 'links',
  '/horyu/dropout': 'dropout-list',
  '/horyu/orphans': 'orphans',
  '/horyu/freee': 'super',
  '/horyu/keiyaku': 'keiyaku-houkoku',
  '/horyu/arari': 'arari-sim',
  '/horyu/bikkura': 'bikkura-admin',
  '/horyu/kashitsuke': 'kashitsuke',
  '/horyu/ippass': 'ippass',
  '/horyu/page-access': 'page-access',
  '/horyu/ops-log': 'ops-log',
  '/horyu/access-log': 'access-log',
  '/horyu/calendar': 'calendar-settings',
  '/horyu/settings-center': 'settings',
  '/horyu/youin-map': 'map',
  '/horyu/case-input': 'case-admin',
  '/horyu/kadohyo': 'kadohyo',
  '/horyu/client-links': 'client-links',
  '/horyu/client': 'client-links',
  '/horyu/juchu': 'juchu',
};

export type PageAccess = { role: string; pageAccess: Record<string, boolean> };

/** その人に保留の画面を出してよいか。pa が無い（ログインしていない・読めない）ときは出す（中身は各画面が読めたときだけ） */
export function horyuVisible(href: string, pa: PageAccess | null): boolean {
  if (!pa) return true;
  const key = HORYU_PAGE_KEY[href];
  if (!key) return true;
  if (pa.role === 'super_admin') return true;
  if (key === 'super') return false;
  return pa.pageAccess[key] !== false;
}
