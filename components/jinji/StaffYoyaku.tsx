'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { PersonName } from '@/components/Person';
import { needText, usePerms } from '@/components/Perms';
import { normName } from '@/lib/live/staff';
import type { StaffYoyaku } from '@/lib/live/staff-extra';
import type { StatusPatch } from '@/lib/live/staff-write';
import { useLiveWrite, WriteError } from './useLiveWrite';
import { staffReq } from './staffWrite';

// 社員一覧の「待機・退社の予約」タブ（今の名簿の「予約」タブ・記入漏れチェックの写し・10-25）。
//   ・待機は予約日の朝6時、退社は退社日の翌朝6時に、今の社内システムの見回り（cron）がチェックを入れる。ここは予約を書くだけ
//   ・予約日が今日以前（退社は昨日以前・待機中の人）は予約にせず、その場でチェックを入れる（今の名簿と同じ）
//   ・人は一覧から選ぶだけ（打ち間違いで幽霊の予約を作らない）。日付はカレンダーで選ぶ
//   ・記入漏れチェック＝先月まで稼働管理情報一覧に載っていたのに今月いない未経験の人のうち、退社・待機・次の入場日のどれも無い人
type Person = { name: string; kana: string; taisha: boolean; taiki: boolean; override: string };
type Gap = { name: string; lastYm: string; endDate?: string; taijou?: string; reason?: string; jitai?: boolean; poa?: boolean; joukyou?: string };
const WD = '日月火水木金土';
const fmt = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return m ? `${Number(m[2])}/${Number(m[3])}（${WD[new Date(`${d}T00:00:00Z`).getUTCDay()]}）` : d; };
const left = (d: string, today: string, taisha: boolean) => {
  const n = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (!Number.isFinite(n)) return '';
  if (taisha) return n < 0 ? '反映待ち' : n === 0 ? '今日が退社日（明朝反映）' : n === 1 ? '明日が退社日' : `あと${n}日`;
  return n <= 0 ? '反映待ち' : n === 1 ? '明日' : `あと${n}日`;
};

