'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, Check, X } from 'lucide-react';
import { PEOPLE } from '@/lib/sample';
import { MODULES } from '@/lib/theme';
import { FIELD_RULES, TODAY, addDays, fmtDate, type Field, type YState, type Yoyaku } from '@/lib/yoyaku-sample';
import { PageTitle, PrimaryButton } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import { DrawerPortal } from '@/components/DrawerPortal';
import { useYoyaku } from '@/components/YoyakuStore';
import { LiveBanner, useIke } from '@/components/Live';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { JINJI_URL, jinjiRead, v2Id, yoyakuFromJinji, type JYoyaku, type JinjiMe } from '@/lib/live/jinji';
import { normName, type LiveStaff, type LiveStaffList } from '@/lib/live/staff';
import { useLiveWrite, WriteError } from '@/components/jinji/useLiveWrite';
import { staffReq } from '@/components/jinji/staffWrite';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { yoyakuFromRosterStatus, type IkeRosterStatus } from '@/lib/live/yoyaku';
import { tensekiYoyaku, toTensekiLive, type IkeTensekiList } from '@/lib/live/tenseki';
import { TENSEKI } from '@/lib/tenseki-sample';
import { PersonName } from '@/components/Person';

// 変更の予約（人事管理）。住所・通勤・単価・現場・状態（待機/退社/休職/産休/育休）・転籍を「いつから」つきで予約する。
//   ・転籍は転籍台帳（ページには出さない・10-25）の中身をここに出す。確認待ち＝承認待ち
//   ・予約した日の朝6:00に切り替わり、「一緒に変わるもの」にも同じ日から入る
//   ・単価と通勤は承認が要る（単価＝営業の承認、通勤＝経理の承認）。承認されるまで切り替わらない
//   ・同じ人の同じ項目に、まだ切り替わっていない予約があれば重ねて作らせない（上書きするか選ぶ）
//   予約を作れるのは、その項目の分類を「直す」以上で持つ人だけ
//   ★本物（10-26）：住所・通勤・単価・現場・状態（休職/産休/育休/稼働中）は今のシステムの v2_yoyaku（/api/live/jinji）。
//     待機・退社は今までどおり名簿の予約（/api/live/staff/write）。転籍は転籍台帳（ミンミカの所属変更）から入るので、ここでは見るだけ。
//     状態の予約は その日の朝6:05 に今のシステムの cron が名簿の状態（休職）に入れる。ほかの項目は「適用済み」になるだけ（請求・ミンミカの単価や現場は変えない）
const SHORT = Object.fromEntries(MODULES.map((m) => [m.key, m.short]));
const STATE_TONE: Record<YState, string> = { 承認待ち: 'bad', 予約中: 'info', 適用済み: 'ok', 取り消し: 'mute' };
const FIELDS = Object.keys(FIELD_RULES) as Field[];
type Filter = 'これから' | '承認待ち' | '適用済み';

// 変更後は選ぶだけ（自由に書かせない＝表記揺れを作らない）。見本の選択肢
const SITES = Array.from(new Set(['B社（大崎）', 'H社（渋谷）', 'I社（大宮）', 'J社（赤羽）', ...PEOPLE.map((x) => x.site).filter((x) => x !== '—')]));
const PRICES = Array.from({ length: 31 }, (_, i) => `${25 + i}万`);
const CITIES = ['東京都23区内', '川口市', 'さいたま市', '川崎市', '横浜市', '千葉市', '船橋市', '町田市'];
const STATIONS = Array.from(new Set(SITES.map((x) => x.match(/（(.+)）/)?.[1]).filter(Boolean) as string[]));
// 見本の今の所属会社（転籍台帳の見本に載っている人はその元の会社・ほかは本社）
const companyOf = (id: string) => TENSEKI.find((t) => t.personId === id && t.state !== '完了')?.from ?? '本社';
function optionsFor(field: Field, p: { id: string; site: string; price: string; station: string; status: string }): string[] {
  if (field === '現場') return [...SITES.filter((x) => x !== p.site), '待機'];
  if (field === '単価') return PRICES.filter((x) => x !== p.price);
  if (field === '住所') return CITIES;
  if (field === '通勤') return STATIONS.map((st) => `${p.station}→${st} 定期`);
  // 状態：休職・産休・育休から戻すときの「稼働中」も選べる
  if (field === '転籍') return (FIELD_RULES.転籍.options ?? []).filter((x) => x !== companyOf(p.id));
  return [...(FIELD_RULES.状態.options ?? []), '稼働中'].filter((x) => x !== p.status);
}

const realToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

