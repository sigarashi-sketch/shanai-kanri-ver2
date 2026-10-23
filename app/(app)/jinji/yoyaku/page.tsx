'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, Check, X } from 'lucide-react';
import { PEOPLE } from '@/lib/sample';
import { MODULES } from '@/lib/theme';
import { FIELD_RULES, TODAY, YOYAKU, addDays, daysFrom, fmtDate, type Field, type YState, type Yoyaku } from '@/lib/yoyaku-sample';
import { PageTitle, PrimaryButton } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import { DrawerPortal } from '@/components/DrawerPortal';

// 変更の予約（人事管理）。住所・通勤・単価・現場・状態（待機/退社/休職/産休/育休）を「いつから」つきで予約する。
//   ・予約した日の朝6:00に切り替わり、「一緒に変わるもの」にも同じ日から入る
//   ・単価と通勤は承認が要る（単価＝営業の承認、通勤＝経理の承認）。承認されるまで切り替わらない
//   ・同じ人の同じ項目に、まだ切り替わっていない予約があれば重ねて作らせない（上書きするか選ぶ）
//   予約を作れるのは、その項目の分類を「直す」以上で持つ人だけ
const SHORT = Object.fromEntries(MODULES.map((m) => [m.key, m.short]));
const STATE_TONE: Record<YState, string> = { 承認待ち: 'bad', 予約中: 'info', 適用済み: 'ok', 取り消し: 'mute' };
const FIELDS = Object.keys(FIELD_RULES) as Field[];
type Filter = 'これから' | '承認待ち' | '適用済み';

function StateChip({ s }: { s: YState }) {
  const t = STATE_TONE[s];
  return <span className="chip" style={{ background: `var(--tone-${t}-bg)`, color: `var(--tone-${t}-fg)` }}>{s}</span>;
}

