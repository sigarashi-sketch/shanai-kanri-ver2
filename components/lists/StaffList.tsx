'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { PEOPLE, STATUS_COUNTS } from '@/lib/sample';
import { GhostButton, PageTitle, Pill, PrimaryButton, TONE, SkeletonRows } from '@/components/ui';
import { useMotivation } from '@/components/Motivation';
import { needText, usePerms } from '@/components/Perms';
import { isPending, useYoyaku, yoyakuLine } from '@/components/YoyakuStore';
import { LIVE_WRITE_BLOCKED, LiveBanner, useIke } from '@/components/Live';
import { tensekiMarks, toTensekiLive, type IkeTensekiList } from '@/lib/live/tenseki';
import { normName } from '@/lib/live/eigyo-common';
import { TENSEKI } from '@/lib/tenseki-sample';
import { TODAY } from '@/lib/yoyaku-sample';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { MIKEIKEN_NOTE } from '@/lib/live/mikeiken';
import { STATUS_LABEL, STATUS_ORDER, jstToday, slashDate, type LiveStaffList, type StaffEdit } from '@/lib/live/staff';
import type { LiveStaffListX, StaffYoyaku as YoyakuRow } from '@/lib/live/staff-extra';
import { rulePhaseOf, type StaffWrite } from '@/lib/live/staff-write';
import { ColumnPicker, useColumns, type ColDef } from '@/components/jinji/ColumnPicker';
import { StaffYoyaku } from '@/components/jinji/StaffYoyaku';
import { useLiveWrite, WriteError } from '@/components/jinji/useLiveWrite';
import { staffReq } from '@/components/jinji/staffWrite';
import { EMPTY_EDIT } from '@/components/jinji/StaffOps';

// 見本（PEOPLE）と本物（今の従業員名簿）を同じ形に揃えて並べる
type Row = {
  id: string; name: string; sub: string; status: string; site: string; siteSub?: string; contract: string; contractEnd?: string;
  station: string; price: string; sales: string; recruiter: string; kana: string; kintai: { text: string; tone: string }; tag?: string;
  company: string; joined: string; start: string; end: string; nyuujou: string; taijou: string; taishaBi: string; edit: StaffEdit; rule?: number;
};
const PAGE = 150;

// 列（今の名簿の列から、ver2 の一覧に出せるもの・10-25）。社員の列はいつも先頭・矢印はいつも最後
const COLS: ColDef[] = [
  { k: 'status', t: '状態' }, { k: 'site', t: '現場' }, { k: 'contract', t: '契約' }, { k: 'station', t: '最寄駅' }, { k: 'price', t: '単価' }, { k: 'kintai', t: '今月の勤怠' },
  { k: 'recruiter', t: '採用担当' }, { k: 'sales', t: '担当営業' }, { k: 'company', t: '所属会社' },
  { k: 'joined', t: '入社日' }, { k: 'start', t: '開始日' }, { k: 'end', t: '終了日' }, { k: 'nyuujou', t: '入場日' }, { k: 'taijou', t: '退場日' }, { k: 'taishaBi', t: '退社日' },
  { k: 'rule', t: 'ルール欠勤', tip: '2026-10-05 以降の欠勤・遅刻・早退の連絡の回数（数えないにした日は除く）' },
  { k: 'phase', t: 'フェーズ', tip: '1回=①営業面談／2回=②来社面談／3回=③書面注意・改善計画書／4回以上=④けん責を検討' },
  { k: 'line', t: 'LINE', tip: 'LINEグループがあるか（グループ名で自動・または手で紐付け）' },
  { k: 'sankaku', t: '参画決定', tip: '営業リストの参画決定。ONで一斉送信の対象から外れます' }, { k: 'sai', t: '再アサイン' }, { k: 'jitai', t: '辞退' },
  { k: 'taiki', t: '待機', tip: 'ONで当日の出勤状況・未打刻アラートの対象から外れます（再アサインも自動で入ります）' }, { k: 'taisha', t: '退社' },
];
const DEFAULT_COLS = ['status', 'site', 'contract', 'station', 'price', 'kintai'];
const CHECK_COLS = new Set(['sankaku', 'sai', 'jitai', 'taiki', 'taisha']);

