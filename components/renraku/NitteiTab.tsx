'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useIke } from '../Live';
import { useMotivation } from '../Motivation';
import { needText } from '../Perms';
import { parseKadouYm, type DryRes, type PartnerListRes } from '@/lib/live/renraku';
import { matchGroupName, normName } from '@/lib/live/eigyo-common';
import { HoldButton, LinePreview, Note, Pills, SendProgress, Step, haishin, useHaishinRead } from './parts';

// 面談日程回収（10-30 shoya「今のいけどんでやってた面談候補の日程回収の一斉送信・営業中に・タブで送れるように」）。
//   今の配信画面（line-broadcast.html）の「📅 面談日程回収」と同じ：今週／来週の平日（祝日・過ぎた日は外す）を選ぶ → 決まった文面 → 営業中の人へ一斉に送る
//   ・文面は今のシステムの /api/availability?action=template（頭の文と日付の形は返信の読み取りが前提にしているので ver2 では変えない・本文の手直しもさせない）
//   ・送り先は 営業中のグループ（はじめ）か 営業中の 1:1（Push＝従量課金）。案件番号は付けない＝案件進捗には載らない
//   ・返ってきた日程は今のシステムが返信から拾う（面談可能日の承認＝DB に残してある仕組み）
//   ・稼働月（10-31 shoya「稼働月でチェックして選べるように・本人の稼働月も示して」）：行ごとに本人の稼働を出し、上の「稼働月で選ぶ」でその月の人をまとめて選ぶ／外す。
//     稼働は営業共有リスト（partner-list?action=list）の値＝1:1 は dry の kadou、グループは名前の入ったグループ名から本人を決める（今の matchRosterName と同じ最長一致）。
//     月の読み方は手動配信と同じ parseKadouYm（即日＝今月・未定や書いていない人は「稼働月 不明」）
type Row = { id: string; name: string; sub: string; kadou: string; ym: number | null };
const nowYm = () => { const d = new Date(Date.now() + 9 * 3600000); return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1; };
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
  const plist = useIke<PartnerListRes>(live ? 'partner-list?action=list&area=main' : null);
  const all = useMemo<Row[]>(() => {
    const months = plist.data?.kadouMonths?.length ? plist.data.kadouMonths : [{ ym: nowYm() }];
    const ymOf = (k: string) => parseKadouYm(k, months);
    if (target === 'one') return (ones.data?.recipients ?? []).map((r) => ({ id: r.userId, name: r.name, sub: [r.eki, r.tantou && `担当 ${r.tantou}`].filter(Boolean).join('・'), kadou: r.kadou, ym: ymOf(r.kadou) }));
    const byNorm = new Map<string, string>();
    for (const p of plist.data?.people ?? []) { const n = normName(p.name); if (n && !byNorm.has(n)) byNorm.set(n, p.kadou || ''); }
    const norms = [...byNorm.keys()];
    return (groups.data?.groups ?? []).map((g) => {
      const n = matchGroupName(g.name, norms);
      const kadou = n ? byNorm.get(n) || '' : '';
      return { id: g.id, name: g.name, sub: '', kadou, ym: ymOf(kadou) };
    });
  }, [target, groups.data, ones.data, plist.data]);
  const curYm = plist.data?.kadouMonths?.[0]?.ym ?? nowYm();
  const ymLabel = (ym: number | null) => ym == null ? '不明' : Math.floor(ym / 100) === Math.floor(curYm / 100) ? `${ym % 100}月` : `${Math.floor(ym / 100)}年${ym % 100}月`;
  const byMonth = useMemo(() => {
    const m = new Map<string, { ym: number | null; ids: string[] }>();
    for (const r of all) { const k = String(r.ym ?? ''); const e = m.get(k) ?? { ym: r.ym, ids: [] }; e.ids.push(r.id); m.set(k, e); }
    return [...m.values()].sort((a, b) => (a.ym ?? 999999) - (b.ym ?? 999999));
  }, [all]);
  const listErr = target === 'group' ? groups.error || (groups.data?.ok === false ? groups.data.error : '') : ones.error;
  const loading = target === 'group' ? groups.state === 'loading' : ones.state === 'loading';
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const shown = all.filter((r) => !q || r.name.replace(/\s/g, '').includes(q.replace(/\s/g, '')) || r.sub.includes(q) || r.kadou.includes(q));
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
      {byMonth.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">稼働月で選ぶ</span>
          {byMonth.map((m) => {
            const n = m.ids.filter((id) => sel.has(id)).length;
            const on = n === m.ids.length;
            return (
              <label key={String(m.ym)} className="flex cursor-pointer items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs hover:bg-soft" style={on ? { borderColor: 'var(--ad)', color: 'var(--ad)' } : undefined}>
                <input type="checkbox" checked={on} ref={(el) => { if (el) el.indeterminate = n > 0 && !on; }} onChange={(e) => pick(m.ids, e.target.checked)} />
                {m.ym == null ? '稼働月 不明' : `${ymLabel(m.ym)}稼働`}<span className="text-faint">{m.ids.length}</span>
              </label>
            );
          })}
          {plist.state === 'loading' && target === 'group' && <span className="text-xs text-faint">稼働を読んでいます…</span>}
        </div>
      )}
      {(!live || loading) && <p className="mt-2 text-sm text-muted">送り先の一覧を読み込んでいます…</p>}
      {live && listErr && <Note tone="bad">{listErr}</Note>}
      <div className={`mt-1 overflow-y-auto ${wide ? 'max-h-[40vh]' : 'max-h-[240px]'}`}>
        {shown.slice(0, 500).map((r) => (
          <label key={r.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-body hover:bg-soft">
            <input type="checkbox" checked={sel.has(r.id)} onChange={(e) => pick([r.id], e.target.checked)} />
            <span className="flex-1">{r.name}</span>{r.sub && <span className="text-xs text-faint">{r.sub}</span>}
            <span className="chip shrink-0" title={r.kadou ? `稼働：${r.kadou}` : '営業共有リストに稼働が書かれていません'} style={r.ym == null ? { background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' } : { background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{r.ym == null ? (r.kadou ? `稼働 ${r.kadou}` : '稼働 不明') : `稼働 ${ymLabel(r.ym)}`}</span>
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
