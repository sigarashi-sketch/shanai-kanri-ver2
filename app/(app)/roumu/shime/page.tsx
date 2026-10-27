'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Lock, Unlock } from 'lucide-react';
import { OT_LINE } from '@/lib/types/roumu';
import { PageTitle, SkeletonRows } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { LiveBanner, useIke } from '@/components/Live';
import { MARK_CHOICES, setMark, useMarks, type IkeShimeTodo } from '@/lib/live/roumu';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { postLive } from '@/lib/live/post';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { SHIME_AUTO, SHIME_BULK_MAX, SHIME_LABEL, defaultShimeYm, hhmm, reasonsFor, shimeRowsOf, ymLabel, type IkeShimeBoard, type ShimeLiveRow } from '@/lib/live/shime';
import { PersonName } from '@/components/Person';

// 勤怠の締め（労務/営業管理）＝月の締めまでにやることを人ごとに並べ、全部0になった人から「締められる」にする。
//   ・やること4つ：打刻漏れ・未承認の申請・残業の見込み（45h超は理由を選ぶ）・現場の勤務表（未着/読めない）
//   ・全員そろったら「締める」（承認の権限）→ 静かな完了カード。締めた後も開け直せる
//   ・freee の月度は暦の月と1か月ずれるので、見出しは暦の月＋ freee の呼び名を添える
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

