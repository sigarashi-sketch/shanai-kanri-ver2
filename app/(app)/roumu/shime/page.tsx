'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Lock, Unlock } from 'lucide-react';
import { OT_LINE, OT_REASONS, SHIME_MONTH, SHIME_ROWS, UNREADABLE_FIX, type ShimeRow } from '@/lib/shime-sample';
import { PageTitle, SkeletonRows } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { LiveBanner, NotInLegacy, useIke } from '@/components/Live';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { postLive } from '@/lib/live/post';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { SHIME_AUTO, SHIME_BULK_MAX, SHIME_LABEL, defaultShimeYm, hhmm, reasonsFor, shimeRowsOf, ymLabel, type IkeShimeBoard, type ShimeLiveRow } from '@/lib/live/shime';
import { PersonName } from '@/components/Person';

// 勤怠の締め（労務/営業管理）＝月の締めまでにやることを人ごとに並べ、全部0になった人から「締められる」にする。
//   ・やること4つ：打刻漏れ・未承認の申請・残業の見込み（45h超は理由を選ぶ）・現場の勤務表（未着/読めない）
//   ・全員そろったら「締める」（承認の権限）→ 静かな完了カード。締めた後も開け直せる
//   ・freee の月度は暦の月と1か月ずれるので、見出しは暦の月＋ freee の呼び名を添える
type Fix = { punch?: boolean; req?: boolean; ot?: string; sheet?: string };
const left = (r: ShimeRow, f: Fix = {}) => ({
  punch: f.punch ? 0 : r.missingPunch,
  req: f.req ? 0 : r.pendingReq,
  ot: r.otProjection > OT_LINE && !f.ot ? 1 : 0,
  sheet: r.sheet !== '届いた' && !f.sheet ? 1 : 0,
});
const total = (r: ShimeRow, f?: Fix) => Object.values(left(r, f)).reduce((a, b) => a + b, 0);
// 並びははじめの残りの多い順で固定（片づけるたびに行が動いて、押そうとした行が逃げないように）
const ROWS = [...SHIME_ROWS].sort((a, b) => total(b) - total(a));

// 締めの理由（選ぶだけ）。確認の窓の中に出す
function ReasonPick({ reasons }: { reasons: readonly string[] }) {
  return (
    <label className="flex flex-col gap-1 text-sm"><span className="font-semibold">締める理由</span>
      <select id="shime-reason" defaultValue="" className="min-h-9 rounded-lg border border-field bg-surface px-2 text-body">
        <option value="">理由を選ぶ…</option>{reasons.map((x) => <option key={x}>{x}</option>)}
      </select>
    </label>
  );
}

function Cell({ n, children }: { n: number; children?: React.ReactNode }) {
  return <td className="px-2 py-2.5 align-top">{n === 0 ? <span className="inline-flex items-center gap-1 text-sm text-ok"><Check size={13} />0</span> : <div className="flex flex-col items-start gap-1">{children}</div>}</td>;
}

