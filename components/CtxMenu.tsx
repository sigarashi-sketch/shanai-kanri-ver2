'use client';

import { useEffect } from 'react';
import { NAV, NAV_EXTRA, NAV_HOME, NAV_HORYU, NAV_KANRI } from '@/lib/nav';
import { horyuVisible } from '@/lib/horyu-access';
import { usePerms } from './Perms';
import { useMePages } from './MePages';

// 全画面共通の右クリックメニュー（10-26 shoya「ver2いけどんにもあった右クリックメニュー実装してほしい」）。
//   中身は今のいけどんと同じファイル（public/ctx-menu.js・public/split-core.js＝legacy/public の写し。向こうを直したら写し直す）。
//   ここでは「この人に見える画面」と「その人を開く先」を渡すだけ。
//   ・人の名前（<PersonName>）には data-ctx-name / data-ctx-key が付いている＝右クリックで「この人の情報を上に出す」と、要員リスト・スキシ作成などで開く
//     名前を出す新しい一覧を作ったら、行に data-ctx-name（分かれば data-ctx-key＝社員 r… か要員の行 id）を付ける
//   ・文字・行のコピー、スクショ（範囲を選ぶ／この行／この枠／画面）、この画面（更新・新しいタブ・リンク）、スプリット、よく行く画面
//   ・入力欄・地図・画像では出さない。Shift＋右クリックでブラウザのメニュー
//   ・書き込み（送信・保存・承認）はメニューに置かない（今のいけどんと同じ線引き）
type Person = { name: string; key?: string };
type Link = { id: string; path: string; label: string; icon: string; href: string };
export type CtxPage = { t: string; href: string; g?: string };
declare global {
  interface Window {
    IkeCtx?: { init?: (o: Record<string, unknown>) => void };
    IkeSplitBoot?: (o: Record<string, unknown>) => void;
    IkeIcons?: { svg: (n: string) => string };
  }
}

const enc = encodeURIComponent;
// その人を開く先（path は見える画面との照合用）。id が分かれば社員ページ／要員ページをそのまま開く
function personLinks(p: Person): Link[] {
  const out: Link[] = [];
  const key = p.key || '';
  if (/^r/.test(key)) out.push({ id: 'p-staff', path: '/jinji/staff', label: '社員ページ', icon: 'users', href: '/jinji/staff/' + enc(key) });
  else if (key) out.push({ id: 'p-proper-one', path: '/eigyo/proper', label: '要員ページ', icon: 'note', href: '/eigyo/proper/' + enc(key) });
  out.push({ id: 'p-proper', path: '/eigyo/proper', label: '要員リスト', icon: 'note', href: '/eigyo/proper?q=' + enc(p.name) });
  out.push({ id: 'p-skillsheet', path: '/eigyo/skillsheet', label: 'スキルシート作成', icon: 'clipboard', href: '/eigyo/skillsheet?q=' + enc(p.name) });
  // 要員ページと要員リストが同じ path なので、照合で両方残る。いま要員リストに居るときは両方とも消える（ctx-menu.js の allowed）
  return out;
}
// 「よく行く画面」の既定（ver2 には画面操作の記録がまだ無いので決め打ち・今のいけどんの多かった順に合わせた）
const DEFAULT_JUMPS: Record<string, string[]> = {
  '/': ['/eigyo/proper', '/eigyo/progress', '/jinji/today', '/jinji/staff'],
  '/eigyo/proper': ['/eigyo/progress', '/eigyo/skillsheet', '/jinji/staff', '/eigyo/mendan'],
  '/eigyo/progress': ['/eigyo/proper', '/eigyo/cases'],
  '/eigyo/cases': ['/eigyo/progress', '/eigyo/proper'],
  '/eigyo/skillsheet': ['/eigyo/proper', '/eigyo/progress'],
  '/eigyo/mendan': ['/eigyo/proper', '/eigyo/progress'],
  '/jinji/staff': ['/eigyo/proper', '/jinji/today'],
  '/jinji/today': ['/jinji/shift', '/jinji/staff'],
  '/jinji/shift': ['/jinji/today', '/jinji/staff'],
  '/keiri/seikyu-make': ['/keiri/kakunou', '/keiri/seikyu-zukuri'],
  '/keiri/kakunou': ['/keiri/seikyu-make', '/keiri/seikyu-zukuri'],
};
const SPLIT_DEFAULTS = ['/eigyo/proper', '/eigyo/progress', '/jinji/staff', '/jinji/today'];

