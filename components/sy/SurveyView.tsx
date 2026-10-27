'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Send } from 'lucide-react';
import { fx } from '@/components/sy/compat';
import { foldSearch, normName } from '@/lib/sy/name';
import { SURVEY_CUTOFF as CUTOFF, answeredTargets, isSurveyTarget, surveyMonthOf } from '@/lib/sy/survey';
import { Chip, PageHeader, Tabs, btnPrimary, inputCls } from '@/components/sy/ui';
import MemberDrawer from '@/components/sy/MemberDrawer';
import { useRoster } from '@/components/sy/useRoster';
import { SendDialog, SurveyTplSettings, useSurveyTpl } from '@/components/sy/SurveyTpl';
import { latestByPerson, ruleHits, ruleLabel, type ScoreRule } from '@/lib/sy/survey-tpl-types';
import { useKept } from '@/components/sy/compat';

export interface SurveyRow {
  id: string; submitted_at: string; name: string; eki: string; gyomu: string; manzoku: string;
  manzoku_score: number | null; riyu: string; shikaku: string; shikaku_riyu: string; mokuhyo: string; sonota: string;
}
// 満足度の帯。mood は顔の表情（MoodFace）
const BANDS = [
  { k: '10～8', min: 8, c: '#2e9e4f', mood: 'great' }, { k: '7～6', min: 6, c: '#0095f6', mood: 'good' },
  { k: '5～3', min: 3, c: '#e07a00', mood: 'meh' }, { k: '2～1', min: 0, c: '#ed4956', mood: 'bad' },
] as const;
type Mood = (typeof BANDS)[number]['mood'] | 'none';
const band = (s: number | null) => (s == null ? null : BANDS.find((b) => s >= b.min) || null);
const moodOfAvg = (a: number): Mood => (a ? band(a)?.mood || 'none' : 'none');

// 何月分の回答か・誰が答えたかの決め方は lib/survey.ts（チャットのオレンジ強調と同じ規則）
const monthLabel = (ym: string) => `${Number(ym.slice(5))}月分`;
const mean = (xs: SurveyRow[]) => { const s = xs.filter((r) => r.manzoku_score != null); return s.length ? s.reduce((a, r) => a + Number(r.manzoku_score), 0) / s.length : 0; };
const isLow = (r: SurveyRow) => { const b = band(r.manzoku_score); return !!b && (b.mood === 'meh' || b.mood === 'bad'); };
const noStudy = (r: SurveyRow) => /出来ていない|できていない/.test(r.shikaku);
type Row = SurveyRow & { ym: string; prev: number | null };
type Sort = 'new' | 'low';

