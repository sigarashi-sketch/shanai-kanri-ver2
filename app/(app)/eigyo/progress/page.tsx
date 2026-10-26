'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, MessageSquareText, Plus, X } from 'lucide-react';
import type { Candidate, ChatMsg, ProgressRow, Via } from '@/lib/types/eigyo';
import { PageTitle, PrimaryButton } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { DrawerPortal } from '@/components/DrawerPortal';
import { LiveBanner, useIke } from '@/components/Live';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { postLive } from '@/lib/live/post';
import { groupBubbles, type GroupThreadRes } from '@/lib/live/person';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { gidOfRow, liveDirectRows, liveProgress, type DirectData } from '@/lib/live/progress';
import { matchGroupName, mdhm, type ProgressData, type ProgressReply } from '@/lib/live/eigyo-common';
import { PersonName } from '@/components/Person';

// 案件進捗（単独の画面・2026-10-23 shoya）。
//   ・送った案件 … あおい／グループ直接／手動配信 のどれで送った分も1本で並べる。返信・OK/NG は経路に関係なく同じ扱い
//   ・回収候補 … 内勤がグループに直接書いた「案件らしい発言」。一番近い案件を当てて、内勤が✓で確定したものだけ載せる
//     どの案件か迷うものは「チャットで前後を見る」でグループのやりとりを確かめてから決める
//   列・並び・タブを自分で変える「カスタム」はあとで決める（10-23 shoya）
//   本物（ログイン中）：今の /api/proxy?action=getProgressData と getProgressReplies（直近7日の送信）。
//     OK/NG は今の📮判断と同じ口（/api/live/eigyo judge → markSlackForwarded。OK は確認のうえ Slack の案件スレッドへ・NG は取り消せる）
//     回収候補＝/api/roster?op=eigyo&action=direct（内勤のグループ発言から拾う・10-26 足した）。✓で載せた分は「グループ直接」で送った案件に並ぶ
const VIA_STYLE: Record<Via, { bg: string; fg: string }> = {
  あおい: { bg: 'var(--tone-info-bg)', fg: 'var(--tone-info-fg)' },
  グループ直接: { bg: 'var(--tone-warn-bg)', fg: 'var(--tone-warn-fg)' },
  手動配信: { bg: 'var(--tone-purple-bg)', fg: 'var(--tone-purple-fg)' },
};
const DEC_STYLE: Record<string, { bg: string; fg: string }> = {
  OK: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)' }, NG: { bg: 'var(--tone-mute-bg)', fg: 'var(--tone-mute-fg)' }, その他: { bg: 'var(--tone-purple-bg)', fg: 'var(--tone-purple-fg)' }, 未判断: { bg: 'var(--tone-bad-bg)', fg: 'var(--tone-bad-fg)' },
};
const Chip = ({ s, children }: { s: { bg: string; fg: string }; children: React.ReactNode }) => (
  <span className="chip" style={{ background: s.bg, color: s.fg }}>{children}</span>
);
const scoreTone = (n: number) => (n >= 85 ? 'var(--color-ok)' : n >= 70 ? 'var(--color-warn)' : 'var(--color-bad)');

type TabKey = 'sent' | 'collect';
type ChatOpen = { group: string; thread: ChatMsg[]; focus?: string; cand?: Candidate; gid?: string };

