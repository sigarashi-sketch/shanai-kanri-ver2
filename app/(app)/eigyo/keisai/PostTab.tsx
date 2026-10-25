'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, Lock, Pencil, Plus, RefreshCw, Send, TriangleAlert, X } from 'lucide-react';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import { LiveBanner, useIke } from '@/components/Live';
import { postLive } from '@/lib/live/post-live';
import { sampleCaseFull, sampleCaseList } from '@/lib/mendan-sample';
import {
  CASE_AREAS, CASE_AUDIENCES, CASE_BADGES, CASE_JOBS, CASE_TEMPLATES, CASE_WORK_STYLES, detectPrice,
  type CaseGetResp, type CaseListResp, type CasePostFull,
} from '@/lib/live/keisai';

type F = {
  id: string | null; status: string; title: string; bodyText: string; area: string; station: string; job: string; workStyles: string[]; badges: string[];
  startText: string; headcount: string; audience: string; pinned: boolean; closeOn: string; slackPermalink: string;
};
const EMPTY: F = { id: null, status: '', title: '', bodyText: '', area: '', station: '', job: '', workStyles: [], badges: [], startText: '', headcount: '', audience: 'all', pinned: false, closeOn: '', slackPermalink: '' };
const fromItem = (x: CasePostFull): F => ({
  id: x.id, status: x.status, title: x.title || '', bodyText: x.body_text || '', area: x.area || '', station: x.station || '', job: x.job || '',
  workStyles: x.work_styles || [], badges: x.badges || [], startText: x.start_text || '', headcount: x.headcount ? String(x.headcount) : '',
  audience: x.audience || 'all', pinned: !!x.pinned, closeOn: x.close_on ? String(x.close_on).slice(0, 10) : '', slackPermalink: x.slack_permalink || '',
});
const LIST_TABS = [{ k: 'open', label: '公開中' }, { k: 'draft', label: '下書き' }, { k: 'closed', label: '締切・非公開' }] as const;
const STATUS_LABEL: Record<string, string> = { open: '公開中', draft: '下書き', closed: '締切' };
const BODY_SOFT_LIMIT = 5000;
const INPUT = 'min-h-10 w-full rounded-[10px] border border-field bg-surface px-3 text-body font-normal';

