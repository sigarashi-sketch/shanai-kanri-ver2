'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ExternalLink, X } from 'lucide-react';
import { PEOPLE, PROPERS } from '@/lib/sample';
import type { LivePersonView } from '@/lib/live/person';
import type { LiveStaff } from '@/lib/live/staff';
import { DrawerPortal } from './DrawerPortal';
import { PersonChat } from './PersonChat';
import { PersonBasic } from './PersonBasic';

// 人の名前を押すと、どの画面からでも「この人の情報」が右に出る（10-25 shoya「全部共通で人の名前押すとプロパーリストだったり人事だったりの情報見れる」）。
//   ・<PersonName name="…" /> を名前の代わりに置くだけ。押すと window に 'person:open' を投げ、Shell の <PersonHost /> が受けて開く
//   ・タブは「要員（営業）」と「社員（人事）」。どちらにもいれば両方、片方だけならその片方。そこから要員ページ・社員ページへ
//   ・「チャット」「基本情報」のタブも（10-25 shoya「名前クリックしたらチャットと基本情報の回答もだして」）。開いたタブだけ読む
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
type Tab = 'proper' | 'staff' | 'chat' | 'basic';
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
  const [tab, setTab] = useState<Tab>('proper');
  useEffect(() => {
    const open = async (e: Event) => {
      const name = (e as CustomEvent<{ name: string }>).detail?.name;
      if (!name) return;
      setGot({ name, live: false });
      try {
        const r = await fetch('/api/live/person', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        const j = (await r.json()) as { proper?: LivePersonView | null; staff?: LiveStaff | null; error?: string };
        const v = r.status === 401 && j.error === 'not_logged_in' ? { name, live: false, view: sampleView(name) }
          : !r.ok ? { name, live: true, error: j.error || '読めませんでした' }
          : { name, live: true, view: liveView(j.proper ?? null, j.staff ?? null) };
        setGot((g) => (g?.name === name ? v : g));
        setTab(v.view && !v.view.proper && v.view.staff ? 'staff' : 'proper');
      } catch (er) { setGot((g) => (g?.name === name ? { name, live: true, error: (er as Error).message } : g)); }
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setGot(null); };
    window.addEventListener('person:open', open);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('person:open', open); window.removeEventListener('keydown', esc); };
  }, []);
  if (!got) return null;
  const v = got.view;
  const side = tab === 'chat' || tab === 'basic';
  const cur = v && !side ? (tab === 'proper' ? v.proper : v.staff) : null;
  return (
    <DrawerPortal>
      <div className="fixed inset-0 z-[45]" onClick={() => setGot(null)} />
      <aside aria-label={`${got.name} さんの情報`} className="mo-drawer fixed bottom-0 right-0 top-[var(--hdr,58px)] z-[46] flex w-[min(480px,100vw)] flex-col border-l border-line bg-surface shadow-[-12px_0_28px_rgba(25,27,46,.14)]">
        <div className="flex items-center gap-3 px-5 pb-2 pt-4">
          <div aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold" style={{ background: 'var(--as)', color: 'var(--ad)' }}>{got.name.replace(/[\s　]/g, '').slice(0, 1)}</div>
          <div className="min-w-0 flex-1"><div className="truncate text-[17px] font-bold">{got.name}</div><div className="text-[11.5px] text-faint">{got.live ? '本物のデータ・見るだけ' : '見本データ'}</div></div>
          <button aria-label="閉じる" onClick={() => setGot(null)} className="flex size-[34px] items-center justify-center rounded-[10px] border border-line"><X size={16} /></button>
        </div>
        <div role="tablist" className="flex gap-0.5 overflow-x-auto border-b border-line px-4 text-[13.5px]">
          {([['proper', '要員（営業）'], ['staff', '社員（人事）'], ['chat', 'チャット'], ['basic', '基本情報']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="whitespace-nowrap px-2.5 py-2.5"
              style={tab === k ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: 'var(--color-muted)' }}>
              {l}{v && (k === 'proper' || k === 'staff') && !(k === 'proper' ? v.proper : v.staff) && <span className="ml-1 text-[11px] text-faint">なし</span>}
            </button>
          ))}
        </div>
        <div key={tab} className="mo-axis flex-1 overflow-y-auto px-5 py-4 text-[13px]">
          {side && !v && !got.error && <div className="py-10 text-center text-faint">読み込み中…</div>}
          {tab === 'chat' && (v || got.error) && <PersonChat name={got.name} live={got.live} />}
          {tab === 'basic' && (v || got.error) && <PersonBasic name={got.name} live={got.live} />}
          {!side && !v && !got.error && <div className="py-10 text-center text-faint">読み込み中…</div>}
          {!side && got.error && <div className="py-10 text-center text-bad">{got.error}{got.error.includes('ログイン') && <a href="/api/ike-auth/start" className="ml-2 underline">もう一度ログイン</a>}</div>}
          {!side && v && !cur && <div className="py-10 text-center text-faint">{tab === 'proper' ? '要員リスト（プロパー）にはいません' : '従業員名簿にはいません'}</div>}
          {cur && (
            <>
              <span className="chip" style={{ background: 'var(--as)', color: 'var(--ad)' }}>{cur.status}</span>
              <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2.5">
                {cur.facts.map(([k, val]) => <div key={k} className="min-w-0"><dt className="text-[11.5px] text-faint">{k}</dt><dd className="break-words">{val}</dd></div>)}
              </dl>
              {tab === 'proper' && v!.proper?.summary && <div className="mt-4"><div className="text-[11.5px] text-faint">サマリ</div><p className="mt-1 whitespace-pre-wrap rounded-lg bg-soft px-3 py-2 text-[12.5px]">{v!.proper.summary}</p></div>}
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href={tab === 'proper' ? `/eigyo/proper/${encodeURIComponent(cur.id)}` : `/jinji/staff/${encodeURIComponent(cur.id)}`} onClick={() => setGot(null)} className="btn-primary inline-flex min-h-9 items-center gap-1.5 px-3.5 text-[12.5px]">
                  {tab === 'proper' ? '要員ページを開く（チャットも）' : '社員ページを開く'}<ArrowRight size={14} />
                </Link>
                {tab === 'proper' && v!.proper?.sukishiUrl && <a href={v!.proper.sukishiUrl} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-field px-3.5 text-[12.5px] font-semibold text-muted">スキシ<ExternalLink size={13} /></a>}
              </div>
            </>
          )}
        </div>
      </aside>
    </DrawerPortal>
  );
}
