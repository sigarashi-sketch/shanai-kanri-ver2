import { ViewerSwitch } from '@/components/Shell';
import { canUseApp } from '@/lib/access';
import { loadMembers } from '@/lib/members-store';
import { getViewer } from '@/lib/viewer';
import { PEOPLE } from '@/lib/sample';

// 営業共有リスト。内勤以外の人が見られるのはここだけ。
export default async function SharedListPage() {
  const me = await getViewer();
  const members = (await loadMembers()).map((m) => ({ id: m.id, name: m.name }));
  const rows = PEOPLE.filter((p) => p.status === '待機' || p.status === '入場予定' || p.contractEnd);
  return (
    <div data-module="eigyo" className="min-h-screen">
      <header className="flex min-h-[58px] items-center gap-3 border-b border-line bg-white px-6">
        <div aria-hidden className="flex size-7 items-center justify-center rounded-lg bg-sumi text-[15px] font-extrabold text-white">S</div>
        <b className="text-[15px]">営業共有リスト</b>
        <span className="text-[12.5px] text-muted">{me.name}{canUseApp(me) ? '' : '・この画面だけ見られます'}</span>
        <div className="ml-auto"><ViewerSwitch members={members} current={me.id} /></div>
      </header>
      <main className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-6">
        {canUseApp(me) && <a href="/" className="text-[13px] font-semibold" style={{ color: 'var(--ad)' }}>← 戻る</a>}
        <h1 className="mo-fade-up text-[22px] font-bold">いま提案できる要員</h1>
        <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-white" style={{ ['--i' as string]: 1 }}>
          <table className="w-full border-collapse text-[13px]">
            <thead><tr className="text-left" style={{ background: 'var(--as)', color: 'var(--ad)' }}>
              <th className="px-4 py-2.5 font-semibold">要員</th><th className="px-2 py-2.5 font-semibold">状態</th><th className="px-2 py-2.5 font-semibold">最寄駅</th><th className="px-2 py-2.5 font-semibold">稼働できる日</th><th className="px-4 py-2.5 font-semibold">担当営業</th>
            </tr></thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={p.id} className="row mo-fade-in border-t border-line-soft" style={{ ['--i' as string]: i + 2 }}>
                  <td className="px-4 py-2.5 font-semibold">{p.name}</td>
                  <td className="px-2 py-2.5">{p.status}{p.contractEnd ? `（${p.contractEnd}）` : ''}</td>
                  <td className="px-2 py-2.5">{p.station}</td>
                  <td className="px-2 py-2.5">{p.status === '待機' ? '即日' : p.contractEnd ? '12/1〜' : '—'}</td>
                  <td className="px-4 py-2.5">{p.sales}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-faint">見本データです。中身（列・絞り込み）は今のいけどんの営業共有リストに合わせて作り直します。</p>
      </main>
    </div>
  );
}
