'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ExternalLink, X } from 'lucide-react';
import { PEOPLE, PROPERS } from '@/lib/sample';
import type { PersonCandidate, PersonRes } from '@/lib/live/person';
import { Z_POPUP } from '@/lib/layers';
import { Dialog } from './Dialog';
import { StaffDetail } from './StaffDetail';
import { ProperDetail } from './ProperDetail';

// 人の名前を押すと、どの画面からでも「この人の情報」が右に出る（10-25 shoya「全部共通で人の名前押すとプロパーリストだったり人事だったりの情報見れる」）。
//   ・<PersonName name="…" id="…" /> を名前の代わりに置くだけ。押すと window に 'person:open' を投げ、Shell の <PersonHost /> が受けて開く
//     id（社員＝r…／要員＝プロパーリストの行の id）が分かる画面は渡す＝その人をそのまま開く（同姓同名でも選ばせない）
//   ・中身は社員ページそのもの（10-25 shoya「こんな感じに」＝社員ページの画面・「チャットは右タブに」）。
//     従業員名簿にいれば社員ページ（基本情報〜面談メモ・チャット）、いなければ要員ページ（基本・希望条件〜チャット）を小窓の中に出す
//   ・ログインしていれば本物（/api/live/person を1回だけ読み、その返りを中に渡す＝中で読み直さない）、していなければ見本から探す
//   ・同姓同名は実在する（10-21）。名前で2人以上当たったら、採用担当・所属・最寄駅を並べて選んでもらう
//   ・見せてよい中身はロールで決まる（チャット・基本情報＝管理者と採用だけ・単価＝管理者と営業だけ。サーバー側で伏せる）
//   ・窓は Dialog（Escape は一番上の窓だけ閉じる・z は lib/layers.ts＝画面の引き出しより上）
const norm = (s: string) => s.replace(/[\s　]+/g, '');

export function PersonName({ name, id, className, children }: { name: string; id?: string; className?: string; children?: React.ReactNode }) {
  if (!name || name === '—') return <>{children ?? name}</>;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('person:open', { detail: { name, id } })); }}
      title="押すとこの人の情報" className={className ?? 'font-semibold underline-offset-2 hover:underline'} style={className ? undefined : { color: 'var(--ad)' }}>
      {children ?? name}
    </button>
  );
}

type Got = { name: string; id?: string; live: boolean; res?: PersonRes; error?: string; pick?: string };

/** 見本：名前（id があれば id）で見本の名簿・プロパーから探す。社員ページ・要員ページの見本はそれぞれの id で開く */
function sampleRes(name: string, id?: string): PersonRes {
  const staff = PEOPLE.filter((x) => (id ? x.id === id : norm(x.name) === norm(name)));
  const propers = PROPERS.filter((x) => (id ? x.id === id : norm(x.name) === norm(name)));
  const cands: PersonCandidate[] = [
    ...staff.map((s, i): PersonCandidate => ({ key: `s${i}:${s.id}`, name: s.name, staff: { id: s.id } as PersonCandidate['staff'], proper: i === 0 && staff.length === 1 && propers.length === 1 ? { id: propers[0].id } as PersonCandidate['proper'] : null, hint: { recruiter: s.recruiter, company: '', station: s.station } })),
    ...(staff.length === 1 && propers.length === 1 ? [] : propers.map((p): PersonCandidate => ({ key: `p:${p.id}`, name: p.name, staff: null, proper: { id: p.id } as PersonCandidate['proper'], hint: { recruiter: '', company: '', station: p.station } }))),
  ];
  return { ok: true, name, month: '', candidates: cands, everyone: [], can: { chat: true, summary: true, basic: true, price: true } };
}

