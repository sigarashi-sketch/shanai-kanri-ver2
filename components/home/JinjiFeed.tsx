'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Building2, ChevronLeft, ChevronRight, DoorOpen, Flag, Heart, MessageCircle, NotebookPen, Repeat, Signpost, Smartphone, Users, X, type LucideIcon } from 'lucide-react';
import { PageTitle } from '@/components/ui';
import { PersonName } from '@/components/Person';
import { useMotivation } from '@/components/Motivation';
import { LiveBanner } from '@/components/Live';
import FeedScene, { clothOf } from '@/components/FeedScene';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { TYPE_LABEL, jstDay, type FeedPost, type FeedType, type HomeJinjiData } from '@/lib/types/jinji';

// ホーム人事：要員の動きを Instagram 風に。上＝ストーリー（種類ごとの丸。押すと全画面で1人ずつ送る）、下＝フィード（絵つきの投稿）。
//   見える範囲：管理者・人事は全員分、営業は自分が担当営業の人だけ（本物はサーバ側 /api/live/home-jinji で絞る）。出すのは未経験（プロパーリストにいる人）だけ
//   いいね・ひとことの反応は画面の中だけ（誰にも届かない・どこにも残らない）
const ICON: Record<FeedType, LucideIcon> = {
  shoudaku: BadgeCheck, sankaku: Flag, debut: Building2, mendan: Users, teiki: MessageCircle, jitai: Signpost, taisha: DoorOpen, reassign: Repeat, line: Smartphone, memo: NotebookPen,
};
const TONE: Record<FeedType, string> = { shoudaku: 'info', sankaku: 'caution', debut: 'ok', mendan: 'purple', teiki: 'info', jitai: 'mute', taisha: 'mute', reassign: 'warn', line: 'ok', memo: 'caution' };
const CHEERS = ['おめでとう', 'ナイス', 'がんばれ', '見ました'];

type Story = { key: string; label: string; type: FeedType; slides: { post: FeedPost; name: string }[] };
function buildStories(posts: FeedPost[], today: string): Story[] {
  const pick = (key: string, label: string, type: FeedType, f: (p: FeedPost) => boolean): Story => ({
    key, label, type, slides: posts.filter((p) => p.type === type && f(p)).flatMap((p) => p.people.map((x) => ({ post: p, name: x.name }))),
  });
  const all = () => true;
  return [
    pick('in', '今日入場', 'debut', (p) => jstDay(p.at) === today),
    pick('iv', '今日面談', 'mendan', (p) => jstDay(p.at) === today),
    pick('sh', '今週の承諾', 'shoudaku', all),
    pick('sk', '参画決定', 'sankaku', all),
    pick('tk', '定期面談', 'teiki', all),
    pick('ra', '再アサイン', 'reassign', all),
    pick('jt', '辞退', 'jitai', all),
    pick('ts', '退社', 'taisha', all),
  ].filter((s) => s.slides.length);
}
const ago = (iso: string, now: number) => {
  const m = Math.round((now - Date.parse(iso)) / 60000);
  if (m < 0) return `今日 ${new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(11, 16)}〜`;
  if (m < 60) return `${Math.max(1, m)}分前`;
  if (m < 60 * 24) return `${Math.round(m / 60)}時間前`;
  return `${Math.round(m / 1440)}日前`;
};

