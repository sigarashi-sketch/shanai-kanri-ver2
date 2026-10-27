'use client';

import { useEffect, useState } from 'react';
import { Crown, Lock, TrendingDown, TrendingUp } from 'lucide-react';
import { PageTitle } from '@/components/ui';
import { CountUp, RemainRing } from '@/components/Motivation';
import { LiveBanner, useIke } from '@/components/Live';
import { PersonName } from '@/components/Person';
import { useMikeiken } from '@/components/Mikeiken';
import { useMotivation } from '@/components/Motivation';
import { loadShared, saveShared, type Goals } from '@/lib/org';
import { SHUSSHA_LABEL, fareOverMax, grossIsRough, grossOf, manOf, rate, repFromIkeLines, yen, type HeLine, type HeRep, type HeRepPrev, type IkePlReps } from '@/lib/live/home-eigyo';

// ホーム営業（10-25 shoya「当月の営業に属する人たちの成約数・売上・粗利」「営業は自分の成約してる人だけ見れる。関係ない人は見ない」）。
//   ・上：チーム合計と、担当営業ごとの順位（成約数・売上・粗利で並べ替え）。前月比つき
//   ・下：担当営業ひとりの「成約した人」。営業の人は自分の分だけ／管理者は担当を選んで見る／それ以外は出さない
//   ・ログイン中は今のシステムの GET /api/nippo?action=pl-reps（10-25 足した口・駅すぱあとは呼ばない＝交通費は辞書にある分だけ）。
//     担当ごとの合計は全員分、成約した人の明細は super_admin・admin は全員分／ほかは自分の分だけ（今のシステムが絞って返す）
//   ・今月の目標（10-27）＝担当ごとの成約数。全員で共有する設定（v2-settings の goals）に置き、決めるのは全体管理者だけ（毎月同じ数）
type SortKey = 'count' | 'uriage' | 'gross';
const SORTS: { k: SortKey; label: string }[] = [{ k: 'count', label: '成約数' }, { k: 'uriage', label: '売上' }, { k: 'gross', label: '見込み粗利' }];
const ymLabel = (ym: string) => `${Number(ym.slice(5))}月`;
const diff = (now: number, prev: number, unit: string) => {
  const d = now - prev;
  if (d === 0) return <span className="text-faint">先月と同じ</span>;
  const Icon = d > 0 ? TrendingUp : TrendingDown;
  return <span className={`inline-flex items-center gap-0.5 ${d > 0 ? 'text-ok' : 'text-bad'}`}><Icon size={12} />先月より {d > 0 ? '+' : '−'}{Math.abs(d).toLocaleString('ja-JP')}{unit}</span>;
};

