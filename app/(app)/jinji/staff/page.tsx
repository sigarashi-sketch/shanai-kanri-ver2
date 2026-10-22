'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { PEOPLE, STATUS_COUNTS } from '@/lib/sample';
import { GhostButton, PageTitle, Pill, PrimaryButton, TONE } from '@/components/ui';
import { useMotivation } from '@/components/Motivation';

export default function StaffPage() {
  const { hit, toast } = useMotivation();
  const [tab, setTab] = useState<string>('すべて');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const rows = useMemo(() => PEOPLE.filter((p) => (tab === 'すべて' || p.status === tab) && (!q || (p.name + p.kana + p.site + p.station).includes(q))), [tab, q]);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-[120px] pt-[22px]">
      <PageTitle title="社員一覧" sub="状態は日付つきの履歴から自動で決まります。名前を押すと社員ページ">
        <GhostButton>CSV</GhostButton><PrimaryButton>＋ 社員を追加</PrimaryButton>
      </PageTitle>

      <div className="mo-fade-up flex flex-wrap gap-2" style={{ ['--i' as string]: 1 }} role="tablist">
        {STATUS_COUNTS.map((s) => {
          const on = tab === s.label;
          return (
            <button key={s.label} role="tab" aria-selected={on} onClick={() => setTab(s.label)}
              className="min-h-9 rounded-full border px-3.5 text-[13px]"
              style={on ? { borderColor: 'var(--a)', background: 'var(--as)', color: 'var(--ad)', fontWeight: 700 } : { borderColor: '#DCDDE6', background: '#fff' }}>
              {s.label} <span className="num">{s.n}</span>
            </button>
          );
        })}
      </div>

      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-white" style={{ ['--i' as string]: 2 }}>
        <div className="flex flex-wrap items-center gap-2 px-3.5 py-3">
          <label className="flex min-h-9 min-w-[240px] items-center gap-2 rounded-[10px] border border-[#DCDDE6] px-3 text-faint">
            <Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} aria-label="この一覧を検索" placeholder="名前・カナ・現場・最寄駅" className="flex-1 bg-transparent text-[13px] text-ink outline-none" />
          </label>
          {['採用担当', '担当営業', '契約の形', '都道府県'].map((f) => (
            <button key={f} className="min-h-9 rounded-[10px] border border-[#DCDDE6] bg-white px-3 text-[13px]">{f} ⌄</button>
          ))}
          <span className="ml-auto text-[12.5px] text-muted">表示：営業向け ⌄　<span className="num">{rows.length}</span>人</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-[13px]">
            <thead><tr className="text-left" style={{ background: 'var(--as)', color: 'var(--ad)' }}>
              <th className="w-[26px] px-3.5 py-2.5"><input type="checkbox" aria-label="すべて選ぶ" checked={rows.length > 0 && rows.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
              <th className="px-2 py-2.5 font-semibold">社員 ⌄</th><th className="px-2 py-2.5 font-semibold">状態</th><th className="px-2 py-2.5 font-semibold">現場</th><th className="px-2 py-2.5 font-semibold">契約</th><th className="px-2 py-2.5 font-semibold">最寄駅</th><th className="px-2 py-2.5 text-right font-semibold">単価</th><th className="px-2 py-2.5 font-semibold">今月の勤怠</th><th className="px-3.5" />
            </tr></thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={p.id} className={`mo-fade-in border-t border-line-soft ${sel.has(p.id) ? '' : 'row'}`} style={{ ['--i' as string]: i + 3, background: sel.has(p.id) ? 'var(--as)' : undefined }}>
                  <td className="px-3.5 py-2"><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`${p.name}を選ぶ`} /></td>
                  <td className="px-2 py-2"><div className="flex items-center gap-2.5">
                    <div aria-hidden className="flex size-[30px] items-center justify-center rounded-full text-[12px] font-bold" style={{ background: 'var(--as)', color: 'var(--ad)' }}>{p.name[0]}</div>
                    <div><Link href={`/jinji/staff/${p.id}`} className="font-semibold hover:underline">{p.name}</Link><div className="text-[11.5px] text-faint">{p.no}・{p.joined.slice(0, 7)}入社</div></div>
                  </div></td>
                  <td className="px-2 py-2"><Pill>{p.status}</Pill></td>
                  <td className="px-2 py-2">{p.site}{p.reserve && <div className="text-[11.5px] font-semibold" style={{ color: 'var(--ad)' }}>{p.reserve}</div>}</td>
                  <td className="px-2 py-2">{p.contract}{p.contractEnd && <div className="text-[11.5px] font-semibold text-[#B45309]">{p.contractEnd}</div>}</td>
                  <td className="px-2 py-2">{p.station}</td>
                  <td className="num px-2 py-2 text-right">{p.price}</td>
                  <td className="px-2 py-2 font-medium" style={{ color: TONE[p.kintai.tone] }}>{p.kintai.text}</td>
                  <td className="px-3.5 py-2"><Link href={`/jinji/staff/${p.id}`} aria-label={`${p.name}の社員ページ`}><ChevronRight size={16} className="text-[#A3A6B8]" /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-line-soft px-3.5 py-2.5 text-[12.5px] text-muted"><span>全{rows.length}件</span><span>表示 50件</span></div>
      </div>

      {sel.size > 0 && (
        <div className="mo-scale-in fixed bottom-7 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2.5 rounded-[14px] bg-sumi py-2 pl-[18px] pr-2 text-[13.5px] text-white shadow-[0_12px_32px_rgba(25,27,46,.28)]">
          <b className="num">{sel.size}人を選択中</b><span className="h-5 w-px bg-white/20" />
          <button onClick={() => { hit(); toast({ text: `${sel.size}人にLINEを送る準備をしました`, sub: '→ 連絡の下書きに入りました' }); setSel(new Set()); }} className="min-h-9 rounded-[9px] bg-white/10 px-3 text-[13px]">LINEで送る</button>
          <button onClick={() => { hit(); toast({ text: `${sel.size}人に書類の回収を依頼しました`, sub: '→ 入社手続きの提出待ちに載りました' }); setSel(new Set()); }} className="min-h-9 rounded-[9px] bg-white/10 px-3 text-[13px]">書類の回収を依頼</button>
          <Link href="/jinji/yoyaku" className="btn inline-flex min-h-9 items-center rounded-[9px] px-3.5 text-[13px] font-bold" style={{ background: 'var(--a)', color: 'var(--ao)' }}>変更を予約（{sel.size}人）</Link>
        </div>
      )}
    </main>
  );
}