export default function ShimePage() {
  const { can } = usePerms();
  const canEdit = can('roumu', 'edit');
  const canApprove = can('roumu', 'approve');
  const { hit, toast } = useMotivation();
  const ike = useIke<IkeShimeBoard>('roster?op=shime&action=board');
  const live = ike.live && !!ike.data?.ok;
  const [ym, setYm] = useState('');
  useEffect(() => { if (live && !ym) setYm(defaultShimeYm(ike.data)); }, [live, ym, ike.data]);
  const mk = useMikeiken();   // 本物は未経験の人だけ（今のプロパーリストに入っている人）
  const lrows = live && ike.data ? shimeRowsOf({ ...ike.data, rows: mk.keep(ike.data.rows || [], 'name') }, ym) : [];
  const lopen = lrows.filter((r) => SHIME_LABEL[r.cell.status].todo);
  // 本物（10-26）：締めの前のやること＝打刻なしの日（勤務表に時間があり freee に打刻が無い日）とその月の残業（freee の月次）・45h超の理由（印）
  const todoQ = useIke<IkeShimeTodo>(live && ym ? `roster?op=roumu&action=shime-todo&ym=${ym}` : null);
  const otm = useMarks(['shime-ot'], ym, live && !!ym);
  const todoOf = new Map((todoQ.data?.ok ? todoQ.data.rows : []).map((x) => [x.key, x]));
  const [rerr, setRerr] = useState('');
  const saveOt = (r: ShimeLiveRow, v: string) => {
    setRerr('');
    setMark('shime-ot', `${ym}|${r.key}`, v, { nn: r.key, ym }).then(() => { hit(); otm.reload(); toast({ text: v ? `${r.name} の残業の理由を「${v}」にしました` : `${r.name} の残業の理由を外しました`, sub: '→ 今の社内システムに残しました' }); })
      .catch((e) => setRerr(`${r.name}：${(e as Error).message}`));
  };
  const otOver = lrows.filter((r) => (todoOf.get(r.key)?.otH ?? 0) > OT_LINE);
  const otLeft = otOver.filter((r) => !otm.get('shime-ot', `${ym}|${r.key}`)).length;
  const punchLeft = lrows.filter((r) => SHIME_LABEL[r.cell.status].todo && (todoOf.get(r.key)?.noPunchDays || 0) > 0).length;
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
      lines: [`状態：${SHIME_LABEL[r.cell.status].label}`, `勤務表／freee：${hhmm(r.cell.sheetMins)}／${hhmm(r.cell.freeeMins)}`,
        ...((todoOf.get(r.key)?.noPunchDays || 0) > 0 ? [`打刻なしの日：${todoOf.get(r.key)!.noPunchDays}日（freee の打刻を本人に直してもらうか、理由を選んで締めます）`] : []),
        ...((todoOf.get(r.key)?.otH ?? 0) > OT_LINE ? [`残業 ${todoOf.get(r.key)!.otH}h（45h超え）・理由：${otm.get('shime-ot', `${ym}|${r.key}`)?.value || 'まだ選んでいません'}`] : []),
        '締めた時点の時間を写しとして残します。直すときは開け直します'],
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

  const btn = 'min-h-8 rounded-lg border border-field bg-surface px-2.5 text-sm font-semibold disabled:opacity-40';
  const sel = 'min-h-8 max-w-[200px] rounded-lg border border-field bg-surface px-1.5 text-sm disabled:opacity-40';

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="勤怠の締め" sub={`${live ? `${ymLabel(ym)}・` : ''}勤務表と freee の打刻を人ごとに日ごとで突き合わせた結果（1日30分未満のずれは合っている扱い）`}>
        {live && (
          <select aria-label="月" value={ym} onChange={(e) => setYm(e.target.value)} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-body">
            {[...(ike.data?.months || [])].sort().reverse().map((m) => <option key={m} value={m}>{ymLabel(m)}{m >= (ike.data?.currentYm || '') ? '（月の途中）' : ''}</option>)}
          </select>
        )}
        <Link href="/keiri/approval" className="btn-secondary">申請の承認へ</Link>
        <Link href="/jinji/today" className="btn-secondary">当日の出勤状況へ</Link>
      </PageTitle>
      <LiveBanner state={ike.live && !ike.data?.ok ? 'error' : ike.state} error={ike.error || ike.data?.error} onReload={ike.reload} note="締める・開け直すは本物に書きます（押すと確認の窓が出ます）。打刻の直しのお願いなどは今の社内システムから" />
      <MikeikenNote mk={mk} live={live} />

      {live && <>
        {rerr && <div className="rounded-xl px-4 py-2.5 text-sm" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>{rerr}</div>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm">
          <b>締めの前のやること</b>
          {todoQ.state === 'loading' ? <span className="text-faint">読んでいます…</span> : todoQ.state === 'error' ? <span className="text-bad">読めませんでした（{todoQ.error}）</span> : <>
            <span className={punchLeft ? 'text-warn' : 'text-ok'}>打刻なしの日がある人 {punchLeft}人</span>
            <span className={otLeft ? 'text-bad' : 'text-ok'}>残業 {OT_LINE}h 超えで理由がまだの人 {otLeft}人（超えた人 {otOver.length}人）</span>
            <span className="text-muted">打刻修正・残業・有給の申請の承認は freee の画面で（今の freee 連携の権限に申請が入っていません）</span>
          </>}
        </div>
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
            <table className="w-full min-w-[1080px] border-collapse text-body">
              <thead><tr className="th-row text-left"><th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">状態</th><th className="px-2 py-2.5 font-semibold">勤務表／freee</th><th className="px-2 py-2.5 font-semibold">ずれ</th><th className="px-2 py-2.5 font-semibold">打刻なしの日</th><th className="px-2 py-2.5 font-semibold">残業（freee の月次）</th><th className="px-4 py-2.5 font-semibold" /></tr></thead>
              <tbody>
                {lrows.map((r, i) => {
                  const st = SHIME_LABEL[r.cell.status];
                  return (
                    <tr key={r.key} className="mo-fade-in row border-t border-line-soft align-top" style={{ ['--i' as string]: Math.min(i, 30) }}>
                      <td className="px-4 py-2.5"><PersonName name={r.name} className="font-semibold underline-offset-2 hover:underline" />{r.company && <div className="text-xs text-faint">{r.company}</div>}</td>
                      <td className="px-2 py-2.5"><span className="chip" style={{ background: `var(--tone-${st.tone}-bg)`, color: `var(--tone-${st.tone}-fg)` }}>{st.label}</span>{r.cell.status === 'closed' && r.cell.reason && <div className="mt-1 text-xs text-faint">理由：{r.cell.reason}</div>}</td>
                      <td className="num px-2 py-2.5 text-sm">{hhmm(r.cell.sheetMins)}／{hhmm(r.cell.freeeMins)}</td>
                      <td className="px-2 py-2.5 text-sm">{r.cell.diffMins == null ? <span className="text-faint">—</span> : r.cell.diffDays ? <span className="font-semibold text-warn">勤務表のほうが{r.cell.diffMins > 0 ? '長い' : '短い'} {hhmm(r.cell.diffMins)}・ずれた日 {r.cell.diffDays}日</span> : <span className="text-ok">合っている</span>}</td>
                      <td className="px-2 py-2.5 text-sm">{(() => { const t = todoOf.get(r.key); if (!t || !t.sheetKnown) return <span className="text-faint">—</span>; return t.noPunchDays ? <span className="font-semibold text-warn" title={t.noPunchDates.map((d) => d.slice(5).replace('-', '/')).join('・')}>{t.noPunchDays}日<span className="ml-1 font-normal text-faint">{t.noPunchDates.slice(0, 3).map((d) => d.slice(5).replace('-', '/')).join('・')}{t.noPunchDays > 3 ? '…' : ''}</span></span> : <span className="text-ok">なし</span>; })()}</td>
                      <td className="px-2 py-2.5 text-sm">{(() => {
                        const t = todoOf.get(r.key); if (!t || t.otH == null) return <span className="text-faint">—</span>;
                        const over = t.otH > OT_LINE; const m = otm.get('shime-ot', `${ym}|${r.key}`);
                        return <div className="flex flex-col items-start gap-1"><span className={`num ${over ? 'font-bold text-bad' : 'text-muted'}`}>{t.otH}h</span>
                          {over && <select aria-label={`${r.name} の残業の理由`} value={m?.value || ''} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} onChange={(e) => saveOt(r, e.target.value)} className={sel}>
                            <option value="">{OT_LINE}h 超え・理由を選ぶ</option>{MARK_CHOICES['shime-ot'].map((x) => <option key={x}>{x}</option>)}
                          </select>}</div>;
                      })()}</td>
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
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
      <p className="text-xs text-faint">勤務表と freee の打刻は日ごとに比べ、1日30分未満のずれは合っている扱いにしています。締めはこの画面の印だけで、freee の月次の締めはしません。残業は freee の月次（法定外＋法定休日）です。残業・欠勤控除・36協定など労務の最終判断は社労士に確認してください。</p>
    </main>
  );
}
