'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { FilterChips, PageTitle, SkeletonRows } from '@/components/ui';
import { LiveBanner, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { PersonName } from '@/components/Person';
import { matchGroupName } from '@/lib/live/eigyo-common';

// 営業リスト一覧（今の sales.html と同じ中身）。送る相手の一覧＝営業中の要員の LINE グループごとに、
//   最寄駅・稼働・属性/希望（グループのタグ）・並行数・サマリ・前職・面談できる日程。読むだけ。
//   本物：今の GET /api/proxy?action=getSalesTableData&all=1（DB から組み立て・SELECT だけ）。未経験の人（今のプロパーリストに入っている人）だけ出す
//   all=1＝送信リストに出ない人（ぽあ・辞退・参画決定・稼働中・営業停止）も excluded 付きで返る。
//   ★既定は「営業中」だけ（今の sales.html と同じ）。「全員」に切り替えると営業中でない人も理由つきで出る（10-26 shoya）
type SalesRow = {
  name: string; eki: string; kadou: string[]; zokusei: string[]; kibou: string[]; parallel: number; ball: boolean;
  summary: string; sukishi: string; experience: string; availability: { label: string; val: string }[]; availUpdated: string;
  excluded?: boolean; status?: string[];
};
const Tag = ({ t, tone }: { t: string; tone: string }) => <span className="mr-1 inline-block rounded-full px-2 py-0.5 text-xs" style={{ background: `var(--tone-${tone}-bg)`, color: `var(--tone-${tone}-fg)` }}>{t}</span>;

export default function SalesListPage() {
  const d = useIke<{ rows: SalesRow[]; error?: string }>('proxy?action=getSalesTableData&all=1');
  const live = d.live;
  const mk = useMikeiken();
  const [q, setQ] = useState('');
  const [availOnly, setAvailOnly] = useState(false);
  const [scope, setScope] = useState<'eigyo' | 'all'>('eigyo');
  const norms = useMemo(() => (mk.set ? [...mk.set] : []), [mk.set]);
  const everyone = useMemo(() => {
    if (!live) return [];
    const rows = d.data?.rows ?? [];
    if (mk.state === 'none') return rows;
    return rows.filter((r) => matchGroupName(r.name, norms));
  }, [live, d.data, mk.state, norms]);
  const eigyoCount = everyone.filter((r) => !r.excluded).length;
  const all = scope === 'all' ? everyone : everyone.filter((r) => !r.excluded);
  // 名前を押したら、グループ名に入っている要員（いちばん長く当たる名前）を開く
  const nameOf = (r: SalesRow) => (matchGroupName(r.name, norms) ?? r.name);
  const shown = all.filter((r) => (!availOnly || r.availability.length > 0)
    && (!q || `${r.name} ${r.eki} ${r.kadou.join(' ')} ${r.zokusei.join(' ')} ${r.kibou.join(' ')} ${r.summary} ${r.experience}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <main className="flex flex-col gap-3.5 px-4 pb-12 pt-[22px] sm:px-6">
      <PageTitle title="営業リスト一覧" sub="送る相手（営業中の要員の LINE グループ）ごとに、最寄駅・稼働・希望・並行数・面談できる日程。サマリ・前職は行を押すと画面の上に出ます。はじめは営業中だけ・「全員」で営業中でない人も理由つきで出ます。読むだけ" />
      <LiveBanner state={d.state} error={d.error} onReload={d.reload} note={`今の営業リスト一覧 営業中 ${eigyoCount}件／全員 ${everyone.length}件`} />
      <MikeikenNote mk={mk} live={live} />
      <FilterChips value={scope} onChange={setScope} items={[{ key: 'eigyo', label: '営業中', count: live ? eigyoCount : undefined }, { key: 'all', label: '全員', count: live ? everyone.length : undefined }]} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-9 min-w-[220px] flex-1 items-center gap-2 rounded-[10px] border border-field bg-surface px-3 text-faint sm:max-w-[320px]"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} aria-label="営業リストを検索" placeholder="名前・最寄駅・タグ・サマリ" className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none" /></label>
        <label className="flex min-h-9 items-center gap-2 text-body"><input type="checkbox" checked={availOnly} onChange={(e) => setAvailOnly(e.target.checked)} style={{ accentColor: 'var(--a)' }} />面談できる日程ありのみ（{all.filter((r) => r.availability.length).length}）</label>
        <span className="ml-auto text-sm text-muted"><span className="num">{shown.length}</span>件</span>
      </div>
      {/* 表は1行ずつ細く（サマリ・前職は載せない＝行が大きくなるため・10-26 shoya）。中身は行を押すと画面の上に出る */}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full border-collapse text-body">
          <thead><tr className="th-row text-left">
            {['氏名', '最寄駅', '稼働', '属性 / 希望', '並行', 'スキシ', '面談できる日程'].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">{h}</th>)}
          </tr></thead>
          <tbody>
            {!live && d.state !== 'error' && <tr><td colSpan={7} className="p-0"><SkeletonRows /></td></tr>}
            {shown.slice(0, 400).map((r) => (
              <tr key={r.name} className="row cursor-pointer border-t border-line-soft"
                onClick={(e) => { if ((e.target as HTMLElement).closest('button,a')) return; window.dispatchEvent(new CustomEvent('person:open', { detail: { name: nameOf(r) } })); }}>
                <td className="max-w-[220px] truncate whitespace-nowrap px-3 py-2 font-semibold"><PersonName name={nameOf(r)} className="hover:underline underline-offset-2">{r.name}</PersonName>{r.ball && <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--tone-info-fg)' }}>ボール</span>}{r.excluded && <span className="ml-1.5"><Tag t={r.status?.length ? r.status.join('・') : '営業中でない'} tone="mute" /></span>}</td>
                <td className="max-w-[120px] truncate whitespace-nowrap px-3 py-2">{r.eki || <span className="text-faint">—</span>}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.kadou.length ? r.kadou.map((t) => <Tag key={t} t={t} tone="info" />) : <span className="text-faint">—</span>}</td>
                <td className="max-w-[220px] truncate whitespace-nowrap px-3 py-2">{r.zokusei.map((t) => <Tag key={'z' + t} t={t} tone="purple" />)}{r.kibou.map((t) => <Tag key={'k' + t} t={t} tone="ok" />)}{!r.zokusei.length && !r.kibou.length && <span className="text-faint">—</span>}</td>
                <td className="num px-3 py-2">{r.parallel >= 1 ? r.parallel : <span className="text-faint">—</span>}</td>
                <td className="whitespace-nowrap px-3 py-2 text-sm">{/^https?:/.test(r.sukishi) ? <a href={r.sukishi} target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--ad)' }}>開く</a> : <span className="text-faint">—</span>}</td>
                <td className="max-w-[260px] truncate whitespace-nowrap px-3 py-2 text-sm" title={r.availability.map((a) => `${a.label} ${a.val}`).join('\n')}>
                  {r.availability.length ? <><b>{r.availability[0].label}</b> {r.availability[0].val}{r.availability.length > 1 && <span className="ml-1 text-xs text-muted">ほか{r.availability.length - 1}件</span>}</> : <span className="text-faint">—</span>}
                </td>
              </tr>
            ))}
            {live && shown.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">該当なし</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
