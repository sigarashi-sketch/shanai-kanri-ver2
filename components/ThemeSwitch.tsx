'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { THEMES } from '@/lib/theme';
import { Swatches, useTheme } from './ThemeProvider';

/** 上のバーの「見た目」。押すと8つの着せ替えが出て、選ぶとすぐ変わる。 */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const cur = THEMES.find((t) => t.key === theme)!;
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`見た目：${cur.name}`} className="flex min-h-10 items-center gap-2 rounded-[10px] border border-line px-2.5 text-sm text-muted">
        <Palette size={16} strokeWidth={1.8} /><span className="hidden xl:inline">見た目</span><Swatches sw={cur.sw} size={7} />
      </button>
      {open && (
        <div role="menu" className="mo-scale-in absolute right-0 top-12 z-40 w-[280px] rounded-xl border border-line bg-surface p-1.5 shadow-[0_14px_36px_rgba(15,20,38,.18)]">
          {THEMES.map((t) => (
            <button key={t.key} role="menuitemradio" aria-checked={theme === t.key} onClick={() => { setTheme(t.key); setOpen(false); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-body hover:bg-soft">
              <Swatches sw={t.sw} size={9} />
              <span className="flex-1">{t.name}</span>
              {theme === t.key && <Check size={15} strokeWidth={3} style={{ color: 'var(--a)' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
