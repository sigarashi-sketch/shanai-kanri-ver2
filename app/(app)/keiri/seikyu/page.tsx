'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, FileText, FolderInput } from 'lucide-react';
import { PageTitle } from '@/components/ui';
import { RemainRing } from '@/components/Motivation';
import { LiveBanner, type LiveState } from '@/components/Live';
import { savedPdfUrl, stampedPdfUrl, storeRows, type IkeMonthSum, type IkeSaved, type IkeStamped, type StoreRow, type StoreState } from '@/lib/live/seikyu-store';

// 請求書（経理管理）＝格納した請求書を正にした、月ごと・取引先ごとの一覧（10-25 shoya「請求書は請求書格納したところベースに」）。
//   ・ログイン中は今の社内システムの 保存した請求書・格納した PDF をそのまま読む（lib/live/seikyu-store.ts）。見るだけ
//   ・格納する（PDF を上げる・人を選ぶ）は「請求書・勤務表の格納」ページ（今の格納タブそのもの）から
//   ・ログインしていなければ見本（本物の会社名・金額ではない）
const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;
const TONE: Record<StoreState, string> = { 格納ずみ: 'ok', 押印し直しが要る: 'warn', 押印PDFまだ: 'bad' };
const ymLabel = (ym: string) => `${Number(ym.slice(0, 4))}年${Number(ym.slice(5, 7))}月分`;
const md = (iso: string) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : '');

const SAMPLE_MONTHS: IkeMonthSum[] = [{ ym: '2026-09', n: 5, total: 4_180_000, stamped: 3 }, { ym: '2026-08', n: 5, total: 3_960_000, stamped: 5 }];
const SAMPLE: StoreRow[] = [
  { key: 's1', partner: 'A社', issuer: '本社', number: 'INV-0912', total: 1_320_000, members: 3, billingDate: '2026-09-30', dueDate: '2026-10-31', state: '押印PDFまだ', external: false, savedId: null, savedAt: '2026-10-02T10:00:00Z', files: [] },
  { key: 's2', partner: 'B社', issuer: '本社', number: 'INV-0915', total: 495_000, members: 1, billingDate: '2026-09-30', dueDate: '2026-10-31', state: '押印し直しが要る', external: false, savedId: null, savedAt: '2026-10-03T10:00:00Z', files: [{ id: 'f1', name: 'INV-0915_押印', at: '2026-10-01T10:00:00Z', kind: '押印' }] },
  { key: 's3', partner: 'C社', issuer: 'グループA社', number: 'INV-0903', total: 1_045_000, members: 2, billingDate: '2026-09-30', dueDate: '2026-10-31', state: '格納ずみ', external: false, savedId: null, savedAt: '2026-10-01T09:00:00Z', files: [{ id: 'f2', name: 'INV-0903_押印', at: '2026-10-01T12:00:00Z', kind: '押印' }] },
  { key: 's4', partner: 'D社', issuer: '', number: '', total: null, members: 0, billingDate: '', dueDate: '', state: '格納ずみ', external: true, savedId: null, savedAt: '', files: [{ id: 'f3', name: 'D社_9月分_請求書', at: '2026-10-02T08:00:00Z', kind: '別で作った' }] },
];

async function getJson<T>(path: string): Promise<{ status: number; body: T | null }> {
  const r = await fetch(path, { cache: 'no-store' });
  return { status: r.status, body: (await r.json().catch(() => null)) as T | null };
}

