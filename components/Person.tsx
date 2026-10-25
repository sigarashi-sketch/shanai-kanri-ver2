'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, X } from 'lucide-react';
import { PEOPLE, PROPERS } from '@/lib/sample';
import type { LivePersonView } from '@/lib/live/person';
import type { LiveStaff } from '@/lib/live/staff';
import { DrawerPortal } from './DrawerPortal';
import { PersonChat } from './PersonChat';
import { PersonBasic } from './PersonBasic';

// 人の名前を押すと、どの画面からでも「この人の情報」が右に出る（10-25 shoya「全部共通で人の名前押すとプロパーリストだったり人事だったりの情報見れる」）。
//   ・<PersonName name="…" /> を名前の代わりに置くだけ。押すと window に 'person:open' を投げ、Shell の <PersonHost /> が受けて開く
//   ・形は前の社員ページと同じ（10-25 shoya「営業と人事をタブで分けるんじゃなくて、前の人事のみたいに」）：
//     上に人の情報（社員＝人事の値を先に、要員＝営業の値を足す・タブで分けない）、下の左に「面談メモ／基本情報」、下の右に「チャット」
//     社員ページ・要員ページのボタンは別のタブで開く＝一覧のスクロールが上に戻らない（10-25 shoya「ページボタン押すと更新して上からになるのやめて」）
//     （10-25 shoya「押したら面談メモ、右にチャット置けばいい」「名前クリックしたらチャットと基本情報の回答もだして」）。狭い画面はチャットもタブに
//   ・ログインしていれば本物（/api/live/person・読むだけ）、していなければ見本から名前で探す
const norm = (s: string) => s.replace(/[\s　]+/g, '');

export function PersonName({ name, className, children }: { name: string; className?: string; children?: React.ReactNode }) {
  if (!name || name === '—') return <>{children ?? name}</>;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('person:open', { detail: { name } })); }}
      title="押すとこの人の情報" className={className ?? 'font-semibold underline-offset-2 hover:underline'} style={className ? undefined : { color: 'var(--ad)' }}>
      {children ?? name}
    </button>
  );
}

type Fact = [string, string];
type View = { proper: { id: string; status: string; facts: Fact[]; summary?: string; sukishiUrl?: string } | null; staff: { id: string; status: string; facts: Fact[] } | null };
type Tab = 'memo' | 'basic' | 'chat';
type Got = { name: string; live: boolean; view?: View; error?: string };

function sampleView(name: string): View {
  const p = PROPERS.find((x) => norm(x.name) === norm(name));
  const s = PEOPLE.find((x) => norm(x.name) === norm(name));
  return {
    proper: p ? { id: p.id, status: p.status, facts: [['最寄駅', p.station], ['希望', p.want], ['担当営業', p.sales], ['単価の目安', p.price], ['スキシ', p.sukishi.state]] } : null,
    staff: s ? { id: s.id, status: s.status, facts: [['現場', s.site], ['契約', s.contract], ['最寄駅', s.station], ['単価', s.price], ['担当営業', s.sales], ['採用担当', s.recruiter], ['入社', s.joined]] } : null,
  };
}
function liveView(p: LivePersonView | null, s: LiveStaff | null): View {
  return {
    proper: p ? { id: p.id, status: p.status, facts: p.facts.filter(([, v]) => v && v !== '—'), summary: p.summary, sukishiUrl: p.sukishiUrl } : null,
    staff: s ? { id: s.id, status: s.status, facts: ([['現場', s.site], ['契約', s.contract], ['最寄駅', s.station], ['単価', s.price], ['担当営業', s.sales], ['採用担当', s.recruiter], ['所属', s.company], ['入社', s.joined], ['入場', s.nyuujou]] as Fact[]).filter(([, v]) => v && v !== '—') } : null,
  };
}

