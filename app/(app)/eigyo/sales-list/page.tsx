'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { PageTitle, SkeletonRows } from '@/components/ui';
import { LiveBanner, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { PersonName } from '@/components/Person';
import { matchGroupName } from '@/lib/live/eigyo-common';

// 営業リスト一覧（今の sales.html と同じ中身）。送る相手の一覧＝営業中の要員の LINE グループごとに、
//   最寄駅・稼働・属性/希望（グループのタグ）・並行数・サマリ・前職・面談できる日程。読むだけ。
//   本物：今の GET /api/proxy?action=getSalesTableData（DB から組み立て・SELECT だけ）。未経験の人（今のプロパーリストに入っている人）だけ出す
type SalesRow = {
  name: string; eki: string; kadou: string[]; zokusei: string[]; kibou: string[]; parallel: number; ball: boolean;
  summary: string; sukishi: string; experience: string; availability: { label: string; val: string }[]; availUpdated: string;
};
const SAMPLE: SalesRow[] = [
  { name: '中村優 案件G', eki: '蕨', kadou: ['即日'], zokusei: ['20代'], kibou: ['インフラ'], parallel: 2, ball: true, summary: '氏名：Y.N\n年齢：26歳\n資格：CCNA', sukishi: 'https://example.com/sample-sheet', experience: '飲食店 店長', availability: [{ label: '平日', val: '18時以降' }], availUpdated: '10/22' },
  { name: '佐々木蓮 案件G', eki: '大宮', kadou: ['即日'], zokusei: ['20代'], kibou: ['開発'], parallel: 0, ball: false, summary: '氏名：R.S', sukishi: '', experience: '物流倉庫', availability: [], availUpdated: '' },
  { name: '松本結衣 案件G', eki: '赤羽', kadou: ['即日'], zokusei: ['20代'], kibou: ['テスト'], parallel: 3, ball: false, summary: '', sukishi: '', experience: 'コールセンター', availability: [{ label: '土日', val: '終日' }], availUpdated: '10/20' },
];
const Tag = ({ t, tone }: { t: string; tone: string }) => <span className="mr-1 inline-block rounded-full px-2 py-0.5 text-xs" style={{ background: `var(--tone-${tone}-bg)`, color: `var(--tone-${tone}-fg)` }}>{t}</span>;

export default function SalesListPage() {
  const d = useIke<{ rows: SalesRow[]; error?: string }>('proxy?action=getSalesTableData');
  const live = d.live;
  const mk = useMikeiken();
  const [q, setQ] = useState('');
  const [availOnly, setAvailOnly] = useState(false);
  const norms = useMemo(() => (mk.set ? [...mk.set] : []), [mk.set]);
  const all = useMemo(() => {
    if (!live) return SAMPLE;
    const rows = d.data?.rows ?? [];
    if (mk.state === 'none') return rows;
    return rows.filter((r) => matchGroupName(r.name, norms));
  }, [live, d.data, mk.state, norms]);
  // 名前を押したら、グループ名に入っている要員（いちばん長く当たる名前）を開く
  const nameOf = (r: SalesRow) => (live ? matchGroupName(r.name, norms) ?? r.name : r.name.replace(/\s*案件G$/, ''));
  const shown = all.filter((r) => (!availOnly || r.availability.length > 0)
    && (!q || `${r.name} ${r.eki} ${r.kadou.join(' ')} ${r.zokusei.join(' ')} ${r.kibou.join(' ')} ${r.summary} ${r.experience}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <main className="flex flex-col gap-3.5 px-4 pb-12 pt-[22px] sm:px-6">
      <PageTitle title="営業リスト一覧" sub="送る相手（営業中の要員の LINE グループ）ごとに、最寄駅・稼働・希望・並行数・サマリ・面談できる日程。読むだけ" />
      <LiveBanner state={d.state} error={d.error} onReload={d.reload} note={`今の営業リスト一覧 ${all.length}件`} />
      <MikeikenNote mk={mk} live={live} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-9 min-w-[220px] flex-1 items-center gap-2 rounded-[10px] border border-field bg-surface px-3 text-faint sm:max-w-[320px]"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} aria-label="営業リストを検索" placeholder="名前・最寄駅・タグ・サマリ" className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none" /></label>
        <label className="flex min-h-9 items-center gap-2 text-body"><input type="checkbox" checked={availOnly} onChange={(e) => setAvailOnly(e.target.checked)} style={{ accentColor: 'var(--a)' }} />面談できる日程ありのみ（{all.filter((r) => r.availability.length).length}）</label>
        <span className="ml-auto text-sm text-muted"><span className="num">{shown.length}</span>件</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[980px] border-collapse text-body">
          <thead><tr className="th-row text-left">
            {['氏名', '最寄駅', '稼働', '属性 / 希望', '並行', 'サマリ', '前職・スキル', '面談できる日程'].map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}
          </tr></thead>
          <tbody>
            {d.state === 'loading' && <tr><td colSpan={8} className="p-0"><SkeletonRows /></td></tr>}
            {shown.slice(0, 400).map((r) => (
              <tr key={r.name} className="row border-t border-line-soft align-top">
                <td className="whitespace-nowrap px-3 py-2.5 font-semibold"><PersonName name={nameOf(r)} className="hover:underline underline-offset-2">{r.name}</PersonName>{r.ball && <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--tone-info-fg)' }}>ボール</span>}</td>
                <td className="px-3 py-2.5">{r.eki || <span className="text-faint">—</span>}</td>
                <td className="px-3 py-2.5">{r.kadou.length ? r.kadou.map((t) => <Tag key={t} t={t} tone="info" />) : <span className="text-faint">—</span>}</td>
                <td className="px-3 py-2.5">{r.zokusei.map((t) => <Tag key={'z' + t} t={t} tone="purple" />)}{r.kibou.map((t) => <Tag key={'k' + t} t={t} tone="ok" />)}{!r.zokusei.length && !r.kibou.length && <span className="text-faint">—</span>}</td>
                <td className="num px-3 py-2.5">{r.parallel >= 1 ? r.parallel : <span className="text-faint">—</span>}</td>
                <td className="max-w-[280px] whitespace-pre-line px-3 py-2.5 text-sm">{r.summary.replace(/\n{2,}/g, '\n').trim() || <span className="text-faint">—</span>}{/^https?:/.test(r.sukishi) && <a href={r.sukishi} target="_blank" rel="noreferrer" className="mt-1 block underline" style={{ color: 'var(--ad)' }}>スキルシート</a>}</td>
                <td className="max-w-[240px] whitespace-pre-line px-3 py-2.5 text-sm">{r.experience || <span className="text-faint">—</span>}</td>
                <td className="px-3 py-2.5 text-sm">{r.availability.length ? <>{r.availability.map((a) => <div key={a.label}><b>{a.label}</b> {a.val}</div>)}{r.availUpdated && <div className="text-xs text-faint">{r.availUpdated} 取込</div>}</> : <span className="text-faint">—</span>}</td>
              </tr>
            ))}
            {d.state !== 'loading' && shown.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">該当なし</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
