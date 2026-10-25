'use client';

import { useEffect, useState } from 'react';

// 名前の小窓の「基本情報」タブ（10-25 shoya）。基本情報フォームの回答（健康・連絡先・住所・生年月日は出さない）を読むだけ
//   読むのは /api/live/basic-info（今の GET basic-info?action=detail&health=0 を小窓用に削ったもの）。タブを開いたときだけ読む
//   名前は URL に出さない（POST・10-25）。見られるのは管理者と採用の担当だけ（ほかは理由の文が返る）
type Res = {
  answered?: boolean; facts?: [string, string][]; analysis?: { label: string; value: string }[];
  work?: { company: string; from: string; to: string; emp: string; job: string; description: string }[]; note?: string; error?: string;
};
const SAMPLE: Res = {
  answered: true,
  facts: [['よみがな', 'みほん たろう'], ['年齢', '24'], ['最寄駅', '見本駅'], ['最終学歴', '高校卒業'], ['使えるツール', 'Excel・Word'], ['夜勤', '可'], ['出張', '不可']],
  analysis: [{ label: '仕事で大事にしたいこと', value: '成長できる環境（見本）' }, { label: '希望の働き方', value: '日勤・土日休み（見本）' }],
  work: [{ company: '見本商事', from: '2022-04', to: '2025-03', emp: '正社員', job: '販売', description: '店舗での接客と在庫管理（見本）' }],
};

/** person＝人の番号（応募ID）。同姓同名のとき、その人の回答だけを出す（わからなければ氏名で・10-25） */
export function PersonBasic({ name, live, person }: { name: string; live: boolean; person?: string }) {
  const [res, setRes] = useState<Res | null>(null);
  useEffect(() => {
    let on = true;
    setRes(null);
    if (!live) { setRes(SAMPLE); return; }
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
      {!live && <span className="chip self-start">見本</span>}
      {!!res.facts?.length && (
        <dl className="grid grid-cols-2 gap-x-5 gap-y-2.5">
          {res.facts.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-[11.5px] text-faint">{k}</dt><dd className="whitespace-pre-wrap break-words">{v}</dd></div>)}
        </dl>
      )}
      {!!res.analysis?.length && (
        <section>
          <div className="mb-1.5 text-[12px] font-bold text-muted">回答</div>
          <dl className="flex flex-col gap-2">
            {res.analysis.map((a, i) => <div key={i} className="rounded-lg bg-soft px-3 py-2"><dt className="text-[11.5px] text-faint">{a.label}</dt><dd className="mt-0.5 whitespace-pre-wrap break-words text-[12.5px]">{a.value}</dd></div>)}
          </dl>
        </section>
      )}
      {!!res.work?.length && (
        <section>
          <div className="mb-1.5 text-[12px] font-bold text-muted">職歴</div>
          <ul className="flex flex-col gap-2">
            {res.work.map((w, i) => (
              <li key={i} className="rounded-lg border border-line px-3 py-2">
                <div className="font-semibold">{w.company || '（会社名なし）'}</div>
                <div className="text-[11.5px] text-faint">{[w.from && `${w.from}〜${w.to || ''}`, w.emp, w.job].filter(Boolean).join('・')}</div>
                {w.description && <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px]">{w.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