export default function SurveyView({ rows }: { rows: SurveyRow[] }) {
  // 何月分かを付ける＋同じ人の前の月の満足度を引く（上がった/下がったを出す）
  const all = useMemo<Row[]>(() => {
    const withYm = rows.map((r) => ({ ...r, ym: surveyMonthOf(r.submitted_at), prev: null as number | null }));
    const by = new Map<string, Row[]>();
    withYm.forEach((r) => { const k = normName(r.name); by.set(k, [...(by.get(k) || []), r]); });
    by.forEach((xs) => {
      xs.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
      xs.forEach((r, i) => { const p = [...xs.slice(0, i)].reverse().find((x) => x.ym < r.ym); r.prev = p ? p.manzoku_score : null; });
    });
    return withYm;
  }, [rows]);
  const months = useMemo(() => [...new Set(all.map((r) => r.ym))].sort().reverse(), [all]);
  const [month, setMonth] = useState(months[0] || '');
  const [bandK, setBandK] = useState('');
  const [only, setOnly] = useState<'' | 'low' | 'nostudy' | 'sonota' | 'down' | 'none'>('');
  const [sort, setSort] = useState<Sort>('new');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const { members, clubs, patchMember, error: rosterError } = useRoster();
  // 名前を押すと 従業員名簿と同じ詳細パネル（情報・チャット）を開く（2026-10-07 shoya「月次アンケートも同じ使用感で」）。回答の名前は名簿と突き合わせる（同名は従業員を優先）
  const [openKey, setOpenKey] = useKept<string | null>('open', null);   // 更新しても開いていた人に戻す（lib/keep.ts）
  const keyOfNorm = useMemo(() => { const x = new Map<string, string>(); (members || []).forEach((m) => { const k = normName(m.name); if (!x.has(k) || m.kind === 'employee') x.set(k, m.key); }); return x; }, [members]);
  const openM = openKey ? (members || []).find((m) => m.key === openKey) || null : null;
  const closeMember = useCallback(() => setOpenKey(null), []);
  // スコア別の文章（components/SurveyTpl.tsx）。行の「文章を送る」は その人の その月分のいちばん新しい回答にだけ出す（サーバも 新しいほうで決める）
  const tpl = useSurveyTpl();
  const [tplOpen, setTplOpen] = useState(false);
  const [sendTo, setSendTo] = useState<{ r: Row; rule: ScoreRule } | null>(null);
  const latestIds = useMemo(() => new Set([...latestByPerson(all, (r) => `${r.ym}|${normName(r.name)}`).values()].map((r) => r.id)), [all]);
  const ruleOf = (r: Row) => (latestIds.has(r.id) ? (tpl.rules || []).find((x) => ruleHits(x, r.manzoku)) || null : null);

  // 名簿の詳細パネルの上にも「文章を送る」（2026-10-09 shoya・このページから開いたときだけ）。見るのは 選んでいる月分（「すべて」なら その人のいちばん新しい月分）の回答
  const drawerRow = openM ? all.filter((r) => latestIds.has(r.id) && normName(r.name) === openM.key.slice(2) && (!month || r.ym === month)).sort((a, b) => b.ym.localeCompare(a.ym))[0] || null : null;
  const drawerRule = drawerRow ? ruleOf(drawerRow) : null;
  const drawerSent = drawerRow ? tpl.sent[`${drawerRow.ym}|${normName(drawerRow.name)}`] || '' : '';
  const drawerTop = drawerRow && (
    <div className="flex flex-wrap items-center gap-2 border-b border-ig-divider bg-ig-subtle px-4 py-2 text-xs">
      <span className="text-ig-muted">{monthLabel(drawerRow.ym)}のアンケート</span>
      <b style={{ color: band(drawerRow.manzoku_score)?.c }}>満足度 {drawerRow.manzoku || '—'}</b>
      <span className="ml-auto">
        {drawerSent ? <span className="font-semibold text-ig-ok">文章 {drawerSent}</span>
          : drawerRule ? <button type="button" onClick={() => setSendTo({ r: drawerRow, rule: drawerRule })} className={`${btnPrimary} inline-flex items-center gap-1 px-3 py-1 text-xs`}><Send size={12} />スコア {ruleLabel(drawerRule)} の文章を送る</button>
          : <span className="text-ig-muted">このスコアに当たる文章は まだありません</span>}
      </span>
    </div>
  );

  const fq = foldSearch(q);   // 検索は 空白のありなし・異体字を区別しない
  const inMonth = all.filter((r) => !month || r.ym === month);
  const prevMonth = month ? months[months.indexOf(month) + 1] : '';
  const prevRows = prevMonth ? all.filter((r) => r.ym === prevMonth) : [];
  // 未回答の稼働者（オレンジで強調）。名簿はいまの状態しか分からないので、出すのはいちばん新しい月だけ
  const isLatest = !!month && month === months[0];
  const active = (members || []).filter(isSurveyTarget);
  const answered = answeredTargets(inMonth.map((r) => normName(r.name)), active.map((m) => m.key.slice(2)));
  const missingAll = isLatest ? active.filter((m) => !answered.has(m.key.slice(2))) : [];
  const missing = missingAll.filter((m) => !fq || foldSearch([m.name, m.kana, m.community, m.siteEki].join(' ')).includes(fq))
    .sort((a, b) => (a.community || '\uffff').localeCompare(b.community || '\uffff', 'ja') || (a.kana || a.name).localeCompare(b.kana || b.name, 'ja'));
  const showMissing = isLatest && !bandK && (!only || only === 'none');
  const list = only === 'none' ? [] : inMonth.filter((r) => (!bandK || band(r.manzoku_score)?.k === bandK) &&
    (only === 'low' ? isLow(r) : only === 'nostudy' ? noStudy(r) : only === 'sonota' ? !!r.sonota.trim() : only === 'down' ? r.prev != null && r.manzoku_score != null && r.manzoku_score < r.prev : true) &&
    (!fq || foldSearch([r.name, r.riyu, r.sonota, r.gyomu, r.eki, r.mokuhyo].join(' ')).includes(fq)))
    .sort((a, b) => (sort === 'low' ? (a.manzoku_score ?? 99) - (b.manzoku_score ?? 99) : 0) || b.submitted_at.localeCompare(a.submitted_at));

  return (
    <div>
      <PageHeader title="月次アンケート" sub={`${month ? monthLabel(month) : 'すべての月'}・${inMonth.length}件${isLatest && members ? `・未回答 ${missingAll.length}人（稼働中・待機 ${active.length}人）` : ''}`}>
        <label className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ig-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・理由・業務・駅" className={`${inputCls} w-56 py-1.5 pl-9`} /></label>
        <button type="button" onClick={() => setTplOpen(true)} disabled={tpl.rules == null} className={`${btnPrimary} inline-flex items-center gap-1.5`}><Send size={14} />スコア別の文章{tpl.rules && tpl.rules.length > 0 && <span className="rounded-full bg-white/25 px-1.5 text-[11px]">{tpl.rules.length}</span>}</button>
      </PageHeader>
      <Tabs value={month} onChange={(m) => { setMonth(m); setBandK(''); setOnly(''); }} items={[...months.map((m) => [m, `${monthLabel(m)} ${all.filter((r) => r.ym === m).length}`] as [string, string]), ['', 'すべて']]} />
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-4 md:px-6">
        <Dashboard rows={inMonth} prev={prevRows} all={all} months={months} month={month} bandK={bandK} setBandK={setBandK} />
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip on={!only && !bandK} onClick={() => { setOnly(''); setBandK(''); }}>すべて {inMonth.length}</Chip>
          <Chip on={only === 'low'} onClick={() => setOnly(only === 'low' ? '' : 'low')}>満足度が低い {inMonth.filter(isLow).length}</Chip>
          <Chip on={only === 'down'} onClick={() => setOnly(only === 'down' ? '' : 'down')}>前の月より下がった {inMonth.filter((r) => r.prev != null && r.manzoku_score != null && r.manzoku_score < r.prev).length}</Chip>
          <Chip on={only === 'nostudy'} onClick={() => setOnly(only === 'nostudy' ? '' : 'nostudy')}>資格に未着手 {inMonth.filter(noStudy).length}</Chip>
          {isLatest && <Chip on={only === 'none'} onClick={() => { setBandK(''); setOnly(only === 'none' ? '' : 'none'); }}>未回答 {members ? missingAll.length : '…'}</Chip>}
          <Chip on={only === 'sonota'} onClick={() => setOnly(only === 'sonota' ? '' : 'sonota')}>その他に記入あり {inMonth.filter((r) => r.sonota.trim()).length}</Chip>
          <span className="ml-auto flex gap-1"><Chip on={sort === 'new'} onClick={() => setSort('new')}>新しい順</Chip><Chip on={sort === 'low'} onClick={() => setSort('low')}>低い順</Chip></span>
        </div>
        {showMissing && (
          <div className="overflow-hidden rounded-lg border border-ig-warn bg-ig-warn/10">
            <div className="border-b border-ig-warn/40 px-3 py-1.5 text-xs font-bold text-ig-warn">
              未回答の稼働者 {members ? `${missing.length}人` : ''}
              <span className="ml-2 font-normal">{rosterError ? `名簿を読めませんでした（${rosterError}）` : !members ? '名簿を読み込み中…' : `稼働中・待機 ${active.length}人のうち・${CUTOFF}日以降の回答がない人`}</span>
            </div>
            {missing.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-3 lg:grid-cols-5">
                {missing.map((m) => (
                  <button key={m.key} data-ctx-name={m.name} data-ctx-key={m.key} type="button" onClick={() => setOpenKey(m.key)} className="min-w-0 rounded-md border border-ig-warn/60 bg-ig-warn/25 px-2 py-1 text-left hover:bg-ig-warn/40">
                    <div className="flex items-center gap-1"><span className="truncate text-sm font-semibold">{m.name}</span>{m.status === '待機' && <span className="shrink-0 rounded bg-ig-warn px-1 text-[10px] font-bold text-white">待機</span>}</div>
                    <div className="truncate text-[11px] text-ig-muted">{m.community || 'コミュニティなし'}{m.siteEki && `・${m.siteEki}`}</div>
                  </button>
                ))}
              </div>
            )}
            {members && missing.length === 0 && <div className="p-4 text-center text-xs text-ig-muted">{q ? '該当する人がいません' : '稼働中・待機の全員が回答済みです'}</div>}
          </div>
        )}
        {only !== 'none' && <div className="overflow-hidden rounded-lg border border-ig-border bg-white">
          <div className="hidden grid-cols-[13rem_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)_1.25rem] gap-3 border-b border-ig-divider bg-ig-subtle px-3 py-1.5 text-[11px] font-semibold text-ig-muted lg:grid">
            <span>満足度・名前</span><span>業務内容</span><span>満足度の理由／その他</span><span>資格</span><span />
          </div>
          {list.map((r) => <Item key={r.id} r={r} open={open === r.id} onOpen={() => setOpen(open === r.id ? null : r.id)} showMonth={!month} memberKey={keyOfNorm.get(normName(r.name)) || ''} onMember={setOpenKey} rule={ruleOf(r)} sentNote={tpl.sent[`${r.ym}|${normName(r.name)}`] || ''} onSend={(rule) => setSendTo({ r, rule })} />)}
          {list.length === 0 && <div className="p-8 text-center text-sm text-ig-muted">該当する回答がありません</div>}
        </div>}
      </div>
      {tplOpen && <SurveyTplSettings tpl={tpl} month={month} monthLabel={month ? monthLabel(month) : ''} answers={[...latestByPerson(inMonth, (r) => normName(r.name)).values()]} onClose={() => setTplOpen(false)} />}
      {sendTo && <SendDialog rule={sendTo.rule} month={sendTo.r.ym} monthLabel={monthLabel(sendTo.r.ym)} only={{ key: normName(sendTo.r.name), name: sendTo.r.name }} onClose={() => setSendTo(null)} onSent={(keys) => tpl.markSent(sendTo.r.ym, keys)} />}
      {openM && <MemberDrawer m={openM} clubs={clubs} onClose={closeMember} onPatch={(p) => patchMember(openM.key, p)} top={drawerTop} />}
    </div>
  );
}

