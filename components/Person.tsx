'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { PEOPLE, PROPERS } from '@/lib/sample';
import type { LivePersonView } from '@/lib/live/person';
import type { LiveStaff } from '@/lib/live/staff';
import { DrawerPortal } from './DrawerPortal';
import { StaffDetail } from './StaffDetail';
import { ProperDetail } from './ProperDetail';

// 人の名前を押すと、どの画面からでも「この人の情報」が右に出る（10-25 shoya「全部共通で人の名前押すとプロパーリストだったり人事だったりの情報見れる」）。
//   ・<PersonName name="…" /> を名前の代わりに置くだけ。押すと window に 'person:open' を投げ、Shell の <PersonHost /> が受けて開く
//   ・中身は社員ページそのもの（10-25 shoya「こんな感じに」＝社員ページの画面・「チャットは右タブに」）。
//     従業員名簿にいれば社員ページ（基本情報〜面談メモ・チャット）、いなければ要員ページ（基本・希望条件〜チャット）を小窓の中に出す
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

/** Shell に1つだけ置く。'person:open' を受けて右にこの人の社員ページ（いなければ要員ページ）を出す。 */
export function PersonHost() {
  const [got, setGot] = useState<Got | null>(null);
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
      } catch (er) { setGot((g) => (g?.name === name ? { name, live: true, error: (er as Error).message } : g)); }
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setGot(null); };
    window.addEventListener('person:open', open);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('person:open', open); window.removeEventListener('keydown', esc); };
  }, []);
  if (!got) return null;
  const v = got.view;
  const close = () => setGot(null);
  const page = v?.staff ? `/jinji/staff/${encodeURIComponent(v.staff.id)}` : v?.proper ? `/eigyo/proper/${encodeURIComponent(v.proper.id)}` : '';
  return (
    <DrawerPortal>
      <div className="fixed inset-0 z-[45] bg-black/20" onClick={close} />
      <aside aria-label={`${got.name} さんの情報`} className="mo-drawer fixed bottom-0 right-0 top-[var(--hdr,58px)] z-[46] flex w-[min(1080px,100vw)] flex-col border-l border-line bg-base shadow-[-12px_0_28px_rgba(25,27,46,.14)]">
        <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2 text-[12.5px]">
          <span className="text-faint">{v?.staff ? '社員ページ' : v?.proper ? '要員ページ' : ''}</span>
          {v?.staff && v.proper && <a href={`/eigyo/proper/${encodeURIComponent(v.proper.id)}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--ad)' }}>要員ページ<ExternalLink size={12} /></a>}
          <span className="ml-auto" />
          {page && <a href={page} target="_blank" rel="noopener" title="別のタブで開く（この一覧はそのまま）" className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-field px-2.5 font-semibold text-muted">別タブで開く<ExternalLink size={12} /></a>}
          <button aria-label="閉じる" onClick={close} className="flex size-8 items-center justify-center rounded-lg border border-line"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!v && !got.error && <div className="py-16 text-center text-[13px] text-faint">読み込み中…</div>}
          {got.error && <div className="py-16 text-center text-[13px] text-bad">{got.error}{got.error.includes('ログイン') && <a href="/api/ike-auth/start" className="ml-2 underline">もう一度ログイン</a>}</div>}
          {v && !v.staff && !v.proper && <div className="py-16 text-center text-[13px] text-faint">{got.name} さんは従業員名簿にも要員リストにもいません</div>}
          {v?.staff ? <StaffDetail key={v.staff.id} id={v.staff.id} embedded /> : v?.proper ? <ProperDetail key={v.proper.id} id={v.proper.id} embedded /> : null}
        </div>
      </aside>
    </DrawerPortal>
  );
}
