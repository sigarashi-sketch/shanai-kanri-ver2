'use client';

import { useEffect, useRef, useState } from 'react';
import { DrawerPortal } from './DrawerPortal';

// 上に重ねて出す窓の共通の部品（10-25：名前の小窓・要約）。
//   ・role="dialog"・aria-modal。開いたら中の「閉じる」（data-dialog-close）に、閉じたら開いたボタンに戻す
//   ・開いている間は後ろの画面をスクロールさせない
//   ・Escape は一番上の窓だけを閉じる（小窓の上の要約で Escape を押しても小窓までは閉じない・後ろの引き出しにも届かせない）
//   ・z は lib/layers.ts の [背景, 窓] を渡す
const stack: number[] = [];
let seq = 0;
let savedOverflow = '';

export function Dialog({ label, onClose, z, className, backdropClassName = 'bg-black/20', children }: {
  label: string; onClose: () => void; z: readonly [number, number]; className?: string; backdropClassName?: string; children: React.ReactNode;
}) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const me = useRef(0);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  // 開いた／閉じた：重なりの順・スクロール止め・Escape・戻すフォーカス
  useEffect(() => {
    const id = ++seq;
    me.current = id;
    const opener = document.activeElement as HTMLElement | null;
    if (stack.length === 0) { savedOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    stack.push(id);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || stack[stack.length - 1] !== id) return;
      e.stopPropagation();
      e.preventDefault();
      closeRef.current();
    };
    window.addEventListener('keydown', esc, true);
    return () => {
      window.removeEventListener('keydown', esc, true);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) document.body.style.overflow = savedOverflow;
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);

  // 窓が描けたら「閉じる」にフォーカス（無ければ窓そのもの）
  useEffect(() => {
    if (!el) return;
    const b = el.querySelector<HTMLElement>('[data-dialog-close]');
    (b ?? el).focus({ preventScroll: true });
  }, [el]);

  return (
    <DrawerPortal>
      <div className={`fixed inset-0 ${backdropClassName}`} style={{ zIndex: z[0] }} onClick={onClose} />
      <div ref={setEl} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`outline-none ${className ?? ''}`} style={{ zIndex: z[1] }}>
        {children}
      </div>
    </DrawerPortal>
  );
}
