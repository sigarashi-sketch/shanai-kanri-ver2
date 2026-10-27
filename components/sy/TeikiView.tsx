'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, ChevronLeft, ChevronRight, Crown, Plus, Search, Settings2, Trash2, X } from 'lucide-react';
import { fx } from '@/components/sy/compat';
import type { Member } from '@/components/sy/compat';
import { normName } from '@/lib/sy/name';
import { DEFAULT_TEIKI, LEADER_LABEL, MENDAN_KINDS, MENDAN_KIND_NAME, OTHER_COLOR, mendanKindOf, type MendanKind, type TeikiEvent, type TeikiRecord, type TeikiSettings, type TeikiTantou } from '@/lib/sy/teiki-types';
import { MemberDrawer } from '@/components/sy/compat';
import MendanRemindModal from '@/components/sy/MendanRemind';
import { MinutesModal } from '@/components/sy/MemoEdit';
import { useRoster } from '@/components/sy/useRoster';
import { Avatar, Chip, PageHeader, StageBadge, btnGray, btnPrimary, inputCls } from '@/components/sy/ui';
import { useKept } from '@/components/sy/compat';

// 予定は件名に合言葉（既定「定期面談」）があるものだけ（/m/community の予約も、件名に無ければ出さない）
const onlyTitled = (evs: TeikiEvent[], kws: string[]) => evs.filter((e) => kws.some((k) => (e.summary || '').includes(k)));

// 定期面談ページ。
//   いちばん上: 面談の件数（月別・担当ごとに リーダー面談／フォロー面談／定期面談。MonthlyCounts）
//   上: カレンダー（担当のGoogleカレンダーを重ねた「予定」＝枠線 ＋ 実施した面談の記録＝塗り。色は担当ごと・設定で変えられる）
//   下: 一覧（名前／最後に定期面談をした日時）。切り替えで「今月まだ」「一度もなし」「リーダー」
//   リーダー面談（吉村さんが各コミュニティのリーダーとする面談）: メモの区分が「リーダー面談」の記録と、件名に「リーダー面談」がある予定。
//     カレンダーでは王冠つき。「リーダー」に切り替えるとリーダーだけ並び、最後のリーダー面談の日時を出す。定期面談の回数にも数える
//   予定は いけどんの /api/gcal?action=teikiEvents（s.igarashi のGoogle連携で担当のカレンダーを読む・件名に合言葉を含むものだけ）
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const jstYmd = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10));
const jstHm = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(11, 16);
const pad = (n: number) => String(n).padStart(2, '0');
const addDays = (ymd: string, n: number) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400e3);
const fmtAt = (iso: string) => { const d = jstYmd(iso); return `${d.slice(0, 4)}/${Number(d.slice(5, 7))}/${Number(d.slice(8))} ${jstHm(iso)}`; };

interface CalItem { id: string; day: string; time: string; title: string; color: string; done: boolean; tantou: string; who: string; rec?: TeikiRecord; key?: string; leader: boolean }
type View = 'all' | 'month' | 'never' | 'leader';
interface Plan { at: string; allDay: boolean; title: string; cal: string }
const fmtPlan = (p: Plan) => { const d = jstYmd(p.at); return `${Number(d.slice(5, 7))}/${Number(d.slice(8))}（${WD[new Date(d + 'T00:00:00Z').getUTCDay()]}）${p.allDay ? '' : ' ' + jstHm(p.at)}`; };

