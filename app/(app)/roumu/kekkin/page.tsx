'use client';

import { useState } from 'react';
import { LiveBanner, useIke } from '@/components/Live';
import { CONTACT_KIND_LABEL, setMark, useMarks, type IkeContacts } from '@/lib/live/roumu';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { postLive } from '@/lib/live/post';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { EVIDENCE_MAX, EVIDENCE_MAX_BYTES, kekkinDay, kekkinFromIke, monthLabel, ymOfOffset, type IkeKekkin, type IkeKekkinRow } from '@/lib/live/kekkin';
import Link from 'next/link';
import { Check, Paperclip, Trash2, X } from 'lucide-react';
import { KINDS, STEPS, type Absence, type Kind } from '@/lib/types/roumu';
import { PageTitle, SkeletonRows } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { PersonName } from '@/components/Person';

// 欠勤管理（労務/営業管理）＝勤怠の連絡を人ごと・月ごとに並べ、欠勤かどうか・理由・現場への連絡を選ぶだけで残す。
//   ・言葉で欠勤と決めつけない。連絡の本文をそのまま出し「欠勤／遅刻／後日の相談／欠勤ではない」を人が選ぶ
//   ・前夜の「明日休みます」も拾う。連絡なしの日は「連絡なし」として並べる
//   ・その月の欠勤が多い人ほど上に。2回以上は段階の対応と離職リスクへのリンクを出す
const MONTHS = [0, 1] as const;   // 今月・先月
const KIND_TONE: Record<Kind, string> = { 未確認: 'caution', 欠勤: 'bad', 遅刻: 'warn', 後日の相談: 'info', 欠勤ではない: 'mute' };

