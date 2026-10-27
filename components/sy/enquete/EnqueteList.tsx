'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Link2, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/sy/ui';
import { fx } from '@/components/sy/compat';
import { ENQ_HOST, answerUrl, designOf, type EnqForm } from '@/lib/sy/enquete-types';

// アンケート作成の入口。カードを押すと編集画面
// 回答ページ（/f/<id>）はそれゆけ未経験にある＝いつも ENQ_HOST（ver2 には回答ページを置かない）
export const enqOrigin = () => ENQ_HOST;
export async function copyText(s: string, msg = 'コピーしました') {
  try { await navigator.clipboard.writeText(s); fx.toast(msg); } catch { window.prompt('コピーしてください', s); }
}
const day = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric' });

export default function EnqueteList({ initial }: { initial: EnqForm[] }) {
  const router = useRouter();
  const [forms, setForms] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function post(body: Record<string, string>) {
    const r = await fetch('/api/sy/s/enquete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { fx.toast(j.error || 'できませんでした', 'err'); return null; }
    return j as { form?: EnqForm };
  }
  async function create() {
    setBusy(true);
    const j = await post({ action: 'create' });
    if (j?.form) router.push('/jinzai/enquete/' + j.form.id); else setBusy(false);
  }
  async function duplicate(f: EnqForm) {
    const j = await post({ action: 'duplicate', id: f.id });
    if (j?.form) { setForms((p) => [j.form!, ...p]); fx.toast('コピーを作りました'); }
  }
  async function remove(f: EnqForm) {
    if (!confirm(`「${f.title || '無題のフォーム'}」を削除しますか？\n回答URLは開けなくなります。`)) return;
    if (await post({ action: 'delete', id: f.id })) { setForms((p) => p.filter((x) => x.id !== f.id)); fx.toast('削除しました'); }
  }
  const icon = 'rounded-full p-2 text-ig-muted hover:bg-ig-hover hover:text-ig-text';
  return (
    <>
      <PageHeader title="アンケート作成" sub="フォームを作って 回答URLを配る" />
      <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-3 md:p-8 xl:grid-cols-4">
        <button type="button" onClick={create} disabled={busy} className="ig-press flex min-h-44 flex-col items-center justify-center gap-2 rounded-lg border border-ig-border bg-white text-sm font-semibold hover:border-ig-primary disabled:opacity-50">
          <Plus size={44} strokeWidth={1.5} className="text-ig-primary" />
          新しいフォームを作成
        </button>
        {forms.map((f) => {
          const d = designOf(f.settings.design);
          return (
            <div key={f.id} className="ig-lift flex min-h-44 flex-col overflow-hidden rounded-lg border border-ig-border bg-white">
              <Link href={'/jinzai/enquete/' + f.id} className="flex flex-1 flex-col">
                <div className="flex h-20 items-end justify-between border-b border-ig-divider p-3" style={{ background: d.swatch[0] }}>
                  <span className={`rounded bg-white px-2 py-0.5 text-xs font-semibold ${f.accepting ? 'text-ig-ok' : 'text-ig-muted'}`}>{f.accepting ? '回答を受付中' : '受付を停止中'}</span>
                  <span className="h-5 w-5 rounded-full border border-white" style={{ background: d.swatch[1] }} />
                </div>
                <div className="flex-1 px-3 pt-3">
                  <div className="line-clamp-2 break-words text-sm font-semibold">{f.title || '無題のフォーム'}</div>
                  <div className="mt-1 text-xs text-ig-muted" suppressHydrationWarning>回答 {f.count || 0}件・{day(f.updated_at)} 更新・{d.label}</div>
                </div>
              </Link>
              <div className="flex justify-end px-1 pb-1">
                <button type="button" title="回答URLをコピー" onClick={() => copyText(answerUrl(f.id, enqOrigin()), '回答URLをコピーしました')} className={icon}><Link2 size={18} strokeWidth={1.75} /></button>
                <button type="button" title="コピーを作成" onClick={() => duplicate(f)} className={icon}><Copy size={18} strokeWidth={1.75} /></button>
                <button type="button" title="削除" onClick={() => remove(f)} className={icon}><Trash2 size={18} strokeWidth={1.75} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
