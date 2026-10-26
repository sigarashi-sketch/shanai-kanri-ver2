'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { PageTitle } from '@/components/ui';
import { LiveBanner, type LiveState } from '@/components/Live';
import { NoAccess, usePerms } from '@/components/Perms';

// 本番切り替えの突き合わせ（設定の中・10-25）。今の社内システムの数と ver2 の数を並べて、同じなら ✓、違えば ⚠ と差。
//   ★読むだけ。数は /api/live/cutover がサーバで今のシステムの GET を読んで出す（どの口を読むかは route.ts の説明）
//   ver2 は本番に入れる前に shoya ともう一度確かめる（10-23）。ここが全部 ✓ になってから
type Row = { label: string; legacy: number | null; v2: number | null; unit: '人' | '円' | '件'; ref?: boolean; note?: string };
type Section = { key: string; title: string; legacyFrom: string; v2From: string; note?: string; rows: Row[]; error?: string };
type Resp = { ok: true; ym: string; months: string[]; sections: Section[]; generatedAt: string };

const ymLabel = (ym: string) => `${ym.slice(0, 4)}年${Number(ym.slice(5))}月`;
const fmt = (n: number | null, unit: Row['unit']) => (n == null ? '—' : `${n.toLocaleString('ja-JP')}${unit}`);

function Mark({ r }: { r: Row }) {
  if (r.ref) return <span className="text-xs text-faint">参考</span>;
  if (r.legacy == null || r.v2 == null) return <span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}><TriangleAlert size={11} />片方だけ</span>;
  const d = r.v2 - r.legacy;
  if (d === 0) return <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}><Check size={11} />✓ 同じ</span>;
  return <span className="chip" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}><TriangleAlert size={11} />⚠ {d > 0 ? '+' : '−'}{Math.abs(d).toLocaleString('ja-JP')}{r.unit}</span>;
}
const isOk = (r: Row) => r.ref || (r.legacy != null && r.v2 != null && r.legacy === r.v2);

export default function CutoverPage() {
  const { manageAccess } = usePerms();
  const [ym, setYm] = useState(() => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 7));   // 今月（日本時間）
  const [state, setState] = useState<LiveState>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<Resp | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/live/cutover?ym=${ym}`, { cache: 'no-store' });
      const j = (await r.json().catch(() => ({}))) as Resp & { error?: string };
      if (r.status === 401 && j.error === 'not_logged_in') { setState('sample'); return; }
      if (!r.ok) { setError(j.error || `読めませんでした（${r.status}）`); setState('error'); return; }
      setData(j); setError(''); setState('live');
    } catch (e) { setError((e as Error).message); setState('error'); }
    finally { setBusy(false); }
  }, [ym]);
  useEffect(() => { if (manageAccess) void load(); }, [load, manageAccess]);

  if (!manageAccess) return <NoAccess label="本番切り替えの突き合わせ" />;
  // 見本の数はやめた（10-26）。ログインが切れていたら何も並べない（LiveBanner がログインの案内）
  const sample = state === 'sample';
  const sections = state === 'live' ? data?.sections ?? [] : [];
  const months = [...new Set([ym, ...(data?.months ?? [])])].sort().reverse();
  const shownYm = ym;
  const all = sections.flatMap((s) => s.rows);
  const ng = all.filter((r) => !isOk(r)).length + sections.filter((s) => s.error).length;

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="本番切り替えの突き合わせ" sub="今の社内システムと ver2 の数を並べて、同じか確かめる（見るだけ）">
        <label className="flex items-center gap-1.5 text-sm text-muted">月
          <select value={shownYm} onChange={(e) => setYm(e.target.value)} disabled={busy || months.length === 0} className="rounded-lg border border-field bg-surface px-2 py-1.5 text-body text-ink disabled:opacity-50">
            {months.map((m) => <option key={m} value={m}>{ymLabel(m)}</option>)}
          </select>
        </label>
      </PageTitle>
      <div className="mo-fade-up rounded-xl border px-4 py-3 text-body" style={{ background: 'var(--tone-info-bg)', color: 'var(--tone-info-fg)', borderColor: 'var(--tone-info-bar, var(--color-line))' }}>
        <b>切り替え前に、この画面で全部 ✓ になっていることを確かめる</b>
        <div className="mt-0.5 text-sm">⚠ が残っていたら、差の理由が分かるまで切り替えない。本番に入れる前に shoya ともう一度確かめます。</div>
      </div>
      <LiveBanner state={state} error={error} onReload={load} note="今の社内システムの数を読んでいます（見るだけ・何も書きません）" />

      {(state === 'loading' || busy) && !sample && <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-body text-muted">今の社内システムの数を読んでいます…（30秒ほど）</div>}

      {sections.length > 0 && !busy && (
        <div className="mo-fade-up flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-body" style={{ ['--i' as string]: 1 }}>
          {ng === 0 ? <><Check size={18} className="text-ok" /><b>全部 ✓ です</b><span className="text-muted">（{ymLabel(shownYm)}）</span></>
            : <><TriangleAlert size={18} className="text-bad" /><b>⚠ が {ng} つあります</b><span className="text-muted">（{ymLabel(shownYm)}）</span></>}
          {data?.generatedAt && !sample && <span className="ml-auto text-xs text-faint">{new Date(data.generatedAt).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })} に読んだ数</span>}
        </div>
      )}

      {!busy && sections.map((s, i) => (
        <section key={s.key} className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: i + 2 }}>
          <div className="px-4 py-3">
            <h2 className="text-md font-bold">{s.title}</h2>
            <div className="text-sm text-muted">今：{s.legacyFrom}／ver2：{s.v2From}</div>
            {s.note && <div className="mt-0.5 text-xs text-faint">{s.note}</div>}
            {s.error && <div className="mt-1 flex items-start gap-1 text-sm text-bad"><TriangleAlert size={13} className="mt-0.5 shrink-0" />⚠ 読めなかったもの：{s.error}</div>}
          </div>
          {s.rows.length > 0 && (
            <div className="overflow-x-auto border-t border-line-soft">
              <table className="w-full min-w-[560px] border-collapse text-body">
                <thead><tr className="th-row text-left">
                  <th className="px-4 py-2 font-semibold">項目</th><th className="px-2 py-2 text-right font-semibold">今の社内システム</th><th className="px-2 py-2 text-right font-semibold">ver2</th><th className="px-4 py-2 font-semibold">結果</th>
                </tr></thead>
                <tbody>
                  {s.rows.map((r, j) => (
                    <tr key={`${r.label}-${j}`} className={`row border-t border-line-soft ${r.ref ? 'text-muted' : ''}`}>
                      <td className="px-4 py-2">{r.label}</td>
                      <td className="num px-2 py-2 text-right">{fmt(r.legacy, r.unit)}</td>
                      <td className="num px-2 py-2 text-right">{fmt(r.v2, r.unit)}</td>
                      <td className="px-4 py-2"><Mark r={r} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </main>
  );
}
