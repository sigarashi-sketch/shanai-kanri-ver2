'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarPlus, Check, CircleAlert } from 'lucide-react';
import { ACCEPTORS, FOLLOW_BY, SLOTS, type Acceptor, type FollowState } from '@/lib/saiyou-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { LiveBanner, NotInLegacy, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { acceptorsFromIke, mikeikenShoudaku, shoudakuNote, type IkeShoudakuList } from '@/lib/live/saiyou';
import { PersonName } from '@/components/Person';

// 採用（承諾者・面談）＝内定を承諾した人の、入社までのフォロー面談と辞退の兆し。
//   ・兆し：返信が遅い・面談のリスケが重なる・基本情報フォームが未回答・入社日が決まっていない・メモの気になる言葉
//   ・フォロー面談は 担当と枠を選ぶだけで入る → 済みにする
//   地雷：承諾の日時は承諾の記録が正（名簿の作成日は使わない）／同姓同名は応募IDで見分ける／
//         今のシステムの承諾者一覧シートには書き戻さない（下の方は式の展開で、1セル書くと全部消える）／トーク本文は出さない
type Sig = { text: string; strong: boolean };
const WD = '日月火水木金土';
const fmt = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`; };
const strongN = (s: Sig[]) => s.filter((v) => v.strong).length;
// 並びは開いたときの「兆しの強さ」で固定（済みにして兆しが減っても行が逃げない）
const RANK = Object.fromEntries([...ACCEPTORS].map((a) => ({ a, s: signals(a) })).sort((x, y) => strongN(y.s) - strongN(x.s) || y.s.length - x.s.length).map(({ a }, i) => [a.appId, i]));
// 開いたときに兆しがあった人（残りのリングの分母）
const WITH_SIG = ACCEPTORS.filter((a) => signals(a).length > 0).length;
const FOLLOW_TONE: Record<FollowState, string> = { 未設定: 'bad', 日程調整中: 'warn', 予定あり: 'info', 済み: 'ok' };

function signals(a: Acceptor): Sig[] {
  const s: Sig[] = [];
  if (a.lastReplyDays >= 5) s.push({ text: `本人の返信が ${a.lastReplyDays}日 止まっている`, strong: true });
  else if (a.lastReplyDays >= 3) s.push({ text: `本人の返信が ${a.lastReplyDays}日 空いている`, strong: false });
  if (a.reschedules >= 2) s.push({ text: `フォロー面談の日程の変更が ${a.reschedules}回`, strong: true });
  if (!a.formDone) s.push({ text: '基本情報フォームがまだ', strong: false });
  if (!a.joinDate) s.push({ text: '入社日が決まっていない', strong: false });
  a.words.forEach((w) => s.push({ text: `面談メモに「${w}」`, strong: true }));
  return s;
}

export default function SaiyouPage() {
  const canEdit = usePerms().can('jinji', 'edit');
  const { hit, toast } = useMotivation();
  const [sRows, setRows] = useState<Acceptor[]>(ACCEPTORS);
  // 本物：今の社内システムの承諾者（決着前の人）。兆し・フォロー面談は今のシステムに無いので出さない（入れる・済みにするも無し）
  const ike = useIke<IkeShoudakuList>('shoudaku-story?list=1&days=90');
  const live = ike.live;
  // 本物は未経験の人だけ（今のプロパーリストに入っている人）。決着までの人数・中央値も絞ったあとの人で数え直す
  const mk = useMikeiken();
  const shoudaku = useMemo(() => (ike.data ? mikeikenShoudaku(ike.data, mk.keep(ike.data.people || [], (p) => p.name || p.norm)) : null), [ike.data, mk]);
  const liveRows = useMemo(() => acceptorsFromIke(shoudaku), [shoudaku]);
  const rows = live ? liveRows : sRows;
  const sig = (a: Acceptor): Sig[] => (live ? [] : signals(a));
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const since = (d: string) => Math.max(0, Math.round((Date.parse(today) - Date.parse(d)) / 86400000));
  const [by, setBy] = useState<Record<string, string>>({});
  const [slot, setSlot] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [onlySig, setOnlySig] = useState(true);
  const [touched, setTouched] = useState<string[]>([]); // この画面で処理した人（絞り込みで消さない）

  const list = rows.map((a) => ({ a, s: sig(a) })).sort((x, y) => (live ? 0 : RANK[x.a.appId] - RANK[y.a.appId]));
  const sameName = (a: Acceptor) => rows.filter((r) => r.name === a.name).length > 1;
  const need = live ? [] : list.filter(({ a, s }) => s.length > 0 && (a.follow === '未設定' || a.follow === '日程調整中'));
  const shown = live ? list : onlySig ? list.filter(({ s, a }) => s.length > 0 || a.follow === '予定あり' || touched.includes(a.appId)) : list;

  const update = (a: Acceptor, patch: Partial<Acceptor>, text: string, sub: string) => {
    // 変えた項目だけ、この人の元の値に戻す
    const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, a[k as keyof Acceptor]])) as Partial<Acceptor>;
    setRows((rs) => rs.map((r) => (r.appId === a.appId ? { ...r, ...patch } : r)));
    setTouched((t) => (t.includes(a.appId) ? t : [...t, a.appId]));
    setFlash(a.appId); setTimeout(() => setFlash(null), 1300); hit();
    toast({ text, sub, undo: () => setRows((rs) => rs.map((r) => (r.appId === a.appId ? { ...r, ...prev } : r))) });
  };
  const book = (a: Acceptor) => {
    const who = by[a.appId] ?? a.recruiter; const at = slot[a.appId] ?? SLOTS[0];
    update(a, { follow: '予定あり', followAt: at, followBy: who }, `${a.name}（${a.appId}）のフォロー面談を ${at} に入れました`, `→ ${who} の予定と、本人への面談案内の下書きに載りました`);
  };
  const finish = (a: Acceptor) => update(a, { follow: '済み', lastReplyDays: 0 }, `${a.name} のフォロー面談を済みにしました`, '→ 承諾者の記録と、入社手続きの準備に反映しました');

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="採用（承諾者・面談）" sub={`内定を承諾した人の、入社までのフォロー面談と辞退の兆し${live ? '' : '・見本データ'}`} />
      <LiveBanner state={ike.state} error={ike.error} onReload={ike.reload} note={`承諾者は今の社内システムから（見るだけ）。${shoudakuNote(shoudaku)}`} />
      <MikeikenNote mk={mk} live={ike.live} />
      {live && <NotInLegacy what="辞退の兆し（返信の間隔・面談の日程変更・メモの言葉）とフォロー面談の記録" />}

      {live ? (
        <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-[13px]" style={{ ['--i' as string]: 1 }}>
          <b>決着前の承諾者 {rows.length}人</b><span className="text-muted">新しく承諾した順</span>
        </div>
      ) : (
      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={need.length} total={Math.max(WITH_SIG, need.length)} />
        <div className="text-[13px]"><b>兆しがあるのに面談が決まっていない {need.length}人</b><span className="ml-2 text-muted">承諾者 {rows.length}人・面談済み {rows.filter((r) => r.follow === '済み').length}</span>{!canEdit && <div className="text-[12px] text-bad">{needText('edit')}</div>}</div>
        <label className="ml-auto flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-muted"><input type="checkbox" checked={onlySig} onChange={(e) => setOnlySig(e.target.checked)} />気になる人と予定ありだけ</label>
      </div>
      )}

      {!live && need.length === 0 && <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-7 text-center"><Check className="mx-auto text-ok" size={24} /><div className="mt-2 text-[14px] font-bold">兆しのある人には、全員フォロー面談が入りました</div><div className="mt-1 text-[12.5px] text-muted">入社日まで、返信が止まったらまたここに並びます。</div></div>}

      <div className="mo-fade-up overflow-x-auto rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <table className="w-full min-w-[900px] border-collapse text-[13px]">
          <thead><tr className="th-row text-left"><th className="px-4 py-2.5 font-semibold">承諾者</th><th className="px-2 py-2.5 font-semibold">承諾日・入社予定</th><th className="px-2 py-2.5 font-semibold">辞退しそうな兆し</th><th className="px-4 py-2.5 font-semibold">フォロー面談</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-[12.5px] text-muted">気になる人はいません。</td></tr>}
            {shown.map(({ a, s }, i) => (
              <tr key={a.appId} className={`mo-fade-in border-t border-line-soft align-top ${flash === a.appId ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5 font-semibold"><PersonName name={a.name} className="underline-offset-2 hover:underline" />{sameName(a) && <span className="chip" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }} title="同じ名前の別の人がいます。応募IDで見分けてください">同姓同名</span>}</div>
                  <div className="text-[11.5px] text-faint">{live ? `採用担当 ${a.recruiter}・承諾から ${since(a.acceptedAt)}日` : `${a.appId}・採用担当 ${a.recruiter}・${a.station}`}</div>
                </td>
                <td className="num whitespace-nowrap px-2 py-2.5">{fmt(a.acceptedAt)}{!live && <div className="text-[12px] text-muted">入社 {a.joinDate ? fmt(a.joinDate) : '未定'}</div>}</td>
                <td className="px-2 py-2.5">
                  {live ? <span className="text-[12px] text-faint">今の社内システムに無い</span> : s.length === 0 ? <span className="text-[12.5px] text-faint">兆しはありません</span> : <ul className="flex flex-col gap-1">{s.map((x) => <li key={x.text} className="flex items-start gap-1.5 text-[12.5px]">{x.strong ? <AlertTriangle size={14} className="mt-0.5 shrink-0 text-bad" /> : <CircleAlert size={14} className="mt-0.5 shrink-0 text-warn" />}<span className={x.strong ? 'font-semibold' : ''}>{x.text}</span></li>)}</ul>}
                </td>
                <td className="px-4 py-2.5">
                  {live ? <span className="text-[12px] text-faint">今の社内システムに無い</span> : (<>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip" style={{ background: `var(--tone-${FOLLOW_TONE[a.follow]}-bg)`, color: `var(--tone-${FOLLOW_TONE[a.follow]}-fg)` }}>{a.follow}</span>
                    {a.followAt && <span className="num whitespace-nowrap text-[12px] text-muted">{a.followAt}・{a.followBy}</span>}
                    {a.follow === '予定あり' && <button onClick={() => finish(a)} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} className="min-h-8 whitespace-nowrap rounded-lg border border-field bg-surface px-2.5 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40">済みにする</button>}
                  </div>
                  {(a.follow === '未設定' || a.follow === '日程調整中') && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <select aria-label="面談の担当" value={by[a.appId] ?? a.recruiter} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} onChange={(e) => setBy((x) => ({ ...x, [a.appId]: e.target.value }))} className="min-h-8 rounded-lg border border-field bg-surface px-1.5 text-[12.5px] disabled:opacity-50">{FOLLOW_BY.map((m) => <option key={m}>{m}</option>)}</select>
                      <select aria-label="面談の枠" value={slot[a.appId] ?? SLOTS[0]} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} onChange={(e) => setSlot((x) => ({ ...x, [a.appId]: e.target.value }))} className="min-h-8 rounded-lg border border-field bg-surface px-1.5 text-[12.5px] disabled:opacity-50">{SLOTS.map((m) => <option key={m}>{m}</option>)}</select>
                      <button onClick={() => book(a)} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} className="btn-primary inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-[12.5px] font-bold disabled:cursor-not-allowed disabled:opacity-40"><CalendarPlus size={14} />入れる</button>
                    </div>
                  )}
                  </>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] leading-relaxed text-faint">承諾日は承諾の記録の日時です。名前は基本情報フォームの表記で、同じ名前の人は応募IDで見分けます。トークの本文は出していません（共有のログイン情報などが流れていることがあるため）。今のシステムの承諾者一覧シートには書き戻しません。</p>
    </main>
  );
}
