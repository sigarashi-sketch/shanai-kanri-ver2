'use client';

import { useEffect, useState } from 'react';
import { FileText, Folder } from 'lucide-react';
import { Card, HoryuFrame, horyuPost, tdCls, thCls, useHoryu } from '@/components/horyu/kit';

// カスタムページ（保留・10-25）。今の /custom-pages.html で作ったページを「見る」だけ。
//   ・見られるページ（共有されたもの）は今のシステムが決める。表の中身は保存ずみのブロックだけを今のシステムで実行
//   ・健康の情報らしい列は ver2 では出さない（/api/live/horyu/cp-query で落とす）
//   ・ページを作る・直す・共有するのは今の画面から（ブロックの組み立てはここには入れていない）
type TreePage = { id: string; title: string; icon?: string; level: string };
type TreeFolder = { id: string; title: string; icon?: string; pages: TreePage[] };
type Block = { id: string; type: string; title?: string; w?: number; view?: { md?: string } };
type Col = { name: string; label: string; kind: string };
type QueryRes = { columns: Col[]; rows: Record<string, unknown>[]; truncated: boolean; dropped: number };

const S_TREE: TreeFolder[] = [{ id: 'f1', title: '営業（見本）', pages: [{ id: '00000000-0000-0000-0000-000000000001', title: '今月の成約（見本）', level: 'view' }] }];
const S_BLOCKS: Block[] = [{ id: 'h', type: 'heading', title: '今月の成約' }, { id: 'k', type: 'kpi', title: '成約数' }, { id: 't', type: 'table', title: '担当ごと' }];
const S_RESULT: Record<string, QueryRes> = {
  k: { columns: [{ name: 'n', label: '成約数', kind: 'num' }], rows: [{ n: 12 }], truncated: false, dropped: 0 },
  t: { columns: [{ name: 'tantou', label: '担当', kind: 'text' }, { name: 'n', label: '成約数', kind: 'num' }], rows: [{ tantou: '営業 見本A', n: 7 }, { tantou: '営業 見本B', n: 5 }], truncated: false, dropped: 0 },
};

export default function CustomPagesPage() {
  const tree = useHoryu<{ folders: TreeFolder[] }>('cp-tree');
  const sample = tree.state === 'sample';
  const folders = sample ? S_TREE : tree.data?.folders ?? [];
  const [pageId, setPageId] = useState('');
  const first = folders.flatMap((f) => f.pages)[0]?.id ?? '';
  const cur = pageId || first;

  return (
    <HoryuFrame title="カスタムページ" sub="今のシステムで作ったページを見る（作る・直すのは今の画面から）" state={tree.state} error={tree.error} onReload={tree.reload}>
      <div className="grid gap-3.5 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="カスタムページの一覧" className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-2.5 text-body">
          {folders.map((f) => (
            <div key={f.id}>
              <div className="flex items-center gap-1.5 px-1.5 py-1 font-semibold text-muted"><Folder size={14} />{f.title}</div>
              {f.pages.map((p) => (
                <button key={p.id} onClick={() => setPageId(p.id)} className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 pl-5 text-left ${cur === p.id ? 'font-semibold' : 'hover:bg-soft'}`} style={cur === p.id ? { background: 'var(--al)', color: 'var(--ad)' } : undefined}>
                  <FileText size={13} className="shrink-0" />{p.title}
                </button>
              ))}
            </div>
          ))}
          {!folders.length && <p className="px-2 py-3 text-muted">見られるページはまだありません</p>}
        </nav>
        {cur ? <PageView key={cur} id={cur} sample={sample} /> : <div />}
      </div>
    </HoryuFrame>
  );
}

function PageView({ id, sample }: { id: string; sample: boolean }) {
  const p = useHoryu<{ page: { title: string; doc: { blocks?: Block[] } } }>(sample ? null : 'cp-page', { id });
  if (!sample && p.state === 'loading') return <div className="py-10 text-center text-body text-muted">読んでいます…</div>;
  if (!sample && p.state !== 'live') return <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-body text-muted">{p.state === 'forbidden' ? 'このページは共有されていません' : p.error}</div>;
  const blocks = sample ? S_BLOCKS : p.data?.page.doc.blocks ?? [];
  return (
    <div className="grid grid-cols-12 gap-3">
      {blocks.map((b) => {
        const span = Math.min(12, Math.max(3, b.w ?? 12));
        const style = { gridColumn: `span ${span} / span ${span}` };
        if (b.type === 'divider') return <hr key={b.id} className="col-span-12 border-line" />;
        if (b.type === 'heading') return <h2 key={b.id} className="col-span-12 text-lg font-bold">{b.title}</h2>;
        if (b.type === 'text') return <div key={b.id} className="col-span-12 whitespace-pre-wrap rounded-xl border border-line bg-surface px-4 py-3 text-body max-md:!col-span-12" style={style}>{b.view?.md ?? ''}</div>;
        if (b.type === 'kpi' || b.type === 'table' || b.type === 'chart') return <div key={b.id} className="max-md:!col-span-12" style={style}><DataBlock pageId={id} block={b} sample={sample} /></div>;
        return null;
      })}
      {!blocks.length && <p className="col-span-12 text-body text-muted">このページにはまだ何もありません</p>}
    </div>
  );
}

function DataBlock({ pageId, block, sample }: { pageId: string; block: Block; sample: boolean }) {
  const [res, setRes] = useState<QueryRes | null>(sample ? S_RESULT[block.id] ?? null : null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (sample) return;
    let on = true;
    void horyuPost<QueryRes>('cp-query', { pageId, blockId: block.id }).then((r) => { if (!on) return; if (r.ok) setRes(r.data); else setErr(r.error); });
    return () => { on = false; };
  }, [pageId, block.id, sample]);
  const fmt = (v: unknown, kind: string) => (v == null ? '—' : kind === 'num' && Number.isFinite(Number(v)) ? Number(v).toLocaleString('ja-JP') : String(v));
  return (
    <Card title={block.title}>
      <div className="px-4 pb-3">
        {err && <p className="text-sm" style={{ color: 'var(--tone-bad-fg)' }}>{err}</p>}
        {!err && !res && <p className="text-sm text-muted">読んでいます…</p>}
        {res && block.type === 'kpi' && (() => { const c = res.columns.find((x) => x.kind === 'num') ?? res.columns[0]; return <div className="num text-2xl font-bold">{c ? fmt(res.rows[0]?.[c.name], c.kind) : '—'}</div>; })()}
        {res && block.type !== 'kpi' && (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead><tr className="th-row">{res.columns.map((c) => <th key={c.name} className={`${thCls} ${c.kind === 'num' ? 'text-right' : ''}`}>{c.label}</th>)}</tr></thead>
              <tbody>{res.rows.slice(0, 500).map((row, i) => <tr key={i} className="border-t border-line-soft">{res.columns.map((c) => <td key={c.name} className={`${tdCls} ${c.kind === 'num' ? 'num text-right' : ''}`}>{fmt(row[c.name], c.kind)}</td>)}</tr>)}</tbody>
            </table>
            {block.type === 'chart' && <p className="pt-1 text-xs text-faint">グラフは表で出しています</p>}
            {res.dropped > 0 && <p className="pt-1 text-xs text-faint">要配慮の列（{res.dropped}）は出していません</p>}
          </div>
        )}
      </div>
    </Card>
  );
}
