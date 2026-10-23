'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Search, Sparkles, ThumbsUp } from 'lucide-react';
import { AI_SAMPLE, KB, KB_CATS, type KbCat } from '@/lib/kb-sample';
import { PageTitle } from '@/components/ui';
import { useMotivation } from '@/components/Motivation';

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

  const words = q.trim().split(/\s+/).filter(Boolean);
  const list = KB.filter((k) => (cat === 'すべて' || k.cat === cat) && words.every((w) => (k.q + k.a.join('') + k.tags.join(' ')).includes(w)))
    .sort((a, b) => Number(!!b.warn) - Number(!!a.warn) || b.seen - a.seen);

  const help = (id: string) => {
    if (helped[id]) return;
    setHelped((h) => ({ ...h, [id]: true })); hit();
    toast({ text: '「役に立った」を残しました', sub: '→ よく読まれる順の並びに反映しました', undo: () => setHelped((h) => { const n = { ...h }; delete n[id]; return n; }) });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="労務法務ナレッジ" sub="36協定・有給・派遣と準委任・欠勤の扱いなど、よくある質問。一般的な説明の見本です" />

      <div className="mo-fade-up flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-10 flex-1 items-center gap-2 rounded-[10px] border border-field bg-surface px-3">
            <Search size={15} className="text-faint" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setAi(null); }} placeholder="例：残業 上限、有給 5日、準委任 指示" className="w-full bg-transparent text-[13.5px] outline-none" aria-label="ナレッジを検索" />
          </label>
          <button onClick={() => { setAi(AI_SAMPLE); hit(); }} className="btn-primary inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-4 text-[13px] font-bold"><Sparkles size={15} />AIに聞く</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['すべて', ...KB_CATS] as const).map((c) => {
            const n = c === 'すべて' ? KB.length : KB.filter((k) => k.cat === c).length;
            return <button key={c} onClick={() => setCat(c)} className={`min-h-8 rounded-full border px-3 text-[12.5px] ${cat === c ? 'font-semibold' : 'text-muted'}`} style={cat === c ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>{c} {n}</button>;
          })}
        </div>
      </div>

      {ai && (
        <div className="mo-spring-in rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: 'var(--al)', background: 'var(--as)' }}>
          <div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: 'var(--ad)' }}><Sparkles size={14} />AIの答え（見本）{q && `・「${q}」`}</div>
          <p className="mt-1.5">{AI_SAMPLE}</p>
          <p className="mt-1.5 text-[11.5px] text-faint">AIの答えは下書きです。最終判断は社労士・法務に確認してください。</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {list.length === 0 && <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-[13px] text-muted">見つかりませんでした。言葉を減らすか「AIに聞く」を試してください。</div>}
        {list.map((k, i) => {
          const open = openId === k.id;
          return (
            <article key={k.id} className="mo-fade-up overflow-hidden rounded-xl border bg-surface" style={{ ['--i' as string]: i + 2, borderColor: k.warn ? 'var(--color-bad-line)' : 'var(--color-line)' }}>
              <button onClick={() => setOpenId(open ? null : k.id)} className="flex w-full items-center gap-2 px-4 py-3 text-left" aria-expanded={open}>
                {k.warn && <AlertTriangle size={16} className="shrink-0 text-bad" />}
                <span className="text-[14px] font-bold">{k.q}</span>
                <span className="chip ml-auto" style={{ background: 'var(--al)', color: 'var(--ad)' }}>{k.cat}</span>
                <span className="num text-[11.5px] text-faint">{k.seen + (helped[k.id] ? 1 : 0)}人が参考に</span>
              </button>
              {open && (
                <div className="mo-fade-in border-t border-line-soft px-4 py-3">
                  {k.warn && <div className="mo-shake mb-2.5 flex items-start gap-2 rounded-[10px] px-3 py-2 text-[13px] font-bold" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}><AlertTriangle size={16} className="mt-0.5 shrink-0" />{k.warn}</div>}
                  <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13px]">{k.a.map((t) => <li key={t}>{t}</li>)}</ul>
                  <div className="mt-2 flex flex-wrap gap-1">{k.tags.map((t) => <button key={t} onClick={() => setQ(t)} className="rounded-full bg-soft px-2 py-0.5 text-[11.5px] text-muted">#{t}</button>)}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-soft pt-2.5">
                    <span className="text-[11.5px] text-faint">最終判断は社労士・法務に確認してください。</span>
                    <button onClick={() => help(k.id)} disabled={!!helped[k.id]} className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-lg border border-field px-2.5 text-[12px] font-semibold disabled:text-ok"><ThumbsUp size={13} />{helped[k.id] ? '役に立った' : '役に立った？'}</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <p className="text-[11.5px] text-faint">ここの説明は一般的な法律の目安です。会社の 36協定・就業規則・契約書が優先します。法律・労務・税務の最終判断は社労士・税理士・法務に確認してください。</p>
    </main>
  );
}