export default function JinjiFeed({ title = 'ホーム人事' }: { title?: string }) {
  const { toast } = useMotivation();
  const lv = useLiveRoute<HomeJinjiData>('/api/live/home-jinji');
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); }, []);

  const live = lv.live && lv.data ? lv.data : null;
  const posts = useMemo(() => live?.posts ?? [], [live]);
  const scope = live ? live.scope : 'all';

  const today = now ? jstDay(new Date(now).toISOString()) : '';
  const stories = useMemo(() => buildStories(posts, today), [posts, today]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<{ s: number; i: number } | null>(null);
  const [filter, setFilter] = useState<FeedType | 'all'>('all');
  const [likes, setLikes] = useState<Record<string, number>>({});
  const [cheer, setCheer] = useState<Record<string, string>>({});
  const [pop, setPop] = useState<string | null>(null);
  const [told, setTold] = useState(false);

  const like = (id: string) => {
    setLikes((m) => ({ ...m, [id]: m[id] ? 0 : 1 }));
    if (!likes[id]) { setPop(id); setTimeout(() => setPop((x) => (x === id ? null : x)), 800); }
    if (!told) { setTold(true); toast({ text: '反応しました', sub: '→ この画面の中だけ（誰にも届かず、どこにも残りません）' }); }
  };
  const types = [...new Set(posts.map((p) => p.type))];
  const shown = filter === 'all' ? posts : posts.filter((p) => p.type === filter);

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4 px-1 py-2">
      <PageTitle title={title} sub={scope === 'mine' ? `${live?.me || 'あなた'}さんが担当営業の人だけ・直近7日` : '未経験の人の動き・直近7日'} />
      <LiveBanner state={lv.state} error={lv.error} onReload={lv.reload}
        note={`本物のデータ（承諾・参画決定・辞退・現場デビュー・現場面談・退社・定期面談・メモ・再アサイン・採用LINEの友だち追加）。${scope === 'mine' ? '担当営業があなたの人だけ。' : ''}反応は画面の中だけです`} />
      {live?.warnings.map((w) => <div key={w} className="rounded-xl border border-line bg-soft px-4 py-2 text-sm text-muted">{w}</div>)}

      {/* ストーリー */}
      <div className="mo-fade-up flex gap-3.5 overflow-x-auto rounded-2xl border border-line bg-surface px-4 py-3.5">
        {stories.length === 0 && <div className="py-3 text-sm text-faint">{lv.state === 'loading' ? '読み込み中…' : 'いまは新しい動きはありません'}</div>}
        {stories.map((s, k) => {
          const Icon = ICON[s.type]; const done = seen.has(s.key);
          return (
            <button key={s.key} onClick={() => { setOpen({ s: k, i: 0 }); setSeen((x) => new Set(x).add(s.key)); }} className="mo-spring-in flex w-[72px] shrink-0 flex-col items-center gap-1.5" style={{ ['--i' as string]: k }}>
              <span className="relative flex size-[62px] items-center justify-center rounded-full p-[3px]" style={{ background: done ? 'var(--color-line)' : 'conic-gradient(var(--a), var(--tone-bad-fg), var(--tone-warn-fg), var(--a))' }}>
                <span className="flex size-full items-center justify-center rounded-full border-2 border-surface" style={{ background: `var(--tone-${TONE[s.type]}-bg)`, color: `var(--tone-${TONE[s.type]}-fg)` }}><Icon size={24} strokeWidth={1.8} /></span>
                <span className="num absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-surface px-1.5 text-xs font-bold" style={{ background: 'var(--a)', color: 'var(--ao)' }}>{s.slides.length}</span>
              </span>
              <span className={`truncate text-xs ${done ? 'text-faint' : 'font-semibold'}`}>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* 種類で絞る（画面の中だけ） */}
      {types.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {(['all', ...types] as const).map((t) => (
            <button key={t} onClick={() => setFilter(t)} className="chip" style={filter === t ? { background: 'var(--a)', color: 'var(--ao)' } : undefined}>{t === 'all' ? 'すべて' : TYPE_LABEL[t]}</button>
          ))}
        </div>
      )}

      {/* フィード */}
      {live && shown.length === 0 && (
        <div className="rounded-2xl border border-line bg-surface px-5 py-10 text-center text-body text-muted">直近7日に{scope === 'mine' ? 'あなたが担当の人の' : ''}動きはありませんでした。静かな1週間です。</div>
      )}
      {shown.map((p, k) => <PostCard key={p.id} p={p} k={k} now={now} liked={!!likes[p.id]} pop={pop === p.id} cheer={cheer[p.id]} onLike={() => like(p.id)} onCheer={(c) => { setCheer((m) => ({ ...m, [p.id]: m[p.id] === c ? '' : c })); if (!told) { setTold(true); toast({ text: '反応しました', sub: '→ この画面の中だけ（誰にも届かず、どこにも残りません）' }); } }} />)}

      {live && live.missing.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <div className="text-sm text-muted">定期面談・メモ・再アサイン・採用LINEの友だち追加を読めませんでした（この種類は出していません）</div>
        </div>
      )}

      {open && stories[open.s] && <StoryViewer stories={stories} at={open} now={now} onMove={(s, i) => { if (stories[s]) setSeen((x) => new Set(x).add(stories[s].key)); setOpen({ s, i }); }} onClose={() => setOpen(null)} />}
    </div>
  );
}

