'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Clock, Copy, Download, Eye, EyeOff, History, Pencil, Search, Send, Undo2 } from 'lucide-react';
import type { Member } from '@/components/sy/compat';
import { COURSE_NAME, PART_LABEL, STALE_DAYS, STATUS_LABEL, isAutoUnit, partOf, type AdminLearner, type AdminState, type AdminSubmission, type Unit, type UnitStatus } from '@/lib/sy/course/types';
import { Avatar, Chip, ago, btnGray, btnPrimary, inputCls } from '@/components/sy/ui';
import Md from './Md';

// 講座「キッティングから情シスへ」の管理（/kyouiku のタブ「キッティング」・2026-10-09 shoya）。口は /api/sy/s/course
//   レビュー待ち … 提出物を読んで 合格／差し戻し＋コメント。合格の時に「スキルシート用の一文」を確かめて直せる
//   進捗       … 受講者×回のマトリクス。行を開くと その人の一文（まとめてコピー）と 提出の履歴
//   停滞       … STALE_DAYS 日 動きが無い人（画面に出すだけ・LINE は送らない）
//   提案候補   … 公開中の回が ぜんぶ合格の人（営業向け・一文をまとめてコピー）
//   受講者     … 人ごとに 受講をオン／オフ・対象者（キッティング現場に居る）フラグ・受講URL。自動では割り当てない
//   コンテンツ … 下書きの取り込み・本文を直す・公開／非公開（admin 以上）
//   ★結果の LINE は レビューのたびには飛ばない。上の帯の「LINE で知らせる」で 1人1通にまとめて送る。未連携の人には届かない（「未連携」と出す）
type View = 'review' | 'matrix' | 'stale' | 'done' | 'people' | 'content';
const CELL: Record<UnitStatus, { t: string; cls: string }> = {
  none: { t: '', cls: 'bg-ig-hover text-ig-muted' }, submitted: { t: '提', cls: 'bg-[#DBEAFE] text-[#1D4ED8]' },
  returned: { t: '差', cls: 'bg-[#FFEDD5] text-[#C2410C]' }, passed: { t: '合', cls: 'bg-[#D1FAE5] text-[#047857]' },
};
const day = (iso: string) => { if (!iso) return ''; const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
const linesText = (l: AdminLearner) => l.lines.map((x) => '・' + x.line).join('\n');

export default function CourseAdmin({ members, staff }: { members: Member[] | null; staff: { email: string; name: string }[] }) {
  const [d, setD] = useState<AdminState | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [view, setView] = useState<View>('review');
  const [busy, setBusy] = useState('');
  const [onlyTarget, setOnlyTarget] = useState(false);

  const load = useCallback(() => fetch('/api/sy/s/course').then(async (r) => { const j = await r.json(); if (!r.ok) setErr(j.error || '読み込めませんでした'); else { setD(j); setErr(''); } }).catch(() => setErr('読み込めませんでした')), []);
  useEffect(() => { load(); }, [load]);
  const post = useCallback(async (body: object): Promise<Record<string, unknown> | null> => {
    const r = await fetch('/api/sy/s/course', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'うまくいきませんでした'); return null; } setErr(''); return j;
  }, []);

  const learners = useMemo(() => (d?.learners || []).filter((l) => !onlyTarget || l.target), [d, onlyTarget]);
  const stale = learners.filter((l) => l.stale); const done = learners.filter((l) => l.allPassed);

  async function notify() {
    if (!d || !confirm(`${d.toNotify.people}人に、レビュー結果（${d.toNotify.items}件）を LINE で送ります。よろしいですか？`)) return;
    setBusy('notify'); const j = await post({ action: 'notify' }); setBusy('');
    if (j) { const f = (j.failed as { name: string; error: string }[]) || []; setMsg(`${j.sent}人に送りました（${j.items}件）${j.skipped ? `・未連携で送れなかった人 ${j.skipped}人` : ''}${f.length ? `・失敗 ${f.map((x) => x.name).join('、')}` : ''}`); load(); }
  }

  if (!d) return <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-ig-muted md:px-8">{err ? <span className="text-ig-danger">{err}（表がまだ無い場合は、マイグレーション 0021 の適用が必要です）</span> : '読み込み中…'}</div>;
  const pub = d.units.filter((u) => u.published).length;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold">{COURSE_NAME}</h2>
          <p className="mt-0.5 text-xs text-ig-muted">受講者 {d.learners.filter((l) => l.enabled).length}人・公開中 {pub}/{d.units.length}回・レビュー待ち {d.pending.length}件</p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-ig-muted"><input type="checkbox" checked={onlyTarget} onChange={(e) => setOnlyTarget(e.target.checked)} />対象者（キッティング現場）だけ</label>
      </div>

      {(d.toNotify.items > 0 || d.toNotify.unlinked > 0) && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-ig-border p-3 text-sm">
          <Send size={16} className="shrink-0 text-ig-muted" />
          <span className="mr-auto">まだ知らせていないレビュー結果: <b>{d.toNotify.people}人・{d.toNotify.items}件</b>
            {d.toNotify.unlinked > 0 && <span className="ml-2 text-ig-warn">LINE 未連携 {d.toNotify.unlinked}人（LINE では届きません。チャットなどで伝えてください）</span>}
            {!d.lineReady && <span className="ml-2 text-ig-muted">この環境には LINE の鍵が無いので送れません</span>}</span>
          <button type="button" disabled={!d.toNotify.items || !d.lineReady || busy === 'notify'} onClick={notify} className={btnPrimary}>{busy === 'notify' ? '送っています…' : 'LINE で知らせる（1人1通）'}</button>
        </div>
      )}
      {msg && <p className="mt-3 rounded-lg bg-ig-hover p-3 text-sm">{msg}</p>}
      {err && <p className="mt-3 rounded-lg bg-ig-hover p-3 text-sm text-ig-danger">{err}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        {([['review', `レビュー待ち ${d.pending.length}`], ['matrix', '進捗'], ['stale', `停滞 ${stale.length}`], ['done', `提案候補 ${done.length}`], ['people', '受講者'], ['content', 'コンテンツ']] as [View, string][]).map(([k, l]) => <Chip key={k} on={view === k} onClick={() => setView(k)}>{l}</Chip>)}
      </div>

      <div className="mt-5">
        {view === 'review' && <Review d={d} post={post} onDone={load} />}
        {view === 'matrix' && <Matrix units={d.units} learners={learners} post={post} />}
        {view === 'stale' && <PeopleList title={`${STALE_DAYS}日以上 動きが無い受講者`} empty="いまは居ません" units={d.units} learners={stale.sort((a, b) => a.last.localeCompare(b.last))} post={post} showLast />}
        {view === 'done' && <PeopleList title="全回合格（ヘルプデスク・情シス枠の提案候補）" empty="まだ居ません。公開中の回が ぜんぶ合格になると ここに出ます" units={d.units} learners={done} post={post} />}
        {view === 'people' && <People d={d} members={members} staff={staff} post={post} onDone={load} />}
        {view === 'content' && <Content d={d} post={post} onDone={load} />}
      </div>
    </div>
  );
}

