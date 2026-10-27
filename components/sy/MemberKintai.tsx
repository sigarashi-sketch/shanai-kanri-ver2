'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { Member } from '@/components/sy/compat';

// 名簿の詳細（MemberDrawer）の「勤怠」タブ。その人の freee の勤怠実績を 月ごとに見る
//   （2026-10-13 shoya「従業員名簿から勤怠実績載せて・クリックすると各月見れるように」）。
//   いけどんの名簿の「稼働管理」と同じ口（/api/freee-kintai の match → monthly）を app/api/[...rest] 経由で読むだけ。
//   ★freee の月度は暦月と1か月ずれる事業所がある → 返ってきた期間が 見たい月と違えば 1回だけずらして取り直す（いけどん roster.html と同じ）
interface Cand { id: string; company_id: string; raw_name?: string; norm_name?: string; num?: string }
interface Day { date: string; weekday: string; kind: string; clockIn: string; clockOut: string; breakTime: string; workTime: string; late: number; early: number; empty: boolean }
interface ApiErr { ok?: boolean; hint?: string; error?: string | { kind?: string; message?: string } }
interface Match extends ApiErr { status?: 'none' | 'unique' | 'multiple'; candidates?: Cand[] }
interface Monthly extends ApiErr {
  cached?: boolean; stale?: boolean; warning?: string; synced_at?: string; periodStart?: string; periodEnd?: string; recordCount?: number;
  summary?: { totalWork?: string; overtime?: string; workDays?: number; absences?: number }; days?: Day[];
}
type YM = { y: number; m: number };

const MONTHS = 12;   // さかのぼって選べる月数（今月を含む）
const ymKey = ({ y, m }: YM) => `${y}-${String(m).padStart(2, '0')}`;
const addMonth = ({ y, m }: YM, d: number): YM => { const t = new Date(Date.UTC(y, m - 1 + d, 1)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 }; };
const jstNow = (): YM => { const j = new Date(Date.now() + 9 * 3600 * 1000); return { y: j.getUTCFullYear(), m: j.getUTCMonth() + 1 }; };
// いけどん側で権限が無い人（採用サポートのロール など）は { error:'forbidden', hint:'…' } が返る → hint を出す
const errText = (j: ApiErr | null, fallback: string) => j?.hint || (typeof j?.error === 'string' ? j.error : j?.error?.message) || fallback;
const fmtAt = (iso?: string) => { const d = iso ? new Date(iso) : null; return d && !isNaN(d.getTime()) ? d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };

async function kapi<T extends ApiErr>(action: string, p: Record<string, string | number>): Promise<T> {
  const qs = new URLSearchParams({ action }); Object.entries(p).forEach(([k, v]) => v !== '' && qs.set(k, String(v)));
  const r = await fetch('/api/sy/freee-kintai?' + qs.toString(), { cache: 'no-store' });
  const j = (await r.json().catch(() => null)) as T | null;
  if (!j || !r.ok || j.ok === false) throw new Error(errText(j, `勤怠を読めませんでした（${r.status}）`));
  return j;
}

