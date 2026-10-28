'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Archive, Briefcase, Gift, ChevronDown, LogOut, Menu, X, Clock, Home, MessageSquare, Network, Pin, PinOff, ReceiptText, ShieldCheck, SlidersHorizontal, Sprout, Users } from 'lucide-react';
import { GuideHost } from './Guide';
import { NAV, NAV_EXTRA, NAV_HOME, NAV_HORYU, NAV_KANRI, findNav, type NavGroup, type NavItem } from '@/lib/nav';
import { APP_NAME } from '@/lib/app';
import type { ModuleKey } from '@/lib/theme';
import { useColors } from './ColorProvider';
import { MotivationProvider, TodayPill } from './Motivation';
import { NoAccess, usePerms } from './Perms';
import { RenrakuButton } from './Renraku';
import { PersonHost } from './Person';
import { CtxMenu } from './CtxMenu';
import { ThemeSwitch } from './ThemeSwitch';
import { YoyakuProvider } from './YoyakuStore';
import { AlertProvider } from './AlertStore';
import { LiveIndicator } from './Live';
import { useMePages } from './MePages';
import { horyuVisible } from '@/lib/horyu-access';
import { NIPPO_HREF, useNippoMust } from './NippoMust';
import { LogoutButton, logout } from './Logout';

export const MODULE_ICON: Record<ModuleKey, typeof Users> = { jinji: Users, roumu: Clock, eigyo: Briefcase, keiri: ReceiptText, jinzai: Sprout };