export function StaffList({ embedded = false }: { embedded?: boolean }) {
  const { hit, toast } = useMotivation();
  const canEdit = usePerms().can('jinji', 'edit');
  const { rows: yoyaku } = useYoyaku();
  const { data, state, error, reload, live } = useLiveRoute<LiveStaffList & Partial<LiveStaffListX>>('/api/live/staff');
  // 現場の列の下に、いちばん近い予約を1行（変更の予約と同じデータ・見本のときだけ）
  const nextOf = (id: string) => (live ? undefined : yoyaku.filter((r) => r.personId === id && isPending(r)).sort((a, b) => a.date.localeCompare(b.date))[0]);
  // 転籍（転籍台帳はページに出さず名簿に混ぜる・10-25）。台帳は今のシステムで super_admin と労務事務だけ読める＝読めなければ出ないだけ
  const tk = useIke<IkeTensekiList>(live ? 'tenseki?action=list' : null);
  const tmarks = useMemo(() => {
    if (!live) return tensekiMarks(TENSEKI, TODAY);
    if (!tk.live || !tk.data) return new Map<string, { text: string; pending: boolean; ambiguous?: boolean }>();
    const t = toTensekiLive(tk.data);
    return tensekiMarks(t.rows, t.today, (data?.rows || []).map((r) => r.name));
  }, [live, tk.live, tk.data, data]);
  const [view, setView] = useState<'roster' | 'yoyaku'>('roster');
  useEffect(() => { if (window.location.hash === '#yoyaku') setView('yoyaku'); }, []);
  const go = (v: 'roster' | 'yoyaku') => { setView(v); try { window.history.replaceState(null, '', v === 'yoyaku' ? '#yoyaku' : window.location.pathname + window.location.search); } catch { /* noop */ } };
  const [tab, setTab] = useState<string>('すべて');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  // 押した人は画面の一番上に社員ページの中身を出す（Person.tsx の PersonHost・10-26 shoya「上に表示しろ」）
  const open = (p: { id: string; name: string }) => window.dispatchEvent(new CustomEvent('person:open', { detail: { name: p.name, id: p.id } }));
  const [limit, setLimit] = useState(PAGE);
  // 絞り込み（選ぶだけ）。空＝すべて
  const [f, setF] = useState<{ recruiter: string; sales: string; contract: string }>({ recruiter: '', sales: '', contract: '' });
  const cols = useColumns('v2-staff-cols', COLS, DEFAULT_COLS);
  // チェックを押した直後の値（読み直すまで）。名前ごと
  const [ov, setOv] = useState<Record<string, Partial<StaffEdit>>>({});
  useEffect(() => { setOv({}); }, [data]);
  const { send, error: wErr, setError: setWErr } = useLiveWrite(live, reload);

  const all: Row[] = useMemo(() => (live && data
    ? data.rows.map((p) => ({
      id: p.id, name: p.name, kana: p.kana, status: p.status, site: p.site, siteSub: p.siteEki, contract: p.contract,
      contractEnd: p.statusKey === 'yotei' && p.start ? `${slashDate(p.start)} 開始` : undefined,
      station: p.station, price: p.price, sales: p.sales, recruiter: p.recruiter,
      sub: [p.company, p.joined ? `${p.joined.slice(0, 7).replace('-', '/')}入社` : ''].filter(Boolean).join('・') || '—',
      kintai: { text: '—', tone: 'mute' }, tag: p.provisional ? '仮' : p.carriedFrom ? '前月' : undefined,
      company: p.company, joined: p.joined, start: p.start, end: p.end, nyuujou: p.nyuujou, taijou: p.taijou, taishaBi: p.taishaBi,
      edit: { ...EMPTY_EDIT, ...(p.edit || {}), ...(ov[p.name] || {}) },
      rule: data.rule?.ok ? data.rule.n[normName(p.name)] ?? 0 : undefined,
    }))
    : PEOPLE.map((p) => ({
      ...p, sub: `${p.no}・${p.joined.slice(0, 7)}入社`, contractEnd: p.contractEnd, company: '', joined: p.joined.replaceAll('/', '-'), start: '', end: '', nyuujou: '', taijou: '', taishaBi: '',
      edit: { ...EMPTY_EDIT, taiki: p.status === '待機', taisha: p.status === '退社', sankaku: p.status === '入場予定', ...(ov[p.name] || {}) }, rule: 0,
    }))), [live, data, ov]);
  const tabs = live
    ? [{ label: 'すべて', n: all.length }, ...STATUS_ORDER.map((k) => ({ label: STATUS_LABEL[k], n: all.filter((p) => p.status === STATUS_LABEL[k]).length })).filter((t) => t.n > 0)]
    : STATUS_COUNTS.map((s) => ({ label: s.label as string, n: s.label === 'すべて' ? all.length : all.filter((p) => p.status === s.label).length }));
  const opts = (k: 'recruiter' | 'sales' | 'contract') => Array.from(new Set(all.map((p) => p[k]).filter((v) => v && v !== '—'))).sort((a, b) => a.localeCompare(b, 'ja'));
  const rows = useMemo(() => all.filter((p) => (tab === 'すべて' || p.status === tab) && (!q || (p.name + p.kana + p.site + (p.siteSub || '') + p.station).includes(q))
    && (!f.recruiter || p.recruiter === f.recruiter) && (!f.sales || p.sales === f.sales) && (!f.contract || p.contract === f.contract)), [all, tab, q, f]);
  const shown = rows.slice(0, limit);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const block = live ? LIVE_WRITE_BLOCKED : undefined;

  // KPI（今の名簿の上の数字と同じ定義・いま絞っている行で数える）
  const kpi = [
    { l: '表示中', n: rows.length },
    { l: STATUS_LABEL.kadou, n: rows.filter((r) => r.status === STATUS_LABEL.kadou).length, tip: 'いま現場の案件で稼働している人数（入場予定とは重ならない）' },
    { l: STATUS_LABEL.yotei, n: rows.filter((r) => r.status === STATUS_LABEL.yotei).length, tip: '案件が決まっていて、まだ現場に入っていない人数' },
    { l: '稼働人数（退社・待機・休職除く）', n: rows.filter((r) => !r.edit.taisha && !r.edit.taiki && r.edit.override !== 'kyushoku' && r.status !== '休職・産休' && r.status !== '退社').length, tip: 'ダッシュボードの「稼働人数」と同じ定義（稼働中＋入場予定＋在籍（現場外））' },
    { l: 'LINEグループあり', n: live ? rows.filter((r) => r.edit.hasLine).length : null },
    { l: 'LINEグループなし', n: live ? rows.filter((r) => !r.edit.hasLine).length : null },
    { l: '終了日あり', n: live ? rows.filter((r) => r.end).length : null },
  ];

  /** 一覧のチェックを押した → すぐ保存（取り消すで戻る） */
  const check = (p: Row, k: string, on: boolean) => {
    const name = p.name;
    const local = (patch: Partial<StaffEdit>) => () => setOv((o) => ({ ...o, [name]: { ...(o[name] || {}), ...patch } }));
    const was = p.edit;
    const revert = () => setOv((o) => ({ ...o, [name]: { ...(o[name] || {}), sankaku: was.sankaku, sai: was.sai, jitai: was.jitai, taiki: was.taiki, taisha: was.taisha } }));
    let w: StaffWrite; let undo: StaffWrite | null = null; let text: string; let sub: string; let patch: Partial<StaffEdit>;
    if (k === 'sankaku' || k === 'sai') {
      const field = k === 'sankaku' ? 'sankaku_kettei' : 'sai_assign';
      w = { kind: 'sales', name, field, value: on }; undo = { kind: 'sales', name, field, value: !on }; patch = { [k]: on };
      text = `${name} さんの「${k === 'sankaku' ? '参画決定' : '再アサイン'}」を${on ? '付けました' : '外しました'}`; sub = k === 'sankaku' ? '→ ONで一斉送信の対象から外れます' : '→ 営業リストの再アサイン';
    } else if (k === 'jitai') {
      w = { kind: 'flag', name, statusKey: '辞退', value: on }; undo = { kind: 'flag', name, statusKey: '辞退', value: !on }; patch = { jitai: on };
      text = `${name} さんの「辞退」を${on ? '付けました' : '外しました'}`; sub = '→ 営業リスト（プロパーリスト）の辞退';
    } else if (k === 'taiki') {
      w = { kind: 'status', name, patch: { taiki: on, override: '' } }; patch = { taiki: on, override: '' };
      text = `${name} さんを${on ? '待機にしました' : '待機から外しました'}`; sub = on ? '→ 当日の出勤状況・未打刻アラートの対象外（再アサインも自動で入ります）' : '→ 当日の出勤状況に戻ります';
    } else {
      if (!on && !window.confirm(`${name} さんの退社チェックを外しますか？`)) return;
      w = { kind: 'status', name, patch: on ? { taisha: true, override: '' } : { taisha: false } }; patch = { taisha: on };
      text = `${name} さんを${on ? '退社にしました' : '在籍に戻しました'}`; sub = on ? '→ 稼働中の人数から外れます' : '→ 稼働中の人数に戻ります';
    }
    send(staffReq(w, text, { sub, undo, apply: local(patch), revert }));
  };

  const cell = (p: Row, k: string) => {
    const ck = (on: boolean) => (
      <input type="checkbox" checked={on} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} onChange={(e) => check(p, k, e.target.checked)} aria-label={`${p.name}の${COLS.find((c) => c.k === k)?.t}`} className="size-4" />
    );
    const d = (v: string) => (v ? <span className="num">{slashDate(v)}</span> : <span className="text-faint">—</span>);
    switch (k) {
      case 'status': return <Pill>{p.status}</Pill>;
      case 'site': return <>{p.site}{p.siteSub && <div className="text-xs text-faint">{p.siteSub}</div>}{nextOf(p.id) && <Link href="/jinji/yoyaku" className="block text-xs font-semibold hover:underline" style={{ color: 'var(--ad)' }}>{yoyakuLine(nextOf(p.id)!)}</Link>}</>;
      case 'contract': return <>{p.contract}{p.contractEnd && <div className="text-xs font-semibold text-warn">{p.contractEnd}</div>}</>;
      case 'station': return p.station;
      case 'price': return <span className="num">{p.price}</span>;
      case 'kintai': return <span className="font-medium" style={{ color: TONE[p.kintai.tone] }} title={live ? '勤怠は今の社内システムの名簿の累積欠勤・ルール欠勤の列で見てください' : undefined}>{p.kintai.text}</span>;
      case 'recruiter': return p.recruiter;
      case 'sales': return p.sales;
      case 'company': return p.company || <span className="text-faint">—</span>;
      case 'joined': return d(p.joined);
      case 'start': return d(p.start);
      case 'end': return d(p.end);
      case 'nyuujou': return p.nyuujou && !/^\d{4}-/.test(p.nyuujou) ? p.nyuujou : d(p.nyuujou);
      case 'taijou': return d(p.taijou);
      case 'taishaBi': return d(p.taishaBi);
      case 'rule': return p.rule == null ? <span className="text-faint" title="勤怠連絡を読めませんでした（0回ではなく不明）">—</span> : <span className="num font-bold" style={{ color: p.rule > 0 ? 'var(--color-bad)' : 'var(--color-ok)' }}>{p.rule}回</span>;
      case 'phase': { const ph = p.rule == null ? null : rulePhaseOf(p.rule); return ph ? <span className="chip whitespace-nowrap" style={{ background: `var(--tone-${ph.tone}-bg)`, color: `var(--tone-${ph.tone}-fg)` }}>{ph.mark} {ph.label}</span> : <span className="text-faint">—</span>; }
      case 'line': return live ? (p.edit.hasLine ? <span title={p.edit.lineGroup}>あり</span> : <span className="text-faint">なし</span>) : <span className="text-faint">—</span>;
      default: return CHECK_COLS.has(k) ? ck(!!p.edit[k as 'sankaku' | 'sai' | 'jitai' | 'taiki' | 'taisha']) : null;
    }
  };
  const colDefs = cols.keys.map((k) => COLS.find((c) => c.k === k)!).filter(Boolean);
  const nCols = colDefs.length + 3;
  const yoyakuList = useMemo(() => (live ? data?.yoyaku || [] : SAMPLE_YOYAKU), [live, data]);
  const yoyakuN = yoyakuList.length;
  const people = useMemo(() => all.map((p) => ({ name: p.name, kana: p.kana, taisha: p.edit.taisha, taiki: p.edit.taiki, override: p.edit.override })), [all]);

  // 社員一覧（人事）と、要員ページの「従業員名簿」タブ（embedded）の両方で使う。タブの中では main を二重にしない
  const Wrap = embedded ? 'div' : 'main';
  return (
    <Wrap className={`flex flex-col gap-3.5 ${embedded ? 'pb-[120px]' : 'px-4 pb-[120px] pt-[22px] sm:px-6'}`}>
      {!embedded && (
        <PageTitle title="社員一覧" sub={live ? '今の従業員名簿と同じ判定で状態を出しています。チェックはその場で保存されます。名前か行を押すと画面の上に社員ページの中身、右の矢印でページに移ります' : '状態は日付つきの履歴から自動で決まります。名前か行を押すと画面の上に社員ページの中身、右の矢印でページに移ります'}>
          {live
            ? <button disabled title={LIVE_WRITE_BLOCKED} className="btn-secondary cursor-not-allowed opacity-40">CSV</button>
            : <GhostButton onClick={() => toast({ text: `${rows.length}人を CSV に書き出しました（見本）`, sub: '→ ダウンロードに入る想定です（いまは見本なのでファイルは作りません）' })}>CSV</GhostButton>}
          {live ? <PrimaryButton disabled title={LIVE_WRITE_BLOCKED}>＋ 社員を追加</PrimaryButton>
            : canEdit ? <Link href="/jinji/nyusha" className="btn-primary">＋ 社員を追加</Link> : <PrimaryButton disabled title={needText('edit')}>＋ 社員を追加</PrimaryButton>}
        </PageTitle>
      )}
      <LiveBanner state={state} error={error} onReload={reload}
        note={live ? `${data?.month || ''}の名簿。${MIKEIKEN_NOTE}。チェック・予約は今の名簿にすぐ保存されます（1人ずつの入力は社員ページの「名簿の入力」「対応歴」）${data?.warnings.length ? `／${data.warnings.join('・')}` : ''}` : undefined} />
      <WriteError error={wErr} onClose={() => setWErr('')} />

      <div role="tablist" className="mo-fade-up flex gap-1 border-b border-line" style={{ ['--i' as string]: 0 }}>
        {([['roster', '名簿'], ['yoyaku', '待機・退社の予約']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => go(k)} className="tab">
            {l}{k === 'yoyaku' && yoyakuN > 0 && <span className="num ml-1.5 rounded-full px-1.5 text-sm" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }}>{yoyakuN}</span>}
          </button>
        ))}
      </div>

      {view === 'yoyaku' ? (
        <StaffYoyaku live={live} today={data?.today || jstToday()} onDone={reload}
          yoyaku={yoyakuList} people={people} />
      ) : (<>
      <div className="mo-fade-up grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" style={{ ['--i' as string]: 1 }}>
        {kpi.map((x) => (
          <div key={x.l} className="rounded-xl border border-line bg-surface px-3.5 py-2.5" title={x.tip}>
            <div className="text-sm font-semibold text-muted">{x.l}</div>
            <div className="num text-xl font-bold tracking-tight">{x.n == null ? <span className="text-faint" title="見本では出しません">—</span> : x.n}</div>
          </div>
        ))}
      </div>

      <div className="mo-fade-up flex flex-wrap gap-2" style={{ ['--i' as string]: 1 }} role="tablist">
        {tabs.map((s) => {
          const on = tab === s.label;
          return (
            <button key={s.label} role="tab" aria-selected={on} onClick={() => { setTab(s.label); setLimit(PAGE); }}
              className="fchip">
              {s.label} <span className="num">{s.n}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-start gap-3">
      <div className="mo-fade-up min-w-0 flex-1 overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <div className="flex flex-wrap items-center gap-2 px-3.5 py-3">
          <label className="flex min-h-9 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border border-field px-3 text-faint sm:flex-none sm:min-w-[240px]">
            <Search size={15} /><input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} aria-label="この一覧を検索" placeholder="名前・カナ・現場・最寄駅" className="flex-1 bg-transparent text-body text-ink outline-none" />
          </label>
          {([['recruiter', '採用担当'], ['sales', '担当営業'], ['contract', live ? '契約区分' : '契約の形']] as const).map(([k, l]) => (
            <select key={k} aria-label={`${l}で絞る`} value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-body" style={f[k] ? { borderColor: 'var(--a)', color: 'var(--ad)', fontWeight: 600 } : undefined}>
              <option value="">{l}：すべて</option>
              {opts(k).map((v) => <option key={v} value={v}>{l}：{v}</option>)}
            </select>
          ))}
          {(f.recruiter || f.sales || f.contract) && <button onClick={() => setF({ recruiter: '', sales: '', contract: '' })} className="text-sm text-muted underline">絞り込みを外す</button>}
          <span className="ml-auto text-sm text-muted"><span className="num">{rows.length}</span>人</span>
          <ColumnPicker all={COLS} keys={cols.keys} onChange={cols.save} onReset={cols.reset} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-body">
            <thead><tr className="th-row text-left">
              <th className="w-[26px] px-3.5 py-2.5"><input type="checkbox" aria-label="すべて選ぶ" checked={rows.length > 0 && rows.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
              <th className="px-2 py-2.5 font-semibold">社員</th>
              {colDefs.map((c) => <th key={c.k} title={c.tip} className={`whitespace-nowrap px-2 py-2.5 font-semibold ${c.k === 'price' ? 'text-right' : ''} ${CHECK_COLS.has(c.k) ? 'text-center' : ''}`}>{c.k === 'site' && live ? '現場（上位会社）' : c.t}</th>)}
              <th className="px-3.5" />
            </tr></thead>
            <tbody>
              {state === 'loading' && <tr><td colSpan={nCols} className="p-0"><SkeletonRows /></td></tr>}
              {state !== 'loading' && shown.map((p, i) => (
                <tr key={p.id + i} className={`mo-fade-in cursor-pointer border-t border-line-soft ${sel.has(p.id) ? '' : 'row'}`} style={{ ['--i' as string]: Math.min(i, 24) + 3, background: sel.has(p.id) ? 'var(--as)' : undefined }}
                  onClick={(e) => { if ((e.target as HTMLElement).closest('button,a,input,select,textarea,label')) return; open(p); }}>
                  <td className="px-3.5 py-2"><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`${p.name}を選ぶ`} /></td>
                  <td className="px-2 py-2"><div className="flex items-center gap-2.5">
                    <div aria-hidden className="flex size-[30px] items-center justify-center rounded-full text-sm font-bold" style={{ background: 'var(--as)', color: 'var(--ad)' }}>{p.name[0]}</div>
                    <div><button type="button" onClick={() => open(p)} className="font-semibold hover:underline underline-offset-2">{p.name}</button>
                      {p.tag && <span className="chip ml-1.5" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }} title={p.tag === '仮' ? '稼働管理情報一覧にまだ載っていない人（営業リストから立てた行）' : '当月の行が無いので、前の月の行を出しています'}>{p.tag}</span>}
                      <div className="text-xs text-faint">{p.sub}</div>
                      {tmarks.get(normName(p.name)) && <Link href="/jinji/yoyaku" className="block text-xs font-semibold hover:underline" style={{ color: tmarks.get(normName(p.name))!.pending ? 'var(--ad)' : 'var(--color-muted)' }}>{tmarks.get(normName(p.name))!.text}</Link>}</div>
                  </div></td>
                  {colDefs.map((c) => <td key={c.k} className={`px-2 py-2 ${c.k === 'price' ? 'text-right' : ''} ${CHECK_COLS.has(c.k) ? 'text-center' : ''}`}>{cell(p, c.k)}</td>)}
                  <td className="px-3.5 py-2"><Link href={`/jinji/staff/${encodeURIComponent(p.id)}`} className="inline-flex rounded p-1 hover:bg-soft" aria-label={`${p.name}の社員ページを開く`}><ChevronRight size={16} className="text-faint" /></Link></td>
                </tr>
              ))}
              {state !== 'loading' && rows.length === 0 && <tr><td colSpan={nCols} className="px-4 py-10 text-center text-body text-muted">この条件の社員はいません{live ? '' : '（見本データは一部の人だけです）'}</td></tr>}
            </tbody>
          </table>
        </div>
        {rows.length > shown.length && (
          <button onClick={() => setLimit((n) => n + PAGE)} className="w-full border-t border-line-soft py-2.5 text-sm font-semibold" style={{ color: 'var(--ad)' }}>さらに表示（残り {rows.length - shown.length}人）</button>
        )}
        <div className="flex items-center justify-between border-t border-line-soft px-3.5 py-2.5 text-sm text-muted"><span>全{rows.length}件</span><span>{live ? `${data?.month || ''}の名簿・状態は今日（${data?.today || ''}）の判定` : '見本データは一部の人だけです'}</span></div>
      </div>
      </div>
      </>)}

      {sel.size > 0 && view === 'roster' && (
        <div className="mo-scale-in fixed bottom-7 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2.5 rounded-[14px] bg-sumi py-2 pl-[18px] pr-2 text-body text-white shadow-[0_12px_32px_rgba(25,27,46,.28)]">
          <b className="num">{sel.size}人を選択中</b><span className="h-5 w-px bg-white/20" />
          <button disabled={live} title={block} onClick={() => { const before = sel; hit(); toast({ undo: () => setSel(before), text: `${sel.size}人にLINEを送る準備をしました`, sub: '→ 連絡の下書きに入りました' }); setSel(new Set()); }} className="min-h-9 rounded-[9px] bg-white/10 px-3 text-body disabled:cursor-not-allowed disabled:text-white/50">LINEで送る</button>
          <button disabled={live} title={block} onClick={() => { const before = sel; hit(); toast({ undo: () => setSel(before), text: `${sel.size}人に書類の回収を依頼しました`, sub: '→ 入社手続きの提出待ちに載りました' }); setSel(new Set()); }} className="min-h-9 rounded-[9px] bg-white/10 px-3 text-body disabled:cursor-not-allowed disabled:text-white/50">書類の回収を依頼</button>
          {live
            ? <button onClick={() => { go('yoyaku'); setSel(new Set()); }} className="inline-flex min-h-9 items-center rounded-[9px] px-3.5 text-body font-bold" style={{ background: 'var(--a)', color: 'var(--ao)' }}>待機・退社を予約</button>
            : canEdit
              ? <Link href="/jinji/yoyaku" className="btn inline-flex min-h-9 items-center rounded-[9px] px-3.5 text-body font-bold" style={{ background: 'var(--a)', color: 'var(--ao)' }}>変更を予約（{sel.size}人）</Link>
              : <span title={needText('edit')} className="inline-flex min-h-9 cursor-not-allowed items-center rounded-[9px] bg-white/10 px-3 text-body text-white/50">変更の予約は「直す」の権限が要ります</span>}
        </div>
      )}
    </Wrap>
  );
}

// 見本の予約（ログインしていないとき）
const SAMPLE_YOYAKU: YoyakuRow[] = [{ name: PEOPLE[2].name, kind: 'taiki', date: '2026-11-01' }];
