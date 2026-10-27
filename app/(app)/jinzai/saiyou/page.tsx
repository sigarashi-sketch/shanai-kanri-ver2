'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarPlus, CircleAlert } from 'lucide-react';
import type { Acceptor, FollowState } from '@/lib/types/jinji';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { LiveBanner } from '@/components/Live';
import { JINJI_URL, jinjiRead, type JMendan, type JMendanList } from '@/lib/live/jinji';
import { useLiveWrite, WriteError } from '@/components/jinji/useLiveWrite';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { acceptorsFromIke, liveSignalLines, shoudakuNote, type SaiyouSignal, type SaiyouSignalsLive } from '@/lib/live/saiyou';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { PersonName } from '@/components/Person';
import { FormIssueButton } from '@/components/FormIssue';

// 採用（承諾者・面談）＝内定を承諾した人の、入社までのフォロー面談と辞退の兆し。
//   ・兆し：返信が遅い・面談のリスケが重なる・基本情報フォームが未回答・入社日が決まっていない・メモの気になる言葉
//     本物のときは 返信が遅い・フォーム未回答・入社日未定 の3つだけ（/api/live/saiyou-signals）。
//     ＋10-26：フォロー面談の記録（今のシステムの v2_jinji_mendan・/api/live/jinji）から 日程の変更の回数 と
//       内勤が書いた面談メモの気になる言葉（決まった言葉だけ・トーク本文は使わない）
//   ・フォロー面談は 担当と枠を選ぶだけで入る → 済みにする
//   地雷：承諾の日時は承諾の記録が正（名簿の作成日は使わない）／同姓同名は応募IDで見分ける／
//         今のシステムの承諾者一覧シートには書き戻さない（下の方は式の展開で、1セル書くと全部消える）／トーク本文は出さない
type Sig = { text: string; strong: boolean };
const WD = '日月火水木金土';
const fmt = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`; };
const strongN = (s: Sig[]) => s.filter((v) => v.strong).length;
const FOLLOW_TONE: Record<FollowState, string> = { 未設定: 'bad', 日程調整中: 'warn', 予定あり: 'info', 済み: 'ok' };


export default function SaiyouPage() {
  const canEdit = usePerms().can('jinji', 'edit');
  // 本物：今の社内システムの承諾者（決着前の人）と兆しの材料（返信の日数・フォーム・入社日）を1本で読む（/api/live/saiyou-signals・10-25）
  //   承諾者の一覧は未経験の人だけに絞って、決着までの人数・中央値も絞ったあとの人で数え直してある（サーバー側）
  //   フォロー面談は今のシステムの v2_jinji_mendan（/api/live/jinji・10-26）。下の fm
  const sg = useLiveRoute<SaiyouSignalsLive>('/api/live/saiyou-signals');
  const live = sg.live;
  const mk = useMikeiken();
  const shoudaku = sg.data?.shoudaku ?? null;
  const liveRows = useMemo(() => acceptorsFromIke(shoudaku), [shoudaku]);
  const rows = live ? liveRows : [];
  const sigBy = useMemo(() => new Map<string, SaiyouSignal>((sg.data?.people || []).map((p) => [p.norm, p])), [sg.data]);
  const sigReady = live;
  const sameName = (a: Acceptor) => rows.filter((r) => r.name === a.name).length > 1;
  // フォロー面談の記録（本物）。同じ人に何件あっても いちばん新しいもの
  const fm = useLiveRoute<JMendanList>(jinjiRead('mendan-follow'));
  const followBy = useMemo(() => { const m = new Map<string, JMendan>(); for (const r of fm.data?.rows || []) { const cur = m.get(r.normalized_name); if (!cur || r.updated_at > cur.updated_at) m.set(r.normalized_name, r); } return m; }, [fm.data]);
  const followSig = (a: Acceptor): Sig[] => {
    const f = followBy.get(a.norm || '');
    if (!f || sameName(a)) return [];
    return [...(f.reschedules >= 2 ? [{ text: `フォロー面談の日程の変更が ${f.reschedules}回`, strong: true }] : []), ...f.words.map((w) => ({ text: `面談メモに「${w}」`, strong: true }))];
  };
  const sig = (a: Acceptor): Sig[] => [...liveSignalLines(sigBy.get(a.norm || ''), sg.data?.sources), ...followSig(a)];
  const { send, error: wErr, setError: setWErr } = useLiveWrite(live, fm.reload);
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const since = (d: string) => Math.max(0, Math.round((Date.parse(today) - Date.parse(d)) / 86400000));
  const [flash, setFlash] = useState<string | null>(null);
  const recruiters = useMemo(() => Array.from(new Set(rows.map((r) => r.recruiter).filter((x) => x && x !== '—'))).sort((a, b) => a.localeCompare(b, 'ja')), [rows]);

  // 本物は 兆しの強い順 → 新しく承諾した順（読み直すまで並びは変わらない）
  const list = rows.map((a) => ({ a, s: sig(a) })).sort((x, y) => strongN(y.s) - strongN(x.s) || y.s.length - x.s.length);
  const liveJoin = (a: Acceptor) => (sigReady && sg.data?.sources.join ? sigBy.get(a.norm || '')?.joinDate ?? null : undefined);
  const shown = list;

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="採用（承諾者・面談）" sub={`内定を承諾した人の、入社までのフォロー面談と辞退の兆し`}><FormIssueButton /></PageTitle>
      <LiveBanner state={sg.state} error={sg.error} onReload={sg.reload} note={`承諾者は今の社内システムから（見るだけ）。${shoudakuNote(shoudaku)}`} />
      <MikeikenNote mk={mk} live={live} />
      <div className="rounded-xl border border-line bg-soft px-4 py-2.5 text-sm text-muted">兆しはフォローの面談のきっかけにだけ使います。案件から外すなど本人に不利な扱いには使いません。</div>
      <WriteError error={wErr} onClose={() => setWErr('')} />
      {sigReady && (sg.data?.warnings.length ?? 0) > 0 && <div className="rounded-xl border border-line bg-soft px-4 py-2.5 text-sm text-muted">{sg.data!.warnings.join('／')}。読めなかった材料は兆しに出していません。</div>}

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-body" style={{ ['--i' as string]: 1 }}>
        <b>決着前の承諾者 {rows.length}人</b>
        {sigReady ? <span className="text-muted">兆しがある人 {list.filter(({ s }) => s.length > 0).length}人（強い兆し {list.filter(({ s }) => strongN(s) > 0).length}人）・兆しの強い順</span> : <span className="text-muted">{sg.state === 'loading' ? '辞退の兆しを読んでいます…' : '新しく承諾した順'}</span>}
      </div>

      <div className="mo-fade-up overflow-x-auto rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <table className="w-full min-w-[900px] border-collapse text-body">
          <thead><tr className="th-row text-left"><th className="px-4 py-2.5 font-semibold">承諾者</th><th className="px-2 py-2.5 font-semibold">承諾日・入社予定</th><th className="px-2 py-2.5 font-semibold">辞退しそうな兆し</th><th className="px-4 py-2.5 font-semibold">フォロー面談</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-muted">{live ? 'まだありません（決着前の承諾者はいません）。' : sg.state === 'error' ? '読めませんでした。' : '読み込み中…'}</td></tr>}
            {shown.map(({ a, s }, i) => (
              <tr key={a.appId} className={`mo-fade-in border-t border-line-soft align-top ${flash === a.appId ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5 font-semibold"><PersonName name={a.name} className="underline-offset-2 hover:underline" />{sameName(a) && <span className="chip" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }} title="同じ名前の別の人がいます。応募IDで見分けてください">同姓同名</span>}</div>
                  <div className="text-xs text-faint">{`採用担当 ${a.recruiter}・承諾から ${since(a.acceptedAt)}日`}</div>
                </td>
                <td className="num whitespace-nowrap px-2 py-2.5">{fmt(a.acceptedAt)}{liveJoin(a) !== undefined && <div className="text-sm text-muted">入社 {liveJoin(a) ? fmt(liveJoin(a)!) : '未定'}</div>}</td>
                <td className="px-2 py-2.5">
                  {live && !sigReady ? <span className="text-sm text-faint">{sg.state === 'loading' ? '読んでいます…' : '読めませんでした'}</span> : s.length === 0 ? <span className="text-sm text-faint">兆しはありません</span> : <ul className="flex flex-col gap-1">{s.map((x) => <li key={x.text} className="flex items-start gap-1.5 text-sm">{x.strong ? <AlertTriangle size={14} className="mt-0.5 shrink-0 text-bad" /> : <CircleAlert size={14} className="mt-0.5 shrink-0 text-warn" />}<span className={x.strong ? 'font-semibold' : ''}>{x.text}</span></li>)}</ul>}
                </td>
                <td className="px-4 py-2.5">
                  <LiveFollow a={a} f={sameName(a) ? undefined : followBy.get(a.norm || '')} same={sameName(a)} recruiters={recruiters} today={today} canEdit={canEdit} send={send} onFlash={() => { setFlash(a.appId); setTimeout(() => setFlash(null), 1300); }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-faint">承諾日は承諾の記録の日時です。名前は基本情報フォームの表記で、同じ名前の人は応募IDで見分けます。トークの本文は出していません（共有のログイン情報などが流れていることがあるため）。{live && '辞退の兆しは LINE の最後の受信からの日数（一度も受信が無い人は承諾からの日数）・基本情報フォームの回答・名簿の入社日と、ここで入れたフォロー面談の日程の変更・面談メモ（内勤が書いたもの）の決まった言葉で出しています。名前で当てるので、同じ名前の承諾者がいる人は判定しません。'}今のシステムの承諾者一覧シートには書き戻しません。</p>
    </main>
  );
}

