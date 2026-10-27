'use client';

import { createContext, useContext } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import { atLeast, LEVELS, modulePerms, type Level, type Member, type Perms } from '@/lib/access';
import { kubunOfPath, pageAccess, pageGranted, preLaunchClosed, type KPerms } from '@/lib/kubun';
export { pageAccess };
import type { ModuleKey } from '@/lib/theme';

// いまの人の権限を画面に配る。段階は区分ごと（lib/kubun.ts・10-26）。見えない区分の画面はメニューから消え、開いても「権限がありません」。
//   ボタンは can(分類, 'edit' | 'approve') で出し分ける（足りなければ押せない＋理由を出す）。
//   ★can は「いま開いている画面の区分」の段階で答える（呼ぶ側は分類を渡したままでよい）。区分に振っていない画面（ホームなど）では分類の段階
//   ★かな西エリアだけで開いている要員の画面（kanawestOnly）は「見る」まで＝書く操作は出さない
//   ★区分が「見ない」でも、画面ごとの「見るだけ」（pages・組織表で付ける）が付いた画面は開ける。その画面の can は「見る」まで
//   ★open(href) はメニュー・右クリック・画面の出し分けに使う（区分の段階＋まだ出していない分類＝lib/kubun.ts PRE_LAUNCH）
type Ctx = { me: Member; perms: Perms; kperms: KPerms; manageAccess: boolean; kanawestOnly: boolean; can: (m: ModuleKey, need: Level) => boolean; open: (href: string) => 'all' | 'kanawest' | null };
const PermsCtx = createContext<Ctx | null>(null);

export function PermsProvider({ me, kperms, pages = [], manageAccess, children }: { me: Member; kperms: KPerms; pages?: string[]; manageAccess: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const perms = modulePerms(kperms);
  const k = kubunOfPath(pathname);
  const kanawestOnly = pageAccess(kperms, pathname, pages) === 'kanawest';
  const here: Level | null = k ? (kperms[k] !== 'none' ? kperms[k] : pageGranted(pages, pathname) ? 'view' : 'none') : null;
  const can = (m: ModuleKey, need: Level) => (kanawestOnly ? atLeast('view', need) : here ? atLeast(here, need) : atLeast(perms[m], need));
  const open = (href: string) => (preLaunchClosed(href, me.role === 'owner') ? null : pageAccess(kperms, href, pages));
  return <PermsCtx.Provider value={{ me, perms, kperms, manageAccess, kanawestOnly, can, open }}>{children}</PermsCtx.Provider>;
}

export function usePerms(): Ctx {
  const c = useContext(PermsCtx);
  if (!c) throw new Error('PermsProvider の外です');
  return c;
}

export const levelLabel = (l: Level) => LEVELS.find((x) => x.key === l)!.label;

/** 足りない権限のボタン。押せず、どの権限が要るかを出す。 */
export function needText(need: Level) {
  return `「${levelLabel(need)}」の権限が要ります`;
}

export function NoAccess({ label, legacy }: { label: string; legacy?: boolean }) {
  return (
    <main className="px-6 pb-12 pt-[22px]">
      <div className="mo-fade-up rounded-xl border border-line bg-surface px-8 py-14 text-center">
        <Lock className="mx-auto text-faint" size={28} />
        <h1 className="mt-3 text-xl font-bold">{label}を見る権限がありません</h1>
        <p className="mt-2 text-body text-muted">{legacy ? 'データは今の社内システムから読むので、今の社内システムの「ロール別ページ表示」で開けるロールだけが見られます。必要なときは全体管理者に付けてもらってください。' : '必要なときは、全体管理者に「権限管理」で付けてもらってください。'}</p>
        <Link href="/" className="btn mt-5 bg-sumi text-white">ホームへ</Link>
      </div>
    </main>
  );
}
