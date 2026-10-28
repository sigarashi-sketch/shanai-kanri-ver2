import type { ReactNode } from 'react';

// 講座の本文（Markdown）を描く小さな部品。外の道具は入れていない＝使える書き方は ここにあるものだけ:
//   見出し（## / ###）・箇条書き（- ）・番号つき（1. ）・表（| a | b |）・コードの囲み（~~~ か ```）・引用（> ）・**太字**・リンク [文字](https://…)
//   HTML は そのまま文字として出る（dangerouslySetInnerHTML は使わない）
function inline(s: string, k: string): ReactNode[] {
  const out: ReactNode[] = []; const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g; let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(m[1] !== undefined ? <strong key={`${k}-${i++}`} className="font-bold text-[#0F172A]">{m[1]}</strong>
      : <a key={`${k}-${i++}`} href={m[3]} target="_blank" rel="noopener noreferrer" className="font-medium text-[#0B63CE] underline decoration-[#0B63CE]/30 underline-offset-2 hover:decoration-[#0B63CE]">{m[2]}</a>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export default function Md({ text, className = '' }: { text: string; className?: string }) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n'); const out: ReactNode[] = []; let i = 0; let n = 0;
  const key = () => `b${n++}`;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const fence = /^(~~~|```)/.exec(l.trim());
    if (fence) {
      const buf: string[] = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) buf.push(lines[i++]);
      i++;
      out.push(<pre key={key()} className="my-4 overflow-x-auto rounded-lg bg-[#0F172A] px-4 py-3 font-mono text-[13px] leading-relaxed text-[#E2E8F0]"><code>{buf.join('\n')}</code></pre>);
      continue;
    }
    const h = /^(#{2,4})\s+(.+)$/.exec(l);
    if (h) {
      const k = key();
      out.push(h[1].length === 2 ? <h3 key={k} className="mt-9 border-b border-[#0F172A]/[.08] pb-2 text-[19px] font-bold tracking-tight text-[#0F172A] first:mt-0">{inline(h[2], k)}</h3>
        : <h4 key={k} className="mt-6 text-[15.5px] font-bold text-[#0F172A]">{inline(h[2], k)}</h4>);
      i++; continue;
    }
    if (l.trim().startsWith('|') && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const head = cells(l); i += 2; const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      const k = key();
      out.push(
        <div key={k} className="my-4 overflow-x-auto rounded-lg border border-[#0F172A]/[.1]">
          <table className="w-full min-w-[520px] border-collapse text-left text-[13.5px] leading-relaxed">
            <thead><tr className="bg-[#F1F3F8]">{head.map((c, j) => <th key={j} className="whitespace-nowrap px-3 py-2 font-semibold text-[#334155]">{inline(c, `${k}h${j}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri} className="border-t border-[#0F172A]/[.07]">{head.map((_, j) => <td key={j} className="px-3 py-2 align-top text-[#334155]">{inline(r[j] || '', `${k}r${ri}c${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>);
      continue;
    }
    const isUl = (s: string) => /^\s*[-・]\s+/.test(s); const isOl = (s: string) => /^\s*\d+[.)]\s+/.test(s);
    if (isUl(l) || isOl(l)) {
      const ol = isOl(l); const items: string[] = [];
      while (i < lines.length && (ol ? isOl(lines[i]) : isUl(lines[i]))) { items.push(lines[i].replace(ol ? /^\s*\d+[.)]\s+/ : /^\s*[-・]\s+/, '')); i++; }
      const k = key(); const cls = `my-3 space-y-1.5 pl-5 text-[15px] leading-[1.85] text-[#334155] ${ol ? 'list-decimal' : 'list-disc'} marker:text-[#94A3B8]`;
      out.push(ol ? <ol key={k} className={cls}>{items.map((t, j) => <li key={j} className="pl-1">{inline(t, `${k}-${j}`)}</li>)}</ol> : <ul key={k} className={cls}>{items.map((t, j) => <li key={j} className="pl-1">{inline(t, `${k}-${j}`)}</li>)}</ul>);
      continue;
    }
    if (l.startsWith('>')) {
      const buf: string[] = []; while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
      const k = key(); out.push(<blockquote key={k} className="my-4 border-l-[3px] border-[#CBD5E1] pl-4 text-[14.5px] leading-[1.85] text-[#475569]">{inline(buf.join(' '), k)}</blockquote>);
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,4}\s|~~~|```|>|\s*\|)/.test(lines[i]) && !isUl(lines[i]) && !isOl(lines[i])) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }   // どの形にも当たらない行（1つだけの「|」など）は そのまま段落に
    const k = key();
    out.push(<p key={k} className="my-3 text-[15px] leading-[1.9] text-[#334155]">{buf.flatMap((t, j) => [...(j ? [<br key={`${k}br${j}`} />] : []), ...inline(t, `${k}-${j}`)])}</p>);
  }
  return <div className={className}>{out}</div>;
}