// ---- 本物のフォロー面談（10-26・今のシステムの v2_jinji_mendan）。担当と枠を選ぶだけで入る → 済みにする。日程を変えると変更の回数に数える ----
//   ★本人への案内・カレンダーには送らない（記録だけ）。メモは内勤が書く（気になる言葉は決まった言葉だけ拾う）
const HOURS = ['12:00', '18:00', '19:00'];
function slotsFrom(today: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < 8 && out.length < 15; i++) {
    const d = new Date(Date.parse(`${today}T00:00:00Z`) + i * 86400000);
    if (d.getUTCDay() === 0) continue;
    for (const h of HOURS) out.push(`${d.getUTCMonth() + 1}/${d.getUTCDate()} ${h}`);
  }
  return out;
}
type Send = ReturnType<typeof useLiveWrite>['send'];
function LiveFollow({ a, f, same, recruiters, today, canEdit, send, onFlash }: { a: Acceptor; f?: JMendan; same: boolean; recruiters: string[]; today: string; canEdit: boolean; send: Send; onFlash: () => void }) {
  const slots = useMemo(() => slotsFrom(today), [today]);
  const [who, setWho] = useState(a.recruiter && a.recruiter !== '—' ? a.recruiter : recruiters[0] || '');
  const [at, setAt] = useState(slots[0] || '');
  const [moving, setMoving] = useState(false);
  const state = f?.state ?? '未設定';
  const tone = FOLLOW_TONE[state as FollowState] ?? 'bad';
  if (same) return <span className="text-sm text-faint" title="同じ名前の承諾者がいるので、名前では面談の記録をつなげません">同姓同名のため記録できません</span>;
  const off = !canEdit;
  const book = () => send({ url: JINJI_URL, body: { action: 'mendan-save', kind: 'follow', name: a.name, normalized_name: a.norm, by_name: who, at_text: at, state: '予定あり' }, text: `${a.name} のフォロー面談を ${at} に入れました`, sub: `→ ${who} の予定に載りました（本人への案内は送っていません）`, undo: (r) => (r.id ? { url: JINJI_URL, body: { action: 'mendan-set', id: r.id, state: '取り消し' } } : null) }).then((x) => { if (x) onFlash(); });
  const move = () => f && send({ url: JINJI_URL, body: { action: 'mendan-set', id: f.id, state: '予定あり', at_text: at, by_name: who }, text: `${a.name} のフォロー面談を ${at} に変えました`, sub: '→ 日程の変更の回数に数えました', undo: () => ({ url: JINJI_URL, body: { action: 'mendan-set', id: f.id, state: f.state, at_text: f.at_text, by_name: f.by_name } }) }).then((x) => { if (x) { setMoving(false); onFlash(); } });
  const finish = () => f && send({ url: JINJI_URL, body: { action: 'mendan-set', id: f.id, state: '済み' }, text: `${a.name} のフォロー面談を済みにしました`, sub: '→ 承諾者の記録に残りました', undo: () => ({ url: JINJI_URL, body: { action: 'mendan-set', id: f.id, state: f.state } }) }).then((x) => { if (x) onFlash(); });
  const saveMemo = (v: string) => { if (!f || v === f.memo) return; send({ url: JINJI_URL, body: { action: 'mendan-set', id: f.id, state: f.state, memo: v }, text: `${a.name} の面談メモを保存しました`, undo: () => ({ url: JINJI_URL, body: { action: 'mendan-set', id: f.id, state: f.state, memo: f.memo } }) }); };
  const pickers = (
    <>
      <select aria-label="面談の担当" value={who} disabled={off} title={off ? needText('edit') : undefined} onChange={(e) => setWho(e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-1.5 text-sm disabled:opacity-50">{(recruiters.includes(who) || !who ? recruiters : [who, ...recruiters]).map((m) => <option key={m}>{m}</option>)}</select>
      <select aria-label="面談の枠" value={at} disabled={off} title={off ? needText('edit') : undefined} onChange={(e) => setAt(e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-1.5 text-sm disabled:opacity-50">{slots.map((m) => <option key={m}>{m}</option>)}</select>
    </>
  );
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip" style={{ background: `var(--tone-${tone}-bg)`, color: `var(--tone-${tone}-fg)` }}>{state}</span>
        {f?.at_text && <span className="num whitespace-nowrap text-sm text-muted">{f.at_text}・{f.by_name}</span>}
        {f && f.reschedules > 0 && <span className="text-xs text-faint">変更 {f.reschedules}回</span>}
        {state === '予定あり' && <button onClick={finish} disabled={off} title={off ? needText('edit') : undefined} className="btn-secondary btn-sm">済みにする</button>}
        {state === '予定あり' && !moving && <button onClick={() => setMoving(true)} disabled={off} className="text-sm text-muted underline-offset-2 hover:underline disabled:opacity-40">日程を変える</button>}
      </div>
      {(state === '未設定' || state === '日程調整中' || moving) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {pickers}
          {moving ? <button onClick={move} disabled={off} className="btn-primary btn-sm">変える</button> : <button onClick={book} disabled={off} title={off ? needText('edit') : undefined} className="btn-primary btn-sm"><CalendarPlus size={14} />入れる</button>}
          {moving && <button onClick={() => setMoving(false)} className="text-sm text-muted">やめる</button>}
        </div>
      )}
      {f && <textarea key={f.memo} defaultValue={f.memo} disabled={off} rows={1} maxLength={2000} placeholder="面談メモ（内勤）" aria-label={`${a.name} の面談メモ`} onBlur={(e) => saveMemo(e.target.value.trim())} className="mt-1.5 block w-full rounded-lg border border-field bg-surface px-2 py-1 text-sm disabled:opacity-50" />}
    </div>
  );
}
