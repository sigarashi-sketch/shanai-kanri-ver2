'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { findNav } from '@/lib/nav';

// まだ作っていない画面。ver2 は全部そろってから本番に出すので、メニューからは辿れるようにしておく。
export default function NotYetPage() {
  const pathname = usePathname();
  const { group, item } = findNav(pathname);
  return (
    <main className="px-6 pb-12 pt-[22px]">
      <div className="mo-fade-up rounded-xl border border-dashed border-[#C9CBDA] bg-white px-8 py-14 text-center">
        <div className="text-[12.5px] font-semibold" style={{ color: 'var(--ad)' }}>{group?.label ?? 'その他'}</div>
        <h1 className="mt-1 text-[22px] font-bold">{item?.label ?? 'この画面'}</h1>
        <p className="mt-2 text-[13.5px] text-muted">これから作ります。今のいけどんの同じ画面の中身を、ver2 の型（一覧・社員ページ・申請・承認）に載せ替えます。</p>
        <Link href="/" className="btn mt-5 inline-flex min-h-10 items-center rounded-[10px] px-4 text-[13.5px] font-semibold" style={{ background: 'var(--a)', color: 'var(--ao)' }}>ホームへ</Link>
      </div>
    </main>
  );
}
