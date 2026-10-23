'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Lock, Unlock } from 'lucide-react';
import { OT_LINE, OT_REASONS, SHIME_MONTH, SHIME_ROWS, UNREADABLE_FIX, type ShimeRow } from '@/lib/shime-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';

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

function Cell({ n, children }: { n: number; children?: React.ReactNode }) {
  return <td className="px-2 py-2.5 align-top">{n === 0 ? <span className="inline-flex items-center gap-1 text-[12px] text-ok"><Check size={13} />0</span> : <div className="flex flex-col items-start gap-1">{children}</div>}</td>;
}

export default function ShimePage() {
  const { can } = usePerms();
  const canEdit = can('roumu', 'edit');
  const canApprove = can('roumu', 'approve');
  const { hit, toast } = useMotivation();
  const [fix, setFix] = useState<Record<string, Fix>>({});
  const [closed, setClosed] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

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

  const btn = 'min-h-8 rounded-lg border border-field bg-surface px-2.5 text-[12px] font-semibold disabled:opacity-40';
  const sel = 'min-h-8 max-w-[200px] rounded-lg border border-field bg-surface px-1.5 text-[12px] disabled:opacity-40';

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="勤怠の締め" sub={`${SHIME_MONTH.label}（${SHIME_MONTH.period}）＝${SHIME_MONTH.freeeLabel}・締めは ${SHIME_MONTH.closeOn} まで・見本データ`}>
        <Link href="/roumu/approval" className="inline-flex min-h-9 items-center rounded-[10px] border border-field bg-surface px-3 text-[12.5px] font-semibold">申請の承認へ</Link>
        <Link href="/roumu/today" className="inline-flex min-h-9 items-center rounded-[10px] border border-field bg-surface px-3 text-[12.5px] font-semibold">当日の出勤状況へ</Link>
      </PageTitle>

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={notReady.length} total={rows.length} />
        <div className="text-[13px]"><b>まだ締められない人 {notReady.length}人</b>
          <span className="ml-2 text-muted">打刻漏れ {sum('punch')}日・未承認の申請 {sum('req')}件・残業の見込み {sum('ot')}人・勤務表 {sum('sheet')}人</span>
          {!canEdit && <div className="text-[12px] text-bad">{needText('edit')}</div>}
        </div>
        <button onClick={close} disabled={!canApprove || notReady.length > 0 || closed} title={!canApprove ? needText('approve') : notReady.length ? 'まだ締められない人がいます' : undefined} className="btn-primary ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-4 text-[13.5px] font-bold disabled:opacity-40"><Lock size={15} />{SHIME_MONTH.label}を締める</button>
      </div>

      {closed && (
        <div className="mo-scale-in mo-celebrate rounded-xl border border-line bg-surface px-6 py-10 text-center">
          <Check className="mx-auto text-ok" size={26} />
          <div className="mt-2 text-[15px] font-bold">{SHIME_MONTH.label}の勤怠は締まりました</div>
          <div className="mt-1 text-[12.5px] text-muted">{rows.length}人ぶんの時間をこの時点の写しとして残しました。直すときは開け直してください。</div>
          <button onClick={() => setClosed(false)} disabled={!canApprove} title={!canApprove ? needText('approve') : undefined} className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-[10px] border border-field px-3 text-[12.5px] font-semibold disabled:opacity-40"><Unlock size={14} />開け直す</button>
        </div>
      )}

      {!closed && (
        <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-[13px]">
              <thead><tr className="th-row text-left">
                <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">打刻漏れ</th><th className="px-2 py-2.5 font-semibold">未承認の申請</th><th className="px-2 py-2.5 font-semibold">残業の見込み</th><th className="px-2 py-2.5 font-semibold">現場の勤務表</th><th className="px-4 py-2.5 font-semibold">状態</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const f = fix[r.personId] || {}; const l = left(r, f); const ready = total(r, f) === 0;
                  return (
                    <tr key={r.personId} className={`mo-fade-in border-t border-line-soft ${flash === r.personId ? 'mo-flash' : 'row'} ${ready && total(r) > 0 ? 'opacity-60' : ''}`} style={{ ['--i' as string]: i }}>
                      <td className="px-4 py-2.5 align-top"><Link href={`/jinji/staff/${r.personId}`} className="font-semibold hover:underline">{r.name}</Link><div className="text-[11.5px] text-faint">{r.site}・担当 {r.sales}</div></td>
                      <Cell n={l.punch}><span className="text-[12px] text-warn">{r.missingPunch}日</span>
                        <button className={btn} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} onClick={() => apply(r, { punch: true }, `${r.name} に打刻の直しをお願いしました`, '→ 本人に知らせました（あおい）・見本では直しが届いたものとして0にします')}>直しをお願い（あおい）</button></Cell>
                      <Cell n={l.req}><span className="text-[12px] text-warn">{r.pendingReq}件</span>
                        <Link href="/roumu/approval" className="text-[12px] font-semibold" style={{ color: 'var(--ad)' }}>申請の承認で片づける</Link>
                        <button className={btn} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} onClick={() => apply(r, { req: true }, `${r.name} の申請は片づきました`, '→ freee の勤怠に反映しました（見本）')}>片づいた</button></Cell>
                      <td className="px-2 py-2.5 align-top">
                        <div className={`num text-[12.5px] ${r.otProjection > OT_LINE ? 'font-bold text-bad' : 'text-muted'}`}>{r.otProjection}h</div>
                        {r.otProjection > OT_LINE && (l.ot ? (
                          <select aria-label="残業の理由" className={sel} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} value="" onChange={(e) => e.target.value && apply(r, { ot: e.target.value }, `${r.name} の残業の理由を残しました`, `→ 「${e.target.value}」を残業・36協定に反映しました`)}>
                            <option value="">{OT_LINE}h 超え・理由を選ぶ</option>{OT_REASONS.map((x) => <option key={x}>{x}</option>)}
                          </select>) : <div className="text-[11.5px] text-ok">{f.ot}</div>)}
                      </td>
                      <td className="px-2 py-2.5 align-top">
                        {r.sheet === '届いた' ? <span className="text-[12px] text-ok">届いた</span> : l.sheet ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className={`text-[12px] ${r.sheet === '未着' ? 'text-bad' : 'text-warn'}`}>{r.sheet}</span>
                            {r.sheet === '未着'
                              ? <button className={btn} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} onClick={() => apply(r, { sheet: 'お願い済み' }, `${r.name} の勤務表をお願いしました`, '→ 本人と取引先に知らせました（あおい）・勤務表の届き具合に反映')}>送ってもらう（あおい）</button>
                              : <select aria-label="読めない勤務表" className={sel} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} value="" onChange={(e) => e.target.value && apply(r, { sheet: e.target.value }, `${r.name} の勤務表を確かめました`, '→ 勤務表の届き具合に反映しました')}><option value="">どうしたか選ぶ</option>{UNREADABLE_FIX.map((x) => <option key={x}>{x}</option>)}</select>}
                          </div>) : <span className="text-[12px] text-ok">{f.sheet}</span>}
                        {r.diffNote && <div className="mt-1 text-[11.5px] text-faint">freee との差：{r.diffNote}</div>}
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
      <p className="text-[11.5px] text-faint">勤務表と freee の打刻は日ごとに比べ、1日30分未満のずれは合っている扱いにしています。締めはこの画面の印だけで、freee の月次の締めはしません（見本の中だけで動きます）。残業・欠勤控除など労務の最終判断は社労士に確認してください。</p>
    </main>
  );
}