// 1回答＝1行。閉じたままでも 業務・理由・その他・資格 が読める（2行まで）。押すと全文
// 名前だけは別の押し先＝名簿の詳細パネル（行全体が button なので span で受ける。名簿に居ない名前は押せない）
// rule = この回答に当たる スコア別の文章（無ければ ボタンを出さない）。送信済みなら ボタンの代わりに その印
function Item({ r, open, onOpen, showMonth, memberKey, onMember, rule, sentNote, onSend }: { r: Row; open: boolean; onOpen: () => void; showMonth: boolean; memberKey: string; onMember: (k: string) => void; rule: ScoreRule | null; sentNote: string; onSend: (rule: ScoreRule) => void }) {
  const b = band(r.manzoku_score);
  const diff = r.prev != null && r.manzoku_score != null ? r.manzoku_score - r.prev : 0;
  const clamp = open ? 'whitespace-pre-wrap' : 'line-clamp-2';
  return (
    <button onClick={onOpen} className={`group grid w-full grid-cols-1 gap-x-3 gap-y-1 border-b border-ig-divider px-3 py-2 text-left text-xs last:border-b-0 hover:bg-ig-subtle lg:grid-cols-[13rem_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)_1.25rem] ${open ? 'bg-ig-subtle' : ''}`}>
      <div className="flex min-w-0 items-center gap-2">
        <MoodFace mood={b?.mood || 'none'} size={34} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">{memberKey
            ? <span role="link" tabIndex={0} title="名簿の詳細・チャットを開く" onClick={(e) => { e.stopPropagation(); onMember(memberKey); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); onMember(memberKey); } }}
                className="truncate text-sm font-semibold underline decoration-ig-border underline-offset-2 hover:text-ig-primary hover:decoration-ig-primary">{r.name}</span>
            : <span className="truncate text-sm font-semibold">{r.name}</span>}
            {diff !== 0 && <span className={`shrink-0 rounded px-1 text-[10px] font-bold ${diff > 0 ? 'bg-ig-ok/10 text-ig-ok' : 'bg-ig-danger/10 text-ig-danger'}`}>{diff > 0 ? '▲上がった' : '▼下がった'}</span>}</div>
          <div className="truncate text-[11px] text-ig-muted"><b style={{ color: b?.c }}>{r.manzoku || '—'}</b>{r.eki && `・${r.eki}`}{showMonth && `・${monthLabel(r.ym)}`}</div>
          {sentNote ? <div className="mt-0.5 truncate text-[10px] font-semibold text-ig-ok">文章 {sentNote}</div>
            : rule && <span role="button" tabIndex={0} title={`スコア ${ruleLabel(rule)} の文章を この人の LINE に送る（押すと確認が出ます）`} onClick={(e) => { e.stopPropagation(); onSend(rule); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); onSend(rule); } }}
                className="mt-1 inline-flex items-center gap-1 rounded-full border border-ig-primary px-2 py-0.5 text-[11px] font-semibold text-ig-primary hover:bg-ig-primary hover:text-white"><Send size={11} />文章を送る</span>}
        </div>
      </div>
      <div className={`${clamp} break-words text-ig-text`}>{r.gyomu || <span className="text-ig-muted">—</span>}</div>
      <div className="min-w-0 space-y-0.5">
        <div className={`${clamp} break-words`}>{r.riyu || <span className="text-ig-muted">—</span>}</div>
        {r.sonota.trim() && <div className={`${clamp} break-words text-ig-warn`}><span className="mr-1 rounded bg-ig-warn/10 px-1 text-[10px] font-bold">その他</span>{r.sonota}</div>}
      </div>
      <div className="min-w-0 space-y-0.5">
        <div className={`${clamp} break-words ${noStudy(r) ? 'font-semibold text-ig-danger' : ''}`}>{r.shikaku || <span className="text-ig-muted">—</span>}</div>
        {r.mokuhyo && <div className="truncate text-ig-muted">目標：{r.mokuhyo}</div>}
        {open && r.shikaku_riyu && <div className="whitespace-pre-wrap break-words text-ig-muted">理由：{r.shikaku_riyu}</div>}
        {open && <div suppressHydrationWarning className="text-[10px] text-ig-muted">回答 {new Date(r.submitted_at).toLocaleString('ja-JP')}</div>}
      </div>
      <ChevronDown size={14} className={`hidden self-center text-ig-muted transition-transform lg:block ${open ? 'rotate-180' : ''}`} />
    </button>
  );
}