/** Shell に1つだけ置く。'person:open' を受けて右にこの人の情報を出す。 */
export function PersonHost() {
  const [got, setGot] = useState<Got | null>(null);
  const [tab, setTab] = useState<Tab>('memo');
  useEffect(() => {
    const open = async (e: Event) => {
      const name = (e as CustomEvent<{ name: string }>).detail?.name;
      if (!name) return;
      setGot({ name, live: false });
      setTab('memo');
      try {
        const r = await fetch('/api/live/person', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        const j = (await r.json()) as { proper?: LivePersonView | null; staff?: LiveStaff | null; error?: string };
        const v = r.status === 401 && j.error === 'not_logged_in' ? { name, live: false, view: sampleView(name) }
          : !r.ok ? { name, live: true, error: j.error || '読めませんでした' }
          : { name, live: true, view: liveView(j.proper ?? null, j.staff ?? null) };
        setGot((g) => (g?.name === name ? v : g));
      } catch (er) { setGot((g) => (g?.name === name ? { name, live: true, error: (er as Error).message } : g)); }
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setGot(null); };
    window.addEventListener('person:open', open);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('person:open', open); window.removeEventListener('keydown', esc); };
  }, []);
  if (!got) return null;
  const v = got.view;
  const ready = !!v || !!got.error;
  // 上の情報：社員（人事）の値を先に、要員（営業）の値で足りないものを足す。長いメモは下の「面談メモ」へ
  const seen = new Set<string>();
  const facts: Fact[] = [];
  for (const [k, val] of [...(v?.staff?.facts ?? []), ...(v?.proper?.facts ?? [])]) {
    if (k === 'メモ' || seen.has(k) || !val) continue;
    seen.add(k); facts.push([k, val]);
  }
  const memo = v?.proper?.facts.find(([k]) => k === 'メモ')?.[1] || '';
  const close = () => setGot(null);
  return (
    <DrawerPortal>
      <div className="fixed inset-0 z-[45]" onClick={close} />
      <aside aria-label={`${got.name} さんの情報`} className="mo-drawer fixed bottom-0 right-0 top-[var(--hdr,58px)] z-[46] flex w-[min(1040px,100vw)] flex-col border-l border-line bg-surface shadow-[-12px_0_28px_rgba(25,27,46,.14)]">
        <section className="border-b border-line px-5 pb-4 pt-4">
          <div className="flex items-start gap-4">
            <div aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full text-[21px] font-bold" style={{ background: 'var(--as)', color: 'var(--ad)', boxShadow: '0 0 0 3px var(--color-surface), 0 0 0 5px var(--al)' }}>{got.name.replace(/[\s　]/g, '').slice(0, 1)}</div>
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] text-faint">{got.live ? '本物のデータ・見るだけ' : '見本データ'}</div>
              <div className="truncate text-[20px] font-bold tracking-tight">{got.name}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {v?.staff && <span className="chip" style={{ background: 'var(--as)', color: 'var(--ad)' }}>社員：{v.staff.status}</span>}
                {v?.proper && <span className="chip">要員：{v.proper.status}</span>}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {v?.staff && <Link href={`/jinji/staff/${encodeURIComponent(v.staff.id)}`} target="_blank" rel="noopener" title="別のタブで開く（この一覧はそのまま）" className="inline-flex min-h-9 items-center gap-1 rounded-[10px] border border-field px-3 text-[12.5px] font-semibold text-muted">社員ページ<ExternalLink size={13} /></Link>}
              {v?.proper && <Link href={`/eigyo/proper/${encodeURIComponent(v.proper.id)}`} target="_blank" rel="noopener" title="別のタブで開く（この一覧はそのまま）" className="inline-flex min-h-9 items-center gap-1 rounded-[10px] border border-field px-3 text-[12.5px] font-semibold text-muted">要員ページ<ExternalLink size={13} /></Link>}
              {v?.proper?.sukishiUrl && <a href={v.proper.sukishiUrl} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center gap-1 rounded-[10px] border border-field px-3 text-[12.5px] font-semibold text-muted">スキシ<ExternalLink size={13} /></a>}
              <button aria-label="閉じる" onClick={close} className="flex size-9 items-center justify-center rounded-[10px] border border-line"><X size={16} /></button>
            </div>
          </div>
          {!ready && <div className="py-4 text-center text-[13px] text-faint">読み込み中…</div>}
          {got.error && <div className="py-4 text-center text-[13px] text-bad">{got.error}{got.error.includes('ログイン') && <a href="/api/ike-auth/start" className="ml-2 underline">もう一度ログイン</a>}</div>}
          {v && !v.staff && !v.proper && <div className="py-4 text-center text-[13px] text-faint">従業員名簿にも要員リストにもいません</div>}
          {facts.length > 0 && (
            <dl className="mt-3 grid max-h-[30vh] grid-cols-2 gap-x-5 gap-y-2 overflow-y-auto text-[13px] sm:grid-cols-4">
              {facts.map(([k, val]) => <div key={k} className="min-w-0"><dt className="text-[11.5px] text-faint">{k}</dt><dd className="break-words">{val}</dd></div>)}
            </dl>
          )}
        </section>
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col md:w-[460px] md:flex-none">
            <div role="tablist" className="flex gap-0.5 border-b border-line px-4 text-[13.5px]">
              {([['memo', '面談メモ'], ['basic', '基本情報'], ['chat', 'チャット']] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`whitespace-nowrap px-3 py-2.5 ${k === 'chat' ? 'md:hidden' : ''}`}
                  style={tab === k ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: 'var(--color-muted)' }}>{l}</button>
              ))}
            </div>
            <div key={tab} className="mo-axis flex-1 overflow-y-auto px-5 py-4 text-[13px]">
              {!ready ? <div className="py-10 text-center text-faint">読み込み中…</div> : <>
                {(tab === 'memo' || tab === 'chat') && <div className={tab === 'chat' ? 'hidden md:block' : ''}>
                  {!memo && !v?.proper?.summary && <div className="py-10 text-center text-faint">面談メモはまだありません</div>}
                  {memo && <p className="whitespace-pre-wrap break-words leading-relaxed">{memo}</p>}
                  {v?.proper?.summary && <div className="mt-4"><div className="text-[11.5px] text-faint">サマリ</div><p className="mt-1 whitespace-pre-wrap rounded-lg bg-soft px-3 py-2 text-[12.5px]">{v.proper.summary}</p></div>}
                </div>}
                {tab === 'basic' && <PersonBasic name={got.name} live={got.live} />}
                {tab === 'chat' && <div className="md:hidden"><PersonChat name={got.name} live={got.live} /></div>}
              </>}
            </div>
          </div>
          <div className="hidden min-w-0 flex-1 flex-col border-l border-line md:flex">
            <div className="flex min-h-[45px] items-center border-b border-line px-5 text-[13.5px] font-bold">チャット</div>
            <div className="flex-1 overflow-y-auto px-5 py-3 text-[13px]">
              {!ready ? <div className="py-10 text-center text-faint">読み込み中…</div> : <PersonChat name={got.name} live={got.live} />}
            </div>
          </div>
        </div>
      </aside>
    </DrawerPortal>
  );
}