type Post = (body: object) => Promise<Record<string, unknown> | null>;

function CopyBtn({ text, label = '文言をコピー' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return <button type="button" disabled={!text} onClick={() => { navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 2200); }).catch(() => {}); }}
    className="inline-flex items-center gap-1 rounded-lg bg-ig-hover px-3 py-1.5 text-xs font-semibold hover:bg-ig-border disabled:opacity-40">{ok ? <Check size={14} /> : <Copy size={14} />}{ok ? 'コピーしました' : label}</button>;
}
const LineBadge = ({ l }: { l: AdminLearner }) => l.line === 'none' ? <span className="shrink-0 rounded bg-ig-hover px-1.5 py-px text-[10px] font-semibold text-ig-warn">LINE 未連携</span> : null;
function Shots({ list }: { list: string[] }) {
  if (!list.length) return null;
  return <div className="mt-3 flex flex-wrap gap-2">{list.map((src, i) => (
    // eslint-disable-next-line @next/next/no-img-element
    <a key={i} href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt={`スクリーンショット ${i + 1}`} className="h-28 w-44 rounded-lg border border-ig-border object-cover" /></a>))}</div>;
}

// ---- レビュー待ち
function Review({ d, post, onDone }: { d: AdminState; post: Post; onDone: () => void }) {
  if (!d.pending.length) return <p className="rounded-xl border border-ig-border p-6 text-sm text-ig-muted">レビュー待ちの提出はありません。</p>;
  return <ul className="space-y-4">{d.pending.map((s) => <ReviewCard key={s.id} s={s} unit={d.units.find((u) => u.no === s.no)} learner={d.learners.find((l) => l.key === s.key)} post={post} onDone={onDone} />)}</ul>;
}
function ReviewCard({ s, unit, learner, post, onDone }: { s: AdminSubmission; unit?: Unit; learner?: AdminLearner; post: Post; onDone: () => void }) {
  const [comment, setComment] = useState('');
  const [line, setLine] = useState(s.sheetLine || unit?.sheetLine || '');
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<AdminSubmission[] | null>(null);
  async function act(verdict: 'passed' | 'returned') {
    if (verdict === 'returned' && !comment.trim()) { alert('差し戻す時は、どこを直せばよいかをコメントに書いてください'); return; }
    setBusy(true); const j = await post({ action: 'review', id: s.id, verdict, comment, line }); setBusy(false); if (j) onDone();
  }
  async function showHist() { if (hist) { setHist(null); return; } const j = await post({ action: 'history', key: s.key }); if (j) setHist(((j.list as AdminSubmission[]) || []).filter((x) => x.no === s.no && x.id !== s.id)); }
  return (
    <li className="rounded-xl border border-ig-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Avatar name={s.name} size="sm" /><span className="text-sm font-bold">{s.name}</span>{learner && <LineBadge l={learner} />}
        <span className="text-sm">第{s.no}回　{unit?.title}</span>
        <span className="rounded bg-ig-hover px-1.5 py-px text-[11px] font-semibold">{s.attempt}回目</span>
        {s.quizScore && <span className="text-xs text-ig-muted">確認テスト {s.quizScore}</span>}
        {unit && s.unitRevision !== unit.revision && <span className="text-xs text-ig-muted">本文の改訂前（版 {s.unitRevision}）に提出</span>}
        <span className="ml-auto text-xs text-ig-muted" suppressHydrationWarning>{ago(s.createdAt)}</span>
      </div>
      {unit?.deliverable && <p className="mt-3 rounded-lg bg-ig-subtle px-3 py-2 text-xs leading-relaxed text-ig-muted"><b className="mr-1.5 text-ig-text">提出するもの</b>{unit.deliverable}</p>}
      {s.body ? <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{s.body}</p> : <p className="mt-3 text-sm text-ig-muted">（文章なし・画像のみ）</p>}
      <Shots list={s.images} />
      <button type="button" onClick={showHist} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-ig-muted hover:text-ig-text"><History size={13} />{hist ? '前の提出を閉じる' : 'この回の前の提出を見る'}</button>
      {hist && (hist.length === 0 ? <p className="mt-2 text-xs text-ig-muted">この回の提出は これが最初です。</p> : <ul className="mt-2 space-y-2">{hist.map((h) => <HistItem key={h.id} h={h} />)}</ul>)}
      <div className="mt-4 grid gap-3 border-t border-ig-divider pt-4 md:grid-cols-2">
        <label className="block text-xs font-semibold">スキルシート用の一文（合格で確定・直せます）
          <textarea value={line} onChange={(e) => setLine(e.target.value)} rows={3} className={`${inputCls} mt-1 block w-full font-normal`} /></label>
        <label className="block text-xs font-semibold">コメント（差し戻しは必須・本人に LINE で届きます）
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className={`${inputCls} mt-1 block w-full font-normal`} /></label>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} onClick={() => act('returned')} className={`${btnGray} inline-flex items-center gap-1.5`}><Undo2 size={14} />差し戻す</button>
        <button type="button" disabled={busy} onClick={() => act('passed')} className={`${btnPrimary} inline-flex items-center gap-1.5`}><CheckCircle2 size={14} />合格にする</button>
      </div>
    </li>
  );
}
function HistItem({ h }: { h: AdminSubmission }) {
  const label = h.status === 'withdrawn' ? '本人が出し直した' : h.status === 'submitted' ? 'レビュー待ち' : STATUS_LABEL[h.status];
  return (
    <li className="rounded-lg bg-ig-subtle p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2 text-ig-muted"><b className="text-ig-text">第{h.no}回・{h.attempt}回目</b><span>{day(h.createdAt)} 提出</span><span className="font-semibold">{label}</span>{h.reviewedBy && <span>{h.reviewedBy.split('@')[0]}（{day(h.reviewedAt)}）</span>}
        {h.reviewedAt && (h.notifiedAt ? <span>LINE 通知済み</span> : <span className="text-ig-warn">未通知</span>)}</div>
      {h.body && <p className="mt-1.5 whitespace-pre-wrap break-words leading-relaxed">{h.body}</p>}
      <Shots list={h.images} />
      {h.comment && <p className="mt-1.5 whitespace-pre-wrap leading-relaxed"><b className="mr-1">コメント</b>{h.comment}</p>}
    </li>
  );
}

