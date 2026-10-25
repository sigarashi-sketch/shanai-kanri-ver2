'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, FileSpreadsheet, FileText, Filter, RotateCw, Search, TriangleAlert, Wand2, X } from 'lucide-react';
import type { SsDetail, SsList, SsResult, SsRow } from '@/lib/skillsheet-types';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { DrawerPortal } from '@/components/DrawerPortal';
import { PersonName } from '@/components/Person';

// スキルシート作成（人事管理）＝今の「基本情報」画面（legacy/public/basic-info.html）の写し。仕様は変えず見た目だけ ver2 に合わせた。
//   ・基本情報フォームの回答者の一覧。検索・絞り込み・件数・並びは全部サーバが返す（20件ずつ）
//   ・生成は「営業リストに一意にいる行」だけ（同名複数・リスト無しは保存先が決められない）。生成の前に確かめる（20〜40秒）
//   ・すでにスキシがあるときは、上書きしてよいかもう一度確かめる（needsConfirm）
//   ・PDF出力・Excel出力は「スキシがある行」だけ。本名版とイニシャル版（客先送付用）の2つ。URLは変わらない
//   ・名前を押すとフォームの回答を見る。★健康状況・連絡先・住所・生年月日・緊急連絡先は出さない（サーバで落とす・10-25 shoya「健康の情報は出さない」）
//   ・?q=氏名 でその人を検索した状態で開く
type F = { q: string; gender: string; pref: string; tantou: string; sukishi: '' | 'yes' | 'no'; roster: '' | 'yes' | 'no'; sort: 'desc' | 'asc' };
const F0: F = { q: '', gender: '', pref: '', tantou: '', sukishi: '', roster: '', sort: 'desc' };
type Busy = { id: string; what: 'gen' | 'pdf' | 'xlsx' } | null;
type Done = { name: string; title: string; lines: [string, string][]; notes: string[]; bad?: boolean };

const isUrl = (s?: string) => !!s && s.startsWith('http');
// 一覧の行の見分け（営業リストの行 → 正規化した氏名 → 氏名）。続きを足すときの重なりを落とす
const rowKey = (r: SsRow) => r.rosterId || `n:${r.normalizedName || r.name}`;
const SEL = 'min-h-9 rounded-[10px] border border-field bg-surface px-2.5 text-sm text-ink';

