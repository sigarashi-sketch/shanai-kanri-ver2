'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useMotivation } from '../Motivation';
import { needText } from '../Perms';
import type { DryRes } from '@/lib/live/renraku';
import { HoldButton, LinePreview, Note, Pills, SendProgress, Step, haishin, useHaishinRead } from './parts';

// 面談日程回収（10-30 shoya「今のいけどんでやってた面談候補の日程回収の一斉送信・営業中に・タブで送れるように」）。
//   今の配信画面（line-broadcast.html）の「📅 面談日程回収」と同じ：今週／来週の平日（祝日・過ぎた日は外す）を選ぶ → 決まった文面 → 営業中の人へ一斉に送る
//   ・文面は今のシステムの /api/availability?action=template（頭の文と日付の形は返信の読み取りが前提にしているので ver2 では変えない・本文の手直しもさせない）
//   ・送り先は 営業中のグループ（はじめ）か 営業中の 1:1（Push＝従量課金）。案件番号は付けない＝案件進捗には載らない
//   ・返ってきた日程は今のシステムが返信から拾う（面談可能日の承認＝DB に残してある仕組み）
type Day = { date: string; label: string; holiday: boolean; past: boolean; checked: boolean };
type TplRes = { ok?: boolean; error?: string; week?: number; days?: Day[]; head?: string; warning?: string };
type GroupsRes = { ok?: boolean; error?: string; groups?: { id: string; name: string }[] };
type Target = 'group' | 'one';

