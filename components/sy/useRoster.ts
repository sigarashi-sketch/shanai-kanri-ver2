'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePoll } from '@/components/Live';
import type { Member, ProperLite } from '@/components/sy/compat';

export interface Club { id: string; name: string; emoji: string }

// 名簿（いけどん本番＋採用版の部活/候補者）と部活マスタを読む。いけどん側が重いので数秒かかる。
export function useRoster() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [proper, setProper] = useState<ProperLite[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [month, setMonth] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const last = useRef({ roster: '', clubs: '' });
  const reload = useCallback(() => {
    setError('');
    fetch('/api/sy/s/roster').then(async (r) => {
      const t = await r.text();
      const j = JSON.parse(t);
      if (!r.ok) { last.current.roster = ''; setError(j.error || '読み込みに失敗しました'); return; }
      if (t === last.current.roster) return;   // 変わっていなければ描き直さない
      last.current.roster = t;
      setMembers(j.members); setProper(j.proper || []); setMonth(j.month); setWarnings(j.warnings || []);
    }).catch(() => setError('通信に失敗しました'));
    fetch('/api/sy/s/clubs').then((r) => r.text()).then((t) => { if (t === last.current.clubs) return; last.current.clubs = t; setClubs(JSON.parse(t).clubs || []); }).catch(() => {});
  }, []);
  useEffect(() => { reload(); }, [reload]);
  // リアルタイム更新（10-27）：重いので2分ごと。書き込みが通ったときもすぐ読み直す（components/Live.tsx usePoll）
  usePoll(reload, 120_000);
  const patchMember = useCallback((key: string, p: Partial<Member>) =>
    setMembers((ms) => ms && ms.map((m) => (m.key === key ? { ...m, ...p } : m))), []);
  return { members, proper, clubs, setClubs, month, warnings, error, reload, patchMember };
}