export default function EigyoHome() {
  const [preview, setPreview] = useState('');           // 管理者が「営業の人の見え方」を試す
  const [sort, setSort] = useState<SortKey>('count');
  const [picked, setPicked] = useState('');
  const [goals, setGoals] = useState<Goals>({});
  const [canGoal, setCanGoal] = useState(false);
  const { toast } = useMotivation();
  useEffect(() => { let dead = false; loadShared().then((s) => { if (dead || s.state !== 'live') return; setGoals(s.value?.goals ?? {}); setCanGoal(s.canSave); }); return () => { dead = true; }; }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get('tantou'); if (t) setPicked(t);
    const s = q.get('sort') as SortKey | null; if (s && SORTS.some((x) => x.k === s)) setSort(s);
  }, []);

  const ike = useIke<IkePlReps>('nippo?action=pl-reps');
  const mk = useMikeiken();
  // ★本物で ok でない答え（今のシステムが失敗を返した）は「読めなかった」として出す（10-25）
  const liveBad = ike.live && ike.data?.ok !== true;
  const L = ike.live && ike.data?.ok ? ike.data : null;
  const MONTH = L ? L.ym : '';
  const REPS: string[] = L ? [...new Set(L.reps.filter((x) => x.ym === L.ym).map((x) => x.tantou))] : [];
  const PREV: Record<string, HeRepPrev> = L ? Object.fromEntries(L.reps.filter((x) => x.ym === L.prev).map((x) => [x.tantou, { count: x.count, uriage: x.uriage, gross: x.gross }])) : {};
  const ACT_LABELS = L ? L.actLabels : [];
  const ACTS: Record<string, Record<string, number>> = L ? Object.fromEntries(L.reps.filter((x) => x.ym === L.ym).map((x) => [x.tantou, x.acts || {}])) : {};
  const isAdmin = L ? L.all : false;
  const myRep = L ? (L.all ? null : L.me || null) : null;
  const asRep = myRep ?? (isAdmin && preview ? preview : null);
  const shown = asRep ?? (isAdmin ? (REPS.includes(picked) ? picked : REPS[0] ?? null) : null);       // 成約した人の一覧を出す担当（出せなければ null）
  // 本物も明細をプロパーリスト（未経験の正）で絞る。担当ごとの合計は、明細が返ってくる担当だけ絞ったあとの明細から作り直す
  const liveLines = L && mk.set ? L.lines.filter((l) => l.ym === L.ym) : [];
  const liveKept = L && mk.set ? liveLines.filter((l) => mk.has(l.name)) : [];
  const { kept: ALL, dropped } = L
    ? { kept: liveKept.map((l): HeLine => ({ tantou: l.tantou, name: l.name, joui: l.joui, status: l.status as HeLine['status'], md: l.md, uriage: l.uriage, gakumen: l.gakumenKnown ? 0 : null, fare: l.fareMissing ? null : 0, shussha: (l.shussha || 'jouchuu') as HeLine['shussha'], noBill: l.noBill, gross: l.gross })), dropped: liveLines.length - liveKept.length }
    : { kept: [] as HeLine[], dropped: 0 };
  const hasLines = (t: string) => !!L && (L.all || t === L.me);   // 明細が返ってくる担当（＝絞って作り直せる担当）
  const reps: HeRep[] = L
    ? L.reps.filter((x) => x.ym === L.ym).map((x) => (hasLines(x.tantou) ? repFromIkeLines(x.tantou, liveKept) : x))
    : [];
  const unfiltered = L ? reps.filter((r) => !hasLines(r.tantou)).length : 0;
  const ranked = [...reps].sort((a, b) => b[sort] - a[sort] || b.count - a.count);
  const rankOf = (r: HeRep) => 1 + ranked.filter((x) => x[sort] > r[sort]).length;
  const team = reps.reduce((s, r) => ({ count: s.count + r.count, uriage: s.uriage + r.uriage, gross: s.gross + r.gross, base: s.base + r.grossBase, nb: s.nb + r.noBillUriage, noPrice: s.noPrice + r.noPrice, noBillCount: s.noBillCount + r.noBillCount, noGakumen: s.noGakumen + r.noGakumen, fareMissing: s.fareMissing + r.fareMissing }), { count: 0, uriage: 0, gross: 0, base: 0, nb: 0, noPrice: 0, noBillCount: 0, noGakumen: 0, fareMissing: 0 });
  const teamRough = grossIsRough(team);
  // 見込み粗利の注意書き（いつも出す）
  const caveat = (fm: number) => `交通費未取得 ${fm}件＝最大 ¥${fareOverMax(fm).toLocaleString('ja-JP')} 多め・社保は額面の19%で概算`;
  const prev = Object.values(PREV).reduce((s, p) => ({ count: s.count + p.count, uriage: s.uriage + p.uriage, gross: s.gross + p.gross }), { count: 0, uriage: 0, gross: 0 });
  const max = Math.max(1, ...reps.map((r) => r[sort]));
  const fmt = (r: HeRep) => (sort === 'count' ? `${r.count}件` : `${manOf(r[sort]).toLocaleString('ja-JP')}万`);

  const me1 = shown ? reps.find((r) => r.tantou === shown)! : null;
  const lines = shown ? ALL.filter((l) => l.tantou === shown) : [];
  const goal = shown ? Math.max(0, Math.floor(goals.eigyoCount?.[shown] ?? 0)) : 0;
  const setGoal = async () => {
    if (!shown || !canGoal) return;
    const v = window.prompt(`${shown}さんの毎月の成約数の目標（件）。0 で目標なし（全員に効きます）`, String(goal || ''));
    if (v === null) return;
    const n = Math.max(0, Math.floor(Number(v.replace(/[^\d]/g, '')) || 0));
    const next: Goals = { ...goals, eigyoCount: { ...(goals.eigyoCount ?? {}), [shown]: n } };
    const r = await saveShared('goals', next);
    if (r.ok) { setGoals(next); toast({ text: n ? `${shown}さんの目標を ${n}件 にしました` : `${shown}さんの目標をなしにしました`, sub: '→ ホーム営業の残りリングに出ます（全員に効きます）' }); }
    else toast({ text: '目標を保存できませんでした', sub: r.error });
  };

  if (liveBad || (ike.live && mk.state === 'error')) return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="ホーム営業" sub="担当営業ごとの成約数・売上・見込み粗利（未経験の要員だけ）" />
      <LiveBanner state="error" error={liveBad ? (ike.data as { error?: string } | null)?.error || '今のシステムが答えを返せませんでした' : `未経験の人に絞れませんでした（${mk.error}）`} onReload={ike.reload} />
    </main>
  );

  // 読んでいるあいだ（10秒ほど）・読めないあいだは数字を出さない
  if (!L || ike.state === 'loading' || (ike.live && mk.state === 'loading')) return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="ホーム営業" sub="担当営業ごとの成約数・売上・粗利（未経験の要員だけ）" />
      <LiveBanner state={ike.state} error={ike.error} onReload={ike.reload} />
      <div className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-body text-muted">{ike.state === 'loading' || mk.state === 'loading' ? '日報②の契約実績を読んでいます…（10秒ほど）' : 'まだありません'}</div>
    </main>
  );

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="ホーム営業" sub={`${ymLabel(MONTH)}・担当営業ごとの成約数・売上・粗利（未経験の要員だけ）`}>
        {isAdmin && !myRep && (
          <label className="flex items-center gap-1.5 text-sm text-muted">見え方を試す
            <select value={preview} onChange={(e) => setPreview(e.target.value)} className="rounded-lg border border-field bg-surface px-2 py-1.5 text-sm text-ink">
              <option value="">管理者として</option>
              {REPS.map((r) => <option key={r} value={r}>{r}さん（営業）として</option>)}
            </select>
          </label>
        )}
      </PageTitle>
      <LiveBanner state={ike.state} error={ike.error} onReload={ike.reload} note={L ? `今のシステムの日報②の契約実績から（スプシ「営業別」と同じ決まり・見るだけ）。交通費は運賃の辞書にある分だけで、無い成約は0円で計算しています${L.all ? '' : '・成約した人は自分の分だけ'}` : undefined} />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { k: 'チームの成約数', v: team.count, unit: '件', sub: diff(team.count, prev.count, '件') },
          { k: '売上（契約単価の合計）', v: manOf(team.uriage), unit: '万', sub: diff(manOf(team.uriage), manOf(prev.uriage), '万') },
          { k: '見込み粗利（成約ベース）', v: manOf(team.gross), unit: '万', sub: <>粗利率 {rate(team.gross, team.base).toFixed(1)}%{teamRough && <span className="text-warn">（参考値）</span>}・{diff(manOf(team.gross), manOf(prev.gross), '万')}<div className="text-warn">{caveat(team.fareMissing)}</div></> },
          { k: '請求の無い退場（差し引き）', v: manOf(team.nb), unit: '万', sub: <span className="text-faint">成約数には残しています</span> },
        ].map((x, i) => (
          <div key={x.k} className="mo-fade-up rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: i + 1, borderTop: '3px solid var(--a)' }}>
            <div className="text-sm text-muted">{x.k}</div>
            <div className="text-xl font-bold tracking-tight"><CountUp to={x.v} /><span className="ml-0.5 text-body font-semibold text-muted">{x.unit}</span></div>
            <div className="text-xs">{x.sub}</div>
          </div>
        ))}
      </div>

      <section className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 5 }}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <h2 className="text-md font-bold">今月の順位</h2>
          <div className="ml-auto flex gap-1">
            {SORTS.map((s) => (
              <button key={s.k} onClick={() => { setSort(s.k); window.history.replaceState(null, '', `?sort=${s.k}${shown && isAdmin && !asRep ? `&tantou=${encodeURIComponent(shown)}` : ''}`); }}
                className={`min-h-8 rounded-full border px-3 text-sm ${sort === s.k ? 'font-semibold' : 'text-muted'}`} style={sort === s.k ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>{s.label}</button>
            ))}
          </div>
        </div>
        {ranked.map((r, i) => {
          const n = rankOf(r), mine = asRep === r.tantou, on = shown === r.tantou, p = PREV[r.tantou];
          const pick = isAdmin && !asRep;
          return (
            <div key={r.tantou} onClick={pick ? () => setPicked(r.tantou) : undefined}
              className={`mo-fade-in flex flex-wrap items-center gap-3 border-t border-line-soft px-4 py-2.5 ${pick ? 'row cursor-pointer' : ''}`}
              style={{ ['--i' as string]: 6 + i, ...(on ? { boxShadow: 'inset 3px 0 0 var(--a)', background: 'var(--al)' } : {}) }}>
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-body font-bold ${n === 1 ? 'mo-spring-in' : ''}`}
                style={n === 1 ? { background: 'var(--a)', color: 'var(--o-eigyo)' } : n <= 3 ? { background: 'var(--as)', color: 'var(--ad)' } : { background: 'var(--color-sunken)', color: 'var(--color-muted)' }}>
                {n === 1 ? <Crown size={15} /> : n}
              </span>
              <span className="w-24 shrink-0 font-semibold">{r.tantou}{mine && <span className="chip ml-1.5" style={{ background: 'var(--tone-info-bg)', color: 'var(--tone-info-fg)' }}>自分</span>}</span>
              <div className="min-w-[160px] flex-1">
                <div className="h-4 rounded-md bg-sunken"><div className="mo-bar h-4 rounded-md" style={{ width: `${(r[sort] / max) * 100}%`, background: n === 1 ? 'var(--a)' : 'var(--al)', ['--i' as string]: i }} /></div>
                <div className="mt-0.5 text-xs text-muted">{ACT_LABELS.map((a) => `${a} ${ACTS[r.tantou]?.[a] ?? 0}`).join('・')}</div>
              </div>
              <div className="w-[230px] shrink-0 text-right">
                <b className="num text-md">{fmt(r)}</b>
                <div className="num text-xs text-muted">{r.count}件・売上 {manOf(r.uriage)}万・見込み粗利 {manOf(r.gross)}万（{rate(r.gross, r.grossBase).toFixed(1)}%{grossIsRough(r) ? '・参考値' : ''}）{L && !hasLines(r.tantou) ? '・未経験で絞る前の数' : ''}</div>
                <div className="text-xs">{p && diff(sort === 'count' ? r.count : manOf(r[sort]), sort === 'count' ? p.count : manOf(p[sort]), sort === 'count' ? '件' : '万')}</div>
              </div>
            </div>
          );
        })}
        <div className="border-t border-line-soft px-4 py-2 text-xs text-muted">粗利＝単価−額面−額面×19%（社保）−交通費（フルリモートは0円・リモート併用は週2出社）。プロパーリストに名前がある人だけ数えています{dropped > 0 ? `（未経験でない${dropped}件を外しています）` : ''}{unfiltered > 0 ? `。明細を見られない担当 ${unfiltered}人と先月の数は、今のシステムの数のまま（未経験で絞る前）` : ''}。交通費未取得の成約は0円で計算＝粗利は多めに出ます（{caveat(team.fareMissing)}）。{isAdmin && !asRep && '行を押すと、その担当の成約した人が下に出ます'}</div>
      </section>

      {!shown || !me1 ? (
        <div className="rounded-xl border border-line bg-soft px-5 py-6 text-center text-body text-muted"><Lock size={16} className="mx-auto mb-1.5 text-faint" />成約した人の一覧は、担当営業の本人と管理者だけが見られます</div>
      ) : (
        <section className={`mo-fade-up overflow-hidden rounded-xl border border-line bg-surface `} style={{ ['--i' as string]: 10 }}>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            {goal > 0 && <RemainRing remain={Math.max(0, goal - me1.count)} total={goal} />}
            <div className="min-w-0 flex-1">
              <h2 className="text-md font-bold">{shown}さんが成約した人 <span className="num text-muted">{lines.length}</span></h2>
              <div className="text-sm text-muted">{!goal ? `成約 ${me1.count}件` : me1.count >= goal ? `今月の目標 ${goal}件に届きました` : `今月の目標 ${goal}件まで あと${goal - me1.count}件`}{asRep ? '・ほかの担当の人は出しません' : ''}</div>
            </div>
            {canGoal && <button onClick={() => { void setGoal(); }} className="btn-secondary btn-sm" title="毎月の成約数の目標（全員に効きます・全体管理者だけ）">{goal ? `目標 ${goal}件を変える` : '目標を決める'}</button>}
            {isAdmin && !asRep && (
              <select aria-label="担当営業" value={picked} onChange={(e) => setPicked(e.target.value)} className="rounded-lg border border-field bg-surface px-2 py-1.5 text-sm">
                {REPS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
          </div>
          {goal > 0 && me1.count >= goal && <div className="mo-scale-in mx-4 mb-3 rounded-xl border border-ok-line bg-ok-soft px-4 py-3 text-center text-body font-semibold text-ok">{ymLabel(MONTH)}の目標に届きました。おつかれさまです</div>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-body">
              <thead><tr className="th-row text-left">
                <th className="px-4 py-2.5 font-semibold">名前</th><th className="px-2 py-2.5 font-semibold">上位会社</th><th className="px-2 py-2.5 font-semibold">区分</th><th className="px-2 py-2.5 font-semibold">成約日</th>
                <th className="px-2 py-2.5 text-right font-semibold">単価</th><th className="px-2 py-2.5 text-right font-semibold">額面＋社保</th><th className="px-2 py-2.5 text-right font-semibold">交通費</th><th className="px-4 py-2.5 text-right font-semibold">見込み粗利</th>
              </tr></thead>
              <tbody>
                {lines.map((l) => {
                  const g0 = grossOf(l), shaho = g0.shaho, gross = L ? l.gross ?? null : g0.gross;   // 本物は額面を返さない＝粗利は今のシステムの値
                  return (
                    <tr key={`${l.tantou}|${l.name}|${l.md}|${l.status}`} className="row border-t border-line-soft">
                      <td className="px-4 py-2.5"><PersonName name={l.name} />
                        {l.noBill && <span className="chip ml-1.5" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>請求なし退場・差し引き</span>}</td>
                      <td className="px-2 py-2.5 text-muted">{l.joui}</td>
                      <td className="px-2 py-2.5">{l.status.replace('未経験', '')}</td>
                      <td className="num px-2 py-2.5">{l.md}</td>
                      <td className="num px-2 py-2.5 text-right">{l.uriage == null ? <span className="text-warn">単価が空</span> : yen(l.uriage)}</td>
                      <td className="num px-2 py-2.5 text-right">{l.gakumen == null ? <span className="text-warn">額面不明</span> : L ? <span className="text-faint">—</span> : yen(l.gakumen + (shaho ?? 0))}</td>
                      <td className="num px-2 py-2.5 text-right">{l.fare == null && l.shussha !== 'remote' ? <span className="text-warn">未取得（0円で計算）</span> : L ? <span className="text-faint">—</span> : yen(l.fare ?? 0)}<div className="text-xs text-faint">{SHUSSHA_LABEL[l.shussha]}</div></td>
                      <td className={`num px-4 py-2.5 text-right font-semibold ${l.noBill ? 'text-faint line-through' : ''}`}>{yen(gross)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line-soft px-4 py-2 text-xs text-muted">
            <span>合計 売上 {yen(me1.uriage)}・見込み粗利 {yen(me1.gross)}（{rate(me1.gross, me1.grossBase).toFixed(1)}%{grossIsRough(me1) ? '・参考値' : ''}）</span>
            <span className="text-warn">{caveat(me1.fareMissing)}</span>
            {me1.noGakumen > 0 && <span className="text-warn">額面不明 {me1.noGakumen}件は粗利に入れていません</span>}
            {me1.noPrice > 0 && <span className="text-warn">単価が空 {me1.noPrice}件は売上に入れていません</span>}
          </div>
        </section>
      )}
      <p className="text-xs text-faint">額面・交通費の金額はここには出しません（粗利だけ）。社保や交通費の扱いなど、最終判断は社労士・税理士・法務に確認してください。</p>
    </main>
  );
}
