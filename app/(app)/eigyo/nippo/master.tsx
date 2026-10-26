'use client';

// 成約日報（本物）の「上位会社は？」「現場は？」。今の /nippo.html と同じ口・同じ決まり（10-26）
//   ・会社の候補＝GET /api/nippo?action=masters（会社マスタ ∪ ミンミカの取引先 ∪ 稼働管理の上位）。選ぶと ?co= でカード（会社・現場の条件）を読む
//   ・空欄の必須項目だけ聞く（埋まっている項目は「直す」で開く）。ミンミカの値は候補として出すだけで、選ぶまで埋まった扱いにしない
//   ・答えるのは選ぶだけ（表記揺れを起こさない）。文字で打つのは新しい会社名・新しい現場名だけ。駅は候補から選ぶ
//   ・送るのは変えた値だけ（set）。必須の判定はサーバ（api/_nippo_master.ts planMaster）も同じ決まりでやる＝ここは前もって知らせるだけ
//   ★請求まわりの仕様は変えない：項目・選択肢・値の形は今のサーバが返すカードのまま
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useIke } from '@/components/Live';

export type CardField = {
  key: string; label: string; kind: string; options?: [string, string][]; labels?: [string, string][]; help?: string;
  required: boolean; noMnm: boolean; own: unknown; dflt: unknown; dfltFrom: string; mnm: string; suggest: unknown; filled: boolean;
};
export type CoCard = {
  ok: boolean; error?: string;
  co: { key: string; name: string; exists: boolean; mnmKnown: boolean; card: CardField[]; missing: string[] };
  sites: { site: string; name: string; eki: string; card: CardField[]; people: string[]; missing: string[]; hasRateRule: boolean }[];
  newSiteCard: CardField[];
};
export type CoList = { ok: boolean; error?: string; companies: { key: string; name: string; ikedon: boolean; mnm: boolean; roster: boolean }[] };
/** 1人ぶんの「会社・現場」の答え（今の nippo.html の p.m と同じ形にして送る） */
export type MasterAns = { coName: string; coIsNew: boolean; coSet: Record<string, unknown>; siteName: string; siteIsNew: boolean; siteSet: Record<string, unknown>; same: boolean | null; cond: Record<string, unknown> };
export const EMPTY_ANS: MasterAns = { coName: '', coIsNew: false, coSet: {}, siteName: '', siteIsNew: false, siteSet: {}, same: null, cond: {} };

