// 入れる人と権限（ver2 で作り直し・2026-10-22〜23 shoya）
//   ① 入れるのは未経験事業部の内勤だけ。それ以外は営業共有リスト（/shared）だけ … これは変えない
//   ② 内勤の中は 分類（人事・労務・営業・経理）ごとに「見る／直す／承認」の3段階
//      何も付いていない分類は「見ない」＝メニューにも出ない
//   ③ まとめて広く持てる「ロール」もある。その人の分類ごとの段階は「ロールの段階」と「個別に付けた段階」の高いほう
//   ④ 権限管理（誰に何を付けるか）を触れるのは、それを持つロールの人だけ
import type { ModuleKey } from './theme';

export type Level = 'none' | 'view' | 'edit' | 'approve';
export const LEVELS: { key: Level; label: string; hint: string }[] = [
  { key: 'none', label: '見ない', hint: 'メニューにも出ない' },
  { key: 'view', label: '見る', hint: '一覧と中身を見られる' },
  { key: 'edit', label: '直す', hint: '入力・変更・予約ができる' },
  { key: 'approve', label: '承認', hint: '申請の承認・差し戻しもできる' },
];
const RANK: Record<Level, number> = { none: 0, view: 1, edit: 2, approve: 3 };
export const atLeast = (l: Level, need: Level) => RANK[l] >= RANK[need];
const max = (a: Level, b: Level): Level => (RANK[a] >= RANK[b] ? a : b);

export type Perms = Record<ModuleKey, Level>;
const NONE: Perms = { jinji: 'none', roumu: 'none', eigyo: 'none', keiri: 'none' };
const ALL = (l: Level): Perms => ({ jinji: l, roumu: l, eigyo: l, keiri: l });

export type RoleKey = 'owner' | 'manager' | 'viewer_all' | 'none';
export const ROLES: Record<RoleKey, { label: string; hint: string; perms: Perms; manageAccess: boolean }> = {
  owner: { label: '全体管理者', hint: '4分類すべて承認＋権限管理・設定', perms: ALL('approve'), manageAccess: true },
  manager: { label: '管理者', hint: '4分類すべて承認（権限管理はなし）', perms: ALL('approve'), manageAccess: false },
  viewer_all: { label: '全体を見る', hint: '4分類すべて見るだけ', perms: ALL('view'), manageAccess: false },
  none: { label: 'ロールなし', hint: '個別に付けた分だけ', perms: NONE, manageAccess: false },
};

export type Member = {
  id: string;
  name: string;
  division: '未経験事業部' | 'その他';
  kind: '内勤' | '営業' | 'その他';
  role: RoleKey;
  own: Partial<Perms>; // 個別に付けた段階
};

export function canUseApp(m: Member): boolean {
  return m.division === '未経験事業部' && m.kind === '内勤';
}

/** その人の分類ごとの段階（ロールと個別の高いほう）。内勤でなければ全部「見ない」。 */
export function effectivePerms(m: Member): Perms {
  if (!canUseApp(m)) return NONE;
  const r = ROLES[m.role].perms;
  return {
    jinji: max(r.jinji, m.own.jinji ?? 'none'),
    roumu: max(r.roumu, m.own.roumu ?? 'none'),
    eigyo: max(r.eigyo, m.own.eigyo ?? 'none'),
    keiri: max(r.keiri, m.own.keiri ?? 'none'),
  };
}
export const canManageAccess = (m: Member) => canUseApp(m) && ROLES[m.role].manageAccess;

// 手元で動かすあいだの名簿（見本）。ログインと本物の名簿をつなぐまでの仮置き。
export const MEMBERS: Member[] = [
  { id: 'igarashi', name: '五十嵐（全体管理者）', division: '未経験事業部', kind: '内勤', role: 'owner', own: {} },
  { id: 'nakamura', name: '中村（採用担当）', division: '未経験事業部', kind: '内勤', role: 'none', own: { jinji: 'edit', roumu: 'view' } },
  { id: 'fujikawa', name: '藤川（経理）', division: '未経験事業部', kind: '内勤', role: 'none', own: { keiri: 'approve', roumu: 'view' } },
  { id: 'tanaka', name: '田中（労務）', division: '未経験事業部', kind: '内勤', role: 'viewer_all', own: { roumu: 'approve' } },
  { id: 'kobayashi', name: '小林（営業）', division: 'その他', kind: '営業', role: 'none', own: {} },
];
export const VIEWER_COOKIE = 'v2_viewer';
export const MEMBERS_STORAGE_KEY = 'v2_members';