// 顔（満足度の表情）。大きな目・ほっぺ・汗・涙の、まんがっぽい描き方。帯の色を輪に使う
export function MoodFace({ mood, size = 32, bounce }: { mood: Mood; size?: number; bounce?: boolean }) {
  const c = mood === 'none' ? '#a8a8a8' : BANDS.find((b) => b.mood === mood)!.c;
  const INK = '#262626';
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={`shrink-0 ${bounce ? 'ig-face-bounce' : 'ig-face'}`} aria-hidden="true">
      <circle cx={24} cy={24} r={23} fill={c} opacity={0.16} />
      <circle cx={24} cy={24} r={22.2} fill="none" stroke={c} strokeWidth={1.6} />
      <circle cx={24} cy={26} r={15} fill="#ffe1cc" />
      <path d="M8.6 25 a15.4 15.4 0 0 1 30.8 0 q-5 -9 -13 -8 q-4 5 -11 4 q-4 0 -6.8 4z" fill={INK} />
      {mood === 'great' && <>
        <path d="M14.5 27.5 l4 -3 l-4 -3 M33.5 27.5 l-4 -3 l4 -3" stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18.5 31 q5.5 7 11 0z" fill="#d6455d" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
        <ellipse cx={13.5} cy={31} rx={3} ry={1.8} fill="#ff9fb0" opacity={0.8} /><ellipse cx={34.5} cy={31} rx={3} ry={1.8} fill="#ff9fb0" opacity={0.8} />
        <path d="M40 6 l1.2 3 l3 1.2 l-3 1.2 l-1.2 3 l-1.2 -3 l-3 -1.2 l3 -1.2z" fill="#feda75" />
      </>}
      {mood === 'good' && <>
        <ellipse cx={18} cy={26} rx={2.6} ry={3.4} fill={INK} /><ellipse cx={30} cy={26} rx={2.6} ry={3.4} fill={INK} />
        <circle cx={18.9} cy={24.8} r={1} fill="#fff" /><circle cx={30.9} cy={24.8} r={1} fill="#fff" />
        <path d="M20 32.5 q4 3.5 8 0" stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        <ellipse cx={13.5} cy={31} rx={2.6} ry={1.5} fill="#ff9fb0" opacity={0.6} /><ellipse cx={34.5} cy={31} rx={2.6} ry={1.5} fill="#ff9fb0" opacity={0.6} />
      </>}
      {mood === 'meh' && <>
        <ellipse cx={18} cy={26.5} rx={2} ry={2.6} fill={INK} /><ellipse cx={30} cy={26.5} rx={2} ry={2.6} fill={INK} />
        <path d="M15 21.5 l5 1 M33 21.5 l-5 1" stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
        <path d="M20 34 q2 -1.6 4 0 q2 1.6 4 0" stroke={INK} strokeWidth={1.7} fill="none" strokeLinecap="round" />
        <path d="M37.5 16 q3 4.5 0 6 q-3 -1.5 0 -6z" fill="#7cc4f5" />
      </>}
      {mood === 'bad' && <>
        <path d="M14.5 26 q3.5 3 7 0 M26.5 26 q3.5 3 7 0" stroke={INK} strokeWidth={1.9} fill="none" strokeLinecap="round" />
        <path d="M17 29 q-2 5 0 7 q2 -2 0 -7z M31 29 q2 5 0 7 q-2 -2 0 -7z" fill="#7cc4f5" />
        <path d="M20 35.5 q4 -3.5 8 0" stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        <path d="M30 13 v6 M33.5 13.5 v5 M37 15 v4" stroke="#6b7fd7" strokeWidth={1.3} strokeLinecap="round" />
      </>}
      {mood === 'none' && <>
        <circle cx={18} cy={26.5} r={1.8} fill={INK} /><circle cx={30} cy={26.5} r={1.8} fill={INK} />
        <path d="M21 33.5 h6" stroke={INK} strokeWidth={1.7} strokeLinecap="round" />
      </>}
    </svg>
  );
}