export default function TeikiView() {
  const { members, clubs, patchMember } = useRoster();
  const [today] = useState(() => jstYmd(new Date().toISOString()));
  const [nowMs] = useState(() => Date.now());
  const [ym, setYm] = useState(today.slice(0, 7));
  const [records, setRecords] = useState<TeikiRecord[] | null>(null);
  const [settings, setSettings] = useState<TeikiSettings>(DEFAULT_TEIKI);
  const [err, setErr] = useState('');
  const [events, setEvents] = useState<TeikiEvent[]>([]);
  const [upcoming, setUpcoming] = useState<TeikiEvent[]>([]);   // 今日から先の予定（一覧の「面談予定日」用。表示中の月とは別に読む）
  const [planF, setPlanF] = useState<'' | 'yes' | 'no'>('');
  const [calNote, setCalNote] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selDay, setSelDay] = useState<string | null>(null);
  const [view, setView] = useKept<View>('view', 'month');   // 更新しても戻す（lib/keep.ts）
  const [incYotei, setIncYotei] = useState(false);
  const [sortNew, setSortNew] = useState(false);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [openKey, setOpenKey] = useKept<string | null>('open', null);
  const [leaderNorms, setLeaderNorms] = useState<Set<string>>(new Set());   // 各コミュニティのリーダー（正規化氏名）

  const load = useCallback(() => fetch('/api/sy/s/teiki').then((r) => r.json()).then((j) => {
    if (j.error) { setErr(j.error); return; }
    setRecords(j.records || []); setSettings(j.settings || DEFAULT_TEIKI);
  }).catch(() => setErr('読み込みに失敗しました')), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/sy/s/teams').then((r) => r.json()).then((j) => setLeaderNorms(new Set(((j.teams || []) as { leader_norm_name: string | null }[]).map((t) => t.leader_norm_name || '').filter(Boolean)))).catch(() => { /* リーダーの絞り込みが空になるだけ */ });
  }, []);

  // カレンダーの表示範囲（その月の1日を含む週の日曜 〜 6週ぶん）
  const grid = useMemo(() => {
    const first = ym + '-01';
    const start = addDays(first, -new Date(first + 'T00:00:00Z').getUTCDay());
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    return days[35].slice(0, 7) === ym ? days : days.slice(0, 35);
  }, [ym]);
  const calKey = settings.tantou.map((t) => t.email).filter(Boolean).join(',');
  const kwKey = [...new Set([...settings.keywords, LEADER_LABEL])].join(',');   // 「リーダー面談」は設定に無くても拾う
  useEffect(() => {
    if (!calKey) return;   // カレンダーの無い設定のときは下で空として扱う
    let dead = false;
    const p = new URLSearchParams({ action: 'teikiEvents', from: grid[0] + 'T00:00:00+09:00', to: addDays(grid[grid.length - 1], 1) + 'T00:00:00+09:00', cals: calKey, kw: kwKey });
    fetch('/api/sy/gcal?' + p.toString()).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (dead) return;
      if (!r.ok || !j.ok) { setEvents([]); setCalNote([`Googleカレンダーの予定を読めませんでした（${j.hint || j.error || r.status}）。実施の記録だけ出しています`]); return; }
      setEvents(onlyTitled(j.events || [], kwKey.split(',')));
      const notes: string[] = [];
      calKey.split(',').forEach((c) => {
        if (j.errors?.[c]) notes.push(`${c} のカレンダーを読めません。${j.tokenEmail} に共有（予定の詳細を表示）してください`);
        else if (j.roles?.[c] === 'freeBusyReader') notes.push(`${c} のカレンダーは「予定あり」しか見えない共有です。件名で面談を見分けられないので「予定の詳細を表示」に変えてください`);
      });
      setCalNote(notes);
    }).catch(() => { if (!dead) setCalNote(['Googleカレンダーの予定を読めませんでした。実施の記録だけ出しています']); });
    return () => { dead = true; };
  }, [grid, calKey, kwKey]);

  // 一覧用: 今日から約3か月先までの予定
  useEffect(() => {
    if (!calKey) return;
    let dead = false;
    const p = new URLSearchParams({ action: 'teikiEvents', from: today + 'T00:00:00+09:00', to: addDays(today, 92) + 'T00:00:00+09:00', cals: calKey, kw: kwKey });
    fetch('/api/sy/gcal?' + p.toString()).then((r) => r.json()).then((j) => { if (!dead && j.ok) setUpcoming(onlyTitled(j.events || [], kwKey.split(','))); }).catch(() => { /* 予定日が出ないだけ */ });
    return () => { dead = true; };
  }, [today, calKey, kwKey]);

  // 予定の件名から「誰の面談か」を引く（件名に氏名が入っている前提。いちばん長く一致した名前を採る）
  const nameIndex = useMemo(() => (members || []).filter((m) => m.kind === 'employee').map((m) => ({ key: m.key, n: normName(m.name) })).filter((x) => x.n.length >= 2).sort((a, b) => b.n.length - a.n.length), [members]);
  const personOf = useCallback((summary: string) => { const s = normName(summary); return nameIndex.find((x) => s.includes(x.n))?.key || ''; }, [nameIndex]);

  // 担当の引き当て（メール → 設定の担当。分からなければ「その他」）
  const tantouOf = useCallback((email: string, name = ''): TeikiTantou | null =>
    settings.tantou.find((t) => t.email && t.email === email) || (name ? settings.tantou.find((t) => name.includes(t.name)) : undefined) || null, [settings]);
  const items = useMemo<CalItem[]>(() => {
    const out: CalItem[] = [];
    (calKey ? events : []).forEach((e) => {
      const t = tantouOf(e.cal);
      out.push({ id: 'ev' + e.cal + e.id, day: jstYmd(e.start), time: e.allDay ? '' : jstHm(e.start), title: e.summary || '（件名なし）', color: t?.color || OTHER_COLOR, done: false, tantou: t?.id || '', who: t?.name || e.cal, key: personOf(e.summary), leader: (e.summary || '').includes(LEADER_LABEL) });
    });
    (records || []).forEach((r) => {
      const t = tantouOf(r.tantou, r.tantouName);
      out.push({ id: r.id, day: jstYmd(r.at), time: jstHm(r.at), title: r.name, color: t?.color || OTHER_COLOR, done: true, tantou: t?.id || '', who: t?.name || r.tantouName || '担当不明', rec: r, key: r.key, leader: r.leader });
    });
    return out.filter((i) => !hidden.has(i.tantou || '__other')).sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
  }, [events, records, tantouOf, hidden, calKey, personOf]);
  const byDay = useMemo(() => { const m = new Map<string, CalItem[]>(); items.forEach((i) => m.set(i.day, [...(m.get(i.day) || []), i])); return m; }, [items]);

  // 一覧: 対象＝在籍中の従業員（退社は出さない・入社予定は切り替えで含める）
  // 人ごとの「次の面談予定」（もう過ぎた予定は出さない＝当日でも時刻を過ぎたら消える。終日の予定はその日の終わりまで）
  const planOf = useMemo(() => {
    const m = new Map<string, Plan>();
    (calKey ? upcoming : []).forEach((e) => {
      const end = e.allDay ? Date.parse(jstYmd(e.start) + 'T23:59:59+09:00') : Date.parse(e.start);
      if (!(end > nowMs)) return;
      const k = personOf(e.summary); if (!k) return;
      const cur = m.get(k);
      if (!cur || e.start < cur.at) m.set(k, { at: e.start, allDay: e.allDay, title: e.summary, cal: e.cal });
    });
    return m;
  }, [upcoming, calKey, personOf, nowMs]);
  const lastOf = useMemo(() => { const m = new Map<string, { last: TeikiRecord; n: number }>(); (records || []).forEach((r) => { const c = m.get(r.key); if (!c) m.set(r.key, { last: r, n: 1 }); else c.n += 1; }); return m; }, [records]);
  const lastLeaderOf = useMemo(() => { const m = new Map<string, { last: TeikiRecord; n: number }>(); (records || []).filter((r) => r.leader).forEach((r) => { const c = m.get(r.key); if (!c) m.set(r.key, { last: r, n: 1 }); else c.n += 1; }); return m; }, [records]);
  const isLeader = useCallback((m: Member) => leaderNorms.has(normName(m.name)), [leaderNorms]);
  const targets = useMemo(() => (members || []).filter((m) => m.kind === 'employee' && m.status !== '退社' && !m.bousan && (incYotei || m.status !== '入社予定')), [members, incYotei]);   // ぼうさん（接触禁止）は 定期面談の対象に数えない
  const thisYm = today.slice(0, 7);
  const doneThisMonth = (m: Member) => { const l = lastOf.get(m.key); return !!l && jstYmd(l.last.at).slice(0, 7) === thisYm; };
  const nMonth = targets.filter((m) => !doneThisMonth(m)).length;
  const nNever = targets.filter((m) => !lastOf.has(m.key)).length;
  const nLeader = targets.filter(isLeader).length;
  const shownLast = view === 'leader' ? lastLeaderOf : lastOf;   // 「リーダー」ではリーダー面談だけで数える
  const qq = q.replace(/[\s　]+/g, '');
  const nPlan = targets.filter((m) => planOf.has(m.key)).length;
  const rows = targets.filter((m) => (view === 'all' || (view === 'leader' ? isLeader(m) : view === 'month' ? !doneThisMonth(m) : !lastOf.has(m.key))) &&
    (!planF || (planF === 'yes') === planOf.has(m.key)) &&
    (!qq || (m.name + m.kana + m.recruitTantou + m.community).replace(/[\s　]+/g, '').includes(qq)))
    .sort((a, b) => {
      const x = shownLast.get(a.key)?.last.at || '', y = shownLast.get(b.key)?.last.at || '';
      return (sortNew ? y.localeCompare(x) : x.localeCompare(y)) || a.name.localeCompare(b.name, 'ja');
    });

  const moveMonth = (d: number) => { const [y, m] = ym.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + d, 1)); setYm(`${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`); setSelDay(null); };
  const openM = openKey ? (members || []).find((m) => m.key === openKey) || null : null;
  const onClose = useCallback(() => { setOpenKey(null); load(); }, [load]);
  const dayItems = selDay ? byDay.get(selDay) || [] : [];
  // 議事録の窓（2026-10-09 shoya「定期面談ページからも議事録を開けるように」）。押した記録の人の面談を 新しい順に並べて めくれるようにする
  const [minute, setMinute] = useState<{ id: string; key: string; name: string } | null>(null);
  const openMinute = (r: TeikiRecord) => setMinute({ id: r.id, key: r.key, name: r.name });
  const minutes = useMemo(() => {
    if (!minute) return [];
    const nn = normName(minute.name);
    return (records || []).filter((r) => r.key === minute.key || (!!nn && normName(r.name) === nn)).map((r) => ({
      id: r.id, memoId: r.source === 'soreike' ? r.id.slice(2) : '', at: r.at, kind: mendanKindOf(r), label: r.label,
      by: tantouOf(r.tantou, r.tantouName)?.name || r.tantouName || r.tantou.split('@')[0], body: r.body, details: r.details,
    }));
  }, [minute, records, tantouOf]);
  const minuteM = minute ? (members || []).find((m) => m.key === minute.key) || null : null;
  const memberKeys = useMemo(() => new Set((members || []).map((m) => m.key)), [members]);

  return (
    <div>
      <PageHeader title="定期面談" sub={members && records ? `対象 ${targets.length}人・今月実施 ${targets.length - nMonth}人・今月まだ ${nMonth}人・一度もなし ${nNever}人` : '読み込み中…'}>
        <button onClick={() => setReminding(true)} className={`ig-press inline-flex items-center gap-1.5 ${btnGray}`}><BellRing size={16} />リマインド</button>
        <button onClick={() => setEditing(true)} className={`ig-press inline-flex items-center gap-1.5 ${btnGray}`}><Settings2 size={16} />担当と色の設定</button>
      </PageHeader>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 md:px-6">
        {err && <p className="text-sm text-ig-danger">{err}</p>}
        {records && <MonthlyCounts records={records} tantouOf={tantouOf} settings={settings} thisYm={thisYm} ym={ym} onPick={(m) => { setYm(m); setSelDay(null); }} />}

        <section className="rounded-lg border border-ig-border bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-ig-divider px-3 py-2">
            <button onClick={() => moveMonth(-1)} className="rounded p-1 hover:bg-ig-hover" title="前の月"><ChevronLeft size={18} /></button>
            <h2 className="w-24 text-center text-sm font-bold tabular-nums">{ym.slice(0, 4)}年{Number(ym.slice(5))}月</h2>
            <button onClick={() => moveMonth(1)} className="rounded p-1 hover:bg-ig-hover" title="次の月"><ChevronRight size={18} /></button>
            {ym !== thisYm && <button onClick={() => { setYm(thisYm); setSelDay(null); }} className="rounded-lg bg-ig-hover px-2.5 py-1 text-xs font-semibold">今月</button>}
            <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {[...settings.tantou.map((t) => ({ id: t.id, name: t.name, color: t.color })), { id: '__other', name: '担当不明', color: OTHER_COLOR }].map((t) => {
                const off = hidden.has(t.id);
                return (
                  <button key={t.id} onClick={() => setHidden((s) => { const x = new Set(s); if (off) x.delete(t.id); else x.add(t.id); return x; })} title="押すと表示/非表示"
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${off ? 'text-ig-muted line-through opacity-50' : 'font-semibold'}`}>
                    <span className="h-3 w-3 rounded-full" style={{ background: t.color }} />{t.name}
                  </button>
                );
              })}
              <span className="flex items-center gap-2 border-l border-ig-divider pl-3 text-ig-muted">
                <span className="inline-flex items-center gap-1"><span className="h-3 w-5 rounded border-2 border-ig-muted" />予定</span>
                <span className="inline-flex items-center gap-1"><span className="h-3 w-5 rounded bg-ig-muted" />実施</span>
                <span className="inline-flex items-center gap-1"><Crown size={12} />リーダー面談</span>
              </span>
            </div>
          </div>
          {(calKey ? calNote : []).map((n) => <p key={n} className="flex items-start gap-1.5 border-b border-ig-divider bg-ig-subtle px-3 py-1.5 text-xs text-ig-warn"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{n}</p>)}
          <div className="grid grid-cols-7 border-b border-ig-divider text-center text-[11px] font-semibold text-ig-muted">
            {WD.map((w, i) => <div key={w} className={`py-1 ${i === 0 ? 'text-ig-danger' : i === 6 ? 'text-ig-primary' : ''}`}>{w}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((d, i) => {
              const its = byDay.get(d) || []; const out = d.slice(0, 7) !== ym;
              return (
                <div key={d} role="button" tabIndex={0} onClick={() => setSelDay(selDay === d ? null : d)} onKeyDown={(e) => { if (e.key === 'Enter') setSelDay(selDay === d ? null : d); }}
                  className={`min-h-[84px] cursor-pointer border-b border-r border-ig-divider p-1 text-left align-top ${i % 7 === 6 ? 'border-r-0' : ''} ${out ? 'bg-ig-subtle' : ''} ${selDay === d ? 'ring-2 ring-inset ring-ig-primary' : 'hover:bg-ig-hover'}`}>
                  <div className={`mb-0.5 text-[11px] tabular-nums ${out ? 'text-ig-border' : 'text-ig-muted'}`}>
                    <span className={d === today ? 'rounded-full bg-ig-text px-1.5 py-0.5 font-bold text-white' : ''}>{Number(d.slice(8))}</span>
                  </div>
                  <div className="space-y-0.5">
                    {its.slice(0, 3).map((it) => <CalChip key={it.id} it={it} onOpen={it.rec ? () => openMinute(it.rec!) : it.key && memberKeys.has(it.key) ? () => setOpenKey(it.key!) : undefined} />)}
                    {its.length > 3 && <div className="px-1 text-[10px] text-ig-muted">ほか{its.length - 3}件</div>}
                  </div>
                </div>
              );
            })}
          </div>
          {selDay && (
            <div className="border-t border-ig-border p-3">
              <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold">{Number(selDay.slice(5, 7))}月{Number(selDay.slice(8))}日（{WD[new Date(selDay + 'T00:00:00Z').getUTCDay()]}）<span className="ml-2 text-xs font-normal text-ig-muted">{dayItems.length}件</span></h3>
                <button onClick={() => setSelDay(null)} className="text-ig-muted"><X size={16} /></button></div>
              {dayItems.length === 0 && <p className="text-xs text-ig-muted">この日の予定・実施はありません</p>}
              <ul className="space-y-2">
                {dayItems.map((it) => (
                  <li key={it.id} className="flex gap-2 text-sm">
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={it.done ? { background: it.color } : { border: `2px solid ${it.color}` }} />
                    <div className="min-w-0 flex-1">
                      <div><span className="tabular-nums text-ig-muted">{it.time || '終日'}</span> {it.leader && <Crown size={13} className="mr-0.5 inline align-[-2px] text-ig-warn" />}
                        {/* 名前（予定は件名）を押すと 名簿と同じ詳細パネル（情報・チャット）。名簿の人と分かったものだけ押せる */}
                        {it.key && memberKeys.has(it.key)
                          ? <button onClick={() => setOpenKey(it.key!)} title="名簿の詳細・チャットを開く" className="font-semibold underline decoration-ig-border underline-offset-2 hover:text-ig-primary hover:decoration-ig-primary">{it.title}</button>
                          : <span className="font-semibold">{it.title}</span>}
                        <span className="ml-2 text-xs text-ig-muted">{it.done ? `実施・${it.rec?.label}` : '予定'}・{it.who}</span>
                        {it.rec && <button onClick={() => openMinute(it.rec!)} className="ml-2 text-xs font-semibold text-ig-link hover:underline">議事録を開く</button>}</div>
                      {it.rec?.body && <p className="whitespace-pre-wrap break-words text-xs text-ig-text">{it.rec.body}</p>}
                      {it.rec?.details.map((dd) => <p key={dd.k} className="whitespace-pre-wrap break-words text-xs"><span className="text-ig-muted">{dd.k}：</span>{dd.v}</p>)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <Chip on={view === 'month'} onClick={() => setView('month')}>今月まだ {members && records ? nMonth : '…'}</Chip>
            <Chip on={view === 'never'} onClick={() => setView('never')}>一度もなし {members && records ? nNever : '…'}</Chip>
            <Chip on={view === 'all'} onClick={() => setView('all')}>全員 {members ? targets.length : '…'}</Chip>
            <Chip on={view === 'leader'} onClick={() => setView('leader')}><Crown size={12} className="mr-0.5 inline align-[-1px]" />リーダー {members ? nLeader : '…'}</Chip>
            <span className="mx-1 h-5 border-l border-ig-divider" />
            <Chip on={planF === 'yes'} onClick={() => setPlanF(planF === 'yes' ? '' : 'yes')}>予定あり {members ? nPlan : '…'}</Chip>
            <Chip on={planF === 'no'} onClick={() => setPlanF(planF === 'no' ? '' : 'no')}>予定なし</Chip>
            <span className="mx-1 h-5 border-l border-ig-divider" />
            <Chip on={incYotei} onClick={() => setIncYotei((x) => !x)}>入社予定も含める</Chip>
            <Chip on={sortNew} onClick={() => setSortNew((x) => !x)}>{sortNew ? '最近した順' : 'していない順'}</Chip>
            <label className="relative ml-auto block"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ig-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・採用担当・コミュニティ" className={`${inputCls} w-56 py-1.5 pl-9`} /></label>
          </div>
          <div className="overflow-hidden rounded-lg border border-ig-border bg-white">
            <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_9rem_15rem] gap-3 border-b border-ig-divider bg-ig-subtle px-3 py-1.5 text-[11px] font-semibold text-ig-muted md:grid">
              <span>名前</span><span>コミュニティ・採用担当</span><span>面談予定日</span><span className="text-right">{view === 'leader' ? '最後のリーダー面談' : '最後の定期面談'}</span>
            </div>
            {(!members || !records) && <p className="p-8 text-center text-sm text-ig-muted">読み込み中…</p>}
            {members && records && rows.length === 0 && <p className="p-8 text-center text-sm text-ig-muted">{view === 'month' ? '今月は全員と面談できています' : view === 'leader' ? 'リーダーが見つかりません（コミュニティでリーダーを決めると並びます）' : '該当なし'}</p>}
            {members && records && rows.map((m) => {
              const l = shownLast.get(m.key); const t = l ? tantouOf(l.last.tantou, l.last.tantouName) : null;
              const ago = l ? daysBetween(jstYmd(l.last.at), today) : 0;
              const pl = planOf.get(m.key); const pt = pl ? tantouOf(pl.cal) : null;
              return (
                <button key={m.key} data-ctx-name={m.name} data-ctx-key={m.key} onClick={() => setOpenKey(m.key)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b border-ig-divider px-3 py-1.5 text-left text-sm last:border-b-0 hover:bg-ig-subtle md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_9rem_15rem]">
                  <span className="flex min-w-0 items-center gap-2"><Avatar name={m.name} src={m.photo} size="sm" /><span className="truncate font-semibold">{m.name}</span>{isLeader(m) && <Crown size={13} className="shrink-0 text-ig-warn" />}<StageBadge stage={m.status} /></span>
                  <span className="hidden truncate text-xs text-ig-muted md:block">{[m.community, m.recruitTantou && `採用 ${m.recruitTantou}`].filter(Boolean).join('・') || '—'}</span>
                  <span className="hidden text-xs md:block" title={pl?.title}>{pl ? <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold tabular-nums" style={{ border: `1.5px solid ${pt?.color || OTHER_COLOR}`, color: pt?.color || OTHER_COLOR }}>{fmtPlan(pl)}</span> : <span className="text-ig-border">—</span>}</span>
                  <span className="text-right text-xs">
                    {l ? <>
                      {/* 日付を押すと その面談の議事録（行のほかの所は 名簿の詳細） */}
                      <span role="button" tabIndex={0} title="議事録を開く" onClick={(e) => { e.stopPropagation(); openMinute(l.last); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); openMinute(l.last); } }}
                        className="tabular-nums font-semibold text-ig-link underline-offset-2 hover:underline">{fmtAt(l.last.at)}</span>
                      <span className={`ml-1.5 ${ago > 45 ? 'font-semibold text-ig-danger' : 'text-ig-muted'}`}>{ago === 0 ? '今日' : `${ago}日前`}</span>
                      <span className="ml-1.5 inline-flex items-center gap-1 text-ig-muted"><span className="h-2 w-2 rounded-full" style={{ background: t?.color || OTHER_COLOR }} />{t?.name || '不明'}・{l.n}回</span>
                    </> : <span className="rounded bg-ig-danger/10 px-1.5 py-0.5 font-semibold text-ig-danger">まだ一度もなし</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {reminding && <MendanRemindModal onClose={() => setReminding(false)} />}
      {editing && <SettingsModal init={settings} onClose={() => setEditing(false)} onSaved={(s) => { setSettings(s); setEditing(false); }} />}
      {minute && !openM && <MinutesModal name={minute.name} list={minutes} id={minute.id} onPick={(id) => setMinute({ ...minute, id })} onClose={() => setMinute(null)} onChanged={load}
        onOpenMember={minuteM ? () => { setMinute(null); setOpenKey(minuteM.key); } : undefined} />}
      {openM && <MemberDrawer m={openM} clubs={clubs} onClose={onClose} onPatch={(p) => patchMember(openM.key, p)} leader={isLeader(openM)} />}
    </div>
  );
}

// いちばん上の件数の表。実施した面談（記録）を 月 × 担当（書いた人）× 区分（リーダー／フォロー／定期）で数える。
//   担当は設定の人を先に、設定に無い人が書いていればその人も、書いた人が分からない記録は「担当不明」。
//   月の行を押すとカレンダーがその月に移る。既定は直近6か月（記録のある月と今月）
function MonthlyCounts({ records, tantouOf, settings, thisYm, ym, onPick }: { records: TeikiRecord[]; tantouOf: (email: string, name?: string) => TeikiTantou | null; settings: TeikiSettings; thisYm: string; ym: string; onPick: (ym: string) => void }) {
  const [all, setAll] = useState(false);
  const { cols, months, cell } = useMemo(() => {
    const cols = settings.tantou.map((t) => ({ id: t.id, name: t.name, color: t.color }));
    const cell = new Map<string, number>();   // `${月}|${担当}|${区分}`
    const months = new Set<string>([thisYm]);
    let unknown = false;
    records.forEach((r) => {
      const t = tantouOf(r.tantou, r.tantouName);
      let id = t?.id || '';
      if (!id && (r.tantou || r.tantouName)) {
        id = 'x:' + (r.tantou || r.tantouName);
        if (!cols.some((c) => c.id === id)) cols.push({ id, name: r.tantouName || r.tantou.split('@')[0], color: OTHER_COLOR });
      }
      if (!id) { id = '__other'; unknown = true; }
      const m = jstYmd(r.at).slice(0, 7); months.add(m);
      const k = `${m}|${id}|${mendanKindOf(r)}`; cell.set(k, (cell.get(k) || 0) + 1);
    });
    if (unknown) cols.push({ id: '__other', name: '担当不明', color: OTHER_COLOR });
    return { cols, months: [...months].sort().reverse(), cell };
  }, [records, tantouOf, settings, thisYm]);
  const n = (m: string, c: string, k: MendanKind) => cell.get(`${m}|${c}|${k}`) || 0;
  const num = (v: number, bold = false) => <span className={v ? (bold ? 'font-bold' : 'font-semibold') : 'text-ig-border'}>{v}</span>;
  const shown = all ? months : months.slice(0, 6);
  const groups = [...cols, { id: '__sum', name: '合計', color: '' }];
  const val = (m: string, g: string, k: MendanKind) => (g === '__sum' ? cols.reduce((s, c) => s + n(m, c.id, k), 0) : n(m, g, k));
  return (
    <section className="overflow-hidden rounded-lg border border-ig-border bg-white">
      <div className="flex items-center gap-2 border-b border-ig-divider px-3 py-2">
        <h2 className="text-sm font-bold">面談の件数（月別・担当ごと）</h2>
        <span className="text-[11px] text-ig-muted">実施した記録の数</span>
        {months.length > 6 && <button onClick={() => setAll((x) => !x)} className="ml-auto text-xs text-ig-primary">{all ? '直近6か月だけ' : `すべての月（${months.length}）`}</button>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs tabular-nums">
          <thead>
            <tr className="bg-ig-subtle text-ig-muted">
              <th rowSpan={2} className="sticky left-0 bg-ig-subtle px-3 py-1 text-left font-semibold">月</th>
              {groups.map((g) => (
                <th key={g.id} colSpan={4} className="border-l border-ig-divider px-2 py-1 text-center font-semibold text-ig-text">
                  <span className="inline-flex items-center gap-1.5">{g.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />}{g.name}</span>
                </th>
              ))}
            </tr>
            <tr className="border-b border-ig-divider bg-ig-subtle text-[11px] text-ig-muted">
              {groups.map((g) => [...MENDAN_KINDS.map((k) => <th key={g.id + k} className={`whitespace-nowrap px-2 py-1 text-right font-semibold ${k === MENDAN_KINDS[0] ? 'border-l border-ig-divider' : ''}`}>{MENDAN_KIND_NAME[k]}</th>),
                <th key={g.id + 'sum'} className="px-2 py-1 text-right font-semibold">計</th>])}
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m} onClick={() => onPick(m)} title="押すとカレンダーがこの月に移ります" className={`cursor-pointer border-b border-ig-divider last:border-b-0 hover:bg-ig-hover ${m === ym ? 'bg-ig-subtle' : ''}`}>
                <td className={`sticky left-0 whitespace-nowrap px-3 py-1.5 font-semibold ${m === ym ? 'bg-ig-subtle' : 'bg-white'}`}>{m.slice(0, 4)}年{Number(m.slice(5))}月{m === thisYm && <span className="ml-1 text-[10px] font-normal text-ig-muted">今月</span>}</td>
                {groups.map((g) => {
                  const vs = MENDAN_KINDS.map((k) => val(m, g.id, k));
                  return [...vs.map((v, i) => <td key={g.id + i} className={`px-2 py-1.5 text-right ${i === 0 ? 'border-l border-ig-divider' : ''}`}>{num(v)}</td>),
                    <td key={g.id + 'sum'} className="px-2 py-1.5 text-right">{num(vs.reduce((a, b) => a + b, 0), true)}</td>];
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// カレンダーの中の1件。実施＝担当の色で塗る／予定＝担当の色の枠線。誰の面談か分かるものは押すとその人の詳細が開く
function CalChip({ it, onOpen }: { it: CalItem; onOpen?: () => void }) {
  return (
    <div role={onOpen ? 'button' : undefined} onClick={onOpen ? (e) => { e.stopPropagation(); onOpen(); } : undefined} title={`${it.time} ${it.title}（${it.leader ? 'リーダー面談・' : ''}${it.done ? '実施' : '予定'}・${it.who}）`} className={`truncate rounded px-1 text-[10px] leading-4 ${onOpen ? 'cursor-pointer hover:opacity-80' : ''}`}
      style={it.done ? { background: it.color, color: '#fff' } : { border: `1.5px solid ${it.color}`, color: it.color, background: '#fff' }}>
      {it.leader && <Crown size={9} className="mr-0.5 inline align-[-1px]" />}{it.time && <span className="mr-0.5 tabular-nums opacity-80">{it.time}</span>}{it.title}
    </div>
  );
}

// 担当（名前・Googleカレンダーのアドレス・色）と、予定を拾う合言葉。保存すると全員の画面で同じになる
function SettingsModal({ init, onClose, onSaved }: { init: TeikiSettings; onClose: () => void; onSaved: (s: TeikiSettings) => void }) {
  const [tantou, setTantou] = useState<TeikiTantou[]>(init.tantou.map((t) => ({ ...t })));
  const [kw, setKw] = useState(init.keywords.join('、'));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const patch = (i: number, p: Partial<TeikiTantou>) => setTantou((ts) => ts.map((t, k) => (k === i ? { ...t, ...p } : t)));
  async function save() {
    setBusy(true); setErr('');
    const r = await fetch('/api/sy/s/teiki', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tantou, keywords: kw.split(/[、,\s]+/).filter(Boolean) }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setErr(j.error || '保存できませんでした'); return; }
    fx.toast('設定を保存しました'); onSaved(j.settings);
  }
  return (
    <div className="ig-scrim fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="ig-pop w-full max-w-lg overflow-hidden rounded-xl bg-white">
        <div className="flex items-center justify-between border-b border-ig-divider px-4 py-3"><span className="font-semibold">担当と色の設定</span><button onClick={onClose}><X size={20} /></button></div>
        <div className="space-y-3 p-4 text-sm">
          <div className="space-y-2">
            {tantou.map((t, i) => (
              <div key={t.id} className="flex items-center gap-2">
                <input type="color" value={t.color} onChange={(e) => patch(i, { color: e.target.value })} title="色" className="h-9 w-10 shrink-0 cursor-pointer rounded border border-ig-border bg-white p-0.5" />
                <input value={t.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="名前" className={`${inputCls} w-24 py-1.5`} />
                <input value={t.email} onChange={(e) => patch(i, { email: e.target.value })} placeholder="Googleカレンダーのアドレス" className={`${inputCls} min-w-0 flex-1 py-1.5`} />
                <button onClick={() => setTantou((ts) => ts.filter((_, k) => k !== i))} title="外す" className="rounded p-1 text-ig-muted hover:bg-ig-hover hover:text-ig-danger"><Trash2 size={16} /></button>
              </div>
            ))}
            {tantou.length < 6 && <button onClick={() => setTantou((ts) => [...ts, { id: 't' + Date.now(), name: '', email: '', color: '#2e9e4f' }])} className="inline-flex items-center gap-1 text-xs text-ig-primary"><Plus size={14} />担当を足す</button>}
          </div>
          <label className="block text-xs text-ig-muted">予定として拾う件名の合言葉（「、」区切り）
            <input value={kw} onChange={(e) => setKw(e.target.value)} className={`${inputCls} mt-1 w-full py-1.5 text-sm text-ig-text`} /></label>
          {err && <p className="text-ig-danger">{err}</p>}
          <div className="flex justify-end gap-2"><button onClick={onClose} className={btnGray}>やめる</button><button disabled={busy} onClick={save} className={btnPrimary}>保存する</button></div>
        </div>
      </div>
    </div>
  );
}
