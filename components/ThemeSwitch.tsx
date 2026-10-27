'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, MessageCircle, Palette } from 'lucide-react';
import { CHAT_SWATCHES, saveChatColors, useChatColors, type ChatColors } from '@/lib/chat-colors';
import { THEMES } from '@/lib/theme';
import { Swatches, useTheme } from './ThemeProvider';

/** 上のバーの「見た目」。押すと8つの着せ替えが出て、選ぶとすぐ変わる。下にチャットの色（こちら・相手・この端末に覚える・lib/chat-colors.ts） */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const chat = useChatColors(); // ここで html に色を入れる（上のバーはどの画面にもあるので、どの画面のチャットにも効く）
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
        <div role="menu" className="mo-scale-in absolute right-0 top-12 z-40 max-h-[calc(100vh-80px)] w-[280px] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-[0_14px_36px_rgba(15,20,38,.18)]">
          {THEMES.map((t) => (
            <button key={t.key} role="menuitemradio" aria-checked={theme === t.key} onClick={() => { setTheme(t.key); setOpen(false); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-body hover:bg-soft">
              <Swatches sw={t.sw} size={9} />
              <span className="flex-1">{t.name}</span>
              {theme === t.key && <Check size={15} strokeWidth={3} style={{ color: 'var(--a)' }} />}
            </button>
          ))}
          <ChatColorPick c={chat} />
        </div>
      )}
    </div>
  );
}

/** チャットの色：こちら（送った側）と相手。見本の吹き出しで見え方を出す */
function ChatColorPick({ c }: { c: ChatColors }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (side: 'out' | 'in', v?: string) => {
    void saveChatColors({ ...c, [side]: v }).then((r) => setMsg(r.ok ? { ok: true, text: '保存しました（どの端末でも同じ色）' } : { ok: false, text: `${r.error}・この端末にだけ残しました` }));
  };
  const row = (side: 'out' | 'in', label: string) => (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm font-semibold">{label}
        {c[side] && <button type="button" onClick={() => set(side, undefined)} className="ml-auto text-xs font-normal text-muted hover:underline">元の色に戻す</button>}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {CHAT_SWATCHES.map((h) => (
          <button key={h} type="button" onClick={() => set(side, h)} aria-label={`${label}を ${h} にする`} aria-pressed={c[side] === h}
            className="size-5 rounded-full border border-line" style={{ background: h, boxShadow: c[side] === h ? '0 0 0 2px var(--color-surface), 0 0 0 4px var(--a)' : undefined }} />
        ))}
        <label className="relative size-5 cursor-pointer overflow-hidden rounded-full border border-dashed border-field" title="好きな色を選ぶ">
          <input type="color" value={c[side] ?? (side === 'out' ? '#06C755' : '#FFFFFF')} onChange={(e) => set(side, e.target.value.toUpperCase())} className="absolute inset-0 size-full cursor-pointer opacity-0" aria-label={`${label}の色を自由に選ぶ`} />
          <span aria-hidden className="flex size-full items-center justify-center text-xs text-muted">＋</span>
        </label>
      </div>
    </div>
  );
  return (
    <div className="mt-1.5 flex flex-col gap-2 border-t border-line-soft px-2.5 pb-1.5 pt-2.5">
      <div className="flex items-center gap-1.5 text-sm font-bold"><MessageCircle size={14} />チャットの色<span className="text-xs font-normal text-muted">あなたの分として保存</span></div>
      <div className="flex flex-col gap-1 rounded-lg bg-soft p-2 text-sm">
        <div className="flex"><span className="rounded-[14px] rounded-bl-md border border-line px-2.5 py-1" style={{ background: 'var(--chat-in-bg, var(--color-surface))', color: 'var(--chat-in-fg, var(--color-ink))' }}>相手の吹き出し</span></div>
        <div className="flex justify-end"><span className="rounded-[14px] rounded-br-md px-2.5 py-1" style={{ background: 'var(--chat-out-bg, var(--a))', color: 'var(--chat-out-fg, var(--ao))' }}>こちらの吹き出し</span></div>
      </div>
      {row('out', 'こちら（送った側）')}
      {row('in', '相手')}
      {msg && <p role="status" className={`text-xs ${msg.ok ? 'text-ok' : 'text-bad'}`}>{msg.text}</p>}
    </div>
  );
}
