'use client';

import { useEffect, useState } from 'react';
import type { LivePersonView } from '@/lib/live/person';

// 面談メモのタブ：要員リスト（プロパー）のメモとサマリを読むだけ（10-25 shoya「押したら面談メモ」）
export function PersonMemo({ name, live }: { name: string; live: boolean }) {
  const [res, setRes] = useState<{ memo: string; summary: string; error?: string } | null>(null);
  useEffect(() => {
    let on = true;
    setRes(null);
    if (!live) { setRes({ memo: '（見本）土日休み希望・事務系を希望。面談は 10/22 に実施', summary: '' }); return; }
    fetch('/api/live/person', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      .then(async (r) => (await r.json().catch(() => ({}))) as { proper?: LivePersonView | null; error?: string })
      .then((j) => { if (on) setRes(j.error ? { memo: '', summary: '', error: j.error } : { memo: j.proper?.facts.find(([k]) => k === 'メモ')?.[1] || '', summary: j.proper?.summary || '' }); })
      .catch((e) => { if (on) setRes({ memo: '', summary: '', error: (e as Error).message }); });
    return () => { on = false; };
  }, [name, live]);
  if (!res) return <div className="py-10 text-center text-faint">読み込み中…</div>;
  if (res.error) return <div className="py-10 text-center text-bad">{res.error}</div>;
  if (!res.memo && !res.summary) return <div className="py-10 text-center text-faint">面談メモはまだありません（要員リストのメモに書くとここに出ます）</div>;
  return (
    <div className="flex flex-col gap-4">
      {res.memo && <p className="whitespace-pre-wrap break-words leading-relaxed">{res.memo}</p>}
      {res.summary && <div><div className="text-[11.5px] text-faint">サマリ</div><p className="mt-1 whitespace-pre-wrap rounded-lg bg-soft px-3 py-2 text-[12.5px]">{res.summary}</p></div>}
    </div>
  );
}
