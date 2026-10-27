'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Bubble } from '@/lib/live/person';

// トークの表示（10-25 shoya「チャットの見た目みずらい」「開いたら最新から開くように」）。
//   ・LINE と同じ並び：自分たち（送った側）は右・色つき、相手は左・白。日付が変わるところに区切り
//   ・吹き出しの色は人ごとに変えられる（lib/chat-colors.ts の --chat-out-* / --chat-in-*）
//   ・時刻は吹き出しの横に小さく。グループは送った人の名前を吹き出しの上に
//   ・開いたら一番下（最新）から。新しい書き込みが来たら、下の方を見ているときだけ下までついていく
export function ChatLog({ bubbles, className, children, resetKey }: { bubbles: Bubble[]; className?: string; children?: React.ReactNode; resetKey?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const opened = useRef<string | undefined>(undefined);
  const last = bubbles[bubbles.length - 1]?.key ?? '';

  // 開いたとき（相手が変わったとき）は必ず最新へ
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !bubbles.length) return;
    if (opened.current !== resetKey) { opened.current = resetKey; el.scrollTop = el.scrollHeight; nearBottom.current = true; return; }
    if (nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [last, bubbles.length, resetKey]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const on = () => { nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; };
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);

  let prevDay = '';
  return (
    <div ref={box} className={`flex flex-col gap-1.5 overflow-y-auto px-4 py-3 ${className ?? ''}`} style={{ background: 'var(--color-sunken)' }}>
      {children}
      {bubbles.map((b, i) => {
        const [day, time] = b.at.includes(' ') ? b.at.split(' ') : ['', b.at];
        const sep = day && day !== prevDay;
        if (day) prevDay = day;
        const sameWho = i > 0 && bubbles[i - 1].out === b.out && bubbles[i - 1].who === b.who && !sep;
        return (
          <div key={b.key}>
            {sep && <div className="my-2 flex justify-center"><span className="rounded-full px-3 py-0.5 text-xs font-semibold text-muted" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)' }}>{day}</span></div>}
            <div className={`flex ${b.out ? 'justify-end' : 'justify-start'} ${sameWho ? '' : 'mt-1.5'}`}>
              <div className={`flex max-w-[78%] flex-col ${b.out ? 'items-end' : 'items-start'}`}>
                {b.who && !sameWho && <span className="mb-0.5 px-1 text-xs font-semibold text-muted">{b.who}</span>}
                <div className={`flex items-end gap-1.5 ${b.out ? 'flex-row-reverse' : ''}`}>
                  <div className="whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2 text-body leading-[1.6]"
                    style={b.out
                      ? { background: 'var(--chat-out-bg, var(--a))', color: 'var(--chat-out-fg, var(--ao))', borderBottomRightRadius: 6 }
                      : { background: 'var(--chat-in-bg, var(--color-surface))', color: 'var(--chat-in-fg, var(--color-ink))', border: '1px solid var(--color-line)', borderBottomLeftRadius: 6 }}>
                    {b.text}
                  </div>
                  <span className="shrink-0 pb-0.5 text-xs text-faint">{time}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