export default function ProgressPage() {
  const perm = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const pd = useIke<ProgressData>('proxy?action=getProgressData');
  const pr = useIke<ProgressReply[]>(pd.live ? 'proxy?action=getProgressReplies' : null);
  const live = pd.live;
  // 本物は未経験の人だけ：送り先のグループ名に、今のプロパーリストの人の名前が入っている行だけ（今の matchRosterName と同じ当て方）
  const mk = useMikeiken();
  const lp0 = useMemo(() => liveProgress(pd.data, Array.isArray(pr.data) ? pr.data : null), [pd.data, pr.data]);
  const dd = useIke<DirectData>(live ? 'roster?op=eigyo&action=direct' : null);
  const ddata = dd.data?.ok ? dd.data : null;
  // 判断を押した直後の値（読み直しが返るまで画面だけ先に変える）
  const [judged, setJudged] = useState<Record<string, ProgressRow['decision']>>({});
  const lp = useMemo(() => {
    const norms = mk.set ? [...mk.set] : null;
    const keep = (g: string) => mk.state === 'none' || (!!norms && !!matchGroupName(g, norms));
    const ld = liveDirectRows(ddata, pd.data, Array.isArray(pr.data) ? pr.data : null);
    const tsOf = (id: string) => Number(id.split(':').pop()) || 0;
    const rows = [...lp0.rows, ...ld.rows].filter((r) => keep(r.group)).sort((a, b) => tsOf(b.id) - tsOf(a.id))
      .map((r) => (judged[r.id] ? { ...r, decision: judged[r.id], slack: judged[r.id] === 'OK' } : r));
    const cands: Candidate[] = (ddata?.candidates ?? []).filter((c) => keep(c.group)).map((c) => ({
      id: c.id, personId: '', person: c.group || '（名前なし）', group: c.group, msgId: c.id, poster: c.poster, postedAt: mdhm(c.ts), match: c.match,
      hint: `案件の紹介に出る言葉が ${c.words}個`, thread: [{ id: c.id, at: mdhm(c.ts), who: 'staff' as const, name: c.poster || '内勤', text: c.text }],
    }));
    const gidOf = Object.fromEntries((ddata?.candidates ?? []).map((c) => [c.id, c.groupId]));
    return { ...lp0, rows, threads: { ...lp0.threads, ...ld.threads }, cases: [...lp0.cases, ...ld.extraCases], cands, gidOf };
  }, [lp0, mk, ddata, pd.data, pr.data, judged]);
  const canEdit = perm && live;
  const noEdit = live ? needText('edit') : '案件進捗を読み込めていません';
  const caseOf = (no: string) => lp.cases.find((c) => c.no === no);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [gone, setGone] = useState<Record<string, boolean>>({});   // 本物：決めた直後に候補から消す（読み直しを待たない）
  const rows = live ? lp.rows : [];
  const cands = live ? lp.cands.filter((c) => !gone[c.id]) : [];
  const [pick, setPick] = useState<Record<string, string>>({}); // 候補ごとに内勤が選び直した案件No
  const [flash, setFlash] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatOpen | null>(null);
  const [via, setVia] = useState<Via | 'すべて'>('すべて');
  const total = live ? lp.cands.length : 0;

  const [tab, setTab] = useState<TabKey>('sent');
  const [rowFlash, setRowFlash] = useState<string | null>(null);
  const go = (k: TabKey) => { setTab(k); window.history.replaceState(null, '', `/eigyo/progress${k === 'sent' ? '' : '?tab=collect'}`); };
  // ?tab=collect で始める。クエリは useEffect で読む
  useEffect(() => { const q = new URLSearchParams(window.location.search); if (q.get('tab') === 'collect') setTab('collect'); }, []);

  const caseFor = (c: Candidate) => pick[c.id] ?? c.match?.caseNo ?? '';

  const settle = (c: Candidate, asCase: boolean) => {
    if (!canEdit || flash === c.id) return; // 消える前に2回押しても二重に載せない
    const no = caseFor(c);
    if (!live) return;
    {
      // 本物：今のシステムの回収の表に「載せた（どの案件か）／案件ではない」を書く。取り消すと候補に戻る
      setFlash(c.id);
      postLive('/api/live/eigyo', { action: 'directDecide', id: c.id, decision: asCase ? 'case' : 'not_case', caseNo: asCase ? no : '' })
        .then((j) => {
          setChat((o) => (o?.cand?.id === c.id ? null : o));
          setGone((g) => ({ ...g, [c.id]: true }));
          hit();
          const label = no ? caseOf(no)?.name ?? no : `新しい案件（${String((j as { caseNo?: string }).caseNo || '')}）`;
          toast({
            text: asCase ? `${c.person} への ${label} を載せました` : '案件ではない、にしました',
            sub: asCase ? '→ 送った案件に「グループ直接」で載り、返信待ちに入りました' : '→ 同じ発言はもう候補に出ません',
            undo: () => { postLive('/api/live/eigyo', { action: 'directUndo', id: c.id }).then(() => { setGone((g) => { const n = { ...g }; delete n[c.id]; return n; }); dd.reload(); }).catch((e) => toast({ text: '取り消せませんでした', sub: (e as Error).message })); },
          });
          dd.reload();
        })
        .catch((e) => toast({ text: '載せられませんでした', sub: (e as Error).message }))
        .finally(() => setFlash(null));
    }
  };

  // 返信があった行の OK / NG を選ぶ（未判断を片づける）
  const decide = (r: ProgressRow, d: 'OK' | 'NG') => {
    if (!canEdit || !live) return;
    {
      // 本物：今の📮判断（markSlackForwarded）。押した時に見えていた値（未判断）のままのときだけ書く＝同時に押されたら今の値を出す
      const body = { action: 'judge', caseNo: r.caseNo, gid: gidOfRow(r.id), name: r.group };
      const name = caseOf(r.caseNo)?.name ?? r.caseNo;
      const done = () => {
        setJudged((j) => ({ ...j, [r.id]: d }));
        setRowFlash(r.id); setTimeout(() => setRowFlash(null), 1300);
        hit();
        toast({
          text: `${r.person} の ${name} を「${d}」にしました`,
          sub: d === 'OK' ? '→ Slack の案件スレッドに流しました（📮営業へ）' : '→ この案件はこの人の候補から外しました',
          undo: d === 'NG' ? () => { postLive('/api/live/eigyo', { ...body, status: '', prev: 'NG' }).then(() => { setJudged((j) => ({ ...j, [r.id]: '未判断' })); pd.reload(); }).catch((e) => toast({ text: '取り消せませんでした', sub: (e as Error).message })); } : undefined,
        });
        pd.reload();
      };
      const run = async () => { try { await postLive('/api/live/eigyo', { ...body, status: d, prev: '' }); } catch (e) { pd.reload(); throw e; } done(); };
      if (d === 'OK') setConfirm({ title: '「OK」にして営業へ回します', lines: [`${r.person}`, `案件：${name}`, `返信：${r.reply.slice(0, 60)}`], sends: 'Slack の案件スレッドに流れます（今の📮OK と同じ）', okLabel: 'OK にする', run });
      else run().catch((e) => toast({ text: '保存できませんでした', sub: (e as Error).message }));
    }
  };

  const shown = rows.filter((r) => via === 'すべて' || r.via === via);
  const kpi = [
    { label: '直近7日に送った', n: rows.length, sub: `グループ直接 ${rows.filter((r) => r.via === 'グループ直接').length}件` },
    { label: '返信待ち', n: rows.filter((r) => !r.reply).length, sub: '要員からの返事がまだ' },
    { label: '未判断', n: rows.filter((r) => r.reply && r.decision === '未判断').length, sub: '返信あり・OK/NG 待ち' },
    { label: 'OK', n: rows.filter((r) => r.decision === 'OK').length, sub: `営業へ ${rows.filter((r) => r.slack).length}件` },
  ];

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="案件進捗" sub="あおい・グループ直接・手動配信で送った案件を1本で。グループに直接書いた案件も回収して載せる" />
      <LiveBanner state={pd.state} error={pd.error} onReload={() => { pd.reload(); pr.reload(); dd.reload(); }} note={`直近7日の送信 ${rows.length}件（今の案件進捗と同じ材料）。OK・NG は今の📮判断と同じに保存します${pr.state === 'error' ? '・返信が読めませんでした' : ''}${dd.state === 'error' || (dd.data && !dd.data.ok) ? '・回収候補が読めませんでした' : ''}`} />
      <MikeikenNote mk={mk} live={live} />

      <div className="mo-fade-up grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ ['--i' as string]: 1 }}>
        {kpi.map((k) => (
          <div key={k.label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="text-sm text-muted">{k.label}</div>
            <div className="num text-xl font-bold">{k.n}<span className="ml-0.5 text-body font-semibold text-muted">件</span></div>
            <div className="text-xs text-faint">{k.sub}</div>
          </div>
        ))}
      </div>

      <div role="tablist" className="mo-fade-up flex flex-wrap gap-1 border-b border-line" style={{ ['--i' as string]: 2 }}>
        {([['sent', '送った案件'], ['collect', '回収候補']] as [TabKey, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)} className="tab">
            {l}{k === 'collect' && cands.length > 0 && <span className="num ml-1.5 rounded-full bg-bad px-1.5 text-xs font-bold text-white">{cands.length}</span>}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-faint">列・並び・タブを自分で変えるのは、あとで決めます</span>
      </div>

      <div key={tab} className={`mo-axis ${chat ? 'xl:pr-[444px]' : ''}`}>
        {tab === 'sent' ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {(['すべて', 'あおい', 'グループ直接', '手動配信'] as const).map((v) => (
                <button key={v} onClick={() => setVia(v)} aria-pressed={via === v} className="fchip">
                  {v} <span className="num">{v === 'すべて' ? rows.length : rows.filter((r) => r.via === v).length}</span>
                </button>
              ))}
            </div>
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-body">
                  <thead><tr className="th-row text-left">
                    <th className="px-4 py-2.5 font-semibold">案件</th><th className="px-2 py-2.5 font-semibold">要員</th><th className="px-2 py-2.5 font-semibold">送った経路</th><th className="px-2 py-2.5 font-semibold">送った日時</th><th className="px-2 py-2.5 font-semibold">返信</th><th className="px-2 py-2.5 font-semibold">判断</th><th className="px-4 py-2.5" />
                  </tr></thead>
                  <tbody>
                    {shown.map((r, i) => {
                      const c = caseOf(r.caseNo);
                      return (
                        <tr key={r.id} className={`mo-fade-in border-t border-line-soft ${rowFlash === r.id ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                          <td className="px-4 py-2.5"><div className="font-semibold">{c?.name ?? r.caseNo}</div><div className="text-xs text-faint">{r.caseNo}{c?.price && ` ・ ${c.price}`}</div></td>
                          <td className="px-2 py-2.5"><PersonName name={r.person} /></td>
                          <td className="whitespace-nowrap px-2 py-2.5"><Chip s={VIA_STYLE[r.via]}>{r.via}</Chip>{r.via !== 'あおい' && <span className="ml-1.5 text-xs text-muted">{r.sender}</span>}</td>
                          <td className="num whitespace-nowrap px-2 py-2.5">{r.sentAt}</td>
                          <td className="max-w-[240px] px-2 py-2.5">{r.reply ? <><span className="line-clamp-1">{r.reply}</span><span className="text-xs text-faint">{r.replyAt}</span></> : <span className="text-sm font-semibold text-bad">返信待ち</span>}</td>
                          <td className="whitespace-nowrap px-2 py-2.5">
                            {r.reply && r.decision === '未判断' ? (
                              <span className="inline-flex gap-1">
                                {(['OK', 'NG'] as const).map((d) => (
                                  <button key={d} onClick={() => decide(r, d)} disabled={!canEdit} title={!canEdit ? noEdit : `返事を見て「${d}」にする`} className="btn-secondary btn-sm" style={d === 'OK' ? { color: 'var(--tone-ok-fg)' } : undefined}>{d}</button>
                                ))}
                              </span>
                            ) : <Chip s={DEC_STYLE[r.decision]}>{r.decision}</Chip>}
                            {r.slack && <span className="ml-1.5 text-xs text-muted">📮営業へ</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button onClick={() => setChat({ group: r.group, thread: lp.threads[r.id] ?? [] })} className="inline-flex min-h-8 items-center whitespace-nowrap gap-1.5 rounded-lg border px-2.5 text-sm font-semibold" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}><MessageSquareText size={14} />チャット</button>
                          </td>
                        </tr>
                      );
                    })}
                    {shown.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-body text-muted">{pd.state === 'loading' ? '読み込み中…' : pd.state === 'error' ? '案件進捗を読み込めませんでした' : via === 'すべて' ? '送った案件はまだありません' : `「${via}」で送った案件はまだありません`}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
              <RemainRing remain={cands.length} total={total} />
              <div className="text-body"><b>グループに直接書いた案件の回収</b><div className="text-sm text-muted">内勤の発言から案件らしいものを拾い、一番近い案件を当てています。✓で確定したものだけ「送った案件」に載ります。{`直近${ddata?.days ?? 14}日の発言から拾っています。`}</div></div>
            </div>

            {cands.length === 0 && (pd.state === 'loading' || dd.state === 'loading') && <div className="rounded-xl border border-line bg-surface px-6 py-8 text-center text-body text-muted">読み込み中…</div>}
            {cands.length === 0 && live && dd.state !== 'loading' && (
              <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-10 text-center">
                <Check className="mx-auto text-ok" size={26} />
                <div className="mt-2 text-md font-bold">回収候補はぜんぶ片づきました</div>
                <div className="mt-1 text-sm text-muted">新しくグループに書かれた案件は、ここにまた出ます。</div>
              </div>
            )}

            {cands.map((c, i) => {
              const msg = c.thread.find((m) => m.id === c.msgId)!;
              const no = caseFor(c);
              return (
                <article key={c.id} className={`mo-fade-up rounded-xl border border-line bg-surface ${flash === c.id ? 'mo-flash' : ''}`} style={{ ['--i' as string]: i }}>
                  <div className="flex flex-wrap items-start gap-4 px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted"><PersonName name={c.person} className="text-body font-bold text-ink underline-offset-2 hover:underline" /><span>{c.group}</span><span>・{c.poster} が {c.postedAt} に書き込み</span></div>
                      <p className="mt-2 whitespace-pre-line rounded-[10px] bg-soft px-3 py-2 text-body leading-relaxed">{msg.text}</p>
                      {c.hint && <div className="mt-1.5 text-xs text-faint">拾った理由：{c.hint}</div>}
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-[300px]">
                      <label className="text-xs text-faint">どの案件か
                        <select aria-label="どの案件か" value={no} onChange={(e) => setPick((p) => ({ ...p, [c.id]: e.target.value }))} className="mt-1 block min-h-9 w-full rounded-[10px] border border-field bg-surface px-2 text-body text-ink">
                          <option value="">新しい案件として登録</option>
                          {lp.cases.map((x) => <option key={x.no} value={x.no}>{x.no} {x.name}</option>)}
                        </select>
                      </label>
                      <div className="text-xs">
                        {c.match && !pick[c.id] ? <span style={{ color: scoreTone(c.match.score) }}>本文の近さ <b className="num">{c.match.score}%</b>{c.match.score < 70 && '・案件の紹介かどうか確かめてください'}</span>
                          : !no ? <span className="text-warn">近い案件がありません。確定すると「新しい案件」（G＋日時の番号）として載せます</span>
                          : <span className="text-muted">選び直しました</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft px-4 py-2.5">
                    <button onClick={() => setChat({ group: c.group, thread: c.thread, focus: c.msgId, cand: c, gid: lp.gidOf[c.id] })} className="mr-auto inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border px-3 text-body font-semibold" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}><MessageSquareText size={15} />チャットで前後を見る</button>
                    <button onClick={() => settle(c, false)} disabled={!canEdit} title={!canEdit ? noEdit : undefined} className="btn-secondary">案件ではない</button>
                    <PrimaryButton onClick={() => settle(c, true)} disabled={!canEdit} title={!canEdit ? noEdit : undefined}>
                      <span className="inline-flex items-center gap-1.5">{no ? <Check size={15} /> : <Plus size={15} />}{no ? '案件進捗に載せる' : '登録して載せる'}</span>
                    </PrimaryButton>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {chat && (
        <DrawerPortal>
          <aside key={chat.group + (chat.focus ?? '')} aria-label="グループのやりとり" className="mo-drawer drawer">
            <div className="flex items-start justify-between px-5 py-4">
              <div><div className="text-sm text-faint">LINEグループのやりとり</div><div className="text-lg font-bold">{chat.group}</div></div>
              <button aria-label="閉じる" onClick={() => setChat(null)} className="flex size-[34px] items-center justify-center rounded-[10px] border border-line"><X size={16} /></button>
            </div>
            <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto bg-soft px-4 py-4">
              {chat.gid && <LiveGroupThread gid={chat.gid} focusText={chat.thread[0]?.text ?? ''} />}
              {!chat.gid && chat.thread.map((m, i) => {
                const mine = m.who !== 'person';
                const focus = m.id === chat.focus;
                return (
                  <div key={m.id} className={`mo-fade-up flex flex-col ${mine ? 'items-end' : 'items-start'}`} style={{ ['--i' as string]: i }}>
                    <div className="mb-0.5 text-xs text-faint">{m.name}・{m.at}</div>
                    <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-body leading-relaxed ${focus ? 'mo-scale-in shadow-[0_0_0_3px_var(--al)]' : ''}`}
                      style={mine ? { background: focus ? 'var(--a)' : 'var(--color-surface)', color: focus ? 'var(--ao)' : 'var(--color-ink)', border: '1px solid var(--color-line)' } : { background: 'var(--tone-ok-bg)', color: 'var(--color-ink)' }}>
                      {m.text}
                    </div>
                    {focus && <div className="mt-1 text-xs font-semibold" style={{ color: 'var(--ad)' }}>↑ 案件として拾った発言</div>}
                  </div>
                );
              })}
            </div>
            {chat.cand && (
              <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
                <button onClick={() => settle(chat.cand!, false)} disabled={!canEdit} title={!canEdit ? noEdit : undefined} className="btn-secondary">案件ではない</button>
                <PrimaryButton onClick={() => settle(chat.cand!, true)} disabled={!canEdit} title={!canEdit ? noEdit : undefined}>{caseFor(chat.cand) ? '案件進捗に載せる' : '登録して載せる'}</PrimaryButton>
              </div>
            )}
          </aside>
        </DrawerPortal>
      )}
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
    </main>
  );
}

