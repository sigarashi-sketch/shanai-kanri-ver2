'use client';

import { useEffect, useState } from 'react';
import { contrast } from './theme';

// チャットの吹き出しの色（10-27 shoya「チャットの色は任意でカスタムできて変えられるように 相手とこちら側の」）。
//   ・こちら（送った側）と相手の2つを、人ごとに覚える（同日「個人各自で設定保持」＝どの端末でも同じ。置き場は /api/live/my-prefs＝saiyou.settings の v2_prefs:<メール>）。
//     この端末の localStorage は控え（開いた瞬間に出す・読めないときに使う）。選ばなければ今の色（こちら＝分類の色・相手＝白）
//   ・選んだ色は html の CSS 変数 --chat-out-bg / --chat-in-bg（字の色 -fg は 背景から白か黒を自動）。吹き出しを描くところ（components/ChatLog.tsx・components/sy/ChatBubble.tsx）が読む
//   ・変えるのは上のバーの「見た目」→「チャットの色」（components/ThemeSwitch.tsx）
export type ChatColors = { out?: string; in?: string };
const KEY = 'v2_chat_colors';
const EV = 'v2-chat-colors';
const HEX = /^#[0-9a-f]{6}$/i;
/** 選びやすい色（こちら・相手 共通） */
export const CHAT_SWATCHES = ['#06C755', '#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#F5C400', '#0F766E', '#18181B', '#FFFFFF', '#F1F5F9', '#E0F2FE', '#FEF3C7', '#DCFCE7', '#FCE7F3'];

export function readChatColors(): ChatColors {
  try {
    return clean(JSON.parse(localStorage.getItem(KEY) || '{}') as ChatColors);
  } catch { return {}; }
}
const fgOf = (bg: string) => (contrast(bg, '#FFFFFF') >= 3 ? '#FFFFFF' : '#18181B');
function apply(c: ChatColors) {
  const s = document.documentElement.style;
  for (const side of ['out', 'in'] as const) {
    const v = c[side];
    if (v) { s.setProperty(`--chat-${side}-bg`, v); s.setProperty(`--chat-${side}-fg`, fgOf(v)); }
    else { s.removeProperty(`--chat-${side}-bg`); s.removeProperty(`--chat-${side}-fg`); }
  }
}
const clean = (o: ChatColors | null | undefined): ChatColors => ({ out: HEX.test(o?.out ?? '') ? o!.out : undefined, in: HEX.test(o?.in ?? '') ? o!.in : undefined });
function keepLocal(c: ChatColors) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* 覚えられない端末では今だけ */ }
  apply(c);
  window.dispatchEvent(new Event(EV));
}
/** 選んだ色を本人の分として保存（だめなら この端末にだけ残る＝error を返す） */
export async function saveChatColors(c: ChatColors): Promise<{ ok: boolean; error?: string }> {
  keepLocal(c);
  try {
    const r = await fetch('/api/live/my-prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefs: { chat: c } }) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return r.ok && j.ok ? { ok: true } : { ok: false, error: j.error || `保存できませんでした（${r.status}）` };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
// 本人の分は 開いたページで1回だけ読む（どの部品が呼んでも同じ1回）
let fetched: Promise<void> | null = null;
function pullServer() {
  fetched ??= fetch('/api/live/my-prefs', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { prefs?: { chat?: ChatColors } | null } | null) => { if (j && j.prefs !== undefined) keepLocal(clean(j.prefs?.chat)); })
    .catch(() => { /* 読めなければ この端末の控えのまま */ });
  return fetched;
}
/** いまの色（変わったらほかの部品も追いかける）。Shell で1回呼べば html に入る */
export function useChatColors(): ChatColors {
  const [c, setC] = useState<ChatColors>({});
  useEffect(() => {
    const load = () => { const x = readChatColors(); setC(x); apply(x); };
    load();
    void pullServer();
    window.addEventListener(EV, load);
    window.addEventListener('storage', load);
    return () => { window.removeEventListener(EV, load); window.removeEventListener('storage', load); };
  }, []);
  return c;
}
