'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { FIELD_RULES, daysFrom, fmtDate, type Yoyaku } from '@/lib/types/jinji';

// 変更の予約を全画面で1つにする置き場（ホーム・社員ページが同じものを読む）。
//   見本の予約は持たない（10-26）。本物の予約は変更の予約の画面（/api/live/jinji と名簿の予約）から読む。
//   前の手元版がこの端末に覚えた分（見本が混ざっている）は読まずに消す。
const KEY = 'v2_yoyaku';
type Ctx = { rows: Yoyaku[]; setRows: (f: (rs: Yoyaku[]) => Yoyaku[]) => void; reset: () => void };
const YoyakuCtx = createContext<Ctx | null>(null);

export function YoyakuProvider({ children }: { children: React.ReactNode }) {
  const [rows, set] = useState<Yoyaku[]>([]);
  useEffect(() => { try { localStorage.removeItem(KEY); } catch { /* noop */ } }, []);
  const setRows = (f: (rs: Yoyaku[]) => Yoyaku[]) => set((rs) => f(rs));
  const reset = () => set([]);
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
