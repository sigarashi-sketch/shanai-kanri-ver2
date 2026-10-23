'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, MessageSquareText, Plus, X } from 'lucide-react';
import { CANDIDATES, CASES, PROGRESS, caseOf, type Candidate, type ChatMsg, type ProgressRow, type Via } from '@/lib/progress-sample';
import { PageTitle, PrimaryButton } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { DrawerPortal } from '@/components/DrawerPortal';

// 案件進捗（単独の画面・2026-10-23 shoya）。
//   ・送った案件 … あおい／グループ直接／手動配信 のどれで送った分も1本で並べる。返信・OK/NG は経路に関係なく同じ扱い
//   ・回収候補 … 内勤がグループに直接書いた「案件らしい発言」。一番近い案件を当てて、内勤が✓で確定したものだけ載せる
//     どの案件か迷うものは「チャットで前後を見る」でグループのやりとりを確かめてから決める
//   列・並び・タブを自分で変える「カスタム」はあとで決める（10-23 shoya）
const VIA_STYLE: Record<Via, { bg: string; fg: string }> = {
  あおい: { bg: '#EAF2FE', fg: '#134A9C' },
  グループ直接: { bg: '#FFF4E0', fg: '#8A4B00' },
  手動配信: { bg: '#F3EEFE', fg: '#5B21B6' },
};
const DEC_STYLE: Record<string, { bg: string; fg: string }> = {
  OK: { bg: '#E9F7EE', fg: '#116B34' }, NG: { bg: '#F0F1F5', fg: '#5A5E75' }, 未判断: { bg: '#FFE4E9', fg: '#BE123C' },
};
const Chip = ({ s, children }: { s: { bg: string; fg: string }; children: React.ReactNode }) => (
  <span className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={{ background: s.bg, color: s.fg }}>{children}</span>
);
const scoreTone = (n: number) => (n >= 85 ? '#116B34' : n >= 70 ? '#B45309' : '#BE123C');

type TabKey = 'sent' | 'collect';
type ChatOpen = { group: string; thread: ChatMsg[]; focus?: string; cand?: Candidate };

