'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, RefreshCw, TriangleAlert, Undo2, X } from 'lucide-react';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { LiveBanner, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { PersonName } from '@/components/Person';
import { postLive } from '@/lib/live/post-live';
import { sampleAvail, type AvailCand, type AvailResp } from '@/lib/mendan-sample';

// 面談可能日の承認（営業）＝今の /availability.html を写したもの。
//   ・LINE の返信に書かれた面談可能日は、届いた時点で自動で営業リストに入る（自動のしるし）。ここは確かめる・直す・取り消す画面
//   ・自動で入らなかった候補は、中身を直して「承認して反映」。表示中をまとめて承認もできる（確かめてから）
//   ・反映先は営業リスト（プロパー）の要員の「面談可能日」。メモ・前職は書き換えない
//   本物（ログイン中）：読む＝今の /api/availability?action=candidates、書く＝/api/live/availability（approve / clear）
const RANGES = [14, 21, 45, 90] as const;
const fmt = (ms: number) => { if (!ms) return ''; const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export default function AvailabilityPage() {
  const canEdit = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const [days, setDays] = useState<number>(21);
  const av = useIke<AvailResp>(`availability?action=candidates&days=${days}`);
  const live = av.live;
  const mk = useMikeiken();
  const [sample, setSample] = useState<AvailResp | null>(null);
  useEffect(() => { if (av.state === 'sample' && !sample) setSample(sampleAvail(Date.now())); }, [av.state, sample]);
  const data = live ? av.data : sample;
  const cands = useMemo(() => (live ? mk.keep(data?.candidates ?? [], 'name') : data?.candidates ?? []), [live, mk, data]);
  const [showSame, setShowSame] = useState(false);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [ask, setAsk] = useState<{ kind: 'all' } | { kind: 'clear'; c: AvailCand } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => { setBodies({}); }, [av.data]);

  const visible = cands.filter((c) => showSame || c.status !== 'same');
  const pending = cands.filter((c) => c.status !== 'same').length;
  const bodyOf = (c: AvailCand) => bodies[c.normalizedName] ?? c.body;
  const payload = (c: AvailCand) => ({ normalizedName: c.normalizedName, name: c.name, displayName: c.displayName, groupId: c.groupId, groupName: c.groupName, body: bodyOf(c), srcTsMs: c.srcTsMs });
  const markSample = (names: string[], cleared = false) => setSample((s) => s && ({ ...s, candidates: s.candidates.map((c) => (names.includes(c.normalizedName) ? { ...c, status: 'same', currentBody: cleared ? '' : bodyOf(c), savedBy: cleared ? '' : 'me' } : c)) }));

  const approve = async (list: AvailCand[]) => {
    const items = list.map(payload).filter((p) => p.body.trim());
    if (!items.length) { setErr('反映する内容が空です'); return; }
    setErr(''); setBusy(list.length === 1 ? list[0].normalizedName : '__all');
    if (live) {
      const r = await postLive<{ applied?: number }>('/api/live/availability', { op: 'approve', items });
      setBusy(null);
      if (!r.ok) { setErr(`反映できませんでした：${r.error}`); return; }
      av.reload();
    } else { setBusy(null); markSample(items.map((i) => i.normalizedName)); }
    hit(items.length);
    if (items.length === 1) setFlash(items[0].normalizedName);
    toast({ text: items.length === 1 ? `${items[0].name}さんの面談可能日を反映しました` : `${items.length}人の面談可能日を反映しました`, sub: `→ 営業リスト（プロパー）の要員の「面談可能日」${live ? '' : '（見本なので保存していません）'}` });
  };
  const clear = async (c: AvailCand) => {
    setErr(''); setBusy(c.normalizedName);
    if (live) {
      const r = await postLive('/api/live/availability', { op: 'clear', normalizedName: c.normalizedName, confirmed: true });
      setBusy(null);
      if (!r.ok) { setErr(`取り消せませんでした：${r.error}`); return; }
      av.reload();
    } else { setBusy(null); markSample([c.normalizedName], true); }
    hit();
    toast({ text: `${c.name}さんの面談可能日を営業リストから消しました`, sub: live ? undefined : '見本なので保存していません' });
  };

  return (
    <main className="flex flex-col gap-3.5 px-4 pb-12 pt-[22px] sm:px-6">
      <PageTitle title="面談可能日の承認" sub={`LINE の返信にある面談可能日を、営業リストに反映する前に確かめます${live ? '' : '・見本データ'}`} />
      <LiveBanner state={av.state} error={av.error} onReload={av.reload} note="今の返信から拾った候補です。承認すると営業リストの「面談可能日」に入ります" />
      <MikeikenNote mk={mk} live={live} />
      <div className="rounded-xl border border-line bg-soft px-4 py-2.5 text-sm leading-relaxed text-muted">
        返信に含まれる面談可能日は、届いた時点で<b>自動で反映</b>されます（「自動」のしるし）。ここは<b>確認・修正・取り消し</b>用です。メモ・前職は書き換えません。日程を聞く文面は「連絡」の配信から。
      </div>
      {live && data && !data.tableReady && <div className="rounded-xl border px-4 py-2.5 text-sm" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)', borderColor: 'var(--color-warn)' }}>{data.hint}（承認は保存できません・見るだけ）</div>}
      {err && <div role="alert" className="mo-shake flex items-start gap-2 rounded-xl border px-4 py-2.5 text-sm" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)', borderColor: 'var(--tone-bad-bar)' }}><TriangleAlert size={14} className="mt-0.5" /><span className="flex-1">{err}</span><button onClick={() => setErr('')} aria-label="閉じる"><X size={14} /></button></div>}

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={pending} total={cands.length} />
        <div className="text-body"><b>承認待ち {pending}人</b>
          <span className="ml-2 text-muted">新規 {cands.filter((c) => c.status === 'new').length}・更新 {cands.filter((c) => c.status === 'updated').length}・変更なし {cands.filter((c) => c.status === 'same').length}{data ? `（返信 ${data.scannedReplies}件を見ました）` : ''}</span>
          {!canEdit && <div className="text-sm text-bad">{needText('edit')}</div>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="期間" className="min-h-9 rounded-[10px] border border-field bg-surface px-2.5 text-body">
            {RANGES.map((d) => <option key={d} value={d}>直近{d}日の返信</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-muted"><input type="checkbox" checked={showSame} onChange={(e) => setShowSame(e.target.checked)} />変更なしも出す</label>
          {live && <button onClick={av.reload} className="inline-flex items-center gap-1 text-sm text-muted"><RefreshCw size={12} />読み直す</button>}
          <button onClick={() => setAsk({ kind: 'all' })} disabled={!canEdit || !visible.length || !!busy || (live && data?.tableReady === false)} title={!canEdit ? needText('edit') : undefined}
            className="btn-primary"><Check size={14} />表示中をすべて承認</button>
        </div>
      </div>

      {ask && (
        <div role="alertdialog" className="mo-scale-in flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3" style={{ borderColor: 'var(--a)', background: 'var(--al)' }}>
          <span className="text-body font-semibold">{ask.kind === 'all' ? `表示中の ${visible.filter((c) => bodyOf(c).trim()).length}人の面談可能日を営業リストに反映します。よろしいですか？` : `${ask.c.name}さんの面談可能日を営業リストから消します。よろしいですか？`}</span>
          <button onClick={() => { const a = ask; setAsk(null); if (a.kind === 'all') void approve(visible); else void clear(a.c); }} className="btn-primary ml-auto">{ask.kind === 'all' ? '反映する' : '消す'}</button>
          <button onClick={() => setAsk(null)} className="btn-secondary">やめる</button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-8 text-center">
          {av.state === 'loading' || (live && mk.state === 'loading') ? <div className="text-body text-muted">読み込み中…</div> : <>
            <Check className="mx-auto text-ok" size={24} /><div className="mt-1.5 text-md font-bold">承認待ちの候補はありません</div>
            <div className="mt-1 text-sm text-muted">日程を含む返信は届いた時点で自動で反映されます（「変更なしも出す」で自動の分を見られます）。</div>
          </>}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map((c, i) => (
            <article key={c.normalizedName} className={`mo-fade-up rounded-xl border border-line bg-surface px-4 py-3 ${flash === c.normalizedName ? 'mo-flash' : ''}`} style={{ ['--i' as string]: Math.min(i, 10) }}>
              <div className="flex flex-wrap items-center gap-2">
                <PersonName name={c.name} className="text-md font-bold underline-offset-2 hover:underline" />
                {c.status === 'new' ? <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>新規</span>
                  : c.status === 'updated' ? <span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>更新</span>
                    : c.savedBy === 'auto' ? <span className="chip" style={{ background: 'var(--tone-info-bg)', color: 'var(--tone-info-fg)' }}>自動で反映済み</span>
                      : <span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>変更なし</span>}
                <span className="text-xs text-faint">{c.groupName}・最新の返信 {fmt(c.srcTsMs)}</span>
              </div>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <div><div className="mb-1 text-xs font-semibold text-muted">いま（営業リスト）</div>
                  <div className="min-h-[92px] whitespace-pre-wrap rounded-[10px] border border-line-soft bg-soft px-3 py-2 text-sm text-muted">{c.currentBody || '（まだ入っていません）'}</div></div>
                <div><div className="mb-1 text-xs font-semibold text-muted">反映する中身（直せます）</div>
                  <textarea value={bodyOf(c)} onChange={(e) => setBodies((s) => ({ ...s, [c.normalizedName]: e.target.value }))} disabled={!canEdit} rows={4}
                    className="min-h-[92px] w-full rounded-[10px] border border-field bg-surface px-3 py-2 text-body" /></div>
              </div>
              <details className="mt-2 text-sm text-muted"><summary className="inline-flex cursor-pointer items-center gap-1"><ChevronDown size={12} />元の返信を見る</summary>
                <pre className="mt-1.5 whitespace-pre-wrap rounded-[10px] bg-soft px-3 py-2 font-sans text-sm">{c.rawText}</pre></details>
              <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
                {c.currentBody && <button onClick={() => setAsk({ kind: 'clear', c })} disabled={!canEdit || !!busy} title={!canEdit ? needText('edit') : undefined}
                  className="inline-flex min-h-9 items-center gap-1 rounded-[10px] border px-3 text-sm font-semibold disabled:opacity-40" style={{ color: 'var(--color-bad)', borderColor: 'var(--color-bad-line, var(--color-line))' }}><Undo2 size={13} />反映を取り消す</button>}
                <button onClick={() => void approve([c])} disabled={!canEdit || !!busy || !bodyOf(c).trim() || (live && data?.tableReady === false)} title={!canEdit ? needText('edit') : undefined}
                  className="btn-primary"><Check size={13} />{busy === c.normalizedName ? '反映しています…' : '承認して反映'}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
