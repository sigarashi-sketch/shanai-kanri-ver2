'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY, type ThemeKey } from '@/lib/theme';

// 着せ替え。この端末に覚え、<html data-theme> に入れる（CSS は globals.css の [data-theme]）。
//   最初の描画で色がちらつかないよう、layout の <head> の小さなスクリプトが先に data-theme を入れている。
type Ctx = { theme: ThemeKey; setTheme: (t: ThemeKey) => void };
const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, set] = useState<ThemeKey>(DEFAULT_THEME);
  useEffect(() => {
    try { const v = localStorage.getItem(THEME_STORAGE_KEY) as ThemeKey | null; if (v && THEMES.some((t) => t.key === v)) set(v); } catch { /* 既定のまま */ }
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const setTheme = (t: ThemeKey) => { set(t); try { localStorage.setItem(THEME_STORAGE_KEY, t); } catch { /* noop */ } };
  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Ctx {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error('ThemeProvider の外です');
  return c;
}

/** 着せ替えの色見本（4色の小さな四角）。 */
export function Swatches({ sw, size = 12 }: { sw: string[]; size?: number }) {
  return (
    <span className="inline-flex overflow-hidden rounded-[5px] ring-1 ring-black/10" aria-hidden>
      {sw.map((c, i) => <span key={i} style={{ background: c, width: size, height: size * 1.6 }} />)}
    </span>
  );
}
