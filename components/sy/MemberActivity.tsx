'use client';
import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ClipboardList, Handshake } from 'lucide-react';
import type { MemberBase, MemberStudy, StudyAns } from '@/components/sy/compat';
import type { Memo } from '@/components/sy/compat';
import type { Member } from '@/components/sy/compat';
import { isSurveyTarget } from '@/lib/sy/survey';
import { MENDAN_KINDS, MENDAN_KIND_NAME } from '@/lib/sy/teiki-types';
import { MinutesModal } from '@/components/sy/MemoEdit';

// 要員の詳細に出す「活動の記録」: 月次アンケートの回答・面談（リーダー／定期／フォロー）の実施日・勉強会の出欠。読むだけ。
//   勉強会は回答シートを毎回読むので遅い＝別に呼んで あとから出す。人を切り替えたら key で作り直す（呼び側）。
const jst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3);
// 実施日。今年のものは 月/日、それ以外は 年/月/日
function ymd(iso: string): string {
  const d = jst(iso); if (isNaN(d.getTime())) return iso;
  const y = d.getUTCFullYear(), md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return y === jst(new Date().toISOString()).getUTCFullYear() ? md : `${y}/${md}`;
}
const monthLabel = (ym: string) => `${Number(ym.slice(5, 7))}月分`;
const SHOW = 8;   // 日付を並べる数（それより古いものは「ほか◯回」）

function Row({ icon, title, head, children }: { icon: React.ReactNode; title: string; head: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline gap-2">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-ig-text">{icon}{title}</span>
        <span className="min-w-0 text-xs text-ig-muted">{head}</span>
      </div>
      {children}
    </div>
  );
}
const Pill = ({ children, tone }: { children: React.ReactNode; tone?: 'ok' | 'ng' }) => (
  <span className={`rounded px-1.5 py-0.5 text-[11px] ${tone === 'ok' ? 'bg-[#2e9e4f]/10 text-[#2e9e4f]' : tone === 'ng' ? 'bg-ig-danger/10 text-ig-danger' : 'bg-white text-ig-text ring-1 ring-ig-border'}`}>{children}</span>
);
// 面談の実施日。押すと その日の議事録が開く（2026-10-09 shoya）
const pillBtn = 'ig-press rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-ig-link ring-1 ring-ig-border hover:bg-ig-hover';
function Dates({ list, onOpen }: { list: { id: string; at: string }[]; onOpen: (id: string) => void }) {
  const [all, setAll] = useState(false);
  if (!list.length) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {(all ? list : list.slice(0, SHOW)).map((r) => <button key={r.id} onClick={() => onOpen(r.id)} title="議事録を開く" className={pillBtn}>{ymd(r.at)}</button>)}
      {!all && list.length > SHOW && <button onClick={() => setAll(true)} className="text-[11px] font-semibold text-ig-link">ほか{list.length - SHOW}回</button>}
    </div>
  );
}

