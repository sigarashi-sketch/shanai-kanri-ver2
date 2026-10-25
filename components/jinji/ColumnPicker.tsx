'use client';

import { useEffect, useRef, useState } from 'react';
import { Columns3, GripVertical } from 'lucide-react';

// 表の列を選ぶ・並べ替える（今の名簿の「列の表示」と同じ考え・10-25）。
//   ・選んだ列と並びはこの端末に覚える（localStorage・人ごとに違うのは列の表示だけ）
//   ・並べ替えはマウスでつまんで動かす（↑↓ボタンにしない）
export type ColDef = { k: string; t: string; tip?: string };

export function useColumns(storeKey: string, all: readonly ColDef[], defaults: readonly string[]) {
  const [keys, setKeys] = useState<string[]>([...defaults]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      const v = raw ? (JSON.parse(raw) as unknown) : null;
      if (Array.isArray(v)) { const ok = v.filter((k): k is string => typeof k === 'string' && all.some((c) => c.k === k)); if (ok.length) setKeys(ok); }
    } catch { /* noop */ }
  }, [storeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (next: string[]) => { setKeys(next); try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* noop */ } };
  return { keys, save, reset: () => { setKeys([...defaults]); try { localStorage.removeItem(storeKey); } catch { /* noop */ } } };
}

export function ColumnPicker({ all, keys, onChange, onReset }: { all: readonly ColDef[]; keys: string[]; onChange: (k: string[]) => void; onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  // 並び：選んでいる列（その順）→ 選んでいない列（元の順）
  const order = [...keys.map((k) => all.find((c) => c.k === k)!).filter(Boolean), ...all.filter((c) => !keys.includes(c.k))];
  const toggle = (k: string) => onChange(keys.includes(k) ? keys.filter((x) => x !== k) : [...keys, k]);
  const drop = (over: string) => {
    if (!drag || drag === over || !keys.includes(drag) || !keys.includes(over)) return;
    const next = keys.filter((x) => x !== drag);
    next.splice(next.indexOf(over), 0, drag);
    onChange(next);
  };
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-field bg-surface px-3 text-body"><Columns3 size={14} />列の表示</button>
      {open && (
        <div className="mo-scale-in absolute right-0 top-11 z-30 w-[260px] rounded-xl border border-line bg-surface p-2 shadow-[0_12px_32px_rgba(25,27,46,.18)]">
          <div className="px-1.5 pb-1.5 text-xs text-faint">チェックで出す列。つまんで動かすと並びが変わります（この端末に覚えます）</div>
          <ul className="max-h-[50vh] overflow-y-auto">
            {order.map((c) => {
              const on = keys.includes(c.k);
              return (
                <li key={c.k} draggable={on} onDragStart={() => setDrag(c.k)} onDragEnd={() => setDrag(null)} onDragOver={(e) => { if (on) e.preventDefault(); }} onDrop={() => drop(c.k)}
                  className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-body hover:bg-soft" style={drag === c.k ? { opacity: 0.4 } : undefined} title={c.tip}>
                  <GripVertical size={14} className={on ? 'cursor-grab text-faint' : 'text-transparent'} />
                  <label className="flex flex-1 items-center gap-2"><input type="checkbox" checked={on} onChange={() => toggle(c.k)} />{c.t}</label>
                </li>
              );
            })}
          </ul>
          <button onClick={onReset} className="mt-1 w-full rounded-lg py-1.5 text-sm text-muted underline">はじめの列に戻す</button>
        </div>
      )}
    </div>
  );
}
