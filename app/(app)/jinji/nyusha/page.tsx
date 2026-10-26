'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, FileSpreadsheet } from 'lucide-react';
import { LiveBanner } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { PersonName } from '@/components/Person';
import { PageTitle, SkeletonRows } from '@/components/ui';
import { NyushaMarks } from '@/components/jinji/NyushaMarks';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { SHEET_HEADER, SHEET_TAB, SHEET_URL, fmtSheetDate, rowKind, sortSheetRows, type NyushaSheetLive, type SheetFilter, type SheetRow } from '@/lib/live/nyusha';

// 入社手続き（人事管理）＝労務の「freee送信管理」スプシの「参画決定者」タブと同じ列・同じ名前（A〜L）。
//   ・freee送信☑の人は「freee送信済み（送信日）」。未送信の人を上に。辞退・入社取消の行はグレー
//   ・絞り込み：すべて／未送信／送信済み／辞退・取消
//   ・本物（/api/live/nyusha）はスプシと同じ材料の今の GET から組み立てる。メール・freee送信・送信日・メモ・辞退/入社取消は
//     スプシにだけある（今の社内システムにスプシを読む口がまだ無い）ので「—」にして、スプシへのリンクを出す
//   ?p=<社員id> でその人の行に印を付けて送る（社員ページから）
//   ★見本は出さない。読み込み中は「読み込み中」、読めなかったときはエラーだけ（10-26）
const FILTERS: SheetFilter[] = ['すべて', '未送信', '送信済み', '辞退・取消'];
const SHEET_ONLY = 'スプシにだけある列（今の社内システムにスプシを読む口がまだ無い）';

const fmtWage = (v: string) => (/^\d{5,7}$/.test(v.replace(/[,，円¥\s]/g, '')) ? `${Number(v.replace(/[,，円¥\s]/g, '')).toLocaleString('ja-JP')}円` : v);

