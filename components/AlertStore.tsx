'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { DEFAULT_RULES, type Rule, type Who } from '@/lib/alert-rules';
import type { Level } from '@/lib/types/base';

// アラート設定を全画面で1つにする置き場（アラート設定・残業・有給・現場契約・当日の出勤状況が同じものを読む）。
//   本物（10-26 shoya「入ってない本番データもぶちこんで」）：今の社内システムの app_settings（v2_alerts）に全員で1つ。
//     読む＝GET /api/live/jinji?what=kv-alerts／書く＝POST {action:'kv-save', key:'alerts'}（労務/営業管理を「承認」で持つ人だけ・今のシステムでもロールを見る）
//   ログインしていない・読めないときは、この端末の控え（localStorage）で動く。保存に失敗したら saved に理由を出す
//   ★ここは決まり（段階・宛先・届け方）を持つだけ。これを見て人に送る仕組みはまだ無い（送らない）
const KEY = 'v2_alerts';
export type AlertSaved = { state: 'loading' | 'shared' | 'local' | 'saving' | 'error'; error?: string; at?: string };
type Ctx = { rules: Rule[]; setRules: (f: (rs: Rule[]) => Rule[]) => void; reset: () => void; saved: AlertSaved };
const AlertCtx = createContext<Ctx | null>(null);

const isRules = (v: unknown): v is Rule[] => Array.isArray(v) && v.every((r) => r && typeof r === 'object' && 'key' in r && 'stages' in r);
// 既定に後から足した決まりも出るように、保存した分を既定の並びに重ねる
const merge = (saved: Rule[]) => DEFAULT_RULES.map((d) => saved.find((s) => s.key === d.key) ?? d);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [rules, set] = useState<Rule[]>(DEFAULT_RULES);
  const [saved, setSaved] = useState<AlertSaved>({ state: 'loading' });
  const shared = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let on = true;
    try { const v = localStorage.getItem(KEY); if (v) { const p = JSON.parse(v); if (isRules(p)) set(merge(p)); } } catch { /* 決まりの既定のまま */ }
    void fetch('/api/live/jinji?what=kv-alerts', { cache: 'no-store' })
      .then(async (r) => ({ ok: r.ok, j: (await r.json().catch(() => ({}))) as { value?: { data?: unknown; updatedAt?: string } | null; error?: string } }))
      .then(({ ok, j }) => {
        if (!on) return;
        if (!ok) { setSaved({ state: 'local', error: j.error }); return; }
        shared.current = true;
        const d = j.value?.data;
        if (isRules(d)) set(merge(d));
        setSaved({ state: 'shared', at: j.value?.updatedAt });
      })
      .catch(() => { if (on) setSaved({ state: 'local' }); });
    return () => { on = false; };
  }, []);
  const push = (next: Rule[] | null) => {
    if (!shared.current) return;
    if (timer.current) clearTimeout(timer.current);
    setSaved((s) => ({ ...s, state: 'saving', error: undefined }));
    // 続けて選んだときは最後の1回だけ送る
    timer.current = setTimeout(() => {
      void fetch('/api/live/jinji', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'kv-save', key: 'alerts', value: next ?? DEFAULT_RULES }) })
        .then(async (r) => ({ ok: r.ok, j: (await r.json().catch(() => ({}))) as { updatedAt?: string; error?: string } }))
        .then(({ ok, j }) => setSaved(ok ? { state: 'shared', at: j.updatedAt } : { state: 'error', error: j.error || '保存できませんでした' }))
        .catch((e) => setSaved({ state: 'error', error: (e as Error).message }));
    }, 600);
  };
  const setRules = (f: (rs: Rule[]) => Rule[]) => set((rs) => {
    const next = f(rs);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
    push(next);
    return next;
  });
  const reset = () => { try { localStorage.removeItem(KEY); } catch { /* noop */ } set(DEFAULT_RULES); push(null); };
  return <AlertCtx.Provider value={{ rules, setRules, reset, saved }}>{children}</AlertCtx.Provider>;
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