export default function ShimePage() {
  const { can } = usePerms();
  const canEdit = can('roumu', 'edit');
  const canApprove = can('roumu', 'approve');
  const { hit, toast } = useMotivation();
  const [fix, setFix] = useState<Record<string, Fix>>({});
  const [closed, setClosed] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const ike = useIke<IkeShimeBoard>('roster?op=shime&action=board');
  const live = ike.live && !!ike.data?.ok;
  const [ym, setYm] = useState('');
  useEffect(() => { if (live && !ym) setYm(defaultShimeYm(ike.data)); }, [live, ym, ike.data]);
  const mk = useMikeiken();   // 本物は未経験の人だけ（今のプロパーリストに入っている人）
  const lrows = live && ike.data ? shimeRowsOf({ ...ike.data, rows: mk.keep(ike.data.rows || [], 'name') }, ym) : [];
  const lopen = lrows.filter((r) => SHIME_LABEL[r.cell.status].todo);
  // 本物の締め（10-25）：押す前に確認の窓。締め・開け直しは承認の権限（今のシステムもページ権限 kintai-shime で見る）
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  // まとめて締めるのは、この一覧（未経験の人）で一致などになっている人だけ。1人ずつ close（サーバでも未経験・一致をもう一度確かめる）
  const autoRows = lrows.filter((r) => SHIME_AUTO.includes(r.cell.status));
  const autoMine = autoRows.length;
  const [bulk, setBulk] = useState<{ ym: string; ok: number; ng: { name: string; error: string }[] } | null>(null);
  const lock = !canApprove ? needText('approve') : undefined;
  const after = (text: string, sub: string) => { hit(); toast({ text, sub }); ike.reload(); };
  const askClose = (r: ShimeLiveRow) => {
    const rs = reasonsFor(r.cell.status);
    setConfirm({
      title: `${r.name} の${ymLabel(ym)}を締める`, okLabel: rs.length ? '理由をつけて締める' : '締める', danger: rs.length > 0,
      lines: [`状態：${SHIME_LABEL[r.cell.status].label}`, `勤務表／freee：${hhmm(r.cell.sheetMins)}／${hhmm(r.cell.freeeMins)}`, '締めた時点の時間を写しとして残します。直すときは開け直します'],
      extra: rs.length ? <ReasonPick reasons={rs} /> : undefined,
      run: async () => {
        const reason = rs.length ? (document.getElementById('shime-reason') as HTMLSelectElement | null)?.value || '' : '';
        if (rs.length && !reason) throw new Error('一致していない月は理由を選んでから締めてください');
        await postLive('/api/live/shime', { action: 'close', ym, key: r.key, reason });
        after(`${r.name} の${ymLabel(ym)}を締めました`, reason ? `理由：${reason}` : '→ 請求書づくりと給与の材料に反映されます');
      },
    });
  };
  const askReopen = (r: ShimeLiveRow) => setConfirm({
    title: `${r.name} の${ymLabel(ym)}の締めを外す`, okLabel: '締めを外す', danger: true,
    lines: ['締めた時の写しを消し、もう一度見比べて締められる状態に戻します'],
    run: async () => { await postLive('/api/live/shime', { action: 'reopen', ym, key: r.key }); after(`${r.name} の締めを外しました`, 'もう一度見比べて締めてください'); },
  });
  const askCloseMatched = () => {
    const targets = autoRows.map((r) => ({ key: r.key, name: r.name }));
    const n = targets.length;
    setBulk(null);
    setConfirm({
      title: `${ymLabel(ym)}の「一致」した未経験の人をまとめて締める`, okLabel: `${n}人を締める`, danger: true,
      lines: [`この一覧（未経験の人）で 一致・freee だけ・記録なし・契約なし の ${n}人を、1人ずつ締めます`, '未経験以外の人は締めません', 'ずれ・未着・未読の人は締めません（1人ずつ理由を選んで締めます）'],
      run: async () => {
        let ok = 0; const ng: { name: string; error: string }[] = [];
        const nameOf = new Map(targets.map((t) => [t.key, t.name]));
        for (let i = 0; i < n; i += SHIME_BULK_MAX) {
          const chunk = targets.slice(i, i + SHIME_BULK_MAX);
          setConfirm((c) => c && { ...c, progress: `締めています… ${i}/${n}人（締めた ${ok}・できなかった ${ng.length}）` });
          try {
            const j = await postLive<{ results?: { key: string; ok: boolean; error?: string }[] }>('/api/live/shime', { action: 'close-mine', ym, keys: chunk.map((t) => t.key) });
            for (const x of j.results || []) { if (x.ok) ok++; else ng.push({ name: nameOf.get(x.key) || '', error: x.error || '締められませんでした' }); }
          } catch (e) {
            const msg = (e as Error).message;
            for (const t of chunk) ng.push({ name: t.name, error: msg });
            if (/ログイン|not_logged_in/.test(msg)) { for (const t of targets.slice(i + SHIME_BULK_MAX)) ng.push({ name: t.name, error: '途中で止めました（ログインが切れました）' }); break; }
          }
        }
        setBulk({ ym, ok, ng });
        if (ok) hit(ok);
        toast({ text: `${ymLabel(ym)}の ${ok}人を締めました${ng.length ? `（できなかった ${ng.length}人）` : ''}`, sub: '→ 請求書づくりと給与の材料に反映されます' });
        ike.reload();
      },
    });
  };

  const rows = ROWS;
  const notReady = rows.filter((r) => total(r, fix[r.personId]) > 0);
  const sum = (k: keyof ReturnType<typeof left>) => rows.reduce((a, r) => a + left(r, fix[r.personId])[k], 0);

  const apply = (r: ShimeRow, patch: Fix, text: string, sub: string) => {
    const next = { ...fix[r.personId], ...patch };
    setFix((x) => ({ ...x, [r.personId]: { ...x[r.personId], ...patch } }));
    setFlash(r.personId); setTimeout(() => setFlash(null), 1300);
    hit();
    const ready = total(r, next) === 0;
    // 取り消しはこの人のこの操作だけ戻す
    const undo = () => setFix((x) => { const p = { ...x[r.personId] }; (Object.keys(patch) as (keyof Fix)[]).forEach((k) => delete p[k]); return { ...x, [r.personId]: p }; });
    toast({ text: ready ? `${r.name} は締められる状態になりました` : text, sub, undo });
  };
  const close = () => {
    setClosed(true); hit(rows.length);
    toast({ text: `${SHIME_MONTH.label}の勤怠を締めました（${rows.length}人）`, sub: '→ 請求書づくりと給与の材料に反映しました', undo: () => setClosed(false) });
  };

  const btn = 'min-h-8 rounded-lg border border-field bg-surface px-2.5 text-sm font-semibold disabled:opacity-40';
  const sel = 'min-h-8 max-w-[200px] rounded-lg border border-field bg-surface px-1.5 text-sm disabled:opacity-40';

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="勤怠の締め" sub={live ? `${ymLabel(ym)}・勤務表と freee の打刻を人ごとに日ごとで突き合わせた結果（1日30分未満のずれは合っている扱い）` : `${SHIME_MONTH.label}（${SHIME_MONTH.period}）＝${SHIME_MONTH.freeeLabel}・締めは ${SHIME_MONTH.closeOn} まで・見本データ`}>
        {live && (
          <select aria-label="月" value={ym} onChange={(e) => setYm(e.target.value)} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-body">
            {[...(ike.data?.months || [])].sort().reverse().map((m) => <option key={m} value={m}>{ymLabel(m)}{m >= (ike.data?.currentYm || '') ? '（月の途中）' : ''}</option>)}
          </select>
        )}
        <Link href="/roumu/approval" className="btn-secondary">申請の承認へ</Link>
        <Link href="/roumu/today" className="btn-secondary">当日の出勤状況へ</Link>
      </PageTitle>
      <LiveBanner state={ike.live && !ike.data?.ok ? 'error' : ike.state} error={ike.error || ike.data?.error} onReload={ike.reload} note="締める・開け直すは本物に書きます（押すと確認の窓が出ます）。打刻の直しのお願いなどは今の社内システムから" />
      <MikeikenNote mk={mk} live={live} />

      {live && <>
        <NotInLegacy what="打刻漏れ・未承認の申請・残業の見込み（締めの前のやること）" />
        <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
          <RemainRing remain={lopen.length} total={Math.max(lrows.length, 1)} />
          <div className="text-body"><b>{ymLabel(ym)}でまだ締めていない人 {lopen.length}人</b>
            <span className="ml-2 text-muted">{(['match', 'freee_only', 'diff', 'unread', 'missing', 'no_freee'] as const).map((k) => `${SHIME_LABEL[k].label.replace(/（.*）/, '')} ${lrows.filter((r) => r.cell.status === k).length}`).join('・')}</span>
          </div>
          <button onClick={askCloseMatched} disabled={!canApprove || !ym || autoMine === 0 || ym >= (ike.data?.currentYm || '')} title={lock || (ym >= (ike.data?.currentYm || '') ? 'まだ月の途中なので締められません' : autoMine === 0 ? '一致した未経験の人はいません' : undefined)} className="btn-primary ml-auto"><Lock size={15} />一致した人をまとめて締める{autoMine > 0 && `（${autoMine}人）`}</button>
        </div>
        {bulk && bulk.ym === ym && (
          <div className="mo-fade-up flex flex-col gap-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm">
            <div className="flex items-center gap-2"><b>まとめて締めた結果</b><span className="text-ok">締めた {bulk.ok}人</span>{bulk.ng.length > 0 && <span style={{ color: 'var(--tone-bad-fg)' }}>できなかった {bulk.ng.length}人</span>}<button onClick={() => setBulk(null)} className="ml-auto text-faint">閉じる</button></div>
            {bulk.ng.length > 0 && <ul className="flex flex-col gap-0.5">{bulk.ng.map((x, i) => <li key={i} className="flex flex-wrap gap-2">{x.name ? <PersonName name={x.name} className="font-semibold underline-offset-2 hover:underline" /> : <span>—</span>}<span className="text-muted">{x.error}</span></li>)}</ul>}
          </div>
        )}
        {lrows.length > 0 && lopen.length === 0 && (
          <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-8 text-center"><Check className="mx-auto text-ok" size={26} /><div className="mt-2 text-md font-bold">{ymLabel(ym)}の勤怠は全員締まっています</div></div>
        )}
        <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-body">
              <thead><tr className="th-row text-left"><th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">状態</th><th className="px-2 py-2.5 font-semibold">勤務表／freee</th><th className="px-2 py-2.5 font-semibold">ずれ</th><th className="px-4 py-2.5 font-semibold" /></tr></thead>
              <tbody>
                {lrows.map((r, i) => {
                  const st = SHIME_LABEL[r.cell.status];
                  return (
                    <tr key={r.key} className="mo-fade-in row border-t border-line-soft align-top" style={{ ['--i' as string]: Math.min(i, 30) }}>
                      <td className="px-4 py-2.5"><PersonName name={r.name} className="font-semibold underline-offset-2 hover:underline" />{r.company && <div className="text-xs text-faint">{r.company}</div>}</td>
                      <td className="px-2 py-2.5"><span className="chip" style={{ background: `var(--tone-${st.tone}-bg)`, color: `var(--tone-${st.tone}-fg)` }}>{st.label}</span>{r.cell.status === 'closed' && r.cell.reason && <div className="mt-1 text-xs text-faint">理由：{r.cell.reason}</div>}</td>
                      <td className="num px-2 py-2.5 text-sm">{hhmm(r.cell.sheetMins)}／{hhmm(r.cell.freeeMins)}</td>
                      <td className="px-2 py-2.5 text-sm">{r.cell.diffMins == null ? <span className="text-faint">—</span> : r.cell.diffDays ? <span className="font-semibold text-warn">勤務表のほうが{r.cell.diffMins > 0 ? '長い' : '短い'} {hhmm(r.cell.diffMins)}・ずれた日 {r.cell.diffDays}日</span> : <span className="text-ok">合っている</span>}</td>
                      <td className="px-4 py-2.5 text-right">{st.todo && <button onClick={() => askClose(r)} disabled={!canApprove} title={lock} className={btn}>締める</button>}
                        {r.cell.status === 'closed' && <button onClick={() => askReopen(r)} disabled={!canApprove} title={lock} className={`${btn} inline-flex items-center gap-1`}><Unlock size={12} />開け直す</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>}

      {ike.state === 'loading' && <div className="rounded-xl border border-line bg-surface"><SkeletonRows /></div>}
      {!live && ike.state !== 'loading' && <>
      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={notReady.length} total={rows.length} />
        <div className="text-body"><b>まだ締められない人 {notReady.length}人</b>
          <span className="ml-2 text-muted">打刻漏れ {sum('punch')}日・未承認の申請 {sum('req')}件・残業の見込み {sum('ot')}人・勤務表 {sum('sheet')}人</span>
          {!canEdit && <div className="text-sm text-bad">{needText('edit')}</div>}
        </div>
        <button onClick={close} disabled={!canApprove || notReady.length > 0 || closed} title={!canApprove ? needText('approve') : notReady.length ? 'まだ締められない人がいます' : undefined} className="btn-primary ml-auto"><Lock size={15} />{SHIME_MONTH.label}を締める</button>
      </div>

      {closed && (
        <div className="mo-scale-in mo-celebrate rounded-xl border border-line bg-surface px-6 py-10 text-center">
          <Check className="mx-auto text-ok" size={26} />
          <div className="mt-2 text-md font-bold">{SHIME_MONTH.label}の勤怠は締まりました</div>
          <div className="mt-1 text-sm text-muted">{rows.length}人ぶんの時間をこの時点の写しとして残しました。直すときは開け直してください。</div>
          <button onClick={() => setClosed(false)} disabled={!canApprove} title={!canApprove ? needText('approve') : undefined} className="btn-secondary mt-3"><Unlock size={14} />開け直す</button>
        </div>
      )}

      {!closed && (
        <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-body">
              <thead><tr className="th-row text-left">
                <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">打刻漏れ</th><th className="px-2 py-2.5 font-semibold">未承認の申請</th><th className="px-2 py-2.5 font-semibold">残業の見込み</th><th className="px-2 py-2.5 font-semibold">現場の勤務表</th><th className="px-4 py-2.5 font-semibold">状態</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const f = fix[r.personId] || {}; const l = left(r, f); const ready = total(r, f) === 0;
                  return (
                    <tr key={r.personId} className={`mo-fade-in border-t border-line-soft ${flash === r.personId ? 'mo-flash' : 'row'} ${ready && total(r) > 0 ? 'opacity-60' : ''}`} style={{ ['--i' as string]: i }}>
                      <td className="px-4 py-2.5 align-top"><PersonName name={r.name} className="font-semibold hover:underline underline-offset-2" /><div className="text-xs text-faint">{r.site}・担当 {r.sales}</div></td>
                      <Cell n={l.punch}><span className="text-sm text-warn">{r.missingPunch}日</span>
                        <button className={btn} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} onClick={() => apply(r, { punch: true }, `${r.name} に打刻の直しをお願いしました`, '→ 本人に知らせました（あおい）・見本では直しが届いたものとして0にします')}>直しをお願い（あおい）</button></Cell>
                      <Cell n={l.req}><span className="text-sm text-warn">{r.pendingReq}件</span>
                        <Link href="/roumu/approval" className="text-sm font-semibold" style={{ color: 'var(--ad)' }}>申請の承認で片づける</Link>
                        <button className={btn} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} onClick={() => apply(r, { req: true }, `${r.name} の申請は片づきました`, '→ freee の勤怠に反映しました（見本）')}>片づいた</button></Cell>
                      <td className="px-2 py-2.5 align-top">
                        <div className={`num text-sm ${r.otProjection > OT_LINE ? 'font-bold text-bad' : 'text-muted'}`}>{r.otProjection}h</div>
                        {r.otProjection > OT_LINE && (l.ot ? (
                          <select aria-label="残業の理由" className={sel} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} value="" onChange={(e) => e.target.value && apply(r, { ot: e.target.value }, `${r.name} の残業の理由を残しました`, `→ 「${e.target.value}」を残業・36協定に反映しました`)}>
                            <option value="">{OT_LINE}h 超え・理由を選ぶ</option>{OT_REASONS.map((x) => <option key={x}>{x}</option>)}
                          </select>) : <div className="text-xs text-ok">{f.ot}</div>)}
                      </td>
                      <td className="px-2 py-2.5 align-top">
                        {r.sheet === '届いた' ? <span className="text-sm text-ok">届いた</span> : l.sheet ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className={`text-sm ${r.sheet === '未着' ? 'text-bad' : 'text-warn'}`}>{r.sheet}</span>
                            {r.sheet === '未着'
                              ? <button className={btn} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} onClick={() => apply(r, { sheet: 'お願い済み' }, `${r.name} の勤務表をお願いしました`, '→ 本人と取引先に知らせました（あおい）・勤務表の届き具合に反映')}>送ってもらう（あおい）</button>
                              : <select aria-label="読めない勤務表" className={sel} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} value="" onChange={(e) => e.target.value && apply(r, { sheet: e.target.value }, `${r.name} の勤務表を確かめました`, '→ 勤務表の届き具合に反映しました')}><option value="">どうしたか選ぶ</option>{UNREADABLE_FIX.map((x) => <option key={x}>{x}</option>)}</select>}
                          </div>) : <span className="text-sm text-ok">{f.sheet}</span>}
                        {r.diffNote && <div className="mt-1 text-xs text-faint">freee との差：{r.diffNote}</div>}
                      </td>
                      <td className="px-4 py-2.5 align-top">{ready
                        ? <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>締められる</span>
                        : <span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>あと {total(r, f)}つ</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>}
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
      <p className="text-xs text-faint">勤務表と freee の打刻は日ごとに比べ、1日30分未満のずれは合っている扱いにしています。締めはこの画面の印だけで、freee の月次の締めはしません（見本の中だけで動きます）。残業・欠勤控除など労務の最終判断は社労士に確認してください。</p>
    </main>
  );
}