export default function NyushaPage() {
  const lv = useLiveRoute<NyushaSheetLive>('/api/live/nyusha');
  const mk = useMikeiken();   // 本物は未経験の人だけ（今のプロパーリストに入っている人）。サーバ側でも絞っている
  const live = lv.live && !!lv.data;
  const full = live && lv.data!.source === 'sheet';   // スプシそのもの＝全部の列がある
  const rows: SheetRow[] = useMemo(() => (live ? mk.keep(lv.data!.rows || [], 'name') : []), [live, lv.data, mk]);
  const [filter, setFilter] = useState<SheetFilter>('すべて');
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => { const p = new URLSearchParams(window.location.search).get('p'); if (p) setFocus(p); }, []);
  useEffect(() => { if (focus) document.getElementById(`ny-${focus}`)?.scrollIntoView({ block: 'center' }); }, [focus, rows.length]);

  const count = (f: SheetFilter) => (f === 'すべて' ? rows.length : rows.filter((r) => rowKind(r) === f).length);
  const shown = sortSheetRows(filter === 'すべて' ? rows : rows.filter((r) => rowKind(r) === filter));
  const unsent = count('未送信');

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="入社手続き" sub={`参画が決まった人。労務の「freee送信管理」スプシ（${SHEET_TAB}）と同じ列です`}>
        <a href={SHEET_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 text-body font-semibold" style={{ color: 'var(--ad)' }}>
          <FileSpreadsheet size={15} />スプシを開く<ExternalLink size={12} />
        </a>
      </PageTitle>
      <LiveBanner state={lv.state} error={lv.error} onReload={lv.reload} note={full ? '労務のスプシ（参画決定者タブ）をそのまま読んでいます（見るだけ・書き込みはスプシで）' : '今の社内システムから、スプシと同じ材料（参画決定・入社日・入場日・額面）で組み立てています（見るだけ）'} />
      <MikeikenNote mk={mk} live={live} />

      {!live && lv.state === 'loading' && <div className="rounded-xl border border-line bg-surface"><SkeletonRows /></div>}
      {live && !full && (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)', borderColor: 'transparent' }}>
          <b>メールアドレス・freee送信・送信日・メモ・辞退・入社取消・辞退・取消日</b> は労務のスプシにだけあります。
          今の社内システムにスプシを読む口がまだ無いので、ここでは「—」です。送信したかどうかは
          <a href={SHEET_URL} target="_blank" rel="noreferrer" className="mx-1 font-semibold underline underline-offset-2">スプシ（{SHEET_TAB}タブ）</a>で見てください。
          {(lv.data!.warnings || []).length > 0 && <div className="mt-1 opacity-80">{lv.data!.warnings.join('／')}</div>}
        </div>
      )}

      {live && <>
      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <div className="text-body">
          {!full ? <><b>{rows.length}人</b><span className="ml-2 text-muted">参画決定が 10/1 以降（9月決定で10月以降に入場の人を含む）</span></>
            : <><b>freee 未送信 {unsent}人</b><span className="ml-2 text-muted">送信済み {count('送信済み')}人・辞退/取消 {count('辞退・取消')}人</span></>}
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const off = !full && f !== 'すべて';
            return (
              <button key={f} onClick={() => setFilter(f)} disabled={off} title={off ? SHEET_ONLY : undefined}
                className={`min-h-8 rounded-full border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${filter === f ? 'font-semibold' : 'text-muted'}`}
                style={filter === f ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>
                {f}{!off && ` ${count(f)}`}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-body">
            <thead><tr className="th-row text-left">
              {SHEET_HEADER.map((h, i) => <th key={h} className={`whitespace-nowrap py-2.5 font-semibold ${i === 0 ? 'px-4' : 'px-2'}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={SHEET_HEADER.length} className="px-4 py-10 text-center text-muted">{rows.length === 0 ? 'まだ誰も載っていません' : `「${filter}」の人はいません`}</td></tr>}
              {shown.map((r, i) => {
                const grey = !!r.except;
                const na = <span className="text-faint" title={SHEET_ONLY}>—</span>;
                return (
                  <tr key={r.id} id={`ny-${r.personId}`} className={`mo-fade-in border-t border-line-soft align-top ${grey ? '' : 'row'}`}
                    style={{ ['--i' as string]: i, ...(grey ? { background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' } : {}), ...(focus === r.personId ? { outline: '2px solid var(--a)', outlineOffset: -2 } : {}) }}>
                    <td className="num whitespace-nowrap px-4 py-2.5">{fmtSheetDate(r.decidedOn)}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 font-semibold"><PersonName name={r.name} className={`underline-offset-2 hover:underline ${grey ? 'line-through' : ''}`} />
                      {r.note && <div className="mt-0.5 max-w-[220px] whitespace-normal text-xs font-normal" style={{ color: 'var(--tone-caution-fg)' }}>{r.note}</div>}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-sm text-muted">{r.kana || '—'}</td>
                    <td className="px-2 py-2.5 text-sm">{r.email == null ? na : r.email || <span className="text-faint">—</span>}</td>
                    <td className="num whitespace-nowrap px-2 py-2.5">{fmtSheetDate(r.nyushaOn) || <span className="text-faint">—</span>}</td>
                    <td className="num whitespace-nowrap px-2 py-2.5">{fmtSheetDate(r.nyuujouOn) || (r.nyuujouRaw ? r.nyuujouRaw : <span className="text-faint">—</span>)}</td>
                    <td className="num whitespace-nowrap px-2 py-2.5">{r.wage ? fmtWage(r.wage) : <span className="text-faint">—</span>}</td>
                    <td className="whitespace-nowrap px-2 py-2.5">
                      {r.sent == null ? na : r.sent
                        ? <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}><Check size={11} />freee送信済み{r.sentOn ? `（${fmtSheetDate(r.sentOn)}）` : ''}</span>
                        : grey ? <span className="text-faint">—</span>
                          : <span className="chip" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>未送信</span>}
                    </td>
                    <td className="num whitespace-nowrap px-2 py-2.5">{r.sentOn == null ? na : fmtSheetDate(r.sentOn) || <span className="text-faint">—</span>}</td>
                    <td className="min-w-[160px] px-2 py-2.5 text-sm">{r.memo == null ? na : r.memo || <span className="text-faint">—</span>}</td>
                    <td className="whitespace-nowrap px-2 py-2.5">{r.except == null ? na : r.except ? <b>{r.except}</b> : <span className="text-faint">—</span>}</td>
                    <td className="num whitespace-nowrap px-2 py-2.5">{r.exceptOn == null ? na : fmtSheetDate(r.exceptOn) || <span className="text-faint">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </>}
      {/* 入社手続きの印（今の入社手続きの画面と同じ・選んだらすぐ保存・10-25） */}
      <NyushaMarks />
      <p className="text-xs text-faint">
        スプシは今の社内システムが15分ごとに書き足しています（参画決定日・氏名・よみがな・メール・入社日・入場日・賃金・辞退は空欄だけ自動で埋める）。
        freee送信の☑・送信日・メモ・入社取消は労務がスプシで付けます。雇用契約・社会保険などの手続きの要否や期限の最終判断は社労士に確認してください。
      </p>
    </main>
  );
}
