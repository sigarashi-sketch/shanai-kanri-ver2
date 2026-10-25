'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TriangleAlert, X } from 'lucide-react';
import { useMotivation } from '@/components/Motivation';

// 人事の画面から書くときの共通の道具（10-25）。入れたらすぐ保存（自動保存）＋「→ どこに効いたか」のトーストと「取り消す」。
//   ・本物（live）… /api/live/** の POST に送る（行き先は各ルートが決め打ち）。失敗したら画面を元に戻して、上に理由を出す
//   ・見本（ログインしていない）… 画面の中だけ変える（今の社内システムには書かない）
//   ・apply/revert … 押した瞬間に画面を変える／戻す（保存を待たない）
//   ・undo … 保存が通ったあとの「取り消す」で送り直す中身（答えから作れる。null なら画面を戻すだけ）
export type WriteReq = {
  url: string; body: unknown; text: string; sub?: string;
  apply?: () => void; revert?: () => void;
  undo?: (res: Record<string, unknown>) => { url: string; body: unknown } | null;
};

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; j: Record<string, unknown> }> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: r.ok && j.ok !== false && j.success !== false, j };
  } catch (e) { return { ok: false, j: { error: (e as Error).message } }; }
}
const errText = (j: Record<string, unknown>) => {
  const e = String(j.error || '');
  return ({ ambiguous: '同姓同名がいるので、どの人か決められませんでした（別の人を書き換えないため）', no_match: '営業リストにこの氏名がありません', not_found: '営業リストにこの氏名がありません', no_name: '氏名が空です', group_taken: 'そのグループはもう別の人に紐付いています' } as Record<string, string>)[e]
    || String((j.hint as string) || e || '保存できませんでした');
};

export function useLiveWrite(live: boolean, onDone?: () => void) {
  const { hit, toast } = useMotivation();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(0);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);

  const send = useCallback(async (w: WriteReq): Promise<Record<string, unknown> | null> => {
    setError('');
    w.apply?.();
    if (!live) {
      hit();
      toast({ text: w.text, sub: `${w.sub ? `${w.sub}・` : ''}見本なので今の社内システムには書いていません`, undo: w.revert });
      return {};
    }
    setBusy((n) => n + 1);
    const { ok, j } = await postJson(w.url, w.body);
    setBusy((n) => n - 1);
    if (!ok) { w.revert?.(); setError(`${w.text.replace(/しました$/, 'できませんでした')}：${errText(j)}`); return null; }
    hit();
    done.current?.();
    const u = w.undo ? w.undo(j) : null;
    toast({
      text: w.text, sub: w.sub,
      undo: u || w.revert ? () => {
        w.revert?.();
        if (!u) return;
        postJson(u.url, u.body).then((x) => { if (!x.ok) setError(`取り消せませんでした：${errText(x.j)}`); done.current?.(); });
      } : undefined,
    });
    return j;
  }, [live, hit, toast]);

  return { send, error, setError, busy: busy > 0 };
}

export function WriteError({ error, onClose }: { error: string; onClose: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border px-4 py-2.5 text-sm" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)', borderColor: 'var(--tone-bad-bar)' }}>
      <TriangleAlert size={14} className="mt-0.5 shrink-0" /><span className="flex-1">{error}</span>
      <button onClick={onClose} aria-label="閉じる"><X size={14} /></button>
    </div>
  );
}