export default function SkillsheetPage() {
  const canEdit = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const [f, setF] = useState<F>(F0);
  const [page, setPage] = useState(1);
  const size = 20;
  const [data, setData] = useState<SsList | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);   // 続きを下に足しているあいだ（一覧は薄くしない）
  const [err, setErr] = useState('');
  const [moreErr, setMoreErr] = useState('');   // 続きを足す読み込みの失敗（自動では読み直さない）
  const [busy, setBusy] = useState<Busy>(null);
  const [ask, setAsk] = useState<{ row: SsRow; existing?: string } | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [detail, setDetail] = useState<{ name: string; d?: SsDetail } | null>(null);
  const [firstNo, setFirstNo] = useState<number | null>(null);   // 開いたときの未生成の数（残りリング用）
  const seq = useRef(0);

  // 下までスクロールしたら次の20人を下に足す（10-25 shoya「ページボタン押すと更新して上からになるのやめて」）。
  //   pg ページ目まで出す：append＝pg ページ目だけ読んで下に足す／それ以外＝1〜pg ページ目を「1回で」読み直して置き換える（更新・作ったあと）
  //   ・読み直しは limit=pg×20（100件まで）offset 0 の1回。100件を超えるときだけ100件ずつ順に読む（10-25 まとめて何本も投げない）
  //   ・足す読み込みが失敗したら自動では読まない（「もう一度」ボタン）。前のページから件数が変わっていたら1ページ目から読み直す
  const lastTotal = useRef<number | null>(null);
  const load = useCallback(async (ff: F, pg: number, append = false): Promise<void> => {
    const my = ++seq.current;
    const on = append ? setAdding : setLoading;
    on(true);
    setMoreErr('');
    const one = async (limit: number, offset: number) => {
      const p = new URLSearchParams({ limit: String(limit), offset: String(offset), sort: ff.sort });
      for (const k of ['q', 'gender', 'pref', 'tantou', 'sukishi', 'roster'] as const) if (ff[k]) p.set(k, ff[k]);
      const r = await fetch(`/api/skillsheet?${p}`, { cache: 'no-store' });
      return (await r.json()) as SsList;
    };
    try {
      const list: SsList[] = [];
      if (append) list.push(await one(size, (pg - 1) * size));
      else {
        const want = Math.max(1, pg) * size;
        for (let off = 0; off < want; off += 100) {
          const n = Math.min(100, want - off);
          const x = await one(n, off);
          list.push(x);
          if (my !== seq.current) return;
          if (x.error || (x.rows || []).length < n) break;
        }
      }
      if (my !== seq.current) return;   // あとから出した読み込みが先に返っていたら古いほうは捨てる
      const j = list[list.length - 1];
      if (j.error && !(j.rows && j.rows.length)) {
        if (append) setMoreErr(j.error); else setErr(j.error);
        on(false); return;
      }
      // 前のページから件数が変わった＝ずれて抜け・重なりが出るので、1ページ目から読み直す
      if (append && lastTotal.current != null && j.total !== lastTotal.current) {
        setAdding(false);
        return load(ff, pg);
      }
      lastTotal.current = j.total;
      const rows = list.flatMap((x) => x.rows || []);
      setErr('');
      setData((prev) => {
        if (!append || !prev) return { ...list[0], rows };
        const seen = new Set(prev.rows.map(rowKey));
        return { ...prev, ...j, rows: [...prev.rows, ...rows.filter((r) => !seen.has(rowKey(r)))] };
      });
      setPage(pg);
      setFirstNo((n) => (n == null && !ff.q && !ff.gender && !ff.pref && !ff.tantou && !ff.sukishi && !ff.roster ? list[0].stats.noSukishi : n));
    } catch (e) {
      if (my === seq.current) { const m = `読み込めませんでした（${(e as Error).message}）`; if (append) setMoreErr(m); else setErr(m); }
    }
    if (my === seq.current) { setLoading(false); setAdding(false); }
  }, []);

  useEffect(() => {
    const q0 = new URLSearchParams(window.location.search).get('q') || '';
    const ff = { ...F0, q: q0 };
    setF(ff); load(ff, 1);
  }, [load]);

  // 検索は打つたびに叩かない（300ms 待つ）。それ以外の絞り込みはすぐ。絞り込みが変わったら1ページ目へ
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const change = (patch: Partial<F>, debounce = false) => {
    const ff = { ...f, ...patch };
    setF(ff); setPage(1);
    if (timer.current) clearTimeout(timer.current);
    if (debounce) timer.current = setTimeout(() => load(ff, 1), 300); else load(ff, 1);
  };

  const post = async (body: object): Promise<SsResult> => {
    try { return (await (await fetch('/api/skillsheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()) as SsResult; }
    catch (e) { return { ok: false, error: (e as Error).message }; }
  };
  const lines = (j: SsResult, kind: 'pdf' | 'xlsx'): [string, string][] => {
    const a = kind === 'pdf' ? [j.pdfUrl, j.pdfAnonUrl] : [j.xlsxUrl, j.xlsxAnonUrl];
    const label = kind === 'pdf' ? 'PDF' : 'Excel';
    return [[`${label} 本名版`, a[0] || ''], [`${label} イニシャル版（客先送付用）`, a[1] || '']].filter(([, v]) => v) as [string, string][];
  };

  const gen = async (row: SsRow, force = false) => {
    setAsk(null);
    setBusy({ id: row.rosterId!, what: 'gen' });
    const j = await post({ name: row.name, rosterId: row.rosterId, force });
    setBusy(null);
    if (j.needsConfirm) { setAsk({ row, existing: j.existing }); return; }
    if (j.ok && j.url) {
      const notes: string[] = [];
      if (j.anonymized === false) notes.push(`匿名化に失敗しています（生成物を手で確かめてください）${j.anonymizeError ? `：${j.anonymizeError}` : ''}`);
      if (j.pdfError) notes.push(`PDFは作れませんでした（シートはできています）：${j.pdfError}`);
      if (j.xlsxError) notes.push(`Excelは作れませんでした（シートはできています）：${j.xlsxError}`);
      setDone({ name: row.name, title: 'スキルシートを作りました', lines: [['スキルシート', j.url], ...lines(j, 'pdf'), ...lines(j, 'xlsx')], notes });
      hit();
      toast({ text: `${row.name} さんのスキルシートを作りました`, sub: '→ 営業リストのスキシ・PDFの列にも入りました' });
      load(f, page);   // スキシの有無が変わる＝件数と「未生成のみ」の対象が変わるので取り直す
    } else setDone({ name: row.name, title: '作れませんでした', lines: [], notes: [j.error || 'わけが分かりませんでした'], bad: true });
  };
  const exportAs = async (row: SsRow, kind: 'pdf' | 'xlsx') => {
    setBusy({ id: row.rosterId!, what: kind });
    const j = await post({ action: kind, rosterId: row.rosterId });
    setBusy(null);
    const ls = lines(j, kind);
    if (j.ok && ls.length) {
      setDone({ name: row.name, title: kind === 'pdf' ? 'PDFを出しました' : 'Excelを出しました', lines: ls, notes: j.warning ? [j.warning] : [] });
      hit();
    } else setDone({ name: row.name, title: kind === 'pdf' ? 'PDFを出せませんでした' : 'Excelを出せませんでした', lines: [], notes: [j.error || 'わけが分かりませんでした'], bad: true });
  };

  const openDetail = async (name: string) => {
    setDetail({ name });
    try { const d = (await (await fetch(`/api/skillsheet?action=detail&name=${encodeURIComponent(name)}`)).json()) as SsDetail; setDetail((x) => (x?.name === name ? { name, d } : x)); }
    catch (e) { setDetail((x) => (x?.name === name ? { name, d: { ok: false, error: (e as Error).message } } : x)); }
  };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDetail(null); setAsk(null); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);

  const s = data?.stats;
  const total = data?.total ?? 0, grand = data?.grandTotal ?? 0;
  const noOnly = f.sukishi === 'no';
  const synced = data?.syncedAt ? new Date(data.syncedAt) : null;
  const denied = !canEdit ? needText('edit') : undefined;

  const more = data ? data.rows.length < total : false;
  const Pager = () => (
    <div className="flex flex-wrap items-center gap-2 px-1 py-2 text-sm text-muted">
      <span className="tabular-nums">{total ? `${(data?.rows.length ?? 0).toLocaleString()}件を表示中` : '0件'}（{total.toLocaleString()}件中）{more && '・下までスクロールすると続きが出ます'}</span>
    </div>
  );

  return (
    <main className="flex min-w-0 flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="スキルシート作成" sub="基本情報フォームの回答者の一覧。送信するとすぐここに出ます。フォームの内容からスキルシートを作ります">
        {s && firstNo != null && firstNo > 0 && <RemainRing remain={Math.min(firstNo, s.noSukishi)} total={firstNo} />}
      </PageTitle>

      {data?.source === 'sample' && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-soft px-4 py-2.5 text-sm text-muted">
          いまは見本データです（本物の名前ではありません）。作るボタンを押しても本物は作りません。
          <a href="/api/ike-auth/start" className="btn-primary ml-auto btn-sm">会社のアカウントでログインして本物を見る</a>
        </div>
      )}
      {data?.source === 'live' && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-faint">
          <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}><Check size={11} />本物のデータ</span>
          作る・PDF出力・Excel出力は本物を作ります（今の画面から押したのと同じ）。未経験の人だけ（今のプロパーリストに入っている人）を出しています
          <button onClick={async () => { await fetch('/api/ike-auth/logout', { method: 'POST' }); load(f, 1); }} className="ml-auto font-semibold underline">ログアウト</button>
        </div>
      )}
      {err.includes('ログイン') && <a href="/api/ike-auth/start" className="btn-primary w-fit">もう一度ログインする</a>}
      {err && <div className="flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-sm" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)', borderColor: 'var(--tone-bad-bar)' }}><TriangleAlert size={14} />{err}<button onClick={() => load(f, page)} className="ml-auto font-semibold underline">もう一度</button></div>}
      {data?.rosterError && <div className="flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-sm" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)', borderColor: 'var(--tone-caution-bar)' }}><TriangleAlert size={14} />担当・最寄駅・スキルシートの補足を取れませんでした（一覧は出しています）</div>}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { if (timer.current) clearTimeout(timer.current); load(f, page); }} disabled={loading} className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-field bg-surface px-3 text-sm font-semibold text-muted disabled:opacity-50"><RotateCw size={14} className={loading ? 'animate-spin' : ''} />更新</button>
        <button aria-pressed={noOnly} onClick={() => change({ sukishi: noOnly ? '' : 'no' })} className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border px-3 text-sm font-semibold"
          style={noOnly ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-field)', color: 'var(--color-muted)' }}>
          <Filter size={14} />{noOnly ? '未生成だけ表示中（解除）' : 'スキシ未生成だけ'}
        </button>
        <span className="text-sm text-faint tabular-nums">{loading && !data ? '読み込み中…' : `${total.toLocaleString()}名${total !== grand ? `（全 ${grand.toLocaleString()}名中）` : ''}${synced && !isNaN(synced.getTime()) ? `（最終更新 ${synced.toLocaleString('ja-JP')}）` : ''}`}</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {([['表示中', s?.shown], ['営業リストにいる', s?.inRoster], ['スキシあり', s?.hasSukishi], ['スキシ未生成', s?.noSukishi], ['生年月日あり', s?.hasBirth]] as const).map(([l, v]) => (
          <div key={l} className="rounded-xl border border-line bg-surface px-3.5 py-2.5">
            <div className="text-xs font-semibold text-faint">{l}</div>
            <div className="text-xl font-extrabold tabular-nums" style={l === 'スキシ未生成' && v ? { color: 'var(--tone-warn-fg)' } : undefined}>{v == null ? '–' : v.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="relative flex min-w-[200px] flex-[1_1_240px] items-center">
          <Search size={14} className="pointer-events-none absolute left-3 text-faint" />
          <input value={f.q} onChange={(e) => change({ q: e.target.value }, true)} placeholder="氏名で検索（スペースはあってもなくても）" className="min-h-9 w-full rounded-[10px] border border-field bg-surface pl-8 pr-3 text-body" />
        </label>
        <select aria-label="性別" value={f.gender} onChange={(e) => change({ gender: e.target.value })} className={SEL}><option value="">性別：すべて</option>{data?.facets.gender.map((x) => <option key={x.v} value={x.v}>{x.v}（{x.n}）</option>)}</select>
        <select aria-label="都道府県" value={f.pref} onChange={(e) => change({ pref: e.target.value })} className={SEL}><option value="">都道府県：すべて</option>{data?.facets.pref.map((x) => <option key={x.v} value={x.v}>{x.v}（{x.n}）</option>)}</select>
        <select aria-label="採用担当" value={f.tantou} onChange={(e) => change({ tantou: e.target.value })} className={SEL}><option value="">担当：すべて</option>{data?.facets.tantou.map((x) => <option key={x.v} value={x.v}>{x.v}（{x.n}）</option>)}</select>
        <select aria-label="スキシ" value={f.sukishi} onChange={(e) => change({ sukishi: e.target.value as F['sukishi'] })} className={SEL}><option value="">スキシ：すべて</option><option value="yes">スキシあり</option><option value="no">スキシなし</option></select>
        <select aria-label="営業リスト" value={f.roster} onChange={(e) => change({ roster: e.target.value as F['roster'] })} className={SEL}><option value="">営業リスト：すべて</option><option value="yes">リストにいる</option><option value="no">リストにいない</option></select>
        <select aria-label="並び" value={f.sort} onChange={(e) => change({ sort: e.target.value as F['sort'] })} className={SEL}><option value="desc">新しい順</option><option value="asc">古い順</option></select>
      </div>

      {/* できたもの（URL）／失敗の理由 */}
      {done && (
        <div role="status" className="mo-fade-up rounded-xl border px-4 py-3 text-sm" style={done.bad ? { background: 'var(--tone-bad-bg)', borderColor: 'var(--tone-bad-bar)', color: 'var(--tone-bad-fg)' } : { background: 'var(--tone-ok-bg)', borderColor: 'var(--tone-ok-bar)' }}>
          <div className="flex items-center gap-2 font-bold">{done.bad ? <TriangleAlert size={14} /> : <Check size={14} style={{ color: 'var(--tone-ok-fg)' }} />}{done.name} さん：{done.title}<button aria-label="閉じる" onClick={() => setDone(null)} className="ml-auto text-faint"><X size={14} /></button></div>
          {done.lines.map(([k, v]) => <div key={k} className="mt-1 flex flex-wrap gap-x-2"><span className="text-faint">{k}</span>{isUrl(v) ? <a href={v} target="_blank" rel="noopener" className="break-all font-semibold" style={{ color: 'var(--ad)' }}>{v}</a> : <span className="text-ink">{v}</span>}</div>)}
          {done.notes.map((n) => <div key={n} className="mt-1 text-warn">※ {n}</div>)}
        </div>
      )}

      <section className="rounded-xl border border-line bg-surface px-3.5 pb-1">
        <Pager />
        <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-50' : ''}`}>
          <table className="w-full min-w-[860px] border-collapse text-body">
            <thead><tr className="th-row text-left">{['氏名', '性別', '生年月日', '都道府県', '担当', '最寄駅', '営業リスト', 'スキルシート'].map((h) => <th key={h} className="whitespace-nowrap px-2.5 py-2">{h}</th>)}</tr></thead>
            <tbody>
              {data && !data.rows.length && <tr><td colSpan={8} className="py-10 text-center text-faint">{loading ? '読み込み中…' : '条件に合う人がいません'}</td></tr>}
              {!data && <tr><td colSpan={8} className="py-10 text-center text-faint">読み込み中…</td></tr>}
              {data?.rows.map((r) => {
                const mine = busy && busy.id === r.rosterId;
                const hasSs = !!r.rosterId && isUrl(r.sukishi) || (!!r.rosterId && data.source === 'sample' && !!r.sukishi);
                return (
                  <tr key={rowKey(r)} className="row border-t border-line-soft">
                    <td className="whitespace-nowrap px-2.5 py-2"><button onClick={() => openDetail(r.name)} className="font-bold hover:underline" style={{ color: 'var(--ad)' }}>{r.name}</button></td>
                    <td className="whitespace-nowrap px-2.5 py-2">{r.gender}</td>
                    <td className="whitespace-nowrap px-2.5 py-2 tabular-nums">{r.birth}</td>
                    <td className="whitespace-nowrap px-2.5 py-2">{r.prefecture}</td>
                    <td className="whitespace-nowrap px-2.5 py-2">{r.tantou}</td>
                    <td className="whitespace-nowrap px-2.5 py-2">{r.eki}</td>
                    <td className="whitespace-nowrap px-2.5 py-2">
                      {r.ambiguous ? <span className="chip" title="同名が複数いるので担当・スキシは出していません" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }}><TriangleAlert size={11} />同名が複数</span>
                        : r.inRoster ? <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}><Check size={11} />いる</span>
                        : <span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>いない</span>}
                    </td>
                    <td className="px-2.5 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isUrl(r.sukishi) ? <a href={r.sukishi} target="_blank" rel="noopener" className="inline-flex items-center gap-1 whitespace-nowrap font-semibold" style={{ color: 'var(--ad)' }}>別窓で開く<ExternalLink size={12} /></a>
                          : r.sukishi ? <span className="whitespace-nowrap text-muted">{r.sukishi}</span> : <span className="text-faint">—</span>}
                        {r.rosterId && <button disabled={!canEdit || !!busy} title={denied ?? (busy && !mine ? 'ほかの行を作っているあいだは待ってください' : undefined)} onClick={() => setAsk({ row: r })} className="inline-flex min-h-7 items-center gap-1 whitespace-nowrap rounded-lg border border-field bg-surface px-2 text-xs font-semibold disabled:opacity-40">
                          <Wand2 size={12} />{mine && busy.what === 'gen' ? "作っています…" : r.sukishi ? '作り直す' : '作る'}</button>}
                        {hasSs && <button disabled={!canEdit || !!busy} title={denied} onClick={() => exportAs(r, 'pdf')} className="inline-flex min-h-7 items-center gap-1 whitespace-nowrap rounded-lg border border-field bg-surface px-2 text-xs font-semibold disabled:opacity-40"><FileText size={12} />{mine && busy.what === 'pdf' ? 'PDFを出しています…' : 'PDF出力'}</button>}
                        {hasSs && <button disabled={!canEdit || !!busy} title={denied ?? '本名版とイニシャル版のExcelを出します（URLは変わりません）'} onClick={() => exportAs(r, 'xlsx')} className="inline-flex min-h-7 items-center gap-1 whitespace-nowrap rounded-lg border border-field bg-surface px-2 text-xs font-semibold disabled:opacity-40"><FileSpreadsheet size={12} />{mine && busy.what === 'xlsx' ? 'Excelを出しています…' : 'Excel出力'}</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {more && (moreErr
            ? <div className="flex flex-wrap items-center justify-center gap-2 py-3 text-sm" style={{ color: 'var(--tone-bad-fg)' }}><TriangleAlert size={13} />続きを読めませんでした（{moreErr}）<button type="button" onClick={() => load(f, page + 1, true)} className="font-semibold underline">もう一度</button></div>
            : <MoreSentinel busy={loading || adding} onMore={() => load(f, page + 1, true)} />)}
          {data && !more && data.rows.length > 0 && <div className="py-3 text-center text-sm text-faint">全部出しました（{total.toLocaleString()}件）</div>}
        </div>
        <Pager />
      </section>

      {/* 作る前の確かめ（今の画面の confirm と同じ問い）／上書きの確かめ */}
      {ask && (
        <DrawerPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-sumi/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) setAsk(null); }}>
            <div role="dialog" aria-modal className="mo-scale-in panel w-full max-w-[460px] p-5">
              <h2 className="text-md font-bold">{ask.existing ? 'すでにスキシがあります' : `${ask.row.name} さんのスキルシートを作りますか？`}</h2>
              {ask.existing
                ? <p className="mt-2 break-all text-sm text-muted">{ask.existing}<br />上書きして作り直しますか？</p>
                : <p className="mt-2 text-sm text-muted">基本情報フォームの内容から作ります。20〜40秒かかることがあります。</p>}
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setAsk(null)} className="min-h-9 rounded-[10px] border border-field bg-surface px-3.5 text-sm font-semibold text-muted">やめる</button>
                <button onClick={() => gen(ask.row, !!ask.existing)} className="btn-primary">{ask.existing ? '上書きして作り直す' : '作る'}</button>
              </div>
            </div>
          </div>
        </DrawerPortal>
      )}

      {/* 名前を押したとき：フォームの回答を全部（今の画面と同じ並び） */}
      {detail && (
        <DrawerPortal>
          <div className="fixed inset-0 z-50 flex justify-end bg-sumi/30" onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
            <aside className="mo-drawer drawer-shadow flex h-full w-full max-w-[560px] flex-col bg-surface">
              <div className="flex items-center gap-2 border-b border-line px-5 py-3.5"><h2 className="text-md font-bold"><PersonName name={detail.name} className="underline-offset-2 hover:underline" /> さんのフォームの回答</h2><button aria-label="閉じる" onClick={() => setDetail(null)} className="ml-auto rounded-full bg-soft p-1.5 text-muted"><X size={15} /></button></div>
              <div className="flex-1 overflow-y-auto px-5 pb-6 pt-2 text-body"><DetailBody d={detail.d} /></div>
            </aside>
          </div>
        </DrawerPortal>
      )}
    </main>
  );
}