// ── アクションログ（2026-10-08 shoya「要員ごとのアクションログ・アンケート未回答とか面談未実施とか実施とか」）
//   月ごとに 月次アンケート（回答／未回答）・面談（実施／未実施）・勉強会の出欠 を並べる。新しく表は作らず、残っている記録から毎回組む。
//   「未回答・未実施」を出すのは その月に対象だったと言える分だけ:
//     従業員で 退社・入社予定 でない人（アンケートは 稼働中・待機 だけ＝lib/survey.ts）／入社日の月から後／記録が残り始めた月から後。
//     入社日が分からない人は いちばん新しい月だけ（過去の月に在籍していたかが分からないので）。
type LogItem = { k: string; label: string; text: string; tone?: 'ok' | 'ng'; open?: string };   // open＝押すと開く議事録の id
const ymOf = (iso: string) => { const d = jst(iso); return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 7); };
const nyushaYm = (s: string) => { const x = /(\d{4})\D+(\d{1,2})/.exec(s || ''); return x ? `${x[1]}-${x[2].padStart(2, '0')}` : ''; };
const LOG_FIRST = 4;   // 最初に出す月の数
// メモ欄の記録（電話・LINE・メモ・ステージ変更）もログに並べる。面談のメモは 上の面談の行と だぶるので入れない
const MEMO_LABEL: Record<string, string> = { call: '電話', line: 'LINE', memo: 'メモ', stage: 'ステージ' };
const cut = (t: string, n = 36) => { const x = t.replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n) + '…' : x; };
function buildLog(m: Member, base: MemberBase, study: StudyAns[], memos: Memo[]): { ym: string; items: LogItem[] }[] {
  const nowYm = ymOf(new Date().toISOString());
  const joined = nyushaYm(m.nyusha);
  const emp = m.kind === 'employee' && m.status !== '退社' && m.status !== '入社予定';
  const svTarget = emp && isSurveyTarget(m);
  // その月に対象だったと言えるか（入社日が無ければ いちばん新しい月だけ）
  const wasIn = (ym: string, newest: string) => (joined ? ym >= joined : ym === newest);
  const months = new Set<string>();
  if (base.survey) base.surveyMonths.forEach((ym) => { if (svTarget && wasIn(ym, base.surveyLatest)) months.add(ym); });
  base.survey?.forEach((s) => months.add(s.month));
  if (base.mendan && emp && base.mendanFrom) {
    for (let ym = nowYm; ym >= base.mendanFrom && wasIn(ym, nowYm); ) {
      months.add(ym);
      const [y, mo] = ym.split('-').map(Number); ym = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
    }
  }
  base.mendanLog.forEach((r) => months.add(ymOf(r.at)));
  study.forEach((s) => { const ym = ymOf(s.at); if (ym) months.add(ym); });
  const notes = memos.filter((a) => a.kind !== 'mendan');
  notes.forEach((a) => months.add(ymOf(a.created_at)));
  return [...months].filter(Boolean).sort((a, b) => b.localeCompare(a)).map((ym) => {
    const items: LogItem[] = [];
    if (base.survey && base.surveyMonths.includes(ym)) {
      const a = base.survey.filter((s) => s.month === ym);
      if (a.length) items.push({ k: 'sv', label: '月次アンケート', text: `回答（${ymd(a[a.length - 1].at)}）`, tone: 'ok' });
      else if (svTarget && wasIn(ym, base.surveyLatest)) items.push({ k: 'sv', label: '月次アンケート', text: '未回答', tone: 'ng' });
    }
    if (base.mendan) {
      const a = base.mendanLog.filter((r) => ymOf(r.at) === ym);
      a.forEach((r, i) => items.push({ k: 'md' + i, label: `${MENDAN_KIND_NAME[r.kind]}面談`, text: `実施（${ymd(r.at)}${r.by ? `・${r.by}` : ''}）`, tone: 'ok', open: r.id }));
      if (!a.length && emp && base.mendanFrom && ym >= base.mendanFrom && ym <= nowYm && wasIn(ym, nowYm)) items.push({ k: 'md', label: '面談', text: ym === nowYm ? '今月まだ' : '未実施', tone: 'ng' });
    }
    study.filter((s) => ymOf(s.at) === ym).forEach((s, i) => items.push({ k: 'st' + i, label: '勉強会', text: `${s.event}：${s.answer || '未記入'}`, tone: s.attend ? 'ok' : undefined }));
    notes.filter((a) => ymOf(a.created_at) === ym).forEach((a) => items.push({ k: 'mm' + a.id, label: MEMO_LABEL[a.kind] || 'メモ', text: [ymd(a.created_at), a.actor_name || (a.actor_email || '').split('@')[0], cut(a.body || '')].filter(Boolean).join('・') }));
    return { ym, items };
  }).filter((g) => g.items.length);
}
function ActionLog({ m, base, study, memos, onOpen }: { m: Member; base: MemberBase; study: MemberStudy | null; memos: Memo[]; onOpen: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const log = useMemo(() => buildLog(m, base, study?.study || [], memos), [m, base, study, memos]);
  const nNg = log.reduce((n, g) => n + g.items.filter((i) => i.tone === 'ng').length, 0);
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-sm font-bold text-ig-text">アクションログ</span>
        {nNg > 0 && <span className="rounded bg-ig-danger/10 px-1.5 py-0.5 text-[11px] font-semibold text-ig-danger">未回答・未実施 {nNg}件</span>}
      </div>
      <div className="rounded-lg bg-ig-subtle p-4">
        {log.length === 0 ? <p className="text-center text-xs text-ig-muted">まだ記録はありません</p> : (
          <ol className="space-y-3">
            {(all ? log : log.slice(0, LOG_FIRST)).map((g) => (
              <li key={g.ym} className="grid grid-cols-[3.5rem_1fr] gap-x-3">
                <div className="pt-0.5 text-xs font-semibold text-ig-text">{g.ym.slice(0, 4) === ymOf(new Date().toISOString()).slice(0, 4) ? '' : `${g.ym.slice(0, 4)}/`}{Number(g.ym.slice(5))}月</div>
                <ul className="space-y-1">
                  {g.items.map((i) => (
                    <li key={i.k} className="flex min-w-0 items-baseline gap-2 text-xs">
                      <span className="w-[6.5rem] shrink-0 text-ig-muted">{i.label}</span>
                      {i.open ? <button onClick={() => onOpen(i.open!)} title="議事録を開く" className="ig-press rounded bg-[#2e9e4f]/10 px-1.5 py-0.5 text-left text-[11px] text-[#2e9e4f] underline-offset-2 hover:underline">{i.text}</button> : <Pill tone={i.tone}>{i.text}</Pill>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
        {log.length > LOG_FIRST && <button onClick={() => setAll((v) => !v)} className="mt-3 text-xs font-semibold text-ig-link">{all ? '閉じる' : `前の月も見る（あと${log.length - LOG_FIRST}か月）`}</button>}
      </div>
      {!study && <p className="mt-1 text-[11px] text-ig-muted">勉強会の出欠を読み込み中…</p>}
    </div>
  );
}

const get = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url, { cache: 'no-store' }); const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `読み込みに失敗しました（${r.status}）`);
  return j as T;
};
// rev＝面談のメモを書いた・直した・消したときに増える（面談の行を読み直す）。onChanged＝議事録の窓で直した・消したことを呼び側に知らせる
export default function MemberActivity({ m, memos, rev = 0, onChanged }: { m: Member; memos?: Memo[] | null; rev?: number; onChanged?: () => void }) {
  const [openId, setOpenId] = useState('');
  const [base, setBase] = useState<MemberBase | null>(null);
  const [study, setStudy] = useState<MemberStudy | null>(null);
  const [err, setErr] = useState('');

  const q = `key=${encodeURIComponent(m.key)}&name=${encodeURIComponent(m.name)}`;
  useEffect(() => {
    let off = false;
    get<MemberBase>(`/api/sy/s/member-activity?${q}`).then((j) => { if (!off) setBase(j); }).catch((e) => { if (!off) setErr((e as Error).message); });
    return () => { off = true; };
  }, [q, rev]);
  // 勉強会は回答シートを読むので遅い＝面談を直しても読み直さない
  useEffect(() => {
    let off = false;
    get<MemberStudy>(`/api/sy/s/member-activity?${q}&part=study`).then((j) => { if (!off) setStudy(j); }).catch((e) => { if (!off) setStudy({ study: [], warnings: [(e as Error).message] }); });
    return () => { off = true; };
  }, [q]);

  const sv = base?.survey || null;
  const todo = !!base && !!sv && !!base.surveyLatest && isSurveyTarget(m) && !sv.some((s) => s.month === base.surveyLatest);
  const attended = study ? study.study.filter((s) => s.attend) : [];
  const warnings = [...(base?.warnings || []), ...(study?.warnings || [])];

  return (
    <div className="mx-5 mt-4">
      <div className="mb-2 text-sm font-bold text-ig-text">活動の記録</div>
      <div className="divide-y divide-ig-divider rounded-lg bg-ig-subtle p-4">
        {err ? <p className="text-xs text-ig-danger">{err}</p> : !base ? <p className="text-center text-xs text-ig-muted">読み込み中…</p> : (
          <>
            <Row icon={<ClipboardList size={13} strokeWidth={2} />} title="月次アンケート"
              head={!sv ? '読めませんでした' : sv.length ? `回答 ${sv.length}回・直近 ${monthLabel(sv[0].month)}（${ymd(sv[0].at)} に回答）` : 'まだ回答なし'}>
              {(todo || (sv && sv.length > 0)) && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {todo && <Pill tone="ng">{monthLabel(base.surveyLatest)} まだ</Pill>}
                  {sv?.slice(0, SHOW).map((s) => <Pill key={s.at} tone="ok">{monthLabel(s.month)} {ymd(s.at)}</Pill>)}
                </div>
              )}
            </Row>
            {MENDAN_KINDS.map((k) => {
              const list = base.mendan ? base.mendanLog.filter((r) => r.kind === k) : [];
              return (
                <Row key={k} icon={<Handshake size={13} strokeWidth={2} />} title={`${MENDAN_KIND_NAME[k]}面談`}
                  head={!base.mendan ? '読めませんでした' : list.length ? `${list.length}回・直近 ${ymd(list[0].at)}・日付を押すと議事録` : 'まだ実施なし'}>
                  <Dates list={list} onOpen={setOpenId} />
                </Row>
              );
            })}
          </>
        )}
        {!err && base && (
          <Row icon={<BookOpen size={13} strokeWidth={2} />} title="勉強会"
            head={!study ? '読み込み中…' : study.study.length ? `出席の回答 ${attended.length}回${attended.length ? `・直近 ${attended[0].event}` : ''}` : study.warnings.length ? '読めませんでした' : '出欠の回答なし'}>
            {study && study.study.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {study.study.slice(0, SHOW).map((s) => <Pill key={s.form + s.event} tone={s.attend ? 'ok' : undefined}>{s.event}：{s.answer || '未記入'}</Pill>)}
              </div>
            )}
          </Row>
        )}
      </div>
      {warnings.length > 0 && <p className="mt-1 text-[11px] text-ig-muted">読めなかったもの: {warnings.join('／')}</p>}
      {!err && base && <ActionLog m={m} base={base} study={study} memos={memos || []} onOpen={setOpenId} />}
      {base && openId && <MinutesModal name={m.name} list={base.mendanLog} id={openId} onPick={setOpenId} onClose={() => setOpenId('')} onChanged={() => onChanged?.()} />}
    </div>
  );
}