export default function YoyakuPage() {
  const { can } = usePerms();
  const { hit, toast } = useMotivation();
  const [rows, setRows] = useState<Yoyaku[]>(YOYAKU);
  const [filter, setFilter] = useState<Filter>('これから');
  const [day, setDay] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [form, setForm] = useState<boolean>(false);
  // ?new=1 で予約のパネルを開いた状態から始める（ホームの「変更を予約」・画面の見本を撮るとき用）
  useEffect(() => { if (new URLSearchParams(window.location.search).get('new')) setForm(true); }, []);

  const pulse = (id: string) => { setFlash(id); setTimeout(() => setFlash(null), 1300); };
  const upcoming = rows.filter((r) => r.state === '承認待ち' || r.state === '予約中');
  const shown = rows
    .filter((r) => (filter === 'これから' ? r.state === '承認待ち' || r.state === '予約中' : r.state === filter))
    .filter((r) => !day || r.date === day)
    .sort((a, b) => (filter === '適用済み' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));

  // これから30日の帯：日ごとの予約の数と分類
  const strip = useMemo(() => Array.from({ length: 30 }, (_, i) => {
    const d = addDays(TODAY, i);
    return { d, items: upcoming.filter((r) => r.date === d) };
  }), [upcoming]);

  const approverOf = (f: Field) => FIELD_RULES[f].module;
  const approve = (r: Yoyaku) => {
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, state: '予約中' } : x)));
    pulse(r.id); hit();
    toast({ text: `${r.person} の${r.field}の予約を承認しました`, sub: `→ ${fmtDate(r.date)} の朝6:00に切り替わります`, undo: () => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, state: '承認待ち' } : x))) });
  };
  // 現場の予約に合わせて自動で作った通勤の予約（同じ人・同じ日）。現場を取り消す・上書きするときは一緒に取り消す
  const linked = (rs: Yoyaku[], id?: string) => {
    const base = rs.find((x) => x.id === id);
    if (!base || base.field !== '現場') return [] as string[];
    return rs.filter((x) => x.personId === base.personId && x.date === base.date && x.field === '通勤' && x.note?.includes('自動') && (x.state === '予約中' || x.state === '承認待ち')).map((x) => x.id);
  };
  const cancel = (r: Yoyaku) => {
    const ids = [r.id, ...linked(rows, r.id)];
    const before = rows;
    setRows((rs) => rs.map((x) => (ids.includes(x.id) ? { ...x, state: '取り消し' } : x)));
    hit();
    toast({ text: `${r.person} の${r.field}の予約を取り消しました`, sub: ids.length > 1 ? '→ 合わせて作った通勤の予約も取り消しました' : '→ 一緒に変わる予定だったものも元のままです', undo: () => setRows(before) });
  };
  const add = (y: Yoyaku, replace?: string) => {
    const before = rows;
    const off = replace ? [replace, ...linked(rows, replace)] : [];
    setRows((rs) => [y, ...rs.map((x) => (off.includes(x.id) ? { ...x, state: '取り消し' as YState } : x))]);
    setForm(false); setFilter('これから'); setDay(null); pulse(y.id); hit();
    toast({
      text: `${y.person} の${y.field}を ${fmtDate(y.date)} から「${y.to}」に予約しました`,
      sub: y.state === '承認待ち' ? `→ ${SHORT[approverOf(y.field)]}の承認待ちに載りました` : `→ ${FIELD_RULES[y.field].with.join('・')} も同じ日に変わります${off.length > 1 ? '（前の現場に合わせた通勤の予約は取り消し）' : ''}`,
      undo: () => setRows(before),
    });
  };

  return (
    <main className={`flex flex-col gap-3.5 px-6 pb-12 pt-[22px] ${form ? 'xl:pr-[468px]' : ''}`}>
      <PageTitle title="変更の予約" sub="住所・通勤・単価・現場・状態を「いつから」つきで。予約した日の朝6:00に切り替わり、一緒に変わるものにも入ります・見本データ">
        <PrimaryButton onClick={() => setForm(true)}><span className="inline-flex items-center gap-1.5"><CalendarClock size={16} />変更を予約</span></PrimaryButton>
      </PageTitle>

      <section aria-label="これから30日" className="mo-fade-up rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <div className="mb-2 flex items-center justify-between text-[12px] text-muted"><b className="text-[13px] text-ink">これから30日</b>{day && <button onClick={() => setDay(null)} className="font-semibold" style={{ color: 'var(--ad)' }}>{fmtDate(day)} の絞り込みを外す</button>}</div>
        <div className="grid grid-cols-[repeat(30,minmax(0,1fr))] gap-1">
          {strip.map(({ d, items }, i) => {
            const date = new Date(d + 'T00:00:00');
            const sel = day === d;
            const weekend = date.getDay() === 0 || date.getDay() === 6;
            return (
              <button key={d} onClick={() => items.length && setDay(sel ? null : d)} disabled={!items.length} aria-label={`${fmtDate(d)} 予約${items.length}件`}
                className="mo-fade-in flex min-h-[64px] flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] disabled:cursor-default"
                style={{ ['--i' as string]: Math.min(i, 12), background: sel ? 'var(--as)' : items.length ? 'var(--color-soft)' : undefined, boxShadow: sel ? 'inset 0 0 0 1.5px var(--a)' : undefined }}>
                <span className={weekend ? 'text-faint' : 'text-muted'}>{i === 0 ? '今日' : date.getDate() === 1 || i === 1 ? `${date.getMonth() + 1}/${date.getDate()}` : date.getDate()}</span>
                <span className="flex flex-col items-center gap-0.5">
                  {items.slice(0, 3).map((r) => <i key={r.id} className="size-[7px] rounded-full" style={{ background: `var(--c-${FIELD_RULES[r.field].module})`, outline: r.state === '承認待ち' ? '2px solid var(--tone-bad-bar)' : undefined, outlineOffset: 1 }} />)}
                  {items.length > 3 && <span className="num text-[10px] text-faint">+{items.length - 3}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11.5px] text-muted">
          {MODULES.map((m) => <span key={m.key} className="inline-flex items-center gap-1.5"><i className="size-[7px] rounded-full" style={{ background: `var(--c-${m.key})` }} />{m.label}</span>)}
          <span className="inline-flex items-center gap-1.5"><i className="size-[7px] rounded-full" style={{ outline: '2px solid var(--tone-bad-bar)', outlineOffset: 1 }} />承認待ち</span>
        </div>
      </section>

      <div className="mo-fade-up flex flex-wrap gap-2" style={{ ['--i' as string]: 2 }}>
        {(['これから', '承認待ち', '適用済み'] as Filter[]).map((f) => {
          const n = f === 'これから' ? upcoming.length : rows.filter((r) => r.state === f).length;
          return (
            <button key={f} onClick={() => setFilter(f)} className="min-h-9 rounded-full border px-3.5 text-[13px]"
              style={filter === f ? { borderColor: 'var(--a)', background: 'var(--as)', color: 'var(--ad)', fontWeight: 700 } : { borderColor: 'var(--color-field)', background: 'var(--color-surface)' }}>
              {f} <span className="num">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 3 }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-[13px]">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">適用日</th><th className="px-2 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">項目</th><th className="px-2 py-2.5 font-semibold">変更前 → 変更後</th><th className="px-2 py-2.5 font-semibold">一緒に変わるもの</th><th className="px-2 py-2.5 font-semibold">状態</th><th className="px-4 py-2.5" />
            </tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">この条件の予約はありません</td></tr>}
              {shown.map((r, i) => {
                const rule = FIELD_RULES[r.field];
                const left = daysFrom(r.date);
                const canApprove = can(rule.module, 'approve');
                return (
                  <tr key={r.id} className={`mo-fade-in border-t border-line-soft align-top ${flash === r.id ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                    <td className="px-4 py-2.5"><b className="num">{fmtDate(r.date)}</b><div className="text-[11.5px]" style={{ color: left >= 0 && left <= 3 && r.state !== '適用済み' ? 'var(--color-bad)' : 'var(--color-faint)' }}>{r.state === '適用済み' ? `${-left}日前に切り替え` : left === 0 ? '今日の朝に切り替え' : `あと${left}日`}</div></td>
                    <td className="px-2 py-2.5 font-semibold">{r.person}<div className="text-[11.5px] font-normal text-faint">登録 {r.by}</div></td>
                    <td className="px-2 py-2.5"><span className="inline-flex items-center gap-1.5 font-semibold"><i className="size-[7px] rounded-full" style={{ background: `var(--c-${rule.module})` }} />{r.field}</span><div className="text-[11.5px] text-faint">{SHORT[rule.module]}</div></td>
                    <td className="px-2 py-2.5"><span className="text-faint line-through">{r.from}</span> <ArrowRight size={13} className="inline text-faint" /> <b>{r.to}</b>{r.note && <div className="mt-0.5 text-[11.5px] text-muted">{r.note}</div>}</td>
                    <td className="max-w-[280px] px-2 py-2.5"><div className="flex flex-wrap gap-1">{rule.with.map((w) => <span key={w} className="rounded-md bg-soft px-1.5 py-0.5 text-[11.5px] text-muted">{w}</span>)}</div></td>
                    <td className="px-2 py-2.5"><StateChip s={r.state} />{r.state === '承認待ち' && <div className="mt-1 text-[11px] text-faint">{SHORT[rule.module]}の承認が要る</div>}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      {r.state === '承認待ち' && <button onClick={() => approve(r)} disabled={!canApprove} title={!canApprove ? needText('approve') : undefined} className="btn-primary mr-1.5 inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-[12.5px] font-semibold disabled:opacity-40"><Check size={14} />承認する</button>}
                      {(r.state === '承認待ち' || r.state === '予約中') && <button onClick={() => cancel(r)} disabled={!can(rule.module, 'edit')} title={!can(rule.module, 'edit') ? needText('edit') : undefined} className="inline-flex min-h-8 items-center rounded-lg border border-field bg-surface px-2.5 text-[12.5px] font-semibold disabled:opacity-40">取り消す</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {form && <YoyakuForm rows={rows} onClose={() => setForm(false)} onSave={add} />}
    </main>
  );
}

function YoyakuForm({ rows, onClose, onSave }: { rows: Yoyaku[]; onClose: () => void; onSave: (y: Yoyaku, replace?: string) => void }) {
  const { can, me } = usePerms();
  const people = PEOPLE.filter((p) => p.status !== '退社');
  const [pid, setPid] = useState(people[0].id);
  const [field, setField] = useState<Field>('現場');
  const [date, setDate] = useState(addDays(TODAY, 7));
  const [to, setTo] = useState('');
  const [replace, setReplace] = useState(false);
  const p = people.find((x) => x.id === pid)!;
  const rule = FIELD_RULES[field];
  const from = field === '現場' ? p.site : field === '単価' ? p.price : field === '住所' ? `${p.station} 付近` : field === '通勤' ? `${p.station} から 定期` : p.status;
  const clash = rows.find((r) => r.personId === pid && r.field === field && (r.state === '予約中' || r.state === '承認待ち'));
  const past = date < TODAY;
  const canMake = can(rule.module, 'edit');
  const ready = canMake && !!to.trim() && !past && (!clash || replace);
  const save = () => onSave({ id: `n${Date.now()}`, date, personId: pid, person: p.name, field, from, to: to.trim(), by: me.name.replace(/（.*）/, ''), state: rule.approve ? '承認待ち' : '予約中' }, clash && replace ? clash.id : undefined);

  return (
    <DrawerPortal>
      <aside aria-label="変更を予約" className="mo-drawer fixed bottom-0 right-0 top-[var(--hdr,58px)] z-20 flex w-[min(444px,100vw)] flex-col border-l border-line bg-surface shadow-[-12px_0_28px_rgba(25,27,46,.10)]">
        <div className="flex items-start justify-between px-5 py-4">
          <div><div className="text-[12px] text-faint">いつから変わるかを決めて予約</div><div className="text-[18px] font-bold">変更を予約</div></div>
          <button aria-label="閉じる" onClick={onClose} className="flex size-[34px] items-center justify-center rounded-[10px] border border-line"><X size={16} /></button>
        </div>
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-4 text-[13px]">
          <label className="flex flex-col gap-1 text-[12px] text-muted">社員
            <select value={pid} onChange={(e) => { setPid(e.target.value); setReplace(false); }} className="min-h-10 rounded-[10px] border border-field bg-surface px-2.5 text-[13.5px] text-ink">
              {people.map((x) => <option key={x.id} value={x.id}>{x.name}（{x.site === '—' ? x.status : x.site}）</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1 text-[12px] text-muted">変える項目
            <div className="flex flex-wrap gap-1.5">
              {FIELDS.map((f) => (
                <button key={f} onClick={() => { setField(f); setTo(''); setReplace(false); }} aria-pressed={field === f} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px]"
                  style={field === f ? { borderColor: 'var(--a)', background: 'var(--as)', color: 'var(--ad)', fontWeight: 700 } : { borderColor: 'var(--color-field)', color: 'var(--color-ink)' }}>
                  <i className="size-[7px] rounded-full" style={{ background: `var(--c-${FIELD_RULES[f].module})` }} />{f}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-[12px] text-muted">いつから（この日の朝6:00に切り替え）
            <input type="date" value={date} min={TODAY} onChange={(e) => setDate(e.target.value)} className="min-h-10 rounded-[10px] border border-field bg-surface px-2.5 text-[13.5px] text-ink" />
            {past && <span className="text-bad">今日より前の日は選べません</span>}
          </label>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div className="flex flex-col gap-1 text-[12px] text-muted">いま<div className="flex min-h-10 items-center rounded-[10px] bg-soft px-2.5 text-[13.5px] text-ink">{from}</div></div>
            <ArrowRight size={16} className="mb-3 text-faint" />
            <label className="flex flex-col gap-1 text-[12px] text-muted">変更後
              {rule.options
                ? <select value={to} onChange={(e) => setTo(e.target.value)} className="min-h-10 rounded-[10px] border border-field bg-surface px-2.5 text-[13.5px] text-ink"><option value="">選ぶ</option>{rule.options.map((o) => <option key={o}>{o}</option>)}</select>
                : <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={field === '単価' ? '例：48万' : field === '現場' ? '例：B社（大崎）' : field === '通勤' ? '例：川口→大崎 定期' : '例：川崎市'} className="min-h-10 rounded-[10px] border border-field bg-surface px-2.5 text-[13.5px] text-ink" />}
            </label>
          </div>

          {clash && (
            <div role="alert" key={clash.id} className="mo-shake flex flex-col gap-2 rounded-[10px] border border-bad-line bg-bad-soft px-3 py-2.5 text-bad">
              <span className="flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{p.name} の{field}には、まだ切り替わっていない予約があります（{fmtDate(clash.date)} から「{clash.to}」）。</span>
              <label className="flex items-center gap-2 text-[12.5px] font-semibold"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />前の予約を取り消して、こちらにする</label>
            </div>
          )}

          <div className="rounded-[10px] border border-line px-3.5 py-3">
            <div className="mb-1.5 text-[12px] font-semibold text-muted">{fmtDate(date)} から一緒に変わるもの</div>
            <ul className="flex flex-col gap-1.5">
              {rule.with.map((w, i) => <li key={w} className="mo-fade-up flex items-center gap-2" style={{ ['--i' as string]: i }}><Check size={14} className="text-ok" />{w}</li>)}
            </ul>
            {rule.approve && <div className="mt-2 text-[12px] text-warn">この項目は{SHORT[rule.module]}の承認が要ります。承認されるまで切り替わりません。</div>}
            {field === '現場' && <div className="mt-2 text-[12px] text-muted">通勤の経路が変わる場合は、通勤の予約も同じ日で作られます（経理の承認待ちに載ります）。</div>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button onClick={onClose} className="min-h-10 rounded-[10px] border border-field bg-surface px-3.5 text-[13.5px] font-semibold">やめる</button>
          <PrimaryButton onClick={save} disabled={!ready} title={!canMake ? needText('edit') : clash && !replace ? '前の予約をどうするか選んでください' : !to.trim() ? '変更後を入れてください' : undefined}>
            {rule.approve ? '予約して承認に回す' : '予約する'}
          </PrimaryButton>
        </div>
      </aside>
    </DrawerPortal>
  );
}