export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { group } = findNav(pathname);
  const { notes } = useColors();
  const { me, manageAccess, home, kanawestOnly, open: canOpen } = usePerms();
  // 保留のメニューは今の社内システムのページ権限で出し分ける（見られない人には出さない・10-26）。読めないあいだは全部出す
  const { pa } = useMePages();
  const horyu = NAV_HORYU.filter((it) => canOpen(it.href) && horyuVisible(it.href, pa));
  const module = group?.module ?? 'home';
  // 区分ごと（10-26）：見ない区分の画面はメニューに出さない。かな西エリアだけの人には要員の画面を「かな西」の印つきで出す
  //   媒体アイパス管理のように今のシステムが特別に絞る画面は、今のページ権限でも絞る（horyuVisible・台帳に無い画面は素通り）
  const visible = NAV.map((g) => ({ ...g, items: g.items.filter((it) => canOpen(it.href) && horyuVisible(it.href, pa)) })).filter((g) => g.items.length);
  // 今のシステムのページ権限で開けない画面（経理管理など）も、中で forbidden を出さずに「権限がありません」にする（10-26）
  const legacyBlocked = !!group && !horyuVisible(group.items.find((it) => pathname === it.href || pathname.startsWith(it.href + '/'))?.href ?? pathname, pa);
  const blocked = !canOpen(pathname) || legacyBlocked;   // 分類に入っていない画面（ホーム・設定）は開く。保留も PRE_LAUNCH の間は閉じる
  // 平日18時を過ぎて今日の成約日報を出していない人は、出すまで成約日報から動けない（10-27 shoya・components/NippoMust.tsx）。日報を開けない人は対象外
  const router = useRouter();
  const nippoMust = useNippoMust(me.email, canOpen(NIPPO_HREF) === 'all' && horyuVisible(NIPPO_HREF, pa));
  const away = nippoMust && !isOn(pathname, NIPPO_HREF);
  useEffect(() => { if (away) router.replace(NIPPO_HREF + '?must=1'); }, [away, router]);
  // 右から出るパネル（連絡・スキシ）が上のバーに重ならないよう、バーの実際の高さを --hdr に入れる（狭い画面では折り返して高くなる）
  const hdr = useRef<HTMLElement>(null);
  // 携帯（幅 768 未満）では左の帯を出さず、上のバーの ≡ で左から引き出す（10-27 shoya「携帯表示も対応して」）
  const [drawer, setDrawer] = useState(false);
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
        <SideNav me={me} drawer={drawer} setDrawer={setDrawer} pathname={pathname} visible={visible} horyu={horyu} manageAccess={manageAccess} kanawestOf={(href) => canOpen(href) === 'kanawest'} canOpen={(href) => !!canOpen(href)} home={home} />

        <div data-tour="col" className="flex min-w-0 flex-1 flex-col">
          <header ref={hdr} data-tour="header" className="sticky top-0 z-30 flex min-h-[58px] flex-wrap items-center gap-x-2 gap-y-1.5 topbar border-b border-line px-3 py-2 backdrop-blur md:gap-3.5 md:px-6 md:py-0">
            <button type="button" onClick={() => setDrawer(true)} aria-label="メニューを開く" aria-expanded={drawer} className="-ml-1 flex size-10 items-center justify-center rounded-[10px] text-ink hover:bg-soft md:hidden"><Menu size={22} /></button>
            {group && <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-body font-semibold" style={{ color: 'var(--ad)' }}><i className="size-2 rounded-full" style={{ background: 'var(--a)' }} />{group.label}</span>}
            {/* 全体検索（⌘K）と通知のベルは、中身ができるまで出さない（10-25 見た目の整理：押しても何も起きない飾りだったため） */}
            <span className="contents max-md:hidden"><LiveIndicator /></span>
            {notes.length > 0 && <span role="status" className="mo-fade-in rounded-lg border border-warn-line bg-warn-soft px-2.5 py-1.5 text-sm text-warn">{notes.join('／')}</span>}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2 md:gap-3">
              <GuideHost groups={visible} />
              <TodayPill />
              <span data-tour="theme" className="inline-flex"><ThemeSwitch /></span>
              <span data-tour="renraku" className="inline-flex"><RenrakuButton key={module} module={module as ModuleKey | 'home'} /></span>
              <span className="max-w-[190px] truncate text-sm text-muted max-md:hidden" title={me.email}>{me.name}</span>
              <LogoutButton className="rounded-md px-2 py-1 text-sm text-muted hover:bg-soft hover:text-ink max-md:hidden" />
            </div>
          </header>
          {/* 名前を押した人は、画面の一番上に出す（右でも小窓でもない・10-26 shoya「上に表示しろ」） */}
          <PersonHost />
          {kanawestOnly && !blocked && <div role="status" className="mx-3 mt-3 rounded-lg md:mx-6 border border-line bg-soft px-3 py-2 text-sm text-muted">かな西エリア：神奈川要員の人だけを出しています（見るだけ）</div>}
          {away ? null : blocked ? <NoAccess label={findNav(pathname).item?.label ?? group?.label ?? 'この画面'} legacy={legacyBlocked} /> : children}
        </div>
        <div id="drawer-root" />
        {/* 全画面共通の右クリックメニュー（今のいけどんの ctx-menu.js をそのまま・10-26） */}
        <CtxMenu />
      </div>
      </AlertProvider>
      </YoyakuProvider>
    </MotivationProvider>
  );
}

// ---- 左メニュー（10-27 shoya「旧いけどんみたいにマウス合わせたらメニュー表示」「クリックするとページ遷移先が出るように」「押した時のリッチなアニメーション」） ----
//   ・ふだんは分類のアイコンだけの細い帯。マウスを合わせる（キーボードで入る）と、画面の上に重ねて広がる（今のシステムの shell.css .ike-sidebar と同じ）
//   ・「固定」を押すと広げたままにして、画面を右へずらす（この端末に覚える）
//   ・分類の見出しを押すと、その分類の画面が下に開く（いくつでも開ける・開いた分類はこの端末に覚える。いま開いている画面の分類は必ず開く）
//   ・動きはモーション図鑑の語彙だけ：見出しのアイコン＝mo-spring-in＋mo-ring／開いた画面＝mo-axis を順に／押した画面＝mo-scale-in＋mo-ring
const RAIL = 64, WIDE = 248;
const PIN_KEY = 'v2_side_pin', OPEN_KEY = 'v2_side_open';
type SideGroup = { key: string; label: string; icon: typeof Users; color?: string; on?: string; items: NavItem[] };
const isOn = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + '/');

