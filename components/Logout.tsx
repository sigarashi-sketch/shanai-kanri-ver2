'use client';

import { LogOut } from 'lucide-react';

// ログアウト（10-28 shoya「ログアウトボタンつけてほしい すべての画面に」）。上のバー・左メニューの下・営業共有リスト・入れない人の入口で同じものを使う
export const logout = () => { void fetch('/api/ike-auth/logout', { method: 'POST' }).finally(() => window.location.reload()); };

export function LogoutButton({ className = '', label = 'ログアウト' }: { className?: string; label?: string }) {
  return (
    <button type="button" onClick={logout} title="ログアウト" className={`inline-flex items-center gap-1.5 ${className}`}>
      <LogOut size={15} strokeWidth={1.8} className="shrink-0" />{label}
    </button>
  );
}
