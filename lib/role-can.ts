// 名前の小窓で、ロールごとに見られる中身・押せるボタン（10-25 shoya「押せるのはロールで決める」）。
//   ・ロールは今の社内システムのログインのロール（api/_auth.ts・_page_access.ts と同じ名前）
//   ・表は権限管理の画面で全体管理者が切り替える。保存先は v2-settings の roleCan（全員に効く）
//   ・保存が無い・読めないときは下の DEFAULT_ROLE_CAN（今まで決め打ちしていた線）
//   ・super_admin は外せない（全部見られる）。表に無いロールは何も見られない
export const CAN_KEYS = [
  { key: 'chat', label: 'チャット', hint: 'LINE のやり取りを見る' },
  { key: 'summary', label: '要約', hint: '「要約」を押せる（AI が読む）' },
  { key: 'basic', label: '基本情報', hint: 'フォームの答え（健康状況は誰にも出さない）' },
  { key: 'price', label: '単価・額面', hint: '現場の単価・額面を見る' },
] as const;
export type CanKey = (typeof CAN_KEYS)[number]['key'];
export type RoleCanRow = Record<CanKey, boolean>;
export type RoleCan = Record<string, RoleCanRow>;

export const LOGIN_ROLES: { key: string; label: string }[] = [
  { key: 'super_admin', label: '全体管理者' },
  { key: 'admin', label: '管理者' },
  { key: 'executive', label: '役員' },
  { key: 'sales_admin', label: '営業の管理者' },
  { key: 'staff_sales', label: '営業' },
  { key: 'staff_recruit', label: '採用' },
  { key: 'kanawest_sales', label: 'かな西の営業' },
];

const row = (chat: boolean, summary: boolean, basic: boolean, price: boolean): RoleCanRow => ({ chat, summary, basic, price });
export const DEFAULT_ROLE_CAN: RoleCan = {
  super_admin: row(true, true, true, true),
  admin: row(true, true, true, true),
  executive: row(true, true, true, true),
  sales_admin: row(false, false, false, true),
  staff_sales: row(false, false, false, true),
  staff_recruit: row(true, true, true, false),
  kanawest_sales: row(false, false, false, true),
};

/** 保存された表を、決まったロール×決まった中身だけの形にそろえる（知らないキーは捨てる・無いところは初めの値） */
export function normRoleCan(v: unknown): RoleCan {
  const src = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Partial<RoleCanRow>>) : {};
  const out: RoleCan = {};
  for (const { key: r } of LOGIN_ROLES) {
    const d = DEFAULT_ROLE_CAN[r], s = src[r] && typeof src[r] === 'object' ? src[r] : {};
    out[r] = Object.fromEntries(CAN_KEYS.map(({ key }) => [key, r === 'super_admin' ? true : typeof s[key] === 'boolean' ? s[key]! : d[key]])) as RoleCanRow;
  }
  return out;
}

export const NO_CAN: RoleCanRow = row(false, false, false, false);
export const canRow = (table: RoleCan, role: string): RoleCanRow => table[role] ?? NO_CAN;
