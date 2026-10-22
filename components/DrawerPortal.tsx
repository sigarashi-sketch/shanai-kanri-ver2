'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// 右から出るパネル（連絡・スキシ）の置き場。
//   position: fixed は、祖先に transform（mo-axis などの動き）や backdrop-filter（上のバーのすりガラス）があると
//   画面ではなくその祖先基準になり、パネルが途中で切れたりバーの中に押し込まれたりする。
//   Shell が持つ #drawer-root（分類色の CSS 変数は届く／transform は無い）に描く。
export function DrawerPortal({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.getElementById('drawer-root')), []);
  return el ? createPortal(children, el) : null;
}
