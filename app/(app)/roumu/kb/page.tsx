'use client';

import { useEffect, useState } from 'react';
import { OctagonAlert, Search, Sparkles, ThumbsUp } from 'lucide-react';
import { PageTitle } from '@/components/ui';
import { useMotivation } from '@/components/Motivation';
import { LiveBanner, useIke } from '@/components/Live';
import { setMark, useMarks } from '@/lib/live/roumu';
import { KbPdf } from './pdf';
import { kbDont, kbParas, type IkeKbGet, type IkeKbList, type IkeKbSearch } from '@/lib/live/kb';

// 労務法務ナレッジ（労務/営業管理）＝内勤がよく聞かれる労務・契約の質問を検索して読む Q&A。
//   ・カテゴリのチップと検索（質問・答え・タグを探す）。?q= で検索語を入れて開ける
//   ・偽装請負・多重派遣などは「やってはいけない」を赤い枠ではっきり出す（タグ「やってはいけない」「禁止」か題名で見分ける＝lib/live/kb.ts kbDont）
//   ・本物の「役に立った」は今のシステムの印（roumu_marks kind=kb-helpful・記事ごとに1つ・もう一度押すと外す・10-26）
//   ・「AIに聞く」は bot と同じ検索で拾う記事を出す。各回答の下に「最終判断は社労士・法務に」
export default function KbPage() {
  const { hit, toast } = useMotivation();
  const [q, setQ] = useState('');
  useEffect(() => { const v = new URLSearchParams(window.location.search).get('q'); if (v) setQ(v); }, []);
  // 本物：検索語は打ち終わって 400ms 待ってから今のシステムに渡す（本文まで探すのは今のシステム側）
  const [qq, setQq] = useState('');
  useEffect(() => { const t = setTimeout(() => setQq(q.trim()), 400); return () => clearTimeout(t); }, [q]);
  const [lcat, setLcat] = useState('');
  const [lopen, setLopen] = useState<string | null>(null);
  const [ask, setAsk] = useState('');
  const ike = useIke<IkeKbList>(`kb?action=list${qq ? `&q=${encodeURIComponent(qq)}` : ''}`);
  const live = ike.live && !!ike.data?.ok;
  const art = useIke<IkeKbGet>(live && lopen ? `kb?action=get&id=${encodeURIComponent(lopen)}` : null);
  const srch = useIke<IkeKbSearch>(live && ask ? `kb?action=testSearch&q=${encodeURIComponent(ask)}` : null);
  const helpMarks = useMarks(['kb-helpful'], undefined, live);
  const toggleHelp = async (id: string, title: string) => {
    const on = !!helpMarks.get('kb-helpful', id);
    try { await setMark('kb-helpful', id, on ? '' : '役に立った'); helpMarks.reload(); if (!on) { hit(); toast({ text: `「${title}」に役に立ったを付けました`, sub: '→ よく使われる記事として残ります', undo: () => { setMark('kb-helpful', id, '').then(() => helpMarks.reload()); } }); } }
    catch (e) { toast({ text: '付けられませんでした', sub: (e as Error).message }); }
  };
  const lrows = (ike.data?.rows || []).filter((r) => !lcat || r.category === lcat).sort((a, b) => Number(b.published) - Number(a.published) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));


  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="労務法務ナレッジ" sub={live ? `今の社内システムに登録した記事（公開 ${ike.data?.counts.published}／全部 ${ike.data?.counts.all}）。よろづや bot はこの公開記事から答えます` : '今の社内システムに登録した記事。よろづや bot はこの公開記事から答えます'} />
      <LiveBanner state={ike.live && !ike.data?.ok ? 'error' : ike.state} error={ike.error || ike.data?.error} onReload={ike.reload} note="見るだけです。記事を書く・公開するは今の社内システムの「労務法務ナレッジ」から。「AIに聞く」は bot と同じ検索で、拾う記事を出します" />
      {live && <KbPdf />}

      <div className="mo-fade-up flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-10 flex-1 items-center gap-2 rounded-[10px] border border-field bg-surface px-3">
            <Search size={15} className="text-faint" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setAsk(''); }} placeholder="例：残業 上限、有給 5日、準委任 指示" className="w-full bg-transparent text-body outline-none" aria-label="ナレッジを検索" />
          </label>
          <button onClick={() => setAsk(q.trim())} disabled={!live || !q.trim()} title={!live ? '記事を読み込んでから使えます' : !q.trim() ? '聞きたいことを左の欄に入れてください' : undefined} className="btn-primary"><Sparkles size={15} />AIに聞く</button>
        </div>
        {live ? <div className="flex flex-wrap gap-1.5">
          {['', ...(ike.data?.categories || [])].map((c) => {
            const n = (ike.data?.rows || []).filter((r) => !c || r.category === c).length;
            return <button key={c || 'all'} onClick={() => setLcat(c)} className={`min-h-8 rounded-full border px-3 text-sm ${lcat === c ? 'font-semibold' : 'text-muted'}`} style={lcat === c ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>{c || 'すべて'} {n}</button>;
          })}
        </div> : null}
      </div>

      {live && ask && (
        <div className="mo-spring-in rounded-xl border px-4 py-3 text-body" style={{ borderColor: 'var(--al)', background: 'var(--as)' }}>
          <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--ad)' }}><Sparkles size={14} />「{ask}」で bot が拾う記事</div>
          {srch.state === 'loading' ? <p className="mt-1.5 text-muted">探しています…</p> : srch.data?.hits?.length ? (
            <ul className="mt-1.5 flex flex-col gap-1">{srch.data.hits.map((h) => <li key={h.id}><button onClick={() => setLopen(h.id)} className="font-semibold hover:underline">{h.title}</button><span className="ml-2 text-xs text-faint">{h.category}・{h.company}</span></li>)}</ul>
          ) : <p className="mt-1.5">{srch.data?.note || srch.error || '見つかりませんでした'}</p>}
          <p className="mt-1.5 text-xs text-faint">bot の答えは下書きです。最終判断は社労士・法務に確認してください。</p>
        </div>
      )}

      {live && (
        <div className="flex flex-col gap-2">
          {lrows.length === 0 && <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-body text-muted">見つかりませんでした。言葉を減らすか、分類を「すべて」にしてください。</div>}
          {lrows.map((k, i) => {
            const open = lopen === k.id;
            const a = open && art.data?.ok ? art.data.article : null;
            const dont = kbDont(k);
            return (
              <article key={k.id} className={`mo-fade-up overflow-hidden rounded-xl border bg-surface ${dont ? 'border-2' : 'border-line'}`} style={{ ['--i' as string]: Math.min(i, 20) + 2, ...(dont ? { borderColor: 'var(--color-bad)' } : {}) }}>
                <button onClick={() => setLopen(open ? null : k.id)} className="flex w-full items-center gap-2 px-4 py-3 text-left" aria-expanded={open}>
                  {dont && <span className="chip inline-flex items-center gap-1 font-bold" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}><OctagonAlert size={12} />やってはいけない</span>}
                  <span className="text-body font-bold">{k.title}</span>
                  {!k.published && <span className="chip" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }}>下書き</span>}
                  <span className="chip ml-auto" style={{ background: 'var(--al)', color: 'var(--ad)' }}>{k.category}</span>
                  <span className="whitespace-nowrap text-xs text-faint">{k.company}</span>
                </button>
                {open && (
                  <div className="mo-fade-in border-t border-line-soft px-4 py-3">
                    {!a ? <p className="text-body text-muted">{art.state === 'error' ? art.error : art.data && !art.data.ok ? art.data.error : '読み込み中…'}</p>
                      : <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body">{kbParas(a.body).map((t, j) => <li key={j}>{t}</li>)}</ul>}
                    <div className="mt-2 flex flex-wrap gap-1">{k.tags.map((t) => <button key={t} onClick={() => { setQ(t); setLcat(''); setAsk(''); }} className="rounded-full bg-soft px-2 py-0.5 text-xs text-muted">#{t}</button>)}</div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-soft pt-2.5">
                      <span className="text-xs text-faint">最終判断は社労士・法務に確認してください。{k.source && `出どころ：${k.source}`}</span>
                      {helpMarks.get('kb-helpful', k.id)
                        ? <button onClick={() => toggleHelp(k.id, k.title)} title="もう一度押すと外します" className="btn-secondary ml-auto btn-sm" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}><ThumbsUp size={13} />役に立った</button>
                        : <button onClick={() => toggleHelp(k.id, k.title)} className="btn-secondary ml-auto btn-sm"><ThumbsUp size={13} />役に立った？</button>}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {!live && <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-body text-muted">{ike.state === 'loading' ? '読み込み中…' : '記事を読めませんでした'}</div>}
      <p className="text-xs text-faint">ここの説明は一般的な法律の目安です。会社の 36協定・就業規則・契約書が優先します。法律・労務・税務の最終判断は社労士・税理士・法務に確認してください。</p>
    </main>
  );
}
