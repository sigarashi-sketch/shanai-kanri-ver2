'use client';

import { Fragment, useEffect, useState } from 'react';
import { Eye, EyeOff, Plus } from 'lucide-react';
import { Card, HoryuFrame, Msg, btnCls, fmtAt, horyuPost, inputCls, tdCls, thCls, useHoryu } from '@/components/horyu/kit';

// 媒体アイパス管理（10-25 保留で写す → 10-26 shoya「媒体アイパス管理て名前にして人事に」）。今の /ippass.html と同じ中身。
//   ・開けるのは今のシステムが許した人だけ（requireIppass：未経験事業部の人・ver2 の組織表で人事管理が承認の人（10-30）・全体管理者）。それ以外は 403＝何も出さない
//   ・一覧は名前だけ。中身（ID・パスワード等）は「見る」を押したときだけ今のシステムが復号して返す（操作ログに残る）
//   ・ver2 は鍵を持たない・中身を控えない。開いた中身は30秒で隠す
type Item = { id: string; category: string; title: string; updated_at: string; updated_by: string; deleted_at: string | null };
type Secret = { login_id: string; password: string; url: string; memo: string };
const FIELDS: Array<[keyof Secret, string]> = [['login_id', 'ID'], ['password', 'パスワード'], ['url', 'URL'], ['memo', '備考']];

