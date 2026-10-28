'use client';
import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowDown, ArrowUp, Check, CheckCircle2, Circle, Clock, Copy, ExternalLink, Mail, Search, Users, X } from 'lucide-react';
import type { Member } from '@/components/sy/compat';
import type { KyouikuData as Data, Learner, WorldInfo } from '@/lib/sy/kyouiku-data-types';
import { CHECK_SUBJECTS, checkLabel } from '@/lib/sy/kyouiku-check';
import { Avatar, Chip, ago, inputCls } from '@/components/sy/ui';

// 教育データ（受講データ）: 受講ページを開いた人の一覧と進み具合。manager が進捗を管理するための画面（2026-10-02 shoya「CRMツールみたいにリッチに」）。
//   上＝数字（受講者・進行中・全クリア・平均の進み具合・止まっている人）とワールドごとの到達 ／ 中＝絞り込みと表（名前の横にワールドごとの進捗）／ 行を押すと右に詳細
//   スキルチェック（2026-10-09・lib/kyouiku-check.ts）: 上に 科目ごとの平均と 点の分布、表に「チェック」の列（4科目の点）、詳細に 初回→最新・分野別・問題ごとの ○×。
//     氏名は本人に打たせていない（受講URLの氏名＝名簿のキー）。詳細に「名簿と一致／名簿に無い」「本人確認ずみ」を出す
//   色の決まり: 進み具合の棒は青1色（濃さ＝量）。状態（完了・進行中・止まっている…）は色だけにせず、必ず絵と文字をそえる
type Status = 'done' | 'active' | 'slow' | 'stalled' | 'new';
const STATUS: Record<Status, { label: string; cls: string; Icon: typeof Check; help: string }> = {
  done: { label: '全クリア', cls: 'bg-[#e8f6ec] text-[#1c6331]', Icon: CheckCircle2, help: '全クエストをクリア' },
  active: { label: '進行中', cls: 'bg-[#e6f4ff] text-[#00376b]', Icon: Activity, help: '3日以内に答え合わせ' },
  slow: { label: '間があいた', cls: 'bg-[#fff4e5] text-[#8a4a00]', Icon: Clock, help: '4〜7日 動きなし' },
  stalled: { label: '止まっている', cls: 'bg-[#fdecee] text-[#a3202c]', Icon: AlertTriangle, help: '8日以上 動きなし' },
  new: { label: '未着手', cls: 'bg-ig-hover text-ig-muted', Icon: Circle, help: 'アンケートまで（答え合わせはまだ）' },
};
const ORDER: Status[] = ['stalled', 'slow', 'active', 'new', 'done'];
function statusOf(l: Learner, now: number): Status {
  if (l.total > 0 && l.done >= l.total) return 'done';
  if (l.attempts === 0) return 'new';
  const days = l.lastAt ? (now - new Date(l.lastAt).getTime()) / 86400e3 : 999;
  return days <= 3 ? 'active' : days <= 7 ? 'slow' : 'stalled';
}
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const acc = (l: Learner) => (l.attempts > 0 ? Math.round(((l.attempts - l.wrong) / l.attempts) * 100) : -1);

type SortKey = 'name' | 'pct' | 'check' | 'acc' | 'last' | 'status' | `w${number}`;

