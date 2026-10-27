// 入れる人と権限（ver2 で作り直し・2026-10-22〜23 shoya）
//   ① 入れるのは未経験事業部の内勤だけ。それ以外は営業共有リスト（/shared）だけ … これは変えない
//   ② 内勤の中は 区分（＝左メニューの分類・lib/kubun.ts）ごとに「見る／直す／承認」の3段階
//      何も付いていない分類は「見ない」＝メニューにも出ない
//   ③ まとめて広く持てる「ロール」もある。その人の分類ごとの段階は「ロールの段階」と「個別に付けた段階」の高いほう
//   ④ 権限管理（誰に何を付けるか）を触れるのは、それを持つロールの人だけ
import type { ModuleKey } from './theme';
import { K_NONE, kAll, kMax, toKPerms, type KPerms } from './kubun';

export type Level = 'none' | 'view' | 'edit' | 'approve';
export const LEVELS: { key: Level; label: string; hint: string }[] = [
  { key: 'none', label: '見ない', hint: 'メニューにも出ない' },
  { key: 'view', label: '見る', hint: '一覧と中身を見られる' },
  { key: 'edit', label: '直す', hint: '入力・変更・予約ができる' },
  { key: 'approve', label: '承認', hint: '申請の承認・差し戻しもできる' },
];
const RANK: Record<Level, number> = { none: 0, view: 1, edit: 2, approve: 3 };
export const atLeast = (l: Level, need: Level) => RANK[l] >= RANK[need];

/** 分類ごとの段階（メニューの見出しと、画面の外で使う can(分類)）。区分＝左メニューの分類なので そのまま（10-27） */
export type Perms = Record<ModuleKey, Level>;
export function modulePerms(k: KPerms): Perms {
  return { jinji: k.jinji, roumu: k.roumu, eigyo: k.eigyo, keiri: k.keiri, jinzai: k.jinzai };
}

export type RoleKey = 'owner' | 'manager' | 'viewer_all' | 'none';
// 段階は区分ごと（lib/kubun.ts・10-26）
export const ROLES: Record<RoleKey, { label: string; hint: string; perms: KPerms; manageAccess: boolean }> = {
  owner: { label: '全体管理者', hint: '全部の区分を承認＋権限管理・設定', perms: kAll('approve'), manageAccess: true },
  manager: { label: '管理者', hint: '全部の区分を承認（権限管理はなし）', perms: kAll('approve'), manageAccess: false },
  viewer_all: { label: '全体を見る', hint: '全部の区分を見るだけ', perms: kAll('view'), manageAccess: false },
  none: { label: 'ロールなし', hint: '個別に付けた分だけ', perms: K_NONE, manageAccess: false },
};

export type Member = {
  id: string; // ＝メール（小文字）。今の社内システムのアカウントと同じ人を指す
  email: string;
  name: string;
  division: '未経験事業部' | 'その他';
  kind: '内勤' | '営業' | 'その他';
  role: RoleKey;
  own: Partial<KPerms>; // 個別に付けた段階（区分ごと）
  /** 組織表で決まった段階と権限管理（lib/members-store.ts が組織表から入れる・10-26 組織表が正）。あればこちらを使う */
  kperms?: KPerms;
  manage?: boolean;
  /** 組織表で付いた画面ごとの「見るだけ」（左メニューの href・lib/kubun.ts pageGranted） */
  kpages?: string[];
};

export function canUseApp(m: Member): boolean {
  return m.division === '未経験事業部' && m.kind === '内勤';
}

/** その人の区分ごとの段階。組織表で決まっていればそれ、無ければロールと個別の高いほう。内勤でなければ全部「見ない」。 */
export function effectivePerms(m: Member): KPerms {
  if (!canUseApp(m)) return K_NONE;
  if (m.kperms) return m.kperms;
  return kMax(ROLES[m.role]?.perms ?? K_NONE, m.own);
}
/** 区分は見ないのまま「見る」で開ける画面（組織表で付いたもの） */
export const effectivePages = (m: Member): string[] => (canUseApp(m) ? m.kpages ?? [] : []);
export const canManageAccess = (m: Member) => canUseApp(m) && (m.manage ?? !!ROLES[m.role]?.manageAccess);

// 今の社内システムのロール → ver2 のロール（共有の設定にその人が載っていないときの初めの値・10-26）
//   super_admin            → owner（全体管理者）※共有の設定に何と書いてあっても owner（権限管理の締め出しを防ぐ。保存できるのも super_admin だけ）
//   admin                  → manager（4分類すべて承認・権限管理なし）
//   executive              → viewer_all（4分類すべて見る）
//   sales_admin/staff_sales→ none ＋ 営業「直す」
//   kanawest_sales         → none ＋ かな西エリア「見る」（神奈川要員だけ・10-26）
//   staff_recruit          → none ＋ 人事・人財「直す」
//   applicant_support      → none ＋ 人事・人財「見る」
//   keiri                  → none ＋ 経理「直す」
//   staff / list_viewer / retired / そのほか → none（何も見ない。staff・list_viewer は営業共有リストだけ＝canUseApp も false）
export function roleFromIke(ikeRole: string): { role: RoleKey; own: Partial<KPerms> } {
  switch (ikeRole) {
    case 'super_admin': return { role: 'owner', own: {} };
    case 'admin': return { role: 'manager', own: {} };
    case 'executive': return { role: 'viewer_all', own: {} };
    case 'sales_admin': case 'staff_sales': return { role: 'none', own: toKPerms({ eigyo: 'edit' }) };
    case 'kanawest_sales': return { role: 'none', own: { kanawest: 'view' } }; // かな西エリアだけ＝神奈川要員だけ（10-26）
    case 'staff_recruit': return { role: 'none', own: toKPerms({ jinji: 'edit', jinzai: 'edit' }) };
    case 'applicant_support': return { role: 'none', own: toKPerms({ jinji: 'view', jinzai: 'view' }) };
    case 'keiri': return { role: 'none', own: toKPerms({ keiri: 'edit' }) };
    default: return { role: 'none', own: {} };
  }
}
/** 営業共有リストだけのロール（今の社内システムの isListOnlyRole と同じ） */
export const isListOnlyIkeRole = (r: string) => r === 'list_viewer' || r === 'staff';
export const isRoleKey = (r: unknown): r is RoleKey => typeof r === 'string' && r in ROLES;

export const VIEWER_COOKIE = 'v2_viewer';
