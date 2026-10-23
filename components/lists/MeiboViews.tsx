'use client';

import Link from 'next/link';
import type { Person } from '@/lib/sample';
import { HOUMU, KEIRI, ROUMU, SHIFTS, SHIFT_WEEK, type Mark } from '@/lib/meibo-sample';
import type { ModuleKey } from '@/lib/theme';
import { Pill } from '@/components/ui';

// 従業員名簿の「部門ごとの表示」（2026-10-23 shoya「労務版・法務版・経理版…それぞれのロールで必要な情報」）。
//   同じ人の並びのまま、列だけ部門の仕事に合わせて入れ替える。タブは見る権限がある部門だけ出す（StaffList 側）。
//   法務は分類が無いので、いまは「労務/営業管理」を見る人に出す（契約を扱う側）。

export type ViewKey = 'kihon' | 'roumu' | 'houmu' | 'keiri' | 'shift';
export const VIEWS: { key: ViewKey; label: string; module: ModuleKey; hint: string }[] = [
  { key: 'kihon', label: '基本', module: 'jinji', hint: '状態・現場・契約・単価・今月の勤怠' },
  { key: 'roumu', label: '労務', module: 'roumu', hint: '雇用・残業見込み・有給・深夜業の健診・社会保険・いま動いている手続き' },
  { key: 'houmu', label: '法務', module: 'roumu', hint: '取引先との契約・商流・派遣の抵触日・雇用契約と誓約書。疑いの印は判断の材料（決めるのは法務）' },
  { key: 'keiri', label: '経理', module: 'keiri', hint: '請求先・単価・精算の幅・勤務表と請求書・賃金・交通費・粗利' },
  { key: 'shift', label: 'シフト', module: 'roumu', hint: '今週のシフト。空欄＝未提出、夜＝深夜業（6か月ごとの健診が要る）' },
];

const TONE_STYLE: Record<Mark['tone'], { bg: string; fg: string }> = {
  ok: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)' },
  warn: { bg: 'var(--tone-warn-bg)', fg: 'var(--tone-warn-fg)' },
  bad: { bg: 'var(--tone-bad-bg)', fg: 'var(--tone-bad-fg)' },
  info: { bg: 'var(--tone-info-bg)', fg: 'var(--tone-info-fg)' },
  mute: { bg: 'var(--tone-mute-bg)', fg: 'var(--tone-mute-fg)' },
};
function M({ m }: { m?: Mark }) {
  if (!m) return <span className="text-faint">—</span>;
  return <div><span className="chip" style={{ background: TONE_STYLE[m.tone].bg, color: TONE_STYLE[m.tone].fg }}>{m.text}</span>{m.sub && <div className="mt-0.5 text-[11.5px] text-muted">{m.sub}</div>}</div>;
}

type Col = { label: string; right?: boolean; cell: (p: Person) => React.ReactNode };
const COLS: Record<Exclude<ViewKey, 'kihon' | 'shift'>, Col[]> = {
  roumu: [
    { label: '雇用', cell: (p) => <div>{ROUMU[p.id]?.koyou}<div className="text-[11.5px] text-faint">{ROUMU[p.id]?.nyusha} 入社</div></div> },
    { label: '契約の形', cell: (p) => p.contract },
    { label: '所定の時間', cell: (p) => ROUMU[p.id]?.shotei },
    { label: '残業（締め日の見込み）', cell: (p) => <M m={ROUMU[p.id]?.overtime} /> },
    { label: '有給', cell: (p) => <M m={ROUMU[p.id]?.yukyu} /> },
    { label: '深夜業の健診', cell: (p) => <M m={ROUMU[p.id]?.shinya} /> },
    { label: '社会保険・雇用保険', cell: (p) => <M m={ROUMU[p.id]?.shaho} /> },
    { label: 'いま動いている手続き', cell: (p) => <M m={ROUMU[p.id]?.tetsuzuki} /> },
  ],
  houmu: [
    { label: '契約の形', cell: (p) => p.contract },
    { label: '取引先', cell: (p) => HOUMU[p.id]?.torihiki },
    { label: '商流', cell: (p) => <M m={HOUMU[p.id]?.shouryu} /> },
    { label: '基本契約', cell: (p) => <M m={HOUMU[p.id]?.kihon} /> },
    { label: '個別契約・注文書', cell: (p) => <M m={HOUMU[p.id]?.kobetsu} /> },
    { label: '指揮命令の印（準委任）', cell: (p) => <M m={HOUMU[p.id]?.shiki} /> },
    { label: '派遣（抵触日・通知）', cell: (p) => <M m={HOUMU[p.id]?.haken} /> },
    { label: '雇用契約', cell: (p) => <M m={HOUMU[p.id]?.koyouKeiyaku} /> },
    { label: '誓約書・秘密保持', cell: (p) => <M m={HOUMU[p.id]?.seiyaku} /> },
  ],
  keiri: [
    { label: '請求先', cell: (p) => KEIRI[p.id]?.seikyusaki },
    { label: '単価', right: true, cell: (p) => <span className="num">{KEIRI[p.id]?.tanka}</span> },
    { label: '精算の幅', cell: (p) => KEIRI[p.id]?.seisan },
    { label: '締め・支払', cell: (p) => KEIRI[p.id]?.site },
    { label: '今月の稼働', cell: (p) => <M m={KEIRI[p.id]?.hours} /> },
    { label: '勤務表', cell: (p) => <M m={KEIRI[p.id]?.kinmuhyo} /> },
    { label: '請求書', cell: (p) => <M m={KEIRI[p.id]?.seikyu} /> },
    { label: '賃金（額面）', right: true, cell: (p) => <span className="num">{KEIRI[p.id]?.chingin}</span> },
    { label: '交通費（月）', right: true, cell: (p) => <span className="num">{KEIRI[p.id]?.kotsuhi}</span> },
    { label: '粗利（月）', right: true, cell: (p) => <span className="num">{KEIRI[p.id]?.arari ?? '—'}</span> },
  ],
};

