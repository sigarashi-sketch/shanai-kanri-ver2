'use client';

import { useState } from 'react';
import { LiveBanner, NotInLegacy, useIke } from '@/components/Live';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { postLive } from '@/lib/live/post';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { EVIDENCE_MAX, EVIDENCE_MAX_BYTES, kekkinFromIke, monthLabel, ymOfOffset, type IkeKekkin, type IkeKekkinRow } from '@/lib/live/kekkin';
import Link from 'next/link';
import { AlertTriangle, Check, Paperclip, Trash2, X } from 'lucide-react';
import { ABSENCES, KINDS, REASONS, STEPS, type Absence, type Kind } from '@/lib/kekkin-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { PersonName } from '@/components/Person';

// 欠勤管理（労務/営業管理）＝勤怠の連絡を人ごと・月ごとに並べ、欠勤かどうか・理由・現場への連絡を選ぶだけで残す。
//   ・言葉で欠勤と決めつけない。連絡の本文をそのまま出し「欠勤／遅刻／後日の相談／欠勤ではない」を人が選ぶ
//   ・前夜の「明日休みます」も拾う。連絡なしの日は「連絡なし」として並べる
//   ・その月の欠勤が多い人ほど上に。2回以上は段階の対応と離職リスクへのリンクを出す
const MONTHS = ['10月', '9月'] as const;
const KIND_TONE: Record<Kind, string> = { 未確認: 'caution', 欠勤: 'bad', 遅刻: 'warn', 後日の相談: 'info', 欠勤ではない: 'mute' };
// 人の並びは、はじめの欠勤の回数で固定（選ぶたびに人の枠が上下に動かないように）
const firstCount = (id: string, month: string) => ABSENCES.filter((r) => r.personId === id && r.month === month && r.kind === '欠勤').length;
const todo = (a: Absence) => a.kind === '未確認' || (a.kind === '欠勤' && (!a.siteNotified || a.reason === '未分類'));

