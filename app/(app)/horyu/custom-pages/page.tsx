'use client';

import { useEffect, useState } from 'react';
import { FileText, Folder, FolderPlus, GripVertical, Pencil, Plus, Share2, Trash2 } from 'lucide-react';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { Card, HoryuFrame, Msg, btnCls, horyuPost, inputCls, tdCls, thCls, useHoryu } from '@/components/horyu/kit';

// カスタムページ（保留・10-25／編集は 10-26）。今の /custom-pages.html と同じ口（/api/custom-pages）。
//   ・見られるページ・直せるページ（共有）は今のシステムが決める。表の中身は保存ずみのブロックだけを今のシステムで実行
//   ・健康の情報らしい列は ver2 では出さない（/api/live/horyu/cp-query で落とす）
//   ・ここでできる：親メニューとページを作る・名前を変える・消す・ドラッグで並べ替え／見出し・文章・区切りの追加と直し、
//     ブロックの削除とドラッグでの並べ替え／共有の相手の変更
//   ・データのブロック（数字・表・グラフ）の中身（どの表から何を出すか）を組み立てるのは今の画面から（ここは並べ替えと削除だけ）
//   ・ページの保存は今のシステムが版を残す（他の人が先に保存していたら止まる＝expectedUpdatedAt）
type Level = 'view' | 'edit';
type TreePage = { id: string; title: string; icon?: string; level: Level };
type TreeFolder = { id: string; title: string; icon?: string; level: Level; pages: TreePage[] };
type Block = { id: string; type: string; title?: string; w?: number; view?: { md?: string } & Record<string, unknown> } & Record<string, unknown>;
type Doc = { blocks?: Block[] } & Record<string, unknown>;
type PageRes = { level: Level; page: { id: string; folder_id: string; title: string; icon?: string; updated_at?: string; doc: Doc } };
type Col = { name: string; label: string; kind: string };
type QueryRes = { columns: Col[]; rows: Record<string, unknown>[]; truncated: boolean; dropped: number };
type Share = { email: string; can_edit: boolean };

const TYPE_LABEL: Record<string, string> = { heading: '見出し', text: '文章', divider: '区切り', kpi: '数字', table: '表', chart: 'グラフ' };
const uid = () => 'b' + Math.random().toString(36).slice(2, 9);
const newBlock = (type: 'heading' | 'text' | 'divider'): Block =>
  type === 'text' ? { id: uid(), type, w: 12, title: '', view: { md: '', size: 'md', align: 'left' } } : { id: uid(), type, w: 12, title: type === 'heading' ? '見出し' : '' };
/** 配列の from 番目を to 番目へ（ドラッグの並べ替え） */
const move = <T,>(a: T[], from: number, to: number) => { const b = [...a]; const [x] = b.splice(from, 1); b.splice(to, 0, x); return b; };