// メニューの絵（lucide と同じ線の形・名前は ctx-menu.js が使うもの）
const P: Record<string, string> = {
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  note: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  clip: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  layers: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18"/><path d="M12 3v18"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pointer: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  refresh: '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z"/>',
  up: '<path d="M3 3h18"/><path d="m8 12 4-4 4 4"/><path d="M12 8v13"/>',
};
function iconSvg(n: string) {
  const d = P[n];
  return d ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>` : '';
}

/** この人に見える画面（Shell のメニューと同じ決め方）。右クリックの行き先とスプリットの候補に使う */
export function useCtxPages(): { pages: CtxPage[]; ready: boolean } {
  const { manageAccess, open, home } = usePerms();
  const { pa, ready } = useMePages();
  const out: CtxPage[] = [{ t: 'ホーム', href: home, g: 'ホーム' }];
  NAV_HOME.forEach((it) => { if (open(it.href)) out.push({ t: it.label, href: it.href, g: 'ホーム' }); });
  NAV.forEach((g) => g.items.forEach((it) => { if (open(it.href) && horyuVisible(it.href, pa)) out.push({ t: it.label, href: it.href, g: g.label }); }));
  NAV_HORYU.forEach((it) => { if (open(it.href) && horyuVisible(it.href, pa)) out.push({ t: it.label, href: it.href, g: '保留' }); });
  NAV_EXTRA.forEach((it) => open(it.href) && out.push({ t: it.label, href: it.href, g: 'そのほか' }));
  if (manageAccess) NAV_KANRI.forEach((it) => out.push({ t: it.label, href: it.href, g: '管理' }));
  return { pages: out, ready };
}

// 同じファイルは1回だけ読む（開発時は effect が2回走る）
const loading = new Map<string, Promise<void>>();
export function loadScript(src: string, mark: string): Promise<void> {
  let p = loading.get(src);
  if (!p) {
    p = new Promise<void>((res) => {
      if (document.querySelector(`script[${mark}]`)) { res(); return; }
      const sc = document.createElement('script');
      sc.src = src; sc.setAttribute(mark, '1');
      sc.onload = () => res(); sc.onerror = () => res();
      document.head.appendChild(sc);
    });
    loading.set(src, p);
  }
  return p;
}

/** 右クリックの「この人」：名前の行なら「この人の情報を上に出す」（名前を押したのと同じ）を一番上に足す */
function addPersonOpen(e: Event) {
  const t = e.target as Element | null;
  const el = t?.closest?.('[data-ctx-name]');
  const name = el?.getAttribute('data-ctx-name')?.trim();
  if (!name) return;
  const id = el?.getAttribute('data-ctx-key') || undefined;
  (e as CustomEvent<{ items: unknown[] }>).detail.items.push({
    label: 'この人の情報を上に出す', log: 'この人: 上に出す', icon: 'up',
    run: () => window.dispatchEvent(new CustomEvent('person:open', { detail: { name, id } })),
  });
}

export function CtxMenu() {
  const { pages } = useCtxPages();
  const sig = pages.map((p) => p.href).join(',');
  useEffect(() => {
    if (!window.IkeIcons) window.IkeIcons = { svg: iconSvg };
    // スプリットの枠の中なら、左のメニューと上のバーを畳む（app/globals.css の html.in-split）
    try { if (window.parent !== window && (window.parent as Window & { IkeSplit?: unknown }).IkeSplit) document.documentElement.classList.add('in-split'); } catch { /* 別サイトの中＝対象外 */ }
    document.addEventListener('ike:ctx-menu', addPersonOpen);
    let dead = false;
    void loadScript('/ctx-menu.js', 'data-ike-ctx').then(() => {
      if (dead) return;
      window.IkeCtx?.init?.({
        pages: pages.map(({ t, href }) => ({ t, href })),
        personLinks, caseLinks: () => [], defaultJumps: DEFAULT_JUMPS, jumpsUrl: '', home: '/',
        split: true, splitUrl: '/split',
      });
    });
    return () => { dead = true; document.removeEventListener('ike:ctx-menu', addPersonOpen); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return null;
}

/** スプリット（1つのタブに 2〜4 画面・app/split）。中の各画面は Shell ごとそのまま（iframe）＝権限もそのまま */
export function SplitHost() {
  const { pages, ready } = useCtxPages();
  const sig = pages.map((p) => p.href).join(',');
  useEffect(() => {
    // 起動し直すと枠が全部読み込み直しになるので、ページ権限を読み終えてから1回だけ
    if (!ready) return;
    if (!window.IkeIcons) window.IkeIcons = { svg: iconSvg };
    let dead = false;
    void Promise.all([loadScript('/split-core.js', 'data-ike-split'), loadScript('/ctx-menu.js', 'data-ike-ctx')]).then(() => {
      if (dead) return;
      window.IkeSplitBoot?.({ pages, defaults: SPLIT_DEFAULTS.filter((h) => sig.split(',').includes(h)), self: '/split', home: '/', key: 'v2_split' });
    });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, ready]);
  return null;
}