function PostCard({ p, k, now, liked, pop, cheer, onLike, onCheer }: { p: FeedPost; k: number; now: number; liked: boolean; pop: boolean; cheer?: string; onLike: () => void; onCheer: (c: string) => void }) {
  const Icon = ICON[p.type]; const lead = p.people[0]?.name || '';
  return (
    <article className="mo-fade-up overflow-hidden rounded-2xl border border-line bg-surface" style={{ ['--i' as string]: k }}>
      <header className="flex items-center gap-2.5 px-4 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-body font-bold" style={{ background: clothOf(lead), color: 'var(--color-surface)' }}>{p.people.length > 1 ? p.people.length : lead.slice(0, 1)}</span>
        <div className="min-w-0 flex-1 text-body leading-tight">
          <div className="truncate">{p.people.length === 1 ? <PersonName name={lead} /> : <b>{p.people.length}人</b>}</div>
          <div className="text-xs text-faint">{p.sub || TYPE_LABEL[p.type]}{now ? ` ・ ${ago(p.at, now)}` : ''}</div>
        </div>
        <span className="chip" style={{ background: `var(--tone-${TONE[p.type]}-bg)`, color: `var(--tone-${TONE[p.type]}-fg)` }}><Icon size={12} />{TYPE_LABEL[p.type]}</span>
      </header>
      <div className="relative" onDoubleClick={() => !liked && onLike()}>
        <FeedScene type={p.type} names={p.people.map((x) => x.name)} total={p.people.length} />
        {pop && <Heart className="hj-heart absolute left-1/2 top-1/2 -ml-10 -mt-10" size={80} fill="var(--tone-bad-fg)" stroke="var(--color-surface)" />}
      </div>
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onLike} aria-label="いいね" title="反応は画面の中だけ"><Heart size={22} strokeWidth={1.8} fill={liked ? 'var(--tone-bad-fg)' : 'none'} style={{ color: liked ? 'var(--tone-bad-fg)' : 'var(--color-ink)' }} /></button>
          <div className="flex flex-wrap gap-1">
            {CHEERS.map((c) => <button key={c} onClick={() => onCheer(c)} className="chip text-xs" style={cheer === c ? { background: 'var(--as)', color: 'var(--ad)' } : undefined}>{c}</button>)}
          </div>
        </div>
        <div className="text-body">{p.text}</div>
        {p.people.length > 1 && <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-sm">{p.people.map((x) => <PersonName key={x.name} name={x.name} />)}</div>}
        {p.details?.map((d) => <div key={d.k} className="text-sm text-muted"><b className="text-ink">{d.k}</b>　{d.v}</div>)}
      </div>
    </article>
  );
}

function StoryViewer({ stories, at, now, onMove, onClose }: { stories: Story[]; at: { s: number; i: number }; now: number; onMove: (s: number, i: number) => void; onClose: () => void }) {
  const st = stories[at.s]; const sl = st.slides[at.i];
  const next = useCallback(() => { if (at.i + 1 < st.slides.length) onMove(at.s, at.i + 1); else if (at.s + 1 < stories.length) onMove(at.s + 1, 0); else onClose(); }, [at, st, stories, onMove, onClose]);
  const prev = useCallback(() => { if (at.i > 0) onMove(at.s, at.i - 1); else if (at.s > 0) onMove(at.s - 1, stories[at.s - 1].slides.length - 1); }, [at, stories, onMove]);
  const [hold, setHold] = useState(false);
  useEffect(() => { if (hold) return; const t = setTimeout(next, 5000); return () => clearTimeout(t); }, [next, hold]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [next, prev, onClose]);
  const Icon = ICON[st.type];
  return (
    <div className="mo-fade-in fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'color-mix(in srgb, var(--color-ink) 86%, transparent)' }} onClick={onClose}>
      <div className="mo-scale-in relative w-full max-w-[400px] overflow-hidden rounded-2xl bg-surface" onClick={(e) => e.stopPropagation()}
        onPointerDown={() => setHold(true)} onPointerUp={() => setHold(false)} onPointerLeave={() => setHold(false)}>
        <div className="flex gap-1 px-3 pt-3">
          {st.slides.map((_, i) => (
            <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-sunken">
              {i < at.i && <i className="block h-full" style={{ background: 'var(--a)' }} />}
              {i === at.i && <i key={`${at.s}-${at.i}`} className="hj-story-bar block h-full" style={{ background: 'var(--a)', animationDuration: '5s', animationPlayState: hold ? 'paused' : 'running' }} />}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 text-body">
          <span className="flex size-7 items-center justify-center rounded-full" style={{ background: `var(--tone-${TONE[st.type]}-bg)`, color: `var(--tone-${TONE[st.type]}-fg)` }}><Icon size={15} /></span>
          <b>{st.label}</b><span className="num text-faint">{at.i + 1}/{st.slides.length}</span>
          <button onClick={onClose} className="ml-auto rounded-md p-1 text-muted" aria-label="閉じる"><X size={18} /></button>
        </div>
        <div className="relative">
          <FeedScene type={sl.post.type} names={[sl.name]} total={1} />
          <button aria-label="前へ" onClick={prev} className="absolute inset-y-0 left-0 flex w-1/3 items-center pl-1 text-muted opacity-0 hover:opacity-100"><ChevronLeft size={26} /></button>
          <button aria-label="次へ" onClick={next} className="absolute inset-y-0 right-0 flex w-2/3 items-center justify-end pr-1 text-muted opacity-0 hover:opacity-100"><ChevronRight size={26} /></button>
        </div>
        <div className="flex flex-col gap-1 px-5 py-4">
          <div className="text-lg"><PersonName name={sl.name} /></div>
          <div className="text-body">{sl.post.text}</div>
          <div className="text-sm text-faint">{sl.post.sub}{now ? `${sl.post.sub ? ' ・ ' : ''}${ago(sl.post.at, now)}` : ''}</div>
        </div>
      </div>
    </div>
  );
}
