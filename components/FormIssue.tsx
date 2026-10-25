'use client';

import { useState } from 'react';
import { Copy, Link2, X } from 'lucide-react';
import { Dialog } from './Dialog';
import { Z_MODAL } from '@/lib/layers';

// 基本情報フォームの URL 発行（10-25・今の issue.html と同じ）。氏名を入れて押すと、その人のフォームの URL が出る。
//   同じ人に未回答の URL があればそれを返す（二重に発行しない）。回答ずみならその旨。書くのは /api/live/form-issue だけ
type Res = { url: string; status: string; reused: boolean };

export function FormIssueButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-field bg-surface px-3.5 text-[13.5px] font-semibold"><Link2 size={15} />フォームURLの発行</button>
      {open && <FormIssueDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function FormIssueDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const issue = async () => {
    setBusy(true); setErr(''); setRes(null); setCopied(false);
    try {
      const r = await fetch('/api/live/form-issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const j = (await r.json().catch(() => ({}))) as Partial<Res> & { error?: string };
      if (r.status === 401 && j.error === 'not_logged_in') setRes({ url: 'https://example.com/form?t=SAMPLE', status: 'pending', reused: false });
      else if (!r.ok || j.error) setErr(j.error || `発行できませんでした（${r.status}）`);
      else setRes({ url: String(j.url || ''), status: String(j.status || ''), reused: !!j.reused });
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const copy = async () => { if (!res) return; try { await navigator.clipboard.writeText(res.url); setCopied(true); } catch { setErr('コピーできませんでした'); } };
  return (
    <Dialog label="基本情報フォームのURL発行" onClose={onClose} z={Z_MODAL} className="fixed left-1/2 top-[12vh] w-[min(460px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl border border-line bg-surface p-5 shadow-xl">
      <div className="flex items-center gap-2"><h2 className="text-[16px] font-bold">基本情報フォームのURL発行</h2><button data-dialog-close onClick={onClose} aria-label="閉じる" className="ml-auto rounded p-1 text-muted"><X size={16} /></button></div>
      <p className="mt-1 text-[12.5px] text-muted">本人に送るフォームの URL を出します。同じ人の未回答の URL があれば同じものを出します。</p>
      <label className="mt-3 flex flex-col gap-1 text-[13px] font-semibold">氏名
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() && !busy) void issue(); }} placeholder="山田 太郎" className="rounded-lg border border-field bg-surface px-3 py-2 text-[15px] font-normal text-ink" />
      </label>
      <button onClick={issue} disabled={busy || !name.trim()} className="btn-primary mt-3 min-h-10 w-full rounded-[10px] text-[14px] font-semibold disabled:opacity-40">{busy ? '発行しています…' : 'URLを発行する'}</button>
      {err && <p className="mt-3 text-[12.5px]" style={{ color: 'var(--tone-bad-fg)' }}>{err}</p>}
      {res && (
        <div className="mt-3 flex flex-col gap-2">
          <span className="chip self-start" style={res.status === 'submitted' ? { background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' } : res.reused ? { background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' } : { background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>
            {res.status === 'submitted' ? 'もう回答ずみです' : res.reused ? '前に出した URL（まだ未回答）' : '新しく発行しました'}
          </span>
          <div className="flex gap-2">
            <input readOnly value={res.url} onFocus={(e) => e.target.select()} aria-label="フォームのURL" className="min-w-0 flex-1 rounded-lg border border-field bg-soft px-3 py-2 text-[13px]" />
            <button onClick={copy} className="btn-primary inline-flex min-h-10 items-center gap-1 rounded-[10px] px-3 text-[13px] font-semibold"><Copy size={14} />{copied ? 'コピーした' : 'コピー'}</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
