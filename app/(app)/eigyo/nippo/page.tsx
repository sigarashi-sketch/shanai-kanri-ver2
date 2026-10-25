'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ExternalLink, X } from 'lucide-react';
import {
  ACT_ITEMS as ACT_ITEMS0, AMOUNTS, CO_FIELDS, COMPANIES, FOODS, GAKUMEN, JITAI_CAND, KAISHA, KEIKEN_CAND as KEIKEN_CAND0, KETTEI as KETTEI0, KE_ST, KINMU, KINMU_SONOTA, MUST_MEMBERS, NOW_LABEL, PENDING as PENDING0,
  RATE_DAYS, RIYUU, ROSTER as ROSTER0, SEIYAKU_CAND as SEIYAKU_CAND0, SELF, SHAHO, SITE_FIELDS, ST, TAIJOU_CHK, TAIJOU_RIYUU, TODAY as TODAY0, UNIT, addMonth, datesBetween, md, monthEnd, yen,
  type Field, type Kettei, type Roster, type Unit,
} from '@/lib/nippo-sample';
import { SALES_REPS } from '@/lib/taiki-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { CountUp, useMotivation } from '@/components/Motivation';
import { LIVE_WRITE_BLOCKED, LiveBanner, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { liveNippo, type NippoInit } from '@/lib/live/nippo';
import { PersonName } from '@/components/Person';

// 成約日報。今の社内システムの /nippo（携帯で1問ずつ答える）を、そのままの問いの順番で ver2 に載せ替えたもの。
//   書き先（本物）：日報②の 契約実績【プロパー】・NN月◯◯組の自分の行・終了者【プロパー】/【退職者】。見本では書かない。
//   本物（ログイン中）：今の GET /api/nippo（init）を読む＝今日の参画決定の自動一覧・名前で探す候補・退場/退職/辞退の候補・
//     組シートの今日の数字の項目・空欄の残る成約。答えるところまでは動くが、日報②へ書く（送る・保存する）は止める
type P = Kettei & { tensekiAsk: '' | 'なし' | 'あり'; tenseki: string; co: string; coSet: Record<string, string>; site: string; siteSet: Record<string, string>; same: boolean | null; cond: Record<string, string>; nyuujou: string; unit: Unit; raw: number; rate: null | { days: number; after: number; scope: '' | 'site' | 'line' }; kinmu: string[]; kinmuNote: string };
type TJ = Roster & { date: string; seikyu: string; until: '' | 'taijou' | 'month_end' | 'date'; untilDate: string; chk: Record<string, boolean>; riyuu: string };
type TS = Roster & { date: string; honnin: '本人都合' | '会社都合'; riyuu: string };
type JT = { id: string; name: string; tantou: string; kettei: boolean } & { how: '' | 'renraku' | 'tobi' };
type H = { s: string; i: number };

const COLS = ['成約氏名', '上位', '所属', '人月担当', 'インセン担当', '入場月', '入場日', '売上高', '特別粗利', '特別還元', 'ステータス', '成約日'];
const NYU_DATES = datesBetween('2026-10-24', '2026-12-31'), END_DATES = datesBetween('2026-10-01', '2026-12-31');
const isRe = (st: string) => /再アサイン$/.test(st);
const uri = (p: P) => p.raw * UNIT[p.unit].mul;
const man = (v: number) => `${(Math.round(v / 1000) / 10).toLocaleString('ja-JP')}万円`;
const within1m = (t: TJ) => (!t.date ? false : !t.start ? null : t.date >= t.start && t.date <= addMonth(t.start));
const needUntil = (t: TJ) => !!t.date && !(within1m(t) !== false && t.seikyu === 'しない');
const untilOf = (t: TJ) => (t.until === 'taijou' ? t.date : t.until === 'month_end' ? monthEnd(t.date) : t.until === 'date' ? t.untilDate : '');
const taijouOk = (t: TJ) => !!t.date && (within1m(t) === false || !!t.seikyu) && (!needUntil(t) || !!untilOf(t));
const kinmuText = (p: P) => p.kinmu.map((k) => (k === 'その他' ? p.kinmuNote : k)).filter(Boolean).join('＋');
const kinmuOk = (p: P) => p.kinmu.length > 0 && (!p.kinmu.includes('その他') || !!p.kinmuNote);
const coOf = (p: P) => COMPANIES.find((c) => c.name === p.co);
const siteOf = (p: P) => coOf(p)?.sites.find((s) => s.name === p.site);

// 1文字ずつ落ちてくる見出し（今のシステムの問いの出し方）
const Kin = ({ t }: { t: string }) => <span className="nip-k">{Array.from(t).map((c, i) => (c === '\n' ? <br key={i} /> : <span key={i} style={{ animationDelay: `${i * 38}ms` }}>{c}</span>))}</span>;
const Q = ({ tag, q, hint }: { tag?: string; q: string; hint?: React.ReactNode }) => (<>{tag && <span className="chip" style={{ background: 'var(--al)', color: 'var(--ad)' }}>{tag}</span>}<h2 className="mt-2 text-2xl font-bold leading-tight tracking-tight"><Kin t={q} /></h2>{hint && <p className="mt-1.5 text-sm leading-relaxed text-muted">{hint}</p>}</>);
const onStyle = { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' };
const Big = ({ t, s, on, onClick }: { t: string; s?: string; on?: boolean; onClick: () => void }) => (
  <button onClick={onClick} className="flex min-h-[84px] flex-col items-start justify-center gap-0.5 rounded-xl border border-line px-4 py-3 text-left text-lg font-bold transition hover:bg-soft" style={on ? onStyle : undefined}>{t}{s && <small className="text-sm font-normal text-muted">{s}</small>}</button>
);
const Seg = ({ opts, value, onPick }: { opts: [string, string][]; value: string; onPick: (v: string) => void }) => (
  <div className="flex flex-wrap gap-1.5">{opts.map(([v, l]) => <button key={v} onClick={() => onPick(v)} className="min-h-9 rounded-full border border-line px-3.5 text-body" style={value === v ? onStyle : undefined}>{l}</button>)}</div>
);
const Sel = ({ label, value, opts, onChange, lab }: { label: string; value: string; opts: string[]; onChange: (v: string) => void; lab?: (v: string) => string }) => (
  <label className="mt-2.5 flex flex-col gap-1 text-sm font-semibold text-muted">{label}
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-10 rounded-[10px] border border-field bg-surface px-2.5 text-body font-normal text-ink">
      <option value="">えらぶ</option>{opts.map((o) => <option key={o} value={o}>{lab ? lab(o) : o}</option>)}
    </select>
  </label>
);
const Badge = ({ st, onClick }: { st: string; onClick?: (e: React.MouseEvent) => void }) => <span role={onClick ? 'button' : undefined} onClick={onClick} className="chip ml-1.5 cursor-pointer" style={isRe(st) ? { background: 'var(--tone-purple-bg)', color: 'var(--tone-purple-fg)' } : { background: 'var(--tone-info-bg)', color: 'var(--tone-info-fg)' }}>{st}</span>;
const Go = ({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) => <button onClick={onClick} disabled={disabled} title={title} className="btn-primary mt-5 min-h-11 w-full">{children}</button>;
const Skip = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => <button onClick={onClick} className="mt-2 w-full py-1.5 text-sm text-muted underline-offset-2 hover:underline">{children}</button>;
const CardList = ({ fields, vals }: { fields: Field[]; vals: Record<string, string> }) => <ul className="mt-2 grid gap-0.5 rounded-[10px] bg-soft px-3 py-2 text-sm">{fields.filter((f) => vals[f.key]).map((f) => <li key={f.key}>{f.label}：<b>{vals[f.key]}</b></li>)}</ul>;
const Tbl = ({ head, rows }: { head: string[]; rows: (string | number)[][] }) => (
  <div className="mt-1.5 overflow-x-auto rounded-[10px] border border-line"><table className="w-max min-w-full text-sm"><thead><tr className="th-row">{head.map((h) => <th key={h} className="whitespace-nowrap px-2 py-1.5 text-left">{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line-soft">{r.map((c, j) => <td key={j} className="whitespace-nowrap px-2 py-1.5" style={c === '未定' ? { color: 'var(--tone-warn-fg)', fontWeight: 700 } : undefined}>{c}</td>)}</tr>)}</tbody></table></div>
);

export default function NippoPage() {
  const perm = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const [me, setMe] = useState('三枝');
  const [keiken, setKeiken] = useState(false);
  const [older, setOlder] = useState(false);
  // 本物：今の GET /api/nippo（init）。as＝出す人（今の画面の「担当名」）・older＝直近7日・k＝経験者の日報。はじめはログインした人で開く
  const [asked, setAsked] = useState(false);
  const ni = useIke<NippoInit>(`nippo?${new URLSearchParams({ ...(asked ? { as: me, k: keiken ? 'keiken' : 'mikeiken' } : {}), ...(older ? { older: '1' } : {}) })}`);
  // 本物は未経験の人だけ（今のプロパーリストに入っている人）：参画決定・成約の候補・退場/退職・辞退の候補（経験者の日報の候補だけは絞らない）・空欄の残る成約
  const mk = useMikeiken();
  const L0 = useMemo(() => {
    const d = ni.data;
    if (!d || !d.ok || mk.state === 'none') return liveNippo(d);
    return liveNippo({
      ...d, kettei: mk.keep(d.kettei || [], 'name'), seiyakuCand: mk.keep(d.seiyakuCand || [], 'name'), keikenCand: d.keikenCand || [],   // 経験者の候補は絞らない（経験者の日報なので・10-25 shoya）
      roster: mk.keep(d.roster || [], 'name'), jitaiCand: mk.keep(d.jitaiCand || [], 'name'), pending: mk.keep(d.pending || [], 'name'),
    });
  }, [ni.data, mk]);
  const live = ni.live && !!L0;   // 読めても ok:false（日報②のタブが無い等）なら本物とは扱わない
  const Lv = live ? L0 : null;
  useEffect(() => { if (!L0 || asked) return; if (L0.me) setMe(L0.me); setKeiken(L0.kind === 'keiken'); }, [L0, asked]);
  const TODAY = Lv?.today ?? TODAY0;
  const KETTEI = Lv?.kettei ?? KETTEI0, SEIYAKU_CAND = Lv?.seiyakuCand ?? SEIYAKU_CAND0, KEIKEN_CAND = Lv?.keikenCand ?? KEIKEN_CAND0;
  const ROSTER = Lv?.roster ?? ROSTER0, PENDING = Lv?.pending ?? PENDING0;
  const JITAI: { id: string; name: string; tantou: string; kettei: boolean }[] = Lv?.jitaiCand ?? JITAI_CAND;
  const ACT_ITEMS: { label: string; auto: boolean; current?: number }[] = Lv ? Lv.actItems : ACT_ITEMS0;
  const REPS = Lv?.reps.length ? Lv.reps : SALES_REPS;
  const canEdit = perm && !live;
  const noEdit = live ? LIVE_WRITE_BLOCKED : needText('edit');
  const [cur, setCur] = useState<H>({ s: 'home', i: 0 });
  const [hist, setHist] = useState<H[]>([]);
  const [extra, setExtra] = useState<Kettei[]>([]);
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [stOver, setStOver] = useState<Record<string, string>>({});
  const [find, setFind] = useState('');
  const [picked, setPicked] = useState<P[]>([]);
  const [taijou, setTaijou] = useState<TJ[] | null>(null);
  const [taisha, setTaisha] = useState<TS[] | null>(null);
  const [jitai, setJitai] = useState<JT[] | null>(null);
  const [act, setAct] = useState<Record<string, number>>({});
  const [food, setFood] = useState('ラーメン');
  const [submitted, setSubmitted] = useState(false);
  const [pendingDone, setPendingDone] = useState(false);
  const [fillDate, setFillDate] = useState('');
  const [allFields, setAllFields] = useState(false);
  const [celeb, setCeleb] = useState(0);

  useEffect(() => { const q = new URLSearchParams(window.location.search); const r = q.get('rep'); if (r && SALES_REPS.includes(r)) setMe(r); if (q.get('k') === 'keiken') setKeiken(true); }, []);
  useEffect(() => { if (!celeb) return; const t = setTimeout(() => setCeleb(0), 2600); return () => clearTimeout(t); }, [celeb]);

  const go = (s: string, i = cur.i) => { setHist((h) => [...h, cur]); setCur({ s, i }); setAllFields(false); };
  const back = () => { const h = hist[hist.length - 1]; if (!h) return; setHist(hist.slice(0, -1)); setCur(h); };
  const reset = (s: string) => { setHist([]); setCur({ s, i: 0 }); };
  const STEPS = keiken ? ['tenseki', 'joui', 'genba', 'nyuujou', 'uriage'] : ['tenseki', 'joui', 'genba', 'nyuujou', 'uriage', 'kinmu'];
  const idx = cur.i, p = picked[idx];
  const upP = (patch: Partial<P>) => setPicked((ps) => ps.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  const nextStep = () => { const k = STEPS.indexOf(cur.s.slice(2)); if (k < STEPS.length - 1) go(`p:${STEPS[k + 1]}`); else if (idx < picked.length - 1) go('p:tenseki', idx + 1); else go('taijou'); };
  const list = keiken ? extra : [...extra, ...KETTEI.filter((k) => (older ? true : k.on === TODAY))];
  const status = (k: Kettei) => stOver[k.id] || k.status;
  const must = (live ? !Lv?.submitted && L0?.me === me : MUST_MEMBERS.includes(me)) && !submitted;
  const autoCount = (label: string) => { const re = picked.filter((x) => isRe(x.status)).length; return label === '契約数' ? picked.length : label === '再アサイン数' ? re : picked.length - re; };
  const n = picked.length, total = picked.reduce((s, x) => s + uri(x), 0);
  const prog = cur.s === 'home' ? 0 : cur.s === 'pick' ? 0.12 : cur.s.startsWith('p:') ? 0.15 + 0.55 * ((idx * STEPS.length + STEPS.indexOf(cur.s.slice(2))) / (n * STEPS.length)) : ({ taijou: 0.72, taishoku: 0.75, jitai: 0.8, katsudo: 0.85, confirm: 0.94, finish: 1 } as Record<string, number>)[cur.s] ?? 0.5;
  const afterTaisha = () => go(keiken ? 'confirm' : 'jitai');

  const startPeople = () => {
    const sel = list.filter((k) => on[k.id] && !k.doneOn);
    setPicked(sel.map((k) => picked.find((x) => x.id === k.id) ? { ...picked.find((x) => x.id === k.id)!, status: status(k) } : { ...k, status: status(k), tensekiAsk: '', tenseki: '', co: '', coSet: {}, site: '', siteSet: {}, same: null, cond: {}, nyuujou: '', unit: 'ningetsu', raw: 0, rate: null, kinmu: [], kinmuNote: '' }));
    go('p:tenseki', 0);
  };
  const send = () => {
    if (!canEdit) return;
    setSubmitted(true); hit(1 + n + (taijou?.length || 0) + (taisha?.length || 0) + (jitai?.length || 0));
    const where = [n ? '契約実績' : '', keiken ? '' : '組シート', taijou?.length || taisha?.length ? '終了者' : ''].filter(Boolean).join('・');
    toast({ text: `${me} さんの今日の日報を書きました`, sub: `→ 日報②の ${where} に反映${taisha?.length ? '・退職者は名簿の退社と営業リストの稼働中にも' : ''}`, undo: () => { setSubmitted(false); reset('confirm'); } });
    if (n) setCeleb(Date.now());
    setHist([]); setCur({ s: 'finish', i: 0 });
  };
  const confetti = useMemo(() => (celeb ? Array.from({ length: 70 }, (_, i) => ({ l: Math.random() * 100, d: Math.random() * 1.4, t: 1.6 + Math.random() * 1.2, s: 6 + Math.random() * 7, c: ['var(--a)', 'var(--al)', 'var(--tone-ok-bar)', 'var(--tone-caution-bar)', 'var(--tone-info-fg)'][i % 5] })) : []), [celeb]);

  // ===== 画面ごとの中身 =====
  const head = (k: number) => (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-line-soft bg-soft px-3 py-2.5">
      <span className="grid size-9 place-items-center rounded-full text-md font-bold" style={{ background: 'var(--al)', color: 'var(--ad)' }}>{p.name[0]}</span>
      <span className="flex-1"><small className="block text-xs text-faint">{k + 1}/{STEPS.length}問目　この人について答えてね</small><b className="text-md"><PersonName name={p.name} className="underline-offset-2 hover:underline" /> <i className="text-sm font-normal not-italic">さん</i></b><Badge st={p.status} /></span>
      <span className="text-sm text-muted"><b className="num text-md text-ink">{idx + 1}</b>/{n}人目</span>
    </div>
  );
  const screen = (() => {
    const s = cur.s;
    if (s === 'home') {
      const nToday = list.filter((k) => !k.doneOn).length;
      return (<>
        {!pendingDone && PENDING.length > 0 && <button onClick={() => go('fill')} className="mb-4 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}><span className="flex-1"><b className="block text-body">まだ空いてる成約があるよ</b><small className="text-sm">入場日・売上を埋めてね（{PENDING.map((x) => x.name).join('、')}）</small></span><b className="num text-xl">{PENDING.length}</b></button>}
        <Q tag={keiken ? `経験者の日報 · ${md(TODAY)}` : `${md(TODAY)} の日報`} q={'今日、\n成約あった？'} hint={keiken ? <>今日の数字・内定辞退・勤務の形は聞きません。答えるのは <b>成約・退場・退職</b> の3つだけ</> : 'プロパーリストで「参画決定」を押した人から選べます'} />
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Big t="あった！" s={keiken ? '名前を選ぶ' : `${older ? '直近7日' : '今日'}の参画決定 ${nToday}名`} onClick={() => go('pick')} />
          <Big t="なかった" s={keiken ? '退場・退職だけ答える' : '退場・退職・辞退・数字だけ答える'} onClick={() => go('taijou')} />
        </div>
        {submitted && <div className="mt-4 rounded-xl border border-line px-4 py-3 text-body"><b className="text-ok">今日は回答ずみ <Check size={14} className="inline" /></b></div>}
        <div className="mt-6 flex flex-col items-center gap-1">
          {!keiken && <Skip onClick={() => { setKeiken(true); setAsked(true); setExtra([]); setOn({}); reset('home'); }}>経験者の日報に切り替える</Skip>}
          <Skip onClick={() => go('food')}>好きな食べ物：{food}（変える）</Skip>
        </div>
      </>);
    }
    if (s === 'food') return (<>
      <Q tag="おわりのごほうび" q={'好きな食べ物は？'} hint="日報を出したあとに、食べログ百名店のページを出します" />
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">{FOODS.map(([f]) => <button key={f} disabled={!canEdit} title={!canEdit ? noEdit : undefined} onClick={() => { setFood(f); hit(); toast({ text: `好きな食べ物を「${f}」にしました`, sub: '→ おわり画面のごほうび候補' }); reset('home'); }} className="min-h-11 rounded-[10px] border border-line text-body font-semibold disabled:opacity-40" style={food === f ? onStyle : undefined}>{f}</button>)}</div>
    </>);
    if (s === 'fill') return (<>
      <Q tag="空欄のある成約" q={'決まった？'} hint="わかった分だけでOK。空欄が残る間は毎回ここに出ます" />
      {PENDING.map((x) => <div key={x.id} className="mt-3 rounded-xl border border-line px-4 py-3"><b className="text-body"><PersonName name={x.name} className="underline-offset-2 hover:underline" /></b> <small className="text-muted">成約 {x.seiyaku}　{x.joui}</small>
        {x.needNyuujou && <Sel label="入場日" value={fillDate} opts={NYU_DATES} lab={md} onChange={setFillDate} />}</div>)}
      <Go disabled={!fillDate || !canEdit} title={!canEdit ? noEdit : undefined} onClick={() => { setPendingDone(true); hit(); toast({ text: `${PENDING[0].name} さんの入場日を ${md(fillDate)} にしました`, sub: '→ 日報②の契約実績（入場月・入場日）', undo: () => setPendingDone(false) }); reset('home'); }}>保存して日報を更新</Go>
    </>);
    if (s === 'pick') {
      const hits = find ? (keiken ? KEIKEN_CAND : SEIYAKU_CAND).filter((c) => c.name.replace(/\s/g, '').includes(find.replace(/\s/g, '')) && !list.some((k) => k.id === c.id)) : [];
      const c = list.filter((k) => on[k.id] && !k.doneOn).length;
      return (<>
        <Q tag={keiken ? '経験者の成約' : older ? '直近7日に「参画決定」を押した人' : '今日「参画決定」を押した人'} q={'だれが\n成約した？'} hint="何人でも選べます。ステータスは自動（違っていたらバッジをタップで直せます）" />
        <input value={find} onChange={(e) => setFind(e.target.value)} placeholder={keiken ? '名前で探す（稼働管理情報一覧から）' : '名前で探す（参画決定がまだの人も）'} className="mt-3 min-h-10 w-full rounded-[10px] border border-field bg-surface px-3 text-body" />
        {hits.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{hits.map((h) => <button key={h.id} onClick={() => { setExtra((e) => [h, ...e]); setOn((o) => ({ ...o, [h.id]: true })); setFind(''); }} className="mo-fade-in rounded-full border border-line px-3 py-1 text-sm">＋ {h.name}<small className="text-faint">　{h.tantou ? `担当 ${h.tantou}・` : ''}{h.addKettei ? '参画決定はまだ' : h.shozoku}</small></button>)}</div>}
        {find && !hits.length && <small className="mt-1 block text-faint">見つかりません（下の一覧にもう居る人・辞退の人は出ません）</small>}
        <div className="mt-3 flex flex-col gap-2">
          {list.length === 0 && <div className="rounded-xl bg-soft px-4 py-3 text-body text-muted">{keiken ? '上の検索で名前を探して選んでください。' : <>今日は、まだ参画決定が押された人がいません。<br />上の検索で名前を探して選ぶと、参画決定もいっしょに付けます。</>}</div>}
          {list.map((k, i) => (
            <button key={k.id} disabled={!!k.doneOn} onClick={() => setOn((o) => ({ ...o, [k.id]: !o[k.id] }))} className="mo-fade-up flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left disabled:opacity-50" style={{ ['--i' as string]: i, ...(on[k.id] && !k.doneOn ? onStyle : {}) }}>
              <span className="grid size-9 place-items-center rounded-full bg-sunken text-body font-bold">{k.name[0]}</span>
              <span className="flex-1"><b className="text-body">{k.name}</b><Badge st={status(k)} onClick={(e) => { e.stopPropagation(); const opts = keiken ? KE_ST : ST; setStOver((o) => ({ ...o, [k.id]: status(k) === opts[0] ? opts[1] : opts[0] })); }} />
                <small className="block text-xs text-muted">{k.doneOn ? `${k.doneOn} の日報に記入ずみ` : <>{k.addKettei && <span style={{ color: 'var(--tone-warn-fg)' }}>参画決定も付けます　</span>}いまの所属：{k.shozoku}{k.tantou && `　担当：${k.tantou}`}</>}</small></span>
              {on[k.id] && !k.doneOn && <Check size={18} />}
            </button>
          ))}
        </div>
        <Go disabled={!c} onClick={startPeople}>{c ? `${c}名で次へ →` : '次へ'}</Go>
        {!keiken && !older && <Skip onClick={() => setOlder(true)}>きのうより前に押した人も出す</Skip>}
      </>);
    }
    if (s === 'p:tenseki') return (<>{head(0)}
      <Q q={'転籍は\nある？'} hint={<>いまの所属：<b>{p.shozoku}</b>　日報の「所属」には転籍後の会社を書きます</>} />
      <div className="mt-4 grid grid-cols-2 gap-2.5"><Big t="なし" s={`${p.shozoku} のまま`} on={p.tensekiAsk === 'なし'} onClick={() => { upP({ tensekiAsk: 'なし', tenseki: '' }); nextStep(); }} /><Big t="あり" s="転籍先を選ぶ" on={p.tensekiAsk === 'あり'} onClick={() => upP({ tensekiAsk: 'あり' })} /></div>
      {p.tensekiAsk === 'あり' && <div className="mo-fade-in"><Sel label="転籍先の会社" value={p.tenseki} opts={KAISHA.filter((k) => k !== p.shozoku)} onChange={(v) => upP({ tenseki: v })} /><p className="mt-1.5 text-sm text-muted">所属：<b>{p.tenseki ? `${p.shozoku} → ${p.tenseki}` : p.shozoku}</b></p><Go disabled={!p.tenseki} onClick={nextStep}>次へ →</Go></div>}
    </>);
    if (s === 'p:joui') {
      const c = coOf(p), vals = { ...(c?.values || {}), ...p.coSet };
      const miss = c ? CO_FIELDS.filter((f) => f.required && !vals[f.key]) : [];
      const ask = c ? (allFields ? CO_FIELDS : CO_FIELDS.filter((f) => f.required && !c.values[f.key])) : [];
      return (<>{head(1)}
        <Q q="上位会社は？" hint="登録ずみの会社・ミンミカの取引先・稼働管理情報一覧から選びます" />
        <Sel label="上位会社" value={p.co} opts={COMPANIES.map((x) => x.name)} onChange={(v) => upP({ co: v, coSet: {}, site: '', siteSet: {}, same: null, cond: {} })} />
        {c && <div className="mo-fade-in mt-3"><span className="chip" style={c.kind === '登録ずみの会社' ? { background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' } : { background: 'var(--tone-info-bg)', color: 'var(--tone-info-fg)' }}>{c.kind}</span>
          <CardList fields={CO_FIELDS} vals={c.values} />
          {ask.length > 0 && <div className="mt-1">{ask.map((f) => <Sel key={f.key} label={f.label} value={vals[f.key] || ''} opts={f.options} onChange={(v) => upP({ coSet: { ...p.coSet, [f.key]: v } })} />)}</div>}
          {!miss.length && !allFields && <Skip onClick={() => setAllFields(true)}>会社の条件を直す</Skip>}
          {miss.length > 0 && <p className="mt-2 text-sm" style={{ color: 'var(--tone-warn-fg)' }}>まだ空いている：{miss.map((f) => f.label).join('・')}</p>}
        </div>}
        <Go disabled={!c || miss.length > 0} onClick={nextStep}>次へ →</Go>
      </>);
    }
    if (s === 'p:genba') {
      const c = coOf(p)!, st = siteOf(p), vals = { ...(st?.values || {}), ...p.siteSet };
      const miss = st ? SITE_FIELDS.filter((f) => f.required && !vals[f.key]).map((f) => f.label) : ['現場'];
      if (st && p.same === null) miss.push('現場の決まりと同じか'); else if (st && p.same === false && !Object.keys(p.cond).length) miss.push('違うところ');
      return (<>{head(2)}
        <Q q="現場は？" hint={`${c.name} の現場から選びます。同じ駅でも現場名で分けます`} />
        <div className="mt-3 flex flex-col gap-2">{c.sites.map((x) => { const m = SITE_FIELDS.filter((f) => f.required && !x.values[f.key]).length; return (
          <button key={x.name} onClick={() => upP({ site: x.name, siteSet: {}, same: null, cond: {} })} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left" style={p.site === x.name ? onStyle : undefined}>
            <span className="grid size-9 place-items-center rounded-full bg-sunken text-body font-bold">{x.name[0]}</span><span className="flex-1"><b className="text-body">{x.name}</b><small className="block text-xs text-muted">{x.values.eki && `${x.values.eki}　`}{m ? <span style={{ color: 'var(--tone-warn-fg)' }}>空欄 {m}</span> : '条件そろってる'}</small></span>{p.site === x.name && <Check size={18} />}
          </button>); })}</div>
        {st && <div className="mo-fade-in mt-3">
          <CardList fields={SITE_FIELDS} vals={st.values} />
          {SITE_FIELDS.filter((f) => f.required && !st.values[f.key]).map((f) => <Sel key={f.key} label={f.label} value={vals[f.key] || ''} opts={f.options} onChange={(v) => upP({ siteSet: { ...p.siteSet, [f.key]: v } })} />)}
          <div className="mt-3 rounded-[10px] border border-line-soft px-3 py-2 text-sm"><b>この現場にいま入っている人{st.people.length ? `（${st.people.length}名）` : ''}</b><small className="block text-muted">{st.people.length ? st.people.join('、') : 'まだ誰も入っていません'}</small></div>
          <p className="mt-3 text-sm font-semibold text-muted">{p.name} さんの条件は、この現場の決まりと同じ？</p>
          <div className="mt-1.5"><Seg opts={[['1', '同じ'], ['0', '違うところがある']]} value={p.same === null ? '' : p.same ? '1' : '0'} onPick={(v) => { upP({ same: v === '1', cond: {} }); if (v === '1' && SITE_FIELDS.every((f) => !f.required || vals[f.key])) nextStep(); }} /></div>
          {p.same === false && <div className="mo-fade-in"><p className="mt-2 text-sm text-muted">この人だけ違うところを選んでください（現場の決まりは変えません）</p>
            {SITE_FIELDS.map((f) => <Sel key={f.key} label={f.label} value={p.cond[f.key] || vals[f.key] || ''} opts={f.options} onChange={(v) => { const cond = { ...p.cond }; if (v === vals[f.key] || !v) delete cond[f.key]; else cond[f.key] = v; upP({ cond }); }} />)}</div>}
          {miss.length > 0 && <p className="mt-2 text-sm" style={{ color: 'var(--tone-warn-fg)' }}>まだ空いている：{miss.join('・')}</p>}
        </div>}
        <Go disabled={miss.length > 0} onClick={nextStep}>次へ →</Go>
      </>);
    }
    if (s === 'p:nyuujou') return (<>{head(3)}
      <Q q={'入場日は\nいつ？'} hint="まだ決まってなければ「未定」で進めます" />
      <Sel label="入場日" value={p.nyuujou} opts={NYU_DATES} lab={md} onChange={(v) => upP({ nyuujou: v })} />
      <p className="mt-2 rounded-[10px] bg-soft px-3 py-2 text-sm">日報には <b>{p.nyuujou ? `入場月 ${+p.nyuujou.slice(5, 7)}｜入場日 ${+p.nyuujou.slice(8, 10)}` : '空欄'}</b> と書きます</p>
      <Go disabled={!p.nyuujou} onClick={nextStep}>次へ →</Go><Skip onClick={() => { upP({ nyuujou: '' }); nextStep(); }}>まだ未定（あとで答える）</Skip>
    </>);
    if (s === 'p:uriage') {
      const r = p.rate, rateOk = !r || (!!r.days && !!r.after && !!r.scope);
      return (<>{head(4)}
        <Q q="売上は？" hint="時給は160h、日給は20日で人月に直して書きます" />
        <div className="mt-3"><Seg opts={(Object.keys(UNIT) as Unit[]).map((k) => [k, UNIT[k].label])} value={p.unit} onPick={(v) => upP({ unit: v as Unit, raw: 0, rate: r ? { ...r, after: 0 } : null })} /></div>
        <Sel label={`${UNIT[p.unit].label}（円）`} value={p.raw ? String(p.raw) : ''} opts={AMOUNTS[p.unit].map(String)} lab={(v) => `${yen(+v)}円`} onChange={(v) => upP({ raw: +v || 0 })} />
        <div className="mt-3 rounded-xl bg-soft px-4 py-3 text-center"><small className="block text-xs text-faint">{p.raw ? `${yen(p.raw)}円 ` : ''}{UNIT[p.unit].note}</small><b className="text-2xl"><CountUp key={uri(p)} to={uri(p)} /></b> 円<small className="block text-xs text-faint">日報の「売上高」に入る金額</small></div>
        <p className="mt-3 text-sm font-semibold text-muted">単価は途中で変わる？（研修単価など）</p>
        <div className="mt-1.5"><Seg opts={[['0', 'いいえ'], ['1', 'はい']]} value={r ? '1' : '0'} onPick={(v) => upP({ rate: v === '1' ? r || { days: 0, after: 0, scope: '' } : null })} /></div>
        {r && <div className="mo-fade-in mt-2 rounded-xl border border-line-soft px-3 py-2">
          <Sel label="いつ変わる？（入場から◯日後）" value={r.days ? String(r.days) : ''} opts={RATE_DAYS.map(String)} lab={(v) => `${v}日後`} onChange={(v) => upP({ rate: { ...r, days: +v } })} />
          <p className="mt-2 text-sm text-muted">変わる前：<b>{p.raw ? `${yen(p.raw)}円` : '上で選んだ単価'}</b></p>
          <Sel label="変わった後" value={r.after ? String(r.after) : ''} opts={AMOUNTS[p.unit].map(String)} lab={(v) => `${yen(+v)}円`} onChange={(v) => upP({ rate: { ...r, after: +v } })} />
          <p className="mt-2.5 text-sm font-semibold text-muted">この決まりは</p><div className="mt-1"><Seg opts={[['site', 'この現場の決まりとして保存'], ['line', 'この人だけ']]} value={r.scope} onPick={(v) => upP({ rate: { ...r, scope: v as 'site' | 'line' } })} /></div>
        </div>}
        <Go disabled={!p.raw || !rateOk} onClick={nextStep}>次へ →</Go><Skip onClick={() => { upP({ raw: 0, rate: null }); nextStep(); }}>まだ未定（あとで答える）</Skip>
      </>);
    }
    if (s === 'p:kinmu') return (<>{head(5)}
      <Q q="勤務の形は？" hint="日報②には書かず、従業員名簿の「勤務区分」に入ります" />
      <div className="mt-4 grid grid-cols-2 gap-2.5">{KINMU.map((k) => <Big key={k} t={k} s={k === 'その他' ? '固定休み・3勤3休 など' : undefined} on={p.kinmu.includes(k)} onClick={() => upP({ kinmu: p.kinmu.includes(k) ? p.kinmu.filter((x) => x !== k) : [...p.kinmu, k], ...(k === 'その他' && p.kinmu.includes(k) ? { kinmuNote: '' } : {}) })} />)}</div>
      <p className="mt-2 text-sm text-muted">あてはまるものを全部タップ（複数選べます。たとえば 土日祝休み＋シフト）</p>
      {p.kinmu.includes('その他') && <Sel label="その他の中身" value={p.kinmuNote} opts={KINMU_SONOTA} onChange={(v) => upP({ kinmuNote: v })} />}
      <Go disabled={!kinmuOk(p)} onClick={nextStep}>{idx === n - 1 ? '次へ →' : '次の人へ →'}</Go><Skip onClick={() => { upP({ kinmu: [], kinmuNote: '' }); nextStep(); }}>まだ分からない（名簿はそのまま）</Skip>
    </>);
    if (s === 'taijou') {
      const L = taijou || [], up = (i: number, patch: Partial<TJ>) => setTaijou(L.map((t, j) => (j === i ? { ...t, ...patch } : t)));
      return (<>
        <Q tag="退場＝現場を出る" q={'現場を出る人は\nいる？'} hint={<><b>会社には残る人</b>です（日報②の終了者）。会社を辞める人は次の「退職」で聞きます</>} />
        <div className="mt-4 grid grid-cols-2 gap-2.5"><Big t="いない" s="次へ進む" onClick={() => { setTaijou(null); go('taishoku'); }} /><Big t="いる" s="名前と現場の最終日を入れる" on={taijou !== null} onClick={() => setTaijou(L)} /></div>
        {taijou !== null && <div className="mo-fade-in">
          <Sel label="名前（従業員名簿から）" value="" opts={ROSTER.filter((r) => !L.some((t) => t.id === r.id)).map((r) => r.id)} lab={(id) => ROSTER.find((r) => r.id === id)!.name} onChange={(id) => { const r = ROSTER.find((x) => x.id === id); if (r) setTaijou([...L, { ...r, date: '', seikyu: '', until: '', untilDate: '', chk: {}, riyuu: '' }]); }} />
          {L.map((t, i) => { const w = within1m(t); return (
            <div key={t.id} className="mo-fade-up mt-3 rounded-xl border border-line px-4 py-3">
              <div className="flex items-center"><b className="text-body"><PersonName name={t.name} className="underline-offset-2 hover:underline" /> さん</b><small className="ml-2 text-muted">{t.shozoku}・{t.kubun}</small><button aria-label="外す" onClick={() => setTaijou(L.filter((_, j) => j !== i))} className="ml-auto text-faint"><X size={16} /></button></div>
              <p className="mt-1 text-sm">入場日 <b>{t.start ? md(t.start) : '分からない'}</b></p>
              <Sel label="退場日（現場の最終日）" value={t.date} opts={END_DATES} lab={md} onChange={(v) => up(i, { date: v, ...(within1m({ ...t, date: v }) === false ? { seikyu: '' } : {}) })} />
              {t.date && w !== false && <><p className="mt-2.5 text-sm font-semibold"><span style={{ color: 'var(--tone-warn-fg)' }}>{w ? '入場から1ヶ月以内の退場です。' : '入場から1ヶ月以内の退場なら、'}</span>請求をかける？</p><div className="mt-1"><Seg opts={(w === null ? ['する', 'しない', '1ヶ月以内ではない'] : ['する', 'しない']).map((o) => [o, o])} value={t.seikyu} onPick={(v) => up(i, { seikyu: v })} /></div></>}
              {needUntil(t) && <><p className="mt-2.5 text-sm font-semibold text-muted">請求はいつまで？</p><div className="mt-1"><Seg opts={[['taijou', `退場日まで（${md(t.date)}）`], ['month_end', `月末まで（${md(monthEnd(t.date))}）`], ['date', '別の日付']]} value={t.until} onPick={(v) => up(i, { until: v as TJ['until'], untilDate: '' })} /></div>{t.until === 'date' && <Sel label="請求する最後の日" value={t.untilDate} opts={END_DATES.filter((d) => d >= t.date)} lab={md} onChange={(v) => up(i, { untilDate: v })} />}</>}
              <p className="mt-2.5 text-sm font-semibold text-muted">済んでいるものをタップ（日報のチェックに入ります）</p>
              <div className="mt-1 flex flex-wrap gap-1.5">{TAIJOU_CHK.map(([k, l]) => <button key={k} onClick={() => up(i, { chk: { ...t.chk, [k]: !t.chk[k] } })} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line px-3 text-body" style={t.chk[k] ? onStyle : undefined}>{t.chk[k] && <Check size={13} />}{l}</button>)}</div>
              <Sel label="理由（備考に書きます）" value={t.riyuu} opts={TAIJOU_RIYUU} onChange={(v) => up(i, { riyuu: v })} />
            </div>); })}
          <Go disabled={!L.length || !L.every(taijouOk)} onClick={() => go('taishoku')}>{L.length ? `${L.length}名で次へ →` : '名前を選んでね'}</Go>
        </div>}
      </>);
    }
    if (s === 'taishoku') {
      const L = taisha || [], up = (i: number, patch: Partial<TS>) => setTaisha(L.map((t, j) => (j === i ? { ...t, ...patch } : t)));
      const free = ROSTER.filter((r) => !L.some((t) => t.id === r.id)), outIds = (taijou || []).map((t) => t.id);
      return (<>
        <Q tag="退職＝会社を辞める" q={'会社を辞める人は\nいる？'} hint={<><b>会社を辞める人</b>です。現場を出るだけで会社に残る人は、前の「退場」です</>} />
        <div className="mt-4 grid grid-cols-2 gap-2.5"><Big t="いない" s="次へ進む" onClick={() => { setTaisha(null); afterTaisha(); }} /><Big t="いる" s="名前と会社の最終日を入れる" on={taisha !== null} onClick={() => setTaisha(L)} /></div>
        {taisha !== null && <div className="mo-fade-in">
          <Sel label="名前（退場に入れた人が先に出ます）" value="" opts={[...free.filter((r) => outIds.includes(r.id)), ...free.filter((r) => !outIds.includes(r.id))].map((r) => r.id)} lab={(id) => `${ROSTER.find((r) => r.id === id)!.name}${outIds.includes(id) ? '（退場に入れた人）' : ''}`} onChange={(id) => { const r = ROSTER.find((x) => x.id === id); if (r) setTaisha([...L, { ...r, date: (taijou || []).find((t) => t.id === id)?.date || '', honnin: '本人都合', riyuu: '' }]); }} />
          {L.map((t, i) => (
            <div key={t.id} className="mo-fade-up mt-3 rounded-xl border border-line px-4 py-3">
              <div className="flex items-center"><b className="text-body"><PersonName name={t.name} className="underline-offset-2 hover:underline" /> さん</b><small className="ml-2 text-muted">{t.shozoku}・{t.kubun}</small><button aria-label="外す" onClick={() => setTaisha(L.filter((_, j) => j !== i))} className="ml-auto text-faint"><X size={16} /></button></div>
              <Sel label="退職日（会社の最終日）" value={t.date} opts={END_DATES} lab={md} onChange={(v) => up(i, { date: v })} />
              <p className="mt-2.5 text-sm font-semibold text-muted">区分</p><div className="mt-1"><Seg opts={[['本人都合', '本人都合'], ['会社都合', '会社都合']]} value={t.honnin} onPick={(v) => up(i, { honnin: v as TS['honnin'] })} /></div>
              <Sel label="理由" value={t.riyuu} opts={RIYUU} onChange={(v) => up(i, { riyuu: v })} />
            </div>))}
          <p className="mt-2 rounded-[10px] px-3 py-2 text-sm" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>退職者欄に載せた人は<b>退社が確定</b>します（日報が正）。名簿の退社と、営業リストの「稼働中」も外します。</p>
          <Go disabled={!L.length || !L.every((t) => t.date)} onClick={afterTaisha}>{L.length ? `${L.length}名で次へ →` : '名前を選んでね'}</Go>
        </div>}
      </>);
    }
    if (s === 'jitai') {
      const L = jitai || [];
      return (<>
        <Q tag="内定辞退" q={'内定辞退は\nいる？'} hint="入場前の人だけ選べます。プロパーリストの「辞退」にチェックを付け、入社手続きの一覧からも外します。成約として日報②に書いた行があれば空にします" />
        <div className="mt-4 grid grid-cols-2 gap-2.5"><Big t="いない" s="次へ進む" onClick={() => { setJitai(null); go('katsudo'); }} /><Big t="いる" s="名前を選ぶ" on={jitai !== null} onClick={() => setJitai(L)} /></div>
        {jitai !== null && <div className="mo-fade-in">
          <Sel label="名前（営業中の人から）" value="" opts={JITAI.filter((r) => !L.some((t) => t.id === r.id)).map((r) => r.id)} lab={(id) => JITAI.find((r) => r.id === id)!.name} onChange={(id) => { const r = JITAI.find((x) => x.id === id); if (r) setJitai([...L, { ...r, how: '' }]); }} />
          {L.map((t, i) => (
            <div key={t.id} className="mo-fade-up mt-3 rounded-xl border border-line px-4 py-3">
              <div className="flex items-center"><b className="text-body"><PersonName name={t.name} className="underline-offset-2 hover:underline" /> さん</b><small className="ml-2 text-muted">担当 {t.tantou}{t.kettei ? '・参画決定ずみ' : ''}</small><button aria-label="外す" onClick={() => setJitai(L.filter((_, j) => j !== i))} className="ml-auto text-faint"><X size={16} /></button></div>
              <div className="mt-2"><Seg opts={[['renraku', '連絡があって辞退'], ['tobi', '飛んだ（連絡なし）']]} value={t.how} onPick={(v) => setJitai(L.map((x, j) => (j === i ? { ...x, how: v as JT['how'] } : x)))} /></div>
              <p className="mt-2 text-sm text-muted">→ プロパーリストの「辞退」にチェック{t.kettei ? '・入社手続きの一覧から外す・日報②の成約の行を空に' : ''}{t.how === 'tobi' && <b>・従業員名簿に「飛び」の印</b>}</p>
            </div>))}
          <Go disabled={!L.length || !L.every((t) => t.how)} onClick={() => go('katsudo')}>{!L.length ? '名前を選んでね' : L.every((t) => t.how) ? `${L.length}名で次へ →` : '辞退か飛んだかを選んでね'}</Go>
        </div>}
      </>);
    }
    if (s === 'katsudo') return (<>
      <Q tag={`${md(TODAY)} の数字`} q="今日の数字は？" hint="組シートの自分の表に書きます。契約数・新規入社数・再アサイン数は成約の回答から決まります" />
      <div className="mt-4 grid grid-cols-2 gap-2.5">{ACT_ITEMS.map((it, i) => it.auto
        ? <div key={it.label} className="rounded-xl bg-soft px-4 py-3"><small className="block text-sm text-muted">{it.label}</small><b className="num text-xl">{autoCount(it.label)}</b><small className="block text-xs text-faint">成約の回答から自動</small></div>
        : <div key={it.label} className="mo-fade-up rounded-xl border border-line px-4 py-3" style={{ ['--i' as string]: i }}><small className="block text-sm text-muted">{it.label}</small>
            <div className="mt-1 flex items-center gap-2"><button aria-label={`${it.label}を減らす`} onClick={() => setAct((a) => ({ ...a, [it.label]: Math.max(0, (a[it.label] ?? it.current ?? 0) - 1) }))} className="size-9 rounded-[10px] border border-field text-md">−</button>
              <b className="num min-w-8 text-center text-xl">{act[it.label] ?? it.current ?? 0}</b>
              <button aria-label={`${it.label}を増やす`} onClick={() => setAct((a) => ({ ...a, [it.label]: Math.min(9999, (a[it.label] ?? it.current ?? 0) + 1) }))} className="size-9 rounded-[10px] border border-field text-md">＋</button></div></div>)}</div>
      <Go onClick={() => go('confirm')}>確認へ →</Go>
    </>);
    if (s === 'confirm') {
      const hole = picked.filter((x) => !x.nyuujou || !uri(x)).length, TJ = taijou || [], TS = taisha || [], JT = jitai || [];
      const lines = picked.flatMap((x) => { const c = coOf(x)!, out: string[] = [];
        if (c.kind !== '登録ずみの会社') out.push(`会社の条件をはじめて登録：${c.name}`);
        if (Object.keys(x.coSet).length) out.push(`会社の条件に足す：${c.name}（${Object.keys(x.coSet).map((k) => CO_FIELDS.find((f) => f.key === k)!.label).join('・')}）`);
        if (Object.keys(x.siteSet).length) out.push(`現場の条件に足す：${x.site}（${Object.keys(x.siteSet).map((k) => SITE_FIELDS.find((f) => f.key === k)!.label).join('・')}）`);
        if (Object.keys(x.cond).length) out.push(`${x.name} さんだけ違う条件：${Object.entries(x.cond).map(([k, v]) => `${SITE_FIELDS.find((f) => f.key === k)!.label}＝${v}`).join('・')}`);
        if (x.rate) out.push(`${x.name} さんの単価が入場から${x.rate.days}日後に ${yen(x.rate.after)}円（${x.rate.scope === 'site' ? 'この現場の決まり' : 'この人だけ'}）`);
        return out; });
      const kettei = picked.filter((x) => x.addKettei).map((x) => x.name), cells = n + (keiken ? 0 : ACT_ITEMS.length) + TJ.length + TS.length;
      return (<>
        <Q tag="さいごの確認" q={'これで\n日報に書くよ'} />
        {n ? <div className="mt-3 flex flex-col gap-2">{picked.map((x) => (
          <div key={x.id} className="rounded-xl border border-line px-4 py-3 text-sm leading-relaxed"><b className="text-body"><PersonName name={x.name} className="underline-offset-2 hover:underline" /></b><Badge st={x.status} />
            <p>所属 <b>{x.tenseki ? `${x.shozoku} → ${x.tenseki}` : x.shozoku}</b>　上位 <b>{x.co}</b>　現場 <b>{x.site}</b></p>
            <p>入場日 {x.nyuujou ? <b>{md(x.nyuujou)}</b> : <b style={{ color: 'var(--tone-warn-fg)' }}>未定</b>}　売上 {uri(x) ? <b>{yen(uri(x))}円（{UNIT[x.unit].label}）</b> : <b style={{ color: 'var(--tone-warn-fg)' }}>未定</b>}</p>
            {!keiken && <p>勤務の形 {kinmuOk(x) ? <><b>{kinmuText(x)}</b>（名簿の勤務区分へ）</> : <span style={{ color: 'var(--tone-warn-fg)' }}>未定（名簿はそのまま）</span>}</p>}
          </div>))}</div> : <p className="mt-3 text-sm text-muted">今日の成約：なし</p>}
        {n > 0 && <><p className="mt-4 text-sm font-semibold text-muted">① 日報②「契約実績(26/10月)【プロパー】」に足す行（今の並びのまま・横にスクロール）</p>
          <Tbl head={COLS} rows={picked.map((x) => [x.name, x.co, x.tenseki || x.shozoku, me, me, x.nyuujou ? +x.nyuujou.slice(5, 7) : '未定', x.nyuujou ? +x.nyuujou.slice(8, 10) : '未定', uri(x) ? `${yen(uri(x))}円` : '未定', '', '', x.status, md(TODAY)])} />
          <p className="mt-1 text-xs text-faint">特別粗利・特別還元は空欄のまま書きます{hole ? `。未定が${hole}名：明日からアラートで聞きます` : ''}</p></>}
        {!keiken && <><p className="mt-4 text-sm font-semibold text-muted">② 今日の数字（組シートの自分の表・{md(TODAY)} の列）</p><Tbl head={[me, md(TODAY)]} rows={ACT_ITEMS.map((it) => [it.label, it.auto ? autoCount(it.label) : act[it.label] ?? it.current ?? 0])} /><p className="mt-1 text-xs text-faint">契約数は、今日出した成約の人数と同じになります</p></>}
        <p className="mt-4 text-sm font-semibold text-muted">③ 退場＝現場を出る（終了者タブのプロパー欄）</p>
        {TJ.length ? <Tbl head={['終了者', '所属', '区分', '担当', '終了日', 'ｽｷﾙｼｰﾄ更新', 'ヒアリング', '再営業', '備考']} rows={TJ.map((t) => [t.name, t.shozoku, t.kubun, me, md(t.date), ...TAIJOU_CHK.map(([k]) => (t.chk[k] ? 'TRUE' : 'FALSE')), [t.riyuu, within1m(t) !== false && (t.seikyu === 'する' || t.seikyu === 'しない') ? `1ヶ月以内・請求${t.seikyu}` : '', needUntil(t) ? `請求は${md(untilOf(t))}まで` : ''].filter(Boolean).join('／')])} /> : <p className="text-sm text-faint">なし</p>}
        <p className="mt-4 text-sm font-semibold text-muted">④ 退職＝会社を辞める（終了者タブの退職者欄）</p>
        {TS.length ? <Tbl head={['退職者', '所属', '要員区分', '担当', '退職日', '区分', '理由']} rows={TS.map((t) => [t.name, t.shozoku, t.kubun, me, md(t.date), t.honnin, t.riyuu])} /> : <p className="text-sm text-faint">なし</p>}
        {!keiken && <><p className="mt-4 text-sm font-semibold text-muted">⑤ 内定辞退・入場前に飛んだ人（プロパーリストの辞退にチェック）</p><p className="text-sm">{JT.length ? JT.map((t) => <span key={t.id} className="block"><b><PersonName name={t.name} className="underline-offset-2 hover:underline" /></b>：{t.how === 'tobi' ? '飛んだ（名簿に「飛び」の印）' : '連絡があって辞退'}</span>) : <span className="text-faint">なし</span>}</p></>}
        <div className="mt-4 rounded-xl bg-soft px-4 py-3 text-sm leading-relaxed"><b className="text-ok">書き込み先 OK（{cells}か所）</b>
          {lines.map((l) => <span key={l} className="block">{l}</span>)}
          {kettei.length > 0 && <span className="block">プロパーリストの参画決定：<b>{kettei.join('、')}</b> にチェックを付けます</span>}
          {picked.some((x) => !keiken && kinmuOk(x)) && <span className="block">従業員名簿の勤務区分：{picked.filter(kinmuOk).map((x) => `${x.name} → ${kinmuText(x)}`).join('、')}</span>}
        </div>
        <Go disabled={!canEdit || submitted} title={!canEdit ? noEdit : undefined} onClick={send}>日報に書く</Go>
      </>);
    }
    // finish
    const month = SELF.month + n, goal = SELF.goal, R = 32, C = 2 * Math.PI * R, top = Math.max(1, n, SELF.lastWeekAvg);
    const plus = picked.reduce((a, x) => { const g = GAKUMEN[x.id]; const u = uri(x); return { u: a.u + u, g: a.g + (g && u ? u - g.gakumen - g.gakumen * SHAHO - g.fare : 0), noPrice: a.noPrice + (u ? 0 : 1) }; }, { u: 0, g: 0, noPrice: 0 });
    const plU = SELF.uriage + plus.u, plG = SELF.gross + plus.g, TJ = taijou || [], TS = taisha || [];
    return (<div className="flex flex-col items-center text-center">
      {n ? <><div className="mo-celebrate rounded-2xl px-6 py-2 text-3xl font-black" style={{ background: 'var(--al)', color: 'var(--ad)' }}>成約!</div><p className="mt-3 text-3xl font-bold"><CountUp to={total} /><small className="text-md"> 円</small></p><p className="text-sm text-muted">{n}名ぶんを日報②に書きました</p></>
        : <><div className="mo-spring-in rounded-2xl px-6 py-2 text-2xl font-black" style={{ background: 'var(--al)', color: 'var(--ad)' }}>おつかれ</div><p className="mt-3 text-sm text-muted">今日の日報を書きました。また明日！</p></>}
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">{[n ? '契約実績' : '', keiken ? '' : '組シート', TJ.length || TS.length ? '終了者' : ''].filter(Boolean).map((l, i) => <span key={l} className="chip mo-fade-up" style={{ ['--i' as string]: i + 4, background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>✓ {l}</span>)}</div>
      <p className="mt-1 text-xs text-faint">書いたあと日報②を読み直して確かめました</p>
      {(TJ.length > 0 || TS.length > 0) && <div className="mt-3 w-full rounded-xl border border-line px-4 py-3 text-left text-sm"><b>名簿への反映</b>
        {TJ.map((t) => <span key={`j${t.id}`} className="block"><b><PersonName name={t.name} className="underline-offset-2 hover:underline" /></b>：退場日 {md(t.date)} を登録{t.kubun === '未経験' ? '（退場日の翌朝に、待機＋再アサインが自動で付きます）' : '（プロパーリストに居ない人なので、待機は自動では付けません）'}</span>)}
        {TS.map((t) => <span key={`s${t.id}`} className="block"><b><PersonName name={t.name} className="underline-offset-2 hover:underline" /></b>：{t.date > TODAY ? `退社の予約 ${md(t.date)}（当日に自動で退社）` : '退社 ✓'}／営業リストの稼働中を外します</span>)}</div>}
      <div className="mt-3 w-full rounded-xl border border-line px-4 py-3 text-left"><b className="text-body">今月の自分</b>
        <div className="mt-2 flex items-center gap-3"><svg width="72" height="72" viewBox="0 0 72 72" aria-hidden><circle cx="36" cy="36" r={R} fill="none" stroke="var(--color-track)" strokeWidth="7" /><circle cx="36" cy="36" r={R} fill="none" stroke="var(--a)" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, month / goal))} transform="rotate(-90 36 36)" style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)' }} /></svg>
          <div><b className="num text-xl">{month}</b> / {goal} 件<small className="block text-xs text-muted">今月の成約（組シートの目標）</small></div></div>
        {[['今日', n], ['先週の1日平均', SELF.lastWeekAvg]].map(([l, v]) => <div key={l} className="mt-2 flex items-center gap-2 text-sm"><span className="w-24 text-muted">{l}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-sunken"><i className="mo-bar block h-full rounded-full" style={{ width: `${(Number(v) / top) * 100}%`, background: l === '今日' ? 'var(--a)' : 'var(--color-faint)' }} /></div><b className="num w-8 text-right">{v}</b></div>)}
        {!keiken && <><div className="mt-3 flex justify-between text-body"><span>契約単価の合計</span><b>{man(plU)}</b></div><div className="flex justify-between text-body"><span>粗利（{Math.round((plG / plU) * 1000) / 10}%）</span><b>{man(plG)}</b></div>
          <small className="block text-xs text-faint">社保19%・実際の交通費で計算{plus.noPrice ? `。単価が空の成約 ${plus.noPrice}件は入っていません` : ''}</small></>}
      </div>
      <a href={`https://award.tabelog.com/hyakumeiten/${FOODS.find(([f]) => f === food)![1]}`} target="_blank" rel="noopener noreferrer" className="mt-3 flex w-full items-center gap-3 rounded-xl border border-line px-4 py-3 text-left hover:bg-soft"><span className="flex-1"><small className="block text-xs text-muted">今日もおつかれさま。ごほうびにどう？</small><b className="text-body">食べログ {food} 百名店</b></span><ExternalLink size={16} /></a>
      <Go onClick={() => reset('home')}>ホームへ</Go>
    </div>);
  })();

  return (
    <main className="flex flex-col gap-3.5 px-4 pb-12 pt-[22px] sm:px-6">
      <style>{`.nip-k span{display:inline-block;animation:nip-drop .5s cubic-bezier(.34,1.56,.64,1) both}
        @keyframes nip-drop{from{opacity:0;transform:translateY(-22px) scale(1.3)}to{opacity:1;transform:none}}
        @keyframes nip-fall{from{transform:translateY(-12vh) rotate(0)}to{transform:translateY(112vh) rotate(720deg)}}
        @keyframes nip-rays{to{transform:rotate(360deg)}}
        @media (prefers-reduced-motion:reduce){.nip-k span,.nip-fx *{animation:none!important}}`}</style>
      <PageTitle title="成約日報" sub={`${live ? md(TODAY) : NOW_LABEL} ・ 1問ずつ答える（今の社内システムの成約日報と同じ流れ）${live ? '' : '・見本データ'}`}>
        <label className="flex items-center gap-2 text-sm text-muted">出す人
          <select aria-label="出す人" value={me} onChange={(e) => { setMe(e.target.value); setAsked(true); }} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-body text-ink">{(REPS.includes(me) ? REPS : [me, ...REPS]).map((s) => <option key={s}>{s}</option>)}</select>
        </label>
      </PageTitle>
      <div className="mx-auto w-full max-w-[560px]"><LiveBanner state={ni.live && !L0 ? 'error' : ni.state} error={ni.error || (ni.data && !ni.data.ok ? ni.data.error : '')} onReload={ni.reload} note={`今の成約日報の中身（今日の参画決定 ${Lv?.kettei.length ?? 0}人・組シートの項目）。答えるところまでは動きますが、日報②には書きません`} /></div>
      <div className="mx-auto w-full max-w-[560px]"><MikeikenNote mk={mk} live={ni.live} /></div>
      {must && <div className="mo-fade-in mx-auto w-full max-w-[560px] rounded-xl px-4 py-2.5 text-sm" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}><b>18時を過ぎました。今日の日報を出すまで、ほかの画面は開けません</b><span className="mt-0.5 block text-xs opacity-90">平日18時以降、組シートに名前がある営業は、出すまでどの画面を開いてもこの日報に戻ります（見本ではこの帯だけ）。</span></div>}
      {!must && !submitted && <p className="mx-auto w-full max-w-[560px] text-xs text-faint">{me} さんは組シートに名前がないので、18時の締め（出すまで移れない）の対象外です。</p>}
      <section className="mx-auto w-full max-w-[560px] overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2">
          <button aria-label="ひとつ戻る" onClick={back} disabled={!hist.length || cur.s === 'finish'} className="grid size-8 place-items-center rounded-full disabled:opacity-0"><ArrowLeft size={16} /></button>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken"><i className="block h-full rounded-full" style={{ width: `${prog * 100}%`, background: 'var(--a)', transition: 'width 500ms cubic-bezier(.22,1,.36,1)' }} /></div>
        </div>
        <div key={`${cur.s}-${cur.i}`} className="mo-axis px-5 pb-6 pt-5">{screen}</div>
      </section>
      <p className="mx-auto w-full max-w-[560px] text-xs text-faint">退場・退職・1ヶ月以内の請求の扱いは、最終判断は社労士・税理士・法務に確認してください。見本データだけで動きます（日報②・名簿には書きません）。</p>
      {celeb > 0 && <div role="dialog" aria-label="成約のお祝い" onClick={() => setCeleb(0)} className="nip-fx fixed inset-0 z-[70] grid cursor-pointer place-items-center overflow-hidden" style={{ background: 'color-mix(in srgb, var(--ad) 90%, transparent)' }}>
        <div className="absolute left-1/2 top-1/2 size-[160vmax] -translate-x-1/2 -translate-y-1/2 opacity-25" style={{ background: 'repeating-conic-gradient(var(--al) 0 8deg, transparent 8deg 24deg)', animation: 'nip-rays 9s linear infinite' }} />
        {confetti.map((c, i) => <i key={i} className="absolute top-0 block rounded-[2px]" style={{ left: `${c.l}%`, width: c.s, height: c.s * 0.5, background: c.c, animation: `nip-fall ${c.t}s ${c.d}s ease-in both` }} />)}
        <div className="relative text-center text-white"><small className="text-body">{me} さん</small><h2 className="mt-1 text-[44px] font-black"><Kin t={`成約 ${n}件！`} /></h2><p className="text-xl font-bold"><Kin t="おめでとう！！" /></p></div>
      </div>}
    </main>
  );
}
