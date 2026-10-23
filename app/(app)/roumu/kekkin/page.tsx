'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check } from 'lucide-react';
import { ABSENCES, KINDS, REASONS, STEPS, type Absence, type Kind } from '@/lib/kekkin-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';

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

  const inMonth = rows.filter((r) => r.month === month);
  const people = [...new Set(inMonth.map((r) => r.personId))].map((id) => {
    const rs = inMonth.filter((r) => r.personId === id);
    return { id, name: rs[0].name, site: rs[0].site, sales: rs[0].sales, rs, count: rs.filter((r) => r.kind === '欠勤').length };
  }).sort((a, b) => firstCount(b.id, month) - firstCount(a.id, month) || b.rs.length - a.rs.length);
  const open = inMonth.filter(todo);
  const initialOpen = ABSENCES.filter((r) => r.month === month && todo(r)).length;

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
      <PageTitle title="欠勤管理" sub="勤怠の連絡（グループLINE・公式LINE・電話）を本文のまま並べています。欠勤かどうかは読んで選んでください・見本データ">
        <div className="flex rounded-[10px] border border-field bg-surface p-0.5 text-[12.5px] font-semibold">
          {MONTHS.map((m) => <button key={m} onClick={() => setMonth(m)} className={`min-h-8 rounded-lg px-3 ${month === m ? 'text-white' : 'text-muted'}`} style={month === m ? { background: 'var(--a)' } : undefined}>{m}</button>)}
        </div>
      </PageTitle>

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={open.length} total={Math.max(initialOpen, open.length, 1)} />
        <div className="text-[13px]"><b>確かめる連絡 残り {open.length}件</b>
          <span className="ml-2 text-muted">未確認 {open.filter((r) => r.kind === '未確認').length}・現場にまだ伝えていない {inMonth.filter((r) => r.kind === '欠勤' && !r.siteNotified).length}・理由が未分類 {inMonth.filter((r) => r.kind === '欠勤' && r.reason === '未分類').length}</span>
          {!canEdit && <div className="text-[12px] text-bad">{needText('edit')}</div>}
        </div>
        <Link href="/jinji/rishoku" className="ml-auto text-[12px] font-semibold" style={{ color: 'var(--ad)' }}>離職リスクへ</Link>
      </div>

      {open.length === 0 && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-8 text-center">
          <Check className="mx-auto text-ok" size={26} />
          <div className="mt-2 text-[15px] font-bold">{month}の連絡はぜんぶ確かめました</div>
          <div className="mt-1 text-[12.5px] text-muted">新しい連絡は翌朝ここに並びます。</div>
        </div>
      )}

      {people.map((p, pi) => (
        <section key={p.id} className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: pi + 2 }}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5">
            <Link href={`/jinji/staff/${p.id}`} className="text-[14px] font-bold hover:underline">{p.name}</Link>
            <span className="text-[12px] text-faint">{p.site}・担当 {p.sales}</span>
            <span className="chip" style={{ background: p.count >= 2 ? 'var(--tone-bad-bg)' : 'var(--tone-mute-bg)', color: p.count >= 2 ? 'var(--tone-bad-fg)' : 'var(--tone-mute-fg)' }}>{month}の欠勤 {p.count}回</span>
            {p.count >= 1 && <span className="text-[12px] text-muted">対応の目安：{STEPS[Math.min(p.count, 4)]}</span>}
            {p.count >= 2 && <Link href={`/jinji/rishoku?id=${p.id}`} className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-bad"><AlertTriangle size={13} />欠勤が続いています・離職リスクを見る</Link>}
          </div>
          <ul>
            {p.rs.map((a) => (
              <li key={a.id} className={`grid gap-2 border-t border-line-soft px-4 py-2.5 first:border-t-0 md:grid-cols-[130px_1fr] xl:grid-cols-[150px_1fr_auto] ${flash === a.id ? 'mo-flash' : ''}`}>
                <div className="text-[12.5px]"><div className="num font-semibold">{a.day}</div><div className="text-[11.5px] text-faint">{a.route}{a.at !== '—' && `・${a.at}`}</div></div>
                <div className="rounded-[10px] bg-soft px-3 py-2 text-[12.5px]">{a.text}</div>
                <div className="flex flex-wrap items-center gap-1.5 md:col-start-2 xl:col-start-auto">
                  <select aria-label="この連絡は" value={a.kind} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} className={sel}
                    style={{ background: `var(--tone-${KIND_TONE[a.kind]}-bg)`, color: `var(--tone-${KIND_TONE[a.kind]}-fg)` }}
                    onChange={(e) => change(a, { kind: e.target.value as Kind }, `${a.name} の ${a.day} を「${e.target.value}」にしました`, e.target.value === '欠勤' ? '→ 名簿の欠勤の回数と、離職リスクの材料に反映しました' : '→ 欠勤の回数には数えません')}>
                    {KINDS.map((k) => <option key={k}>{k}</option>)}
                  </select>
                  {a.kind === '欠勤' && <>
                    <select aria-label="理由" value={a.reason} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} className={sel} onChange={(e) => change(a, { reason: e.target.value }, `${a.name} の理由を「${e.target.value}」にしました`, '→ 欠勤の記録に反映しました')}>
                      {REASONS.map((x) => <option key={x}>{x}</option>)}
                    </select>
                    <label title={!canEdit ? needText('edit') : undefined} className={`inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg border px-2 text-[12px] ${a.siteNotified ? 'border-line text-ok' : 'border-field text-bad'}`}>
                      <input type="checkbox" checked={a.siteNotified} disabled={!canEdit} onChange={(e) => change(a, { siteNotified: e.target.checked }, e.target.checked ? `${a.name} の欠勤を現場に伝えた印を付けました` : '現場に伝えた印を外しました', e.target.checked ? '→ 担当営業の「要対応」から外れました' : '→ 担当営業の「要対応」に戻しました')} />現場に連絡済み
                    </label>
                  </>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-[11.5px] text-faint">回数の数え方と段階の対応は今のシステムの決まり（10/5 から数える・診断書のある日は数えない）に合わせています。④は目安で、処分は人が決めます。欠勤控除・懲戒など最終判断は社労士・法務に確認してください。</p>
    </main>
  );
}