export function StaffYoyaku({ live, people, yoyaku, today, onDone }: { live: boolean; people: Person[]; yoyaku: StaffYoyaku[]; today: string; onDone?: () => void }) {
  const canEdit = usePerms().can('jinji', 'edit');
  const off = !canEdit;
  const [local, setLocal] = useState<StaffYoyaku[]>(yoyaku);
  useEffect(() => { setLocal(yoyaku); }, [yoyaku]);
  const { send, error, setError, busy } = useLiveWrite(live, onDone);
  const [kind, setKind] = useState<'taiki' | 'taisha'>('taiki');
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const [date, setDate] = useState('');
  const kata = (s: string) => s.replace(/[\s　]+/g, '').replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  const cands = useMemo(() => {
    const s = q.replace(/[\s　]+/g, '');
    const xs = [...people].sort((a, b) => (kata(a.kana) || a.name).localeCompare(kata(b.kana) || b.name, 'ja'));
    return s ? xs.filter((p) => normName(p.name).includes(normName(s)) || kata(p.kana).includes(kata(s))) : xs;
  }, [people, q]);
  const markOf = (name: string) => local.filter((y) => normName(y.name) === normName(name)).map((y) => `${y.kind === 'taiki' ? '待機' : '退社'} ${fmt(y.date)} 予約済`).join('／');

  const book = () => {
    const p = people.find((x) => x.name === who);
    if (!p) { setError('人を一覧から選んでください'); return; }
    if (!date) { setError('日付を選んでください'); return; }
    const before = local;
    let patch: StatusPatch; let text: string; let apply = () => {};
    if (kind === 'taisha') {
      if (p.taisha) { setError(`${p.name} さんはもう退社になっています`); return; }
      if (date < today || p.taiki) { patch = { taisha: true, taishaBi: date, taishaYotei: '', ...(p.override ? { override: '' } : {}) }; text = `${p.name} さんを退社にしました（退社日 ${fmt(date)}・${date < today ? '日付が過ぎている' : '待機中の'}のですぐ反映）`; apply = () => setLocal((xs) => xs.filter((y) => !(y.kind === 'taisha' && normName(y.name) === normName(p.name)))); }
      else { patch = { taishaYotei: date }; text = `${p.name} さんを ${fmt(date)} 退社で予約しました`; apply = () => setLocal((xs) => [...xs.filter((y) => !(y.kind === 'taisha' && normName(y.name) === normName(p.name))), { name: p.name, kind: 'taisha', date }]); }
    } else if (date <= today) { patch = { taiki: true, taikiYotei: '', ...(p.override ? { override: '' } : {}) }; text = `${p.name} さんを待機にしました（今日以前の日付なのですぐ反映）`; apply = () => setLocal((xs) => xs.filter((y) => !(y.kind === 'taiki' && normName(y.name) === normName(p.name)))); }
    else { patch = { taikiYotei: date }; text = `${p.name} さんを ${fmt(date)} から待機で予約しました`; apply = () => setLocal((xs) => [...xs.filter((y) => !(y.kind === 'taiki' && normName(y.name) === normName(p.name))), { name: p.name, kind: 'taiki', date }]); }
    send(staffReq({ kind: 'status', name: p.name, patch }, text, { sub: kind === 'taisha' ? '→ 退社日の翌朝に退社チェックが入ります（退社日も入ります）' : '→ その日の朝に待機チェックが入ります（出勤状況・未打刻アラートの対象外・再アサインも入ります）', apply, revert: () => setLocal(before) }))
      .then((r) => { if (r) { setWho(''); setDate(''); setQ(''); } });
  };
  const cancel = (y: StaffYoyaku) => {
    const before = local;
    send(staffReq({ kind: 'status', name: y.name, patch: y.kind === 'taiki' ? { taikiYotei: '' } : { taishaYotei: '' } }, `${y.name} さんの${y.kind === 'taiki' ? '待機' : '退社'}の予約（${fmt(y.date)}）を取り消しました`, {
      apply: () => setLocal((xs) => xs.filter((x) => x !== y)), revert: () => setLocal(before),
    }));
  };

  // 記入漏れチェック（タブを開いたときに1回読む）
  const [gap, setGap] = useState<{ state: 'idle' | 'loading' | 'ok' | 'err'; ready?: boolean; curYm?: string; rows: Gap[]; err?: string }>({ state: 'idle', rows: [] });
  const loadGap = () => {
    if (!live) { setGap({ state: 'ok', ready: true, rows: [] }); return; }
    setGap((g) => ({ ...g, state: 'loading' }));
    fetch('/api/live/staff/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ what: 'exitGap' }) })
      .then((r) => r.json()).then((j) => setGap(j.error ? { state: 'err', rows: [], err: j.error } : { state: 'ok', ready: j.ready, curYm: j.curYm, rows: j.rows || [] }))
      .catch((e) => setGap({ state: 'err', rows: [], err: (e as Error).message }));
  };
  useEffect(() => { loadGap(); }, [live]); // eslint-disable-line react-hooks/exhaustive-deps
  const gapTaiki = (g: Gap) => {
    if (!window.confirm(`${g.name} さんを待機にしますか？（再アサインも自動で入ります）`)) return;
    const before = gap;
    send(staffReq({ kind: 'status', name: g.name, patch: { taiki: true } }, `${g.name} さんを待機にしました`, {
      sub: '→ 記入漏れから外れました・当日の出勤状況・未打刻アラートの対象外', apply: () => setGap((x) => ({ ...x, rows: x.rows.filter((r) => r !== g) })), revert: () => setGap(before),
    }));
  };

  const ty = local.filter((y) => y.kind === 'taiki'), ts = local.filter((y) => y.kind === 'taisha');
  const panel = 'rounded-xl border border-line bg-surface px-4 py-3.5';
  const list = (items: StaffYoyaku[], empty: string) => items.length === 0 ? <div className="text-sm text-muted">{empty}</div> : (
    <div className="flex flex-wrap gap-1.5">
      {items.map((y) => (
        <span key={`${y.kind}-${y.name}`} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-soft py-1 pl-3 pr-1 text-sm">
          <PersonName name={y.name} className="font-semibold underline-offset-2 hover:underline" /><span className="num">{fmt(y.date)}</span><span className="text-xs text-muted">{left(y.date, today, y.kind === 'taisha')}</span>
          <button onClick={() => cancel(y)} disabled={off} title={off ? needText('edit') : 'この予約を取り消す'} aria-label={`${y.name} さんの予約を取り消す`} className="rounded-full p-1 text-muted hover:bg-sunken disabled:opacity-40"><X size={12} /></button>
        </span>
      ))}
    </div>
  );

  return (
    <div className="mo-axis flex flex-col gap-3">
      <WriteError error={error} onClose={() => setError('')} />
      <section className={panel}>
        <div className="mb-2 flex flex-wrap items-center gap-2"><b className="text-body">予約する</b><span className="text-sm text-muted">{kind === 'taisha' ? '退社日の翌朝に退社チェックが入ります（退社日が昨日以前・待機中の人はすぐ退社にします）' : '指定した日の朝に待機チェックが入ります（今日以前ならすぐ待機にします）'}</span>
          <span className="ml-auto text-sm text-muted">{local.length ? `待機 ${ty.length}件／退社 ${ts.length}件` : ''}</span></div>
        <div className="flex flex-wrap items-end gap-2">
          <div role="radiogroup" aria-label="予約の種類" className="flex overflow-hidden rounded-[10px] border border-field">
            {(['taiki', 'taisha'] as const).map((k) => <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className="min-h-9 px-3.5 text-body" style={kind === k ? { background: 'var(--as)', color: 'var(--ad)', fontWeight: 700 } : undefined}>{k === 'taiki' ? '待機' : '退社'}</button>)}
          </div>
          <label className="flex flex-col gap-1 text-sm text-muted">しぼる
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・フリガナ" className="min-h-9 w-[140px] rounded-[10px] border border-field bg-surface px-2 text-body text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">人（{cands.length}人）
            <select value={who} onChange={(e) => setWho(e.target.value)} className="min-h-9 w-[240px] rounded-[10px] border border-field bg-surface px-2 text-body text-ink">
              <option value="">選んでください</option>
              {cands.slice(0, 400).map((p) => { const m = p.taisha ? '退社済' : markOf(p.name) || (p.taiki ? '待機中' : ''); return <option key={p.name} value={p.name}>{p.name}{p.kana ? `（${p.kana}）` : ''}{m ? `　${m}` : ''}</option>; })}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">{kind === 'taisha' ? '退社日' : '待機にする日'}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-body text-ink" />
          </label>
          <button onClick={book} disabled={off || busy} title={off ? needText('edit') : undefined} className="btn-primary">予約する</button>
        </div>
      </section>
      <section className={panel}>
        <h3 className="text-body font-bold">待機の予約</h3>
        <div className="mb-2 text-sm text-muted">指定した日の朝に「待機」チェックが自動で入ります（当日の出勤状況・未打刻アラート・稼働人数の対象から外れます）</div>
        {list(ty, '予約はありません。「待機」を選んで人と日付を入れると、その日の朝に待機チェックが入ります。')}
        <h3 className="mt-4 text-body font-bold">退社の予約</h3>
        <div className="mb-2 text-sm text-muted">退社日の翌朝に「退社」チェックが自動で入り、退社日も記入されます（退社日当日はまだ出勤状況に並びます）</div>
        {list(ts, '予約はありません。「退社」を選んで人と退社日を入れると、退社日の翌朝に退社チェックが入ります。')}
      </section>
      <section className={panel}>
        <div className="flex flex-wrap items-center gap-2"><b className="text-body">記入漏れチェック</b>{gap.state === 'ok' && gap.rows.length > 0 && <span className="text-sm text-muted">{gap.rows.length}人</span>}
          <button onClick={loadGap} className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-lg border border-field px-2.5 text-sm"><RefreshCw size={13} />読み直す</button></div>
        <div className="mb-2 mt-1 text-sm text-muted">先月までは稼働管理情報一覧に載っていたのに今月いない未経験の人のうち、退社・待機・次の入場日のどれも入っていない人です。待機なら「待機にする」、退職なら上の「退社」で予約してください。</div>
        {gap.state === 'loading' && <div className="text-sm text-muted">読み込み中…</div>}
        {gap.state === 'err' && <div className="text-sm text-bad">読めませんでした：{gap.err}</div>}
        {gap.state === 'ok' && gap.ready === false && <div className="text-sm text-muted">今月（{gap.curYm}）の稼働管理情報一覧がまだ取り込まれていないので、判定できません。</div>}
        {gap.state === 'ok' && gap.ready !== false && gap.rows.length === 0 && <div className="text-sm text-muted">該当する人はいません。</div>}
        {gap.state === 'ok' && gap.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-body">
              <thead><tr className="th-row text-left"><th className="px-2 py-2 font-semibold">氏名</th><th className="px-2 py-2 font-semibold">最後に載っていた月</th><th className="px-2 py-2 font-semibold">契約の終了日</th><th className="px-2 py-2 font-semibold">退場日（日報）</th><th className="px-2 py-2 font-semibold">メモ</th><th /></tr></thead>
              <tbody>
                {gap.rows.map((g) => (
                  <tr key={g.name} className="row border-t border-line-soft">
                    <td className="whitespace-nowrap px-2 py-2 font-semibold"><PersonName name={g.name} className="underline-offset-2 hover:underline" /></td>
                    <td className="num px-2 py-2">{g.lastYm}</td><td className="num px-2 py-2">{g.endDate || '—'}</td><td className="num px-2 py-2">{g.taijou || '—'}</td>
                    <td className="px-2 py-2 text-sm text-muted">{[g.reason === 'taijou_only' ? '退場日はあるが待機・退社なし' : '日報に退場日なし', g.jitai ? '辞退' : '', g.poa ? '営業止め' : '', g.joukyou || ''].filter(Boolean).join('／')}</td>
                    <td className="px-2 py-2 text-right"><button onClick={() => gapTaiki(g)} disabled={off} title={off ? needText('edit') : undefined} className="inline-flex min-h-8 items-center rounded-lg border px-2.5 text-sm font-semibold disabled:opacity-40" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}>待機にする</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