const PAY_CLOSE: [string, string][] = [['末', '月末'], ['10', '10日'], ['15', '15日'], ['20', '20日'], ['25', '25日']];
const PAY_MONTH: [string, string][] = [['1', '翌月'], ['2', '翌々月'], ['3', '翌々々月']];
const PAY_DAY: [string, string][] = [['末', '末'], ['5', '5日'], ['10', '10日'], ['15', '15日'], ['20', '20日'], ['25', '25日']];
const SETTLE_METHODS = ['上下割', '中間割', '所定割', '固定', '時給制', '日給制', 'その他'];
const TIME_UNITS = ['1分', '5分', '10分', '15分', '30分', '60分', 'なし'];
const NEEDS_UNIT = ['上下割', '中間割', 'その他'];
const COMMUTE: [string, string][] = [['none', 'なし'], ['actual', '実費'], ['pass', '定期代'], ['capped', '上限あり']];
const HOURS = Array.from({ length: 25 }, (_, i) => String(100 + i * 5));
const CAPS = Array.from({ length: 20 }, (_, i) => String((i + 1) * 5000));
const yen = (n: number) => n.toLocaleString('ja-JP');

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
function payParse(v: unknown): Obj {
  if (isObj(v)) return v;
  const m = /^(月末|(\d+)日)締め(翌々々|翌々|翌)月(末|(\d+)日)払い$/.exec(String(v || ''));
  return m ? { close: m[2] || '末', month: String(({ 翌: 1, 翌々: 2, 翌々々: 3 } as Record<string, number>)[m[3]]), day: m[5] || '末' } : {};
}
const payText = (p: Obj) => `${p.close === '末' ? '月末' : `${p.close}日`}締め${['', '翌', '翌々', '翌々々'][+String(p.month)]}月${p.day === '末' ? '末' : `${p.day}日`}払い`;
/** 埋まっているか（今の nippo.html filledV と同じ決まり） */
export function filledV(kind: string, v: unknown): boolean {
  if (v == null) return false;
  if (kind === 'pay_site') { if (typeof v === 'string') return v.trim() !== ''; const p = v as Obj; return !!p.close && !!p.month && !!p.day; }
  if (kind === 'settle') { const s = v as Obj; return !!s.method && (!NEEDS_UNIT.includes(String(s.method)) || !!s.timeUnit); }
  if (kind === 'commute') { const c = v as Obj; return !!c.kind && (c.kind !== 'capped' || Number(c.cap) > 0); }
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return String(v).trim() !== '';
}
const cur = (f: CardField, set: Obj) => (f.key in set ? set[f.key] : f.own != null ? f.own : f.dflt);
/** まだ空いている必須項目（ラベル） */
export const missingIn = (card: CardField[], set: Obj) => card.filter((f) => f.required && f.kind !== 'rates' && !filledV(f.kind, cur(f, set))).map((f) => f.label);
function showVal(f: CardField, v: unknown): string {
  if (v == null) return '';
  if (f.kind === 'pay_site') return typeof v === 'string' ? v : payText(v as Obj);
  if (f.options || f.labels) { const o = (f.labels || f.options || []).find((x) => x[0] === v); if (o) return o[1]; }
  if (f.kind === 'settle') { const s = v as Obj; return [s.method, s.timeUnit].filter(Boolean).join('・'); }
  if (f.kind === 'commute') { const c = v as Obj; return `${COMMUTE.concat([['yes', 'あり']]).find((x) => x[0] === c.kind)?.[1] ?? ''}${c.cap ? `（上限 ${yen(Number(c.cap))}円）` : ''}`; }
  if (typeof v === 'object') return Object.keys(v as object).length ? '入力ずみ' : '';
  return String(v);
}

