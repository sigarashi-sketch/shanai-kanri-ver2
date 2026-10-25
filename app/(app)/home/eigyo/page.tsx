'use client';

import { useEffect, useState } from 'react';
import { Check, Crown, Lock, TrendingDown, TrendingUp } from 'lucide-react';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { CountUp, RemainRing, useMotivation } from '@/components/Motivation';
import { NotInLegacy } from '@/components/Live';
import { PersonName } from '@/components/Person';
import { HE_ACTS, HE_ACT_LABELS, HE_GOAL, HE_LINES, HE_MONTH, HE_PREV, HE_PROPER_NAMES, HE_REPS, HE_REP_OF_MEMBER } from '@/lib/home-eigyo-sample';
import { SHUSSHA_LABEL, grossOf, manOf, onlyProper, rate, repOf, yen, type HeRep } from '@/lib/live/home-eigyo';

// ホーム営業（10-25 shoya「当月の営業に属する人たちの成約数・売上・粗利」「営業は自分の成約してる人だけ見れる。関係ない人は見ない」）。
//   ・上：チーム合計と、担当営業ごとの順位（成約数・売上・粗利で並べ替え）。前月比つき
//   ・下：担当営業ひとりの「成約した人」。営業の人は自分の分だけ／管理者は担当を選んで見る／それ以外は出さない
//   ・本物には つないでいない（lib/live/home-eigyo.ts の冒頭：全員分を読める口が無く、本人の口は駅すぱあとを使うため）
type SortKey = 'count' | 'uriage' | 'gross';
const SORTS: { k: SortKey; label: string }[] = [{ k: 'count', label: '成約数' }, { k: 'uriage', label: '売上' }, { k: 'gross', label: '粗利' }];
const ymLabel = (ym: string) => `${Number(ym.slice(5))}月`;
const diff = (now: number, prev: number, unit: string) => {
  const d = now - prev;
  if (d === 0) return <span className="text-faint">先月と同じ</span>;
  const Icon = d > 0 ? TrendingUp : TrendingDown;
  return <span className={`inline-flex items-center gap-0.5 ${d > 0 ? 'text-ok' : 'text-bad'}`}><Icon size={12} />先月より {d > 0 ? '+' : '−'}{Math.abs(d).toLocaleString('ja-JP')}{unit}</span>;
};