export default function MemberKintai({ m }: { m: Member }) {
  const [cands, setCands] = useState<Cand[] | null>(null);   // null＝freee の従業員と突き合わせ中
  const [emp, setEmp] = useState<Cand | null>(null);
  const [ym, setYm] = useState<YM>(jstNow);
  const [d, setD] = useState<Monthly | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const cache = useRef(new Map<string, Monthly>());
  const seq = useRef(0);
  const now = jstNow();
  const months = Array.from({ length: MONTHS }, (_, i) => addMonth(now, -i));   // 新しい月が先頭

  useEffect(() => {
    let dead = false;
    kapi<Match>('match', { name: m.name }).then((j) => {
      if (dead) return;
      const cs = j.candidates || [];
      setCands(cs); if (j.status === 'unique' && cs[0]) setEmp(cs[0]);
    }).catch((e) => { if (!dead) { setCands([]); setErr((e as Error).message); } });
    return () => { dead = true; };
  }, [m.name]);

  const load = useCallback(async (e: Cand, want: YM, refresh: boolean) => {
    const ck = `${e.company_id}/${e.id}/${ymKey(want)}`;
    const hit = !refresh && cache.current.get(ck);
    const my = ++seq.current;
    setErr('');
    if (hit) { setD(hit); setBusy(false); return; }
    setBusy(true);
    try {
      const get = (t: YM) => kapi<Monthly>('monthly', { employee_id: e.id, company_id: e.company_id, year: t.y, month: t.m, ...(refresh ? { refresh: 1 } : {}) });
      let j = await get(want);
      const got = String(j.periodStart || '').slice(0, 7);
      if (got && got !== ymKey(want)) j = await get(addMonth(want, got < ymKey(want) ? 1 : -1));
      if (my !== seq.current) return;
      cache.current.set(ck, j); setD(j);
    } catch (x) {
      if (my === seq.current) { setD(null); setErr((x as Error).message); }
    } finally { if (my === seq.current) setBusy(false); }
  }, []);
  useEffect(() => { if (emp) load(emp, ym, false); }, [emp, ym, load]);

  if (cands === null) return <p className="p-6 text-center text-xs text-ig-muted">freee の従業員と突き合わせ中…</p>;
  if (!emp) {
    if (err) return <p className="p-6 text-center text-sm text-ig-danger">{err}</p>;
    if (!cands.length) return (
      <div className="p-6 text-center text-sm text-ig-muted">
        <p>{m.name}さんは freee の従業員に見つかりませんでした</p>
        <p className="mt-1 text-xs">freee に未登録か、名簿と freee で名前の書き方が違います</p>
      </div>
    );
    return (
      <div className="p-5">
        <p className="text-sm">freee に同じ名前の従業員が {cands.length}人います（転籍・同姓同名）。見る方を選んでください</p>
        <div className="mt-3 space-y-2">
          {cands.map((c) => (
            <button key={c.company_id + '/' + c.id} onClick={() => setEmp(c)} className="block w-full rounded-lg px-3 py-2 text-left text-sm ring-1 ring-ig-border hover:bg-ig-hover">
              {c.raw_name || c.norm_name || '(名前なし)'}<span className="ml-2 text-xs text-ig-muted">従業員番号 {c.num || '-'} ／ 事業所 {c.company_id}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const want = ymKey(ym);
  const got = String(d?.periodStart || '').slice(0, 7);
  const s = d?.summary || {};
  const isNow = want === ymKey(now);
  const isOldest = want === ymKey(months[months.length - 1]);
  const navBtn = 'rounded-md p-1.5 text-ig-muted hover:bg-ig-hover hover:text-ig-text disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <div className="pb-8">
      <div className="flex items-center gap-1 px-4 pt-3">
        <button onClick={() => setYm(addMonth(ym, -1))} disabled={isOldest} className={navBtn} aria-label="前の月"><ChevronLeft size={18} /></button>
        <strong className="min-w-[7.5em] text-center text-base tabular-nums">{ym.y}年{ym.m}月</strong>
        <button onClick={() => setYm(addMonth(ym, 1))} disabled={isNow} className={navBtn} aria-label="次の月"><ChevronRight size={18} /></button>
        <button onClick={() => load(emp, ym, true)} disabled={busy} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ig-muted hover:bg-ig-hover hover:text-ig-text disabled:opacity-40"><RefreshCw size={13} className={busy ? 'animate-spin' : ''} />最新に更新</button>
      </div>
      {/* 月を押して切り替える（今月から {MONTHS}か月ぶん） */}
      <div className="flex gap-1.5 overflow-x-auto px-4 py-2.5">
        {months.map((t, i) => {
          const on = ymKey(t) === want;
          return (
            <button key={ymKey(t)} onClick={() => setYm(t)} className={`shrink-0 rounded-full px-3 py-1 text-xs tabular-nums ring-1 ${on ? 'bg-ig-text font-bold text-white ring-ig-text' : 'ring-ig-border hover:bg-ig-hover'}`}>
              {i === 0 || t.m === 12 ? `${t.y}年${t.m}月` : `${t.m}月`}
            </button>
          );
        })}
      </div>
      {cands.length > 1 && (
        <p className="px-4 pb-2 text-xs text-ig-muted">従業員番号 {emp.num || '-'} の勤怠です<button onClick={() => { setEmp(null); setD(null); }} className="ml-2 text-ig-primary underline">別の候補に切り替える</button></p>
      )}
      {err && <p className="px-4 py-6 text-center text-sm text-ig-danger">{err}</p>}
      {!err && !d && <p className="px-4 py-6 text-center text-xs text-ig-muted">勤怠を読み込み中…</p>}
      {!err && d && (
        <div className={busy ? 'opacity-50' : ''}>
          <div className="mx-4 grid grid-cols-4 gap-2">
            {([['総労働時間', s.totalWork || '0:00'], ['残業', s.overtime || '0:00'], ['出勤日数', `${s.workDays ?? 0}日`], ['欠勤', `${s.absences ?? 0}日`]] as const).map(([k, v]) => (
              <div key={k} className="rounded-lg px-2 py-2 text-center ring-1 ring-ig-border">
                <div className="text-[11px] text-ig-muted">{k}</div><div className="text-lg font-bold tabular-nums">{v}</div>
              </div>
            ))}
          </div>
          <p className={`px-4 pt-2 text-[11px] ${d.stale || (got && got !== want) ? 'text-ig-danger' : 'text-ig-muted'}`}>
            {got && got !== want
              ? `この事業所は締めの期間が暦の月とずれていて、${ym.m}月ちょうどの期間を取れませんでした（表示は ${d.periodStart}〜${d.periodEnd}）`
              : d.stale ? (d.warning || 'freee につながらないため、前に取った内容を出しています') : `freee の勤怠（${fmtAt(d.synced_at)} 時点）`}
          </p>
          {d.recordCount === 0 ? <p className="px-4 py-8 text-center text-sm text-ig-muted">この月の勤怠はありません（未打刻・在籍前など）</p> : (
            <table className="mt-2 w-full text-sm tabular-nums">
              <thead><tr className="text-[11px] text-ig-muted">
                <th className="py-1 pl-4 pr-1 text-left font-semibold">日</th><th className="px-1 py-1 text-left font-semibold">種別</th>
                <th className="px-1 py-1 text-right font-semibold">出勤</th><th className="px-1 py-1 text-right font-semibold">退勤</th>
                <th className="px-1 py-1 text-right font-semibold">休憩</th><th className="py-1 pl-1 pr-4 text-right font-semibold">労働</th>
              </tr></thead>
              <tbody>
                {(d.days || []).map((r) => {
                  const wc = r.weekday === '日' ? 'text-ig-danger' : r.weekday === '土' ? 'text-ig-primary' : '';
                  const note = [r.late ? `遅刻${r.late}分` : '', r.early ? `早退${r.early}分` : ''].filter(Boolean).join('・');
                  return (
                    <tr key={r.date} className={`border-t border-ig-divider ${r.empty ? 'opacity-45' : ''}`}>
                      <td className={`whitespace-nowrap py-1 pl-4 pr-1 ${wc}`}>{Number(r.date.slice(8))}<span className="ml-1 text-xs">{r.weekday}</span></td>
                      <td className="px-1 py-1">{r.kind}{note && <span className="ml-1 text-[11px] text-ig-warn">{note}</span>}</td>
                      <td className="px-1 py-1 text-right">{r.clockIn}</td><td className="px-1 py-1 text-right">{r.clockOut}</td>
                      <td className="px-1 py-1 text-right text-ig-muted">{r.breakTime}</td><td className="py-1 pl-1 pr-4 text-right font-semibold">{r.workTime}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