function Sec({ t }: { t: string }) { return <h3 className="mb-1.5 mt-5 inline-block border-b-2 pb-1 text-xs font-bold tracking-wide text-faint" style={{ borderColor: 'var(--a)' }}>{t}</h3>; }
function Row({ k, v }: { k: string; v?: string | number | null }) {
  if (v == null || v === '') return null;
  return <div className="flex gap-3 py-1"><span className="w-[100px] shrink-0 text-sm text-faint">{k}</span><span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{v}</span></div>;
}
function DetailBody({ d }: { d?: SsDetail }) {
  if (!d) return <div className="py-10 text-center text-faint">読み込み中…</div>;
  if (d.ok === false) return <div className="py-10 text-center text-faint">{d.error || '読み込めませんでした'}</div>;
  const s = d.sheet || {};
  return (
    <>
      <Sec t="基本情報" />
      <Row k="氏名" v={s.name} /><Row k="ふりがな" v={s.kana} /><Row k="性別" v={s.gender} />
      <Row k="年齢" v={s.age ? `${s.age}歳` : ''} /><Row k="最寄り駅" v={s.eki} />
      <Sec t="学歴・スキル・勤務条件" />
      <Row k="最終学歴" v={s.gakureki} /><Row k="経験ツール" v={s.tools} /><Row k="所有資格" v={s.shikaku} /><Row k="得意分野" v={s.tokui} />
      <Row k="シフト" v={s.shift} /><Row k="夜勤" v={s.yakin} /><Row k="出張" v={s.shutcho} />
      <Sec t="職歴" />
      {d.work?.length ? d.work.map((w, i) => (
        <div key={i} className="border-b border-line-soft py-2">
          <b>{i + 1}社目</b> {w.company} <span className="text-faint">{w.from}〜{w.to}{w.emp_type ? ` / ${w.emp_type}` : ''}{w.job_category ? ` / ${w.job_category}` : ''}</span>
          {w.description && <div className="mt-1 whitespace-pre-wrap text-muted">{w.description}</div>}
        </div>
      )) : <div className="text-faint">（職歴なし）</div>}
      <Sec t="アンケートの回答" />
      {d.analysis?.length ? d.analysis.map((a) => <Row key={a.label} k={a.label} v={a.value} />) : <div className="text-faint">（回答なし）</div>}
      <Sec t="記録" />
      {d.submittedAt && <Row k="送信日時" v={new Date(d.submittedAt).toLocaleString('ja-JP')} />}
      {d.durationSec != null && <Row k="かかった時間" v={`${Math.round(d.durationSec / 60)}分`} />}
      {d.sheetError && <div className="mt-2 text-faint">※ 基本情報：{d.sheetError}</div>}
      {d.formError && <div className="text-faint">※ フォーム：{d.formError}</div>}
    </>
  );
}

// 一覧の下の見張り：見えてきたら続きを読む（読み込み中は待つ）。見張りが効かない環境のためにスクロールでも確かめる・押しても読める
function MoreSentinel({ busy, onMore }: { busy: boolean; onMore: () => void }) {
  const el = useRef<HTMLButtonElement>(null);
  const cb = useRef(onMore);
  cb.current = onMore;
  useEffect(() => {
    const n = el.current;
    if (!n || busy) return;
    let fired = false;
    const fire = () => { if (!fired) { fired = true; cb.current(); } };
    const near = () => { if (n.getBoundingClientRect().top < window.innerHeight + 400) fire(); };
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) fire(); }, { rootMargin: '400px 0px' });
    io.observe(n);
    window.addEventListener('scroll', near, { capture: true, passive: true });
    near();
    return () => { io.disconnect(); window.removeEventListener('scroll', near, { capture: true }); };
  }, [busy]);
  return <button ref={el} type="button" disabled={busy} onClick={() => cb.current()} className="w-full py-3 text-center text-sm text-faint">{busy ? '続きを読み込み中…' : '続きを読む'}</button>;
}