export default function IppassPage() {
  const [deleted, setDeleted] = useState(false);
  const r = useHoryu<{ rows: Item[]; keyReady: boolean }>('ippass', { deleted: deleted ? 1 : undefined });
  const sample = !r.live; // 本物が読めていないときは書かない
  const rows = r.data?.rows ?? [];
  const [shown, setShown] = useState<{ id: string; s: Secret } | null>(null);
  const [edit, setEdit] = useState<{ id: string; f: Record<string, string> } | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const [saved, setSaved] = useState(''); // 直した行に「直しました」を出す（上のお知らせは見えないことがある）
  useEffect(() => { if (!shown) return; const t = setTimeout(() => setShown(null), 30000); return () => clearTimeout(t); }, [shown]);

  const post = async (body: Record<string, unknown>, done: string) => {
    if (sample) return null;
    const res = await horyuPost<{ secret?: Secret }>('ippass', body);
    setMsg(res.ok ? { text: done } : { text: res.error, bad: true });
    return res.ok ? res.data : null;
  };
  const reveal = async (it: Item) => {
    if (shown?.id === it.id) { setShown(null); return; }
    if (sample) return;
    const d = await post({ action: 'reveal', id: it.id }, `${it.title} を開きました（操作ログに残ります・30秒で隠します）`);
    if (d?.secret) setShown({ id: it.id, s: d.secret });
  };
  const saveEdit = async () => {
    if (!edit) return;
    const f = edit.id === 'new' ? edit.f : Object.fromEntries(Object.entries(edit.f).filter(([k, v]) => !FIELDS.some(([x]) => x === k) || v !== ''));
    const body = edit.id === 'new' ? { action: 'add', ...f } : { action: 'update', id: edit.id, ...f };
    if (!String(edit.f.title ?? 'x').trim()) { setMsg({ text: '名前を入れてください', bad: true }); return; }
    const d = await post(body, edit.id === 'new' ? `${edit.f.title} を足しました` : '直しました');
    if (d) { setSaved(edit.id); setEdit(null); setShown(null); void r.reload(); }
  };

  return (
    <HoryuFrame title="媒体アイパス管理" keep sub="社内で使うサービスの ID・パスワード（中身は押したときだけ・操作ログに残ります）" state={r.state} error={r.error} onReload={r.reload}
      actions={<button onClick={() => setEdit({ id: 'new', f: { category: '', title: '' } })} className="btn-primary"><Plus size={15} />足す</button>}>
      {r.data && r.data.keyReady === false && <Msg text="今のシステムに暗号化の鍵が設定されていないので、足す・直すはできません" bad />}
      <Msg text={msg.text} bad={msg.bad} />
      {edit?.id === 'new' && <Card title="足す"><EditForm edit={edit} setEdit={setEdit} onSave={saveEdit} /></Card>}
      <div className="flex items-center gap-2 text-sm"><label className="flex items-center gap-1.5"><input type="checkbox" checked={deleted} onChange={(e) => setDeleted(e.target.checked)} />削除の印がついたものを見る</label></div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-body">
            <thead><tr className="th-row"><th className={thCls}>分類</th><th className={thCls}>名前</th><th className={thCls}>中身</th><th className={thCls}>更新</th><th className={thCls} /></tr></thead>
            <tbody>
              {rows.map((it) => (
                <Fragment key={it.id}>
                <tr className="border-t border-line-soft align-top">
                  <td className={tdCls}>{it.category || '—'}</td>
                  <td className={`${tdCls} font-semibold`}>{it.title}</td>
                  <td className={tdCls}>
                    {shown?.id === it.id ? (
                      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-sm">
                        {FIELDS.map(([k, label]) => <Fragment2 key={k} label={label} value={shown.s[k]} />)}
                      </dl>
                    ) : <span className="text-faint">（隠しています）</span>}
                  </td>
                  <td className={`${tdCls} text-sm text-muted`}>{fmtAt(it.updated_at)}<div>{it.updated_by.split('@')[0]}</div>{saved === it.id && <span className="chip mt-1" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>直しました</span>}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    {!it.deleted_at && <>
                      <button className={btnCls} onClick={() => reveal(it)}>{shown?.id === it.id ? <><EyeOff size={13} className="mr-1 inline" />隠す</> : <><Eye size={13} className="mr-1 inline" />見る</>}</button>
                      <button className={`${btnCls} ml-1`} onClick={() => { setMsg({ text: '' }); setEdit({ id: it.id, f: { category: it.category, title: it.title } }); }}>直す</button>
                      <button className={`${btnCls} ml-1`} onClick={() => { if (window.confirm(`${it.title} に削除の印をつけます（あとで戻せます）`)) void post({ action: 'delete', id: it.id }, `${it.title} に削除の印をつけました`).then(() => r.reload()); }}>削除</button>
                    </>}
                    {it.deleted_at && <button className={btnCls} onClick={() => void post({ action: 'restore', id: it.id }, `${it.title} を戻しました`).then(() => r.reload())}>戻す</button>}
                  </td>
                </tr>
                {edit?.id === it.id && (
                  <tr className="bg-soft"><td colSpan={5} className="pt-3">
                    <div className="px-4 text-sm font-bold">{it.category ? `${it.category}・` : ''}{it.title} を直す<span className="ml-2 font-normal text-muted">空のままの欄は変えません</span></div>
                    {msg.bad && <div className="px-4 pt-2"><Msg text={msg.text} bad /></div>}
                    <EditForm edit={edit} setEdit={setEdit} onSave={saveEdit} />
                  </td></tr>
                )}
                </Fragment>
              ))}
              {r.state !== 'loading' && !rows.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">ありません</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </HoryuFrame>
  );
}

// 足す（表の上）・直す（押した行の真下＝10-30 shoya「直すおしても動かなくね」＝188件あると表の上の欄が見えなかった）で同じ欄
function EditForm({ edit, setEdit, onSave }: { edit: { id: string; f: Record<string, string> }; setEdit: (e: { id: string; f: Record<string, string> } | null) => void; onSave: () => void }) {
  return (
    <div className="flex flex-wrap items-end gap-2 px-4 pb-4 pt-2 text-sm text-muted">
      <label className="flex flex-col gap-1">分類<input value={edit.f.category ?? ''} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, category: e.target.value } })} className={`${inputCls} w-[120px]`} /></label>
      <label className="flex flex-col gap-1">名前<input value={edit.f.title ?? ''} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, title: e.target.value } })} className={`${inputCls} w-[180px]`} /></label>
      {FIELDS.map(([k, label]) => (
        <label key={k} className="flex flex-col gap-1">{label}<input type={k === 'password' ? 'password' : 'text'} autoComplete="off" value={edit.f[k] ?? ''} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, [k]: e.target.value } })} className={`${inputCls} w-[160px]`} /></label>
      ))}
      <button className="btn-primary" onClick={onSave}>保存</button>
      <button className={btnCls} onClick={() => setEdit(null)}>やめる</button>
    </div>
  );
}

function Fragment2({ label, value }: { label: string; value: string }) {
  return <><dt className="text-muted">{label}</dt><dd className="break-all select-all">{value || '—'}</dd></>;
}
