'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { PersonName } from '@/components/Person';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { normName } from '@/lib/live/staff';
import type { LiveStaffList } from '@/lib/live/staff';
import type { IkeTeam } from '@/lib/live/community';
import { useLiveWrite, WriteError } from './useLiveWrite';

// 班分け（コミュニティ）を直す（今のコミュニティの画面 teams.html と同じ口・10-25）。
//   ・人はつまんで別の班（または「未割当」）に落とすと動く＝すぐ保存（取り消すで元の班に戻す）
//   ・リーダー／サブリーダーは班の人から選ぶ・班名は欄を離れたら保存・班を消すと班の人は未割当に戻る（確かめる）
//   ・直す欄が出るのは 採用・役員・全体管理者 のロールだけ（GET /api/live/teams で確かめる）。ほかの人は見るだけ
//   ・本物のときだけ（見本には班の人が無い）
const URL = '/api/live/teams';

export function TeamsEditor({ teams, onDone }: { teams: IkeTeam[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const perm = useLiveRoute<{ canWrite: boolean }>(URL);
  const staff = useLiveRoute<LiveStaffList>(open ? '/api/live/staff' : null);
  const { send, error, setError, busy } = useLiveWrite(true, onDone);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const where = useMemo(() => { const m = new Map<string, IkeTeam>(); for (const t of teams) for (const x of t.members) m.set(normName(x.name || x.norm_name), t); return m; }, [teams]);
  const unassigned = useMemo(() => (staff.data?.rows || []).filter((r) => r.statusKey !== 'taisha' && !where.has(normName(r.name))).map((r) => r.name), [staff.data, where]);

  const move = (name: string, to: IkeTeam | null) => {
    const from = where.get(normName(name)) || null;
    if ((from?.id || null) === (to?.id || null)) return;
    send({
      url: URL, body: { action: 'assign', name, team_id: to?.id || null }, text: `${name} さんを${to ? `「${to.name}」に入れました` : '未割当に戻しました'}`,
      sub: from && (from.leader_name === name || from.subleader_name === name) ? '→ 元の班のリーダー／サブからは外れます' : '→ コミュニティの人数に入りました',
      undo: () => ({ url: URL, body: { action: 'assign', name, team_id: from?.id || null } }),
    });
  };
  const role = (t: IkeTeam, sub: boolean, name: string) => {
    const prev = (sub ? t.subleader_name : t.leader_name) || '';
    if (prev === name) return;
    send({ url: URL, body: { action: sub ? 'setSubLeader' : 'setLeader', id: t.id, name }, text: `「${t.name}」の${sub ? 'サブリーダー' : 'リーダー'}を${name ? `${name} さんにしました` : '空けました'}`,
      undo: () => ({ url: URL, body: { action: sub ? 'setSubLeader' : 'setLeader', id: t.id, name: prev } }) });
  };
  const rename = (t: IkeTeam, name: string) => {
    if (!name || name === t.name) return;
    send({ url: URL, body: { action: 'renameTeam', id: t.id, name }, text: `班名を「${name}」にしました`, undo: () => ({ url: URL, body: { action: 'renameTeam', id: t.id, name: t.name } }) });
  };
  const remove = (t: IkeTeam) => {
    if (!window.confirm(`「${t.name}」を消しますか？\n班の人（${t.members.length}人）は未割当に戻ります。元には戻せません。`)) return;
    send({ url: URL, body: { action: 'deleteTeam', id: t.id }, text: `「${t.name}」を消しました`, sub: '→ 班の人は未割当に戻りました' });
  };
  const create = () => {
    const n = newName.trim(); if (!n) return;
    send({ url: URL, body: { action: 'createTeam', name: n }, text: `「${n}」を作りました` }).then((r) => { if (r) setNewName(''); });
  };
  const dropProps = (key: string, to: IkeTeam | null) => ({
    onDragOver: (e: React.DragEvent) => { if (drag) { e.preventDefault(); setOver(key); } },
    onDragLeave: () => setOver((o) => (o === key ? null : o)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(null); if (drag) move(drag, to); setDrag(null); },
    style: over === key ? { outline: '2px dashed var(--a)', outlineOffset: 2 } : undefined,
  });
  const chip = (name: string) => (
    <span key={name} draggable onDragStart={(e) => { setDrag(name); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { setDrag(null); setOver(null); }}
      className="inline-flex cursor-grab items-center rounded-full border border-line bg-soft px-2.5 py-0.5 text-[12.5px]" style={drag === name ? { opacity: 0.4 } : undefined}>
      <PersonName name={name} className="underline-offset-2 hover:underline" />
    </span>
  );

  if (!perm.data?.canWrite) return null; // 書けないロールは今の見るだけの画面のまま
  if (!open) return (
    <button onClick={() => setOpen(true)} className="inline-flex min-h-9 w-fit items-center gap-1.5 rounded-[10px] border border-field bg-surface px-3 text-[13px] font-semibold" style={{ color: 'var(--ad)' }}><Users size={14} />班分けを直す</button>
  );
  return (
    <section className="mo-fade-up flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-bold">班分け</h2>
        <span className="text-[12px] text-muted">人をつまんで別の班・未割当に落とすと動きます（すぐ保存）。書けるのは採用・役員・全体管理者です</span>
        {busy && <span className="text-[12px] text-muted">保存しています…</span>}
        <button onClick={() => setOpen(false)} className="ml-auto text-[12.5px] text-muted underline">閉じる</button>
      </div>
      <WriteError error={error} onClose={() => setError('')} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {teams.map((t) => (
          <div key={t.id} {...dropProps(t.id, t)} className="flex flex-col gap-2 rounded-xl border border-line px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <input key={t.name} defaultValue={t.name} aria-label="班名" onBlur={(e) => rename(t, e.target.value.trim())} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="min-h-8 flex-1 rounded-lg border border-field bg-surface px-2 text-[13.5px] font-bold" />
              <span className="num text-[12px] text-muted">{t.members.length}人</span>
              <button onClick={() => remove(t)} aria-label={`${t.name}を消す`} title="班を消す（班の人は未割当に戻る）" className="rounded p-1 text-muted hover:text-bad"><Trash2 size={14} /></button>
            </div>
            <div className="flex flex-wrap gap-2 text-[12px] text-muted">
              {([false, true] as const).map((sub) => (
                <label key={String(sub)} className="flex items-center gap-1">{sub ? 'サブ' : 'リーダー'}
                  <select value={(sub ? t.subleader_name : t.leader_name) || ''} onChange={(e) => role(t, sub, e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-1.5 text-[12.5px] text-ink">
                    <option value="">なし</option>
                    {t.members.map((m) => <option key={m.norm_name} value={m.name}>{m.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="flex min-h-9 flex-wrap gap-1.5">{t.members.length ? t.members.map((m) => chip(m.name)) : <span className="text-[12px] text-faint">ここに人を落とす</span>}</div>
            <select value="" onChange={(e) => { if (e.target.value) move(e.target.value, t); }} aria-label={`${t.name}に人を足す`} className="min-h-8 rounded-lg border border-field bg-surface px-1.5 text-[12.5px] text-muted">
              <option value="">＋ 未割当の人を足す{staff.state === 'loading' ? '（読み込み中）' : ''}</option>
              {unassigned.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        ))}
        <div {...dropProps('none', null)} className="flex flex-col gap-2 rounded-xl border border-dashed border-field px-3 py-2.5">
          <div className="text-[13.5px] font-bold">未割当 <span className="num text-[12px] font-normal text-muted">{unassigned.length}人</span></div>
          <div className="flex max-h-[220px] flex-wrap gap-1.5 overflow-y-auto">{staff.state === 'loading' ? <span className="text-[12px] text-muted">読み込み中…</span> : unassigned.map(chip)}</div>
          <div className="mt-auto flex gap-1.5">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="新しい班の名前" className="min-h-8 flex-1 rounded-lg border border-field bg-surface px-2 text-[12.5px]" />
            <button onClick={create} disabled={!newName.trim()} className="btn-primary inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-[12.5px] font-bold disabled:opacity-40"><Plus size={13} />班を作る</button>
          </div>
        </div>
      </div>
    </section>
  );
}