function StateChip({ s }: { s: YState }) {
  const t = STATE_TONE[s];
  return <span className="chip" style={{ background: `var(--tone-${t}-bg)`, color: `var(--tone-${t}-fg)` }}>{s}</span>;
}

export default function YoyakuPage() {
  const { can } = usePerms();
  const { hit, toast } = useMotivation();
  // 予約は全画面で1つ（ホーム・社員ページ・社員一覧も同じものを読む）
  const { rows: storeRows, setRows } = useYoyaku();
  // 本物：今の社内システムの「待機の予約」「退社の予約」（従業員名簿）だけ。本物のときは予約を作る・承認・取り消しを止める
  const ike = useIke<IkeRosterStatus[]>('proxy?action=getRosterStatus');
  const mk = useMikeiken();   // 本物は未経験の人だけ（今のプロパーリストに入っている人）
  // 転籍台帳（今のシステムで super_admin と労務事務の人だけ読める。読めない人には転籍の行が出ないだけ）
  const tk = useIke<IkeTensekiList>('tenseki?action=list');
  const liveRows = useMemo(() => {
    const base = yoyakuFromRosterStatus(ike.data ? mk.keep(ike.data, (r) => r.name || r.normalized_name) : null);
    if (!tk.live || !tk.data) return base;
    const t = toTensekiLive(tk.data);
    return [...base, ...tensekiYoyaku(mk.keep(t.rows, 'name'), t.today)];
  }, [ike.data, tk.live, tk.data, mk]);
  const live = ike.live;
  // 本物：ver2 の予約（住所・通勤・単価・現場・状態）と、いまの人が押せるもの
  const jv = useLiveRoute<JYoyaku>(jinjiRead('yoyaku'));
  const me = useLiveRoute<JinjiMe>(jinjiRead('me'));
  const v2Rows = useMemo(() => mk.keep(yoyakuFromJinji(jv.data), 'person'), [jv.data, mk]);
  const rows = live ? [...liveRows, ...v2Rows] : storeRows;
  const today = live ? (jv.data?.today || realToday()) : TODAY;
  const dFrom = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  const reload = () => { ike.reload(); jv.reload(); };
  const { send, error: wErr, setError: setWErr } = useLiveWrite(live, reload);
  // 本物で押せるか（承認は今のシステムのロールでも見る・転籍は台帳から）
  const liveBlock = (r: Yoyaku, what: 'approve' | 'cancel'): string | undefined => {
    if (!live) return undefined;
    if (r.id.startsWith('tenseki:')) return '転籍は転籍台帳（ミンミカの所属変更）から確定・取り消しします';
    if (what === 'approve') {
      if (!v2Id(r.id)) return '承認の要らない予約です';
      if (r.field === '単価' && !me.data?.approve.単価) return '単価の承認は営業の管理者だけです（今の社内システムのロール）';
      if (r.field === '通勤' && !me.data?.approve.通勤) return '通勤の承認は経理・管理者だけです（今の社内システムのロール）';
    }
    if (what === 'cancel' && v2Id(r.id) && me.data && !me.data.canWrite) return '予約を取り消す権限がありません（今の社内システムのロール）';
    return undefined;
  };
  const [filter, setFilter] = useState<Filter>('これから');
  const [day, setDay] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [form, setForm] = useState<string | false>(false); // 開いているときは最初に選んでおく社員の id（'' は先頭の人）
  // ?new=1 で予約のパネルを開いた状態から始める（ホームの「変更を予約」）。&p=<社員id> でその人を選んでおく（社員ページから）
  useEffect(() => { const q = new URLSearchParams(window.location.search); if (q.get('new')) setForm(q.get('p') ?? ''); }, []);

  const pulse = (id: string) => { setFlash(id); setTimeout(() => setFlash(null), 1300); };
  const upcoming = rows.filter((r) => r.state === '承認待ち' || r.state === '予約中');
  const shown = rows
    .filter((r) => (filter === 'これから' ? r.state === '承認待ち' || r.state === '予約中' : r.state === filter))
    .filter((r) => !day || r.date === day)
    .sort((a, b) => (filter === '適用済み' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));

  // これから30日の帯：日ごとの予約の数と分類
  const strip = useMemo(() => Array.from({ length: 30 }, (_, i) => {
    const d = addDays(today, i);
    return { d, items: upcoming.filter((r) => r.date === d) };
  }), [upcoming, today]);

  const approverOf = (f: Field) => FIELD_RULES[f].module;
  const approve = (r: Yoyaku) => {
    if (live) {
      const id = v2Id(r.id);
      if (!id) return;
      send({ url: JINJI_URL, body: { action: 'yoyaku-approve', id }, text: `${r.person} の${r.field}の予約を承認しました`, sub: `→ ${fmtDate(r.date)} の朝6:00に切り替わります`, undo: () => ({ url: JINJI_URL, body: { action: 'yoyaku-restore', id, state: '承認待ち' } }) })
        .then((x) => { if (x) pulse(r.id); });
      return;
    }
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, state: '予約中' } : x)));
    pulse(r.id); hit();
    toast({ text: `${r.person} の${r.field}の予約を承認しました`, sub: `→ ${fmtDate(r.date)} の朝6:00に切り替わります`, undo: () => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, state: '承認待ち' } : x))) });
  };
  // 現場の予約に合わせて自動で作った通勤の予約（同じ人・同じ日）。現場を取り消す・上書きするときは一緒に取り消す
  const linked = (rs: Yoyaku[], id?: string) => {
    const base = rs.find((x) => x.id === id);
    if (!base || base.field !== '現場') return [] as string[];
    return rs.filter((x) => x.personId === base.personId && x.date === base.date && x.field === '通勤' && x.note?.includes('自動') && (x.state === '予約中' || x.state === '承認待ち')).map((x) => x.id);
  };
  const cancel = (r: Yoyaku) => {
    if (live) {
      const id = v2Id(r.id);
      if (id) {
        send({ url: JINJI_URL, body: { action: 'yoyaku-cancel', id }, text: `${r.person} の${r.field}の予約を取り消しました`, sub: r.field === '現場' ? '→ 合わせて作った通勤の予約も取り消しました' : '→ 一緒に変わる予定だったものも元のままです',
          undo: (res) => ({ url: JINJI_URL, body: { action: 'yoyaku-restore', items: (res.prev as { id: string; state: string }[] | undefined) || [{ id, state: r.state }] } }) });
        return;
      }
      const kind = r.id.startsWith('taiki:') ? 'taiki' : r.id.startsWith('taisha:') ? 'taisha' : '';
      if (!kind) return;
      send(staffReq({ kind: 'status', name: r.person, patch: kind === 'taiki' ? { taikiYotei: '' } : { taishaYotei: '' } }, `${r.person} さんの${kind === 'taiki' ? '待機' : '退社'}の予約（${fmtDate(r.date)}）を取り消しました`));
      return;
    }
    const ids = [r.id, ...linked(rows, r.id)];
    // 取り消した予約だけ、元の状態（承認待ち／予約中）に戻す
    const prev = Object.fromEntries(rows.filter((x) => ids.includes(x.id)).map((x) => [x.id, x.state]));
    setRows((rs) => rs.map((x) => (ids.includes(x.id) ? { ...x, state: '取り消し' } : x)));
    pulse(r.id);
    hit();
    toast({ text: `${r.person} の${r.field}の予約を取り消しました`, sub: ids.length > 1 ? '→ 合わせて作った通勤の予約も取り消しました' : '→ 一緒に変わる予定だったものも元のままです', undo: () => setRows((rs) => rs.map((x) => (prev[x.id] ? { ...x, state: prev[x.id] } : x))) });
  };
  const add = (y: Yoyaku, replace?: string) => {
    const off = replace ? [replace, ...linked(rows, replace)] : [];
    const prev = Object.fromEntries(rows.filter((x) => off.includes(x.id)).map((x) => [x.id, x.state]));
    setRows((rs) => [y, ...rs.map((x) => (off.includes(x.id) ? { ...x, state: '取り消し' as YState } : x))]);
    setForm(false); setFilter('これから'); setDay(null); pulse(y.id); hit();
    toast({
      text: `${y.person} の${y.field}を ${fmtDate(y.date)} から「${y.to}」に予約しました`,
      sub: y.state === '承認待ち' ? `→ ${SHORT[approverOf(y.field)]}の承認待ちに載りました` : `→ ${FIELD_RULES[y.field].with.join('・')} も同じ日に変わります${off.length > 1 ? '（前の現場に合わせた通勤の予約は取り消し）' : ''}`,
      // この予約を消し、上書きで取り消した前の予約だけ元に戻す
      undo: () => setRows((rs) => rs.filter((x) => x.id !== y.id).map((x) => (prev[x.id] ? { ...x, state: prev[x.id] } : x))),
    });
  };

  return (
    <main className={`flex flex-col gap-3.5 px-6 pb-12 pt-[22px] ${form !== false ? 'xl:pr-[468px]' : ''}`}>
      <PageTitle title="変更の予約" sub={`住所・通勤・単価・現場・状態・転籍を「いつから」つきで。予約した日の朝6:00に切り替わり、一緒に変わるものにも入ります${live ? '' : '・見本データ'}`}>
        <PrimaryButton onClick={() => setForm('')} disabled={live && !!me.data && !me.data.canWrite} title={live && me.data && !me.data.canWrite ? '予約を作る権限がありません（今の社内システムのロール）' : undefined}><span className="inline-flex items-center gap-1.5"><CalendarClock size={16} />変更を予約</span></PrimaryButton>
      </PageTitle>
      <LiveBanner state={ike.state} error={ike.error} onReload={reload} note={`予約・承認・取り消しはすぐ保存されます。待機・退社は従業員名簿の予約、住所・通勤・単価・現場・休職などはこの画面の予約です。状態（休職・産休・育休・稼働中）はその日の朝に名簿の状態に入ります。単価・現場は請求・ミンミカの登録を変えません（あちらは今までどおり）。${tk.live ? '転籍の確認待ちは「承認待ち」に出ます（確定は転籍台帳から）' : '転籍台帳は super_admin と労務事務の人だけ見られます'}`} />
      {live && jv.state === 'error' && <LiveBanner state="error" error={`この画面の予約を読めませんでした（${jv.error}）`} onReload={jv.reload} />}
      <MikeikenNote mk={mk} live={ike.live} />
      <WriteError error={wErr} onClose={() => setWErr('')} />

      <section aria-label="これから30日" className="mo-fade-up rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <div className="mb-2 flex items-center justify-between text-sm text-muted"><b className="text-body text-ink">これから30日</b>{day && <button onClick={() => setDay(null)} className="font-semibold" style={{ color: 'var(--ad)' }}>{fmtDate(day)} の絞り込みを外す</button>}</div>
        <div className="grid grid-cols-[repeat(30,minmax(0,1fr))] gap-1">
          {strip.map(({ d, items }, i) => {
            const date = new Date(d + 'T00:00:00');
            const sel = day === d;
            const weekend = date.getDay() === 0 || date.getDay() === 6;
            return (
              <button key={d} onClick={() => items.length && setDay(sel ? null : d)} disabled={!items.length} aria-label={`${fmtDate(d)} 予約${items.length}件`}
                className="mo-fade-in flex min-h-[64px] flex-col items-center gap-1 rounded-lg py-1.5 text-xs disabled:cursor-default"
                style={{ ['--i' as string]: Math.min(i, 12), background: sel ? 'var(--as)' : items.length ? 'var(--color-soft)' : undefined, boxShadow: sel ? 'inset 0 0 0 1.5px var(--a)' : undefined }}>
                <span className={weekend ? 'text-faint' : 'text-muted'}>{i === 0 ? '今日' : date.getDate() === 1 || i === 1 ? `${date.getMonth() + 1}/${date.getDate()}` : date.getDate()}</span>
                <span className="flex flex-col items-center gap-0.5">
                  {items.slice(0, 3).map((r) => <i key={r.id} className="size-[7px] rounded-full" style={{ background: `var(--c-${FIELD_RULES[r.field].module})`, outline: r.state === '承認待ち' ? '2px solid var(--tone-bad-bar)' : undefined, outlineOffset: 1 }} />)}
                  {items.length > 3 && <span className="num text-xs text-faint">+{items.length - 3}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
          {MODULES.map((m) => <span key={m.key} className="inline-flex items-center gap-1.5"><i className="size-[7px] rounded-full" style={{ background: `var(--c-${m.key})` }} />{m.label}</span>)}
          <span className="inline-flex items-center gap-1.5"><i className="size-[7px] rounded-full" style={{ outline: '2px solid var(--tone-bad-bar)', outlineOffset: 1 }} />承認待ち</span>
        </div>
      </section>

      <div className="mo-fade-up flex flex-wrap gap-2" style={{ ['--i' as string]: 2 }}>
        {(['これから', '承認待ち', '適用済み'] as Filter[]).map((f) => {
          const n = f === 'これから' ? upcoming.length : rows.filter((r) => r.state === f).length;
          return (
            <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className="fchip">
              {f} <span className="num">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 3 }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-body">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">適用日</th><th className="px-2 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">項目</th><th className="px-2 py-2.5 font-semibold">変更前 → 変更後</th><th className="px-2 py-2.5 font-semibold">一緒に変わるもの</th><th className="px-2 py-2.5 font-semibold">状態</th><th className="px-4 py-2.5" />
            </tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">この条件の予約はありません</td></tr>}
              {shown.map((r, i) => {
                const rule = FIELD_RULES[r.field];
                const left = dFrom(r.date);
                const canApprove = can(rule.module, 'approve');
                const noApprove = liveBlock(r, 'approve'), noCancel = liveBlock(r, 'cancel');
                return (
                  <tr key={r.id} className={`mo-fade-in border-t border-line-soft align-top ${flash === r.id ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                    <td className="whitespace-nowrap px-4 py-2.5"><b className="num">{fmtDate(r.date)}</b><div className="text-xs" style={{ color: left <= 3 && r.state !== '適用済み' ? 'var(--color-bad)' : 'var(--color-faint)' }}>{r.state === '適用済み' ? `${-left}日前に切り替え` : left === 0 ? '今日の朝に切り替え' : left < 0 ? `${-left}日前の日付・まだ確定していない` : `あと${left}日`}</div></td>
                    <td className="whitespace-nowrap px-2 py-2.5 font-semibold">{r.personId ? <PersonName name={r.person} className="hover:underline underline-offset-2" /> : <PersonName name={r.person} className="underline-offset-2 hover:underline" />}<div className="text-xs font-normal text-faint">登録 {r.by}</div></td>
                    <td className="px-2 py-2.5"><span className="inline-flex items-center gap-1.5 font-semibold"><i className="size-[7px] rounded-full" style={{ background: `var(--c-${rule.module})` }} />{r.field}</span><div className="text-xs text-faint">{SHORT[rule.module]}</div></td>
                    <td className="px-2 py-2.5"><span className="text-faint line-through">{r.from}</span> <ArrowRight size={13} className="inline text-faint" /> <b>{r.to}</b>{r.note && <div className="mt-0.5 text-xs text-muted">{r.note}</div>}</td>
                    <td className="max-w-[280px] px-2 py-2.5"><div className="flex flex-wrap gap-1">{rule.with.map((w) => <span key={w} className="rounded-md bg-soft px-1.5 py-0.5 text-xs text-muted">{w}</span>)}</div></td>
                    <td className="px-2 py-2.5"><StateChip s={r.state} />{r.state === '承認待ち' && <div className="mt-1 text-xs text-faint">{SHORT[rule.module]}の承認が要る</div>}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      {r.state === '承認待ち' && <button onClick={() => approve(r)} disabled={!!noApprove || !canApprove} title={noApprove ?? (!canApprove ? needText('approve') : undefined)} className="btn-primary mr-1.5 btn-sm"><Check size={14} />承認する</button>}
                      {(r.state === '承認待ち' || r.state === '予約中') && <button onClick={() => cancel(r)} disabled={!!noCancel || !can(rule.module, 'edit')} title={noCancel ?? (!can(rule.module, 'edit') ? needText('edit') : undefined)} className="btn-secondary btn-sm">取り消す</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {form !== false && !live && <YoyakuForm initial={form} rows={rows} onClose={() => setForm(false)} onSave={add} />}
      {form !== false && live && <LiveYoyakuForm initial={form} rows={rows} today={today} onClose={() => setForm(false)} onDone={(id) => { setForm(false); setFilter('これから'); setDay(null); reload(); if (id) pulse(id); }} />}
    </main>
  );
}

function YoyakuForm({ initial, rows, onClose, onSave }: { initial: string; rows: Yoyaku[]; onClose: () => void; onSave: (y: Yoyaku, replace?: string) => void }) {
  const { can, me } = usePerms();
  const people = PEOPLE.filter((p) => p.status !== '退社');
  const [pid, setPid] = useState(people.some((x) => x.id === initial) ? initial : people[0].id);
  const [field, setField] = useState<Field>('現場');
  const [date, setDate] = useState(addDays(TODAY, 7));
  const [to, setTo] = useState('');
  const [replace, setReplace] = useState(false);
  const p = people.find((x) => x.id === pid)!;
  const rule = FIELD_RULES[field];
  const opts = optionsFor(field, p);
  const from = field === '現場' ? p.site : field === '単価' ? p.price : field === '住所' ? `${p.station} 付近` : field === '通勤' ? `${p.station} から 定期` : field === '転籍' ? companyOf(p.id) : p.status;
  const clash = rows.find((r) => r.personId === pid && r.field === field && (r.state === '予約中' || r.state === '承認待ち'));
  const past = date < TODAY;
  const canMake = can(rule.module, 'edit');
  const ready = canMake && !!to.trim() && !past && (!clash || replace);
  const save = () => onSave({ id: `n${Date.now()}`, date, personId: pid, person: p.name, field, from, to: to.trim(), by: me.name.replace(/（.*）/, ''), state: rule.approve ? '承認待ち' : '予約中' }, clash && replace ? clash.id : undefined);

  return (
    <DrawerPortal>
      <aside aria-label="変更を予約" className="mo-drawer drawer">
        <div className="flex items-start justify-between px-5 py-4">
          <div><div className="text-sm text-faint">いつから変わるかを決めて予約</div><div className="text-lg font-bold">変更を予約</div></div>
          <button aria-label="閉じる" onClick={onClose} className="flex size-[34px] items-center justify-center rounded-[10px] border border-line"><X size={16} /></button>
        </div>
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-4 text-body">
          <label className="flex flex-col gap-1 text-sm text-muted">社員
            <select value={pid} onChange={(e) => { setPid(e.target.value); setTo(''); setReplace(false); }} className="min-h-10 rounded-[10px] border border-field bg-surface px-2.5 text-body text-ink">
              {people.map((x) => <option key={x.id} value={x.id}>{x.name}（{x.site === '—' ? x.status : x.site}）</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1 text-sm text-muted">変える項目
            <div className="flex flex-wrap gap-1.5">
              {FIELDS.map((f) => (
                <button key={f} onClick={() => { setField(f); setTo(''); setReplace(false); }} aria-pressed={field === f} className="fchip">
                  <i className="size-[7px] rounded-full" style={{ background: `var(--c-${FIELD_RULES[f].module})` }} />{f}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm text-muted">いつから（この日の朝6:00に切り替え）
            <input type="date" value={date} min={TODAY} onChange={(e) => setDate(e.target.value)} className="min-h-10 rounded-[10px] border border-field bg-surface px-2.5 text-body text-ink" />
            {past && <span className="text-bad">今日より前の日は選べません</span>}
          </label>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div className="flex flex-col gap-1 text-sm text-muted">いま<div className="flex min-h-10 items-center rounded-[10px] bg-soft px-2.5 text-body text-ink">{from}</div></div>
            <ArrowRight size={16} className="mb-3 text-faint" />
            <label className="flex flex-col gap-1 text-sm text-muted">変更後
              <select value={to} onChange={(e) => setTo(e.target.value)} className="min-h-10 min-w-0 rounded-[10px] border border-field bg-surface px-2.5 text-body text-ink"><option value="">選ぶ</option>{opts.map((o) => <option key={o}>{o}</option>)}</select>
            </label>
          </div>

          {clash && (
            <div role="alert" key={clash.id} className="mo-shake flex flex-col gap-2 rounded-[10px] border border-bad-line bg-bad-soft px-3 py-2.5 text-bad">
              <span className="flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{p.name} の{field}には、まだ切り替わっていない予約があります（{fmtDate(clash.date)} から「{clash.to}」）。</span>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />前の予約を取り消して、こちらにする</label>
            </div>
          )}

          <div className="rounded-[10px] border border-line px-3.5 py-3">
            <div className="mb-1.5 text-sm font-semibold text-muted">{fmtDate(date)} から一緒に変わるもの</div>
            <ul className="flex flex-col gap-1.5">
              {rule.with.map((w, i) => <li key={w} className="mo-fade-up flex items-center gap-2" style={{ ['--i' as string]: i }}><Check size={14} className="text-ok" />{w}</li>)}
            </ul>
            {rule.approve && <div className="mt-2 text-sm text-warn">この項目は{SHORT[rule.module]}の承認が要ります。承認されるまで切り替わりません。</div>}
            {field === '現場' && <div className="mt-2 text-sm text-muted">通勤の経路が変わる場合は、通勤の予約も同じ日で作られます（経理の承認待ちに載ります）。</div>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button onClick={onClose} className="btn-secondary">やめる</button>
          <PrimaryButton onClick={save} disabled={!ready} title={!canMake ? needText('edit') : clash && !replace ? '前の予約をどうするか選んでください' : !to.trim() ? '変更後を選んでください' : past ? '今日より前の日は選べません' : undefined}>
            {rule.approve ? '予約して承認に回す' : '予約する'}
          </PrimaryButton>
        </div>
      </aside>
    </DrawerPortal>
  );
}

// ---- 本物の「変更を予約」（10-26）。見た目は見本の YoyakuForm と同じ。人は今の名簿（未経験の人だけ）から選ぶ ----
//   ・待機・退社（現場の「待機」も）は従業員名簿の予約（今までどおり・その日の朝に cron が入れる）
//   ・住所・通勤・単価・現場・休職/産休/育休/稼働中は ver2 の予約（今のシステムの v2_yoyaku）
//   ・住所・通勤は内勤が書く（市区町村まで・経路）。現場・単価・状態は選ぶだけ
const LIVE_STATUS = ['待機', '退社', '休職', '産休', '育休', '稼働中'];
function LiveYoyakuForm({ initial, rows, today, onClose, onDone }: { initial: string; rows: Yoyaku[]; today: string; onClose: () => void; onDone: (id?: string) => void }) {
  const { can } = usePerms();
  const st = useLiveRoute<LiveStaffList>('/api/live/staff');
  const people = useMemo(() => (st.data?.rows || []).filter((x) => x.statusKey !== 'taisha').sort((a, b) => (a.kana || a.name).localeCompare(b.kana || b.name, 'ja')), [st.data]);
  const sites = useMemo(() => Array.from(new Set((st.data?.rows || []).map((x) => x.site).filter((x) => x && x !== '—'))).sort((a, b) => a.localeCompare(b, 'ja')), [st.data]);
  const [pid, setPid] = useState(initial);
  const [field, setField] = useState<Field>('現場');
  const [date, setDate] = useState(addDays(today, 7));
  const [to, setTo] = useState('');
  const [replace, setReplace] = useState(false);
  const { send, error, setError, busy } = useLiveWrite(true);
  const p: LiveStaff | undefined = people.find((x) => x.id === pid) ?? people[0];
  const rule = FIELD_RULES[field];
  const from = !p ? '' : field === '現場' ? p.site : field === '単価' ? p.price : field === '住所' ? '—' : field === '通勤' ? `${p.station || '—'} から` : field === '転籍' ? (p.company || '—') : p.status;
  const opts = !p ? [] : field === '現場' ? [...sites.filter((x) => x !== p.site), '待機'] : field === '単価' ? PRICES.filter((x) => x !== p.price) : field === '状態' ? LIVE_STATUS.filter((x) => x !== p.status) : [];
  const freeText = field === '住所' || field === '通勤';
  const clash = p ? rows.find((r) => normName(r.person) === normName(p.name) && (r.field === field || (field === '状態' && r.field === '状態')) && (r.state === '予約中' || r.state === '承認待ち')) : undefined;
  const past = date < today;
  const toTaiki = (field === '状態' && to === '待機') || (field === '現場' && to === '待機');
  const toTaisha = field === '状態' && to === '退社';
  const needApprove = !!rule.approve && !toTaiki && !toTaisha;
  const canMake = can(rule.module, 'edit');
  const ready = !!p && canMake && !!to.trim() && !past && field !== '転籍' && (!clash || replace) && !busy;

  const save = async () => {
    if (!p) return;
    if (toTaiki || toTaisha) {
      const patch = toTaisha ? { taishaYotei: date } : date <= today ? { taiki: true, taikiYotei: '', override: '' } : { taikiYotei: date };
      const r = await send(staffReq({ kind: 'status', name: p.name, patch, ...(p.personId ? { personId: p.personId } : {}) }, toTaisha ? `${p.name} さんを ${fmtDate(date)} 退社で予約しました` : date <= today ? `${p.name} さんを待機にしました（今日の日付なのですぐ反映）` : `${p.name} さんを ${fmtDate(date)} から待機で予約しました`,
        { sub: toTaisha ? '→ 退社日の翌朝に退社チェックが入ります（退社日も入ります）' : '→ その日の朝に待機チェックが入ります（出勤状況・未打刻アラートの対象外・再アサインも入ります）' }));
      if (r) onDone();
      return;
    }
    const replaceId = clash && replace ? v2Id(clash.id) : '';
    if (clash && replace && !replaceId) { setError('前の予約（名簿の待機・退社の予約）は「取り消す」で外してから予約してください'); return; }
    const r = await send({
      url: JINJI_URL,
      body: { action: 'yoyaku-add', name: p.name, normalized_name: normName(p.name), person_id: p.personId, field, from_text: from, to_text: to.trim(), date, ...(replaceId ? { replace: replaceId } : {}) },
      text: `${p.name} の${field}を ${fmtDate(date)} から「${to.trim()}」に予約しました`,
      sub: needApprove ? `→ ${SHORT[rule.module]}の承認待ちに載りました` : `→ ${rule.with.join('・')} も同じ日に変わります${field === '現場' ? '（通勤の予約も経理の承認待ちに作りました）' : ''}`,
      undo: (res) => (res.id ? { url: JINJI_URL, body: { action: 'yoyaku-cancel', id: res.id } } : null),
    });
    if (r) onDone(r.id ? `v2:${r.id}` : undefined);
  };

  return (
    <DrawerPortal>
      <aside aria-label="変更を予約" className="mo-drawer drawer">
        <div className="flex items-start justify-between px-5 py-4">
          <div><div className="text-sm text-faint">いつから変わるかを決めて予約</div><div className="text-lg font-bold">変更を予約</div></div>
          <button aria-label="閉じる" onClick={onClose} className="flex size-[34px] items-center justify-center rounded-[10px] border border-line"><X size={16} /></button>
        </div>
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-4 text-body">
          <WriteError error={error} onClose={() => setError('')} />
          <label className="flex flex-col gap-1 text-sm text-muted">社員
            <select value={p?.id ?? ''} disabled={!people.length} onChange={(e) => { setPid(e.target.value); setTo(''); setReplace(false); }} className="min-h-10 rounded-[10px] border border-field bg-surface px-2.5 text-body text-ink">
              {!people.length && <option value="">{st.state === 'loading' ? '名簿を読んでいます…' : '名簿を読めませんでした'}</option>}
              {people.map((x) => <option key={x.id} value={x.id}>{x.name}（{x.site === '—' ? x.status : x.site}）</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1 text-sm text-muted">変える項目
            <div className="flex flex-wrap gap-1.5">
              {FIELDS.map((f) => (
                <button key={f} onClick={() => { setField(f); setTo(''); setReplace(false); }} aria-pressed={field === f} disabled={f === '転籍'} title={f === '転籍' ? '転籍は転籍台帳（ミンミカの所属変更）から入ります' : undefined} className="fchip disabled:opacity-40">
                  <i className="size-[7px] rounded-full" style={{ background: `var(--c-${FIELD_RULES[f].module})` }} />{f}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm text-muted">いつから（この日の朝6:00に切り替え）
            <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className="min-h-10 rounded-[10px] border border-field bg-surface px-2.5 text-body text-ink" />
            {past && <span className="text-bad">今日より前の日は選べません</span>}
          </label>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div className="flex flex-col gap-1 text-sm text-muted">いま<div className="flex min-h-10 items-center rounded-[10px] bg-soft px-2.5 text-body text-ink">{from || '—'}</div></div>
            <ArrowRight size={16} className="mb-3 text-faint" />
            <label className="flex flex-col gap-1 text-sm text-muted">変更後
              {freeText
                ? <input value={to} maxLength={120} onChange={(e) => setTo(e.target.value)} placeholder={field === '住所' ? '市区町村まで（例：川崎市）' : '最寄駅→現場の駅 定期'} className="min-h-10 min-w-0 rounded-[10px] border border-field bg-surface px-2.5 text-body text-ink" />
                : <select value={to} onChange={(e) => setTo(e.target.value)} className="min-h-10 min-w-0 rounded-[10px] border border-field bg-surface px-2.5 text-body text-ink"><option value="">選ぶ</option>{opts.map((o) => <option key={o}>{o}</option>)}</select>}
            </label>
          </div>

          {clash && p && (
            <div role="alert" key={clash.id} className="mo-shake flex flex-col gap-2 rounded-[10px] border border-bad-line bg-bad-soft px-3 py-2.5 text-bad">
              <span className="flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{p.name} の{field}には、まだ切り替わっていない予約があります（{fmtDate(clash.date)} から「{clash.to}」）。</span>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />前の予約を取り消して、こちらにする</label>
            </div>
          )}

          <div className="rounded-[10px] border border-line px-3.5 py-3">
            <div className="mb-1.5 text-sm font-semibold text-muted">{fmtDate(date)} から一緒に変わるもの</div>
            <ul className="flex flex-col gap-1.5">
              {rule.with.map((w, i) => <li key={w} className="mo-fade-up flex items-center gap-2" style={{ ['--i' as string]: i }}><Check size={14} className="text-ok" />{w}</li>)}
            </ul>
            {needApprove && <div className="mt-2 text-sm text-warn">この項目は{SHORT[rule.module]}の承認が要ります。承認されるまで切り替わりません。</div>}
            {field === '現場' && to !== '待機' && <div className="mt-2 text-sm text-muted">通勤の経路が変わる場合は、通勤の予約も同じ日で作られます（経理の承認待ちに載ります）。</div>}
            {(toTaiki || toTaisha) && <div className="mt-2 text-sm text-muted">待機・退社は従業員名簿の予約に入ります（その日の朝に名簿のチェックが入ります）。</div>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button onClick={onClose} className="btn-secondary">やめる</button>
          <PrimaryButton onClick={save} disabled={!ready} title={!canMake ? needText('edit') : clash && !replace ? '前の予約をどうするか選んでください' : !to.trim() ? '変更後を選んでください' : past ? '今日より前の日は選べません' : undefined}>
            {needApprove ? '予約して承認に回す' : '予約する'}
          </PrimaryButton>
        </div>
      </aside>
    </DrawerPortal>
  );
}
