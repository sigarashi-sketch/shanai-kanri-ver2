'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { FIELD_RULES, YOYAKU, daysFrom, fmtDate, type Yoyaku } from '@/lib/yoyaku-sample';

// 変更の予約を全画面で1つにする置き場（変更の予約・ホーム・社員ページ・社員一覧が同じものを読む）。
//   本番前の手元版はこの端末に覚えるだけ。本物につなぐときは DB の予約テーブル1つに置き換える。
const KEY = 'v2_yoyaku';
type Ctx = { rows: Yoyaku[]; setRows: (f: (rs: Yoyaku[]) => Yoyaku[]) => void; reset: () => void };
const YoyakuCtx = createContext<Ctx | null>(null);

export function YoyakuProvider({ children }: { children: React.ReactNode }) {
  const [rows, set] = useState<Yoyaku[]>(YOYAKU);
  useEffect(() => { try { const v = localStorage.getItem(KEY); if (v) set(JSON.parse(v)); } catch { /* 見本のまま */ } }, []);
  const setRows = (f: (rs: Yoyaku[]) => Yoyaku[]) => set((rs) => {
    const next = f(rs);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
    return next;
  });
  const reset = () => { try { localStorage.removeItem(KEY); } catch { /* noop */ } set(YOYAKU); };
  return <YoyakuCtx.Provider value={{ rows, setRows, reset }}>{children}</YoyakuCtx.Provider>;
}

export function useYoyaku(): Ctx {
  const c = useContext(YoyakuCtx);
  if (!c) throw new Error('YoyakuProvider の外です');
  return c;
}

export const isPending = (r: Yoyaku) => r.state === '予約中' || r.state === '承認待ち';

/** その人の、まだ切り替わっていない予約（日付の早い順）。 */
export function usePersonYoyaku(personId: string) {
  return useYoyaku().rows.filter((r) => r.personId === personId && isPending(r)).sort((a, b) => a.date.localeCompare(b.date));
}

/** 一覧に1行で出す形。「10/26（月）〜 現場 B社（大崎）」 */
export const yoyakuLine = (r: Yoyaku) => `${fmtDate(r.date)}〜 ${r.field} ${r.to}${r.state === '承認待ち' ? '（承認待ち）' : ''}`;

/** n日以内に切り替わるもの。 */
export const within = (rs: Yoyaku[], n: number) => rs.filter((r) => isPending(r) && daysFrom(r.date) >= 0 && daysFrom(r.date) <= n).sort((a, b) => a.date.localeCompare(b.date));

export const moduleOf = (r: Yoyaku) => FIELD_RULES[r.field].module;