export function PostTab() {
  const canEdit = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const ls = useIke<CaseListResp>('case-admin?action=list');
  const live = ls.live;
  const [sample, setSample] = useState<CaseListResp | null>(null);
  useEffect(() => { if (ls.state === 'sample' && !sample) setSample(sampleCaseList(Date.now())); }, [ls.state, sample]);
  const list = live ? ls.data : sample;
  const [lt, setLt] = useState<'open' | 'draft' | 'closed'>('open');
  const [f, setF] = useState<F>(EMPTY);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [state, setState] = useState('');
  const [ask, setAsk] = useState<null | { kind: 'publish'; hits: number; word: string } | { kind: 'close'; id: string; title: string }>(null);
  const set = (p: Partial<F>) => setF((x) => ({ ...x, ...p }));
  const hits = useMemo(() => detectPrice(f.bodyText), [f.bodyText]);
  const [showHits, setShowHits] = useState(false);

  const loadOne = async (id: string) => {
    setErr(''); setState('');
    if (!live) { if (sample) setF(fromItem(sampleCaseFull(id, sample))); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    try {
      const r = await fetch(`/api/ike/case-admin?action=get&id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const j = (await r.json().catch(() => ({}))) as CaseGetResp & { error?: string };
      if (!r.ok || !j.ok) { setErr(j.error || `読めませんでした（${r.status}）`); return; }
      setF(fromItem(j.item)); window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setErr((e as Error).message); }
  };

  const payload = () => ({
    id: f.id || undefined, title: f.title, bodyText: f.bodyText, area: f.area, station: f.station, job: f.job, workStyles: f.workStyles, badges: f.badges,
    startText: f.startText, headcount: f.headcount, audience: f.audience, pinned: f.pinned, closeOn: f.closeOn, slackPermalink: f.slackPermalink,
  });
  const save = async (publish: boolean) => {
    setErr('');
    if (!f.title.trim()) { setErr('掲載タイトルを入れてください'); return; }
    if (!f.bodyText.trim()) { setErr('本文を入れてください'); return; }
    const op = publish ? 'publish' : f.id ? 'save' : 'create';
    setBusy(op); setState('保存しています…');
    if (!live) {
      setBusy(''); setState(publish ? '公開しました（見本なので保存していません）' : '保存しました（下書き・見本なので保存していません）');
      hit(); toast({ text: publish ? `「${f.title}」を公開しました` : `「${f.title}」を下書き保存しました`, sub: publish ? '→ 公式LINEの「案件情報」に出ます（見本）' : '見本なので保存していません' });
      return;
    }
    const r = await postLive<{ id?: string; status?: string; priceWarning?: { hit?: boolean } }>('/api/live/case-admin', { op, ...payload(), confirmed: publish ? true : undefined });
    setBusy('');
    if (!r.ok) { setState(''); setErr(r.error); return; }
    set({ id: r.j.id || f.id, status: r.j.status || f.status });
    setState(publish ? '公開しました' : '保存しました（下書き）');
    hit(); toast({ text: publish ? `「${f.title}」を公開しました` : `「${f.title}」を保存しました`, sub: publish ? '→ 公式LINEの「案件情報」に出ました' : '→ 掲載の一覧の「下書き」' });
    ls.reload();
  };
  const tryPublish = () => {
    if (!f.title.trim() || !f.bodyText.trim()) { void save(true); return; }
    setAsk({ kind: 'publish', hits: hits.length, word: hits[0]?.word ?? '' });
  };
  const close = async (id: string, title: string) => {
    setErr('');
    if (live) {
      const r = await postLive('/api/live/case-admin', { op: 'close', id, confirmed: true });
      if (!r.ok) { setErr(r.error); return; }
      ls.reload();
    } else setSample((s) => s && ({ ...s, items: s.items.map((x) => (x.id === id ? { ...x, status: 'closed', tab: 'closed' } : x)) }));
    hit(); toast({ text: `「${title}」を締め切りました`, sub: '→ 要員側の一覧から下ろしました（案件は消していません）' });
  };
  const duplicate = async (id: string, title: string) => {
    setErr('');
    if (!live) { if (sample) { setF({ ...fromItem(sampleCaseFull(id, sample)), id: null, status: 'draft', title: `${title} のコピー`, pinned: false }); } toast({ text: `「${title}」を複製しました`, sub: '見本なので保存していません' }); return; }
    const r = await postLive<{ id?: string }>('/api/live/case-admin', { op: 'duplicate', id });
    if (!r.ok) { setErr(r.error); return; }
    hit(); toast({ text: `「${title}」を複製しました`, sub: '→ 下書きとして作りました（要員にはまだ出ていません）' });
    ls.reload();
    if (r.j.id) void loadOne(String(r.j.id));
  };

  const rows = (list?.items ?? []).filter((x) => x.tab === lt);
  const insert = (text: string) => set({ bodyText: f.bodyText && !f.bodyText.endsWith('\n') ? `${f.bodyText}\n\n${text}` : f.bodyText + text });
  const toggle = (k: 'workStyles' | 'badges', v: string) => set({ [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] } as Partial<F>);
  const ro = !canEdit;

  return (
    <>
      <LiveBanner state={ls.state} error={ls.error} onReload={ls.reload} note="今の掲載の一覧です。公開すると公式LINEの「案件情報」に出ます" />
      {err && <div role="alert" className="mo-shake flex items-start gap-2 rounded-xl border px-4 py-2.5 text-sm" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)', borderColor: 'var(--tone-bad-bar)' }}><TriangleAlert size={14} className="mt-0.5" /><span className="flex-1">{err}</span><button onClick={() => setErr('')} aria-label="閉じる"><X size={14} /></button></div>}
      {!!list?.errors?.length && <div className="text-xs text-faint">{list.errors.map((e) => <div key={e}>※ {e}</div>)}</div>}
      {ro && <div className="text-sm text-bad">{needText('edit')}（見るだけ）</div>}

      <div className="grid gap-3.5 lg:grid-cols-[1.2fr_1fr]">
        {/* 左：書く＋プレビュー */}
        <div className="flex flex-col gap-3.5">
          <section className="rounded-xl border border-line bg-surface">
            <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5">
              <h2 className="text-md font-bold">① 案件を書く</h2>
              {f.id && <span className="chip" style={{ background: 'var(--as)', color: 'var(--ad)' }}>編集中（{STATUS_LABEL[f.status] ?? f.status}）</span>}
              <button onClick={() => { setF(EMPTY); setState(''); setErr(''); }} className="ml-auto inline-flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--ad)' }}><Plus size={13} />新しく書く</button>
            </div>
            <div className="flex flex-col gap-3 px-4 py-3">
              <label className="flex flex-col gap-1 text-sm font-semibold text-muted">掲載タイトル（要員が一覧で最初に見る1行）
                <input value={f.title} onChange={(e) => set({ title: e.target.value })} disabled={ro} maxLength={200} className={INPUT} placeholder="例）小売店 店舗向けヘルプデスク" /></label>
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-muted">本文（自由に書けます）
                  <span className="ml-auto flex flex-wrap gap-1">
                    {[['【見出し】', '【見出し】'], ['・箇条書き', '・'], ['区切り線', '\n──────────\n']].map(([l, v]) => (
                      <button key={l} type="button" disabled={ro} onClick={() => insert(v)} className="rounded-lg border border-field px-2 py-1 text-xs font-semibold">{l}</button>))}
                    <select value="" disabled={ro} onChange={(e) => { const t = CASE_TEMPLATES[Number(e.target.value)]; if (t) insert(t.text); }} aria-label="雛形を入れる" className="rounded-lg border border-field bg-surface px-2 py-1 text-xs">
                      <option value="">雛形を入れる…</option>{CASE_TEMPLATES.map((t, i) => <option key={t.label} value={i}>{t.label}</option>)}
                    </select>
                  </span>
                </div>
                <textarea value={f.bodyText} onChange={(e) => set({ bodyText: e.target.value })} disabled={ro} rows={12} className={`${INPUT} py-2 leading-relaxed`} placeholder={'【業務内容】\n・'} />
                <div className="flex text-xs text-faint"><span>改行はそのまま出ます。【 】で囲んだ行は見出しとして少し大きく出ます</span>
                  <span className="num ml-auto" style={f.bodyText.length > BODY_SOFT_LIMIT ? { color: 'var(--color-warn)', fontWeight: 700 } : undefined}>{f.bodyText.length.toLocaleString()}字</span></div>
              </div>
              {hits.length > 0 && (
                <div className="rounded-[10px] border px-3 py-2 text-sm" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)', borderColor: 'var(--color-warn)' }}>
                  本文に「{hits[0].word}」など単価に見える表記が {hits.length}件あります。単価は載せない決まりなので、消すのがおすすめです（公開は止めません）。
                  <button onClick={() => setShowHits((v) => !v)} className="ml-1 font-semibold underline">{showHits ? '閉じる' : 'どこか見る'}</button>
                  {showHits && <ul className="mt-1.5 list-disc pl-5 text-sm">{hits.slice(0, 10).map((h, i) => <li key={i}>…{h.context}…</li>)}</ul>}
                </div>
              )}
            </div>
          </section>
          <section className="rounded-xl border border-line bg-surface">
            <div className="border-b border-line-soft px-4 py-2.5"><h2 className="text-md font-bold">③ 要員に見える形</h2></div>
            <Preview f={f} />
          </section>
        </div>

        {/* 右：タグと公開・一覧 */}
        <div className="flex flex-col gap-3.5">
          <section className="rounded-xl border border-line bg-surface">
            <div className="border-b border-line-soft px-4 py-2.5"><h2 className="text-md font-bold">② タグを選ぶ</h2><div className="text-xs text-faint">要員側の絞り込みと案件別の集計に使うので選ぶだけ（書き方の揺れを防ぐ）</div></div>
            <div className="flex flex-col gap-3 px-4 py-3 text-sm">
              <div><div className="mb-1 font-semibold text-muted">エリア</div>
                <div className="flex flex-wrap gap-1.5">{CASE_AREAS.map((a) => <Tag key={a} on={f.area === a} disabled={ro} onClick={() => set({ area: f.area === a ? '' : a })}>{a}</Tag>)}</div></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 font-semibold text-muted">最寄駅（任意）<input value={f.station} onChange={(e) => set({ station: e.target.value })} disabled={ro} maxLength={100} className={INPUT} placeholder="例）〇〇駅 徒歩8分" /></label>
                <label className="flex flex-col gap-1 font-semibold text-muted">職種<select value={f.job} onChange={(e) => set({ job: e.target.value })} disabled={ro} className={INPUT}><option value="">選ばない</option>{CASE_JOBS.map((j) => <option key={j} value={j}>{j}</option>)}</select></label>
              </div>
              <div><div className="mb-1 font-semibold text-muted">勤務形態（いくつでも）</div>
                <div className="flex flex-wrap gap-1.5">{CASE_WORK_STYLES.map((w) => <Tag key={w} on={f.workStyles.includes(w)} disabled={ro} onClick={() => toggle('workStyles', w)}>{w}</Tag>)}</div></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 font-semibold text-muted">開始時期<input value={f.startText} onChange={(e) => set({ startText: e.target.value })} disabled={ro} maxLength={100} className={INPUT} placeholder="例）来月中旬〜" /></label>
                <label className="flex flex-col gap-1 font-semibold text-muted">募集人数<input type="number" min={1} value={f.headcount} onChange={(e) => set({ headcount: e.target.value })} disabled={ro} className={INPUT} placeholder="空なら出しません" /></label>
              </div>
              <div><div className="mb-1 font-semibold text-muted">バッジ（いくつでも）</div>
                <div className="flex flex-wrap gap-1.5">{CASE_BADGES.map((b) => <Tag key={b} on={f.badges.includes(b)} disabled={ro} onClick={() => toggle('badges', b)}>{b}</Tag>)}</div>
                <div className="mt-1 text-xs text-faint">NEW は公開日から7日間、自動で付きます</div></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 font-semibold text-muted">公開範囲<select value={f.audience} onChange={(e) => set({ audience: e.target.value })} disabled={ro} className={INPUT}>{CASE_AUDIENCES.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}</select></label>
                <label className="flex flex-col gap-1 font-semibold text-muted">掲載終了日（任意）<input type="date" value={f.closeOn} onChange={(e) => set({ closeOn: e.target.value })} disabled={ro} className={INPUT} /></label>
                <label className="flex flex-col gap-1 font-semibold text-muted">並び順<select value={f.pinned ? '1' : ''} onChange={(e) => set({ pinned: e.target.value === '1' })} disabled={ro} className={INPUT}><option value="">新着順（ふつう）</option><option value="1">上に固定</option></select></label>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button onClick={() => void save(false)} disabled={ro || !!busy} title={ro ? needText('edit') : undefined} className="btn-secondary">{busy === 'save' || busy === 'create' ? '保存しています…' : '下書き保存'}</button>
                <button onClick={tryPublish} disabled={ro || !!busy} title={ro ? needText('edit') : undefined} className="btn-primary ml-auto"><Send size={14} />{busy === 'publish' ? '公開しています…' : '公開する'}</button>
              </div>
              {state && <div className="text-sm text-muted">{state}</div>}
              {ask?.kind === 'publish' && (
                <div role="alertdialog" className="mo-scale-in rounded-xl border px-3.5 py-3" style={{ borderColor: 'var(--a)', background: 'var(--al)' }}>
                  {ask.hits > 0 && <div className="mb-1 text-sm font-semibold" style={{ color: 'var(--tone-warn-fg)' }}>本文に「{ask.word}」など単価に見える表記が {ask.hits}件あります。単価は載せない決まりですが、このまま公開しますか？</div>}
                  <div className="text-body font-semibold">この案件を公開します。公式LINEの「案件情報」に出ます。よろしいですか？</div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => { setAsk(null); void save(true); }} className="btn-primary">公開する</button>
                    <button onClick={() => setAsk(null)} className="btn-secondary">やめる</button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-center gap-1 border-b border-line-soft px-3 pt-1.5">
              {LIST_TABS.map((t) => (
                <button key={t.k} onClick={() => setLt(t.k)} aria-pressed={lt === t.k} className="tab">
                  {t.label} <span className="num">{list?.counts?.[t.k] ?? 0}</span></button>
              ))}
              {live && <button onClick={ls.reload} className="ml-auto inline-flex items-center gap-1 pb-1 text-sm text-muted"><RefreshCw size={12} />読み直す</button>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-body">
                <thead><tr className="th-row text-left"><th className="px-3 py-2 font-semibold">タイトル</th><th className="px-2 py-2 font-semibold">エリア</th><th className="px-2 py-2 text-right font-semibold">閲覧</th><th className="px-2 py-2 text-right font-semibold">応募</th><th className="px-3 py-2"></th></tr></thead>
                <tbody>
                  {rows.map((x) => (
                    <tr key={x.id} className="row border-t border-line-soft align-top" style={f.id === x.id ? { background: 'var(--al)' } : undefined}>
                      <td className="px-3 py-2"><div className="font-semibold">{x.pinned && <span className="mr-1 text-xs" style={{ color: 'var(--ad)' }}>固定</span>}{x.title}</div>
                        <div className="text-xs text-faint">{x.published_at ? `${new Date(x.published_at).getMonth() + 1}/${new Date(x.published_at).getDate()} 公開` : '下書き'}{x.expired ? '（掲載終了日を過ぎています）' : ''}</div></td>
                      <td className="whitespace-nowrap px-2 py-2">{x.area || '—'}</td>
                      <td className="num px-2 py-2 text-right">{x.views}</td>
                      <td className="num px-2 py-2 text-right">{x.applies}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <span className="inline-flex gap-1">
                          <button onClick={() => void loadOne(x.id)} className="btn-secondary btn-sm"><Pencil size={12} />{ro ? '見る' : '編集'}</button>
                          <button onClick={() => void duplicate(x.id, x.title)} disabled={ro} className="btn-secondary btn-sm"><Copy size={12} />複製</button>
                          {x.tab === 'open' && <button onClick={() => setAsk({ kind: 'close', id: x.id, title: x.title })} disabled={ro} className="inline-flex min-h-8 items-center gap-1 rounded-lg border px-2 text-sm font-semibold disabled:opacity-40" style={{ color: 'var(--color-bad)', borderColor: 'var(--color-bad-line, var(--color-line))' }}><Lock size={12} />締切</button>}
                        </span>
                        {ask?.kind === 'close' && ask.id === x.id && (
                          <div role="alertdialog" className="mo-scale-in mt-2 whitespace-normal rounded-[10px] border px-3 py-2 text-left text-sm" style={{ borderColor: 'var(--color-bad)', background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>
                            「{x.title}」を締め切ります（要員側の一覧から下ろします）。よろしいですか？
                            <div className="mt-1.5 flex justify-end gap-1.5">
                              <button onClick={() => { setAsk(null); void close(x.id, x.title); }} className="btn-danger solid btn-sm">締め切る</button>
                              <button onClick={() => setAsk(null)} className="btn-secondary btn-sm">やめる</button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">{ls.state === 'loading' ? '読み込み中…' : 'この中の案件はありません'}</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function Tag({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick} className="min-h-8 rounded-full border px-3 text-sm font-semibold disabled:opacity-60"
      style={on ? { background: 'var(--a)', color: 'var(--btn-fg, #fff)', borderColor: 'var(--a)' } : { borderColor: 'var(--color-field, var(--color-line))' }}>{children}</button>
  );
}

// 要員に見える形（今のプレビューと同じ：タグ＋本文。【 】の行は見出し）
function Preview({ f }: { f: F }) {
  const tags = [f.area && `📍 ${f.area}${f.station ? `・${f.station}` : ''}`, f.job && `💼 ${f.job}`, f.startText && `🗓 ${f.startText}`, Number(f.headcount) > 0 && `👥 ${Math.floor(Number(f.headcount))}名`, ...f.workStyles.map((w) => `🏷 ${w}`)].filter(Boolean) as string[];
  return (
    <div className="px-4 py-3">
      <div className="mx-auto max-w-[380px] overflow-hidden rounded-2xl border border-line">
        <div className="px-4 py-3" style={{ background: 'var(--as)' }}>
          <div className="flex flex-wrap gap-1">{f.badges.map((b) => <span key={b} className="chip" style={{ background: 'var(--a)', color: 'var(--btn-fg, #fff)' }}>{b}</span>)}</div>
          <div className="mt-1 text-md font-bold">{f.title || '（タイトル）'}</div>
          <div className="mt-1.5 flex flex-wrap gap-1 text-xs text-muted">{tags.map((t) => <span key={t} className="rounded-full bg-surface px-2 py-0.5">{t}</span>)}</div>
        </div>
        <div className="max-h-[320px] overflow-y-auto px-4 py-3 text-body leading-relaxed">
          {f.bodyText ? f.bodyText.split('\n').map((ln, i) => /^【.*】$/.test(ln.trim()) ? <div key={i} className="mt-2 text-body font-bold">{ln}</div> : <div key={i} className="min-h-[1em] whitespace-pre-wrap">{ln}</div>)
            : <div className="text-faint">（本文）</div>}
        </div>
      </div>
    </div>
  );
}
