'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Search, Sparkles, ThumbsUp } from 'lucide-react';
import { AI_SAMPLE, KB, KB_CATS, type KbCat } from '@/lib/kb-sample';
import { PageTitle } from '@/components/ui';
import { useMotivation } from '@/components/Motivation';
import { LIVE_WRITE_BLOCKED, LiveBanner, useIke } from '@/components/Live';
import { KbPdf } from './pdf';
import { kbParas, type IkeKbGet, type IkeKbList, type IkeKbSearch } from '@/lib/live/kb';

// 労務法務ナレッジ（労務/営業管理）＝内勤がよく聞かれる労務・契約の質問を検索して読む Q&A。
//   ・カテゴリのチップと検索（質問・答え・タグを探す）。?q= で検索語を入れて開ける
//   ・偽装請負・多重派遣は「やってはいけない」を赤い枠ではっきり出す
//   ・「AIに聞く」は見本の答えを出すだけ（本物の AI にはつながない）。各回答の下に「最終判断は社労士・法務に」
export default function KbPage() {
  const { hit, toast } = useMotivation();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<KbCat | 'すべて'>('すべて');
  const [openId, setOpenId] = useState<string | null>('q5');
  const [helped, setHelped] = useState<Record<string, boolean>>({});
  const [ai, setAi] = useState<string | null>(null);
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
  const lrows = (ike.data?.rows || []).filter((r) => !lcat || r.category === lcat).sort((a, b) => Number(b.published) - Number(a.published) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));

  const words = q.trim().split(/\s+/).filter(Boolean);
  const hitWords = (k: (typeof KB)[number]) => words.every((w) => (k.q + k.a.join('') + k.tags.join(' ')).includes(w));
  const list = KB.filter((k) => (cat === 'すべて' || k.cat === cat) && hitWords(k))
    .sort((a, b) => Number(!!b.warn) - Number(!!a.warn) || b.seen - a.seen);

  const help = (id: string) => {
    if (helped[id]) return;
    setHelped((h) => ({ ...h, [id]: true })); hit();
    toast({ text: '「役に立った」を残しました', sub: '→ 「参考にした人」の数に反映しました', undo: () => setHelped((h) => { const n = { ...h }; delete n[id]; return n; }) });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="労務法務ナレッジ" sub={live ? `今の社内システムに登録した記事（公開 ${ike.data?.counts.published}／全部 ${ike.data?.counts.all}）。よろづや bot はこの公開記事から答えます` : '36協定・有給・派遣と準委任・欠勤の扱いなど、よくある質問。一般的な説明の見本です'} />
      <LiveBanner state={ike.live && !ike.data?.ok ? 'error' : ike.state} error={ike.error || ike.data?.error} onReload={ike.reload} note="見るだけです。記事を書く・公開するは今の社内システムの「労務法務ナレッジ」から。「AIに聞く」は bot と同じ検索で、拾う記事を出します" />
      {live && <KbPdf />}

      <div className="mo-fade-up flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-10 flex-1 items-center gap-2 rounded-[10px] border border-field bg-surface px-3">
            <Search size={15} className="text-faint" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setAi(null); setAsk(''); }} placeholder="例：残業 上限、有給 5日、準委任 指示" className="w-full bg-transparent text-body outline-none" aria-label="ナレッジを検索" />
          </label>
          <button onClick={() => { if (live) setAsk(q.trim()); else { setAi(AI_SAMPLE); hit(); } }} disabled={!q.trim()} title={!q.trim() ? '聞きたいことを左の欄に入れてください' : undefined} className="btn-primary"><Sparkles size={15} />AIに聞く</button>
        </div>
        {live ? <div className="flex flex-wrap gap-1.5">
          {['', ...(ike.data?.categories || [])].map((c) => {
            const n = (ike.data?.rows || []).filter((r) => !c || r.category === c).length;
            return <button key={c || 'all'} onClick={() => setLcat(c)} className={`min-h-8 rounded-full border px-3 text-sm ${lcat === c ? 'font-semibold' : 'text-muted'}`} style={lcat === c ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>{c || 'すべて'} {n}</button>;
          })}
        </div> : <div className="flex flex-wrap gap-1.5">
          {(['すべて', ...KB_CATS] as const).map((c) => {
            const n = KB.filter((k) => (c === 'すべて' || k.cat === c) && hitWords(k)).length;
            return <button key={c} onClick={() => setCat(c)} className={`min-h-8 rounded-full border px-3 text-sm ${cat === c ? 'font-semibold' : 'text-muted'}`} style={cat === c ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>{c} {n}</button>;
          })}
        </div>}
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
            return (
              <article key={k.id} className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: Math.min(i, 20) + 2 }}>
                <button onClick={() => setLopen(open ? null : k.id)} className="flex w-full items-center gap-2 px-4 py-3 text-left" aria-expanded={open}>
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
                      <button disabled title={LIVE_WRITE_BLOCKED} className="btn-secondary ml-auto btn-sm"><ThumbsUp size={13} />役に立った？</button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {!live && ai && (
        <div className="mo-spring-in rounded-xl border px-4 py-3 text-body" style={{ borderColor: 'var(--al)', background: 'var(--as)' }}>
          <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--ad)' }}><Sparkles size={14} />AIの答え（見本）{q && `・「${q}」`}</div>
          <p className="mt-1.5">{AI_SAMPLE}</p>
          <p className="mt-1.5 text-xs text-faint">AIの答えは下書きです。最終判断は社労士・法務に確認してください。</p>
        </div>
      )}

      {!live && <div className="flex flex-col gap-2">
        {list.length === 0 && <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-body text-muted">見つかりませんでした。言葉を減らすか、分類を「すべて」にするか、「AIに聞く」を試してください。</div>}
        {list.map((k, i) => {
          const open = openId === k.id;
          return (
            <article key={k.id} className="mo-fade-up overflow-hidden rounded-xl border bg-surface" style={{ ['--i' as string]: i + 2, borderColor: k.warn ? 'var(--color-bad-line)' : 'var(--color-line)' }}>
              <button onClick={() => setOpenId(open ? null : k.id)} className="flex w-full items-center gap-2 px-4 py-3 text-left" aria-expanded={open}>
                {k.warn && <AlertTriangle size={16} className="shrink-0 text-bad" />}
                <span className="text-body font-bold">{k.q}</span>
                <span className="chip ml-auto" style={{ background: 'var(--al)', color: 'var(--ad)' }}>{k.cat}</span>
                <span className="num whitespace-nowrap text-xs text-faint">{k.seen + (helped[k.id] ? 1 : 0)}人が参考に</span>
              </button>
              {open && (
                <div className="mo-fade-in border-t border-line-soft px-4 py-3">
                  {k.warn && <div className="mo-shake mb-2.5 flex items-start gap-2 rounded-[10px] px-3 py-2 text-body font-bold" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}><AlertTriangle size={16} className="mt-0.5 shrink-0" />{k.warn}</div>}
                  <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body">{k.a.map((t) => <li key={t}>{t}</li>)}</ul>
                  <div className="mt-2 flex flex-wrap gap-1">{k.tags.map((t) => <button key={t} onClick={() => { setQ(t); setCat('すべて'); setAi(null); }} className="rounded-full bg-soft px-2 py-0.5 text-xs text-muted">#{t}</button>)}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-soft pt-2.5">
                    <span className="text-xs text-faint">最終判断は社労士・法務に確認してください。</span>
                    <button onClick={() => help(k.id)} disabled={!!helped[k.id]} className="btn-secondary ml-auto disabled:text-ok btn-sm"><ThumbsUp size={13} />{helped[k.id] ? '役に立った' : '役に立った？'}</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>}
      <p className="text-xs text-faint">ここの説明は一般的な法律の目安です。会社の 36協定・就業規則・契約書が優先します。法律・労務・税務の最終判断は社労士・税理士・法務に確認してください。</p>
    </main>
  );
}
