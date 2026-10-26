'use client';

import { createContext, useContext } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import { atLeast, LEVELS, modulePerms, type Level, type Member, type Perms } from '@/lib/access';
import { kubunOfPath, pageAccess, type KPerms } from '@/lib/kubun';
export { pageAccess };
import type { ModuleKey } from '@/lib/theme';

// いまの人の権限を画面に配る。段階は区分ごと（lib/kubun.ts・10-26）。見えない区分の画面はメニューから消え、開いても「権限がありません」。
//   ボタンは can(分類, 'edit' | 'approve') で出し分ける（足りなければ押せない＋理由を出す）。
//   ★can は「いま開いている画面の区分」の段階で答える（呼ぶ側は分類を渡したままでよい）。区分に振っていない画面（ホームなど）では分類の段階
//   ★かな西エリアだけで開いている要員の画面（kanawestOnly）は「見る」まで＝書く操作は出さない
type Ctx = { me: Member; perms: Perms; kperms: KPerms; manageAccess: boolean; kanawestOnly: boolean; can: (m: ModuleKey, need: Level) => boolean };
const PermsCtx = createContext<Ctx | null>(null);

export function PermsProvider({ me, kperms, manageAccess, children }: { me: Member; kperms: KPerms; manageAccess: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const perms = modulePerms(kperms);
  const k = kubunOfPath(pathname);
  const kanawestOnly = pageAccess(kperms, pathname) === 'kanawest';
  const can = (m: ModuleKey, need: Level) => (kanawestOnly ? atLeast('view', need) : k ? atLeast(kperms[k], need) : atLeast(perms[m], need));
  return <PermsCtx.Provider value={{ me, perms, kperms, manageAccess, kanawestOnly, can }}>{children}</PermsCtx.Provider>;
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

export function NoAccess({ label }: { label: string }) {
  return (
    <main className="px-6 pb-12 pt-[22px]">
      <div className="mo-fade-up rounded-xl border border-line bg-surface px-8 py-14 text-center">
        <Lock className="mx-auto text-faint" size={28} />
        <h1 className="mt-3 text-xl font-bold">{label}を見る権限がありません</h1>
        <p className="mt-2 text-body text-muted">必要なときは、全体管理者に「権限管理」で付けてもらってください。</p>
        <Link href="/" className="btn mt-5 bg-sumi text-white">ホームへ</Link>
      </div>
    </main>
  );
}