export default function KekkinPage() {
  const canEdit = usePerms().can('roumu', 'edit');
  const { hit, toast } = useMotivation();
  const [rows, setRows] = useState<Absence[]>(ABSENCES);
  const [month, setMonth] = useState<(typeof MONTHS)[number]>('10月');
  const [flash, setFlash] = useState<string | null>(null);
  // 本物：今月と先月を今の社内システムの欠勤管理から読む（月のタブは見本と同じ2つ）
  const [back, setBack] = useState(0);
  const ym = ymOfOffset(back);
  const ike = useIke<IkeKekkin>(`roster?op=kekkin&action=list&month=${ym}`);
  const live = ike.live && !!ike.data?.ok;
  const mk = useMikeiken();   // 本物は未経験の人だけ（今のプロパーリストに入っている人）
  const liveRows = live && ike.data ? kekkinFromIke({ ...ike.data, rows: mk.keep(ike.data.rows || [], 'name') }, month) : [];
  const ruleCount = (rs: Absence[]) => rs.filter((r) => r.kind === '欠勤' && !(r as { beforeRule?: boolean }).beforeRule).length;
  const todoOf = (a: Absence) => (live ? a.reason === '未分類' : todo(a));
  const okEdit = canEdit;
  const block = !canEdit ? needText('edit') : undefined;
  // 本物（10-25）：理由・エビデンス・行を消す を今の欠勤管理に書く。行は id（日付|氏名）で今の行を引く
  const rawOf = (id: string): IkeKekkinRow | undefined => (ike.data?.rows || []).find((r) => `${r.date}|${r.nn}` === id);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const liveDo = async (a: Absence, fn: () => Promise<unknown>, text: string, sub: string) => {
    setBusy(a.id); setErr('');
    try { await fn(); setFlash(a.id); setTimeout(() => setFlash(null), 1300); hit(); toast({ text, sub }); ike.reload(); }
    catch (e) { setErr(`${a.name} の ${a.day}：${(e as Error).message}`); }
    finally { setBusy(null); }
  };
  const saveReason = (a: Absence, v: string) => { const r = rawOf(a.id); if (r) liveDo(a, () => postLive('/api/live/kekkin', { action: 'save', date: r.date, name: r.name, reason: v === '未分類' ? '' : v }), `${a.name} の理由を「${v}」にしました`, '→ 今の欠勤管理に残しました'); };
  const attach = (a: Absence, f: File) => {
    const r = rawOf(a.id); if (!r) return;
    if (f.size > EVIDENCE_MAX_BYTES) { setErr(`ファイルは ${EVIDENCE_MAX_BYTES / 1048576}MB までです`); return; }
    if (!/^(image\/|application\/pdf)/.test(f.type) && !/\.(jpe?g|png|gif|webp|heic|pdf)$/i.test(f.name)) { setErr('画像か PDF だけ付けられます'); return; }
    liveDo(a, async () => {
      const u = await postLive<{ path: string; signedUrl: string }>('/api/live/kekkin', { action: 'uploadUrl', filename: f.name, contentType: f.type, size: f.size });
      const put = await fetch(u.signedUrl, { method: 'PUT', body: f, headers: { 'Content-Type': f.type || 'application/octet-stream' } });
      if (!put.ok) throw new Error(`ファイルを上げられませんでした（${put.status}）`);
      await postLive('/api/live/kekkin', { action: 'attach', date: r.date, name: r.name, path: u.path, filename: f.name });
    }, `${a.name} の ${a.day} にエビデンスを付けました`, '→ 今の欠勤管理に残しました（中身は今の欠勤管理の画面で開けます）');
  };
  const detach = (a: Absence, path: string, n: number) => {
    const r = rawOf(a.id); if (!r?.id) return;
    setConfirm({ title: `${a.name} の ${a.day} の添付${n}を外す`, okLabel: '外す', danger: true, lines: ['添付のファイルも消えます（元に戻せません）'],
      run: async () => { await postLive('/api/live/kekkin', { action: 'detach', id: r.id, path }); hit(); toast({ text: `${a.name} の添付を外しました` }); ike.reload(); } });
  };
  const removeRow = (a: Absence) => {
    const r = rawOf(a.id); if (!r?.id) return;
    setConfirm({ title: `${a.name} の ${a.day} の行を消す`, okLabel: '行を消す', danger: true, lines: ['手で追加した欠勤の行を消します', '添付が残っている行は消せません（先に外してください）'],
      run: async () => { await postLive('/api/live/kekkin', { action: 'remove', id: r.id }); hit(); toast({ text: `${a.name} の ${a.day} の行を消しました` }); ike.reload(); } });
  };

  const inMonth = live ? liveRows : rows.filter((r) => r.month === month);
  const people = [...new Set(inMonth.map((r) => r.personId))].map((id) => {
    const rs = inMonth.filter((r) => r.personId === id);
    return { id, name: rs[0].name, site: rs[0].site, sales: rs[0].sales, rs, count: live ? ruleCount(rs) : rs.filter((r) => r.kind === '欠勤').length };
  }).sort((a, b) => (live ? b.count - a.count : firstCount(b.id, month) - firstCount(a.id, month)) || b.rs.length - a.rs.length || a.name.localeCompare(b.name, 'ja'));
  const open = inMonth.filter(todoOf);
  const initialOpen = live ? open.length : ABSENCES.filter((r) => r.month === month && todo(r)).length;

  const change = (a: Absence, patch: Partial<Absence>, text: string, sub: string) => {
    // 取り消しはこの行の変えた所だけ元の値に戻す（続けて変えた別の行は戻さない）
    const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, a[k as keyof Absence]])) as Partial<Absence>;
    setRows((rs) => rs.map((r) => (r.id === a.id ? { ...r, ...patch } : r)));
    setFlash(a.id); setTimeout(() => setFlash(null), 1300);
    hit();
    toast({ text, sub, undo: () => setRows((rs) => rs.map((r) => (r.id === a.id ? { ...r, ...prev } : r))) });
  };
  const sel = 'min-h-8 rounded-lg border border-field bg-surface px-1.5 text-[12px] disabled:opacity-40';

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="欠勤管理" sub={live ? `${monthLabel(ym)}の欠勤（LINE の欠勤連絡＋手で足した行・1人1日1行）。回数は ${ike.data?.ruleStart?.slice(5).replace('-', '/')} から数えます` : '勤怠の連絡（グループLINE・公式LINE・電話）を本文のまま並べています。欠勤かどうかは読んで選んでください・見本データ'}>
        <div className="flex rounded-[10px] border border-field bg-surface p-0.5 text-[12.5px] font-semibold">
          {MONTHS.map((m, mi) => <button key={m} onClick={() => { setMonth(m); setBack(mi); }} className={`min-h-8 rounded-lg px-3 ${month === m ? 'text-white' : 'text-muted'}`} style={month === m ? { background: 'var(--a)' } : undefined}>{ike.live ? monthLabel(ymOfOffset(mi)) : m}</button>)}
        </div>
      </PageTitle>
      <LiveBanner state={ike.live && !ike.data?.ok ? 'error' : ike.state} error={ike.error || ike.data?.error} onReload={ike.reload}
        note={`理由・エビデンスは本物の欠勤管理に書きます。ファイルの中身（診断書など）はここでは開きません。${ike.data?.unresolved ? `氏名が引けなかった連絡 ${ike.data.unresolved}件は載っていません。` : ''}`} />
      <MikeikenNote mk={mk} live={live} />
      {live && <NotInLegacy what="連絡の本文・遅刻や後日の相談の見分け・現場に連絡済みの印" />}
      {err && <div className="rounded-xl px-4 py-2.5 text-[12.5px]" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>{err}</div>}

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={open.length} total={Math.max(initialOpen, open.length, 1)} />
        <div className="text-[13px]"><b>{live ? '理由が未分類の欠勤' : '確かめる連絡'} 残り {open.length}件</b>
          {!live && <span className="ml-2 text-muted">未確認 {open.filter((r) => r.kind === '未確認').length}・現場にまだ伝えていない {inMonth.filter((r) => r.kind === '欠勤' && !r.siteNotified).length}・理由が未分類 {inMonth.filter((r) => r.kind === '欠勤' && r.reason === '未分類').length}</span>}
          {!canEdit && <div className="text-[12px] text-bad">{needText('edit')}</div>}
        </div>
        <Link href="/jinji/rishoku" className="ml-auto text-[12px] font-semibold" style={{ color: 'var(--ad)' }}>離職リスクへ</Link>
      </div>

      {open.length === 0 && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-8 text-center">
          <Check className="mx-auto text-ok" size={26} />
          <div className="mt-2 text-[15px] font-bold">{live ? `${monthLabel(ym)}の欠勤は、ぜんぶ理由が入っています` : `${month}の連絡はぜんぶ確かめました`}</div>
          <div className="mt-1 text-[12.5px] text-muted">新しい連絡は翌朝ここに並びます。</div>
        </div>
      )}

      {people.map((p, pi) => (
        <section key={p.id} className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: pi + 2 }}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5">
            <PersonName name={p.name} className="text-[14px] font-bold underline-offset-2 hover:underline" />
            <span className="text-[12px] text-faint">{live ? `採用担当 ${p.sales}` : `${p.site}・担当 ${p.sales}`}</span>
            <span className="chip" style={{ background: p.count >= 2 ? 'var(--tone-bad-bg)' : 'var(--tone-mute-bg)', color: p.count >= 2 ? 'var(--tone-bad-fg)' : 'var(--tone-mute-fg)' }}>{live ? monthLabel(ym) : month}の欠勤 {p.count}回</span>
            {p.count >= 1 && <span className="text-[12px] text-muted">対応の目安：{STEPS[Math.min(p.count, 4)]}</span>}
            {p.count >= 2 && !live && <Link href={`/jinji/rishoku?id=${p.id}`} className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-bad"><AlertTriangle size={13} />欠勤が続いています・離職リスクを見る</Link>}
          </div>
          <ul>
            {p.rs.map((a) => (
              <li key={a.id} className={`grid gap-2 border-t border-line-soft px-4 py-2.5 first:border-t-0 md:grid-cols-[130px_1fr] xl:grid-cols-[150px_1fr_auto] ${flash === a.id ? 'mo-flash' : ''}`}>
                <div className="text-[12.5px]"><div className="num font-semibold">{a.day}</div><div className="text-[11.5px] text-faint">{a.route}{a.at !== '—' && `・${a.at}`}</div></div>
                <div className="rounded-[10px] bg-soft px-3 py-2 text-[12.5px]">{a.text}{live && (a as { evidence?: number }).evidence ? <span className="ml-2 text-[11.5px] text-faint">添付 {(a as { evidence?: number }).evidence}件</span> : null}{live && (a as { beforeRule?: boolean }).beforeRule && <span className="ml-2 text-[11.5px] text-faint">（数え始める前の日）</span>}</div>
                <div className="flex flex-wrap items-center gap-1.5 md:col-start-2 xl:col-start-auto">
                  {!live && <select aria-label="この連絡は" value={a.kind} disabled={!okEdit} title={block} className={sel}
                    style={{ background: `var(--tone-${KIND_TONE[a.kind]}-bg)`, color: `var(--tone-${KIND_TONE[a.kind]}-fg)` }}
                    onChange={(e) => change(a, { kind: e.target.value as Kind }, `${a.name} の ${a.day} を「${e.target.value}」にしました`, e.target.value === '欠勤' ? '→ 名簿の欠勤の回数と、離職リスクの材料に反映しました' : '→ 欠勤の回数には数えません')}>
                    {KINDS.map((k) => <option key={k}>{k}</option>)}
                  </select>}
                  {a.kind === '欠勤' && <>
                    <select aria-label="理由" value={a.reason} disabled={!okEdit || busy === a.id} title={block} className={sel} onChange={(e) => live ? saveReason(a, e.target.value) : change(a, { reason: e.target.value }, `${a.name} の理由を「${e.target.value}」にしました`, '→ 欠勤の記録に反映しました')}>
                      {(live ? [...new Set(['未分類', ...(ike.data?.reasons || []), a.reason])] : REASONS).map((x) => <option key={x}>{x}</option>)}
                    </select>
                    {!live && <label title={!canEdit ? needText('edit') : undefined} className={`inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg border px-2 text-[12px] ${a.siteNotified ? 'border-line text-ok' : 'border-field text-bad'}`}>
                      <input type="checkbox" checked={a.siteNotified} disabled={!canEdit} onChange={(e) => change(a, { siteNotified: e.target.checked }, e.target.checked ? `${a.name} の欠勤を現場に伝えた印を付けました` : '現場に伝えた印を外しました', e.target.checked ? '→ 担当営業の「要対応」から外れました' : '→ 担当営業の「要対応」に戻しました')} />現場に連絡済み
                    </label>}
                    {live && (() => {
                      const r = rawOf(a.id);
                      if (!r) return null;
                      return <>
                        {r.evidence.map((ev, ei) => (
                          <span key={ev.path} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line px-2 text-[11.5px] text-muted">
                            <Paperclip size={12} />添付{ei + 1}（{/\.pdf$/i.test(ev.path) ? 'PDF' : '画像'}・{Math.max(1, Math.round(ev.size / 1024))}KB）
                            <button aria-label={`添付${ei + 1}を外す`} disabled={!okEdit || busy === a.id} title={block} onClick={() => detach(a, ev.path, ei + 1)} className="disabled:opacity-40"><X size={12} /></button>
                          </span>
                        ))}
                        {r.evidence.length < EVIDENCE_MAX && (
                          <label title={block} className={`inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg border border-field px-2 text-[12px] font-semibold ${!okEdit || busy === a.id ? 'pointer-events-none opacity-40' : ''}`}>
                            <Paperclip size={12} />{busy === a.id ? '書いています…' : 'エビデンスを付ける'}
                            <input type="file" accept="image/*,application/pdf" hidden disabled={!okEdit || busy === a.id} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) attach(a, f); }} />
                          </label>
                        )}
                        {r.manual && r.id && !r.evidence.length && <button onClick={() => removeRow(a)} disabled={!okEdit} title={block} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-field px-2 text-[12px] text-bad disabled:opacity-40"><Trash2 size={12} />行を消す</button>}
                      </>;
                    })()}
                  </>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
      <p className="text-[11.5px] text-faint">回数の数え方と段階の対応は今のシステムの決まり（10/5 から数える・診断書のある日は数えない）に合わせています。④は目安で、処分は人が決めます。欠勤控除・懲戒など最終判断は社労士・法務に確認してください。</p>
    </main>
  );
}
