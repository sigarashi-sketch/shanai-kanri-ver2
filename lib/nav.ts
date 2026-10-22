import type { ModuleKey } from './theme';

// 左メニュー。4つの分類（色を持つ）＋ 連絡・設定。
//   built=false の画面は「これから作る」ページに落ちる（ver2 は全部そろってから本番に出す）。
export type NavItem = { href: string; label: string; built?: boolean; badge?: number };
export type NavGroup = { module: ModuleKey; label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    module: 'jinji', label: '人事管理', items: [
      { href: '/jinji/staff', label: '社員一覧', built: true },
      { href: '/jinji/yoyaku', label: '変更の予約', badge: 5 },
      { href: '/jinji/nyusha', label: '入社手続き', badge: 17 },
      { href: '/jinji/kihon', label: '基本情報' },
      { href: '/jinji/jimu', label: '参画決定者の手続き' },
      { href: '/jinji/tenseki', label: '転籍台帳' },
      { href: '/jinji/shikaku', label: '資格手当' },
      { href: '/jinji/sankyu', label: '産休・育休' },
      { href: '/jinji/rishoku', label: '離職リスク・離職率' },
      { href: '/jinji/community', label: 'コミュニティ' },
      { href: '/jinji/saiyou', label: '採用（承諾者・面談）' },
      { href: '/jinji/ocr', label: '身分証の読み取り（保留）' },
    ],
  },
  {
    module: 'roumu', label: '労務/営業管理', items: [
      { href: '/roumu/today', label: '当日の出勤状況', badge: 12 },
      { href: '/roumu/approval', label: '申請の承認', badge: 8 },
      { href: '/roumu/overtime', label: '残業・36協定・有給' },
      { href: '/roumu/shime', label: '勤怠の締め' },
      { href: '/roumu/shift', label: 'シフト表' },
      { href: '/roumu/kekkin', label: '欠勤管理' },
      { href: '/roumu/contracts', label: '現場・契約', badge: 4 },
      { href: '/roumu/timesheet', label: '勤務表の届き具合' },
      { href: '/roumu/alerts', label: 'アラート設定' },
      { href: '/roumu/kb', label: '労務法務ナレッジ' },
    ],
  },
  {
    module: 'eigyo', label: '営業', items: [
      { href: '/eigyo/cases', label: '案件' },
      { href: '/eigyo/progress', label: '案件進捗' }, // 単独のまま。作り込み（カスタム）はあとで詰める（10-23 shoya）
      { href: '/eigyo/proper', label: '要員リスト（プロパー・スキシ）', built: true },
      { href: '/eigyo/taiki', label: '待機・再アサイン' },
      { href: '/eigyo/nippo', label: '成約日報' },
      { href: '/eigyo/map', label: '案件・要員マップ' },
      { href: '/eigyo/pl', label: '売上・粗利' },
    ],
  },
  {
    module: 'keiri', label: '経理管理', items: [
      { href: '/keiri/keihi', label: '交通費・経費', badge: 9 },
      { href: '/keiri/check', label: '交通費チェック' },
      { href: '/keiri/seikyu', label: '請求書', badge: 18 },
      { href: '/keiri/chingin', label: '想定賃金・粗利' },
    ],
  },
];

// 連絡（チャット・配信・手動配信）は各画面の右上「連絡」から開く（人事＝インフォメーション、それ以外＝あおい）。
export const NAV_EXTRA: NavItem[] = [
  { href: '/settings', label: '設定', built: true },
];

export function findNav(pathname: string): { group?: NavGroup; item?: NavItem } {
  for (const g of NAV) for (const it of g.items) if (pathname === it.href || pathname.startsWith(it.href + '/')) return { group: g, item: it };
  for (const it of NAV_EXTRA) if (pathname === it.href || pathname.startsWith(it.href + '/')) return { item: it };
  return {};
}
