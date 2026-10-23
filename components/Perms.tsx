'use client';

import { createContext, useContext } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { atLeast, LEVELS, type Level, type Member, type Perms } from '@/lib/access';
import type { ModuleKey } from '@/lib/theme';

// いまの人の権限を画面に配る。見えない分類はメニューから消え、開いても「権限がありません」。
//   ボタンは can(分類, 'edit' | 'approve') で出し分ける（足りなければ押せない＋理由を出す）。
type Ctx = { me: Member; perms: Perms; manageAccess: boolean; can: (m: ModuleKey, need: Level) => boolean };
const PermsCtx = createContext<Ctx | null>(null);

export function PermsProvider({ me, perms, manageAccess, children }: { me: Member; perms: Perms; manageAccess: boolean; children: React.ReactNode }) {
  const can = (m: ModuleKey, need: Level) => atLeast(perms[m], need);
  return <PermsCtx.Provider value={{ me, perms, manageAccess, can }}>{children}</PermsCtx.Provider>;
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
        <h1 className="mt-3 text-[20px] font-bold">{label}を見る権限がありません</h1>
        <p className="mt-2 text-[13.5px] text-muted">必要なときは、全体管理者に「権限管理」で付けてもらってください。</p>
        <Link href="/" className="btn mt-5 inline-flex min-h-10 items-center rounded-[10px] bg-sumi px-4 text-[13.5px] font-semibold text-white">ホームへ</Link>
      </div>
    </main>
  );
}