export default function KekkinPage() {
  const canEdit = usePerms().can('roumu', 'edit');
  const { hit, toast } = useMotivation();
  const [flash, setFlash] = useState<string | null>(null);
  // 今月と先月を今の社内システムの欠勤管理から読む
  const [back, setBack] = useState(0);
  const ym = ymOfOffset(back);
  const month = monthLabel(ym);
  const ike = useIke<IkeKekkin>(`roster?op=kekkin&action=list&month=${ym}`);
  const live = ike.live && !!ike.data?.ok;
  const mk = useMikeiken();   // 本物は未経験の人だけ（今のプロパーリストに入っている人）
  // 本物（10-26）：勤怠連絡の本文と見分け（kintai_contacts）・見分けの直し／現場に連絡済み の印（roumu_marks）を重ねる
  const cq = useIke<IkeContacts>(live ? `roster?op=roumu&action=contacts&month=${ym}` : null);
  const km = useMarks(['kekkin-site', 'contact-kind'], ym, live);
  const contactsBy = new Map<string, NonNullable<IkeContacts['rows']>>();
  for (const c of cq.data?.ok ? mk.keep(cq.data.rows, 'name') : []) { const k = `${c.date}|${c.nn}`; contactsBy.set(k, [...(contactsBy.get(k) || []), c]); }
  const ctext = (k: string) => (contactsBy.get(k) || []).map((c) => `${c.at ? new Date(c.at).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }) + ' ' : ''}${c.text}`).join('\n');
  const base = live && ike.data ? kekkinFromIke({ ...ike.data, rows: mk.keep(ike.data.rows || [], 'name') }, month) : [];
  const have = new Set(base.map((a) => a.id));
  const extra = [...contactsBy.entries()].filter(([k, cs]) => !have.has(k) && cs.some((c) => c.kind !== 'absent')).map(([k, cs]) => {
    const c = cs[0];
    const kind = CONTACT_KIND_LABEL[(cs.find((x) => x.kind !== 'unknown') || c).kind] as Kind;
    return { id: k, personId: c.nn, name: c.name, site: '勤怠連絡から', sales: c.tantou || '未設定', month: month as Absence['month'], day: kekkinDay(c.date), at: '—', route: (c.source === '1:1' ? '公式LINE（1:1）' : 'グループLINE') as Absence['route'], text: '', kind, reason: '未分類', siteNotified: false, evidence: 0, beforeRule: !!ike.data?.ruleStart && c.date < ike.data.ruleStart } as Absence & { evidence: number; beforeRule: boolean };
  });
  const liveRows = [...base, ...extra].map((a) => {
    const t = ctext(a.id);
    const over = km.get('contact-kind', a.id)?.value as Kind | undefined;
    return { ...a, text: t || a.text, kind: over || a.kind, siteNotified: !!km.get('kekkin-site', a.id) };
  }).sort((a, b) => (a.id < b.id ? 1 : -1));
  const ruleCount = (rs: Absence[]) => rs.filter((r) => r.kind === '欠勤' && !(r as { beforeRule?: boolean }).beforeRule).length;
  const todoOf = (a: Absence) => (a.kind === '欠勤' && (a.reason === '未分類' || !a.siteNotified)) || a.kind === '未確認';
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
  const saveReason = (a: Absence, v: string) => { const r = rawOf(a.id); const date = r?.date || a.id.split('|')[0]; const name = r?.name || a.name; liveDo(a, () => postLive('/api/live/kekkin', { action: 'save', date, name, reason: v === '未分類' ? '' : v }), `${a.name} の理由を「${v}」にしました`, '→ 今の欠勤管理に残しました'); };
  // 見分けの直し（欠勤／遅刻／後日の相談／欠勤ではない）と、現場に連絡済みの印。今の欠勤の回数（今の決まり）は理由の入った欠勤の行で数える
  const saveKind = (a: Absence, v: string) => liveDo(a, async () => { await setMark('contact-kind', a.id, v, { nn: a.personId, ym }); km.reload(); }, `${a.name} の ${a.day} を「${v}」にしました`, v === '欠勤' ? '→ 欠勤なら理由を選んでください（理由を入れると今の欠勤管理の行になります）' : '→ 見分けを残しました');
  const saveSite = (a: Absence, on: boolean) => liveDo(a, async () => { await setMark('kekkin-site', a.id, on ? '連絡済み' : '', { nn: a.personId, ym }); km.reload(); }, on ? `${a.name} の欠勤を現場に伝えた印を付けました` : '現場に伝えた印を外しました', '→ 今の社内システムに残しました');
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

  const inMonth = live ? liveRows : [];
  const people = [...new Set(inMonth.map((r) => r.personId))].map((id) => {
    const rs = inMonth.filter((r) => r.personId === id);
    return { id, name: rs[0].name, site: rs[0].site, sales: rs[0].sales, rs, count: ruleCount(rs) };
  }).sort((a, b) => b.count - a.count || b.rs.length - a.rs.length || a.name.localeCompare(b.name, 'ja'));
  const open = inMonth.filter(todoOf);
  const initialOpen = open.length;
  const sel = 'min-h-8 rounded-lg border border-field bg-surface px-1.5 text-sm disabled:opacity-40';

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="欠勤管理" sub={live ? `${monthLabel(ym)}の欠勤（LINE の欠勤連絡＋手で足した行・1人1日1行）。回数は ${ike.data?.ruleStart?.slice(5).replace('-', '/')} から数えます` : `${monthLabel(ym)}の欠勤（LINE の欠勤連絡＋手で足した行・1人1日1行）`}>
        <div className="flex rounded-[10px] border border-field bg-surface p-0.5 text-sm font-semibold">
          {MONTHS.map((mi) => <button key={mi} onClick={() => setBack(mi)} className={`min-h-8 rounded-lg px-3 ${back === mi ? 'text-white' : 'text-muted'}`} style={back === mi ? { background: 'var(--a)', color: 'var(--ao)' } : undefined}>{monthLabel(ymOfOffset(mi))}</button>)}
        </div>
      </PageTitle>
      <LiveBanner state={ike.live && !ike.data?.ok ? 'error' : ike.state} error={ike.error || ike.data?.error} onReload={ike.reload}
        note={`理由・エビデンスは本物の欠勤管理に書きます。ファイルの中身（診断書など）はここでは開きません。${ike.data?.unresolved ? `氏名が引けなかった連絡 ${ike.data.unresolved}件は載っていません。` : ''}`} />
      <MikeikenNote mk={mk} live={live} />
      {live && cq.state === 'error' && <div className="text-sm text-muted">勤怠連絡の本文は読めませんでした（{cq.error}）</div>}
      {err && <div className="rounded-xl px-4 py-2.5 text-sm" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>{err}</div>}
      {ike.state === 'loading' ? <div className="rounded-xl border border-line bg-surface"><SkeletonRows /></div> : <>

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={open.length} total={Math.max(initialOpen, open.length, 1)} />
        <div className="text-body"><b>確かめる連絡 残り {open.length}件</b>
          {<span className="ml-2 text-muted">未確認 {open.filter((r) => r.kind === '未確認').length}・現場にまだ伝えていない {inMonth.filter((r) => r.kind === '欠勤' && !r.siteNotified).length}・理由が未分類 {inMonth.filter((r) => r.kind === '欠勤' && r.reason === '未分類').length}</span>}
          {!canEdit && <div className="text-sm text-bad">{needText('edit')}</div>}
        </div>
        <Link href="/jinji/rishoku" className="ml-auto text-sm font-semibold" style={{ color: 'var(--ad)' }}>離職リスクへ</Link>
      </div>

      {live && open.length === 0 && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-8 text-center">
          <Check className="mx-auto text-ok" size={26} />
          <div className="mt-2 text-md font-bold">{`${monthLabel(ym)}の欠勤は、ぜんぶ理由が入っています`}</div>
          <div className="mt-1 text-sm text-muted">新しい連絡は翌朝ここに並びます。</div>
        </div>
      )}

      {people.map((p, pi) => (
        <section key={p.id} className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: pi + 2 }}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5">
            <PersonName name={p.name} className="text-body font-bold underline-offset-2 hover:underline" />
            <span className="text-sm text-faint">{`採用担当 ${p.sales}`}</span>
            <span className="chip" style={{ background: p.count >= 2 ? 'var(--tone-bad-bg)' : 'var(--tone-mute-bg)', color: p.count >= 2 ? 'var(--tone-bad-fg)' : 'var(--tone-mute-fg)' }}>{monthLabel(ym)}の欠勤 {p.count}回</span>
            {p.count >= 1 && <span className="text-sm text-muted">対応の目安：{STEPS[Math.min(p.count, 4)]}</span>}
          </div>
          <ul>
            {p.rs.map((a) => (
              <li key={a.id} className={`grid gap-2 border-t border-line-soft px-4 py-2.5 first:border-t-0 md:grid-cols-[130px_1fr] xl:grid-cols-[150px_1fr_auto] ${flash === a.id ? 'mo-flash' : ''}`}>
                <div className="text-sm"><div className="num font-semibold">{a.day}</div><div className="text-xs text-faint">{a.route}{a.at !== '—' && `・${a.at}`}</div></div>
                <div className="whitespace-pre-line rounded-[10px] bg-soft px-3 py-2 text-sm">{a.text}{live && (a as { evidence?: number }).evidence ? <span className="ml-2 text-xs text-faint">添付 {(a as { evidence?: number }).evidence}件</span> : null}{live && (a as { beforeRule?: boolean }).beforeRule && <span className="ml-2 text-xs text-faint">（数え始める前の日）</span>}</div>
                <div className="flex flex-wrap items-center gap-1.5 md:col-start-2 xl:col-start-auto">
                  {<select aria-label="この連絡は" value={a.kind} disabled={!okEdit || busy === a.id} title={block} className={sel}
                    style={{ background: `var(--tone-${KIND_TONE[a.kind]}-bg)`, color: `var(--tone-${KIND_TONE[a.kind]}-fg)` }}
                    onChange={(e) => saveKind(a, e.target.value)}>
                    {KINDS.map((k) => <option key={k}>{k}</option>)}
                  </select>}
                  {a.kind === '欠勤' && <>
                    <select aria-label="理由" value={a.reason} disabled={!okEdit || busy === a.id} title={block} className={sel} onChange={(e) => saveReason(a, e.target.value)}>
                      {[...new Set(['未分類', ...(ike.data?.reasons || []), a.reason])].map((x) => <option key={x}>{x}</option>)}
                    </select>
                    {<label title={!canEdit ? needText('edit') : undefined} className={`inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg border px-2 text-sm ${a.siteNotified ? 'border-line text-ok' : 'border-field text-bad'}`}>
                      <input type="checkbox" checked={a.siteNotified} disabled={!canEdit || busy === a.id} onChange={(e) => saveSite(a, e.target.checked)} />現場に連絡済み
                    </label>}
                    {live && (() => {
                      const r = rawOf(a.id);
                      if (!r) return null;
                      return <>
                        {r.evidence.map((ev, ei) => (
                          <span key={ev.path} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line px-2 text-xs text-muted">
                            <Paperclip size={12} />添付{ei + 1}（{/\.pdf$/i.test(ev.path) ? 'PDF' : '画像'}・{Math.max(1, Math.round(ev.size / 1024))}KB）
                            <button aria-label={`添付${ei + 1}を外す`} disabled={!okEdit || busy === a.id} title={block} onClick={() => detach(a, ev.path, ei + 1)} className="disabled:opacity-40"><X size={12} /></button>
                          </span>
                        ))}
                        {r.evidence.length < EVIDENCE_MAX && (
                          <label title={block} className={`inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg border border-field px-2 text-sm font-semibold ${!okEdit || busy === a.id ? 'pointer-events-none opacity-40' : ''}`}>
                            <Paperclip size={12} />{busy === a.id ? '書いています…' : 'エビデンスを付ける'}
                            <input type="file" accept="image/*,application/pdf" hidden disabled={!okEdit || busy === a.id} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) attach(a, f); }} />
                          </label>
                        )}
                        {r.manual && r.id && !r.evidence.length && <button onClick={() => removeRow(a)} disabled={!okEdit} title={block} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-field px-2 text-sm text-bad disabled:opacity-40"><Trash2 size={12} />行を消す</button>}
                      </>;
                    })()}
                  </>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      </>}
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
      <p className="text-xs text-faint">連絡の見分け（欠勤・遅刻・後日の相談）は AI の下書きです。読んで直してください。回数の数え方と段階の対応は今のシステムの決まり（10/5 から数える・診断書のある日は数えない）に合わせています。④は目安で、処分は人が決めます。欠勤控除・懲戒など最終判断は社労士・法務に確認してください。</p>
    </main>
  );
}
