'use client';
import { useCallback, useEffect, useState } from 'react';
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
  const reload = useCallback(() => {
    setError('');
    fetch('/api/sy/s/roster').then(async (r) => {
      const j = await r.json();
      if (!r.ok) { setError(j.error || '読み込みに失敗しました'); return; }
      setMembers(j.members); setProper(j.proper || []); setMonth(j.month); setWarnings(j.warnings || []);
    }).catch(() => setError('通信に失敗しました'));
    fetch('/api/sy/s/clubs').then((r) => r.json()).then((j) => setClubs(j.clubs || []));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const patchMember = useCallback((key: string, p: Partial<Member>) =>
    setMembers((ms) => ms && ms.map((m) => (m.key === key ? { ...m, ...p } : m))), []);
  return { members, proper, clubs, setClubs, month, warnings, error, reload, patchMember };
}