export default function CustomPagesPage() {
  const tree = useHoryu<{ folders: TreeFolder[]; canCreate?: boolean }>('cp-tree');
  const sample = !tree.live; // 本物が読めていないときは書かない
  const folders = tree.data?.folders ?? [];
  const canCreate = !sample && !!tree.data?.canCreate;
  const [pageId, setPageId] = useState('');
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const [drag, setDrag] = useState<{ type: 'folder' | 'page'; id: string; folderId?: string } | null>(null);
  const [share, setShare] = useState<{ type: 'folder' | 'page'; id: string; title: string } | null>(null);
  const first = folders.flatMap((f) => f.pages)[0]?.id ?? '';
  const cur = pageId || first;

  const post = async (name: string, body: unknown, ok: string) => {
    const r = await horyuPost<{ page?: { id: string } }>(name, body);
    if (!r.ok) throw new Error(r.error);
    setMsg({ text: ok }); void tree.reload();
    return r.data;
  };
  const folderSave = (f?: TreeFolder) => {
    const title = window.prompt(f ? '親メニューの新しい名前' : '新しい親メニューの名前', f?.title ?? '');
    if (!title?.trim()) return;
    void post('cp-folder', { op: 'save', id: f?.id ?? '', title: title.trim(), icon: f?.icon ?? '' }, f ? '名前を変えました' : '親メニューを作りました').catch((e) => setMsg({ text: (e as Error).message, bad: true }));
  };
  const folderDelete = (f: TreeFolder) => setConfirm({
    title: '親メニューを消す', danger: true, okLabel: '消す',
    lines: [`「${f.title}」と中のページ ${f.pages.length} 件を消します（元に戻せません）`, '消せるのは作った人と super_admin だけです'],
    run: () => post('cp-folder', { op: 'delete', id: f.id }, '消しました'),
  });
  const pageCreate = (f: TreeFolder) => {
    const title = window.prompt('新しいページの名前', '');
    if (!title?.trim()) return;
    void post('cp-page', { op: 'save', folderId: f.id, title: title.trim(), doc: { blocks: [] } }, 'ページを作りました').then((d) => d?.page?.id && setPageId(d.page.id)).catch((e) => setMsg({ text: (e as Error).message, bad: true }));
  };
  const drop = (type: 'folder' | 'page', targetId: string, folderId?: string) => {
    if (!drag || drag.type !== type || drag.id === targetId || (type === 'page' && drag.folderId !== folderId)) return setDrag(null);
    const ids = type === 'folder' ? folders.map((f) => f.id) : (folders.find((f) => f.id === folderId)?.pages ?? []).map((p) => p.id);
    const next = move(ids, ids.indexOf(drag.id), ids.indexOf(targetId));
    setDrag(null);
    void post('cp-reorder', { type, ids: next }, '並べ替えました').catch((e) => setMsg({ text: (e as Error).message, bad: true }));
  };

  return (
    <HoryuFrame title="カスタムページ" sub="今のシステムで作ったページを見る・直す" state={tree.state} error={tree.error} onReload={tree.reload}
      actions={canCreate && <button className={btnCls} onClick={() => folderSave()}><FolderPlus size={14} />親メニューを作る</button>}>
      <Msg text={msg.text} bad={msg.bad} />
      <div className="grid gap-3.5 md:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="カスタムページの一覧" className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-2.5 text-body">
          {folders.map((f) => (
            <div key={f.id} onDragOver={(e) => drag?.type === 'folder' && e.preventDefault()} onDrop={() => drop('folder', f.id)}>
              <div className="group flex items-center gap-1.5 px-1.5 py-1 font-semibold text-muted">
                {f.level === 'edit' && <span draggable onDragStart={() => setDrag({ type: 'folder', id: f.id })} onDragEnd={() => setDrag(null)} title="ドラッグで並べ替え" className="cursor-grab text-faint"><GripVertical size={13} /></span>}
                <Folder size={14} /><span className="min-w-0 flex-1 truncate">{f.title}</span>
                {f.level === 'edit' && !sample && (
                  <span className="flex shrink-0 gap-0.5 opacity-60 group-hover:opacity-100">
                    {canCreate && <button title="ページを作る" aria-label="ページを作る" onClick={() => pageCreate(f)}><Plus size={13} /></button>}
                    <button title="名前を変える" aria-label="名前を変える" onClick={() => folderSave(f)}><Pencil size={12} /></button>
                    <button title="共有" aria-label="共有" onClick={() => setShare({ type: 'folder', id: f.id, title: f.title })}><Share2 size={12} /></button>
                    <button title="消す" aria-label="消す" onClick={() => folderDelete(f)}><Trash2 size={12} /></button>
                  </span>
                )}
              </div>
              {f.pages.map((p) => (
                <div key={p.id} className="flex items-center" onDragOver={(e) => drag?.type === 'page' && drag.folderId === f.id && e.preventDefault()} onDrop={(e) => { e.stopPropagation(); drop('page', p.id, f.id); }}>
                  {p.level === 'edit' && f.level === 'edit' ? <span draggable onDragStart={(e) => { e.stopPropagation(); setDrag({ type: 'page', id: p.id, folderId: f.id }); }} onDragEnd={() => setDrag(null)} title="ドラッグで並べ替え" className="cursor-grab pl-1 text-faint"><GripVertical size={12} /></span> : <span className="w-4" />}
                  <button onClick={() => setPageId(p.id)} className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left ${cur === p.id ? 'font-semibold' : 'hover:bg-soft'}`} style={cur === p.id ? { background: 'var(--al)', color: 'var(--ad)' } : undefined}>
                    <FileText size={13} className="shrink-0" />{p.title}
                  </button>
                </div>
              ))}
            </div>
          ))}
          {!folders.length && <p className="px-2 py-3 text-muted">見られるページはまだありません</p>}
        </nav>
        {cur ? <PageView key={cur} id={cur} sample={sample} onChanged={() => void tree.reload()} onDeleted={() => { setPageId(''); void tree.reload(); }} onShare={(t) => setShare({ type: 'page', id: cur, title: t })} /> : <div />}
      </div>
      {share && <ShareDialog target={share} onClose={(done) => { setShare(null); if (done) setMsg({ text: '共有を変えました' }); }} />}
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
    </HoryuFrame>
  );
}

function PageView({ id, sample, onChanged, onDeleted, onShare }: { id: string; sample: boolean; onChanged: () => void; onDeleted: () => void; onShare: (title: string) => void }) {
  const p = useHoryu<PageRes>(sample ? null : 'cp-page', { id });
  const [edit, setEdit] = useState<{ title: string; blocks: Block[] } | null>(null);
  const [dragI, setDragI] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  if (!sample && p.state === 'loading') return <div className="py-10 text-center text-body text-muted">読んでいます…</div>;
  if (!sample && p.state !== 'live') return <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-body text-muted">{p.state === 'forbidden' ? 'このページは共有されていません' : p.error}</div>;
  const page = p.data?.page;
  const canEdit = !sample && p.data?.level === 'edit';
  const blocks = page?.doc.blocks ?? [];

  const save = async () => {
    if (!edit || !page) return;
    if (!edit.title.trim()) { setMsg({ text: '名前を入れてください', bad: true }); return; }
    setBusy(true); setMsg({ text: '' });
    const r = await horyuPost('cp-page', { op: 'save', id: page.id, title: edit.title.trim(), icon: page.icon ?? '', doc: { ...page.doc, blocks: edit.blocks }, expectedUpdatedAt: page.updated_at ?? '' });
    setBusy(false);
    if (!r.ok) { setMsg({ text: r.error, bad: true }); return; }
    setEdit(null); setMsg({ text: '保存しました（前の版は今のシステムに残っています）' });
    void p.reload(); onChanged();
  };
  const del = () => page && setConfirm({
    title: 'ページを消す', danger: true, okLabel: '消す', lines: [`「${page.title}」を消します（元に戻せません）`],
    run: async () => { const r = await horyuPost('cp-page', { op: 'delete', id: page.id }); if (!r.ok) throw new Error(r.error); onDeleted(); },
  });
  const setB = (i: number, patch: Partial<Block>) => setEdit((e) => e && { ...e, blocks: e.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  if (edit) return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={edit.title} maxLength={120} onChange={(e) => setEdit({ ...edit, title: e.target.value })} aria-label="ページの名前" className={`${inputCls} min-w-[240px] flex-1 text-md font-bold`} />
        <button className="btn-primary btn-sm" disabled={busy} onClick={() => void save()}>{busy ? '保存しています…' : '保存'}</button>
        <button className={btnCls} disabled={busy} onClick={() => { setEdit(null); setMsg({ text: '' }); }}>やめる</button>
      </div>
      <Msg text={msg.text} bad={msg.bad} />
      <p className="text-xs text-muted">左のつまみをドラッグして並べ替え。数字・表・グラフの中身を組み立てるのは今の画面からです（ここでは並べ替えと削除だけ）。</p>
      {edit.blocks.map((b, i) => (
        <div key={b.id} onDragOver={(e) => dragI !== null && e.preventDefault()} onDrop={() => { if (dragI !== null && dragI !== i) setEdit({ ...edit, blocks: move(edit.blocks, dragI, i) }); setDragI(null); }}
          className="flex items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2.5" style={dragI === i ? { opacity: 0.5 } : undefined}>
          <span draggable onDragStart={() => setDragI(i)} onDragEnd={() => setDragI(null)} title="ドラッグで並べ替え" className="mt-1.5 cursor-grab text-faint"><GripVertical size={14} /></span>
          <div className="min-w-0 flex-1">
            <span className="chip mb-1.5">{TYPE_LABEL[b.type] ?? b.type}</span>
            {b.type === 'heading' && <input value={b.title ?? ''} onChange={(e) => setB(i, { title: e.target.value.slice(0, 200) })} aria-label="見出しの文字" className={`${inputCls} w-full font-bold`} />}
            {b.type === 'text' && <textarea rows={Math.min(12, Math.max(3, (b.view?.md ?? '').split('\n').length + 1))} value={b.view?.md ?? ''} onChange={(e) => setB(i, { view: { ...(b.view ?? {}), md: e.target.value.slice(0, 20000) } })} aria-label="文章" className={`${inputCls} w-full`} />}
            {(b.type === 'kpi' || b.type === 'table' || b.type === 'chart') && <input value={b.title ?? ''} onChange={(e) => setB(i, { title: e.target.value.slice(0, 200) })} aria-label="タイトル" className={`${inputCls} w-full`} />}
            {b.type === 'divider' && <hr className="my-2 border-line" />}
          </div>
          <button title="このブロックを消す" aria-label="このブロックを消す" className="mt-1.5 text-faint hover:text-ink" onClick={() => setEdit({ ...edit, blocks: edit.blocks.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {(['heading', 'text', 'divider'] as const).map((t) => <button key={t} className={btnCls} onClick={() => setEdit({ ...edit, blocks: [...edit.blocks, newBlock(t)] })}><Plus size={13} />{TYPE_LABEL[t]}</button>)}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {canEdit && page && (
        <div className="flex flex-wrap items-center gap-2">
          <button className={btnCls} onClick={() => { setEdit({ title: page.title, blocks: [...(page.doc.blocks ?? [])] }); setMsg({ text: '' }); }}><Pencil size={13} />直す</button>
          <button className={btnCls} onClick={() => onShare(page.title)}><Share2 size={13} />共有</button>
          <button className={btnCls} onClick={del}><Trash2 size={13} />消す</button>
        </div>
      )}
      <Msg text={msg.text} bad={msg.bad} />
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
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

/** 共有の相手。社内の人は一覧から選ぶ（打ち込まない）。「全員に見せる」は見るだけ */
function ShareDialog({ target, onClose }: { target: { type: 'folder' | 'page'; id: string; title: string }; onClose: (done: boolean) => void }) {
  const cur = useHoryu<{ owner: string; shares: Share[]; inherited: Share[] }>('cp-shares', { type: target.type, id: target.id });
  const users = useHoryu<{ users: { email: string; name: string }[] }>('cp-users');
  const [rows, setRows] = useState<Share[] | null>(null);
  const [add, setAdd] = useState('');
  useEffect(() => { if (cur.data && rows === null) setRows(cur.data.shares.map((s) => ({ email: s.email, can_edit: !!s.can_edit }))); }, [cur.data, rows]);
  const list = rows ?? [];
  const everyone = list.some((s) => s.email === '*');
  const nameOf = (e: string) => users.data?.users.find((u) => u.email === e)?.name || e;
  const spec: ConfirmSpec = {
    title: `共有を変える（${target.title}）`, okLabel: '保存',
    lines: [everyone ? '社内の全員が見られます' : '共有した人だけが見られます', `共有する人: ${list.filter((s) => s.email !== '*').length} 人（うち直せる人 ${list.filter((s) => s.can_edit).length} 人）`, ...(target.type === 'folder' ? ['親メニューの共有は中のページにも効きます'] : [])],
    blocked: rows === null ? '読んでいます…' : undefined,
    extra: (
      <div className="mt-2 flex flex-col gap-1.5 text-sm">
        {cur.state === 'error' && <Msg text={cur.error} bad />}
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={everyone} onChange={(e) => setRows(e.target.checked ? [...list, { email: '*', can_edit: false }] : list.filter((s) => s.email !== '*'))} />社内の全員に見せる（見るだけ）</label>
        <div className="max-h-[220px] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="th-row"><th className={thCls}>人</th><th className={thCls}>直せる</th><th className={thCls} /></tr></thead>
            <tbody>{list.filter((s) => s.email !== '*').map((s) => (
              <tr key={s.email} className="border-t border-line-soft">
                <td className={tdCls}>{nameOf(s.email)}</td>
                <td className={tdCls}><input type="checkbox" aria-label="直せる" checked={s.can_edit} onChange={(e) => setRows(list.map((x) => (x.email === s.email ? { ...x, can_edit: e.target.checked } : x)))} /></td>
                <td className={tdCls}><button aria-label="外す" onClick={() => setRows(list.filter((x) => x.email !== s.email))}><Trash2 size={12} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="flex items-center gap-1.5">
          <select value={add} onChange={(e) => setAdd(e.target.value)} className={`${inputCls} min-w-0 flex-1`} aria-label="共有する人を選ぶ">
            <option value="">人を選ぶ</option>
            {(users.data?.users ?? []).filter((u) => !list.some((s) => s.email === u.email)).map((u) => <option key={u.email} value={u.email}>{u.name || u.email}</option>)}
          </select>
          <button className={btnCls} disabled={!add} onClick={() => { setRows([...list, { email: add, can_edit: false }]); setAdd(''); }}>足す</button>
        </div>
      </div>
    ),
    run: async () => {
      const r = await horyuPost('cp-shares', { type: target.type, id: target.id, shares: list.map((s) => ({ email: s.email, canEdit: s.can_edit })) });
      if (!r.ok) throw new Error(r.error);
    },
  };
  return <ConfirmWrite spec={spec} onClose={onClose} />;
}

function DataBlock({ pageId, block, sample }: { pageId: string; block: Block; sample: boolean }) {
  const [res, setRes] = useState<QueryRes | null>(null);
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
