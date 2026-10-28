'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Member } from '@/components/sy/compat';
import { Avatar, Chip, inputCls } from '@/components/sy/ui';

// CCNA コースの管理（/kyouiku の「CCNA」タブ）＝「配る人」だけ。計画は docs/kyouiku-ccna.md
//   ・配る人 … CCNA を出す人を、人ごとにオンにする（オンにした人の受講ページに「CCNA」コースが出る）
//   ★モンスターと問題の「レビュー」タブは 2026-10-20 に消した（shoya「ポケモン要素のやつ全部消していい」）
interface Data { members: Record<string, boolean>; prep?: Record<string, boolean>; me: string }

export default function CcnaAdmin({ members, staff }: { members: Member[] | null; staff: { email: string; name: string }[] }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => { fetch('/api/sy/s/ccna').then(async (r) => { const j = await r.json(); if (!r.ok) setErr(j.error || '読み込めませんでした'); else setD(j); }).catch(() => setErr('通信に失敗しました')); }, []);
  useEffect(() => { load(); }, [load]);
  const post = useCallback((body: object) => fetch('/api/sy/s/ccna', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) })), []);

  if (err && !d) return <p className="m-6 rounded-lg bg-ig-hover p-3 text-sm text-ig-danger">{err}</p>;
  if (!d) return <p className="m-6 text-sm text-ig-muted">読み込み中…</p>;

  return (
    <div>
      {err && <p className="mx-4 mt-4 rounded-lg bg-ig-hover p-3 text-sm md:mx-8">{err}</p>}
      <People members={members} staff={staff} on={d.members} prep={d.prep || {}} onPrep={async (key, prep) => { const { ok, j } = await post({ action: 'member', key, prep }); if (!ok) { setErr(String(j.error)); return; } setD((x) => x && { ...x, prep: { ...x.prep, [key]: prep } }); }} onToggle={async (key, enabled) => { const { ok, j } = await post({ action: 'member', key, enabled }); if (!ok) { setErr(String(j.error)); return; } setD((x) => x && { ...x, members: { ...x.members, [key]: enabled } }); }} />
    </div>
  );
}

// 配る人: 人ごとに CCNA をオンにする
//   試験対策 = 買った 練習問題（lib/ccna/prep.ts）。CCNA とは別に 人ごとにオンにする（既定はオフ・完全に手作業＝CCNA のオン／オフ・勉強会・参画決定に関係しない）
function People({ members, staff, on, onToggle, prep, onPrep }: { members: Member[] | null; staff: { email: string; name: string }[]; on: Record<string, boolean>; onToggle: (key: string, enabled: boolean) => void; prep: Record<string, boolean>; onPrep: (key: string, prep: boolean) => void }) {
  const [q, setQ] = useState(''); const [only, setOnly] = useState(false);
  const all = useMemo(() => [
    ...(members || []).filter((m) => m.kind === 'employee').map((m) => ({ key: m.key, name: m.name, sub: `要員・${m.status}${m.company ? `・${m.company}` : ''}`, kana: m.kana })),
    ...staff.map((s) => ({ key: 'u:' + s.email, name: s.name || s.email.split('@')[0], sub: `内勤・${s.email}`, kana: '' })),
  ], [members, staff]);
  const rows = useMemo(() => all.filter((x) => (!only || on[x.key]) && (!q || x.name.includes(q) || x.kana.includes(q) || x.sub.includes(q))).sort((a, b) => Number(!!on[b.key]) - Number(!!on[a.key])).slice(0, 60), [all, q, only, on]);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <p className="text-sm text-ig-muted">オンにした人の受講ページに「CCNA」コースが出ます（受講URLは今までと同じです）。super admin は、オンにしなくても確認用に入れます。<br />「試験対策」（購入した練習問題）は、CCNA とは別に右のスイッチでオンにした人にだけ出ます。CCNA がオフの人には出ません。</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="relative"><Search size={16} className="absolute left-2.5 top-2.5 text-ig-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前で探す" className={`${inputCls} w-64 pl-8`} /></label>
        <Chip on={only} onClick={() => setOnly((v) => !v)}>オンの人だけ（{Object.values(on).filter(Boolean).length}）</Chip>
      </div>
      <ul className="mt-3 divide-y divide-ig-divider rounded-2xl border border-ig-border">
        {members === null && <li className="p-4 text-sm text-ig-muted">名簿を読み込み中…</li>}
        {rows.length === 0 && members !== null && <li className="p-4 text-sm text-ig-muted">該当する人がいません</li>}
        {rows.map((x) => (
          <li key={x.key} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar name={x.name} size="sm" />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{x.name}</div><div className="truncate text-xs text-ig-muted">{x.sub}</div></div>
            <label className={`flex shrink-0 items-center gap-1.5 text-xs ${on[x.key] ? 'text-ig-muted' : 'text-ig-muted opacity-40'}`}>試験対策
              <button type="button" role="switch" aria-checked={!!prep[x.key]} aria-label={`${x.name} の 試験対策`} onClick={() => onPrep(x.key, !prep[x.key])}
                className={`relative h-5 w-9 rounded-full transition-colors ${prep[x.key] ? 'bg-ig-primary' : 'bg-ig-border'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${prep[x.key] ? 'left-[18px]' : 'left-0.5'}`} /></button>
            </label>
            <span className="shrink-0 text-xs text-ig-muted">CCNA</span>
            <button type="button" role="switch" aria-checked={!!on[x.key]} aria-label={`${x.name} の CCNA`} onClick={() => onToggle(x.key, !on[x.key])}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on[x.key] ? 'bg-ig-primary' : 'bg-ig-border'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on[x.key] ? 'left-[22px]' : 'left-0.5'}`} /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
