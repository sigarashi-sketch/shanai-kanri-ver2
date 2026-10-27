'use client';

import { useEffect, useState } from 'react';

// 名前の小窓の「基本情報」タブ（10-25 shoya）。基本情報フォームの回答を読むだけ（生年月日・住所・既往歴も出す＝10-27 shoya。電話・メール・緊急連絡先は出さない）
//   読むのは /api/live/basic-info（今の GET basic-info?action=detail を小窓用に削ったもの）。タブを開いたときだけ読む
//   名前は URL に出さない（POST・10-25）。見られるのは管理者と採用の担当だけ（ほかは理由の文が返る）
type Res = {
  answered?: boolean; facts?: [string, string][]; analysis?: { label: string; value: string }[];
  health?: { label: string; value: string }[]; healthError?: string;
  work?: { company: string; from: string; to: string; emp: string; job: string; description: string }[]; note?: string; error?: string;
};

/** person＝人の番号（応募ID）。同姓同名のとき、その人の回答だけを出す（わからなければ氏名で・10-25） */
export function PersonBasic({ name, live, person }: { name: string; live: boolean; person?: string }) {
  const [res, setRes] = useState<Res | null>(null);
  useEffect(() => {
    let on = true;
    setRes(null);
    if (!live) return;   // まだ読めていない＝読み込み中のまま（見本は出さない）
    fetch('/api/live/basic-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, person: person || undefined }) })
      .then(async (r) => (await r.json().catch(() => ({ error: `読めませんでした（${r.status}）` }))) as Res)
      .then((j) => { if (on) setRes(j); })
      .catch((e) => { if (on) setRes({ error: (e as Error).message }); });
    return () => { on = false; };
  }, [name, live, person]);

  if (!res) return <div className="py-10 text-center text-faint">読み込み中…</div>;
  if (res.error) return <div className="py-10 text-center text-bad">{res.error}{res.error.includes('ログイン') && <a href="/api/ike-auth/start" className="ml-2 underline">もう一度ログイン</a>}</div>;
  if (!res.answered) return <div className="py-10 text-center text-faint">{res.note || '基本情報フォームの回答がありません'}</div>;
  return (
    <div className="flex flex-col gap-4">
      {!!res.facts?.length && (
        <dl className="grid grid-cols-2 gap-x-5 gap-y-2.5">
          {res.facts.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-faint">{k}</dt><dd className="whitespace-pre-wrap break-words">{v}</dd></div>)}
        </dl>
      )}
      {(!!res.health?.length || !!res.healthError) && (
        <section>
          <div className="mb-1.5 text-sm font-bold text-muted">健康状況（既往歴）</div>
          {res.healthError
            ? <div className="text-sm text-bad">読めませんでした（{res.healthError}）</div>
            : (
              <dl className="flex flex-col gap-2">
                {res.health!.map((h, i) => <div key={i} className="rounded-lg bg-soft px-3 py-2"><dt className="text-xs text-faint">{h.label}</dt><dd className="mt-0.5 whitespace-pre-wrap break-words text-sm">{h.value}</dd></div>)}
              </dl>
            )}
        </section>
      )}
      {!!res.analysis?.length && (
        <section>
          <div className="mb-1.5 text-sm font-bold text-muted">回答</div>
          <dl className="flex flex-col gap-2">
            {res.analysis.map((a, i) => <div key={i} className="rounded-lg bg-soft px-3 py-2"><dt className="text-xs text-faint">{a.label}</dt><dd className="mt-0.5 whitespace-pre-wrap break-words text-sm">{a.value}</dd></div>)}
          </dl>
        </section>
      )}
      {!!res.work?.length && (
        <section>
          <div className="mb-1.5 text-sm font-bold text-muted">職歴</div>
          <ul className="flex flex-col gap-2">
            {res.work.map((w, i) => (
              <li key={i} className="rounded-lg border border-line px-3 py-2">
                <div className="font-semibold">{w.company || '（会社名なし）'}</div>
                <div className="text-xs text-faint">{[w.from && `${w.from}〜${w.to || ''}`, w.emp, w.job].filter(Boolean).join('・')}</div>
                {w.description && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{w.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
