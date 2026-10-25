'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { LiveBanner, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { PersonName } from '@/components/Person';
import { postLive } from '@/lib/live/post-live';
import { sampleApps } from '@/lib/mendan-sample';
import { APP_STATUSES, appStatusLabel, pct, type AppItem, type AppsResp } from '@/lib/live/keisai';

// 応募管理（今の /case-apps.html）。未対応 → 確認中 → 面談調整中 → 成約／見送り。戻すこともできる（押し間違いを直せるように・今と同じ）
const TABS = [{ k: 'new', label: '未対応' }, { k: 'working', label: '対応中' }, { k: 'all', label: 'すべて' }, { k: 'declined', label: '見送り' }] as const;
type Tab = (typeof TABS)[number]['k'];
const TONE: Record<string, { bg: string; fg: string }> = {
  new: { bg: 'var(--tone-bad-bg)', fg: 'var(--tone-bad-fg)' }, checking: { bg: 'var(--tone-info-bg)', fg: 'var(--tone-info-fg)' },
  interview: { bg: 'var(--tone-info-bg)', fg: 'var(--tone-info-fg)' }, passed: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)' }, declined: { bg: 'var(--tone-mute-bg)', fg: 'var(--tone-mute-fg)' },
};
const fmtDt = (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? '—' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const ago = (s: string, now: number) => { const ms = Date.parse(s); if (!isFinite(ms)) return ''; const d = now - ms; return d < 3600_000 ? `${Math.max(1, Math.floor(d / 60_000))}分前` : d < 86400_000 ? `${Math.floor(d / 3600_000)}時間前` : `${Math.floor(d / 86400_000)}日前`; };

export function AppsTab() {
  const canEdit = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const ap = useIke<AppsResp>('case-admin?action=applications', { pollMs: 120_000 });
  const live = ap.live;
  const mk = useMikeiken();
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); }, []);
  const [sample, setSample] = useState<AppsResp | null>(null);
  useEffect(() => { if (ap.state === 'sample' && !sample) setSample(sampleApps(Date.now())); }, [ap.state, sample]);
  const data = live ? ap.data : sample;
  const [patch, setPatch] = useState<Record<string, string>>({});
  useEffect(() => { setPatch({}); }, [ap.data]);
  // 未経験の人だけ。氏名が決まっていない応募（LINE のつなぎ未確定）は名前が無いので出す（本人を確かめるところから）
  const items = useMemo(() => {
    const all = (data?.items ?? []).map((x) => (patch[x.id] ? { ...x, status: patch[x.id], statusLabel: appStatusLabel(patch[x.id]) } : x));
    return live ? all.filter((x) => x.unlinked || mk.has(x.name)) : all;
  }, [data, patch, live, mk]);
  const [tab, setTab] = useState<Tab>('new');
  const [hl, setHl] = useState('');
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('id'); if (id) { setHl(id); setTab('all'); } }, []);
  const [err, setErr] = useState('');
  const vis = items.filter((i) => tab === 'all' || (tab === 'new' ? i.status === 'new' : tab === 'declined' ? i.status === 'declined' : i.status === 'checking' || i.status === 'interview'));
  const cnt = { new: items.filter((i) => i.status === 'new').length, working: items.filter((i) => i.status === 'checking' || i.status === 'interview').length, all: items.length, declined: items.filter((i) => i.status === 'declined').length };
  const k = data?.kpi;

  const change = async (x: AppItem, status: string, noUndo = false) => {
    if (!canEdit || x.status === status) return;
    const prev = x.status;
    setErr('');
    setPatch((s) => ({ ...s, [x.id]: status }));
    const undo = noUndo ? undefined : () => { void change({ ...x, status }, prev, true); };
    if (live) {
      const r = await postLive('/api/live/case-admin', { op: 'app-status', id: x.id, status });
      if (!r.ok) { setPatch((s) => ({ ...s, [x.id]: prev })); setErr(`ステータスを変えられませんでした：${r.error}`); return; }
      ap.reload();
    }
    hit();
    toast({ text: `${x.name || '氏名未確定の応募'}を「${appStatusLabel(status)}」に`, sub: `${x.caseTitle}${live ? '' : '（見本なので保存していません）'}`, undo });
  };

  const csv = () => {
    const head = ['応募日時', '受付番号', '氏名', '案件', 'エリア', 'スキルシート', 'ひとこと', 'ステータス', '締切後の応募'];
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const body = vis.map((r) => [r.appliedAt, r.appNo, r.name, r.caseTitle, r.caseArea || '', r.skillsheetLabel, r.note || '', r.statusLabel, r.lateApply ? 'はい' : ''].map(q).join(','));
    const url = URL.createObjectURL(new Blob(['﻿' + [head.map(q).join(','), ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `case-applications_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <LiveBanner state={ap.state} error={ap.error} onReload={ap.reload} note="案件ページからの応募（新しい順・最大500件）。ステータスはここで変えられます" />
      <MikeikenNote mk={mk} live={live} />
      {err && <div role="alert" className="mo-shake flex items-start gap-2 rounded-xl border px-4 py-2.5 text-[12.5px]" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)', borderColor: 'var(--tone-bad-bar)' }}><TriangleAlert size={14} className="mt-0.5" /><span className="flex-1">{err}</span><button onClick={() => setErr('')} aria-label="閉じる"><X size={14} /></button></div>}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Kpi l="今週の応募" v={k ? String(k.thisWeek) : '-'} s={k ? `前週 ${k.lastWeek}` : ''} />
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5">
          <RemainRing remain={cnt.new} total={Math.max(cnt.new, cnt.all)} />
          <div><div className="text-[12px] font-semibold text-muted">未対応</div><div className="num text-[20px] font-bold" style={{ color: cnt.new ? 'var(--color-bad)' : undefined }}>{cnt.new}</div>
            <div className="text-[11px] text-faint">{k?.oldestNewAt && now ? `いちばん古いもの ${ago(k.oldestNewAt, now)}` : ''}</div></div>
        </div>
        <Kpi l="面談調整中" v={k ? String(k.interviewCount) : '-'} />
        <Kpi l="応募 → 面談化率" v={k ? pct(k.interviewRate) : '-'} s={k ? `直近30日 / ${k.last30Total}件中${k.last30Interview}件` : '直近30日'} />
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b border-line">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className="whitespace-nowrap px-3 py-2 text-[13.5px]" style={tab === t.k ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: 'var(--color-muted)' }}>
            {t.label} <span className="num">{cnt[t.k]}</span></button>
        ))}
        <span className="ml-auto flex items-center gap-2 pb-1">
          {live && <button onClick={ap.reload} className="inline-flex items-center gap-1 text-[12px] text-muted"><RefreshCw size={12} />読み直す</button>}
          <button onClick={csv} disabled={!vis.length} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-field px-2.5 text-[12px] font-semibold disabled:opacity-40"><Download size={12} />CSV で出す</button>
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[900px] border-collapse text-[13px]">
          <thead><tr className="th-row text-left">{['応募日時', '受付番号', '要員', '案件', 'スキルシート', 'ひとこと', 'ステータス'].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {vis.map((r) => (
              <tr key={r.id} className="row border-t border-line-soft align-top" style={hl && hl === r.appNo ? { background: 'var(--al)' } : undefined}>
                <td className="num whitespace-nowrap px-3 py-2">{fmtDt(r.appliedAt)}<div className="text-[11.5px] text-faint">{now ? ago(r.appliedAt, now) : ''}</div></td>
                <td className="num whitespace-nowrap px-3 py-2 text-muted">{r.appNo || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.name ? <PersonName name={r.name} /> : <span className="font-semibold">（氏名未確定）</span>}
                  {r.unlinked && <div className="text-[11.5px]" style={{ color: 'var(--color-warn)' }}>LINE のつなぎが未確定</div>}</td>
                <td className="px-3 py-2">{r.caseTitle}<div className="text-[11.5px] text-faint">{[r.caseStation, r.caseArea].filter(Boolean).join('・')}</div>
                  {r.lateApply && <div className="text-[11.5px]" style={{ color: 'var(--color-warn)' }}>締切後の応募</div>}</td>
                <td className="whitespace-nowrap px-3 py-2"><span className="chip" style={r.skillsheetState === 'submitted' ? { background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' } : { background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{r.skillsheetLabel}</span></td>
                <td className="max-w-[240px] px-3 py-2 text-muted">{r.note || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <select value={r.status} disabled={!canEdit} onChange={(e) => void change(r, e.target.value)} title={!canEdit ? needText('edit') : undefined} aria-label="ステータス"
                    className="min-h-8 rounded-lg border-0 px-2 text-[12.5px] font-semibold disabled:opacity-60" style={{ background: (TONE[r.status] ?? TONE.new).bg, color: (TONE[r.status] ?? TONE.new).fg }}>
                    {APP_STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {vis.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">{ap.state === 'loading' ? '読み込み中…' : 'この条件の応募はありません'}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Kpi({ l, v, s }: { l: string; v: string; s?: string }) {
  return <div className="rounded-xl border border-line bg-surface px-3.5 py-2.5"><div className="text-[12px] font-semibold text-muted">{l}</div><div className="num mt-0.5 text-[20px] font-bold">{v}</div>{s && <div className="text-[11px] text-faint">{s}</div>}</div>;
}
