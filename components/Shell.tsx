'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Bell, Briefcase, ChevronsLeft, ChevronsRight, Clock, Home, MessageSquare, ReceiptText, Search, ShieldCheck, SlidersHorizontal, Users } from 'lucide-react';
import { NAV, NAV_EXTRA, findNav } from '@/lib/nav';
import { APP_NAME } from '@/lib/app';
import type { ModuleKey } from '@/lib/theme';
import { useColors } from './ColorProvider';
import { MotivationProvider, TodayPill } from './Motivation';
import { NoAccess, levelLabel, usePerms } from './Perms';

const MODULE_ICON: Record<ModuleKey, typeof Users> = { jinji: Users, roumu: Clock, eigyo: Briefcase, keiri: ReceiptText };

export function Shell({ members, children }: { members: { id: string; name: string }[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const { group } = findNav(pathname);
  const { notes } = useColors();
  const { me, perms, manageAccess } = usePerms();
  const [open, setOpen] = useState(true);
  const module = group?.module ?? 'home';
  const visible = NAV.filter((g) => perms[g.module] !== 'none');
  const blocked = group && perms[group.module] === 'none';

  return (
    <MotivationProvider>
      <div data-module={module} className="flex min-h-screen">
        <nav aria-label="メニュー" className={`sticky top-0 flex h-screen shrink-0 flex-col gap-3 overflow-y-auto bg-sumi px-2.5 py-3.5 text-[13.5px] text-[#C9CBE0] transition-[width] duration-[260ms] ${open ? 'w-[240px]' : 'w-[64px]'}`}>
          <div className="flex items-center gap-2.5 px-2 pb-1.5 pt-1">
            <div aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-[15px] font-extrabold text-sumi">S</div>
            {open && <b className="whitespace-nowrap text-[15px] text-white">{APP_NAME}</b>}
            <button onClick={() => setOpen(!open)} aria-label={open ? 'メニューをたたむ' : 'メニューを開く'} className="ml-auto rounded-md p-1 text-[#8B8FA3] hover:bg-white/10">
              {open ? <ChevronsLeft size={16} /> : <ChevronsRight size={16} />}
            </button>
          </div>
          <Link href="/" className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-white/[.07] ${pathname === '/' ? 'bg-white/[.12] font-semibold text-white' : ''}`}>
            <Home size={18} strokeWidth={1.8} />{open && 'ホーム'}
          </Link>
          {visible.map((g) => {
            const Icon = MODULE_ICON[g.module];
            return (
              <div key={g.module} className="flex flex-col gap-px">
                <div className="flex items-center gap-2 px-2.5 py-1 text-[12.5px] font-semibold text-white">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-md" style={{ background: `var(--c-${g.module})`, color: `var(--o-${g.module})` }}><Icon size={13} strokeWidth={2.2} /></span>
                  {open && <>{g.label}<span className="ml-auto rounded px-1.5 text-[10.5px] font-medium text-[#8B8FA3] ring-1 ring-white/15">{levelLabel(perms[g.module])}</span></>}
                </div>
                {open && g.items.map((it) => {
                  const active = pathname === it.href || pathname.startsWith(it.href + '/');
                  return (
                    <Link key={it.href} href={it.href}
                      className={`flex items-center justify-between rounded-lg py-1.5 pl-[38px] pr-2.5 hover:bg-white/[.07] ${active ? 'bg-white/[.12] font-semibold text-white' : ''} ${it.built ? '' : 'opacity-60'}`}
                      style={active ? { boxShadow: `inset 3px 0 0 var(--c-${g.module})` } : undefined}>
                      <span className="truncate">{it.label}</span>
                      {it.badge ? <span className="num rounded-full px-1.5 text-[11px] font-bold" style={{ background: `var(--c-${g.module})`, color: `var(--o-${g.module})` }}>{it.badge}</span> : null}
                    </Link>
                  );
                })}
              </div>
            );
          })}
          <div className="mt-auto flex flex-col gap-px border-t border-white/10 pt-2.5">
            {NAV_EXTRA.map((it) => (
              <Link key={it.href} href={it.href} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-white/[.07] ${pathname === it.href ? 'bg-white/[.12] text-white' : ''}`}>
                {it.href === '/renraku' ? <MessageSquare size={17} strokeWidth={1.8} /> : <SlidersHorizontal size={17} strokeWidth={1.8} />}{open && it.label}
              </Link>
            ))}
            {manageAccess && (
              <Link href="/settings/access" className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-white/[.07] ${pathname === '/settings/access' ? 'bg-white/[.12] text-white' : ''}`}>
                <ShieldCheck size={17} strokeWidth={1.8} />{open && '権限管理'}
              </Link>
            )}
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex min-h-[58px] flex-wrap items-center gap-3.5 border-b border-line bg-white/90 px-6 backdrop-blur">
            {group && <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--ad)' }}><i className="size-2 rounded-full" style={{ background: 'var(--a)' }} />{group.label}</span>}
            <label className="flex min-h-[38px] max-w-[420px] flex-1 items-center gap-2 rounded-[10px] border border-[#DCDDE6] px-3 text-faint">
              <Search size={16} />
              <input aria-label="全体検索" placeholder="名前・カナ・現場・案件・メニュー" className="flex-1 bg-transparent text-[13.5px] text-ink outline-none" />
              <span className="rounded border border-[#DCDDE6] px-1 text-[11px]">⌘K</span>
            </label>
            {notes.length > 0 && <span role="status" className="mo-fade-in rounded-lg border border-[#F5D49A] bg-[#FFF4E0] px-2.5 py-1.5 text-[12.5px] text-[#8A4B00]">{notes.join('／')}</span>}
            <div className="ml-auto flex items-center gap-3">
              <TodayPill />
              <button aria-label="通知" className="relative flex size-10 items-center justify-center rounded-[10px] border border-line text-[#3F4257]"><Bell size={18} strokeWidth={1.8} /><span className="absolute right-2 top-[7px] size-[7px] rounded-full bg-[#E11D48]" /></button>
              <ViewerSwitch members={members} current={me.id} />
            </div>
          </header>
          {blocked ? <NoAccess label={group!.label} /> : children}
        </div>
      </div>
    </MotivationProvider>
  );
}

/** 手元で動かすあいだだけの「いまの人」切り替え。ログインをつないだら消す。 */
export function ViewerSwitch({ members, current }: { members: { id: string; name: string }[]; current: string }) {
  return (
    <form action="/api/dev-viewer" method="post" className="flex items-center gap-1.5 text-[12px] text-muted">
      <span className="hidden xl:inline">見え方：</span>
      <select name="as" defaultValue={current} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="max-w-[190px] rounded-lg border border-line bg-white px-2 py-1.5 text-[12.5px] text-ink">
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </form>
  );
}
