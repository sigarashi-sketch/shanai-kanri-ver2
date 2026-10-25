import type { OrgPerson } from './org';

// 組織表の見本の人（架空の名前）。ログインしていないときだけ使う。
const P = (n: number, name: string, legacyRole: string, mikeiken: boolean): OrgPerson => ({
  userId: `demo-${String(n).padStart(2, '0')}`, name, email: `demo${n}@example.com`, legacyRole, mikeiken, retired: legacyRole === 'retired',
});

export const ORG_SAMPLE_PEOPLE: OrgPerson[] = [
  P(1, '見本 太郎', 'super_admin', true),
  P(2, '見本 花子', 'admin', true),
  P(3, '試験 一郎', 'staff_recruit', true),
  P(4, '試験 さくら', 'staff', true),
  P(5, '仮名 健', 'sales_admin', true),
  P(6, '仮名 みどり', 'staff', true),
  P(7, '例示 大地', 'list_viewer', false),
  P(8, '例示 あおば', 'kanawest_sales', false),
  P(9, '架空 ひかり', 'applicant_support', true),
  P(10, '架空 翔', 'retired', false),
];