function Who({ p }: { p: Person }) {
  return (
    <div className="flex items-center gap-2.5">
      <div aria-hidden className="flex size-[30px] items-center justify-center rounded-full text-[12px] font-bold" style={{ background: 'var(--as)', color: 'var(--ad)' }}>{p.name[0]}</div>
      <div><Link href={`/jinji/staff/${p.id}`} className="font-semibold hover:underline">{p.name}</Link><div className="text-[11.5px] text-faint">{p.no}・{p.site}</div></div>
    </div>
  );
}

/** 労務・法務・経理の表。人の並びは基本と同じ。 */
export function DeptTable({ view, rows }: { view: 'roumu' | 'houmu' | 'keiri'; rows: Person[] }) {
  const cols = COLS[view];
  return (
    <table className="w-full min-w-[1180px] border-collapse text-[13px]">
      <thead><tr className="th-row text-left">
        <th className="px-3.5 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">状態</th>
        {cols.map((c) => <th key={c.label} className={`whitespace-nowrap px-2 py-2.5 font-semibold ${c.right ? 'text-right' : ''}`}>{c.label}</th>)}
      </tr></thead>
      <tbody>
        {rows.map((p, i) => (
          <tr key={p.id} className="row mo-fade-in border-t border-line-soft align-top" style={{ ['--i' as string]: i + 3 }}>
            <td className="whitespace-nowrap px-3.5 py-2"><Who p={p} /></td>
            <td className="px-2 py-2.5"><Pill>{p.status}</Pill></td>
            {cols.map((c) => <td key={c.label} className={`whitespace-nowrap px-2 py-2.5 ${c.right ? 'text-right' : ''}`}>{c.cell(p)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 連勤の目安。法定休日（週1日）が取れていない週は印をつける。
const workDays = (w: string[]) => w.filter((s) => s && s !== '休').length;

/** シフト（今週）。空欄＝未提出、夜＝深夜業、7日連続は休日が無い。 */
export function ShiftTable({ rows }: { rows: Person[] }) {
  return (
    <table className="w-full min-w-[1000px] border-collapse text-[13px]">
      <thead><tr className="th-row text-left">
        <th className="px-3.5 py-2.5 font-semibold">社員 <span className="font-normal text-muted">{SHIFT_WEEK.label}</span></th>
        {SHIFT_WEEK.days.map((d) => <th key={d} className={`px-1.5 py-2.5 text-center font-semibold ${/[土日]/.test(d) ? 'text-muted' : ''}`}>{d}</th>)}
        <th className="px-3.5 py-2.5 font-semibold">気になる点</th>
      </tr></thead>
      <tbody>
        {rows.map((p, i) => {
          const w = SHIFTS[p.id] || [];
          const missing = w.every((s) => !s);
          const night = w.some((s) => s.includes('夜'));
          const noRest = workDays(w) >= 7;
          return (
            <tr key={p.id} className="row mo-fade-in border-t border-line-soft" style={{ ['--i' as string]: i + 3 }}>
              <td className="whitespace-nowrap px-3.5 py-2"><Who p={p} /></td>
              {SHIFT_WEEK.days.map((d, j) => {
                const s = w[j] || '';
                const st = !s ? { background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }
                  : s === '休' ? { background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }
                  : s.includes('夜') ? { background: 'var(--tone-purple-bg)', color: 'var(--tone-purple-fg)' }
                  : { background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' };
                return <td key={d} className="px-1 py-2 text-center"><span className="num inline-block min-w-[58px] rounded-md px-1.5 py-1 text-[12px] font-semibold" style={st}>{s || '未提出'}</span></td>;
              })}
              <td className="px-3.5 py-2 text-[12px]">
                <div className="flex flex-col gap-1">
                  {missing && <M m={{ text: 'シフト未提出', tone: 'bad', sub: '本人にあおいで依頼' }} />}
                  {night && <M m={{ text: '深夜業あり', tone: 'warn', sub: '健診は6か月ごと' }} />}
                  {noRest && <M m={{ text: '休日なし 7連勤', tone: 'bad', sub: '週1日の法定休日' }} />}
                  {!missing && !night && !noRest && <span className="text-faint">—</span>}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