/** Shell に1つだけ置く。'person:open' を受けて右にこの人の社員ページ（いなければ要員ページ）を出す。 */
export function PersonHost() {
  const [got, setGot] = useState<Got | null>(null);
  useEffect(() => {
    const open = async (e: Event) => {
      const d = (e as CustomEvent<{ name: string; id?: string }>).detail;
      const name = d?.name;
      if (!name) return;
      const id = d.id || undefined;
      const same = (g: Got | null) => g?.name === name && g?.id === id;
      setGot({ name, id, live: false });
      try {
        const r = await fetch('/api/live/person', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, id }) });
        const j = (await r.json().catch(() => ({}))) as Partial<PersonRes> & { error?: string };
        const v: Got = r.status === 401 && j.error === 'not_logged_in' ? { name, id, live: false, res: sampleRes(name, id) }
          : !r.ok || !j.ok ? { name, id, live: true, error: j.error || `読めませんでした（${r.status}）` }
          : { name, id, live: true, res: j as PersonRes };
        setGot((g) => (same(g) ? v : g));
      } catch (er) { setGot((g) => (same(g) ? { name, id, live: true, error: (er as Error).message } : g)); }
    };
    window.addEventListener('person:open', open);
    return () => window.removeEventListener('person:open', open);
  }, []);
  if (!got) return null;
  const close = () => setGot(null);
  const res = got.res;
  const cands = res?.candidates ?? [];
  const many = cands.length > 1;
  const c = cands.length === 1 ? cands[0] : cands.find((x) => x.key === got.pick) ?? null;
  const page = c?.staff ? `/jinji/staff/${encodeURIComponent(c.staff.id)}` : c?.proper ? `/eigyo/proper/${encodeURIComponent(c.proper.id)}` : '';
  return (
    <Dialog label={`${got.name} さんの情報`} onClose={close} z={Z_POPUP}
      className="mo-drawer fixed bottom-0 right-0 top-[var(--hdr,58px)] flex w-[min(1080px,100vw)] flex-col border-l border-line bg-base shadow-[-12px_0_28px_rgba(25,27,46,.14)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2 text-[12.5px]">
        {many && c && <button type="button" onClick={() => setGot({ ...got, pick: undefined })} className="inline-flex min-h-8 items-center gap-0.5 rounded-lg border border-field px-2 font-semibold text-muted"><ChevronLeft size={13} />選び直す</button>}
        <span className="text-faint">{c?.staff ? '社員ページ' : c?.proper ? '要員ページ' : ''}</span>
        {c?.staff && c.proper && <a href={`/eigyo/proper/${encodeURIComponent(c.proper.id)}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--ad)' }}>要員ページ<ExternalLink size={12} /></a>}
        <span className="ml-auto" />
        {page && <a href={page} target="_blank" rel="noopener" title="別のタブで開く（この一覧はそのまま）" className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-field px-2.5 font-semibold text-muted">別タブで開く<ExternalLink size={12} /></a>}
        <button aria-label="閉じる" data-dialog-close onClick={close} className="flex size-8 items-center justify-center rounded-lg border border-line"><X size={15} /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!res && !got.error && <div className="py-16 text-center text-[13px] text-faint">読み込み中…</div>}
        {got.error && <div className="px-4 py-16 text-center text-[13px] text-bad">{got.error}{got.error.includes('ログイン') && <a href="/api/ike-auth/start" className="ml-2 underline">もう一度ログイン</a>}</div>}
        {res?.notMikeiken && <div className="px-4 py-16 text-center text-[13px] text-faint">{got.name} さんは未経験の人ではないので出していません</div>}
        {res && !res.notMikeiken && cands.length === 0 && <div className="px-4 py-16 text-center text-[13px] text-faint">{got.name} さんは従業員名簿にも要員リストにもいません</div>}
        {many && !c && <Chooser name={got.name} cands={cands} onPick={(k) => setGot({ ...got, pick: k })} />}
        {c && res && <Body key={c.key} c={c} res={res} live={got.live} />}
      </div>
    </Dialog>
  );
}

/** 同姓同名のとき：採用担当・所属・最寄駅で見分けて選ぶ */
function Chooser({ name, cands, onPick }: { name: string; cands: PersonCandidate[]; onPick: (key: string) => void }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <b>{name}</b>
        <span className="chip" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }}>同姓同名</span>
        <span className="text-muted">同じ名前の人が{cands.length}人います。採用担当・所属・最寄駅を見て選んでください</span>
      </div>
      <ul className="flex flex-col gap-2">
        {cands.map((x) => (
          <li key={x.key}>
            <button type="button" onClick={() => onPick(x.key)} className="row flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-surface px-4 py-3 text-left text-[13px]">
              <span className="font-bold">{x.name}</span>
              <span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{x.staff ? (x.proper ? '社員・要員' : '社員') : '要員'}</span>
              {x.staff?.status && <span className="text-muted">{x.staff.status}</span>}
              {!x.staff && x.proper?.status && <span className="text-muted">{x.proper.status}</span>}
              <span className="basis-full text-[12px] text-muted sm:basis-auto">採用担当 {x.hint.recruiter || '—'}・所属 {x.hint.company || '—'}・最寄駅 {x.hint.station || '—'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Body({ c, res, live }: { c: PersonCandidate; res: PersonRes; live: boolean }) {
  if (!live) {
    // 見本：社員・要員の見本ページを id で出す
    return c.staff ? <StaffDetail id={c.staff.id} embedded /> : c.proper ? <ProperDetail id={c.proper.id} embedded /> : null;
  }
  if (c.staff) return <StaffDetail id={c.staff.id} embedded initial={{ staff: c.staff, proper: c.proper, month: res.month, everyone: res.everyone, can: res.can }} />;
  if (c.proper) return <ProperDetail id={c.proper.id} embedded initial={{ view: c.proper, everyone: res.everyone, can: res.can }} />;
  return null;
}