// ---- 進捗（受講者×回）
function Matrix({ units, learners, post }: { units: Unit[]; learners: AdminLearner[]; post: Post }) {
  const [open, setOpen] = useState('');
  if (!learners.length) return <p className="rounded-xl border border-ig-border p-6 text-sm text-ig-muted">受講者がまだ居ません。「受講者」で人を足してください。</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-ig-border">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead><tr className="border-b border-ig-divider text-left text-xs text-ig-muted">
          <th className="px-4 py-2 font-semibold">受講者</th>
          {units.map((u) => <th key={u.no} title={u.title} className={`w-9 px-1 py-2 text-center font-semibold ${u.published ? '' : 'opacity-40'}`}>{u.no}</th>)}
          <th className="px-3 py-2 font-semibold">最後の動き</th><th className="px-3 py-2" />
        </tr></thead>
        <tbody>
          {learners.map((l) => (
            <MatrixRow key={l.key} l={l} units={units} open={open === l.key} onToggle={() => setOpen(open === l.key ? '' : l.key)} post={post} />
          ))}
        </tbody>
      </table>
      <p className="border-t border-ig-divider px-4 py-2 text-[11px] text-ig-muted">合＝合格／提＝提出済（レビュー待ち）／差＝差し戻し／空＝未着手。薄い列は まだ公開していない回。行を押すと 一文と提出の履歴が開きます。</p>
    </div>
  );
}
function MatrixRow({ l, units, open, onToggle, post }: { l: AdminLearner; units: Unit[]; open: boolean; onToggle: () => void; post: Post }) {
  return (
    <>
      <tr className={`cursor-pointer border-b border-ig-divider hover:bg-ig-subtle ${l.enabled ? '' : 'opacity-50'}`} onClick={onToggle}>
        <td className="px-4 py-2"><span className="flex items-center gap-2"><Avatar name={l.name} size="sm" /><span className="font-semibold">{l.name}</span>
          {!l.target && <span className="rounded bg-ig-hover px-1.5 py-px text-[10px] font-semibold text-ig-muted">対象外</span>}{!l.enabled && <span className="rounded bg-ig-hover px-1.5 py-px text-[10px] font-semibold text-ig-muted">受講オフ</span>}
          {l.stale && <span className="inline-flex items-center gap-0.5 rounded bg-[#FFEDD5] px-1.5 py-px text-[10px] font-semibold text-[#C2410C]"><Clock size={10} />停滞</span>}
          {l.allPassed && <span className="rounded bg-[#D1FAE5] px-1.5 py-px text-[10px] font-semibold text-[#047857]">全回合格</span>}<LineBadge l={l} /></span></td>
        {units.map((u) => { const c = CELL[l.status[u.no] || 'none']; return <td key={u.no} className={`px-1 py-2 text-center ${u.published ? '' : 'opacity-40'}`}><span title={`第${u.no}回 ${STATUS_LABEL[l.status[u.no] || 'none']}`} className={`inline-flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold ${c.cls}`}>{c.t}</span></td>; })}
        <td className="whitespace-nowrap px-3 py-2 text-xs text-ig-muted" suppressHydrationWarning>{l.last ? ago(l.last) : ''}</td>
        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}><CopyBtn text={linesText(l)} /></td>
      </tr>
      {open && <tr className="border-b border-ig-divider bg-ig-subtle"><td colSpan={units.length + 3} className="px-4 py-4"><Detail l={l} post={post} /></td></tr>}
    </>
  );
}
function Detail({ l, post }: { l: AdminLearner; post: Post }) {
  const [hist, setHist] = useState<AdminSubmission[] | null>(null);
  useEffect(() => { let on = true; post({ action: 'history', key: l.key }).then((j) => { if (on && j) setHist((j.list as AdminSubmission[]) || []); }); return () => { on = false; }; }, [l.key, post]);
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <h3 className="text-xs font-bold">スキルシート用の文言（合格した回）</h3>
        {l.lines.length === 0 ? <p className="mt-2 text-xs text-ig-muted">まだ合格した回がありません。</p>
          : <ol className="mt-2 space-y-1.5 text-sm leading-relaxed">{l.lines.map((x) => <li key={x.no}><span className="mr-2 text-xs text-ig-muted">第{x.no}回</span>{x.line}</li>)}</ol>}
        <div className="mt-3"><CopyBtn text={linesText(l)} label="まとめてコピー" /></div>
      </div>
      <div>
        <h3 className="text-xs font-bold">提出の履歴</h3>
        {!hist ? <p className="mt-2 text-xs text-ig-muted">読み込み中…</p> : hist.length === 0 ? <p className="mt-2 text-xs text-ig-muted">まだ提出がありません。</p>
          : <ul className="mt-2 max-h-96 space-y-2 overflow-y-auto">{hist.map((h) => <HistItem key={h.id} h={h} />)}</ul>}
      </div>
    </div>
  );
}

