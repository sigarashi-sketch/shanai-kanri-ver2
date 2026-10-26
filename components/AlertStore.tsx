'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_RULES, type Rule, type Who } from '@/lib/alert-rules';
import type { Level } from '@/lib/types/base';

// アラート設定を全画面で1つにする置き場（アラート設定・残業・有給・現場契約・当日の出勤状況が同じものを読む）。
//   本番前の手元版はこの端末に覚えるだけ。本物につなぐときは DB の設定テーブル1つに置き換える。
const KEY = 'v2_alerts';
type Ctx = { rules: Rule[]; setRules: (f: (rs: Rule[]) => Rule[]) => void; reset: () => void };
const AlertCtx = createContext<Ctx | null>(null);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [rules, set] = useState<Rule[]>(DEFAULT_RULES);
  useEffect(() => { try { const v = localStorage.getItem(KEY); if (v) set(JSON.parse(v)); } catch { /* 決まりの既定のまま */ } }, []);
  const setRules = (f: (rs: Rule[]) => Rule[]) => set((rs) => {
    const next = f(rs);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
    return next;
  });
  const reset = () => { try { localStorage.removeItem(KEY); } catch { /* noop */ } set(DEFAULT_RULES); };
  return <AlertCtx.Provider value={{ rules, setRules, reset }}>{children}</AlertCtx.Provider>;
}

export function useAlerts(): Ctx {
  const c = useContext(AlertCtx);
  if (!c) throw new Error('AlertProvider の外です');
  return c;
}

/** その決まりの1つ。 */
export function useRule(key: Rule['key']): Rule {
  return useAlerts().rules.find((r) => r.key === key)!;
}

/** 段階ごとの宛先（止めている決まりは空）。 */
export function stageTo(rule: Rule, level: Level): Who[] {
  if (rule.mode === '止める' || level === 'ok') return [];
  return rule.stages.find((s) => s.level === level)?.to ?? [];
}