export function NitteiTab({ live, canSend, wide }: { live: boolean; canSend: boolean; wide: boolean }) {
  const { hit, toast } = useMotivation();
  const [week, setWeek] = useState<0 | 1 | null>(null);   // null＝今のシステムに任せる（今週に出せる日が無ければ来週）
  const tpl = useHaishinRead<TplRes>(live ? 'nittei-template' : null, week == null ? {} : { week });
  const days = useMemo(() => tpl.data?.days ?? [], [tpl.data]);
  const shownWeek = tpl.data?.week ?? week;
  const [off, setOff] = useState<Record<string, boolean>>({});   // 既定（checked）から外した／足した日
  const isOn = (d: Day) => off[d.date] === undefined ? d.checked : !off[d.date];
  const picked = days.filter(isOn);
  const text = picked.length ? (tpl.data?.head || '') + picked.map((d) => `${d.label}：`).join('\n') : '';

  const [target, setTarget] = useState<Target>('group');
  const groups = useHaishinRead<GroupsRes>(live && target === 'group' ? 'nittei-groups' : null);
  const ones = useHaishinRead<DryRes>(live && target === 'one' ? 'dry' : null, { audience: 'sales' });
  const all = useMemo(() => (target === 'group'
    ? (groups.data?.groups ?? []).map((g) => ({ id: g.id, name: g.name, sub: '' }))
    : (ones.data?.recipients ?? []).map((r) => ({ id: r.userId, name: r.name, sub: [r.eki, r.tantou && `担当 ${r.tantou}`].filter(Boolean).join('・') }))), [target, groups.data, ones.data]);
  const listErr = target === 'group' ? groups.error || (groups.data?.ok === false ? groups.data.error : '') : ones.error;
  const loading = target === 'group' ? groups.state === 'loading' : ones.state === 'loading';
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const shown = all.filter((r) => !q || r.name.replace(/\s/g, '').includes(q.replace(/\s/g, '')) || r.sub.includes(q));
  const pick = (ids: string[], v: boolean) => setSel((s) => { const x = new Set(s); ids.forEach((id) => (v ? x.add(id) : x.delete(id))); return x; });
  const chosen = all.filter((r) => sel.has(r.id));
  const changeTarget = (t: Target) => { setTarget(t); setSel(new Set()); };
  const changeWeek = (w: 0 | 1) => { setWeek(w); setOff({}); };

  const [prog, setProg] = useState<{ done: number; total: number; label: string } | null>(null);
  const [err, setErr] = useState('');
  const unit = target === 'group' ? 'グループ' : '人';
  const block = !live ? '読み込めていません' : !canSend ? needText('edit') : tpl.state === 'loading' ? '日程を読んでいます' : !picked.length ? '日付を1つ以上選んでください' : !chosen.length ? '送り先を選んでください' : '';

  const go = async () => {
    setErr('');
    const n = chosen.length;
    setProg({ done: 0, total: n, label: '送っています…' });
    const r = await haishin<{ ok?: boolean; error?: string; sent?: number; failed?: string[] }>('nittei-send', { target, week: shownWeek, labels: picked.map((d) => d.label), to: chosen.map((c) => c.id) });
    setProg(null);
    if (typeof r.sent !== 'number') { setErr(r.error || '送れませんでした'); return; }
    if (r.failed?.length) setErr(`届かなかった ${r.failed.length}${unit}：${r.failed.join('、')}`);
    if (r.sent) {
      hit(r.sent);
      toast({ text: `面談日程の回収を ${r.sent}${unit}に送りました`, sub: '→ 返ってきた日程は今のシステムが返信から拾います（チャットで返信も見られます）' });
      setSel(new Set());
    }
  };

  const daysStep = (
    <Step n={1} title="日付を選ぶ" done={!!picked.length}>
      <Pills items={[['0', '今週'], ['1', '来週']] as const} value={shownWeek === 1 ? '1' : '0'} onChange={(k) => changeWeek(k === '1' ? 1 : 0)} small />
      {(!live || tpl.state === 'loading') && <p className="mt-2 text-sm text-muted">日程を読んでいます…</p>}
      {live && (tpl.error || tpl.data?.ok === false) && <Note tone="bad">{tpl.error || tpl.data?.error}</Note>}
      {tpl.data?.warning && <Note tone="warn">{tpl.data.warning}</Note>}
      <div className="mt-2 flex flex-col gap-1">
        {days.map((d) => (
          <label key={d.date} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-body hover:bg-soft ${isOn(d) ? '' : 'text-faint'}`}>
            <input type="checkbox" checked={isOn(d)} onChange={(e) => setOff((o) => ({ ...o, [d.date]: !e.target.checked }))} />
            <span className="flex-1">{d.label}</span>
            {d.holiday && <span className="chip" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>祝日</span>}
            {!d.holiday && d.past && <span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>過ぎた日</span>}
          </label>
        ))}
        {live && tpl.state !== 'loading' && days.length > 0 && days.every((d) => d.holiday || d.past) && <Note tone="warn">この週は送れる日がありません。「来週」に切り替えてください</Note>}
      </div>
      <p className="mt-1 text-xs text-faint">文面は今のシステムと同じ決まった形です（相手が日付の後ろに時間を書いて返すと、今のシステムが拾います）。案件番号は付けないので、案件進捗には載りません。</p>
    </Step>
  );
  const people = (
    <Step n={2} title={`送り先を選ぶ（${chosen.length}${unit}）`} done={!!chosen.length}>
      <Pills items={[['group', 'グループ（営業中）'], ['one', '営業中（1:1）']] as const} value={target} onChange={changeTarget} small />
      {target === 'one' && <Note tone="warn">1:1 は Push＝従量課金です。いつもはグループで送ってください</Note>}
      <div className="mt-2 flex items-center gap-2">
        <label className="flex min-h-8 flex-1 items-center gap-1.5 rounded-lg border border-field px-2 text-faint"><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={target === 'group' ? 'グループ名' : '名前・駅・担当'} className="flex-1 bg-transparent text-sm text-ink outline-none" /></label>
        <button type="button" onClick={() => pick(shown.map((r) => r.id), !shown.every((r) => sel.has(r.id)))} className="shrink-0 text-sm font-semibold" style={{ color: 'var(--ad)' }}>{shown.length && shown.every((r) => sel.has(r.id)) ? 'すべて外す' : 'すべて選ぶ'}</button>
      </div>
      {(!live || loading) && <p className="mt-2 text-sm text-muted">送り先の一覧を読み込んでいます…</p>}
      {live && listErr && <Note tone="bad">{listErr}</Note>}
      <div className={`mt-1 overflow-y-auto ${wide ? 'max-h-[40vh]' : 'max-h-[240px]'}`}>
        {shown.slice(0, 500).map((r) => (
          <label key={r.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-body hover:bg-soft">
            <input type="checkbox" checked={sel.has(r.id)} onChange={(e) => pick([r.id], e.target.checked)} />
            <span className="flex-1">{r.name}</span>{r.sub && <span className="text-xs text-faint">{r.sub}</span>}
          </label>
        ))}
        {live && !loading && !listErr && !shown.length && <p className="py-3 text-center text-sm text-muted">送れる相手がいません</p>}
      </div>
      <p className="mt-1 text-xs text-faint">{target === 'group' ? '営業中の要員のグループだけが出ます（営業止め・辞退・参画決定・提案禁止は今のシステムが外します）。' : '公式LINE（あおい）を 1:1 で追加している営業中の人だけが出ます。'}</p>
    </Step>
  );
  const preview = <LinePreview text={text || '（日付を選ぶと文面が出ます）'} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`min-h-0 flex-1 overflow-y-auto px-4 py-3 ${wide ? 'grid grid-cols-2 items-start gap-3' : 'flex flex-col gap-3'}`}>
        <div className="flex flex-col gap-3">{daysStep}{wide && preview}</div>
        <div className="flex flex-col gap-3">{people}{!wide && preview}{err && <Note tone="bad">{err}</Note>}</div>
      </div>
      <div className="flex items-center gap-3 border-t border-line px-4 py-3">
        {prog ? <SendProgress done={prog.done} total={prog.total} label={prog.label} /> : <span className="flex-1 text-sm text-muted">{block || `${chosen.length}${unit}に面談日程の回収を送ります`}</span>}
        <HoldButton label={`長押しで送る（${chosen.length}${unit}）`} disabled={!!block || !!prog} title={block || undefined} onDone={go} />
      </div>
    </div>
  );
}