const onStyle = { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' };
const sgStyle = { borderStyle: 'dashed', borderColor: 'var(--a)' } as const;
function Opts({ opts, value, sg, onPick }: { opts: [string, string][]; value: unknown; sg?: unknown; onPick: (v: string) => void }) {
  return <div className="mt-1 flex flex-wrap gap-1.5">{opts.map(([v, l]) => <button type="button" key={v} onClick={() => onPick(v)} className="min-h-9 rounded-full border border-line px-3 text-body" style={value === v ? onStyle : sg === v ? sgStyle : undefined}>{l}</button>)}</div>;
}
function Picks({ label, opts, value, onChange }: { label: string; opts: string[]; value: unknown; onChange: (v: string) => void }) {
  return <label className="mt-1.5 flex flex-col gap-0.5 text-xs text-muted">{label}<select value={value == null ? '' : String(value)} onChange={(e) => onChange(e.target.value)} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-body text-ink"><option value="">えらぶ</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>;
}

/** 駅は候補から選ぶだけ（今の /api/keihi?action=stations）。打った文字は保存しない */
function StationPick({ value, onPick }: { value: unknown; onPick: (v: string) => void }) {
  const [q, setQ] = useState(''), [list, setList] = useState<{ name: string; pref?: string }[] | null>(null);
  useEffect(() => {
    const k = q.normalize('NFKC').replace(/\s+/g, '').replace(/駅$/, '');
    if (!k) { setList(null); return; }
    const t = setTimeout(() => {
      fetch(`/api/ike/keihi?action=stations&q=${encodeURIComponent(k)}`, { cache: 'no-store' }).then((r) => r.json()).then((d) => setList((d.stations || []).slice(0, 8))).catch(() => setList([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (<>
    {value ? <small className="mt-1 block text-xs text-muted">いまの駅：<b>{String(value)}</b>（違えば下で選び直す）</small> : null}
    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="駅名の最初の数文字（例：品川）" autoComplete="off" className="mt-1 min-h-9 w-full rounded-[10px] border border-field bg-surface px-2.5 text-body" />
    {list && <div className="mt-1 flex flex-wrap gap-1.5">{list.length ? list.map((s) => <button type="button" key={s.name + (s.pref || '')} onClick={() => { onPick(`${s.name}駅`); setQ(''); }} className="rounded-full border border-line px-3 py-1 text-sm">{s.name}駅<small className="ml-1 text-faint">{s.pref}</small></button>) : <small className="text-faint">候補がありません（漢字で入れてみてください）</small>}</div>}
  </>);
}

/** 条件の入力欄（fields＝出す項目。set＝変えた値。送るのは set だけ） */
export function MasterForm({ fields, set, onSet, noSuggest }: { fields: CardField[]; set: Obj; onSet: (s: Obj) => void; noSuggest?: boolean }) {
  const put = (k: string, v: unknown) => onSet({ ...set, [k]: v });
  const sub = (f: CardField, k: string, v: unknown) => { const b = cur(f, set); const o: Obj = f.kind === 'pay_site' ? { ...payParse(b) } : isObj(b) ? { ...b } : {}; if (v === '' || v == null) delete o[k]; else o[k] = v; if (k === 'method' && (v === '固定' || v === '日給制')) { delete o.timeUnit; delete o.lower; delete o.upper; } put(f.key, o); };
  return (
    <div className="mt-2 flex flex-col gap-2">
      {fields.filter((f) => f.kind !== 'rates' && f.kind !== 'text' && f.kind !== 'route_detail').map((f) => {
        const v = cur(f, set), ok = !f.required || filledV(f.kind, v), sg = noSuggest ? undefined : f.suggest, sgo = isObj(sg) ? sg : {};
        let body: React.ReactNode = null;
        if (f.kind === 'enum') body = <Opts opts={f.options || []} value={v} sg={sg} onPick={(x) => put(f.key, set[f.key] === x && !f.required ? '' : x)} />;
        else if (f.kind === 'pay_site') { const p = payParse(v); body = <><small className="mt-1 block text-xs text-muted">締め日</small><Opts opts={PAY_CLOSE} value={p.close} sg={sgo.close} onPick={(x) => sub(f, 'close', x)} /><small className="mt-1 block text-xs text-muted">支払い</small><Opts opts={PAY_MONTH} value={p.month} sg={sgo.month} onPick={(x) => sub(f, 'month', x)} /><Opts opts={PAY_DAY} value={p.day} sg={sgo.day} onPick={(x) => sub(f, 'day', x)} />{filledV('pay_site', p) && <small className="mt-1 block text-sm">→ <b>{payText(p)}</b></small>}</>; }
        else if (f.kind === 'settle') { const s = (isObj(v) ? v : {}) as Obj; body = <><Opts opts={SETTLE_METHODS.map((x) => [x, x])} value={s.method} sg={sgo.method} onPick={(x) => sub(f, 'method', x)} />
          {!!s.method && s.method !== '固定' && s.method !== '日給制' && <><small className="mt-1 block text-xs text-muted">精算の単位{s.method === '時給制' ? '（任意）' : ''}</small><Opts opts={TIME_UNITS.map((x) => [x, x])} value={s.timeUnit} sg={sgo.timeUnit} onPick={(x) => sub(f, 'timeUnit', x)} /></>}
          {(s.method === '上下割' || s.method === '中間割') && <div className="grid grid-cols-2 gap-2"><Picks label="下限（h）" opts={HOURS} value={s.lower} onChange={(x) => sub(f, 'lower', x ? +x : '')} /><Picks label="上限（h）" opts={HOURS} value={s.upper} onChange={(x) => sub(f, 'upper', x ? +x : '')} /></div>}</>; }
        else if (f.kind === 'commute') { const c = (isObj(v) ? v : {}) as Obj; body = <><Opts opts={COMMUTE} value={c.kind} onPick={(x) => sub(f, 'kind', x)} />
          {c.kind === 'capped' && <Picks label="上限（円）" opts={CAPS} value={c.cap} onChange={(x) => sub(f, 'cap', x ? +x : '')} />}
          {!!c.kind && c.kind !== 'none' && <><small className="mt-1 block text-xs text-muted">請求書に載せる？</small><Opts opts={[['yes', '載せる'], ['no', '載せない']]} value={c.onInvoice} onPick={(x) => sub(f, 'onInvoice', x)} /></>}</>; }
        else if (f.kind === 'station') body = <StationPick value={v} onPick={(x) => put(f.key, x)} />;
        else if (f.kind === 'send_docs') { const d = (isObj(v) ? v : {}) as Obj; body = <>{([['timesheet_copy', '勤務表の写し'], ['estimate', '見積書'], ['fare_detail', '交通費の明細']] as const).map(([k, l]) => <div key={k}><small className="mt-1 block text-xs text-muted">{l}</small><Opts opts={[['yes', '送る'], ['no', '送らない']]} value={d[k]} onPick={(x) => sub(f, k, x)} /></div>)}</>; }
        const useMnm = !noSuggest && f.suggest != null && !(f.key in set) && f.own == null;
        return (
          <div key={f.key} className="rounded-xl border px-3 py-2.5" style={{ borderColor: ok ? 'var(--color-line)' : 'var(--tone-warn-fg)' }}>
            <b className="text-sm">{f.label}{f.noMnm && <span className="ml-1.5 text-xs font-normal text-faint">ミンミカに無い</span>}{!f.required && <small className="ml-1.5 text-xs font-normal text-faint">任意</small>}</b>
            {f.help && <small className="mt-0.5 block text-xs leading-relaxed text-muted">{f.help}</small>}
            {body}
            {f.own == null && (f.dflt != null ? <small className="mt-1 block text-xs text-faint">{f.dfltFrom || '入っている値'}：{showVal(f, f.dflt)}（このままでよければ選ばなくてOK）</small>
              : f.mnm ? <small className="mt-1 block text-xs text-faint">ミンミカ：{f.mnm}{f.suggest != null ? '（点線が候補）' : ''}</small> : null)}
            {useMnm && <button type="button" className="mt-1 text-sm underline" style={{ color: 'var(--ad)' }} onClick={() => put(f.key, f.suggest)}>ミンミカの値で合ってる（{showVal(f, f.suggest)}）</button>}
          </div>
        );
      })}
    </div>
  );
}

/** 「上位会社は？」：候補から選ぶ（無ければ新しい会社名を打つ）→ 会社の条件の空欄だけ聞く */
export function LiveJoui({ ans, setAns, onNext }: { ans: MasterAns; setAns: (a: MasterAns) => void; onNext: () => void }) {
  const cl = useIke<CoList>('nippo?action=masters');
  const cc = useIke<CoCard>(ans.coName ? `nippo?action=masters&co=${encodeURIComponent(ans.coName)}` : null);
  const [newName, setNewName] = useState(''), [all, setAll] = useState(false);
  const card = cc.data?.ok ? cc.data : null;
  useEffect(() => { if (card) { const isNew = !card.co.exists; if (isNew !== ans.coIsNew) setAns({ ...ans, coIsNew: isNew }); } }, [card, ans, setAns]);
  const fields = card ? (all || !card.co.exists ? card.co.card : card.co.card.filter((f) => f.required && !f.filled)) : [];
  const miss = card ? missingIn(card.co.card, ans.coSet) : [];
  return (<>
    {cl.state === 'loading' && <p className="mt-3 text-sm text-muted">会社の候補を読み込み中…</p>}
    {cl.state === 'error' && <p className="mt-3 text-sm text-bad">{cl.error}</p>}
    {cl.data?.ok && <label className="mt-2.5 flex flex-col gap-1 text-sm font-semibold text-muted">上位会社
      <select value={ans.coName} onChange={(e) => setAns({ ...EMPTY_ANS, coName: e.target.value })} className="min-h-10 rounded-[10px] border border-field bg-surface px-2.5 text-body font-normal text-ink">
        <option value="">えらぶ</option>
        {ans.coName && !cl.data.companies.some((c) => c.name === ans.coName) && <option value={ans.coName}>{ans.coName}（新しい会社）</option>}
        {cl.data.companies.map((c) => <option key={c.key} value={c.name}>{c.name}{c.ikedon ? '' : c.mnm ? '（ミンミカの取引先）' : '（稼働管理の上位）'}</option>)}
      </select></label>}
    {cl.data?.ok && !ans.coName && <div className="mt-2 flex gap-2"><input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} placeholder="一覧に無いときだけ：新しい会社名" className="min-h-9 flex-1 rounded-[10px] border border-field bg-surface px-2.5 text-body" /><button type="button" disabled={!newName.trim()} onClick={() => { setAns({ ...EMPTY_ANS, coName: newName.trim() }); setNewName(''); }} className="btn-secondary btn-sm">この名前で</button></div>}
    {ans.coName && cc.state === 'loading' && <p className="mt-3 text-sm text-muted">会社の条件を読み込み中…</p>}
    {ans.coName && (cc.state === 'error' || cc.data?.ok === false) && <p className="mt-3 text-sm text-bad">{cc.error || cc.data?.error}</p>}
    {card && <div className="mo-fade-in mt-3">
      <span className="chip" style={card.co.exists ? { background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' } : { background: 'var(--tone-info-bg)', color: 'var(--tone-info-fg)' }}>{card.co.exists ? '登録ずみの会社' : card.co.mnmKnown ? 'ミンミカの取引先（はじめて登録）' : '新しい会社'}</span>
      <ul className="mt-2 grid gap-0.5 rounded-[10px] bg-soft px-3 py-2 text-sm">{card.co.card.filter((f) => f.filled).map((f) => <li key={f.key}>{f.label}：<b>{showVal(f, f.own ?? f.dflt)}</b></li>)}{!card.co.card.some((f) => f.filled) && <li className="text-faint">まだ何も入っていません</li>}</ul>
      {fields.length > 0 && <MasterForm fields={fields} set={ans.coSet} onSet={(s) => setAns({ ...ans, coSet: s })} />}
      {card.co.exists && !all && <button type="button" onClick={() => setAll(true)} className="mt-2 w-full py-1.5 text-sm text-muted underline-offset-2 hover:underline">会社の条件を直す</button>}
      {miss.length > 0 && <p className="mt-2 text-sm" style={{ color: 'var(--tone-warn-fg)' }}>まだ空いている：{miss.join('・')}</p>}
    </div>}
    <button onClick={onNext} disabled={!card || miss.length > 0} className="btn-primary mt-5 min-h-11 w-full">次へ →</button>
  </>);
}

/** 「現場は？」：その会社の現場から選ぶ（無ければ新しい現場名）→ 現場の条件の空欄・この人だけ違うところ */
export function LiveGenba({ ans, setAns, name, onNext }: { ans: MasterAns; setAns: (a: MasterAns) => void; name: string; onNext: () => void }) {
  const cc = useIke<CoCard>(ans.coName ? `nippo?action=masters&co=${encodeURIComponent(ans.coName)}` : null);
  const [newSite, setNewSite] = useState('');
  const card = cc.data?.ok ? cc.data : null;
  const ex = card?.sites.find((s) => s.name === ans.siteName) ?? null;
  const sc = ans.siteIsNew ? card?.newSiteCard ?? [] : ex?.card ?? [];
  const ask = ans.siteIsNew ? sc : sc.filter((f) => f.required && !f.filled);
  const miss = ans.siteName ? missingIn(sc, ans.siteSet) : ['現場'];
  if (ex && ans.same === null) miss.push('現場の決まりと同じか'); else if (ex && ans.same === false && !Object.keys(ans.cond).length) miss.push('違うところ');
  const pick = (patch: Partial<MasterAns>) => setAns({ ...ans, siteSet: {}, same: null, cond: {}, ...patch });
  return (<>
    {cc.state === 'loading' && <p className="mt-3 text-sm text-muted">現場を読み込み中…</p>}
    {(cc.state === 'error' || cc.data?.ok === false) && <p className="mt-3 text-sm text-bad">{cc.error || cc.data?.error}</p>}
    {card && <div className="mt-3 flex flex-col gap-2">
      {card.sites.map((x) => (
        <button key={x.site} onClick={() => pick({ siteName: x.name, siteIsNew: false })} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left" style={!ans.siteIsNew && ans.siteName === x.name ? onStyle : undefined}>
          <span className="grid size-9 place-items-center rounded-full bg-sunken text-body font-bold">{x.name[0]}</span>
          <span className="flex-1"><b className="text-body">{x.name}</b><small className="block text-xs text-muted">{x.eki && `${x.eki}　`}{x.missing.length ? <span style={{ color: 'var(--tone-warn-fg)' }}>空欄 {x.missing.length}</span> : '条件そろってる'}</small></span>
          {!ans.siteIsNew && ans.siteName === x.name && <Check size={18} />}
        </button>))}
      {!card.sites.length && <p className="rounded-xl bg-soft px-4 py-3 text-sm text-muted">この会社の現場はまだありません。下で新しい現場名を入れてください。</p>}
      <div className="flex gap-2"><input value={newSite} onChange={(e) => setNewSite(e.target.value)} maxLength={60} placeholder="一覧に無いときだけ：新しい現場名（例：◯◯駅 コールセンター）" className="min-h-9 flex-1 rounded-[10px] border border-field bg-surface px-2.5 text-body" />
        <button type="button" disabled={!newSite.trim()} onClick={() => { pick({ siteName: newSite.trim(), siteIsNew: true }); setNewSite(''); }} className="btn-secondary btn-sm">この名前で</button></div>
      {ans.siteIsNew && <p className="text-sm">新しい現場：<b>{ans.siteName}</b>（条件を全部選んでください）</p>}
    </div>}
    {card && ans.siteName && <div className="mo-fade-in mt-3">
      {ex && <ul className="grid gap-0.5 rounded-[10px] bg-soft px-3 py-2 text-sm">{ex.card.filter((f) => f.filled).map((f) => <li key={f.key}>{f.label}：<b>{showVal(f, f.own ?? f.dflt)}</b></li>)}</ul>}
      {ask.length > 0 && <MasterForm fields={ask} set={ans.siteSet} onSet={(s) => setAns({ ...ans, siteSet: s })} />}
      {ex && <div className="mt-3 rounded-[10px] border border-line-soft px-3 py-2 text-sm"><b>この現場にいま入っている人{ex.people.length ? `（${ex.people.length}名）` : ''}</b><small className="block text-muted">{ex.people.length ? ex.people.join('、') : 'まだ誰も入っていません'}</small></div>}
      {ex && <><p className="mt-3 text-sm font-semibold text-muted">{name} さんの条件は、この現場の決まりと同じ？</p>
        <Opts opts={[['1', '同じ'], ['0', '違うところがある']]} value={ans.same === null ? '' : ans.same ? '1' : '0'} onPick={(v) => setAns({ ...ans, same: v === '1', cond: {} })} />
        {ans.same === false && <><p className="mt-2 text-sm text-muted">この人だけ違うところを選んでください（現場の決まりは変えません）</p>
          <MasterForm fields={ex.card} set={{ ...Object.fromEntries(ex.card.map((f) => [f.key, f.own ?? f.dflt]).filter(([, v]) => v != null)), ...ans.siteSet, ...ans.cond }} noSuggest
            onSet={(s) => { const cond: Obj = {}; for (const [k, v] of Object.entries(s)) { const f = ex.card.find((x) => x.key === k); const base = k in ans.siteSet ? ans.siteSet[k] : f?.own ?? f?.dflt; if (JSON.stringify(v) !== JSON.stringify(base)) cond[k] = v; } setAns({ ...ans, cond }); }} /></>}</>}
      {miss.length > 0 && <p className="mt-2 text-sm" style={{ color: 'var(--tone-warn-fg)' }}>まだ空いている：{miss.join('・')}</p>}
    </div>}
    <button onClick={onNext} disabled={!card || miss.length > 0} className="btn-primary mt-5 min-h-11 w-full">次へ →</button>
  </>);
}
