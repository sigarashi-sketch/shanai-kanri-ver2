'use client';
import { FileText, Megaphone } from 'lucide-react';

// チャットの吹き出し1つ。チャット画面（ChatView）と 名簿の詳細の「チャット」タブ（MemberChat）で同じものを使う
export interface Msg { legacy?: boolean; id: string; direction: 'in' | 'out'; type: string; text: string; line_message_id: string | null; sender_name: string; broadcast_id: string | null; created_at: string; media?: { kind: 'image' | 'pdf' | 'video'; url: string; name: string } }

export function Bubble({ m }: { m: Msg }) {
  if (m.type === 'event') return <div className="text-center text-[11px] text-ig-muted">{m.text}・{new Date(m.created_at).toLocaleString('ja-JP')}</div>;
  return (
    <div className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[75%]">
        <div className={`ig-rise whitespace-pre-wrap break-words rounded-[22px] px-4 py-2 text-[15px] leading-snug ${m.direction === 'out' ? (m.legacy ? 'bg-ig-bubble-out/75 text-ig-bubble-out-fg' : 'bg-ig-bubble-out text-ig-bubble-out-fg') : 'bg-ig-bubble-in text-ig-bubble-in-fg'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {m.media?.kind === 'image' ? <a href={m.media.url} target="_blank"><img src={m.media.url} alt="画像" className="max-h-60 rounded-lg" /></a>
            : m.media?.kind === 'video' ? <video src={m.media.url} controls preload="metadata" className="max-h-60 rounded-lg" />
            : m.media?.kind === 'pdf' ? <a href={m.media.url} target="_blank" className="inline-flex items-center gap-1.5 underline"><FileText size={16} className="shrink-0" />{m.media.name || 'PDF'}</a>
            : m.type === 'image' && m.line_message_id ? <a href={`/api/sy/s/line/content/${m.line_message_id}`} target="_blank"><img src={`/api/sy/s/line/content/${m.line_message_id}`} alt="画像" className="max-h-60 rounded-lg" /></a>
            : m.type === 'file' && m.line_message_id ? <a href={`/api/sy/s/line/content/${m.line_message_id}`} target="_blank" className="inline-flex items-center gap-1.5 underline"><FileText size={16} className="shrink-0" />{m.text}</a>
            : m.text}
        </div>
        <div suppressHydrationWarning className={`mt-0.5 text-[10px] text-ig-muted ${m.direction === 'out' ? 'text-right' : ''}`}>
          {m.legacy && '過去・'}{m.direction === 'out' && (m.broadcast_id ? <><Megaphone size={10} className="inline -mt-0.5" /> 配信・</> : m.sender_name ? m.sender_name + '・' : '')}{new Date(m.created_at).toLocaleString('ja-JP', { year: m.legacy ? 'numeric' : undefined, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
