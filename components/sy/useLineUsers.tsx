'use client';
import type { PinKind } from '@/lib/sy/pins';
import { useCallback, useEffect, useState } from 'react';

export interface LineUser {
  user_id: string; display_name: string; picture_url: string; followed: boolean; subject_key: string; subject_name: string;
  last_message_at: string | null; last_text: string; last_direction: string; unread: number; created_at: string;
  claimed_name: string; claimed_kana: string; claimed_at: string | null; name_asked_at: string | null; name_guesses: string[];
  pins?: string[];                   // 付いているピンの種類の id（0017・lib/pins.ts）
  ball_cleared_at?: string | null;   // 「対応済み」を押した時点の last_message_at（0010・lib/ball.ts）
  staff?: boolean;                   // 内勤（ログインできる人と同じ名前）。一覧で紫に出す（api/s/line/users）
}

// 公式LINEの友だち一覧。pollMs を渡すと定期的に読み直す（チャットの新着）。
export interface LegacyChat {
  chat_id: string; name: string; friend: boolean; last_talked_at: string | null; last_text: string; message_count: number;
  user_id: string | null; match_kind: string; subject_key: string; subject_name: string; name_guesses: string[];
}

export function useLineUsers(pollMs = 0) {
  const [users, setUsers] = useState<LineUser[] | null>(null);
  const [legacy, setLegacy] = useState<LegacyChat[]>([]);
  const [pinKinds, setPinKinds] = useState<PinKind[]>([]);
  const [configured, setConfigured] = useState(true);
  const [bot, setBot] = useState<{ name?: string; basicId?: string; addUrl?: string } | null>(null);
  const reload = useCallback(() =>
    fetch('/api/sy/s/line/users').then((r) => r.json()).then((j) => { if (j.users) { setUsers(j.users); setConfigured(!!j.configured); setBot(j.bot || null); setLegacy(j.legacy || []); setPinKinds(j.pinKinds || []); } }).catch(() => {}), []);
  useEffect(() => {
    reload();
    if (!pollMs) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, pollMs);
    return () => clearInterval(t);
  }, [reload, pollMs]);
  return { users, setUsers, legacy, setLegacy, pinKinds, setPinKinds, configured, bot, reload };
}

export function LineNotConfigured() {
  return (
    <div className="m-4 md:m-6 rounded-lg bg-ig-subtle p-4 text-sm text-ig-warn ring-1 ring-ig-border">
      公式LINEの鍵がまだ登録されていません。登録するとここで送受信できるようになります。
    </div>
  );
}
