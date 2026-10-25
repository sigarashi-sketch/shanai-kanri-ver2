'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, MessageSquareText, Plus, X } from 'lucide-react';
import { CANDIDATES, CASES, PROGRESS, caseOf, type Candidate, type ChatMsg, type ProgressRow, type Via } from '@/lib/progress-sample';
import { PageTitle, PrimaryButton } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { DrawerPortal } from '@/components/DrawerPortal';
import { LIVE_WRITE_BLOCKED, LiveBanner, NotInLegacy, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { liveProgress } from '@/lib/live/progress';
import { matchGroupName, type ProgressData, type ProgressReply } from '@/lib/live/eigyo-common';
import { PersonName } from '@/components/Person';

// 案件進捗（単独の画面・2026-10-23 shoya）。
//   ・送った案件 … あおい／グループ直接／手動配信 のどれで送った分も1本で並べる。返信・OK/NG は経路に関係なく同じ扱い
//   ・回収候補 … 内勤がグループに直接書いた「案件らしい発言」。一番近い案件を当てて、内勤が✓で確定したものだけ載せる
//     どの案件か迷うものは「チャットで前後を見る」でグループのやりとりを確かめてから決める
//   列・並び・タブを自分で変える「カスタム」はあとで決める（10-23 shoya）
//   本物（ログイン中）：今の /api/proxy?action=getProgressData と getProgressReplies を読むだけ（直近7日の送信）。
//     OK/NG の判断は今の画面から（ここでは押せない）。回収候補は今のシステムに無いので出さない
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
type ChatOpen = { group: string; thread: ChatMsg[]; focus?: string; cand?: Candidate };

export default function ProgressPage() {
  const perm = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const pd = useIke<ProgressData>('proxy?action=getProgressData');
  const pr = useIke<ProgressReply[]>(pd.live ? 'proxy?action=getProgressReplies' : null);
  const live = pd.live;
  // 本物は未経験の人だけ：送り先のグループ名に、今のプロパーリストの人の名前が入っている行だけ（今の matchRosterName と同じ当て方）
  const mk = useMikeiken();
  const lp0 = useMemo(() => liveProgress(pd.data, Array.isArray(pr.data) ? pr.data : null), [pd.data, pr.data]);
  const lp = useMemo(() => {
    const norms = mk.set ? [...mk.set] : null;
    return { ...lp0, rows: mk.state === 'none' ? lp0.rows : norms ? lp0.rows.filter((r) => matchGroupName(r.group, norms)) : [] };
  }, [lp0, mk]);
  const canEdit = perm && !live;
  const noEdit = live ? LIVE_WRITE_BLOCKED : needText('edit');
  const caseOf = (no: string) => (live ? lp.cases : CASES).find((c) => c.no === no);
  const [rowsS, setRows] = useState<ProgressRow[]>(PROGRESS);
  const rows = live ? lp.rows : rowsS;
  const [cands, setCands] = useState<Candidate[]>(CANDIDATES);
  const [pick, setPick] = useState<Record<string, string>>({}); // 候補ごとに内勤が選び直した案件No
  const [flash, setFlash] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatOpen | null>(null);
  const [via, setVia] = useState<Via | 'すべて'>('すべて');
  const total = CANDIDATES.length;

  const [tab, setTab] = useState<TabKey>('sent');
  const [rowFlash, setRowFlash] = useState<string | null>(null);
  const go = (k: TabKey) => { setTab(k); window.history.replaceState(null, '', `/eigyo/progress${k === 'sent' ? '' : '?tab=collect'}`); };
  // ?tab=collect / ?chat=<候補id> で始める（画面の見本を撮るとき用）。クエリは useEffect で読む
  useEffect(() => { const q = new URLSearchParams(window.location.search); if (q.get('tab') === 'collect') setTab('collect'); const id = q.get('chat'); const c = CANDIDATES.find((x) => x.id === id); if (c) setChat({ group: c.group, thread: c.thread, focus: c.msgId, cand: c }); }, []);

  const caseFor = (c: Candidate) => pick[c.id] ?? c.match?.caseNo ?? '';

  const settle = (c: Candidate, asCase: boolean) => {
    if (!canEdit || flash === c.id) return; // 消える前に2回押しても二重に載せない
    const no = caseFor(c);
    setFlash(c.id);
    setChat((o) => (o?.cand?.id === c.id ? null : o));
    setTimeout(() => {
      setFlash(null);
      setCands((xs) => xs.filter((x) => x.id !== c.id));
      const reply = c.thread.find((m) => m.who === 'person' && m.at > c.postedAt);
      const row: ProgressRow = { id: `g-${c.id}`, caseNo: no || '新規', person: c.person, personId: c.personId, group: c.group, via: 'グループ直接', sentAt: c.postedAt, sender: c.poster, reply: reply?.text ?? '', replyAt: reply?.at.slice(-5), decision: '未判断' };
      if (asCase) { setRows((rs) => [row, ...rs]); setRowFlash(row.id); setTimeout(() => setRowFlash(null), 1300); }
      hit();
      toast({
        text: asCase ? `${c.person} への ${no ? caseOf(no)?.name : '新しい案件'} を載せました` : '案件ではない、にしました',
        sub: asCase ? '→ 送った案件に「グループ直接」で載り、返信待ちに入りました' : '→ 同じ発言はもう候補に出ません',
        // 元の並びの位置に戻す（先頭に飛ばさない）
        undo: () => { setCands((xs) => (xs.some((x) => x.id === c.id) ? xs : CANDIDATES.filter((k) => k.id === c.id || xs.some((x) => x.id === k.id)))); if (asCase) setRows((rs) => rs.filter((r) => r.id !== row.id)); },
      });
    }, 450);
  };

  // 返信があった行の OK / NG を選ぶ（未判断を片づける）
  const decide = (r: ProgressRow, d: 'OK' | 'NG') => {
    if (!canEdit) return;
    const prev = { decision: r.decision, slack: r.slack };
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, decision: d, slack: d === 'OK' ? true : x.slack } : x)));
    setRowFlash(r.id); setTimeout(() => setRowFlash(null), 1300);
    hit();
    toast({
      text: `${r.person} の ${caseOf(r.caseNo)?.name ?? '新しい案件'} を「${d}」にしました`,
      sub: d === 'OK' ? '→ 担当営業に知らせました（📮営業へ）' : '→ この案件はこの人の候補から外しました',
      undo: () => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, ...prev } : x))),
    });
  };

  const shown = rows.filter((r) => via === 'すべて' || r.via === via);
  const kpi = [
    { label: live ? '直近7日に送った' : '今週送った', n: rows.length, sub: `グループ直接 ${rows.filter((r) => r.via === 'グループ直接').length}件` },
    { label: '返信待ち', n: rows.filter((r) => !r.reply).length, sub: '要員からの返事がまだ' },
    { label: '未判断', n: rows.filter((r) => r.reply && r.decision === '未判断').length, sub: '返信あり・OK/NG 待ち' },
    { label: 'OK', n: rows.filter((r) => r.decision === 'OK').length, sub: `営業へ ${rows.filter((r) => r.slack).length}件` },
  ];

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="案件進捗" sub="あおい・グループ直接・手動配信で送った案件を1本で。グループに直接書いた案件も回収して載せる" />
      <LiveBanner state={pd.state} error={pd.error} onReload={() => { pd.reload(); pr.reload(); }} note={`直近7日の送信 ${rows.length}件（今の案件進捗と同じ材料）。OK・NG は今の画面で押してください${pr.state === 'error' ? '・返信が読めませんでした' : ''}`} />
      <MikeikenNote mk={mk} live={live} />

      <div className="mo-fade-up grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ ['--i' as string]: 1 }}>
        {kpi.map((k) => (
          <div key={k.label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="text-[12px] text-muted">{k.label}</div>
            <div className="num text-[24px] font-bold">{k.n}<span className="ml-0.5 text-[13px] font-semibold text-muted">件</span></div>
            <div className="text-[11.5px] text-faint">{k.sub}</div>
          </div>
        ))}
      </div>

      <div role="tablist" className="mo-fade-up flex flex-wrap gap-1 border-b border-line" style={{ ['--i' as string]: 2 }}>
        {([['sent', '送った案件'], ['collect', '回収候補']] as [TabKey, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)} className="px-3.5 py-2.5 text-[14px]"
            style={tab === k ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: 'var(--color-muted)' }}>
            {l}{k === 'collect' && !live && cands.length > 0 && <span className="num ml-1.5 rounded-full bg-bad px-1.5 text-[11px] font-bold text-white">{cands.length}</span>}
          </button>
        ))}
        <span className="ml-auto self-center text-[11.5px] text-faint">列・並び・タブを自分で変えるのは、あとで決めます</span>
      </div>

      <div key={tab} className={`mo-axis ${chat ? 'xl:pr-[444px]' : ''}`}>
        {tab === 'sent' ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {(['すべて', 'あおい', 'グループ直接', '手動配信'] as const).map((v) => (
                <button key={v} onClick={() => setVia(v)} className="min-h-9 rounded-full border px-3.5 text-[13px]"
                  style={via === v ? { borderColor: 'var(--a)', background: 'var(--as)', color: 'var(--ad)', fontWeight: 700 } : { borderColor: 'var(--color-field)', background: 'var(--color-surface)' }}>
                  {v} <span className="num">{v === 'すべて' ? rows.length : rows.filter((r) => r.via === v).length}</span>
                </button>
              ))}
            </div>
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-[13px]">
                  <thead><tr className="th-row text-left">
                    <th className="px-4 py-2.5 font-semibold">案件</th><th className="px-2 py-2.5 font-semibold">要員</th><th className="px-2 py-2.5 font-semibold">送った経路</th><th className="px-2 py-2.5 font-semibold">送った日時</th><th className="px-2 py-2.5 font-semibold">返信</th><th className="px-2 py-2.5 font-semibold">判断</th><th className="px-4 py-2.5" />
                  </tr></thead>
                  <tbody>
                    {shown.map((r, i) => {
                      const c = caseOf(r.caseNo);
                      return (
                        <tr key={r.id} className={`mo-fade-in border-t border-line-soft ${rowFlash === r.id ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                          <td className="px-4 py-2.5"><div className="font-semibold">{c?.name ?? (live ? r.caseNo : '新しい案件（登録待ち）')}</div><div className="text-[11.5px] text-faint">{r.caseNo}{c?.price && ` ・ ${c.price}`}</div></td>
                          <td className="px-2 py-2.5"><PersonName name={r.person} /></td>
                          <td className="whitespace-nowrap px-2 py-2.5"><Chip s={VIA_STYLE[r.via]}>{r.via}</Chip>{r.via !== 'あおい' && <span className="ml-1.5 text-[11.5px] text-muted">{r.sender}</span>}</td>
                          <td className="num whitespace-nowrap px-2 py-2.5">{r.sentAt}</td>
                          <td className="max-w-[240px] px-2 py-2.5">{r.reply ? <><span className="line-clamp-1">{r.reply}</span><span className="text-[11.5px] text-faint">{r.replyAt}</span></> : <span className="text-[12px] font-semibold text-bad">返信待ち</span>}</td>
                          <td className="whitespace-nowrap px-2 py-2.5">
                            {r.reply && r.decision === '未判断' ? (
                              <span className="inline-flex gap-1">
                                {(['OK', 'NG'] as const).map((d) => (
                                  <button key={d} onClick={() => decide(r, d)} disabled={!canEdit} title={!canEdit ? noEdit : `返事を見て「${d}」にする`} className="min-h-8 rounded-lg border border-field bg-surface px-2.5 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40" style={d === 'OK' ? { color: 'var(--tone-ok-fg)' } : undefined}>{d}</button>
                                ))}
                              </span>
                            ) : <Chip s={DEC_STYLE[r.decision]}>{r.decision}</Chip>}
                            {r.slack && <span className="ml-1.5 text-[11.5px] text-muted">📮営業へ</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button onClick={() => setChat({ group: r.group, thread: live ? lp.threads[r.id] ?? [] : threadFor(r) })} className="inline-flex min-h-8 items-center whitespace-nowrap gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-semibold" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}><MessageSquareText size={14} />チャット</button>
                          </td>
                        </tr>
                      );
                    })}
                    {shown.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-[13px] text-muted">「{via}」で送った案件はまだありません</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : live ? (
          <NotInLegacy what="グループに直接書いた案件の回収" />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
              <RemainRing remain={cands.length} total={total} />
              <div className="text-[13px]"><b>グループに直接書いた案件の回収</b><div className="text-[12px] text-muted">内勤の発言から案件らしいものを拾い、一番近い案件を当てています。✓で確定したものだけ「送った案件」に載ります。8月6日より前の発言は本文が無いので拾いません。</div></div>
            </div>

            {cands.length === 0 && (
              <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-10 text-center">
                <Check className="mx-auto text-ok" size={26} />
                <div className="mt-2 text-[15px] font-bold">回収候補はぜんぶ片づきました</div>
                <div className="mt-1 text-[12.5px] text-muted">新しくグループに書かれた案件は、ここにまた出ます。</div>
              </div>
            )}

            {cands.map((c, i) => {
              const msg = c.thread.find((m) => m.id === c.msgId)!;
              const no = caseFor(c);
              return (
                <article key={c.id} className={`mo-fade-up rounded-xl border border-line bg-surface ${flash === c.id ? 'mo-flash' : ''}`} style={{ ['--i' as string]: i }}>
                  <div className="flex flex-wrap items-start gap-4 px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted"><PersonName name={c.person} className="text-[13.5px] font-bold text-ink underline-offset-2 hover:underline" /><span>{c.group}</span><span>・{c.poster} が {c.postedAt} に書き込み</span></div>
                      <p className="mt-2 whitespace-pre-line rounded-[10px] bg-soft px-3 py-2 text-[13px] leading-relaxed">{msg.text}</p>
                      {c.hint && <div className="mt-1.5 text-[11.5px] text-faint">拾った理由：{c.hint}</div>}
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-[300px]">
                      <label className="text-[11.5px] text-faint">どの案件か
                        <select aria-label="どの案件か" value={no} onChange={(e) => setPick((p) => ({ ...p, [c.id]: e.target.value }))} className="mt-1 block min-h-9 w-full rounded-[10px] border border-field bg-surface px-2 text-[13px] text-ink">
                          <option value="">新しい案件として登録</option>
                          {CASES.map((x) => <option key={x.no} value={x.no}>{x.no} {x.name}</option>)}
                        </select>
                      </label>
                      <div className="text-[11.5px]">
                        {c.match && !pick[c.id] ? <span style={{ color: scoreTone(c.match.score) }}>本文の近さ <b className="num">{c.match.score}%</b>{c.match.score < 70 && '・案件の紹介かどうか確かめてください'}</span>
                          : !no ? <span className="text-warn">近い案件がありません。確定すると案件ストックに新しく登録します</span>
                          : <span className="text-muted">選び直しました</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft px-4 py-2.5">
                    <button onClick={() => setChat({ group: c.group, thread: c.thread, focus: c.msgId, cand: c })} className="mr-auto inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-semibold" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}><MessageSquareText size={15} />チャットで前後を見る</button>
                    <button onClick={() => settle(c, false)} disabled={!canEdit} title={!canEdit ? noEdit : undefined} className="min-h-9 rounded-[10px] border border-field bg-surface px-3 text-[13px] font-semibold disabled:opacity-40">案件ではない</button>
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
          <aside key={chat.group + (chat.focus ?? '')} aria-label="グループのやりとり" className="mo-drawer fixed bottom-0 right-0 top-[var(--hdr,58px)] z-20 flex w-[min(420px,100vw)] flex-col border-l border-line bg-surface shadow-[-12px_0_28px_rgba(25,27,46,.10)]">
            <div className="flex items-start justify-between px-5 py-4">
              <div><div className="text-[12px] text-faint">LINEグループのやりとり</div><div className="text-[17px] font-bold">{chat.group}</div></div>
              <button aria-label="閉じる" onClick={() => setChat(null)} className="flex size-[34px] items-center justify-center rounded-[10px] border border-line"><X size={16} /></button>
            </div>
            <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto bg-soft px-4 py-4">
              {chat.thread.map((m, i) => {
                const mine = m.who !== 'person';
                const focus = m.id === chat.focus;
                return (
                  <div key={m.id} className={`mo-fade-up flex flex-col ${mine ? 'items-end' : 'items-start'}`} style={{ ['--i' as string]: i }}>
                    <div className="mb-0.5 text-[11px] text-faint">{m.name}・{m.at}</div>
                    <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${focus ? 'mo-scale-in shadow-[0_0_0_3px_var(--al)]' : ''}`}
                      style={mine ? { background: focus ? 'var(--a)' : 'var(--color-surface)', color: focus ? 'var(--ao)' : 'var(--color-ink)', border: '1px solid var(--color-line)' } : { background: 'var(--tone-ok-bg)', color: 'var(--color-ink)' }}>
                      {m.text}
                    </div>
                    {focus && <div className="mt-1 text-[11px] font-semibold" style={{ color: 'var(--ad)' }}>↑ 案件として拾った発言</div>}
                  </div>
                );
              })}
            </div>
            {chat.cand && (
              <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
                <button onClick={() => settle(chat.cand!, false)} disabled={!canEdit} title={!canEdit ? noEdit : undefined} className="min-h-10 rounded-[10px] border border-field bg-surface px-3.5 text-[13.5px] font-semibold disabled:opacity-40">案件ではない</button>
                <PrimaryButton onClick={() => settle(chat.cand!, true)} disabled={!canEdit} title={!canEdit ? noEdit : undefined}>{caseFor(chat.cand) ? '案件進捗に載せる' : '登録して載せる'}</PrimaryButton>
              </div>
            )}
          </aside>
        </DrawerPortal>
      )}
    </main>
  );
}

// 送った案件の行から、そのグループのやりとりを組み立てる（見本）。実データではグループの発言を時刻で引く。
function threadFor(r: ProgressRow): ChatMsg[] {
  const c = caseOf(r.caseNo);
  const out: ChatMsg[] = [{ id: 'x1', at: r.sentAt, who: r.via === 'あおい' ? 'aoi' : 'staff', name: r.via === 'あおい' ? 'あおい' : r.sender, text: `【案件のご案内】${c?.name ?? ''}（${r.caseNo}）\n単価 ${c?.price ?? '—'}` }];
  if (r.reply) out.push({ id: 'x2', at: r.replyAt ?? '', who: 'person', name: r.person, text: r.reply });
  return out;
}