export default function KyouikuData({ members }: { members: Member[] | null }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [now] = useState(() => Date.now());
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'member' | 'staff'>('all');
  const [stf, setStf] = useState<Status | 'all'>('all');
  const [sort, setSort] = useState<{ k: SortKey; asc: boolean }>({ k: 'last', asc: false });
  const [noCheck, setNoCheck] = useState(false);   // スキルチェックを まだ1科目も受けていない人だけ
  const [openKey, setOpenKey] = useState('');

  useEffect(() => {
    fetch('/api/sy/s/kyouiku/data').then(async (r) => { const j = await r.json(); if (!r.ok) setErr(j.error || '読み込めませんでした'); else setD(j); }).catch(() => setErr('通信に失敗しました'));
  }, []);

  const roster = useMemo(() => new Map((members || []).map((m) => [m.key, m])), [members]);
  const all = useMemo(() => (d?.learners || []).map((l) => ({ l, st: statusOf(l, now) })), [d, now]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const f = all.filter(({ l, st }) => (kind === 'all' || l.kind === kind) && (stf === 'all' || st === stf) && (!noCheck || !l.check) && (!s || l.name.toLowerCase().includes(s) || l.email.includes(s)));
    const val = ({ l, st }: { l: Learner; st: Status }): number | string => {
      const k = sort.k;
      if (k === 'name') return l.name;
      if (k === 'pct') return pct(l.done, l.total);
      if (k === 'acc') return acc(l);
      if (k === 'check') return l.check?.avg ?? -1;
      if (k === 'last') return l.lastAt;
      if (k === 'status') return ORDER.indexOf(st);
      const w = l.worlds[Number(k.slice(1))]; return w ? pct(w.done, w.total) : 0;
    };
    return [...f].sort((a, b) => { const x = val(a), y = val(b); const c = typeof x === 'string' ? x.localeCompare(String(y), 'ja') : x - Number(y); return sort.asc ? c : -c; });
  }, [all, q, kind, stf, sort, noCheck]);

  if (err) return <p className="m-6 rounded-lg bg-ig-hover p-3 text-sm text-ig-danger">{err}</p>;
  if (!d) return <p className="m-6 text-sm text-ig-muted">受講データを読み込み中…</p>;

  const n = all.length;
  const count = (s: Status) => all.filter((x) => x.st === s).length;
  const avg = n ? Math.round(all.reduce((s, x) => s + pct(x.l.done, x.l.total), 0) / n) : 0;
  const week = all.filter((x) => x.l.attempts > 0 && x.l.lastAt && now - new Date(x.l.lastAt).getTime() <= 7 * 86400e3).length;
  const opened = all.find((x) => x.l.key === openKey);
  const setSortKey = (k: SortKey) => setSort((s) => (s.k === k ? { k, asc: !s.asc } : { k, asc: k === 'name' }));

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-8">
      {/* 数字 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="受講者" value={n} unit="人" sub={`要員 ${all.filter((x) => x.l.kind === 'member').length}・内勤 ${all.filter((x) => x.l.kind === 'staff').length}`} Icon={Users} />
        <Kpi label="この7日に動いた人" value={week} unit="人" sub={`進行中 ${count('active')}・間があいた ${count('slow')}`} Icon={Activity} />
        <Kpi label="平均の進み具合" value={avg} unit="%" sub={`全 ${d.questCount} クエスト・${d.total} ステップ`} meter={avg} />
        <Kpi label="全クリア" value={count('done')} unit="人" sub={n ? `受講者の ${pct(count('done'), n)}%` : '—'} Icon={CheckCircle2} />
        <Kpi label="止まっている" value={count('stalled')} unit="人" sub="8日以上 動きなし（声かけの目安）" Icon={AlertTriangle} alert={count('stalled') > 0} onClick={() => setStf(stf === 'stalled' ? 'all' : 'stalled')} />
      </div>

      {/* ワールドごとの到達 */}
      <section className="mt-4 rounded-2xl border border-ig-border p-4">
        <div className="flex items-baseline gap-2"><h2 className="text-[15px] font-bold">ワールドごとの到達</h2><span className="text-xs text-ig-muted">棒＝受講者全員の平均の進み具合</span></div>
        <div className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
          {d.worlds.map((w, wi) => {
            const started = all.filter((x) => x.l.worlds[wi]?.done > 0).length;
            const cleared = all.filter((x) => x.l.worlds[wi] && x.l.worlds[wi].done >= x.l.worlds[wi].total).length;
            const a = n ? Math.round(all.reduce((s, x) => s + pct(x.l.worlds[wi]?.done || 0, w.total), 0) / n) : 0;
            return (
              <div key={w.id}>
                <div className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-semibold">{w.no}<span className="ml-1.5 font-normal text-ig-muted">{w.name}</span></span><span className="text-sm font-semibold">{a}%</span></div>
                <Meter value={a} className="mt-1.5 h-2" />
                <div className="mt-1 text-xs text-ig-muted">クリア {cleared}人・着手 {started}人</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* スキルチェック（科目ごとの平均と 点の分布） */}
      <section className="mt-4 rounded-2xl border border-ig-border p-4">
        <div className="flex flex-wrap items-baseline gap-2"><h2 className="text-[15px] font-bold">スキルチェック</h2><span className="text-xs text-ig-muted">受けた人 {all.filter((x) => x.l.check).length}人・まだ {all.filter((x) => !x.l.check).length}人（点は いちばん新しい回）</span></div>
        <div className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
          {CHECK_SUBJECTS.map((sb) => {
            const sc = all.map((x) => x.l.check?.parts[sb.id]?.last).filter((v): v is number => typeof v === 'number');
            const a = sc.length ? Math.round(sc.reduce((t, v) => t + v, 0) / sc.length) : 0;
            const bands = BANDS.map((b) => sc.filter((v) => v >= b.min && v <= b.max).length);
            return (
              <div key={sb.id}>
                <div className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-semibold">{sb.name}<span className="ml-1.5 font-normal text-ig-muted">{sc.length}人</span></span><span className="text-sm font-semibold">{sc.length ? `平均 ${a}点` : '—'}</span></div>
                <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-[#e6f4ff]" role="img" aria-label={BANDS.map((b, k) => `${b.label} ${bands[k]}人`).join('、')}>
                  {sc.length > 0 && BANDS.map((b, k) => bands[k] > 0 && <i key={b.label} className="h-full bg-ig-primary" style={{ width: `${(bands[k] / sc.length) * 100}%`, opacity: b.op }} />)}
                </div>
                <div className="mt-1 text-xs text-ig-muted">{BANDS.map((b, k) => `${b.label} ${bands[k]}人`).join('・')}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 絞り込み */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <label className="relative"><Search size={16} className="absolute left-2.5 top-2.5 text-ig-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・メールで探す" aria-label="名前・メールで探す" className={`${inputCls} w-64 pl-8`} /></label>
        <div className="flex gap-1.5">{([['all', 'すべて'], ['member', '要員'], ['staff', '内勤']] as const).map(([k, l]) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{l}</Chip>)}</div>
        <span className="mx-1 h-5 w-px bg-ig-border" />
        <div className="flex flex-wrap gap-1.5">
          <Chip on={stf === 'all'} onClick={() => setStf('all')}>状態すべて</Chip>
          {ORDER.map((s) => <Chip key={s} on={stf === s} onClick={() => setStf(stf === s ? 'all' : s)}>{STATUS[s].label} {count(s)}</Chip>)}
        </div>
        <span className="mx-1 h-5 w-px bg-ig-border" />
        <Chip on={noCheck} onClick={() => setNoCheck(!noCheck)}>チェック未受験 {all.filter((x) => !x.l.check).length}</Chip>
        <span className="ml-auto text-xs text-ig-muted">{rows.length} / {n} 人</span>
      </div>

      {/* 表 */}
      <div className="mt-3 overflow-x-auto rounded-2xl border border-ig-border">
        <table className="w-full min-w-[1010px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ig-border bg-ig-subtle text-left text-xs text-ig-muted">
              <Th k="name" sort={sort} on={setSortKey} className="pl-4">受講者</Th>
              <Th k="pct" sort={sort} on={setSortKey}>全体</Th>
              {d.worlds.map((w, wi) => <Th key={w.id} k={`w${wi}`} sort={sort} on={setSortKey} title={`${w.no} ${w.name}`}>{w.no.replace('ワールド', 'W')}</Th>)}
              <Th k="check" sort={sort} on={setSortKey} title="スキルチェック（事務スキル・ITリテラシー・ビジネスマナー・タイピング）">チェック</Th>
              <th className="px-3 py-2.5 font-semibold">いまのクエスト</th>
              <Th k="acc" sort={sort} on={setSortKey}>正答率</Th>
              <Th k="last" sort={sort} on={setSortKey}>最後の動き</Th>
              <Th k="status" sort={sort} on={setSortKey} className="pr-4">状態</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8 + d.worlds.length} className="p-8 text-center text-sm text-ig-muted">{n === 0 ? 'まだ受講した人がいません。「配る」から受講URLを送ってください' : '条件に合う人がいません'}</td></tr>}
            {rows.map(({ l, st }) => {
              const m = roster.get(l.key); const a = acc(l);
              return (
                <tr key={l.key} tabIndex={0} onClick={() => setOpenKey(l.key)} onKeyDown={(e) => { if (e.key === 'Enter') setOpenKey(l.key); }}
                  className={`cursor-pointer border-b border-ig-divider last:border-0 hover:bg-ig-subtle focus-visible:bg-ig-subtle focus-visible:outline-none ${openKey === l.key ? 'bg-[#f5faff]' : ''}`}>
                  <td className="py-2.5 pl-4 pr-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={l.name} size="sm" />
                      <div className="min-w-0 max-w-[210px]">
                        <div className="flex items-center gap-1.5"><span className="truncate font-semibold">{l.name}</span><span className="shrink-0 rounded bg-ig-hover px-1.5 py-px text-[10px] font-semibold text-ig-muted">{l.kind === 'staff' ? '内勤' : '要員'}</span>{l.trial && <span className="shrink-0 rounded bg-ig-hover px-1.5 py-px text-[10px] font-semibold text-ig-warn">おためし</span>}</div>
                        <div className="truncate text-xs text-ig-muted">{l.email || 'Googleアドレス 未登録'}</div>
                        <div className="truncate text-xs text-ig-muted">{[l.level ? `レベル「${l.level}」` : 'アンケート未回答', m?.company, l.ccnaLec ? `CCNA 講義 ${l.ccnaLec.done}/${l.ccnaLec.total}章` : '', l.typing ? `タイピング ${l.typing.cleared}/${l.typing.total}章` : '', l.design ? `デザイン ${l.design.cleared}/${l.design.total}（${l.design.level}）` : '', l.tests?.excel?.passed ? 'スプレッドシート修了' : '', l.tests?.typing ? `検定 ${l.tests.typing.label}` : ''].filter(Boolean).join('・')}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3"><div className="flex items-center gap-2"><Meter value={pct(l.done, l.total)} className="h-2 w-14" /><span className="w-9 text-right text-xs font-semibold tabular-nums">{pct(l.done, l.total)}%</span></div></td>
                  {l.worlds.map((w, wi) => (
                    <td key={wi} className="px-2"><div className="w-12" title={`${w.done}/${w.total} ステップ`}><div className="text-xs tabular-nums">{pct(w.done, w.total)}%</div><Meter value={pct(w.done, w.total)} className="mt-1 h-1.5" /></div></td>
                  ))}
                  <td className="px-2">{l.check ? (
                    <div className="w-[92px]" title={CHECK_SUBJECTS.map((sb) => `${sb.name} ${l.check?.parts[sb.id] ? `${l.check.parts[sb.id]!.last}点` : '未受験'}`).join('・')}>
                      {CHECK_SUBJECTS.map((sb) => { const cp = l.check?.parts[sb.id]; return <div key={sb.id} className="flex items-center gap-1.5"><span className="w-3 shrink-0 text-[10px] text-ig-muted">{sb.name[0]}</span><Meter value={cp?.last || 0} className="h-1.5 flex-1" /><span className="w-6 shrink-0 text-right text-[11px] tabular-nums">{cp ? cp.last : '—'}</span></div>; })}
                    </div>
                  ) : <span className="text-xs text-ig-muted">未受験</span>}</td>
                  <td className="max-w-[130px] px-3 text-xs">{l.current ? <><div className="truncate font-medium">{l.current.no}</div><div className="truncate text-ig-muted">{l.current.title}</div></> : <span className="text-ig-muted">—</span>}</td>
                  <td className="px-3 text-xs tabular-nums">{a < 0 ? <span className="text-ig-muted">—</span> : <>{a}%<span className="ml-1 text-ig-muted">({l.attempts}回)</span></>}</td>
                  <td className="whitespace-nowrap px-3 text-xs text-ig-muted" suppressHydrationWarning>{l.lastAt ? ago(l.lastAt) : '—'}</td>
                  <td className="pl-3 pr-4"><StatusChip st={st} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ig-muted">行を押すと、クエストごとの進み具合と最近の答え合わせが右に出ます。進み具合＝正解したステップ ÷ 全ステップ。チェック＝スキルチェックの点（事＝事務スキル／I＝ITリテラシー／ビ＝ビジネスマナー／タ＝タイピング）。{d.worlds.map((w) => `${w.no.replace('ワールド', 'W')}＝${w.name}`).join('／')}</p>

      {opened && <Drawer l={opened.l} st={opened.st} worlds={d.worlds} member={roster.get(opened.l.key)} onClose={() => setOpenKey('')}
        onEmail={(email) => setD((x) => x && { ...x, learners: x.learners.map((y) => (y.key === opened.l.key ? { ...y, email } : y)) })} />}
    </div>
  );
}

// スキルチェックの点の帯（青1色の濃さ。線引きは lib/kyouiku-check.ts の checkLabel と同じ）
const BANDS = [{ label: '80点〜', min: 80, max: 100, op: 1 }, { label: '60点〜', min: 60, max: 79, op: 0.7 }, { label: '40点〜', min: 40, max: 59, op: 0.45 }, { label: '〜39点', min: 0, max: 39, op: 0.22 }] as const;
// 進み具合の棒（青1色。地は同じ青のうすい色）
function Meter({ value, className = '' }: { value: number; className?: string }) {
  return <div className={`overflow-hidden rounded-full bg-[#e6f4ff] ${className}`} role="img" aria-label={`${value}%`}><div className="h-full rounded-full bg-ig-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}
function StatusChip({ st }: { st: Status }) {
  const s = STATUS[st];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`} title={s.help}><s.Icon size={12} strokeWidth={2.25} />{s.label}</span>;
}
function Kpi({ label, value, unit, sub, Icon, meter, alert, onClick }: { label: string; value: number; unit: string; sub: string; Icon?: typeof Check; meter?: number; alert?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <div className="flex items-center justify-between text-xs text-ig-muted"><span>{label}</span>{Icon && <Icon size={16} strokeWidth={1.75} className={alert ? 'text-ig-danger' : ''} />}</div>
      <div className="mt-1.5 text-[28px] font-bold leading-none">{value}<span className="ml-0.5 text-sm font-semibold text-ig-muted">{unit}</span></div>
      {meter !== undefined && <Meter value={meter} className="mt-2 h-1.5" />}
      <div className="mt-1.5 truncate text-xs text-ig-muted">{sub}</div>
    </>
  );
  const cls = `rounded-2xl border p-4 text-left ${alert ? 'border-[#f5b5bb] bg-[#fff7f8]' : 'border-ig-border bg-white'}`;
  return onClick ? <button type="button" onClick={onClick} className={`${cls} ig-lift`}>{body}</button> : <div className={cls}>{body}</div>;
}
function Th({ k, sort, on, children, className = '', title }: { k: SortKey; sort: { k: SortKey; asc: boolean }; on: (k: SortKey) => void; children: React.ReactNode; className?: string; title?: string }) {
  const act = sort.k === k;
  return (
    <th className={`px-2 py-2.5 font-semibold ${className}`} aria-sort={act ? (sort.asc ? 'ascending' : 'descending') : 'none'} title={title}>
      <button type="button" onClick={() => on(k)} className={`inline-flex items-center gap-0.5 whitespace-nowrap hover:text-ig-text ${act ? 'text-ig-text' : ''}`}>
        {children}{act && (sort.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );
}

// 右に出る詳細（クエストごとの進み具合・最近の答え合わせ・Google アドレス・受講URL・スプシ）
function Drawer({ l, st, worlds, member, onClose, onEmail }: { l: Learner; st: Status; worlds: WorldInfo[]; member?: Member; onClose: () => void; onEmail: (email: string) => void }) {
  const [mail, setMail] = useState(l.email);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onClose]);
  const p = pct(l.done, l.total); const a = acc(l);
  const R = 34, C = 2 * Math.PI * R;
  const qOf = new Map(l.quests.map((x) => [x.id, x]));

  const post = (body: object) => fetch('/api/sy/s/kyouiku', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: l.key, ...body }) }).then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }));
  async function copyUrl() {
    const { ok, j } = await post({}); if (!ok) { setNote(j.error || '発行できませんでした'); return; }
    await navigator.clipboard?.writeText(`bdsh（スプシ講座）の受講ページです。PCで開いて、動画を見てから練習してみてください。\n${j.url}`);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  }
  async function saveMail() {
    if (mail.trim() === l.email) return;
    const { ok, j } = await post({ email: mail }); if (!ok) { setNote(j.error || '保存できませんでした'); return; }
    onEmail(j.email); setNote(j.warn || '保存しました');
  }

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={`${l.name} の受講データ`}>
      <button type="button" aria-label="閉じる" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="ig-rise absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col bg-white shadow-[var(--shadow-float)]">
        <div className="flex items-start gap-3 border-b border-ig-divider p-5">
          <Avatar name={l.name} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5"><h2 className="text-base font-bold">{l.name}</h2><span className="rounded bg-ig-hover px-1.5 py-px text-[10px] font-semibold text-ig-muted">{l.kind === 'staff' ? '内勤' : '要員'}</span>{l.trial && <span className="rounded bg-ig-hover px-1.5 py-px text-[10px] font-semibold text-ig-warn">おためし（参画決定前）</span>}<StatusChip st={st} /></div>
            <div className="mt-0.5 text-xs text-ig-muted">{[member?.status, member?.company, l.level && `レベル「${l.level}」`, l.startNo && `${l.startNo}から`].filter(Boolean).join('・') || 'アンケート未回答'}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる" className="rounded-full p-1.5 hover:bg-ig-hover"><X size={18} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {/* 進み具合のまとめ */}
          <div className="flex items-center gap-5">
            <svg viewBox="0 0 84 84" className="h-[84px] w-[84px] shrink-0" role="img" aria-label={`全体の進み具合 ${p}%`}>
              <circle cx="42" cy="42" r={R} fill="none" stroke="#e6f4ff" strokeWidth="8" />
              <circle cx="42" cy="42" r={R} fill="none" stroke="#0095f6" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(C * p) / 100} ${C}`} transform="rotate(-90 42 42)" />
              <text x="42" y="47" textAnchor="middle" fontSize="17" fontWeight="700" fill="#000">{p}%</text>
            </svg>
            <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div><dt className="text-ig-muted">クリア</dt><dd className="text-sm font-semibold">{l.cleared} / {l.quests.length} クエスト</dd></div>
              <div><dt className="text-ig-muted">ステップ</dt><dd className="text-sm font-semibold">{l.done} / {l.total}</dd></div>
              <div><dt className="text-ig-muted">正答率</dt><dd className="text-sm font-semibold">{a < 0 ? '—' : `${a}%（${l.attempts}回中 ${l.attempts - l.wrong}回）`}</dd></div>
              <div><dt className="text-ig-muted">最後の動き</dt><dd className="text-sm font-semibold" suppressHydrationWarning>{l.lastAt ? ago(l.lastAt) : '—'}</dd></div>
            </dl>
          </div>

          {/* スキルチェック（1科目でも受けた人だけ） */}
          {l.check && (
            <div className="mt-5 rounded-xl border border-ig-border p-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-[13px] font-bold">スキルチェック</h3>
                {l.check.avg !== null && <span className="text-xs text-ig-muted">総合 <b className="text-base text-ig-text">{l.check.avg}</b> 点{l.check.firstAvg !== null && l.check.firstAvg !== l.check.avg && `（初回 ${l.check.firstAvg}点）`}・{l.check.taken}/{CHECK_SUBJECTS.length}科目</span>}
              </div>
              <p className={`mt-1 inline-flex items-center gap-1 text-xs ${l.kind === 'member' && !member ? 'text-ig-danger' : 'text-ig-muted'}`}>
                {l.kind === 'member' && !member ? <><AlertTriangle size={12} />名簿に同じ氏名がありません（受講URLの氏名「{l.name}」）</> : <><Check size={12} strokeWidth={2.5} />{l.kind === 'staff' ? '内勤（ログインのメール）' : `名簿と一致${member?.name ? `（${member.name}）` : ''}`}</>}
                {l.check.self && <span className="ml-1">・本人確認ずみ</span>}
              </p>
              <div className="mt-3 space-y-3">
                {CHECK_SUBJECTS.map((sb) => {
                  const cp = l.check?.parts[sb.id];
                  return (
                    <div key={sb.id}>
                      <div className="flex items-center gap-2"><span className="w-[6.5em] shrink-0 text-xs font-semibold">{sb.name}</span><Meter value={cp?.last || 0} className="h-2 flex-1" /><span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums">{cp ? `${cp.last}点` : '—'}</span></div>
                      {!cp ? <p className="mt-0.5 text-xs text-ig-muted">まだ受けていません</p> : (
                        <>
                          <p className="mt-0.5 text-xs text-ig-muted" suppressHydrationWarning>{checkLabel(cp.last)}{cp.plays > 1 && `・初回 ${cp.first}点 → 最新 ${cp.last}点（${cp.plays}回）`}・{ago(cp.lastAt)}{sb.id === 'typing' && `・${cp.kpm}打/分・正確さ ${Math.round(cp.accuracy * 100)}%`}</p>
                          {cp.tags.length > 0 && <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">{cp.tags.map((t) => <span key={t.tag} className={`rounded px-1.5 py-px ${t.ok / t.total < 0.5 ? 'bg-[#fdecee] text-[#a3202c]' : 'bg-ig-hover text-ig-muted'}`}>{t.tag} {t.ok}/{t.total}</span>)}</p>}
                          {cp.items.length > 0 && (
                            <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                              {cp.items.map((it, k) => <li key={k} className={`flex items-center gap-1 ${it.ok ? '' : 'text-ig-muted'}`}>{it.ok ? <Check size={11} strokeWidth={2.5} className="shrink-0 text-[#1c6331]" /> : <X size={11} className="shrink-0 text-[#a3202c]" />}<span className="truncate">Q{k + 1} {it.label}{it.dk && '（わからない）'}</span></li>)}
                            </ul>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 連絡先と道具 */}
          <div className="mt-5 rounded-xl border border-ig-border p-3">
            <label className="flex items-center gap-2 text-xs text-ig-muted"><Mail size={14} />Google アドレス{l.kind === 'staff' && '（ログインのメール）'}</label>
            {l.kind === 'staff' ? <div className="mt-1 text-sm">{l.email}</div> : (
              <input type="email" value={mail} onChange={(e) => setMail(e.target.value)} onBlur={saveMail} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                placeholder="未登録（入れると本人だけにスプシを共有）" className={`${inputCls} mt-1 w-full`} />
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={copyUrl} className="inline-flex items-center gap-1 rounded-lg bg-ig-hover px-3 py-1.5 text-xs font-semibold hover:bg-ig-border">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'コピーしました' : '受講URLをコピー'}</button>
              {l.sheetUrl && <a href={l.sheetUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-lg bg-ig-hover px-3 py-1.5 text-xs font-semibold hover:bg-ig-border">本人のスプシを開く<ExternalLink size={14} /></a>}
            </div>
            {note && <p className="mt-2 text-xs text-ig-muted">{note}</p>}
          </div>

          {/* ワールドとクエスト */}
          <h3 className="mt-6 text-[13px] font-bold">クエストごとの進み具合</h3>
          <div className="mt-2 space-y-4">
            {worlds.map((w, wi) => (
              <div key={w.id}>
                <div className="flex items-center gap-2"><span className="text-xs font-semibold">{w.no}<span className="ml-1 font-normal text-ig-muted">{w.name}</span></span><Meter value={pct(l.worlds[wi]?.done || 0, w.total)} className="h-1.5 flex-1" /><span className="w-9 text-right text-xs tabular-nums text-ig-muted">{pct(l.worlds[wi]?.done || 0, w.total)}%</span></div>
                <ul className="mt-1.5 divide-y divide-ig-divider rounded-xl border border-ig-border">
                  {w.quests.map((x) => {
                    const s = qOf.get(x.id); const done = s?.done || 0; const cl = done >= x.total && x.total > 0;
                    return (
                      <li key={x.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                        <span className="w-[5.5em] shrink-0 whitespace-nowrap text-ig-muted">{x.no}</span>
                        <span className={`min-w-0 flex-1 truncate ${cl ? '' : done ? 'font-semibold' : 'text-ig-muted'}`}>{x.title}</span>
                        <span className="flex shrink-0 gap-1" role="img" aria-label={`${done}/${x.total} ステップ`}>{Array.from({ length: x.total }, (_, k) => <i key={k} className={`h-2 w-2 rounded-full ${k < done ? 'bg-ig-primary' : 'bg-[#e6f4ff]'}`} />)}</span>
                        <span className="w-[5.5em] shrink-0 text-right text-ig-muted">{cl ? <span className="inline-flex items-center gap-0.5 text-[#1c6331]"><Check size={12} strokeWidth={2.5} />クリア</span> : s?.wrong ? `ミス ${s.wrong}回` : done ? '途中' : '—'}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {/* 修了テスト（エクセルの さいごの しれん・タイピング検定。受けた人だけ） */}
          {(l.tests?.excel || l.tests?.typing) && (
            <>
              <h3 className="mt-6 text-[13px] font-bold">修了テスト</h3>
              <dl className="mt-2 grid grid-cols-2 gap-3 rounded-xl border border-ig-border bg-white p-3 text-xs">
                {l.tests.excel && <div><dt className="text-ig-muted">スプレッドシート（さいごの しれん）</dt><dd className="font-semibold">{l.tests.excel.passed ? `合格（まちがい ${l.tests.excel.bestMiss ?? 0}回）` : '挑戦中'}・{l.tests.excel.runs}回 挑戦</dd></div>}
                {l.tests.typing && <div><dt className="text-ig-muted">タイピング検定</dt><dd className="font-semibold tabular-nums">{l.tests.typing.label}{l.tests.typing.passed ? '（合格）' : ''}・{l.tests.typing.kpm}打/分・正確さ {Math.round(l.tests.typing.accuracy * 100)}%・{l.tests.typing.plays}回</dd></div>}
              </dl>
            </>
          )}

          {/* タイピング コース（1回でも遊んだ人だけ） */}
          {l.typing && (
            <>
              <h3 className="mt-6 text-[13px] font-bold">タイピング コース</h3>
              <div className="mt-2 rounded-xl border border-ig-border p-3">
                <div className="flex items-center gap-2"><span className="text-xs font-semibold">クリア</span><Meter value={pct(l.typing.cleared, l.typing.total)} className="h-1.5 flex-1" /><span className="text-xs tabular-nums text-ig-muted">{l.typing.cleared} / {l.typing.total} 章</span></div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-ig-muted">遊んだ回数</dt><dd className="font-semibold tabular-nums">{l.typing.plays} 回</dd></div>
                  <div><dt className="text-ig-muted">最高の速さ</dt><dd className="font-semibold tabular-nums">{l.typing.bestKpm ? `${l.typing.bestKpm} 打/分` : '—'}</dd></div>
                  <div><dt className="text-ig-muted">最高の正確率</dt><dd className="font-semibold tabular-nums">{l.typing.bestAccuracy ? `${Math.round(l.typing.bestAccuracy * 100)}%` : '—'}</dd></div>
                </dl>
                <ul className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  {l.typing.chapters.map((c) => (
                    <li key={c.id} className="rounded-lg border border-ig-border px-2 py-1.5">
                      <span className="text-ig-muted">{c.name}</span>
                      <span className="ml-1.5 font-semibold">{c.cleared ? `ランク ${c.rank}` : c.plays ? '挑戦中' : '—'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* MOS コース（1回でも触った人だけ） */}
          {l.mos && (
            <>
              <h3 className="mt-6 text-[13px] font-bold">MOS Excel コース{l.mos.ready && <span className="ml-2 rounded-full bg-ig-hover px-2 py-0.5 text-[11px] font-semibold">本番を受けていい状態</span>}</h3>
              <div className="mt-2 rounded-xl border border-ig-border p-3">
                <div className="flex items-center gap-2"><span className="text-xs font-semibold">クリア</span><Meter value={pct(l.mos.cleared, l.mos.total)} className="h-1.5 flex-1" /><span className="text-xs tabular-nums text-ig-muted">{l.mos.cleared} / {l.mos.total} レッスン</span></div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-ig-muted">模擬試験</dt><dd className="font-semibold tabular-nums">{l.mos.mockRuns ? `${l.mos.mockRuns} 回（最高 ${l.mos.mockBest}・直近 ${l.mos.mockLast}）` : '—'}</dd></div>
                  <div><dt className="text-ig-muted">答え合わせ</dt><dd className="font-semibold tabular-nums">{l.mos.attempts ? `${l.mos.attempts} 回（まだ ${l.mos.wrong}）` : '—'}</dd></div>
                  <div><dt className="text-ig-muted">Excel</dt><dd className="font-semibold">{l.mos.env || '—'}</dd></div>
                </dl>
                {!!l.mos.skipped.length && <p className="mt-2 text-xs text-ig-muted">「できているのに通らない」で先へ進めたタスク: {l.mos.skipped.join('、')}（判定を見直す目印）</p>}
              </div>
            </>
          )}

          {/* デザインリテラシー コース（スライドを作った人・答え合わせをした人だけ） */}
          {l.design && (
            <>
              <h3 className="mt-6 text-[13px] font-bold">デザインリテラシー コース</h3>
              <div className="mt-2 rounded-xl border border-ig-border p-3">
                <div className="flex items-center gap-2"><span className="text-xs font-semibold">合格</span><Meter value={pct(l.design.cleared, l.design.total)} className="h-1.5 flex-1" /><span className="text-xs tabular-nums text-ig-muted">{l.design.cleared} / {l.design.total} レッスン</span></div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-ig-muted">いまの級</dt><dd className="font-semibold">{l.design.level}</dd></div>
                  <div><dt className="text-ig-muted">答え合わせ</dt><dd className="font-semibold tabular-nums">{l.design.attempts ? `${l.design.attempts} 回（合格 ${l.design.attempts - l.design.wrong}）` : '—'}</dd></div>
                  <div><dt className="text-ig-muted">最後の答え合わせ</dt><dd className="font-semibold" suppressHydrationWarning>{l.design.lastAt ? ago(l.design.lastAt) : '—'}</dd></div>
                </dl>
                {l.design.deckUrl && <a href={l.design.deckUrl} target="_blank" rel="noopener" className="mt-3 inline-flex items-center gap-1 rounded-lg bg-ig-hover px-3 py-1.5 text-xs font-semibold hover:bg-ig-border">本人のスライドを開く<ExternalLink size={14} /></a>}
              </div>
            </>
          )}

          {/* CCNA コース */}
          {(l.ccna?.on || l.ccnaLec) && (
            <>
              <h3 className="mt-6 text-[13px] font-bold">CCNA コース{l.ccna && !l.ccna.on && <span className="ml-2 text-xs font-normal text-ig-muted">（いまはオフ）</span>}</h3>
              <div className="mt-2 rounded-xl border border-ig-border p-3">
                <div className="flex items-center gap-2"><span className="text-xs font-semibold">講義</span><Meter value={pct(l.ccnaLec?.done || 0, l.ccnaLec?.total || 0)} className="h-1.5 flex-1" /><span className="text-xs tabular-nums text-ig-muted">{l.ccnaLec ? `${l.ccnaLec.done} / ${l.ccnaLec.total} 章` : 'まだ'}</span></div>
                {l.ccnaLec?.current && <p className="mt-1 text-xs text-ig-muted">いまの章: {l.ccnaLec.current}</p>}
              </div>
            </>
          )}

          {/* 最近の答え合わせ */}
          <h3 className="mt-6 text-[13px] font-bold">最近の答え合わせ</h3>
          {l.recent.length === 0 ? <p className="mt-2 text-xs text-ig-muted">まだ答え合わせをしていません</p> : (
            <ol className="mt-2 space-y-1.5">
              {l.recent.map((r, k) => (
                <li key={k} className="flex items-center gap-2 text-xs">
                  {r.ok ? <CheckCircle2 size={14} className="shrink-0 text-ig-ok" /> : <X size={14} className="shrink-0 text-ig-danger" />}
                  <span className="min-w-0 flex-1 truncate">{r.no}・ステップ{r.step + 1}　{r.ok ? '正解' : '不正解'}</span>
                  <span className="shrink-0 text-ig-muted" suppressHydrationWarning>{ago(r.at)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}