// ---- 停滞・提案候補
function PeopleList({ title, empty, units, learners, post, showLast }: { title: string; empty: string; units: Unit[]; learners: AdminLearner[]; post: Post; showLast?: boolean }) {
  const [open, setOpen] = useState('');
  const pub = units.filter((u) => u.published);
  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-bold">{showLast && <AlertTriangle size={15} className="text-ig-warn" />}{title}<span className="text-ig-muted">{learners.length}人</span></h3>
      {showLast && <p className="mt-1 text-xs text-ig-muted">受講を始めてから、または最後の提出・レビューから {STALE_DAYS}日 動きが無い人です。LINE は自動では送りません。</p>}
      {learners.length === 0 ? <p className="mt-3 rounded-xl border border-ig-border p-6 text-sm text-ig-muted">{empty}</p> : (
        <ul className="mt-3 divide-y divide-ig-divider rounded-xl border border-ig-border">
          {learners.map((l) => (
            <li key={l.key} className={showLast ? 'bg-[#FFF7ED]' : ''}>
              <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Avatar name={l.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5"><span className="truncate text-sm font-semibold">{l.name}</span><LineBadge l={l} />{!l.target && <span className="rounded bg-ig-hover px-1.5 py-px text-[10px] font-semibold text-ig-muted">対象外</span>}</div>
                  <div className="text-xs text-ig-muted" suppressHydrationWarning>合格 {pub.filter((u) => l.status[u.no] === 'passed').length}/{pub.length}回{l.last ? `・最後の動き ${day(l.last)}（${ago(l.last)}）` : ''}</div>
                </div>
                <button type="button" onClick={() => setOpen(open === l.key ? '' : l.key)} className={btnGray}>{open === l.key ? '閉じる' : '詳しく'}</button>
                <CopyBtn text={linesText(l)} />
              </div>
              {open === l.key && <div className="border-t border-ig-divider bg-ig-subtle px-4 py-4"><Detail l={l} post={post} /></div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---- 受講者（人ごとにオン／オフ・対象者フラグ・受講URL）
function People({ d, members, staff, post, onDone }: { d: AdminState; members: Member[] | null; staff: { email: string; name: string }[]; post: Post; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState('');
  const have = useMemo(() => new Map(d.learners.map((l) => [l.key, l])), [d]);
  const found = useMemo(() => {
    if (!q.trim()) return [];
    const ms = (members || []).filter((m) => m.kind === 'employee' && m.status !== '退社' && (m.name.includes(q) || m.kana.includes(q))).map((m) => ({ key: m.key, name: m.name, sub: `${m.status}${m.company ? '・' + m.company : ''}` }));
    const ss = staff.filter((x) => x.name.includes(q) || x.email.includes(q.toLowerCase())).map((x) => ({ key: 'u:' + x.email, name: x.name || x.email, sub: '内勤（テスト用）' }));
    return [...ms, ...ss].filter((x) => !have.has(x.key)).slice(0, 30);
  }, [q, members, staff, have]);
  const set = async (key: string, name: string, v: { enabled?: boolean; target?: boolean }) => { if (await post({ action: 'enroll', key, name, ...v })) onDone(); };
  async function copyUrl(key: string) {
    const j = await post({ action: 'url', key }); if (!j) return;
    await navigator.clipboard?.writeText(`bdsh の講座「${COURSE_NAME}」の受講ページです。PCで開いて、「コースを選ぶ」から進めてください。\n${j.url}`);
    setCopied(key); setTimeout(() => setCopied(''), 2500);
  }
  return (
    <div>
      <p className="text-sm text-ig-muted">この講座は 自動では割り当てません。キッティングの現場に入っている人（入る予定の人）を ここで足してください。現場が変わった人は「対象者」だけ外せます（受講は続けられます）。受講URL は bdsh のほかのコースと同じものです。</p>
      <label className="relative mt-3 inline-block"><Search size={16} className="absolute left-2.5 top-2.5 text-ig-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前で探して受講者に足す" className={`${inputCls} w-80 max-w-full pl-8`} /></label>
      {q.trim() && (
        <ul className="mt-2 divide-y divide-ig-divider rounded-xl border border-ig-border">
          {members === null && <li className="p-3 text-sm text-ig-muted">名簿を読み込み中…</li>}
          {members && found.length === 0 && <li className="p-3 text-sm text-ig-muted">該当する人がいません（すでに受講者の人は 下の一覧に居ます）</li>}
          {found.map((x) => (
            <li key={x.key} className="flex items-center gap-3 px-4 py-2"><Avatar name={x.name} size="sm" />
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{x.name}</div><div className="truncate text-xs text-ig-muted">{x.sub}</div></div>
              <button type="button" onClick={() => set(x.key, x.name, { enabled: true, target: !x.key.startsWith('u:') })} className={btnPrimary}>受講者に足す</button></li>
          ))}
        </ul>
      )}
      <h3 className="mt-6 text-sm font-bold">受講者 <span className="text-ig-muted">{d.learners.length}人</span></h3>
      {d.learners.length === 0 ? <p className="mt-2 rounded-xl border border-ig-border p-6 text-sm text-ig-muted">まだ居ません。</p> : (
        <ul className="mt-2 divide-y divide-ig-divider rounded-xl border border-ig-border">
          {d.learners.map((l) => (
            <li key={l.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <Avatar name={l.name} size="sm" />
              <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><span className="truncate text-sm font-semibold">{l.name}</span><LineBadge l={l} /></div>
                <div className="text-xs text-ig-muted">{day(l.enrolledAt)} から{l.key.startsWith('u:') ? '・内勤（テスト用）' : ''}</div></div>
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={l.target} onChange={(e) => set(l.key, l.name, { target: e.target.checked })} />対象者</label>
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={l.enabled} onChange={(e) => set(l.key, l.name, { enabled: e.target.checked })} />受講できる</label>
              <button type="button" onClick={() => copyUrl(l.key)} className="inline-flex items-center gap-1 rounded-lg bg-ig-hover px-3 py-1.5 text-xs font-semibold hover:bg-ig-border">{copied === l.key ? <Check size={14} /> : <Copy size={14} />}{copied === l.key ? 'コピーしました' : 'URLをコピー'}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- コンテンツ（下書きの取り込み・本文・公開）
function Content({ d, post, onDone }: { d: AdminState; post: Post; onDone: () => void }) {
  const [edit, setEdit] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  async function seed() { setBusy(true); const j = await post({ action: 'seed' }); setBusy(false); if (j) onDone(); }
  async function publish(u: Unit) {
    if (!u.published && !confirm(`第${u.no}回「${u.title}」を公開します。受講者に見えるようになります。よろしいですか？`)) return;
    if (await post({ action: 'publish', no: u.no, published: !u.published })) onDone();
  }
  return (
    <div>
      <p className="text-sm text-ig-muted">基礎編＝「提出するもの」が空で 確認テストがある回（全問正解で その場で合格）。実践編＝成果物を出してレビュー（「提出するもの」を書けば 実践編に、空にすれば 基礎編になります）。試験対策編＝第9回から（資格 AB-900 の出題範囲・確認テストで合格）。本文は下書き（未公開）で入ります。中身を確かめて、回ごとに公開してください。公開した後に本文を直しても、すでに合格した人の状態と一文は変わりません。{!d.canEdit && ' 取り込み・編集・公開ができるのは admin と super admin です。'}</p>
      {d.seed.missing > 0 && d.canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-ig-border p-3 text-sm">
          <Download size={16} className="shrink-0 text-ig-muted" /><span className="mr-auto">まだ取り込んでいない下書きが {d.seed.missing}回ぶん あります（全{d.seed.total}回）。未公開のまま入ります。</span>
          <button type="button" disabled={busy} onClick={seed} className={btnPrimary}>{busy ? '取り込み中…' : '下書きを取り込む'}</button>
        </div>
      )}
      <ul className="mt-4 divide-y divide-ig-divider rounded-xl border border-ig-border">
        {d.units.length === 0 && <li className="p-6 text-sm text-ig-muted">まだ回がありません。</li>}
        {d.units.map((u) => (
          <li key={u.no}>
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ig-hover text-xs font-bold">{u.no}</span>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{u.title}</div>
                <div className="truncate text-xs text-ig-muted">{PART_LABEL[partOf({ no: u.no, auto: isAutoUnit(u) })]}（{isAutoUnit(u) ? '確認テストで合格・レビューなし' : '成果物をレビュー'}）・{u.minutes}{(u.quiz || []).length ? `・確認テスト ${(u.quiz || []).length}問` : ''}・版 {u.revision}{u.updatedBy ? `・${u.updatedBy.split('@')[0]}` : ''}{(u.body + u.practice).includes('★要確認') ? '・★要確認あり' : ''}</div></div>
              <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${u.published ? 'bg-[#D1FAE5] text-[#047857]' : 'bg-ig-hover text-ig-muted'}`}>{u.published ? <Eye size={12} /> : <EyeOff size={12} />}{u.published ? '公開中' : '下書き'}</span>
              <button type="button" onClick={() => setEdit(edit === u.no ? null : u.no)} className={`${btnGray} inline-flex items-center gap-1.5`}><Pencil size={13} />{edit === u.no ? '閉じる' : d.canEdit ? '見る・直す' : '見る'}</button>
              {d.canEdit && <button type="button" onClick={() => publish(u)} className={u.published ? btnGray : btnPrimary}>{u.published ? '非公開に戻す' : '公開する'}</button>}
            </div>
            {edit === u.no && <UnitEditor key={u.revision} u={u} canEdit={d.canEdit} post={post} onDone={onDone} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
function UnitEditor({ u, canEdit, post, onDone }: { u: Unit; canEdit: boolean; post: Post; onDone: () => void }) {
  const [f, setF] = useState({ title: u.title, goal: u.goal, minutes: u.minutes, body: u.body, practice: u.practice, deliverable: u.deliverable, sheetLine: u.sheetLine });
  const [quiz, setQuiz] = useState(JSON.stringify(u.quiz || [], null, 2));
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [busy, setBusy] = useState(false); const [note, setNote] = useState('');
  const upd = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    let q: unknown; try { q = JSON.parse(quiz || '[]'); } catch { setNote('確認テストの書き方（JSON）が正しくありません'); return; }
    const patch: Record<string, unknown> = {}; (Object.keys(f) as (keyof typeof f)[]).forEach((k) => { if (f[k] !== u[k]) patch[k] = f[k]; });
    if (JSON.stringify(q) !== JSON.stringify(u.quiz || [])) patch.quiz = q;
    if (!Object.keys(patch).length) { setNote('変えたところがありません'); return; }
    setBusy(true); const j = await post({ action: 'unit', no: u.no, patch }); setBusy(false);
    if (j) { setNote('保存しました'); onDone(); }
  }
  const ta = `${inputCls} mt-1 block w-full font-mono text-[13px] font-normal leading-relaxed`;
  return (
    <div className="border-t border-ig-divider bg-ig-subtle px-4 py-4">
      {canEdit && <div className="mb-3 flex gap-2"><Chip on={mode === 'preview'} onClick={() => setMode('preview')}>受講者の見え方</Chip><Chip on={mode === 'edit'} onClick={() => setMode('edit')}>直す</Chip></div>}
      {mode === 'preview' || !canEdit ? (
        <div className="rounded-xl bg-white p-5">
          <p className="text-xs text-ig-muted">目的</p><p className="text-sm leading-relaxed">{f.goal}</p>
          <p className="mt-4 text-xs font-bold text-ig-muted">解説</p><Md text={f.body} />
          <p className="mt-6 text-xs font-bold text-ig-muted">実習手順</p><Md text={f.practice} />
          <p className="mt-6 text-xs font-bold text-ig-muted">提出するもの</p><p className="text-sm leading-relaxed">{f.deliverable}</p>
          <p className="mt-4 text-xs font-bold text-ig-muted">スキルシート用の一文（テンプレート）</p><p className="text-sm leading-relaxed">{f.sheetLine}</p>
          {(u.quiz || []).length > 0 && <><p className="mt-4 text-xs font-bold text-ig-muted">確認テスト（正解に ○）</p>
            <ol className="mt-1 list-decimal space-y-2 pl-5 text-sm">{(u.quiz || []).map((q, i) => <li key={i}>{q.q}<ul className="mt-1 space-y-0.5 text-[13px] text-ig-muted">{q.choices.map((c, j) => <li key={j} className={j === q.answer ? 'font-semibold text-ig-ok' : ''}>{j === q.answer ? '○ ' : '・ '}{c}</li>)}</ul></li>)}</ol></>}
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-[1fr_160px]">
            <label className="text-xs font-semibold">タイトル<input value={f.title} onChange={upd('title')} className={`${inputCls} mt-1 block w-full font-normal`} /></label>
            <label className="text-xs font-semibold">所要時間<input value={f.minutes} onChange={upd('minutes')} className={`${inputCls} mt-1 block w-full font-normal`} /></label>
          </div>
          <label className="text-xs font-semibold">目的<textarea value={f.goal} onChange={upd('goal')} rows={2} className={`${inputCls} mt-1 block w-full font-normal`} /></label>
          <label className="text-xs font-semibold">解説（Markdown。見出しは ##、コードの囲みは ~~~）<textarea value={f.body} onChange={upd('body')} rows={16} className={ta} /></label>
          <label className="text-xs font-semibold">実習手順（Markdown）<textarea value={f.practice} onChange={upd('practice')} rows={12} className={ta} /></label>
          <label className="text-xs font-semibold">提出するもの（空にすると 基礎編＝確認テストだけで合格）<textarea value={f.deliverable} onChange={upd('deliverable')} rows={2} className={`${inputCls} mt-1 block w-full font-normal`} /></label>
          <label className="text-xs font-semibold">スキルシート用の一文（テンプレート）<textarea value={f.sheetLine} onChange={upd('sheetLine')} rows={2} className={`${inputCls} mt-1 block w-full font-normal`} /></label>
          <label className="text-xs font-semibold">確認テスト（JSON。q＝問題／choices＝選択肢／answer＝正解の番号（0から）／explain＝解説。無い回は []）<textarea value={quiz} onChange={(e) => setQuiz(e.target.value)} rows={6} className={ta} /></label>
          <div className="flex items-center gap-3"><button type="button" disabled={busy} onClick={save} className={btnPrimary}>{busy ? '保存中…' : '保存する'}</button>{note && <span className="text-xs text-ig-muted">{note}</span>}</div>
        </div>
      )}
    </div>
  );
}
