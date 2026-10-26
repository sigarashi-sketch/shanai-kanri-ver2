'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Card, HoryuFrame, Msg, btnCls, horyuPost, inputCls, useHoryu } from '@/components/horyu/kit';

// カレンダー設定（保留・10-25）。今の /calendar-settings.html と同じ：初回ヒアリングの予定を、だれのカレンダーに作り、だれを招待するか。
//   保存は今の /api/chat?action=saveCalendarSettings（全部を置き換える）。予約の画面の設定とは別のキー
type Org = { label: string; calendarId: string };
type Cal = { organizerId: string; organizers: Org[]; guests: string[]; sendInvites: boolean };
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function CalendarSettingsPage() {
  const r = useHoryu<{ calendar: Cal }>('calendar');
  const [cal, setCal] = useState<Cal | null>(null);
  const [dirty, setDirty] = useState(false);
  const [newOrg, setNewOrg] = useState<Org>({ label: '', calendarId: '' });
  const [newGuest, setNewGuest] = useState('');
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  useEffect(() => {
    if (r.data?.calendar) { const c = r.data.calendar; setCal({ organizerId: c.organizerId || '', organizers: c.organizers || [], guests: c.guests || [], sendInvites: c.sendInvites !== false }); }
    setDirty(false);
  }, [r.data]);
  const upd = (c: Cal) => { setCal(c); setDirty(true); };

  const save = async () => {
    if (!cal) return;
    const res = await horyuPost<{ warnings?: string[] }>('calendar-save', { calendar: cal });
    setMsg(res.ok ? { text: `保存しました${res.data.warnings?.length ? `（${res.data.warnings.join('・')}）` : ''}` } : { text: res.error, bad: true });
    if (res.ok) void r.reload();
  };

  return (
    <HoryuFrame title="カレンダー設定" sub="初回ヒアリングの予定を作るカレンダーと、招待する人" state={r.state} error={r.error} onReload={r.reload}
      actions={<button className="btn-primary" disabled={!dirty} onClick={save}>保存する</button>}>
      <Msg text={msg.text} bad={msg.bad} />
      {cal && <>
        <Card title="主催者（予定を作るカレンダー）">
          <div className="flex flex-col gap-2.5 px-4 pb-4 text-body">
            <label className="flex flex-wrap items-center gap-2 text-sm text-muted">いまの主催者
              <select value={cal.organizerId} onChange={(e) => upd({ ...cal, organizerId: e.target.value })} className={inputCls}>
                <option value="">（選ばない）</option>
                {cal.organizers.map((o) => <option key={o.calendarId} value={o.calendarId}>{o.label || o.calendarId}</option>)}
                {cal.organizerId && !cal.organizers.some((o) => o.calendarId === cal.organizerId) && <option value={cal.organizerId}>{cal.organizerId}（候補の外）</option>}
              </select>
            </label>
            <ul className="flex flex-col gap-1">
              {cal.organizers.map((o, i) => (
                <li key={o.calendarId} className="flex items-center gap-2 rounded-lg border border-line-soft px-3 py-1.5"><b>{o.label || '—'}</b><span className="text-sm text-muted">{o.calendarId}</span>
                  <button className="ml-auto rounded p-1 text-faint" aria-label={`${o.label || o.calendarId} を候補から外す`} onClick={() => upd({ ...cal, organizers: cal.organizers.filter((_, j) => j !== i) })}><X size={14} /></button></li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <input value={newOrg.label} onChange={(e) => setNewOrg({ ...newOrg, label: e.target.value })} placeholder="名前" aria-label="候補の名前" className={`${inputCls} w-[160px]`} />
              <input value={newOrg.calendarId} onChange={(e) => setNewOrg({ ...newOrg, calendarId: e.target.value.trim() })} placeholder="カレンダーID（メールの形）" aria-label="カレンダーID" className={`${inputCls} w-[220px]`} />
              <button className={btnCls} disabled={!EMAIL.test(newOrg.calendarId) || cal.organizers.some((o) => o.calendarId === newOrg.calendarId)} onClick={() => { upd({ ...cal, organizers: [...cal.organizers, newOrg] }); setNewOrg({ label: '', calendarId: '' }); }}><Plus size={13} className="mr-1 inline" />候補に足す</button>
            </div>
          </div>
        </Card>
        <Card title="招待する人" note="主催者自身は自動で外れます">
          <div className="flex flex-col gap-2.5 px-4 pb-4 text-body">
            <div className="flex flex-wrap gap-1.5">
              {cal.guests.map((g) => <span key={g} className="chip">{g}<button aria-label={`${g} を外す`} onClick={() => upd({ ...cal, guests: cal.guests.filter((x) => x !== g) })}><X size={11} /></button></span>)}
              {!cal.guests.length && <span className="text-warn">招待先がありません（だれにも招待は届きません）</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <input value={newGuest} onChange={(e) => setNewGuest(e.target.value.trim())} placeholder="メールアドレス" aria-label="招待する人のメール" className={`${inputCls} w-[240px]`} />
              <button className={btnCls} disabled={!EMAIL.test(newGuest) || cal.guests.includes(newGuest)} onClick={() => { upd({ ...cal, guests: [...cal.guests, newGuest] }); setNewGuest(''); }}><Plus size={13} className="mr-1 inline" />足す</button>
            </div>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={cal.sendInvites} onChange={(e) => upd({ ...cal, sendInvites: e.target.checked })} />招待のメールを送る</label>
          </div>
        </Card>
      </>}
    </HoryuFrame>
  );
}
