import type { ModuleKey } from './theme';

// 左メニュー。4つの分類（色を持つ）＋ 連絡・設定。
//   built=false の画面は「これから作る」ページに落ちる（ver2 は全部そろってから本番に出す）。
export type NavItem = { href: string; label: string; built?: boolean; badge?: number };
export type NavGroup = { module: ModuleKey; label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    module: 'jinji', label: '人事管理', items: [
      { href: '/home/jinji', label: 'ホーム人事', built: true },
      { href: '/jinji/staff', label: '社員一覧', built: true },
      { href: '/jinji/yoyaku', label: '変更の予約', built: true, badge: 2 },
      { href: '/jinji/nyusha', label: '入社手続き', built: true, badge: 17 },
      { href: '/jinji/jimu', label: '参画決定者の手続き', built: true, badge: 5 },
      { href: '/jinji/shikaku', label: '資格手当', built: true, badge: 6 },
      { href: '/jinji/sankyu', label: '産休・育休', built: true, badge: 3 },
      { href: '/jinji/rishoku', label: '離職リスク・離職率', built: true, badge: 5 },
      { href: '/jinji/community', label: 'コミュニティ', built: true, badge: 2 },
      { href: '/jinji/saiyou', label: '採用（承諾者・面談）', built: true, badge: 4 },
      { href: '/jinji/ocr', label: '身分証の読み取り（保留）', built: true },
    ],
  },
  {
    module: 'roumu', label: '労務/営業管理', items: [
      { href: '/roumu/today', label: '当日の出勤状況', built: true, badge: 4 },
      { href: '/roumu/approval', label: '申請の承認', built: true, badge: 7 },
      { href: '/roumu/overtime', label: '残業・36協定・有給', built: true, badge: 1 },
      { href: '/roumu/shime', label: '勤怠の締め', built: true, badge: 7 },
      { href: '/roumu/shift', label: 'シフト表', built: true, badge: 3 },
      { href: '/roumu/kekkin', label: '欠勤管理', built: true, badge: 4 },
      { href: '/roumu/contracts', label: '派遣契約', built: true, badge: 3 },
      { href: '/roumu/timesheet', label: '勤務表の届き具合', built: true, badge: 4 },
      { href: '/roumu/alerts', label: 'アラート設定', built: true },
      { href: '/roumu/kb', label: '労務法務ナレッジ', built: true },
    ],
  },
  {
    module: 'eigyo', label: '営業', items: [
      { href: '/home/eigyo', label: 'ホーム営業', built: true },
      { href: '/eigyo/cases', label: '案件', built: true, badge: 6 },
      { href: '/eigyo/progress', label: '案件進捗', built: true, badge: 4 }, // 単独のまま。作り込み（カスタム）はあとで詰める（10-23 shoya）
      { href: '/eigyo/proper', label: '要員リスト（プロパー・スキシ）', built: true },
      { href: '/eigyo/skillsheet', label: 'スキルシート作成', built: true },
      { href: '/eigyo/haken', label: '派遣契約', built: true, badge: 3 }, // 労務の派遣契約と同じ画面（10-25 shoya「同じもの営業にいれたい」）
      { href: '/eigyo/taiki', label: '待機・再アサイン', built: true, badge: 7 },
      { href: '/eigyo/nippo', label: '成約日報', built: true, badge: 1 },
      { href: '/eigyo/map', label: '案件・要員マップ', built: true },
      { href: '/eigyo/pl', label: '売上・粗利', built: true, badge: 2 },
    ],
  },
  {
    module: 'keiri', label: '経理管理', items: [
      { href: '/keiri/keihi', label: '交通費・経費', built: true, badge: 9 },
      { href: '/keiri/check', label: '交通費チェック', built: true, badge: 7 },
      { href: '/keiri/seikyu', label: '請求書', built: true, badge: 18 },
      { href: '/keiri/seikyu-zukuri', label: '請求書づくり', built: true }, // 今の画面をそのまま（app/ik・データは今のシステム）
      { href: '/keiri/seikyu-make', label: '請求書作成', built: true },
      { href: '/keiri/kakunou', label: '請求書・勤務表の格納', built: true }, // 今の請求書作成の「格納」タブ（10-25）
      { href: '/keiri/chingin', label: '想定賃金・粗利', built: true, badge: 5 },
    ],
  },
];

// 連絡（チャット・配信・手動配信）は各画面の右上「連絡」から開く（人事＝インフォメーション、それ以外＝あおい）。
export const NAV_EXTRA: NavItem[] = [
  { href: '/settings', label: '設定', built: true },
];

// 管理（左の一番下・権限管理を持つ人だけ）。組織表は人事ではなくここ（10-25 shoya）
export const NAV_KANRI: NavItem[] = [
  { href: '/settings/org', label: '組織表', built: true }, // 組織・ロール・権限付与（この端末に保存・10-25）
  { href: '/settings/access', label: '権限管理', built: true },
  { href: '/settings/view-log', label: '閲覧ログ', built: true }, // だれが、だれのチャット・基本情報・面談メモ・要約を見たか（super_admin だけ・10-25）
  { href: '/settings/cutover', label: '本番切り替えの突き合わせ', built: true }, // 今と ver2 の数が同じか（10-25）
];

// 保留（あとで決める）。今の社内システムにあった画面を全部入れたが、本採用かはあとで決める（10-25 shoya）。
//   見られるかは今のシステムが決める（権限が無ければ開いても何も出さない）
export const NAV_HORYU: NavItem[] = [
  { href: '/horyu/freee', label: 'freee 請求書', built: true },
  { href: '/horyu/keiyaku', label: '契約報告の雛形', built: true },
  { href: '/horyu/arari', label: '粗利試算', built: true },
  { href: '/horyu/bikkura', label: 'たまげたポン 管理', built: true },
  { href: '/horyu/kashitsuke', label: '貸付管理', built: true },
  { href: '/horyu/ippass', label: 'アイパス管理', built: true },
  { href: '/horyu/page-access', label: 'ロール別ページ表示', built: true },
  { href: '/horyu/ops-log', label: '操作ログ', built: true },
  { href: '/horyu/access-log', label: 'アクセス元IP', built: true },
  { href: '/horyu/custom-pages', label: 'カスタムページ', built: true },
  { href: '/horyu/calendar', label: 'カレンダー設定', built: true },
  { href: '/horyu/settings-center', label: '設定センター', built: true },
];

export function findNav(pathname: string): { group?: NavGroup; item?: NavItem } {
  for (const g of NAV) for (const it of g.items) if (pathname === it.href || pathname.startsWith(it.href + '/')) return { group: g, item: it };
  for (const it of [...NAV_EXTRA, ...NAV_KANRI]) if (pathname === it.href || pathname.startsWith(it.href + '/')) return { item: it };
  return {};
}
