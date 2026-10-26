'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Archive, Briefcase, ChevronsLeft, ChevronsRight, Clock, Home, MessageSquare, Network, ReceiptText, ShieldCheck, SlidersHorizontal, Users } from 'lucide-react';
import { NAV, NAV_EXTRA, NAV_HORYU, NAV_KANRI, findNav } from '@/lib/nav';
import { APP_NAME } from '@/lib/app';
import type { ModuleKey } from '@/lib/theme';
import { useColors } from './ColorProvider';
import { MotivationProvider, TodayPill } from './Motivation';
import { NoAccess, pageAccess, usePerms } from './Perms';
import { RenrakuButton } from './Renraku';
import { PersonHost } from './Person';
import { ThemeSwitch } from './ThemeSwitch';
import { YoyakuProvider } from './YoyakuStore';
import { AlertProvider } from './AlertStore';
import { LiveIndicator } from './Live';
import { useMePages } from './MePages';
import { horyuVisible } from '@/lib/horyu-access';

const MODULE_ICON: Record<ModuleKey, typeof Users> = { jinji: Users, roumu: Clock, eigyo: Briefcase, keiri: ReceiptText };

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { group } = findNav(pathname);
  const { notes } = useColors();
  const { me, kperms, manageAccess, kanawestOnly } = usePerms();
  // 保留のメニューは今の社内システムのページ権限で出し分ける（見られない人には出さない・10-26）。読めないあいだは全部出す
  const { pa } = useMePages();
  const horyu = NAV_HORYU.filter((it) => horyuVisible(it.href, pa));
  const [open, setOpen] = useState(true);
  const module = group?.module ?? 'home';
  // 区分ごと（10-26）：見ない区分の画面はメニューに出さない。かな西エリアだけの人には要員の画面を「かな西」の印つきで出す
  const visible = NAV.map((g) => ({ ...g, items: g.items.filter((it) => pageAccess(kperms, it.href)) })).filter((g) => g.items.length);
  const blocked = !!group && !pageAccess(kperms, pathname);
  // 右から出るパネル（連絡・スキシ）が上のバーに重ならないよう、バーの実際の高さを --hdr に入れる（狭い画面では折り返して高くなる）
  const hdr = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = hdr.current; if (!el) return;
    const set = () => document.documentElement.style.setProperty('--hdr', `${el.getBoundingClientRect().height}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el); window.addEventListener('resize', set);
    return () => { ro.disconnect(); window.removeEventListener('resize', set); };
  }, []);

  return (
    <MotivationProvider>
      <YoyakuProvider>
      <AlertProvider>
      <div data-module={module} className="flex min-h-screen">
        <nav aria-label="メニュー" className={`sticky top-0 flex h-screen shrink-0 flex-col gap-3 overflow-y-auto side px-2.5 py-3.5 text-body transition-[width] duration-[260ms] ${open ? 'w-[240px]' : 'w-[64px]'}`}>
          <div className="flex items-center gap-2.5 px-2 pb-1.5 pt-1">
            <div aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-lg side-logo text-md font-extrabold">S</div>
            {open && <b className="side-strong whitespace-nowrap text-md">{APP_NAME}</b>}
            <button onClick={() => setOpen(!open)} aria-label={open ? 'メニューをたたむ' : 'メニューを開く'} className="side-muted side-hover ml-auto rounded-md p-1">
              {open ? <ChevronsLeft size={16} /> : <ChevronsRight size={16} />}
            </button>
          </div>
          <Link href="/" className={`side-hover flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${pathname === '/' ? 'side-on font-semibold' : ''}`}>
            <Home size={18} strokeWidth={1.8} />{open && 'ホーム'}
          </Link>
          {visible.map((g) => {
            const Icon = MODULE_ICON[g.module];
            return (
              <div key={g.module} className="flex flex-col gap-px">
                <div className="side-strong flex items-center gap-2 px-2.5 py-1 text-sm font-semibold">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-md" style={{ background: `var(--c-${g.module})`, color: `var(--o-${g.module})` }}><Icon size={13} strokeWidth={2.2} /></span>
                  {open && g.label}
                </div>
                {open && g.items.map((it) => {
                  const active = pathname === it.href || pathname.startsWith(it.href + '/');
                  return (
                    <Link key={it.href} href={it.href}
                      className={`side-hover flex items-center justify-between rounded-lg py-1.5 pl-[38px] pr-2.5 ${active ? 'side-on font-semibold' : ''} ${it.built ? '' : 'opacity-60'}`}
                      style={active ? { boxShadow: `inset 3px 0 0 var(--side-bar, var(--c-${g.module}))` } : undefined}>
                      <span className="truncate">{it.label}</span>
                      {pageAccess(kperms, it.href) === 'kanawest' && <span className="rounded px-1 side-muted side-ring text-xs ring-1" title="かな西エリア：神奈川要員だけ">かな西</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
          {/* 保留（あとで決める）＝今の画面を写しただけで、置き場所をまだ決めていないもの（lib/nav.ts NAV_HORYU） */}
          {horyu.length > 0 && (
            <div className="flex flex-col gap-px">
              <div className="side-strong flex items-center gap-2 px-2.5 py-1 text-sm font-semibold">
                <span className="side-ring flex size-5 shrink-0 items-center justify-center rounded-md ring-1"><Archive size={12} strokeWidth={2.2} /></span>
                {open && '保留（あとで決める）'}
              </div>
              {open && horyu.map((it) => {
                const active = pathname === it.href || pathname.startsWith(it.href + '/');
                return (
                  <Link key={it.href} href={it.href} className={`side-hover flex items-center rounded-lg py-1.5 pl-[38px] pr-2.5 ${active ? 'side-on font-semibold' : ''}`}>
                    <span className="truncate">{it.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
          <div className="side-line mt-auto flex flex-col gap-px border-t pt-2.5">
            {NAV_EXTRA.map((it) => (
              <Link key={it.href} href={it.href} className={`side-hover flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 ${pathname === it.href ? 'side-on' : ''}`}>
                {it.href === '/renraku' ? <MessageSquare size={17} strokeWidth={1.8} /> : <SlidersHorizontal size={17} strokeWidth={1.8} />}{open && it.label}
              </Link>
            ))}
            {manageAccess && (
              <>
                {open && <div className="px-2.5 pb-0.5 pt-2 text-xs font-semibold text-faint">管理</div>}
                {NAV_KANRI.map((it) => (
                  <Link key={it.href} href={it.href} className={`side-hover flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 ${pathname === it.href ? 'side-on' : ''}`}>
                    {it.href === '/settings/access' ? <ShieldCheck size={17} strokeWidth={1.8} /> : <Network size={17} strokeWidth={1.8} />}{open && it.label}
                  </Link>
                ))}
              </>
            )}
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header ref={hdr} className="sticky top-0 z-30 flex min-h-[58px] flex-wrap items-center gap-3.5 topbar border-b border-line px-6 backdrop-blur">
            {group && <span className="inline-flex items-center gap-1.5 text-body font-semibold" style={{ color: 'var(--ad)' }}><i className="size-2 rounded-full" style={{ background: 'var(--a)' }} />{group.label}</span>}
            {/* 全体検索（⌘K）と通知のベルは、中身ができるまで出さない（10-25 見た目の整理：押しても何も起きない飾りだったため） */}
            <LiveIndicator />
            {notes.length > 0 && <span role="status" className="mo-fade-in rounded-lg border border-warn-line bg-warn-soft px-2.5 py-1.5 text-sm text-warn">{notes.join('／')}</span>}
            <div className="ml-auto flex items-center gap-3">
              <TodayPill />
              <ThemeSwitch />
              <RenrakuButton key={module} module={module as ModuleKey | 'home'} />
              <span className="max-w-[190px] truncate text-sm text-muted" title={me.email}>{me.name}</span>
              <button onClick={() => { void fetch('/api/ike-auth/logout', { method: 'POST' }).finally(() => window.location.reload()); }} className="text-sm text-muted hover:underline">ログアウト</button>
            </div>
          </header>
          {/* 名前を押した人は、画面の一番上に出す（右でも小窓でもない・10-26 shoya「上に表示しろ」） */}
          <PersonHost />
          {kanawestOnly && !blocked && <div role="status" className="mx-6 mt-3 rounded-lg border border-line bg-soft px-3 py-2 text-sm text-muted">かな西エリア：神奈川要員の人だけを出しています（見るだけ）</div>}
          {blocked ? <NoAccess label={findNav(pathname).item?.label ?? group!.label} /> : children}
        </div>
        <div id="drawer-root" />
      </div>
      </AlertProvider>
      </YoyakuProvider>
    </MotivationProvider>
  );
}

/** 前の「見え方」（架空の人に切り替え）はやめた（10-26・いまの人＝ログインした本人）。営業共有リストの画面が読んでいるので名前だけ残す */
export function ViewerSwitch(_props: { members: { id: string; name: string }[]; current: string }) {
  return null;
}