export default function HomeEigyoPage() {
  const { me, can } = usePerms();
  const { hit, toast } = useMotivation();
  const isAdmin = me.role === 'owner' || me.role === 'manager';
  const myRep = HE_REP_OF_MEMBER[me.id] ?? null;
  const [preview, setPreview] = useState('');           // 管理者が「営業の人の見え方」を試す
  const [sort, setSort] = useState<SortKey>('count');
  const [picked, setPicked] = useState(HE_REPS[0]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get('tantou'); if (t && HE_REPS.includes(t)) setPicked(t);
    const s = q.get('sort') as SortKey | null; if (s && SORTS.some((x) => x.k === s)) setSort(s);
  }, []);

  const asRep = myRep ?? (isAdmin && preview ? preview : null);
  const shown = asRep ?? (isAdmin ? picked : null);       // 成約した人の一覧を出す担当（出せなければ null）
  const { kept: ALL, dropped } = onlyProper(HE_LINES, HE_PROPER_NAMES);   // 未経験の正＝プロパーリストに名前がある人だけ
  const reps: HeRep[] = HE_REPS.map((t) => repOf(t, ALL));
  const ranked = [...reps].sort((a, b) => b[sort] - a[sort] || b.count - a.count);
  const rankOf = (r: HeRep) => 1 + ranked.filter((x) => x[sort] > r[sort]).length;
  const team = reps.reduce((s, r) => ({ count: s.count + r.count, uriage: s.uriage + r.uriage, gross: s.gross + r.gross, base: s.base + r.grossBase, nb: s.nb + r.noBillUriage }), { count: 0, uriage: 0, gross: 0, base: 0, nb: 0 });
  const prev = Object.values(HE_PREV).reduce((s, p) => ({ count: s.count + p.count, uriage: s.uriage + p.uriage, gross: s.gross + p.gross }), { count: 0, uriage: 0, gross: 0 });
  const max = Math.max(1, ...reps.map((r) => r[sort]));
  const fmt = (r: HeRep) => (sort === 'count' ? `${r.count}件` : `${manOf(r[sort]).toLocaleString('ja-JP')}万`);

  const me1 = shown ? reps.find((r) => r.tantou === shown)! : null;
  const lines = shown ? ALL.filter((l) => l.tantou === shown) : [];
  const goal = shown ? HE_GOAL[shown] ?? 0 : 0;
  const ckKey = shown ? `${HE_MONTH}:${shown}` : '';
  const canEdit = can('eigyo', 'edit') || !!myRep;

  const confirm = () => {
    if (!shown || checked[ckKey]) return;
    const k = ckKey, who = shown;
    setChecked((c) => ({ ...c, [k]: true })); setFlash(k); setTimeout(() => setFlash(null), 1300);
    hit();
    toast({ text: `${who}さんの${ymLabel(HE_MONTH)}の成約を確かめました`, sub: '→ 売上・粗利の「営業別」の確認に反映しました', undo: () => setChecked((c) => ({ ...c, [k]: false })) });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="ホーム営業" sub={`${ymLabel(HE_MONTH)}・担当営業ごとの成約数・売上・粗利（未経験の要員だけ）・見本データ`}>
        {isAdmin && !myRep && (
          <label className="flex items-center gap-1.5 text-[12.5px] text-muted">見え方を試す
            <select value={preview} onChange={(e) => setPreview(e.target.value)} className="rounded-lg border border-field bg-surface px-2 py-1.5 text-[12.5px] text-ink">
              <option value="">管理者として</option>
              {HE_REPS.map((r) => <option key={r} value={r}>{r}さん（営業）として</option>)}
            </select>
          </label>
        )}
      </PageTitle>
      <NotInLegacy what="担当営業ごとの一覧（今は毎朝スプレッドシートの「営業別」タブに書くだけで、読める口がありません）" />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { k: 'チームの成約数', v: team.count, unit: '件', sub: diff(team.count, prev.count, '件') },
          { k: '売上（契約単価の合計）', v: manOf(team.uriage), unit: '万', sub: diff(manOf(team.uriage), manOf(prev.uriage), '万') },
          { k: '粗利', v: manOf(team.gross), unit: '万', sub: <>粗利率 {rate(team.gross, team.base).toFixed(1)}%・{diff(manOf(team.gross), manOf(prev.gross), '万')}</> },
          { k: '請求の無い退場（差し引き）', v: manOf(team.nb), unit: '万', sub: <span className="text-faint">成約数には残しています</span> },
        ].map((x, i) => (
          <div key={x.k} className="mo-fade-up rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: i + 1, borderTop: '3px solid var(--a)' }}>
            <div className="text-[12px] text-muted">{x.k}</div>
            <div className="text-[24px] font-bold tracking-tight"><CountUp to={x.v} /><span className="ml-0.5 text-[13px] font-semibold text-muted">{x.unit}</span></div>
            <div className="text-[11.5px]">{x.sub}</div>
          </div>
        ))}
      </div>

      <section className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 5 }}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <h2 className="text-[15px] font-bold">今月の順位</h2>
          <div className="ml-auto flex gap-1">
            {SORTS.map((s) => (
              <button key={s.k} onClick={() => { setSort(s.k); window.history.replaceState(null, '', `?sort=${s.k}${shown && isAdmin && !asRep ? `&tantou=${encodeURIComponent(shown)}` : ''}`); }}
                className={`min-h-8 rounded-full border px-3 text-[12.5px] ${sort === s.k ? 'font-semibold' : 'text-muted'}`} style={sort === s.k ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>{s.label}</button>
            ))}
          </div>
        </div>
        {ranked.map((r, i) => {
          const n = rankOf(r), mine = asRep === r.tantou, on = shown === r.tantou, p = HE_PREV[r.tantou];
          const pick = isAdmin && !asRep;
          return (
            <div key={r.tantou} onClick={pick ? () => setPicked(r.tantou) : undefined}
              className={`mo-fade-in flex flex-wrap items-center gap-3 border-t border-line-soft px-4 py-2.5 ${pick ? 'row cursor-pointer' : ''}`}
              style={{ ['--i' as string]: 6 + i, ...(on ? { boxShadow: 'inset 3px 0 0 var(--a)', background: 'var(--al)' } : {}) }}>
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${n === 1 ? 'mo-spring-in' : ''}`}
                style={n === 1 ? { background: 'var(--a)', color: 'var(--o-eigyo)' } : n <= 3 ? { background: 'var(--as)', color: 'var(--ad)' } : { background: 'var(--color-sunken)', color: 'var(--color-muted)' }}>
                {n === 1 ? <Crown size={15} /> : n}
              </span>
              <span className="w-24 shrink-0 font-semibold">{r.tantou}{mine && <span className="chip ml-1.5" style={{ background: 'var(--tone-info-bg)', color: 'var(--tone-info-fg)' }}>自分</span>}</span>
              <div className="min-w-[160px] flex-1">
                <div className="h-4 rounded-md bg-sunken"><div className="mo-bar h-4 rounded-md" style={{ width: `${(r[sort] / max) * 100}%`, background: n === 1 ? 'var(--a)' : 'var(--al)', ['--i' as string]: i }} /></div>
                <div className="mt-0.5 text-[11.5px] text-muted">{HE_ACT_LABELS.map((a) => `${a} ${HE_ACTS[r.tantou]?.[a] ?? 0}`).join('・')}</div>
              </div>
              <div className="w-[230px] shrink-0 text-right">
                <b className="num text-[15px]">{fmt(r)}</b>
                <div className="num text-[11.5px] text-muted">{r.count}件・売上 {manOf(r.uriage)}万・粗利 {manOf(r.gross)}万（{rate(r.gross, r.grossBase).toFixed(1)}%）</div>
                <div className="text-[11.5px]">{p && diff(sort === 'count' ? r.count : manOf(r[sort]), sort === 'count' ? p.count : manOf(p[sort]), sort === 'count' ? '件' : '万')}</div>
              </div>
            </div>
          );
        })}
        <div className="border-t border-line-soft px-4 py-2 text-[11.5px] text-muted">粗利＝単価−額面−額面×19%（社保）−交通費（フルリモートは0円・リモート併用は週2出社）。プロパーリストに名前がある人だけ数えています{dropped > 0 ? `（載っていない成約 ${dropped}件は除外）` : ''}。{isAdmin && !asRep && '行を押すと、その担当の成約した人が下に出ます'}</div>
      </section>

      {!shown || !me1 ? (
        <div className="rounded-xl border border-line bg-soft px-5 py-6 text-center text-[13px] text-muted"><Lock size={16} className="mx-auto mb-1.5 text-faint" />成約した人の一覧は、担当営業の本人と管理者だけが見られます</div>
      ) : (
        <section className={`mo-fade-up overflow-hidden rounded-xl border border-line bg-surface ${flash === ckKey ? 'mo-flash' : ''}`} style={{ ['--i' as string]: 10 }}>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <RemainRing remain={Math.max(0, goal - me1.count)} total={goal} />
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-bold">{shown}さんが成約した人 <span className="num text-muted">{lines.length}</span></h2>
              <div className="text-[12px] text-muted">{me1.count >= goal ? `今月の目標 ${goal}件に届きました` : `今月の目標 ${goal}件まで あと${goal - me1.count}件`}{asRep ? '・ほかの担当の人は出しません' : ''}</div>
            </div>
            {isAdmin && !asRep && (
              <select aria-label="担当営業" value={picked} onChange={(e) => setPicked(e.target.value)} className="rounded-lg border border-field bg-surface px-2 py-1.5 text-[12.5px]">
                {HE_REPS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
            <button onClick={confirm} disabled={!canEdit || !!checked[ckKey]} title={!canEdit ? needText('edit') : checked[ckKey] ? 'この月は確かめてあります' : undefined}
              className="btn-primary inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-3.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"><Check size={15} />{checked[ckKey] ? '確かめました' : '数字を確かめた'}</button>
          </div>
          {me1.count >= goal && <div className="mo-scale-in mx-4 mb-3 rounded-xl border border-ok-line bg-ok-soft px-4 py-3 text-center text-[13px] font-semibold text-ok">{ymLabel(HE_MONTH)}の目標に届きました。おつかれさまです</div>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[13px]">
              <thead><tr className="th-row text-left">
                <th className="px-4 py-2.5 font-semibold">名前</th><th className="px-2 py-2.5 font-semibold">上位会社</th><th className="px-2 py-2.5 font-semibold">区分</th><th className="px-2 py-2.5 font-semibold">成約日</th>
                <th className="px-2 py-2.5 text-right font-semibold">単価</th><th className="px-2 py-2.5 text-right font-semibold">額面＋社保</th><th className="px-2 py-2.5 text-right font-semibold">交通費</th><th className="px-4 py-2.5 text-right font-semibold">粗利</th>
              </tr></thead>
              <tbody>
                {lines.map((l) => {
                  const { shaho, gross } = grossOf(l);
                  return (
                    <tr key={l.name} className="row border-t border-line-soft">
                      <td className="px-4 py-2.5"><PersonName name={l.name} />
                        {l.noBill && <span className="chip ml-1.5" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>請求なし退場・差し引き</span>}</td>
                      <td className="px-2 py-2.5 text-muted">{l.joui}</td>
                      <td className="px-2 py-2.5">{l.status.replace('未経験', '')}</td>
                      <td className="num px-2 py-2.5">{l.md}</td>
                      <td className="num px-2 py-2.5 text-right">{l.uriage == null ? <span className="text-warn">単価が空</span> : yen(l.uriage)}</td>
                      <td className="num px-2 py-2.5 text-right">{l.gakumen == null ? <span className="text-warn">額面不明</span> : yen(l.gakumen + (shaho ?? 0))}</td>
                      <td className="num px-2 py-2.5 text-right">{l.fare == null && l.shussha !== 'remote' ? <span className="text-warn">未取得（0円で計算）</span> : yen(l.fare ?? 0)}<div className="text-[11px] text-faint">{SHUSSHA_LABEL[l.shussha]}</div></td>
                      <td className={`num px-4 py-2.5 text-right font-semibold ${l.noBill ? 'text-faint line-through' : ''}`}>{yen(gross)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line-soft px-4 py-2 text-[11.5px] text-muted">
            <span>合計 売上 {yen(me1.uriage)}・粗利 {yen(me1.gross)}（{rate(me1.gross, me1.grossBase).toFixed(1)}%）</span>
            {me1.noGakumen > 0 && <span className="text-warn">額面不明 {me1.noGakumen}件は粗利に入れていません</span>}
            {me1.noPrice > 0 && <span className="text-warn">単価が空 {me1.noPrice}件は売上に入れていません</span>}
            {me1.fareMissing > 0 && <span className="text-warn">交通費未取得 {me1.fareMissing}件</span>}
          </div>
        </section>
      )}
      <p className="text-[11.5px] text-faint">数字は見本です（名前・会社・金額は作り物）。社保や交通費の扱いなど、最終判断は社労士・税理士・法務に確認してください。</p>
    </main>
  );
}
