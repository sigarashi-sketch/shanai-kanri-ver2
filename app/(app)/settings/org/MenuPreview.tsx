'use client';

import { useState } from 'react';
import { ChevronDown, Eye, Home, Lock, Plus, X } from 'lucide-react';
import { MODULE_ICON } from '@/components/Shell';
import { levelLabel } from '@/lib/org';
import { NAV } from '@/lib/nav';
import { KANAWEST_HREFS, isKanawest, type KPerms } from '@/lib/kubun';

// 右に出すメニューの見本（10-27 shoya「右側に表示されるメニュー 画像で示して欲しい」）。
//   そのロール・部署/チームの人の左メニューに何が出るかを、左メニューと同じ形・同じ色で描く。
//   区分が「見ない」の画面は薄く出し、押すと その画面だけ「見るだけ」で足せる（もう一度押すと外す・10-27「ところどころ横断して閲覧だけ」）。
//   base＝部署で付いている「見るだけ」（チームのカードでは外せない）
//   かな西エリアだけ（ほかの区分が全部「見ない」）だと、神奈川要員だけに絞れる画面（KANAWEST_HREFS）しか出ない（lib/kubun.ts pageAccess・10-29 ほかの区分を持つ人には効かない）
export function MenuPreview({ name, perms, pages, base = [], disabled, onPages }: {
  name: string; perms: KPerms; pages: string[]; base?: string[]; disabled?: boolean;
  onPages: (next: string[], text: string) => void;
}) {
  const [opened, setOpened] = useState<string[]>([]);
  const kw = isKanawest(perms);
  const isKw = (h: string) => (KANAWEST_HREFS as readonly string[]).includes(h);
  const has = (h: string) => pages.includes(h) || base.includes(h);
  const nView = kw ? 0 : NAV.reduce((n, g) => n + (perms[g.module] !== 'none' ? 0 : g.items.filter((it) => has(it.href)).length), 0);
  return (
    <div className="w-[248px] shrink-0">
      <div className="mb-1 flex items-baseline gap-1.5 text-sm font-semibold">メニューの見え方{nView > 0 && <span className="text-xs font-normal text-muted">見るだけ {nView}画面</span>}{kw && <span className="text-xs font-normal text-muted">神奈川要員だけ</span>}</div>
      <div className="max-h-[420px] overflow-y-auto rounded-xl p-2 text-sm shadow-[0_8px_24px_rgba(24,24,27,.14)]" style={{ background: 'var(--side-bg)', color: 'var(--side-fg)' }}>
        <div className="flex items-center gap-2 rounded-lg px-2 py-1"><Home size={14} strokeWidth={1.8} />ホーム</div>
        {NAV.map((g) => {
          const lv = perms[g.module];
          const seen = g.items.filter((it) => (kw ? isKw(it.href) : lv !== 'none' || has(it.href)));
          const open = opened.includes(g.module) || (lv !== 'none' && !opened.includes(`-${g.module}`));
          const Icon = MODULE_ICON[g.module];
          const toggle = () => setOpened((o) => {
            const cleared = o.filter((x) => x !== g.module && x !== `-${g.module}`);
            return open ? (lv !== 'none' ? [...cleared, `-${g.module}`] : cleared) : [...cleared, g.module];
          });
          return (
            <div key={g.module} className="mt-0.5">
              <button type="button" onClick={toggle} aria-expanded={open} className="side-hover flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left font-semibold">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md" style={seen.length ? { background: `var(--c-${g.module})`, color: `var(--o-${g.module})` } : { boxShadow: 'inset 0 0 0 1px var(--side-line)', opacity: 0.5 }}>
                  <Icon size={12} strokeWidth={2.2} />
                </span>
                <span className={`min-w-0 flex-1 truncate ${seen.length ? '' : 'opacity-45'}`}>{g.label}</span>
                <span className="side-muted text-xs font-normal">{!kw && lv !== 'none' ? levelLabel(lv) : seen.length ? `${seen.length}画面` : '出ない'}</span>
                <ChevronDown size={13} className={`side-muted shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="side-line mo-fade-in ml-[17px] flex flex-col gap-px border-l py-0.5 pl-1.5">
                  {g.items.map((it) => {
                    if (kw) return isKw(it.href)
                      ? <div key={it.href} className="flex items-center gap-1.5 rounded-md px-2 py-[3px]"><span className="min-w-0 flex-1 truncate">{it.label}</span><span className="side-muted side-ring shrink-0 rounded px-1 text-xs ring-1" title="神奈川要員だけ・見るだけ">かな西</span></div>
                      : <div key={it.href} className="truncate rounded-md px-2 py-[3px] line-through opacity-40" title="かな西エリアの人には出ません（神奈川要員だけに絞れない画面）">{it.label}</div>;
                    if (lv !== 'none') return <div key={it.href} className="truncate rounded-md px-2 py-[3px]">{it.label}</div>;
                    const fromBase = base.includes(it.href);
                    const on = fromBase || pages.includes(it.href);
                    const lock = disabled || fromBase;
                    return (
                      <button key={it.href} type="button" disabled={lock} aria-pressed={on}
                        title={fromBase ? '部署で「見るだけ」が付いています' : on ? '押すと「見るだけ」を外す' : `押すと「${it.label}」だけ見られるようにする（区分は見ないのまま）`}
                        onClick={() => onPages(on ? pages.filter((h) => h !== it.href) : [...pages, it.href],
                          `「${name}」の${g.label}「${it.label}」を${on ? '見ないに戻しました' : '見るだけで開けました'}`)}
                        className={`group flex items-center gap-1.5 rounded-md px-2 py-[3px] text-left ${lock ? 'cursor-default' : 'side-hover'}`}>
                        <span className={`min-w-0 flex-1 truncate ${on ? '' : 'line-through opacity-40'}`}>{it.label}</span>
                        {on ? (
                          <span className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 text-xs font-semibold" style={{ background: `var(--c-${g.module})`, color: `var(--o-${g.module})` }}>
                            <Eye size={10} />見るだけ{fromBase ? <Lock size={9} /> : !disabled && <X size={10} className="hidden group-hover:inline" />}
                          </span>
                        ) : !disabled && <Plus size={12} className="side-muted hidden shrink-0 group-hover:inline" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {kw ? <p className="mt-1 text-xs text-faint">かな西エリアが付いているので、神奈川要員だけに絞れる画面だけ出ます（見るだけ）</p>
        : !disabled && <p className="mt-1 text-xs text-faint">薄い画面を押すと、その画面だけ「見るだけ」で開けます</p>}
    </div>
  );
}
