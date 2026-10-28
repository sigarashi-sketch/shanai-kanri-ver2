'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CornerUpLeft, Download, Paperclip } from 'lucide-react';
import type { Bubble, ChatMedia, ChatQuoted } from '@/lib/live/person';

/** 返信（引用）の相手。text は思い出せる長さに縮めたもの */
export type ReplyTo = { id: string; who: string; text: string };

// トークの表示（10-25 shoya「チャットの見た目みずらい」「開いたら最新から開くように」）。
//   ・LINE と同じ並び：自分たち（送った側）は右・色つき、相手は左・白。日付が変わるところに区切り
//   ・吹き出しの色は人ごとに変えられる（lib/chat-colors.ts の --chat-out-* / --chat-in-*）
//   ・時刻は吹き出しの横に小さく。グループは送った人の名前を吹き出しの上に
//   ・開いたら一番下（最新）から。新しい書き込みが来たら、下の方を見ているときだけ下までついていく
//   ・画像はその場に出す（押すと別タブ・「保存」）。ファイルは名前と保存。引用リプライは吹き出しの上に引用元（今の chat.html と同じ・10-27）
//   ・onReply を渡すと、返信できる吹き出しの横に ↩（送れる画面だけ）
export function ChatLog({ bubbles, className, children, resetKey, onReply }: { bubbles: Bubble[]; className?: string; children?: React.ReactNode; resetKey?: string; onReply?: (r: ReplyTo) => void }) {
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
                  <div className={`min-w-0 whitespace-pre-wrap break-words rounded-[18px] text-body leading-[1.6] ${b.media ? 'p-1.5' : 'px-3.5 py-2'}`}
                    style={b.out
                      ? { background: 'var(--chat-out-bg, var(--a))', color: 'var(--chat-out-fg, var(--ao))', borderBottomRightRadius: 6 }
                      : { background: 'var(--chat-in-bg, var(--color-surface))', color: 'var(--chat-in-fg, var(--color-ink))', border: '1px solid var(--color-line)', borderBottomLeftRadius: 6 }}>
                    {b.quoted && <Quote q={b.quoted} />}
                    {b.media ? <Media m={b.media} /> : b.text}
                  </div>
                  {onReply && b.replyId && (
                    <button type="button" title="このメッセージに返信（引用）" aria-label="返信"
                      onClick={() => { const t = b.media ? (b.media.kind === 'image' ? '（画像）' : `（ファイル）${b.media.fileName || ''}`) : b.text.replace(/[\r\n]+/g, ' ').trim(); onReply({ id: b.replyId!, who: b.out ? b.who || '自社' : b.who || '相手', text: t.length > 80 ? t.slice(0, 80) + '…' : t }); }}
                      className="mb-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted hover:text-ink">
                      <CornerUpLeft size={14} />
                    </button>
                  )}
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

const size = (n?: number) => (!n ? '' : n < 1024 ? `${n}B` : n < 1048576 ? `${Math.round(n / 1024)}KB` : `${Math.round(n / 104857.6) / 10}MB`);

/** 引用リプライの引用元（見つからないものは そう書く） */
export function Quote({ q }: { q: ChatQuoted }) {
  return (
    <div title="引用リプライ" className={`mb-1 border-l-[3px] border-current pl-2 text-xs leading-snug opacity-75 ${q.found ? '' : 'italic'}`}>
      <span className="block font-semibold">{q.found ? q.sender || (q.direction === 'out' ? '自社' : '相手') : '引用'}</span>
      <span className="line-clamp-3 block">{q.found ? q.text || '' : '引用元のメッセージはこの画面に残っていません'}</span>
    </div>
  );
}

/** 画像はその場に・動画/音声は再生・ほかはファイル名と保存（読めないときは理由を1行） */
function Media({ m }: { m: ChatMedia }) {
  const [bad, setBad] = useState(false);
  if (bad) return <span className="px-2 text-sm" style={{ color: 'var(--tone-caution-fg)' }}>{m.sent ? '画像を表示できませんでした（開き直してください）' : '画像を取得できませんでした（LINE の保存期間切れの可能性）'}</span>;
  if (m.kind === 'image') return (
    <span className="flex flex-col items-end">
      <img src={m.url} alt={m.sent ? '送った画像' : '届いた画像'} loading="lazy" onError={() => setBad(true)} onClick={() => window.open(m.url, '_blank', 'noopener')}
        className="block max-h-[360px] max-w-[min(320px,60vw)] cursor-zoom-in rounded-[12px]" />
      {m.downloadUrl && <a href={m.downloadUrl} download className="mt-1 inline-flex items-center gap-1 px-1 text-xs underline opacity-80"><Download size={12} />保存</a>}
    </span>
  );
  if (m.kind === 'video' || m.kind === 'audio') {
    const El = m.kind;
    return <El src={m.url} controls className="block max-w-[min(320px,60vw)] rounded-[12px]" />;
  }
  return (
    <span className="flex flex-wrap items-center gap-x-2 px-2 py-1">
      <a href={m.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 break-all underline"><Paperclip size={14} />{m.fileName || 'ファイル'}{size(m.fileSize) && `（${size(m.fileSize)}）`}</a>
      {m.downloadUrl && <a href={m.downloadUrl} download className="text-xs underline opacity-80">保存</a>}
    </span>
  );
}