function SideNav({ me, drawer, setDrawer, pathname, visible, horyu, manageAccess, kanawestOf, canOpen, home }: { me: { name: string; email: string }; drawer: boolean; setDrawer: (v: boolean) => void; pathname: string; visible: NavGroup[]; horyu: NavItem[]; manageAccess: boolean; kanawestOf: (href: string) => boolean; canOpen: (href: string) => boolean; home: string }) {
  const groups: SideGroup[] = [
    ...visible.map((g) => ({ key: g.module, label: g.label, icon: MODULE_ICON[g.module], color: `var(--c-${g.module})`, on: `var(--o-${g.module})`, items: g.items })),
    ...(horyu.length ? [{ key: 'horyu', label: '保留（あとで決める）', icon: Archive, items: horyu }] : []),
  ];
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const [opened, setOpened] = useState<string[]>([]);
  const [bump, setBump] = useState<Record<string, number>>({}); // 押した見出し（アイコンの動きをもう一度流す）
  const [pressed, setPressed] = useState<string | null>(null); // 押した画面（移るまでのあいだも選んだ形にする）
  const navRef = useRef<HTMLElement>(null);
  // 使い方ガイドの間は広げたままにして、案内している分類を開く（components/Tour.tsx tourNav）
  const [tour, setTour] = useState(false);
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<{ on: boolean; group?: string }>).detail; setTour(!!d?.on); if (d?.group) setOpened((o) => (o.includes(d.group!) ? o : [...o, d.group!])); };
    window.addEventListener('v2-tour', on);
    return () => window.removeEventListener('v2-tour', on);
  }, []);
  const wide = pinned || hover || tour || drawer;
  const current = groups.find((g) => g.items.some((it) => isOn(pathname, it.href)))?.key;

  useEffect(() => {
    try {
      setPinned(localStorage.getItem(PIN_KEY) === '1');
      const o = JSON.parse(localStorage.getItem(OPEN_KEY) || '[]');
      if (Array.isArray(o)) setOpened(o.filter((x) => typeof x === 'string'));
    } catch { /* この端末に無ければ初めの形 */ }
  }, []);
  const saveOpened = (next: string[]) => { setOpened(next); try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* noop */ } };
  // いま開いている画面の分類は開く。移り終わったら「押した」印を消し、タッチの端末では帯に戻す
  useEffect(() => {
    setPressed(null);
    if (current) setOpened((o) => (o.includes(current) ? o : [...o, current]));
    if (typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) setHover(false);
    setDrawer(false);
  }, [pathname, current, setDrawer]);
  // 携帯の引き出しは Escape でも閉じる
  useEffect(() => {
    if (!drawer) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [drawer, setDrawer]);
  // タッチで広げたときは、外を押したら帯に戻す
  useEffect(() => {
    if (!hover || pinned) return;
    const off = (e: PointerEvent) => { if (navRef.current && !navRef.current.contains(e.target as Node)) setHover(false); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [hover, pinned]);

  const toggle = (k: string) => {
    setBump((b) => ({ ...b, [k]: (b[k] ?? 0) + 1 }));
    if (!wide) { setHover(true); if (!opened.includes(k)) saveOpened([...opened, k]); return; } // 帯のアイコンを押したら広げて開く
    saveOpened(opened.includes(k) ? opened.filter((x) => x !== k) : [...opened, k]);
  };
  const pin = () => { const v = !pinned; setPinned(v); if (!v) setHover(false); try { localStorage.setItem(PIN_KEY, v ? '1' : '0'); } catch { /* noop */ } };
  const lbl = `whitespace-nowrap transition-[opacity,transform] duration-200 ${wide ? 'opacity-100 translate-x-0' : 'pointer-events-none -translate-x-1 opacity-0'}`;

  return (
    <div className="relative w-[var(--rail)] shrink-0 transition-[width] duration-[260ms] ease-[cubic-bezier(.22,1,.36,1)] max-md:w-0" style={{ ['--rail' as string]: `${pinned ? WIDE : RAIL}px` } as CSSProperties}>
      {/* 携帯：引き出しの後ろの暗い面（押すと閉じる） */}
      {drawer && <div aria-hidden onClick={() => setDrawer(false)} className="mo-fade-in fixed inset-0 z-40 bg-black/30 md:hidden" />}
      <nav ref={navRef} data-tour="sidenav" aria-label="メニュー"
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHover(false); }}
        className={`side fixed left-0 top-0 z-40 flex h-dvh flex-col gap-2 overflow-y-auto overflow-x-hidden px-2.5 py-3.5 text-body transition-[width,box-shadow,transform] duration-[260ms] ease-[cubic-bezier(.22,1,.36,1)] ${(hover && !pinned) || drawer ? 'shadow-[0_16px_48px_rgba(24,24,27,.28)]' : ''} ${drawer || tour ? '' : 'max-md:-translate-x-full'}`}
        style={{ width: wide ? WIDE : RAIL }}>
        <div className="flex items-center gap-2.5 px-2 pb-1.5 pt-1">
          <div aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-lg side-logo text-md font-extrabold">S</div>
          <b className={`side-strong text-md ${lbl}`}>{APP_NAME}</b>
          <button onClick={pin} aria-pressed={pinned} aria-label={pinned ? 'メニューの固定をやめる' : 'メニューを広げたまま固定する'} title={pinned ? '固定をやめる（マウスを合わせたときだけ広げる）' : '広げたまま固定する'}
            className={`side-muted side-hover ml-auto rounded-md p-1 max-md:hidden ${lbl}`}>
            {pinned ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
          <button onClick={() => setDrawer(false)} aria-label="メニューを閉じる" className="side-muted side-hover ml-auto rounded-md p-1.5 md:hidden"><X size={18} /></button>
        </div>
        {/* ホーム＝その人のホーム（営業→ホーム営業・人事→ホーム人事・10-27）。下にたまげたポン（未経験事業部の人だけ） */}
        <Link href={home} data-tour="home" className={`side-hover flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${pathname === home || pathname === '/' ? 'side-on font-semibold' : ''}`}>
          <Home size={18} strokeWidth={1.8} className="shrink-0" /><span className={lbl}>ホーム</span>
        </Link>
        {NAV_HOME.filter((it) => canOpen(it.href)).map((it) => (
          <Link key={it.href} href={it.href} data-tour={`nav-${it.href}`} title={wide ? undefined : it.label} className={`side-hover -mt-1.5 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 ${isOn(pathname, it.href) ? 'side-on font-semibold' : ''}`}>
            <Gift size={18} strokeWidth={1.8} className="shrink-0" /><span className={lbl}>{it.label}</span>
          </Link>
        ))}
        {groups.map((g) => {
          const open = opened.includes(g.key);
          const show = wide && open;
          const Icon = g.icon;
          const here = current === g.key;
          return (
            <div key={g.key} className="flex flex-col">
              <button type="button" data-tour={`grp-${g.key}`} onClick={() => toggle(g.key)} aria-expanded={show} title={wide ? undefined : g.label}
                className={`side-hover flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm font-semibold ${here ? 'side-strong' : ''}`}>
                <span key={bump[g.key] ?? 0} className={`flex size-6 shrink-0 items-center justify-center rounded-md ${g.color ? '' : 'side-ring ring-1'}`}
                  style={{ ...(g.color ? { background: g.color, color: g.on } : {}), ...(bump[g.key] ? { animation: 'mo-spring-in 520ms cubic-bezier(.34,1.56,.64,1) both, mo-ring 700ms ease-out both', ['--a' as string]: g.color ?? 'var(--side-fg)' } : {}) } as CSSProperties}>
                  <Icon size={14} strokeWidth={2.2} />
                </span>
                <span className={`min-w-0 flex-1 truncate ${lbl}`}>{g.label}</span>
                <ChevronDown size={15} className={`side-muted shrink-0 transition-transform duration-[260ms] ease-[cubic-bezier(.34,1.56,.64,1)] ${open ? 'rotate-180' : ''} ${lbl}`} />
              </button>
              {/* 開くときは高さを伸ばし、中の画面を上から順に出す */}
              <div className={`grid transition-[grid-template-rows,opacity] duration-[280ms] ease-[cubic-bezier(.22,1,.36,1)] ${show ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="min-h-0 overflow-hidden">
                  <div className="side-line ml-[19px] mt-0.5 flex flex-col gap-px border-l py-0.5 pl-2">
                    {g.items.map((it, i) => {
                      const active = pressed ? pressed === it.href : isOn(pathname, it.href);
                      const justPressed = pressed === it.href;
                      return (
                        <Link key={`${it.href}:${show ? 1 : 0}`} href={it.href} data-tour={`nav-${it.href}`} onClick={() => { if (!isOn(pathname, it.href)) setPressed(it.href); }} tabIndex={show ? 0 : -1}
                          className={`relative flex items-center justify-between rounded-lg px-2.5 py-1.5 ${show ? 'mo-axis' : ''} ${active ? 'side-on font-semibold' : 'side-hover'} ${it.built ? '' : 'opacity-60'}`}
                          style={{ ['--i' as string]: i, ...(active && g.color ? { boxShadow: `inset 3px 0 0 var(--side-bar, ${g.color})` } : {}) } as CSSProperties}>
                          {justPressed && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-lg" style={{ animation: 'mo-scale-in 240ms cubic-bezier(.22,1,.36,1) both, mo-ring 800ms ease-out both', ['--a' as string]: g.color ?? 'var(--side-fg)' } as CSSProperties} />}
                          <span className="truncate">{it.label}</span>
                          {kanawestOf(it.href) && <span className="rounded px-1 side-muted side-ring text-xs ring-1" title="かな西エリア：神奈川要員だけ">かな西</span>}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div className="side-line mt-auto flex flex-col gap-px border-t pt-2.5">
          {NAV_EXTRA.filter((it) => canOpen(it.href)).map((it) => (
            <Link key={it.href} href={it.href} data-tour={`nav-${it.href}`} className={`side-hover flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 ${pathname === it.href ? 'side-on' : ''}`}>
              {it.href === '/renraku' ? <MessageSquare size={17} strokeWidth={1.8} className="shrink-0" /> : <SlidersHorizontal size={17} strokeWidth={1.8} className="shrink-0" />}<span className={lbl}>{it.label}</span>
            </Link>
          ))}
          {manageAccess && (
            <>
              <div className={`px-2.5 pb-0.5 pt-2 text-xs font-semibold text-faint ${lbl}`}>管理</div>
              {NAV_KANRI.map((it) => (
                <Link key={it.href} href={it.href} className={`side-hover flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 ${pathname === it.href ? 'side-on' : ''}`}>
                  {it.href === '/settings/access' ? <ShieldCheck size={17} strokeWidth={1.8} className="shrink-0" /> : <Network size={17} strokeWidth={1.8} className="shrink-0" />}<span className={lbl}>{it.label}</span>
                </Link>
              ))}
            </>
          )}
          {/* 携帯は上のバーに名前とログアウトを置かないので、ここに出す */}
          <div className="side-line mt-2 flex items-center gap-2 border-t px-2.5 pt-2.5 md:hidden">
            <span className="side-muted min-w-0 flex-1 truncate text-sm" title={me.email}>{me.name}</span>
            <LogoutButton className="side-hover rounded-md px-2 py-1 text-sm" />
          </div>
          {/* PC も左メニューのいちばん下にログアウト（10-28 shoya「すべての画面に」・帯のときはアイコンだけ） */}
          <button type="button" onClick={logout} title="ログアウト" className="side-hover flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 max-md:hidden">
            <LogOut size={17} strokeWidth={1.8} className="shrink-0" /><span className={lbl}>ログアウト</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

/** 前の「見え方」（架空の人に切り替え）はやめた（10-26・いまの人＝ログインした本人）。営業共有リストの画面が読んでいるので名前だけ残す */
export function ViewerSwitch(_props: { members: { id: string; name: string }[]; current: string }) {
  return null;
}
