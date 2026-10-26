'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, Check, ChevronDown, Clock } from 'lucide-react';
import type { TodayRow } from '@/lib/types/roumu';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { LiveBanner, useIke } from '@/components/Live';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { nudge, nudgeSub, setMark, useMarks, type IkeDepCall } from '@/lib/live/roumu';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { KINMU_CHOICES, TODAY_NOTE_MAX, todayFromIke, withTodayRows, type IkeAbsence, type IkeToday, type IkeTodayRow } from '@/lib/live/today';
import { postLive } from '@/lib/live/post';
import { PersonName } from '@/components/Person';

// 当日の出勤状況（労務/営業管理）＝今の時点で「出勤しているはずなのに打刻が無い人」から片づける。
//   ・材料は freee の打刻＋提出済みシフト（空欄＝休み）＋勤怠連絡＋出発コール（今のシステムと同じ）
//   ・未打刻・出発コール未着 → あおいで本人に促す → 結果を選ぶ（自由入力にしない）
//   ・欠勤・遅刻の連絡 → 現場（担当営業）に伝えたら片づく
//   ・未打刻のお知らせは平日10:00にも自動で出る（今のシステムの決まりのまま）
const NEED: TodayRow['state'][] = ['未打刻', '出発コール未着', '欠勤の連絡', '遅刻の連絡'];
const RESULTS = ['打ち忘れ（出勤している）', '遅刻だった（連絡なし）', '欠勤だった（連絡なし）', '連絡がつかない → 担当営業へ'];
const STATE_TONE: Record<TodayRow['state'], string> = { 未打刻: 'bad', 出発コール未着: 'warn', 欠勤の連絡: 'warn', 遅刻の連絡: 'caution', 出勤済み: 'ok', 休み: 'mute', 始業前: 'info', 取得できていない: 'mute' };
// 本物：1段目（キャッシュだけ・すぐ）→ 2段目（freee から取り直す）。2段目が間に合わなければ1段目のまま（今の画面と同じ2段構え）
const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export default function TodayPage() {
  const canEdit = usePerms().can('roumu', 'edit');
  const { hit, toast } = useMotivation();
  const [sales, setSales] = useState('すべて');
  const [showOthers, setShowOthers] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => setDate(jstToday()), []);
  const quick = useIke<IkeToday>(date ? `kintai-today?date=${date}&stale=1` : null);
  const full = useIke<IkeToday>(quick.live && date ? `kintai-today?date=${date}` : null);
  const absence = useIke<IkeAbsence>(quick.live && date ? `attendance-board?action=absence&date=${date}` : null);
  const live = quick.live;
  const block = !canEdit ? needText('edit') : undefined;
  const okEdit = canEdit;
  // 本物（10-26）：出発報告の届き具合（送らない・読むだけ）と、結果・現場に伝えた・促した の印（roumu_marks）
  const dep = useIke<IkeDepCall>(live && date ? 'roster?op=roumu&action=depcall' : null);
  const marks = useMarks(['today-result', 'today-site', 'nudge-punch', 'nudge-depcall'], date ? date.slice(0, 7) : undefined, live && !!date);
  const mkey = (id: string) => `${date}|${id}`;
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [werr, setWerr] = useState('');
  const best = full.live && full.data?.ok ? full.data : quick.data;
  // 本物は未経験の人だけ（今のプロパーリストに入っている人）。出勤予定・出勤済みの数も絞った人で数え直す
  const mk = useMikeiken();
  const L = live ? todayFromIke(withTodayRows(best, (rs) => mk.keep(rs, 'name')), absence.live ? absence.data : null) : null;
  const depOf = new Map((dep.data?.ok ? dep.data.rows : []).map((x) => [x.nn, x]));
  const ALL = L ? L.rows.map((r) => {
    const d = depOf.get(r.personId);
    if (!d || (d.state !== 'missing' && d.state !== 'over')) return r;
    const tail = `出発の連絡なし（締切 ${d.deadline}・始業 ${d.start}）`;
    if (r.state === '始業前' || r.state === '取得できていない') return { ...r, state: '出発コール未着' as const, contact: tail };
    if (r.state === '未打刻') return { ...r, memo: [tail, r.memo].filter(Boolean).join(' ／ ') };
    return r;
  }) : [];
  // 「済んだ」は印から読む
  const doneOf = (id: string) => marks.get('today-result', mkey(id))?.value || (marks.get('today-site', mkey(id)) ? '現場に伝えた' : '');
  const nudgedOf = (id: string, st: TodayRow['state']) => !!marks.get(st === '未打刻' ? 'nudge-punch' : 'nudge-depcall', mkey(id));
  const TOTAL = L ? { planned: L.planned, done: L.done } : { planned: 0, done: 0 };
  const AT = L ? { date: L.date, time: L.time } : { date: '', time: '' };
  const rawOf = (key: string) => best?.rows?.find((x) => x.key === key);
  const saved = (text: string) => { hit(); toast({ text, sub: '→ 今の社内システムに保存しました' }); };
  const loadErr = live && best && !best.ok ? (typeof best.error === 'string' ? best.error : best.error?.message) : '';

  const reps = ['すべて', ...Array.from(new Set(ALL.map((r) => r.sales)))];
  const mine = ALL.filter((r) => sales === 'すべて' || r.sales === sales);
  const need = mine.filter((r) => NEED.includes(r.state)).sort((a, b) => NEED.indexOf(a.state) - NEED.indexOf(b.state) || (b.late ?? 0) - (a.late ?? 0));
  const open = need.filter((r) => !doneOf(r.personId));
  const others = mine.filter((r) => !NEED.includes(r.state));
  // 上の数は「担当営業で絞る」に合わせる（出勤予定・出勤済みの全体数は未経験の人で数え直した総数から）
  const noPunch = mine.filter((r) => r.state === '未打刻' && !doneOf(r.personId)).length;

  const pulse = (id: string) => { setFlash(id); setTimeout(() => setFlash(null), 1300); };
  const settle = (r: TodayRow, what: string) => {
    if (!live || !date) return;
    const kind = what === '現場に伝えた' ? 'today-site' : 'today-result';
    const val = what === '現場に伝えた' ? '伝えた' : what;
    setWerr('');
    setMark(kind, mkey(r.personId), val, { nn: r.personId, ym: date.slice(0, 7) })
      .then(() => { pulse(r.personId); hit(); marks.reload(); toast({ text: `${r.person}：${what}`, sub: '→ 今の社内システムに残しました', undo: () => { setMark(kind, mkey(r.personId), '').then(() => marks.reload()).catch((e) => setWerr((e as Error).message)); } }); })
      .catch((e) => setWerr(`${r.person}：${(e as Error).message}`));
  };
  const askNudge = (r: TodayRow) => {
    if (!live || !date) return;
    const kind = r.state === '未打刻' ? 'punch' : 'depcall';
    setConfirm({
      title: `${r.person} に${kind === 'punch' ? '打刻' : '出発の連絡'}を促す`, okLabel: '促す',
      lines: ['本人の公式LINE（1:1）に決まった文を1通送ります', 'いまは送信を止めている設定なら、送らずに「促した」の印だけ残します'],
      run: async () => { const j = await nudge(kind, date, [{ nn: r.personId }]); pulse(r.personId); hit(); marks.reload(); toast({ text: `${r.person} に${kind === 'punch' ? '打刻' : '出発の連絡'}を促しました`, sub: nudgeSub(j) }); },
    });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="当日の出勤状況" sub={`${AT.date ? `${AT.date} ${AT.time} 時点。` : ''}freee の打刻・提出済みシフト・勤怠連絡から出しています${live ? (full.live ? '' : '・いまは前に取った打刻（freee から取り直し中）') : ''}`}>
        <select aria-label="担当営業で絞る" value={sales} onChange={(e) => setSales(e.target.value)} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-body">
          {reps.map((x) => <option key={x} value={x}>{x === 'すべて' ? '担当営業：すべて' : `担当営業：${x}`}</option>)}
        </select>
      </PageTitle>
      <LiveBanner state={loadErr ? 'error' : quick.state} error={quick.error || loadErr} onReload={() => { quick.reload(); full.reload(); absence.reload(); }}
        note={`勤務区分・メモ・結果・現場に伝えた は本物に保存します。促す（LINE）は確認のあとで送ります（送信を止めている間は印だけ）。出発の連絡は名簿で「出発報告」を付けた人だけ見ます。${full.state === 'error' ? 'freee からの取り直しが間に合わなかったので、前に取った打刻で出しています。' : ''}${absence.state === 'error' ? '欠勤・遅刻の連絡は読めませんでした。' : ''}`} />
      <MikeikenNote mk={mk} live={live} />
      {werr && <div className="rounded-xl px-4 py-2.5 text-sm" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>{werr}</div>}
      {live && dep.state === 'error' && <div className="text-sm text-muted">出発報告の届き具合は読めませんでした（{dep.error}）</div>}

      <div className="mo-fade-up grid grid-cols-2 gap-3 md:grid-cols-4" style={{ ['--i' as string]: 1 }}>
        {[
          ['出勤予定', TOTAL.planned, '人', 'var(--color-ink)'],
          ['出勤済み', TOTAL.done + need.filter((r) => doneOf(r.personId).startsWith('打ち忘れ')).length, '人', 'var(--color-ok)'],
          ['未打刻', noPunch, '人', noPunch ? 'var(--color-bad)' : 'var(--color-ok)'],
          ['対応が要る', open.length, '件', open.length ? 'var(--color-warn)' : 'var(--color-ok)'],
        ].map(([l, n, u, c]) => (
          <div key={l as string} className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="text-sm text-muted">{l}</div>
            <div className="num text-xl font-bold" style={{ color: c as string }}>{n}<span className="ml-0.5 text-body font-semibold text-muted">{u}</span></div>
          </div>
        ))}
      </div>

      <div className="mo-fade-up flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 2 }}>
        <RemainRing remain={open.length} total={need.length} />
        <div className="text-body"><b>対応が要る人</b><div className="text-sm text-muted">始業を過ぎても打刻が無い人・出発コールが来ていない人・休みや遅れの連絡があった人。未打刻のお知らせは平日10:00にも自動で本人に届きます。</div></div>
        <Link href="/roumu/approval" className="ml-auto shrink-0 text-sm font-semibold" style={{ color: 'var(--ad)' }}>申請の承認へ</Link>
      </div>

      {!live && <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-body text-muted">{quick.state === 'loading' ? '読み込み中…' : '読めませんでした'}</div>}
      {live && open.length === 0 && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-10 text-center">
          <Check className="mx-auto text-ok" size={26} />
          <div className="mt-2 text-md font-bold">今の時点で対応が要る人はいません</div>
          <div className="mt-1 text-sm text-muted">遅い始業の人に打刻が無ければ、またここに出ます。</div>
        </div>
      )}

      {need.length > 0 && (
        <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 3 }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-body">
              <thead><tr className="th-row text-left">
                <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">現場・シフト</th><th className="px-2 py-2.5 font-semibold">状況</th><th className="px-2 py-2.5 font-semibold">連絡・メモ</th><th className="px-4 py-2.5 font-semibold">対応</th>
              </tr></thead>
              <tbody>
                {need.map((r, i) => {
                  const d = doneOf(r.personId);
                  const tone = STATE_TONE[r.state];
                  return (
                    <tr key={r.personId} className={`mo-fade-in border-t border-line-soft align-top ${flash === r.personId ? 'mo-flash' : 'row'} ${d ? 'opacity-55' : ''}`} style={{ ['--i' as string]: i }}>
                      <td className="px-4 py-2.5"><PersonName name={r.person} className="font-semibold underline-offset-2 hover:underline" /><div className="text-xs text-faint">営業 {r.sales}</div></td>
                      <td className="px-2 py-2.5">{r.site}<div className="num text-xs text-faint">{r.shift}</div></td>
                      <td className="px-2 py-2.5">
                        <span className="chip" style={{ background: `var(--tone-${tone}-bg)`, color: `var(--tone-${tone}-fg)` }}>{r.state}</span>
                        {r.late != null && <div className={`num mt-1 flex items-center gap-1 text-xs ${r.late >= 30 ? 'font-semibold text-bad' : 'text-muted'}`}><Clock size={12} />始業から {r.late}分</div>}
                      </td>
                      <td className="px-2 py-2.5 text-sm">{r.contact ?? <span className="text-faint">連絡なし</span>}
                        {live && date && rawOf(r.personId) && <LiveEdit raw={rawOf(r.personId)!} date={date} canEdit={canEdit} onSaved={saved} />}</td>
                      <td className="px-4 py-2.5">
                        {d ? <span className="inline-flex items-center gap-1 text-sm font-semibold text-ok"><Check size={14} />{d}</span>
                          : r.state === '未打刻' || r.state === '出発コール未着' ? (
                            <div className="flex flex-wrap items-center gap-2">
                              {nudgedOf(r.personId, r.state) ? <span className="text-sm text-faint">促しました・返事待ち</span>
                                : <button onClick={() => askNudge(r)} disabled={!okEdit} title={block} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-semibold disabled:opacity-40" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}><Bell size={14} />あおいで促す</button>}
                              <select aria-label={`${r.person} の結果`} value="" disabled={!okEdit} title={block} onChange={(e) => e.target.value && settle(r, e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-sm disabled:opacity-50">
                                <option value="">結果を選ぶ…</option>
                                {RESULTS.map((x) => <option key={x} value={x}>{x}</option>)}
                              </select>
                            </div>
                          ) : (
                            <button onClick={() => settle(r, '現場に伝えた')} disabled={!okEdit} title={block} className="btn-primary btn-sm">現場に伝えた</button>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-line bg-surface">
        <button onClick={() => setShowOthers((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-body">
          <ChevronDown size={16} className={`transition-transform ${showOthers ? '' : '-rotate-90'}`} />
          <b>出勤済み・休みの人</b><span className="text-muted">（{others.length}人）</span>
        </button>
        {showOthers && (
          <ul className="mo-fade-in border-t border-line-soft px-4 py-2 text-sm">
            {others.map((r) => (
              <li key={r.personId} className="flex flex-wrap items-center gap-3 py-1.5">
                <span className="chip" style={{ background: `var(--tone-${STATE_TONE[r.state]}-bg)`, color: `var(--tone-${STATE_TONE[r.state]}-fg)` }}>{r.state}</span>
                <PersonName name={r.person} className="font-semibold underline-offset-2 hover:underline" />
                <span className="text-muted">{r.site}</span>
                <span className="num text-faint">{r.punch ? `${r.punch} 出勤` : r.contact}</span>
                {live && date && rawOf(r.personId) && <div className="w-full md:ml-auto md:w-auto"><LiveEdit raw={rawOf(r.personId)!} date={date} canEdit={canEdit} onSaved={saved} inline /></div>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
      <p className="text-xs text-faint">シフトが空欄の日は休みとして扱います（今のシステムと同じ）。特別休暇の名前は freee の設定に合わせます。遅刻・欠勤の扱い（控除など）の最終判断は社労士に確認してください。</p>
    </main>
  );
}

// 本物の行の 勤務区分（選ぶだけ）とメモ（内勤のメモ・書いて欄を離れたら保存）。10-25
function LiveEdit({ raw, date, canEdit, onSaved, inline }: { raw: IkeTodayRow; date: string; canEdit: boolean; onSaved: (t: string) => void; inline?: boolean }) {
  const [kubun, setKubun] = useState(raw.kubun || '');
  const [note, setNote] = useState(raw.noteCarried ? '' : raw.note || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setKubun(raw.kubun || ''); }, [raw.kubun]);
  useEffect(() => { setNote(raw.noteCarried ? '' : raw.note || ''); }, [raw.note, raw.noteCarried]);
  const run = async (fn: () => Promise<unknown>, text: string, undo: () => void) => {
    setBusy(true); setErr('');
    try { await fn(); onSaved(text); } catch (e) { setErr((e as Error).message); undo(); } finally { setBusy(false); }
  };
  const saveKubun = (v: string) => { const prev = kubun; setKubun(v); run(() => postLive('/api/live/kintai-today', { action: 'kubun', name: raw.name, kinmuKubun: v }), `${raw.name} の勤務区分を「${v || '未設定'}」にしました`, () => setKubun(prev)); };
  const saveNote = () => {
    const cur = raw.noteCarried ? '' : raw.note || '';
    if (note.trim() === cur.trim()) return;
    run(() => postLive('/api/live/kintai-today', { action: 'note', date, key: raw.key, name: raw.name, note }), note.trim() ? `${raw.name} のメモを残しました` : `${raw.name} のメモを消しました`, () => {});
  };
  const lock = !canEdit ? needText('edit') : undefined;
  return (
    <div className={`mt-1 flex ${inline ? 'flex-wrap items-center' : 'flex-col'} gap-1`}>
      <select aria-label={`${raw.name} の勤務区分`} value={kubun} disabled={!canEdit || busy} title={lock || '勤務区分を変えると名簿・未打刻のお知らせにも効きます'} onChange={(e) => saveKubun(e.target.value)} className="min-h-7 max-w-[180px] rounded-lg border border-field bg-surface px-1.5 text-xs disabled:opacity-50">
        <option value="">勤務区分：未設定</option>{KINMU_CHOICES.map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
      <textarea aria-label={`${raw.name} のメモ`} value={note} disabled={!canEdit || busy} title={lock} maxLength={TODAY_NOTE_MAX} rows={1} onChange={(e) => setNote(e.target.value)} onBlur={saveNote}
        placeholder={raw.noteCarried && raw.note ? `前のメモ（${(raw.noteDate || "").slice(5).replace('-', '/')}）：${raw.note}` : 'メモ（欄を離れたら保存）'}
        className="min-h-7 w-full min-w-[160px] rounded-lg border border-field bg-surface px-2 py-1 text-xs disabled:opacity-50" />
      {err && <span className="text-xs text-bad">{err}</span>}
    </div>
  );
}