// 回収候補の「チャットで前後を見る」（本物）：今のチャット画面と同じ口でグループのやりとりを読み、拾った発言を光らせる
function LiveGroupThread({ gid, focusText }: { gid: string; focusText: string }) {
  const gt = useIke<GroupThreadRes>(`chat?action=groupThread&groupId=${encodeURIComponent(gid)}&bc=1`);
  if (gt.state === 'loading') return <p className="text-body text-muted">読み込み中…</p>;
  if (gt.state === 'error') return <p className="text-body text-bad">{gt.error}</p>;
  const key = focusText.slice(0, 40);
  return (<>{groupBubbles(gt.data).map((m, i) => {
    const focus = !!key && m.text.startsWith(key);
    return (
      <div key={m.key} className={`mo-fade-up flex flex-col ${m.out ? 'items-end' : 'items-start'}`} style={{ ['--i' as string]: Math.min(i, 12) }}>
        <div className="mb-0.5 text-xs text-faint">{m.who}{m.who && '・'}{m.at}</div>
        <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-body leading-relaxed ${focus ? 'mo-scale-in shadow-[0_0_0_3px_var(--al)]' : ''}`}
          style={m.out ? { background: focus ? 'var(--a)' : 'var(--color-surface)', color: focus ? 'var(--ao)' : 'var(--color-ink)', border: '1px solid var(--color-line)' } : { background: 'var(--tone-ok-bg)', color: 'var(--color-ink)' }}>{m.text}</div>
        {focus && <div className="mt-1 text-xs font-semibold" style={{ color: 'var(--ad)' }}>↑ 案件として拾った発言</div>}
      </div>
    );
  })}</>);
}