function Num({ value }: { value: number | string }) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (typeof value === 'number') fx.countUp(el.current, value); }, [value]);
  return <span ref={el} className="tabular-nums">{value}</span>;
}
// 前の月との差（小さく添える）
function Delta({ d, unit = '', goodUp }: { d: number | null; unit?: string; goodUp: boolean }) {
  if (d == null || Math.abs(d) < 0.05) return <span className="text-ig-muted">前の月と同じ</span>;
  const good = goodUp ? d > 0 : d < 0;
  return <span className={good ? 'text-ig-ok' : 'text-ig-danger'}>{d > 0 ? '▲' : '▼'}{Math.abs(Math.round(d * 10) / 10)}{unit}</span>;
}

// 上の帯: 顔のひとこと ＋ 数字4つ ＋ 満足度の分布 ＋ 月ごとの推移 ＋ 資格（1段に詰める）
function Dashboard({ rows, prev, all, months, month, bandK, setBandK }: {
  rows: Row[]; prev: Row[]; all: Row[]; months: string[]; month: string; bandK: string; setBandK: (k: string) => void;
}) {
  const avg = Math.round(mean(rows) * 10) / 10;
  const pAvg = prev.length ? mean(prev) : null;
  const low = rows.filter(isLow).length, pLow = prev.length ? prev.filter(isLow).length : null;
  const ns = rows.filter(noStudy).length;
  const people = new Set(rows.map((r) => normName(r.name))).size;
  const order = [...BANDS].reverse();   // 低い帯を左（拾いたいのは左端）
  const dist = order.map((b) => ({ ...b, n: rows.filter((r) => band(r.manzoku_score)?.k === b.k).length }));
  const total = dist.reduce((a, d) => a + d.n, 0) || 1;
  const trend = [...months].reverse().slice(-8).map((m) => { const xs = all.filter((r) => r.ym === m); return { m, n: xs.length, avg: mean(xs) }; });
  const maxN = Math.max(1, ...trend.map((t) => t.n));
  const shikaku = Object.entries(rows.reduce<Record<string, number>>((a, r) => { const k = r.shikaku || '未回答'; a[k] = (a[k] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const mood = moodOfAvg(avg);
  const say = !rows.length ? 'まだ回答がありません' : low === 0 ? 'みんな元気そう！' : mood === 'great' || mood === 'good' ? `全体はいい感じ。でも ${low}人 が低めだよ` : `${low}人 が低め。声をかけたい`;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="rounded-lg border border-ig-border bg-white p-3">
        <div className="flex items-center gap-3">
          <MoodFace mood={mood} size={64} bounce />
          <div className="min-w-0 flex-1">
            <div className="ig-pop relative inline-block rounded-2xl rounded-bl-sm bg-ig-hover px-3 py-1.5 text-sm font-semibold">{say}</div>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center">
              {([
                ['回答', rows.length, `${people}人`, null],
                ['平均', avg ? avg.toFixed(1) : '—', <Delta key="a" d={pAvg == null || !avg ? null : avg - pAvg} goodUp />, null],
                ['低い', low, <Delta key="l" d={pLow == null ? null : low - pLow} unit="人" goodUp={false} />, low > 0],
                ['資格未着手', ns, `${rows.length ? Math.round((ns / rows.length) * 100) : 0}%`, null],
              ] as [string, number | string, React.ReactNode, boolean | null][]).map(([l, v, s, warn]) => (
                <div key={l}><div className="text-[10px] text-ig-muted">{l}</div><div className={`text-xl font-bold leading-tight ${warn ? 'text-ig-danger' : ''}`}><Num value={v} /></div><div className="text-[10px] text-ig-muted">{s}</div></div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 flex h-7 w-full overflow-hidden rounded-lg">
          {dist.filter((d) => d.n).map((d) => (
            <button key={d.k} onClick={() => setBandK(bandK === d.k ? '' : d.k)} title={`${d.k}：${d.n}件`}
              className={`ig-press flex items-center justify-center text-[11px] font-semibold text-white transition-opacity ${bandK && bandK !== d.k ? 'opacity-30' : ''}`}
              style={{ width: `${(d.n / total) * 100}%`, background: d.c }}>{d.n / total > 0.1 && `${d.k}　${d.n}`}</button>
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ig-muted">
          {dist.map((d) => <button key={d.k} onClick={() => setBandK(bandK === d.k ? '' : d.k)} className={`inline-flex items-center gap-1 ${bandK === d.k ? 'font-bold text-ig-text' : ''}`}><MoodFace mood={d.mood} size={18} />{d.k}：{d.n}件（{Math.round((d.n / total) * 100)}%）</button>)}
        </div>
      </div>
      <div className="rounded-lg border border-ig-border bg-white p-3">
        <div className="mb-2 text-xs font-semibold">月ごとの推移 <span className="font-normal text-ig-muted">棒＝回答数・顔＝平均</span></div>
        <div className="flex h-[124px] items-end gap-2">
          {trend.map((t) => (
            <div key={t.m} className="flex flex-1 flex-col items-center gap-0.5">
              <MoodFace mood={moodOfAvg(t.avg)} size={22} />
              <span className="text-[10px] font-semibold tabular-nums">{t.avg ? t.avg.toFixed(1) : '—'}</span>
              <div className={`ig-rise w-full max-w-[44px] rounded-t-md ${t.m === month ? 'ig-gradient' : 'bg-ig-border'}`} style={{ height: `${Math.max(4, (t.n / maxN) * 56)}px` }} title={`${monthLabel(t.m)}：${t.n}件`} />
              <span className="text-[10px] text-ig-muted">{Number(t.m.slice(5))}月 {t.n}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-ig-border bg-white p-3">
        <div className="mb-2 text-xs font-semibold">資格の勉強</div>
        <div className="space-y-1.5">
          {shikaku.map(([k, n]) => (
            <div key={k}>
              <div className="flex justify-between gap-2 text-[11px]"><span className="truncate">{k}</span><span className="shrink-0 tabular-nums text-ig-muted">{n}件</span></div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-ig-hover"><div className={`h-full rounded-full ${/出来ていない|できていない/.test(k) ? 'bg-ig-danger' : 'bg-ig-primary'}`} style={{ width: `${(n / (rows.length || 1)) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
