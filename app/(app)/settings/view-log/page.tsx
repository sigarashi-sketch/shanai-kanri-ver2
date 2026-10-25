'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye, Lock, Search } from 'lucide-react';
import { PageTitle } from '@/components/ui';
import { LiveBanner, type LiveState } from '@/components/Live';
import { NoAccess, usePerms } from '@/components/Perms';
import { legacyRoleLabel } from '@/lib/org';

// 閲覧ログ（設定の中・全体管理者だけ・10-25）。だれが、だれのチャット・基本情報・面談メモ・要約を開いたか。新しい順。
//   本物＝今の社内システムの GET /api/assistant?action=v2-views（/api/live/view-logs が読む・super_admin だけ）。
//   ログインしていなければ見本の行。見るだけ（消したり直したりはしない）。
type Row = { at: string; email: string; role: string; kind: string; target: string; page: string };
const KIND_LABEL: Record<string, string> = { chat: 'チャット', basic: '基本情報', memo: '面談メモ', summary: '要約', other: 'そのほか' };
const KIND_TONE: Record<string, string> = { chat: 'info', basic: 'ok', memo: 'caution', summary: 'purple', other: 'mute' };
const DAYS = [{ v: 1, label: '今日（24時間）' }, { v: 7, label: '7日' }, { v: 30, label: '30日' }, { v: 90, label: '90日' }, { v: 0, label: 'すべて' }];

const h = (n: number) => new Date(Date.now() - n * 3600000).toISOString();
const SAMPLE: Row[] = [
  { at: h(0.3), email: 'nakamura@example.com', role: 'staff', kind: 'chat', target: '佐藤 健太', page: '/jinji/staff/r0000001' },
  { at: h(1.2), email: 'kobayashi@example.com', role: 'sales_admin', kind: 'summary', target: '伊藤 誠', page: '/eigyo/proper' },
  { at: h(3.5), email: 'tanaka@example.com', role: 'admin', kind: 'basic', target: '林 さくら', page: '/jinji/staff/r0000002' },
  { at: h(26), email: 'nakamura@example.com', role: 'staff', kind: 'memo', target: '高橋 健', page: '/jinji/saiyou' },
  { at: h(50), email: 'fujikawa@example.com', role: 'staff', kind: 'basic', target: '渡辺 涼', page: '/jinji/staff/r0000003' },
  { at: h(200), email: 'kobayashi@example.com', role: 'sales_admin', kind: 'chat', target: '加藤 葵', page: '/eigyo/proper' },
];

const fmtAt = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '—';
  return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function ViewLogPage() {
  const { manageAccess } = usePerms();
  const [kind, setKind] = useState('');
  const [days, setDays] = useState(7);
  const [q, setQ] = useState('');
  const [qq, setQq] = useState('');          // 打ち終わってから読む
  const [state, setState] = useState<LiveState>('loading');
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => { const t = setTimeout(() => setQq(q.trim()), 400); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ days: String(days) });
    if (kind) p.set('kind', kind);
    if (qq) p.set('q', qq);
    try {
      const r = await fetch(`/api/live/view-logs?${p}`, { cache: 'no-store' });
      const j = (await r.json().catch(() => ({}))) as { rows?: Row[]; error?: string };
      if (r.status === 401 && j.error === 'not_logged_in') { setState('sample'); return; }
      if (r.status === 403) { setForbidden(true); setState('live'); return; }
      if (r.status === 404) { setError('今の社内システムに閲覧ログの口がまだありません'); setState('error'); return; }
      if (!r.ok) { setError(j.error || `読めませんでした（${r.status}）`); setState('error'); return; }
      setRows(j.rows || []); setError(''); setState('live');
    } catch (e) { setError((e as Error).message); setState('error'); }
  }, [days, kind, qq]);
  useEffect(() => { if (manageAccess) void load(); }, [load, manageAccess]);

  if (!manageAccess) return <NoAccess label="閲覧ログ" />;
  if (forbidden) return (
    <main className="px-6 pb-12 pt-[22px]">
      <div className="mo-fade-up rounded-xl border border-line bg-surface px-8 py-14 text-center">
        <Lock className="mx-auto text-faint" size={28} />
        <h1 className="mt-3 text-xl font-bold">閲覧ログは全体管理者（super_admin）だけが見られます</h1>
        <p className="mt-2 text-body text-muted">今の社内システムのロールで判定しています。</p>
      </div>
    </main>
  );

  // 見本のときも同じ絞りをかける
  const since = days ? Date.now() - days * 86400000 : 0;
  const shown = state === 'sample'
    ? SAMPLE.filter((r) => (!kind || r.kind === kind) && (!since || Date.parse(r.at) >= since) && (!qq || r.target.includes(qq) || r.email.includes(qq))).sort((a, b) => b.at.localeCompare(a.at))
    : rows;

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="閲覧ログ" sub="だれが、だれのチャット・基本情報・面談メモ・要約を開いたか（新しい順・見るだけ）" />
      <LiveBanner state={state} error={error} onReload={load} note="今の社内システムの記録を読んでいます（全体管理者だけ・見るだけ）" />

      <section className="mo-fade-up flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <label className="flex items-center gap-1.5 text-sm text-muted">見たもの
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg border border-field bg-surface px-2 py-1.5 text-body text-ink">
            <option value="">すべて</option>
            {(['chat', 'basic', 'memo', 'summary'] as const).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-sm text-muted">期間
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-field bg-surface px-2 py-1.5 text-body text-ink">
            {DAYS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-field bg-surface px-2 py-1.5 text-body sm:max-w-[260px]">
          <Search size={14} className="shrink-0 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="見られた人・見た人で探す" aria-label="見られた人・見た人で探す" className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <span className="ml-auto text-sm text-faint">{state === 'loading' ? '読んでいます…' : `${shown.length}件`}</span>
      </section>

      <section className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-body">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">いつ</th><th className="px-2 py-2.5 font-semibold">見た人</th><th className="px-2 py-2.5 font-semibold">見たもの</th><th className="px-2 py-2.5 font-semibold">だれの</th><th className="px-4 py-2.5 font-semibold">画面</th>
            </tr></thead>
            <tbody>
              {shown.map((r, i) => {
                const tone = KIND_TONE[r.kind] ?? 'mute';
                return (
                  <tr key={`${r.at}-${r.email}-${i}`} className="row mo-fade-in border-t border-line-soft" style={{ ['--i' as string]: Math.min(i, 12) }}>
                    <td className="num whitespace-nowrap px-4 py-2.5">{fmtAt(r.at)}</td>
                    <td className="px-2 py-2.5"><div className="font-semibold">{r.email.split('@')[0] || '—'}</div><div className="text-xs text-faint">{r.email}{r.role ? `・${legacyRoleLabel(r.role)}` : ''}</div></td>
                    <td className="px-2 py-2.5"><span className="chip" style={{ background: `var(--tone-${tone}-bg)`, color: `var(--tone-${tone}-fg)` }}><Eye size={11} />{KIND_LABEL[r.kind] ?? r.kind}</span></td>
                    <td className="px-2 py-2.5 font-semibold">{r.target || '—'}</td>
                    <td className="px-4 py-2.5 text-sm text-muted">{r.page || '—'}</td>
                  </tr>
                );
              })}
              {state !== 'loading' && shown.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-body text-muted">この条件の記録はありません</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-xs text-faint">新しい順に最大200件。もっと前は期間を広げてください。{state === 'sample' && '（見本）'}</p>
    </main>
  );
}
