'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Search, Send, TriangleAlert } from 'lucide-react';
import { ASK_TEMPLATES, KIHON, type KihonRow, type KState } from '@/lib/kihon-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';

// 基本情報（人事管理）＝基本情報フォームの回答を一覧で見る。
//   ・未回答・回答中・回答済みで絞る（?f=未回答 などで開ける）。検索は名前だけ
//   ・回答がまだの人には、インフォメーション（LINE公式）から「回答をお願いする」。文面は選ぶだけ
//   ・氏名の表記が名簿と食い違ったら、基本情報の名前が正 → 名簿の表記をそろえる
//   ・電話・番地・緊急連絡先・健康の欄はこの一覧に出さない（社員ページの詳細だけ／健康は専用の置き場だけ）
type Filter = 'すべて' | KState;
const FILTERS: Filter[] = ['すべて', '未回答', '回答中', '回答済み'];
const STATE_TONE: Record<KState, string> = { 未回答: 'bad', 回答中: 'caution', 回答済み: 'ok' };
type TplKey = (typeof ASK_TEMPLATES)[number]['key'];
const defaultTpl = (r: KihonRow): TplKey => (r.state === '回答中' ? 'continue' : r.asked ? 'remind' : 'first');

export default function KihonPage() {
  const canEdit = usePerms().can('jinji', 'edit');
  const { hit, toast } = useMotivation();
  const [rows, setRows] = useState<KihonRow[]>(KIHON);
  const [filter, setFilter] = useState<Filter>('すべて');
  const [q, setQ] = useState('');
  const [tpl, setTpl] = useState<Record<string, TplKey>>({});
  const [askedToday, setAskedToday] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<string[]>([]);

  useEffect(() => { const f = new URLSearchParams(window.location.search).get('f'); if (f && FILTERS.includes(f as Filter)) setFilter(f as Filter); }, []);

  const notYet = rows.filter((r) => r.state !== '回答済み');
  const waiting = notYet.filter((r) => !askedToday[r.id]);
  const shown = rows.filter((r) => (filter === 'すべて' || r.state === filter) && (!q || r.name.includes(q) || r.otherName?.includes(q)));
  const pulse = (ids: string[]) => { setFlash(ids); setTimeout(() => setFlash([]), 1300); };

  const ask = (rs: KihonRow[]) => {
    const ids = rs.map((r) => r.id);
    setAskedToday((a) => ({ ...a, ...Object.fromEntries(rs.map((r) => [r.id, true])) }));
    pulse(rs.map((r) => r.id)); hit(rs.length);
    const t = ASK_TEMPLATES.find((x) => x.key === (tpl[rs[0].id] ?? defaultTpl(rs[0])))!;
    toast({
      text: rs.length > 1 ? `${rs.length}人に回答をお願いしました` : `${rs[0].name} に「${t.label}」を送りました`,
      sub: '→ インフォメーション（LINE公式）から本人に届きます。3日たってもまだなら、ここに赤で出します',
      // この回にお願いした人だけ戻す（あとから別の人にお願いした分は残す）
      undo: () => setAskedToday((a) => Object.fromEntries(Object.entries(a).filter(([id]) => !ids.includes(id)))),
    });
  };
  const alignName = (r: KihonRow) => {
    const old = r.otherName;
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, otherName: undefined } : x)));
    pulse([r.id]); hit();
    toast({ text: `名簿の表記を「${r.name}」にそろえました`, sub: '→ 社員名簿・営業リスト・プロパーリストの氏名に反映しました（基本情報の名前が正）', undo: () => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, otherName: old } : x))) });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="基本情報" sub="基本情報フォームの回答。電話・番地・緊急連絡先・健康の欄はここに出しません・見本データ" />

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={waiting.length} total={notYet.length} />
        <div className="text-[13px]"><b>今日まだお願いしていない {waiting.length}人</b><span className="ml-2 text-muted">回答がまだ {notYet.length}人</span>
          <div className="text-[12px] text-muted">お願いはインフォメーション（LINE公式）から本人に届きます。{!canEdit && <span className="text-bad"> {needText('edit')}</span>}</div>
        </div>
        <button onClick={() => ask(waiting.filter((r) => r.state === '未回答'))} disabled={!canEdit || !waiting.some((r) => r.state === '未回答')} title={!canEdit ? needText('edit') : undefined}
          className="btn-primary ml-auto inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[12.5px] font-bold disabled:cursor-not-allowed disabled:opacity-40"><Send size={14} />未回答 {waiting.filter((r) => r.state === '未回答').length}人にまとめてお願いする</button>
      </div>

      {waiting.length === 0 && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-6 text-center">
          <Check className="mx-auto text-ok" size={24} />
          <div className="mt-1.5 text-[14px] font-bold">回答がまだの人には、今日ぜんぶお願いしました</div>
          <div className="mt-1 text-[12.5px] text-muted">回答が届くと「回答済み」に自動で移ります。</div>
        </div>
      )}

      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line-soft px-4 py-2.5">
          {FILTERS.map((f) => {
            const n = f === 'すべて' ? rows.length : rows.filter((r) => r.state === f).length;
            return <button key={f} onClick={() => setFilter(f)} className={`min-h-8 rounded-full border px-3 text-[12.5px] ${filter === f ? 'font-semibold' : 'text-muted'}`} style={filter === f ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>{f} {n}</button>;
          })}
          <label className="ml-auto flex min-h-8 items-center gap-1.5 rounded-lg border border-field bg-surface px-2.5">
            <Search size={14} className="text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前でさがす" aria-label="名前でさがす" className="w-36 bg-transparent text-[12.5px] outline-none" />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-[13px]">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">氏名（基本情報の表記）</th><th className="px-2 py-2.5 font-semibold">回答</th><th className="px-2 py-2.5 font-semibold">送った日・進み具合</th><th className="px-2 py-2.5 font-semibold">最寄駅</th><th className="px-2 py-2.5 font-semibold">職歴の職種</th><th className="px-2 py-2.5 font-semibold">資格</th><th className="px-4 py-2.5 font-semibold">お願い</th>
            </tr></thead>
            <tbody>
              {shown.map((r, i) => {
                const t = STATE_TONE[r.state];
                const late = r.state !== '回答済み' && !askedToday[r.id] && r.asked; // 一度お願いしても まだ
                return (
                  <tr key={r.id} className={`mo-fade-in border-t border-line-soft align-top ${flash.includes(r.id) ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                    <td className="px-4 py-2.5">
                      <Link href={`/jinji/staff/${r.id}`} className="font-semibold hover:underline">{r.name}</Link>
                      {r.otherName && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                          <span className="inline-flex items-center gap-1 text-warn"><TriangleAlert size={12} />名簿では「{r.otherName}」</span>
                          <button onClick={() => alignName(r)} disabled={!canEdit} title={!canEdit ? needText('edit') : '基本情報の名前が正です'} className="whitespace-nowrap rounded-md border px-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-40" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}>名簿をそろえる</button>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2.5"><span className="chip" style={{ background: `var(--tone-${t}-bg)`, color: `var(--tone-${t}-fg)` }}>{r.state}</span></td>
                    <td className="num whitespace-nowrap px-2 py-2.5 text-[12.5px]">{r.issued} 送付{r.submitted && <div className="text-faint">{r.submitted} 回答</div>}{r.step && <div className="text-muted">{r.step} まで</div>}</td>
                    <td className="px-2 py-2.5">{r.station ?? <span className="text-faint">—</span>}</td>
                    <td className="px-2 py-2.5">{r.jobs ? <div className="flex flex-wrap gap-1">{r.jobs.map((j) => <span key={j} className="chip" style={{ background: 'var(--as)', color: 'var(--ad)' }}>{j}</span>)}</div> : <span className="text-faint">—</span>}</td>
                    <td className="px-2 py-2.5 text-[12.5px]">{r.certs ?? <span className="text-faint">—</span>}</td>
                    <td className="px-4 py-2.5">
                      {r.state === '回答済み' ? <span className="text-[12px] text-faint">—</span>
                        : askedToday[r.id] ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ok"><Check size={14} />今日 お願いしました</span>
                        : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <select aria-label={`${r.name} に送る文面`} value={tpl[r.id] ?? defaultTpl(r)} disabled={!canEdit} onChange={(e) => setTpl((x) => ({ ...x, [r.id]: e.target.value as TplKey }))} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-[12.5px] disabled:opacity-50">
                              {ASK_TEMPLATES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                            </select>
                            <button onClick={() => ask([r])} disabled={!canEdit} title={!canEdit ? needText('edit') : ASK_TEMPLATES.find((a) => a.key === (tpl[r.id] ?? defaultTpl(r)))!.text}
                              className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}><Send size={13} />お願いする</button>
                            {late && <div className="w-full text-[11px] text-bad">{r.asked} にお願いずみ・まだ回答がありません</div>}
                          </div>
                        )}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-[12.5px] text-muted">当てはまる人はいません。</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11.5px] text-faint">健康の欄（持病など）は要配慮個人情報のため、この一覧には出しません。取り扱いの範囲は、最終判断は社労士・法務に確認してください。</p>
    </main>
  );
}