export default function ProgressPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const canEdit = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const [rows, setRows] = useState<ProgressRow[]>(PROGRESS);
  const [cands, setCands] = useState<Candidate[]>(CANDIDATES);
  const [pick, setPick] = useState<Record<string, string>>({}); // 候補ごとに内勤が選び直した案件No
  const [flash, setFlash] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatOpen | null>(null);
  const [via, setVia] = useState<Via | 'すべて'>('すべて');
  const total = CANDIDATES.length;

  const tab: TabKey = sp.get('tab') === 'collect' ? 'collect' : 'sent';
  const go = (k: TabKey) => router.replace(`/eigyo/progress${k === 'sent' ? '' : '?tab=collect'}`, { scroll: false });
  // ?chat=<候補id> で前後のパネルを開いた状態から始める（画面の見本を撮るとき用）
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('chat'); const c = CANDIDATES.find((x) => x.id === id); if (c) setChat({ group: c.group, thread: c.thread, focus: c.msgId, cand: c }); }, []);

  const caseFor = (c: Candidate) => pick[c.id] ?? c.match?.caseNo ?? '';

  const settle = (c: Candidate, asCase: boolean) => {
    const no = caseFor(c);
    setFlash(c.id);
    setChat((o) => (o?.cand?.id === c.id ? null : o));
    setTimeout(() => {
      setFlash(null);
      setCands((xs) => xs.filter((x) => x.id !== c.id));
      const reply = c.thread.find((m) => m.who === 'person' && m.at > c.postedAt);
      const row: ProgressRow = { id: `g-${c.id}`, caseNo: no || '新規', person: c.person, personId: c.personId, group: c.group, via: 'グループ直接', sentAt: c.postedAt, sender: c.poster, reply: reply?.text ?? '', replyAt: reply?.at.slice(-5), decision: '未判断' };
      if (asCase) setRows((rs) => [row, ...rs]);
      hit();
      toast({
        text: asCase ? `${c.person} への ${no ? caseOf(no)?.name : '新しい案件'} を載せました` : '案件ではない、にしました',
        sub: asCase ? '→ 送った案件に「グループ直接」で載り、返信待ちに入りました' : '→ 同じ発言はもう候補に出ません',
        undo: () => { setCands((xs) => (xs.some((x) => x.id === c.id) ? xs : [c, ...xs])); if (asCase) setRows((rs) => rs.filter((r) => r.id !== row.id)); },
      });
    }, 450);
  };

  const shown = rows.filter((r) => via === 'すべて' || r.via === via);
  const kpi = [
    { label: '今週送った', n: rows.length, sub: `グループ直接 ${rows.filter((r) => r.via === 'グループ直接').length}件` },
    { label: '返信待ち', n: rows.filter((r) => !r.reply).length, sub: '24時間を超えたら赤' },
    { label: '未判断', n: rows.filter((r) => r.reply && r.decision === '未判断').length, sub: '返信あり・OK/NG 待ち' },
    { label: 'OK', n: rows.filter((r) => r.decision === 'OK').length, sub: `営業へ ${rows.filter((r) => r.slack).length}件` },
  ];

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="案件進捗" sub="あおい・グループ直接・手動配信で送った案件を1本で。グループに直接書いた案件も回収して載せる" />

      <div className="mo-fade-up grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ ['--i' as string]: 1 }}>
        {kpi.map((k) => (
          <div key={k.label} className="rounded-xl border border-line bg-white px-4 py-3">
            <div className="text-[12px] text-muted">{k.label}</div>
            <div className="num text-[24px] font-bold">{k.n}<span className="ml-0.5 text-[13px] font-semibold text-muted">件</span></div>
            <div className="text-[11.5px] text-faint">{k.sub}</div>
          </div>
        ))}
      </div>

      <div role="tablist" className="mo-fade-up flex gap-1 border-b border-line" style={{ ['--i' as string]: 2 }}>
        {([['sent', '送った案件'], ['collect', '回収候補']] as [TabKey, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)} className="px-3.5 py-2.5 text-[14px]"
            style={tab === k ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: '#5A5E75' }}>
            {l}{k === 'collect' && cands.length > 0 && <span className="num ml-1.5 rounded-full bg-[#E11D48] px-1.5 text-[11px] font-bold text-white">{cands.length}</span>}
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
                  style={via === v ? { borderColor: 'var(--a)', background: 'var(--as)', color: 'var(--ad)', fontWeight: 700 } : { borderColor: '#DCDDE6', background: '#fff' }}>
                  {v} <span className="num">{v === 'すべて' ? rows.length : rows.filter((r) => r.via === v).length}</span>
                </button>
              ))}
            </div>
            <div className="overflow-hidden rounded-xl border border-line bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-[13px]">
                  <thead><tr className="text-left" style={{ background: 'var(--as)', color: 'var(--ad)' }}>
                    <th className="px-4 py-2.5 font-semibold">案件</th><th className="px-2 py-2.5 font-semibold">要員</th><th className="px-2 py-2.5 font-semibold">送った経路</th><th className="px-2 py-2.5 font-semibold">送った日時</th><th className="px-2 py-2.5 font-semibold">返信</th><th className="px-2 py-2.5 font-semibold">判断</th><th className="px-4 py-2.5" />
                  </tr></thead>
                  <tbody>
                    {shown.map((r, i) => {
                      const c = caseOf(r.caseNo);
                      return (
                        <tr key={r.id} className={`mo-fade-in border-t border-line-soft ${r.id.startsWith('g-') ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                          <td className="px-4 py-2.5"><div className="font-semibold">{c?.name ?? '新しい案件（登録待ち）'}</div><div className="text-[11.5px] text-faint">{r.caseNo}{c && ` ・ ${c.price}`}</div></td>
                          <td className="px-2 py-2.5">{r.person}</td>
                          <td className="px-2 py-2.5"><Chip s={VIA_STYLE[r.via]}>{r.via}</Chip>{r.via !== 'あおい' && <span className="ml-1.5 text-[11.5px] text-muted">{r.sender}</span>}</td>
                          <td className="num px-2 py-2.5">{r.sentAt}</td>
                          <td className="max-w-[240px] px-2 py-2.5">{r.reply ? <><span className="line-clamp-1">{r.reply}</span><span className="text-[11.5px] text-faint">{r.replyAt}</span></> : <span className="text-[12px] font-semibold text-[#BE123C]">返信待ち</span>}</td>
                          <td className="px-2 py-2.5"><Chip s={DEC_STYLE[r.decision]}>{r.decision}</Chip>{r.slack && <span className="ml-1.5 text-[11.5px] text-muted">📮営業へ</span>}</td>
                          <td className="px-4 py-2.5 text-right">
                            <button onClick={() => setChat({ group: r.group, thread: threadFor(r) })} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-semibold" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}><MessageSquareText size={14} />チャット</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3">
              <RemainRing remain={cands.length} total={total} />
              <div className="text-[13px]"><b>グループに直接書いた案件の回収</b><div className="text-[12px] text-muted">内勤の発言から案件らしいものを拾い、一番近い案件を当てています。✓で確定したものだけ「送った案件」に載ります。8月6日より前の発言は本文が無いので拾いません。</div></div>
            </div>

            {cands.length === 0 && (
              <div className="mo-scale-in rounded-xl border border-line bg-white px-6 py-10 text-center">
                <Check className="mx-auto text-[#16A34A]" size={26} />
                <div className="mt-2 text-[15px] font-bold">回収候補はぜんぶ片づきました</div>
                <div className="mt-1 text-[12.5px] text-muted">新しくグループに書かれた案件は、ここにまた出ます。</div>
              </div>
            )}

            {cands.map((c, i) => {
              const msg = c.thread.find((m) => m.id === c.msgId)!;
              const no = caseFor(c);
              return (
                <article key={c.id} className={`mo-fade-up rounded-xl border border-line bg-white ${flash === c.id ? 'mo-flash' : ''}`} style={{ ['--i' as string]: i }}>
                  <div className="flex flex-wrap items-start gap-4 px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted"><b className="text-[13.5px] text-ink">{c.person}</b><span>{c.group}</span><span>・{c.poster} が {c.postedAt} に書き込み</span></div>
                      <p className="mt-2 whitespace-pre-line rounded-[10px] bg-[#F6F6FB] px-3 py-2 text-[13px] leading-relaxed">{msg.text}</p>
                      {c.hint && <div className="mt-1.5 text-[11.5px] text-faint">拾った理由：{c.hint}</div>}
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-[300px]">
                      <label className="text-[11.5px] text-faint">どの案件か
                        <select aria-label="どの案件か" value={no} onChange={(e) => setPick((p) => ({ ...p, [c.id]: e.target.value }))} className="mt-1 block min-h-9 w-full rounded-[10px] border border-[#DCDDE6] bg-white px-2 text-[13px] text-ink">
                          <option value="">新しい案件として登録</option>
                          {CASES.map((x) => <option key={x.no} value={x.no}>{x.no} {x.name}</option>)}
                        </select>
                      </label>
                      <div className="text-[11.5px]">
                        {c.match && !pick[c.id] ? <span style={{ color: scoreTone(c.match.score) }}>本文の近さ <b className="num">{c.match.score}%</b>{c.match.score < 70 && '・案件の紹介かどうか確かめてください'}</span>
                          : !no ? <span className="text-[#B45309]">近い案件がありません。確定すると案件ストックに新しく登録します</span>
                          : <span className="text-muted">選び直しました</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft px-4 py-2.5">
                    <button onClick={() => setChat({ group: c.group, thread: c.thread, focus: c.msgId, cand: c })} className="mr-auto inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-semibold" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}><MessageSquareText size={15} />チャットで前後を見る</button>
                    <button onClick={() => settle(c, false)} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} className="min-h-9 rounded-[10px] border border-[#DCDDE6] bg-white px-3 text-[13px] font-semibold disabled:opacity-40">案件ではない</button>
                    <PrimaryButton onClick={() => settle(c, true)} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined}>
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
          <aside key={chat.group + (chat.focus ?? '')} aria-label="グループのやりとり" className="mo-drawer fixed bottom-0 right-0 top-[var(--hdr,58px)] z-20 flex w-[min(420px,100vw)] flex-col border-l border-line bg-white shadow-[-12px_0_28px_rgba(25,27,46,.10)]">
            <div className="flex items-start justify-between px-5 py-4">
              <div><div className="text-[12px] text-faint">LINEグループのやりとり</div><div className="text-[17px] font-bold">{chat.group}</div></div>
              <button aria-label="閉じる" onClick={() => setChat(null)} className="flex size-[34px] items-center justify-center rounded-[10px] border border-line"><X size={16} /></button>
            </div>
            <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto bg-[#F6F6FB] px-4 py-4">
              {chat.thread.map((m, i) => {
                const mine = m.who !== 'person';
                const focus = m.id === chat.focus;
                return (
                  <div key={m.id} className={`mo-fade-up flex flex-col ${mine ? 'items-end' : 'items-start'}`} style={{ ['--i' as string]: i }}>
                    <div className="mb-0.5 text-[11px] text-faint">{m.name}・{m.at}</div>
                    <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${focus ? 'mo-scale-in shadow-[0_0_0_3px_var(--al)]' : ''}`}
                      style={mine ? { background: focus ? 'var(--a)' : '#fff', color: focus ? 'var(--ao)' : '#171717', border: '1px solid #E8E9F0' } : { background: '#E9F7EE', color: '#171717' }}>
                      {m.text}
                    </div>
                    {focus && <div className="mt-1 text-[11px] font-semibold" style={{ color: 'var(--ad)' }}>↑ 案件として拾った発言</div>}
                  </div>
                );
              })}
            </div>
            {chat.cand && (
              <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
                <button onClick={() => settle(chat.cand!, false)} disabled={!canEdit} className="min-h-10 rounded-[10px] border border-[#DCDDE6] bg-white px-3.5 text-[13.5px] font-semibold disabled:opacity-40">案件ではない</button>
                <PrimaryButton onClick={() => settle(chat.cand!, true)} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined}>{caseFor(chat.cand) ? '案件進捗に載せる' : '登録して載せる'}</PrimaryButton>
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