export default function SeikyuPage() {
  const [state, setState] = useState<LiveState>('loading');
  const [error, setError] = useState('');
  const [months, setMonths] = useState<IkeMonthSum[]>([]);
  const [ym, setYm] = useState('');
  const [rows, setRows] = useState<StoreRow[] | null>(null);
  const [filter, setFilter] = useState<'すべて' | StoreState>('すべて');
  const live = state === 'live';

  const loadMonths = useCallback(async () => {
    setState('loading');
    try {
      const m = await getJson<{ months?: IkeMonthSum[]; error?: string }>('/ik/api/seikyu?action=month-summary');
      if (m.status === 401) { setState('sample'); return; }
      if (m.status !== 200 || !m.body?.months) { setState('error'); setError(m.body?.error || `読めませんでした（${m.status}）`); return; }
      setMonths(m.body.months); setYm((y) => y || m.body!.months![0]?.ym || ''); setState('live');
    } catch (e) { setState('error'); setError((e as Error).message); }
  }, []);
  useEffect(() => { loadMonths(); }, [loadMonths]);

  useEffect(() => {
    if (!live || !ym) return;
    let on = true;
    setRows(null);
    Promise.all([
      getJson<{ saved?: IkeSaved[] }>(`/ik/api/seikyu?action=saved-list&ym=${ym}`),
      getJson<{ stamped?: IkeStamped[] }>(`/ik/api/seikyu?action=stamped-list&ym=${ym}`),
    ]).then(([a, b]) => {
      if (!on) return;
      if (a.status !== 200 || b.status !== 200) { setError(`この月を読めませんでした（${a.status}/${b.status}）`); setRows([]); return; }
      setRows(storeRows(a.body?.saved || [], b.body?.stamped || []));
    }).catch((e) => { if (on) { setError((e as Error).message); setRows([]); } });
    return () => { on = false; };
  }, [live, ym]);

  const list = live ? rows : SAMPLE;
  const ms = live ? months : SAMPLE_MONTHS;
  const cur = live ? ym : SAMPLE_MONTHS[0].ym;
  const count = (s: StoreState) => (list || []).filter((r) => r.state === s).length;
  const done = count('格納ずみ');
  const shown = useMemo(() => (list || []).filter((r) => filter === 'すべて' || r.state === filter), [list, filter]);
  const total = (list || []).reduce((n, r) => n + (r.total || 0), 0);

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="請求書" sub={`格納した請求書を正にした、月ごと・取引先ごとの一覧です${live ? '' : '・見本データ'}`}>
        <Link href="/keiri/kakunou" className="btn-primary inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-3.5 text-[13px] font-bold"><FolderInput size={15} />格納する</Link>
      </PageTitle>
      <LiveBanner state={state} error={error} onReload={loadMonths} note="今の社内システムの「保存した請求書」と「格納した PDF」をそのまま読んでいます（見るだけ）。金額・番号は保存した版のまま。PDF を置く・人を選ぶは格納ページから" />

      <div className="mo-fade-up flex flex-wrap gap-2" style={{ ['--i' as string]: 1 }}>
        {ms.map((m) => (
          <button key={m.ym} onClick={() => live && setYm(m.ym)} aria-pressed={m.ym === cur} className="min-h-[58px] rounded-xl border px-3.5 py-2 text-left text-[12px]"
            style={m.ym === cur ? { borderColor: 'var(--a)', background: 'var(--as)' } : { borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}>
            <div className="text-[13.5px] font-bold" style={m.ym === cur ? { color: 'var(--ad)' } : undefined}>{ymLabel(m.ym)}</div>
            <div className="num text-muted">{m.n}社・{yen(m.total)}・押印 {m.stamped}/{m.n}</div>
          </button>
        ))}
        {live && ms.length === 0 && <div className="text-[12.5px] text-muted">保存した請求書がまだありません。</div>}
      </div>

      {list && (
        <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 2 }}>
          <RemainRing remain={list.length - done} total={list.length} />
          <div className="text-[13px]"><b>{cur ? ymLabel(cur) : ''} 格納ずみ {done}／{list.length}社</b>
            <div className="text-[12px] text-muted">保存した版の合計 <span className="num">{yen(total)}</span>{count('押印し直しが要る') ? `・保存し直したあと押印 PDF が古いまま ${count('押印し直しが要る')}社` : ''}</div>
          </div>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {(['すべて', '押印PDFまだ', '押印し直しが要る', '格納ずみ'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`min-h-8 rounded-full border px-3 text-[12.5px] ${filter === f ? 'font-semibold' : 'text-muted'}`}
                style={filter === f ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>
                {f} {f === 'すべて' ? list.length : count(f)}
              </button>
            ))}
          </div>
        </div>
      )}

      {list && list.length > 0 && done === list.length && filter === 'すべて' && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-5 text-center"><Check className="mx-auto text-ok" size={24} /><div className="mt-1 text-[14px] font-bold">この月の請求書は全部格納できています</div></div>
      )}

      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 3 }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-[13px]">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">取引先</th><th className="px-2 py-2.5 font-semibold">請求書番号</th><th className="px-2 py-2.5 text-right font-semibold">金額（税込）</th><th className="px-2 py-2.5 font-semibold">請求日・支払期限</th><th className="px-2 py-2.5 font-semibold">格納した PDF</th><th className="px-4 py-2.5 font-semibold">状態</th>
            </tr></thead>
            <tbody>
              {!list && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">読み込み中…</td></tr>}
              {list && shown.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">この条件の請求書はありません</td></tr>}
              {shown.map((r, i) => (
                <tr key={r.key} className="mo-fade-in row border-t border-line-soft align-top" style={{ ['--i' as string]: Math.min(i, 24) }}>
                  <td className="px-4 py-2.5"><b>{r.partner}</b><div className="text-[11.5px] text-faint">{r.external ? '別で作った請求書' : `${r.issuer ? `${r.issuer}・` : ''}${r.members}人`}</div></td>
                  <td className="px-2 py-2.5">{r.number || <span className="text-faint">—</span>}{r.savedId && live && <a href={savedPdfUrl(r.savedId)} target="_blank" rel="noreferrer" className="block text-[11.5px] font-semibold hover:underline" style={{ color: 'var(--ad)' }}>保存した版を見る</a>}</td>
                  <td className="num px-2 py-2.5 text-right">{r.total == null ? <span className="text-faint">—</span> : yen(r.total)}</td>
                  <td className="num px-2 py-2.5">{r.billingDate ? `${md(r.billingDate)}・${md(r.dueDate)}` : <span className="text-faint">—</span>}</td>
                  <td className="px-2 py-2.5">
                    {r.files.length === 0 ? <span className="text-faint">まだ</span> : (
                      <ul className="flex flex-col gap-1">{r.files.map((f) => (
                        <li key={f.id} className="flex items-center gap-1.5 text-[12.5px]"><FileText size={13} className="shrink-0 text-faint" />
                          {live ? <a href={stampedPdfUrl(f.id)} target="_blank" rel="noreferrer" className="hover:underline">{f.name}</a> : <span>{f.name}</span>}
                          <span className="text-[11px] text-faint">{f.kind}・{md(f.at.slice(0, 10))}</span></li>
                      ))}</ul>
                    )}
                  </td>
                  <td className="px-4 py-2.5"><span className="chip" style={{ background: `var(--tone-${TONE[r.state]}-bg)`, color: `var(--tone-${TONE[r.state]}-fg)` }}>{r.state}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11.5px] text-faint">誰がどの請求書に載っているか（人ごとの格納ずみ）は、格納ページで見られます。</p>
    </main>
  );
}
