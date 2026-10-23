'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { COLOR_STORAGE_KEY, cssVars, resolveColors, type ColorChoice, type ColorKey, type ModuleKey } from '@/lib/theme';

// 分類ごとの色をこの端末に覚え、CSS 変数として body の下に流す。
//   重複は resolveColors が自動でずらす（notes に理由）。
type Ctx = {
  keys: Record<ModuleKey, ColorKey>;
  notes: string[];
  choice: ColorChoice;
  setColor: (m: ModuleKey, c: ColorKey) => void;
  reset: () => void;
  restore: (c: ColorChoice) => void;
};
const ColorCtx = createContext<Ctx | null>(null);

export function ColorProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoice] = useState<ColorChoice>({});
  useEffect(() => {
    try { setChoice(JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) || '{}')); } catch { /* 使えない端末は既定の色 */ }
  }, []);
  const { keys, notes } = useMemo(() => resolveColors(choice), [choice]);
  // いつも「いま」の選び方から作る（取り消しが古い写しで上書きしないように）
  const save = (f: (c: ColorChoice) => ColorChoice) => setChoice((cur) => {
    const next = f(cur);
    try { localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
    return next;
  });
  const value: Ctx = {
    keys,
    notes,
    choice,
    setColor: (m, c) => save((cur) => ({ ...cur, [m]: c })),
    reset: () => save(() => ({})),
    restore: (c) => save(() => c),
  };
  return (
    <ColorCtx.Provider value={value}>
      <div style={cssVars(keys) as React.CSSProperties} className="min-h-screen">{children}</div>
    </ColorCtx.Provider>
  );
}

export function useColors(): Ctx {
  const c = useContext(ColorCtx);
  if (!c) throw new Error('ColorProvider の外です');
  return c;
}
