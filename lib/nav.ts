import type { ModuleKey } from './theme';

// 左メニュー。4つの分類（色を持つ）＋ 連絡・設定。
//   built=false の画面は「これから作る」ページに落ちる（ver2 は全部そろってから本番に出す）。
export type NavItem = { href: string; label: string; built?: boolean };
// 件数のバッジは、本物の件数がつながるまで出さない（10-25 見た目の整理：見本の数字だったため）。メニューの名前は短く（説明のかっこは付けない）
export type NavGroup = { module: ModuleKey; label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    module: 'jinji', label: '人事管理', items: [
      { href: '/home/jinji', label: 'ホーム人事', built: true },
      { href: '/jinji/staff', label: '社員一覧', built: true },
      { href: '/jinji/yoyaku', label: '変更の予約', built: true },
      { href: '/jinji/today', label: '当日の出勤状況', built: true }, // 労務から人事へ（10-27 shoya）。出勤の記録・欠勤管理・3D の出勤ボードはこの画面のタブ
      { href: '/jinji/shift', label: 'シフト表', built: true }, // 労務から人事へ（10-27 shoya）。提出状況・当月の実績はタブ
      { href: '/jinji/nyusha', label: '入社手続き', built: true },
      { href: '/jinji/jimu', label: '参画決定者の手続き', built: true },
      { href: '/jinji/shikaku', label: '資格手当', built: true },
      { href: '/jinji/sankyu', label: '産休・育休', built: true },
      { href: '/jinji/rishoku', label: '離職リスク・離職率', built: true },
      { href: '/jinji/community', label: 'コミュニティ', built: true },
      { href: '/jinji/bdsh', label: 'bdsh', built: true }, // それゆけ未経験の bdsh（教育コンテンツの内勤画面）を開く（10-26 shoya「それゆけで押した時と同じ感じで」）
      { href: '/jinji/saiyou', label: '採用', built: true },
      { href: '/jinji/ocr', label: '身分証の読み取り', built: true },
      { href: '/jinji/ippass', label: '媒体アイパス管理', built: true }, // 保留から人事へ（10-26 shoya）。開ける人は今のシステムの ippass と同じ（lib/horyu-access.ts）
    ],
  },
  {
    module: 'roumu', label: '労務/営業管理', items: [
      { href: '/roumu/overtime', label: '残業・36協定・有給', built: true },
      { href: '/roumu/shime', label: '勤怠の締め', built: true },
      { href: '/roumu/contracts', label: '派遣契約', built: true },
      { href: '/roumu/alerts', label: 'アラート設定', built: true },
      { href: '/roumu/kb', label: '労務法務ナレッジ', built: true },
    ],
  },
  {
    module: 'eigyo', label: '営業', items: [
      { href: '/home/eigyo', label: 'ホーム営業', built: true },
      { href: '/eigyo/cases', label: '案件', built: true },
      { href: '/eigyo/progress', label: '案件進捗', built: true }, // 単独のまま。作り込み（カスタム）はあとで詰める（10-23 shoya）
      { href: '/eigyo/mendan', label: '面談管理', built: true }, // 今の面談管理（カンバン・カレンダーにも書く・10-25）
      { href: '/eigyo/availability', label: '面談可能日の承認', built: true },
      { href: '/eigyo/keisai', label: '案件掲載・応募', built: true }, // 掲載する／応募管理／案件ページの反応 をタブで
      { href: '/eigyo/proper', label: '要員リスト', built: true },
      { href: '/eigyo/sales-list', label: '営業リスト一覧', built: true }, // 今の sales.html（読むだけ・10-25）
      { href: '/eigyo/skillsheet', label: 'スキルシート作成', built: true },
      { href: '/eigyo/haken', label: '派遣契約', built: true }, // 労務の派遣契約と同じ画面（10-25 shoya「同じもの営業にいれたい」）
      { href: '/eigyo/taiki', label: '待機・再アサイン', built: true },
      { href: '/eigyo/nippo', label: '成約日報', built: true },
      { href: '/eigyo/map', label: '案件・要員マップ', built: true },
      { href: '/eigyo/pl', label: '売上・粗利', built: true },
    ],
  },
  {
    module: 'keiri', label: '経理管理', items: [
      { href: '/keiri/approval', label: '申請の承認', built: true }, // 労務から経理へ（10-27 shoya）
      { href: '/keiri/keihi', label: '交通費・経費', built: true },
      { href: '/keiri/check', label: '交通費チェック', built: true },
      { href: '/keiri/kintai-shogo', label: '勤怠の照合', built: true }, // 上位から届いた勤務表 × freee を要員ごと・日ごとに（読むだけ・締めは労務の勤怠の締め・10-26）
      { href: '/keiri/seikyu', label: '請求書', built: true },
      { href: '/keiri/seikyu-zukuri', label: '請求書づくり', built: true }, // 今の画面をそのまま（app/ik・データは今のシステム）
      { href: '/keiri/seikyu-make', label: '請求書作成', built: true },
      { href: '/keiri/kakunou', label: '請求書・勤務表の格納', built: true }, // 今の請求書作成の「格納」タブ（10-25）
      { href: '/keiri/chingin', label: '想定賃金・粗利', built: true },
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
  { href: '/settings/same-name', label: '同姓同名をつなぐ', built: true }, // 名簿の行・基本情報の回答がどの応募の人か（応募ID・全体管理者だけ・10-25）
  { href: '/settings/cutover', label: '本番切り替えの突き合わせ', built: true }, // 今と ver2 の数が同じか（10-25）
];

// 保留（あとで決める）＝今の社内システムにあった画面を「とりあえず全部」写したもの（10-25 shoya）。
//   いつもの4分類には入れず、左の4分類の下に別の見出しで出す。どこに置くか・残すかは shoya があとで決める。
//   ★各担当はこの配列に項目を足すだけ（描くのは components/Shell.tsx）。ページは app/(app)/horyu/<name>
export const NAV_HORYU: NavItem[] = [
  { href: '/horyu/dashboard', label: 'ダッシュボード', built: true },
  { href: '/horyu/nyuujou', label: '入場日カレンダー', built: true },
  { href: '/horyu/shoudaku', label: '承諾者ストーリー', built: true },
  { href: '/horyu/narratives', label: '決着ナラティブ', built: true },
  { href: '/horyu/cohort', label: '承諾者の月別・段階', built: true },
  { href: '/horyu/richmenu', label: 'リッチメニューの反応', built: true },
  { href: '/horyu/bot-ab', label: 'botのモデル比較', built: true },
  { href: '/horyu/my-activity', label: '自分の行動', built: true },
  { href: '/horyu/office', label: '内勤の今日の画面', built: true },
  { href: '/horyu/links', label: 'LINEの紐付け管理', built: true },
  { href: '/horyu/dropout', label: 'dropout した人', built: true },
  { href: '/horyu/orphans', label: '営業リスト外グループ', built: true },
  { href: '/horyu/freee', label: 'freee 請求書', built: true },
  { href: '/horyu/keiyaku', label: '契約報告の雛形', built: true },
  { href: '/horyu/arari', label: '粗利試算', built: true },
  { href: '/horyu/bikkura', label: 'たまげたポン 管理', built: true },
  { href: '/horyu/kashitsuke', label: '貸付管理', built: true },
  { href: '/horyu/page-access', label: 'ロール別ページ表示', built: true },
  { href: '/horyu/ops-log', label: '操作ログ', built: true },
  { href: '/horyu/access-log', label: 'アクセス元IP', built: true },
  { href: '/horyu/custom-pages', label: 'カスタムページ', built: true },
  { href: '/horyu/calendar', label: 'カレンダー設定', built: true },
  { href: '/horyu/settings-center', label: '設定センター', built: true },
  { href: '/horyu/youin-map', label: '要員マップ', built: true },
  { href: '/horyu/case-input', label: '案件の抽出・修正', built: true },
  { href: '/horyu/kadohyo', label: '稼働表出力', built: true },
  { href: '/horyu/client-links', label: '客先向けリンク', built: true },
  { href: '/horyu/client', label: '客先向けの画面', built: true },
  { href: '/horyu/juchu', label: '案件受注', built: true },
];

export function findNav(pathname: string): { group?: NavGroup; item?: NavItem } {
  for (const g of NAV) for (const it of g.items) if (pathname === it.href || pathname.startsWith(it.href + '/')) return { group: g, item: it };
  for (const it of NAV_HORYU) if (pathname === it.href || pathname.startsWith(it.href + '/')) return { item: it };
  for (const it of [...NAV_EXTRA, ...NAV_KANRI]) if (pathname === it.href || pathname.startsWith(it.href + '/')) return { item: it };
  return {};
}
