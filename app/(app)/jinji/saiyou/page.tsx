'use client';

import { useState } from 'react';
import { AlertTriangle, CalendarPlus, Check, CircleAlert } from 'lucide-react';
import { ACCEPTORS, FOLLOW_BY, SLOTS, type Acceptor, type FollowState } from '@/lib/saiyou-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';

// 採用（承諾者・面談）＝内定を承諾した人の、入社までのフォロー面談と辞退の兆し。
//   ・兆し：返信が遅い・面談のリスケが重なる・基本情報フォームが未回答・入社日が決まっていない・メモの気になる言葉
//   ・フォロー面談は 担当と枠を選ぶだけで入る → 済みにする
//   地雷：承諾の日時は承諾の記録が正（名簿の作成日は使わない）／同姓同名は応募IDで見分ける／
//         今のシステムの承諾者一覧シートには書き戻さない（下の方は式の展開で、1セル書くと全部消える）／トーク本文は出さない
type Sig = { text: string; strong: boolean };
const WD = '日月火水木金土';
const fmt = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`; };
const FOLLOW_TONE: Record<FollowState, string> = { 未設定: 'bad', 日程調整中: 'warn', 予定あり: 'info', 済み: 'ok' };

function signals(a: Acceptor): Sig[] {
  const s: Sig[] = [];
  if (a.lastReplyDays >= 5) s.push({ text: `本人の返信が ${a.lastReplyDays}日 止まっている`, strong: true });
  else if (a.lastReplyDays >= 3) s.push({ text: `本人の返信が ${a.lastReplyDays}日 空いている`, strong: false });
  if (a.reschedules >= 2) s.push({ text: `フォロー面談のリスケが ${a.reschedules}回`, strong: true });
  if (!a.formDone) s.push({ text: '基本情報フォームがまだ', strong: false });
  if (!a.joinDate) s.push({ text: '入社日が決まっていない', strong: false });
  a.words.forEach((w) => s.push({ text: `面談メモに「${w}」`, strong: true }));
  return s;
}

export default function SaiyouPage() {
  const canEdit = usePerms().can('jinji', 'edit');
  const { hit, toast } = useMotivation();
  const [rows, setRows] = useState<Acceptor[]>(ACCEPTORS);
  const [by, setBy] = useState<Record<string, string>>({});
  const [slot, setSlot] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [onlySig, setOnlySig] = useState(true);

  const list = rows.map((a) => ({ a, s: signals(a) })).sort((x, y) => y.s.filter((v) => v.strong).length - x.s.filter((v) => v.strong).length || y.s.length - x.s.length);
  const sameName = (a: Acceptor) => rows.filter((r) => r.name === a.name).length > 1;
  const need = list.filter(({ a, s }) => s.length > 0 && (a.follow === '未設定' || a.follow === '日程調整中'));
  const shown = onlySig ? list.filter(({ s, a }) => s.length > 0 || a.follow === '予定あり') : list;

  const update = (a: Acceptor, patch: Partial<Acceptor>, text: string, sub: string) => {
    const prev = a;
    setRows((rs) => rs.map((r) => (r.appId === a.appId ? { ...r, ...patch } : r)));
    setFlash(a.appId); setTimeout(() => setFlash(null), 1300); hit();
    toast({ text, sub, undo: () => setRows((rs) => rs.map((r) => (r.appId === a.appId ? prev : r))) });
  };
  const book = (a: Acceptor) => {
    const who = by[a.appId] ?? a.recruiter; const at = slot[a.appId] ?? SLOTS[0];
    update(a, { follow: '予定あり', followAt: at, followBy: who }, `${a.name}（${a.appId}）のフォロー面談を ${at} に入れました`, `→ ${who} の予定と、本人への面談案内の下書きに載りました`);
  };
  const finish = (a: Acceptor) => update(a, { follow: '済み', lastReplyDays: 0 }, `${a.name} のフォロー面談を済みにしました`, '→ 承諾者の記録と、入社手続きの準備に反映しました');

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="採用（承諾者・面談）" sub="内定を承諾した人の、入社までのフォロー面談と辞退の兆し・見本データ" />

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={need.length} total={list.filter(({ s }) => s.length > 0).length} />
        <div className="text-[13px]"><b>兆しがあるのに面談が決まっていない {need.length}人</b><span className="ml-2 text-muted">承諾者 {rows.length}人・面談済み {rows.filter((r) => r.follow === '済み').length}</span>{!canEdit && <div className="text-[12px] text-bad">{needText('edit')}</div>}</div>
        <label className="ml-auto flex items-center gap-1.5 text-[12.5px] text-muted"><input type="checkbox" checked={onlySig} onChange={(e) => setOnlySig(e.target.checked)} />気になる人と予定ありだけ</label>
      </div>

      {need.length === 0 && <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-7 text-center"><Check className="mx-auto text-ok" size={24} /><div className="mt-2 text-[14px] font-bold">兆しのある人には、全員フォロー面談が入りました</div><div className="mt-1 text-[12.5px] text-muted">入社日まで、返信が止まったらまたここに並びます。</div></div>}

      <div className="mo-fade-up overflow-x-auto rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <table className="w-full min-w-[900px] border-collapse text-[13px]">
          <thead><tr className="th-row text-left"><th className="px-4 py-2.5 font-semibold">承諾者</th><th className="px-2 py-2.5 font-semibold">承諾日・入社予定</th><th className="px-2 py-2.5 font-semibold">辞退しそうな兆し</th><th className="px-4 py-2.5 font-semibold">フォロー面談</th></tr></thead>
          <tbody>
            {shown.map(({ a, s }, i) => (
              <tr key={a.appId} className={`mo-fade-in border-t border-line-soft align-top ${flash === a.appId ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5 font-semibold">{a.name}{sameName(a) && <span className="chip" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }} title="同じ名前の別の人がいます。応募IDで見分けてください">同姓同名</span>}</div>
                  <div className="text-[11.5px] text-faint">{a.appId}・採用担当 {a.recruiter}・{a.station}</div>
                </td>
                <td className="num px-2 py-2.5">{fmt(a.acceptedAt)}<div className="text-[12px] text-muted">入社 {a.joinDate ? fmt(a.joinDate) : '未定'}</div></td>
                <td className="px-2 py-2.5">
                  {s.length === 0 ? <span className="text-[12.5px] text-faint">兆しはありません</span> : <ul className="flex flex-col gap-1">{s.map((x) => <li key={x.text} className="flex items-start gap-1.5 text-[12.5px]">{x.strong ? <AlertTriangle size={14} className="mt-0.5 shrink-0 text-bad" /> : <CircleAlert size={14} className="mt-0.5 shrink-0 text-warn" />}<span className={x.strong ? 'font-semibold' : ''}>{x.text}</span></li>)}</ul>}
                </td>
                <td className="px-4 py-2.5">
                  <span className="chip" style={{ background: `var(--tone-${FOLLOW_TONE[a.follow]}-bg)`, color: `var(--tone-${FOLLOW_TONE[a.follow]}-fg)` }}>{a.follow}</span>
                  {a.followAt && <span className="num ml-2 text-[12px] text-muted">{a.followAt}・{a.followBy}</span>}
                  {a.follow === '予定あり' && <button onClick={() => finish(a)} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} className="ml-2 min-h-8 rounded-lg border border-field bg-surface px-2.5 text-[12.5px] font-semibold disabled:opacity-40">済みにする</button>}
                  {(a.follow === '未設定' || a.follow === '日程調整中') && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <select aria-label="面談の担当" value={by[a.appId] ?? a.recruiter} onChange={(e) => setBy((x) => ({ ...x, [a.appId]: e.target.value }))} className="min-h-8 rounded-lg border border-field bg-surface px-1.5 text-[12.5px]">{FOLLOW_BY.map((m) => <option key={m}>{m}</option>)}</select>
                      <select aria-label="面談の枠" value={slot[a.appId] ?? SLOTS[0]} onChange={(e) => setSlot((x) => ({ ...x, [a.appId]: e.target.value }))} className="min-h-8 rounded-lg border border-field bg-surface px-1.5 text-[12.5px]">{SLOTS.map((m) => <option key={m}>{m}</option>)}</select>
                      <button onClick={() => book(a)} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} className="btn-primary inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-[12.5px] font-bold disabled:opacity-40"><CalendarPlus size={14} />入れる</button>
                    </div>
                  )}
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
