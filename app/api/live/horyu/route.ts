// 保留（あとで決める）の画面の読み口（GET だけ）。?view=… ごとに、今の社内システムの「読むだけの口」を決め打ちで呼んで整える。
//   ・行き先は下の switch で固定（画面から口を選ばせない）。どれも今のシステムで GET かつ SELECT だけなのを確かめた口:
//       dash     … proxy?action=getDashboardData / proxy?action=getResponseReport / joined / joined?action=trend / member-left?action=list
//       nyuujou  … joined?action=nyuujou
//       story    … shoudaku-story?list=1 ／ story-person … shoudaku-story?name=（GET 以外は 405 の口）
//       narr     … analysis-narratives?action=runs / tree / hypotheses ／ narr-person … ?action=person
//                  ★この口は action で書く処理（extract など）にも入るので、ここで読む3つ＋person 以外は絶対に呼ばない
//       cohort   … cohort?kpi=1 ／ richmenu … richmenu-stats / richmenu-people ／ botab … admin?action=botAbQuestions / botAbResults
//       myact    … my-activity?action=today / week / goal（本人の分だけ） ／ office … office?action=state
//       links    … roster?op=linkboard ／ dropout … roster?op=crud&action=listDropout
//       orphans  … proxy?action=getOrphanGroups / getUnlinkedEngineers
//     ★joined?action=backfill（GET で書く）・member-left の handle/setMode・linkboard の do=sync は呼ばない
//   ・未経験の人だけ（lib/live/mikeiken-server.ts）。健康の欄・メールアドレスは返さない。単価は roleCan('price') の人だけ
//   ・権限の判定は今のシステム（ログインした人のトークン）。403 はその文をそのまま返す
import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { loadMikeikenSet } from '@/lib/live/mikeiken-server';
import { isMikeiken, MIKEIKEN_PATH, type MikeikenSet } from '@/lib/live/mikeiken';
import { matchGroupName, type EngineerRows } from '@/lib/live/eigyo-common';
import { ikeRole, roleCan } from '@/lib/live/role';
import type {
  BotAbRes, CohortRes, DashRes, DropoutRes, IvStat, JoinedBucket, LeftRow, LinksRes, MyActRes, NarrPerson, NarrRes, NyuujouRes,
  OfficeRes, OrphansRes, RichRes, Story, StoryList, StoryPerson, TrendMonth,
} from '@/lib/horyu';

export const maxDuration = 60;
type J = Record<string, unknown>;
class Http extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function get<T = J>(path: string, timeoutMs = 25000): Promise<T> {
  const r = await ikeFetch(path, undefined, timeoutMs);
  if (r.status === 401) throw new Http(401, 'ログインが切れました。もう一度ログインしてください');
  const j = (await r.json().catch(() => ({}))) as J;
  if (r.status === 403) throw new Http(403, String((j.error as string) || 'この画面はあなたのロールでは見られません（今の社内システムの権限）'));
  if (!r.ok) throw new Http(502, `今の社内システムから読めませんでした（${r.status}${j.error ? `・${String(j.error)}` : ''}）`);
  return j as T;
}
/** 1つ落ちても他は出す（ダッシュボード用） */
async function soft<T>(p: Promise<T>, errs: string[], what: string): Promise<T | null> {
  try { return await p; } catch (e) { if (e instanceof Http && e.status === 401) throw e; errs.push(`${what}：${(e as Error).message}`); return null; }
}
const s = (v: unknown) => String(v ?? '').trim();
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const nOrNull = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const arr = <T = J>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
const median = (xs: number[]) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return Math.round((a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2) * 10) / 10; };

// ---------------------------------------------------------------- dash
function bucketOf(b: J | undefined, mk: MikeikenSet): JoinedBucket {
  const names = arr<J>(b?.names).filter((x) => isMikeiken(mk, x.name)).map((x) => ({ name: s(x.name), decidedOn: s(x.decidedOn) }));
  return { label: s(b?.label), count: names.length, diff: s(b?.diff), names };
}
function ivOf(x: J | undefined): IvStat {
  return {
    total: n(x?.total), win: n(x?.win), decline: n(x?.decline), pass: n(x?.pass), ongoing: n(x?.ongoing), winRate: n(x?.winRate), declineRate: n(x?.declineRate),
    byRep: arr<J>(x?.byRep).map((r) => ({ rep: s(r.rep), total: n(r.total), win: n(r.win), decline: n(r.decline), winRate: n(r.winRate), declineRate: n(r.declineRate) })),
  };
}
const PRICE_BUCKETS = [['〜25万', 0, 25], ['25-30万', 25, 30], ['30-35万', 30, 35], ['35-40万', 35, 40], ['40-45万', 40, 45], ['45万〜', 45, 1e9]] as const;

async function dash(mk: MikeikenSet): Promise<DashRes> {
  const errs: string[] = [];
  const [d, rep, jo, tr, ml, role, showPrice] = await Promise.all([
    soft(get('/api/proxy?action=getDashboardData', 40000), errs, '稼働・案件・送信・面談'),
    soft(get('/api/proxy?action=getResponseReport', 40000), errs, '案件ごとの反応'),
    soft(get('/api/joined'), errs, '参画決定'),
    soft(get('/api/joined?action=trend&months=12'), errs, '月次推移'),
    soft(get('/api/member-left?action=list'), errs, '退会・ブロック'),
    ikeRole(), roleCan('price'),
  ]);
  if (d?.error) errs.push(`稼働・案件・送信・面談：${s(d.error)}`);

  // 稼働：今の名簿の稼働中から、未経験の人だけを数え直す（人数・担当別・所属別・単価の分布）
  let wf: DashRes['wf'] = null;
  const w = d?.workforce as J | undefined;
  if (w && !w.error) {
    const members = arr<J>(w.members).filter((m) => isMikeiken(mk, m.name))
      .map((m) => ({ name: s(m.name), rep: s(m.rep) || '(未設定)', end: s(m.end), priceMan: showPrice ? nOrNull(m.priceMan) : null }));
    const byRep = new Map<string, { rep: string; count: number; revenueMan: number }>();
    const byEnd = new Map<string, number>();
    let rev = 0, priced = 0;
    for (const m of members) {
      const b = byRep.get(m.rep) || { rep: m.rep, count: 0, revenueMan: 0 };
      b.count++; if (m.priceMan != null) { b.revenueMan += m.priceMan; rev += m.priceMan; priced++; }
      byRep.set(m.rep, b);
      if (m.end) byEnd.set(m.end, (byEnd.get(m.end) || 0) + 1);
    }
    wf = {
      count: members.length, newThisMonth: n(w.newThisMonth), showPrice,
      revenueMan: showPrice ? Math.round(rev * 10) / 10 : null, avgPriceMan: showPrice && priced ? Math.round((rev / priced) * 10) / 10 : null,
      byRep: [...byRep.values()].map((b) => ({ ...b, revenueMan: showPrice ? Math.round(b.revenueMan * 10) / 10 : null })).sort((a, b) => b.count - a.count),
      byEnd: [...byEnd].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, 12),
      priceBuckets: showPrice ? PRICE_BUCKETS.map(([key, lo, hi]) => ({ key, count: members.filter((m) => m.priceMan != null && m.priceMan >= lo && m.priceMan < hi).length })) : null,
      members, yotei: arr<J>(w.yotei).filter((m) => isMikeiken(mk, m.name)).map((m) => ({ name: s(m.name), rep: s(m.rep), end: s(m.end) })),
    };
  } else if (w?.error) errs.push(`稼働：${s(w.error)}`);

  const c = d?.cases as J | undefined;
  const cases: DashRes['cases'] = c && !c.error ? {
    total30: n(c.total30), total7: n(c.total7), prev30: n(c.prev30), priceAvg: n(c.priceAvg),
    trend: arr<J>(c.trend).map((x) => ({ date: s(x.date), count: n(x.count) })),
    byArea: arr<J>(c.byArea).map((x) => ({ key: s(x.key), count: n(x.count) })), byJob: arr<J>(c.byJob).map((x) => ({ key: s(x.key), count: n(x.count) })),
  } : null;
  const se = d?.send as J | undefined;
  const send: DashRes['send'] = se && !se.error ? {
    windows: Object.fromEntries(Object.entries((se.windows as Record<string, J>) || {}).map(([k, v]) => [k, { sends: n(v.sends), deliveries: n(v.deliveries), groups: n(v.groups), replyRate: n(v.replyRate), positiveRate: n(v.positiveRate) }])),
    okng: Object.fromEntries(Object.entries((se.okng as Record<string, J>) || {}).map(([k, v]) => [k, { deliveries: n(v.deliveries), ok: n(v.ok), ng: n(v.ng), undecided: n(v.undecided), okRate: n(v.okRate), ngRate: n(v.ngRate), unansweredRate: n(v.unansweredRate) }])),
    trend: arr<J>(se.trend).map((x) => ({ date: s(x.date), count: n(x.count) })),
  } : null;
  const ivp = (d?.interview as J | undefined)?.periods as Record<string, J> | undefined;
  const iv: DashRes['iv'] = ivp ? { thisMonth: ivOf(ivp.thisMonth), lastMonth: ivOf(ivp.lastMonth), all: ivOf(ivp.all) } : null;

  const joined: DashRes['joined'] = jo && !jo.error ? {
    m: bucketOf(jo.m as J, mk), l: bucketOf(jo.l as J, mk), y: bucketOf(jo.y as J, mk),
    undated: arr<J>((jo.undated as J | undefined)?.names).filter((x) => isMikeiken(mk, x.name)).map((x) => s(x.name)),
  } : null;
  const trend: DashRes['trend'] = tr && !tr.error ? {
    months: arr<J>(tr.months).map((m): TrendMonth => {
      const names = arr<J>(m.names).filter((x) => isMikeiken(mk, x.name)).map((x) => ({ name: s(x.name), decidedOn: s(x.decidedOn), tantou: s(x.tantou), active: x.active !== false }));
      return { ym: s(m.ym), label: s(m.label), count: names.length, offCount: names.filter((x) => !x.active).length, names };
    }),
    tantouTotals: [], undatedChecked: n(tr.undatedChecked), logStartsAt: s(tr.logStartsAt),
  } : null;
  if (trend) {
    const t = new Map<string, number>();
    for (const m of trend.months) for (const x of m.names) t.set(x.tantou || '未設定', (t.get(x.tantou || '未設定') || 0) + 1);
    trend.tantouTotals = [...t].map(([tantou, count]) => ({ tantou, count })).sort((a, b) => b.count - a.count);
  }
  // 退会・ブロック：名前が引けた人は未経験だけ。名前が引けない検知は名前なしで出す（LINE の番号は返さない）
  const DONE = new Set(['checked', 'joined', 'bot_left', 'known_member_skip', 'marked', 'already', 'jitai', 'taisha']);
  const left: DashRes['left'] = ml && !ml.error ? {
    mode: (['off', 'dry', 'on'].includes(s(ml.mode)) ? s(ml.mode) : 'off') as 'off' | 'dry' | 'on',
    canMode: ['sales_admin', 'executive', 'admin', 'super_admin'].includes(role),
    rows: arr<J>(ml.rows).filter((r) => !s(r.name) || isMikeiken(mk, r.name)).map((r): LeftRow => ({
      id: s(r.id), name: s(r.name), group: s(r.groupName) || (s(r.groupId) ? '（グループ名不明）' : '公式LINEのブロック'),
      changedAt: s(r.changedAt), result: s(r.result), canJitai: !!s(r.name) && !DONE.has(s(r.result)),
    })),
  } : null;
  if (ml?.error) errs.push(`退会・ブロック：${s(ml.error)}`);
  const report: DashRes['report'] = rep && rep.success !== false ? arr<J>(rep.rows).map((r) => ({
    caseNo: s(r.caseNo), message: s(r.message).slice(0, 160), sent: n(r.sent), replied: n(r.replied), positive: n(r.positive), replyRate: n(r.replyRate), positiveRate: n(r.positiveRate),
  })) : null;
  if (rep && rep.success === false) errs.push(`案件ごとの反応：${s(rep.error)}`);
  return { ok: true, generatedAt: s(d?.generatedAt), errors: errs, joined, trend, left, wf, cases, send, iv, report };
}

// ---------------------------------------------------------------- 各画面
async function nyuujou(mk: MikeikenSet): Promise<NyuujouRes> {
  const j = await get('/api/joined?action=nyuujou');
  return {
    ok: true, today: s(j.today),
    items: arr<J>(j.items).filter((x) => isMikeiken(mk, x.name)).map((x) => ({ name: s(x.name), date: s(x.date), tantou: s(x.tantou), eki: s(x.eki), shozoku: s(x.shozoku), jitai: x.jitai === true, poa: x.poa === true, kettei: x.kettei === true })),
    unreadable: arr<J>(j.unreadable).filter((x) => isMikeiken(mk, x.name)).map((x) => ({ name: s(x.name), raw: s(x.raw), tantou: s(x.tantou) })),
  };
}

async function story(mk: MikeikenSet, days: number): Promise<StoryList> {
  const j = await get(`/api/shoudaku-story?list=1&days=${days}`, 40000);
  const people = arr<J>(j.people).filter((x) => isMikeiken(mk, x.name)).map((x): StoryPerson => ({
    name: s(x.name), tantou: s(x.tantou), shoudaku_at: s(x.shoudaku_at), outcome: (['sankaku', 'jitai', 'poa'].includes(s(x.outcome)) ? s(x.outcome) : 'open') as StoryPerson['outcome'],
    outcome_at: s(x.outcome_at) || null, days: nOrNull(x.days),
  }));
  const by = (o: string) => people.filter((p) => p.outcome === o && p.days != null).map((p) => p.days as number);
  return {
    ok: true, days, people,
    medians: { sankaku: median(by('sankaku')), jitai: median(by('jitai')), poa: median(by('poa')) },
    counts: { sankaku: by('sankaku').length, jitai: by('jitai').length, poa: by('poa').length },
  };
}
async function storyPerson(mk: MikeikenSet, name: string): Promise<Story> {
  if (!name || name.length > 60 || !isMikeiken(mk, name)) throw new Http(404, 'この人は未経験のプロパーリストにいません');
  const j = await get(`/api/shoudaku-story?name=${encodeURIComponent(name)}`, 40000);
  const bt = (j.ball_totals as J) || {};
  return {
    ok: true, name: s(j.name), tantou: s(j.tantou), shoudaku_at: s(j.shoudaku_at), outcome: (s(j.outcome) || 'open') as Story['outcome'], outcome_at: s(j.outcome_at) || null,
    events: arr<J>(j.events).map((e) => ({ t: n(e.t), kind: s(e.kind), who: (s(e.who) || 'system') as Story['events'][number]['who'], sender: s(e.sender) || undefined, text: s(e.text) || undefined, title: s(e.title) || undefined, sub: s(e.sub) || undefined, estimated: e.estimated === true })),
    ball_totals: { member: n(bt.member), company: n(bt.company), client: n(bt.client), interview_wait: n(bt.interview_wait) },
  };
}

const runOf = (r: J | null | undefined) => (r ? { id: s(r.id), version: n(r.version), status: s(r.status), total: n(r.total), done: n(r.done), window_days: n(r.window_days), created_at: s(r.created_at), model: s(r.model) } : null);
function flatHypotheses(v: unknown): { label: string; value: string }[] {
  const show = (x: unknown) => (typeof x === 'object' ? JSON.stringify(x) : String(x ?? '')).slice(0, 300);
  if (Array.isArray(v)) return v.map((x, i) => { const o = (x || {}) as J; return { label: s(o.label || o.title || o.name || o.id) || `仮説${i + 1}`, value: show(o.result ?? o.verdict ?? o.summary ?? x) }; });
  if (v && typeof v === 'object') return Object.entries(v as J).map(([k, x]) => ({ label: k, value: show(x) }));
  return [];
}
const RUN_ID = /^[0-9a-f-]{8,40}$/i;
async function narr(runId: string): Promise<NarrRes> {
  const q = runId && RUN_ID.test(runId) ? `&run_id=${encodeURIComponent(runId)}` : '';
  const [runs, tree, hyp] = await Promise.all([
    get('/api/analysis-narratives?action=runs'), get(`/api/analysis-narratives?action=tree${q}`, 40000), get('/api/analysis-narratives?action=hypotheses').catch(() => ({} as J)),
  ]);
  return {
    ok: true, runs: arr<J>(runs.runs).map((r) => runOf(r)!), run: runOf(tree.run as J | null),
    // ★健康欄の数（health_counts・health_declared）は落とす
    nodes: arr<J>(tree.nodes).map((x) => ({ path: s(x.path), depth: n(x.depth), n: n(x.n), outcome_counts: (x.outcome_counts as NarrRes['nodes'][number]['outcome_counts']) || { jitai: 0, sankaku: 0, poa: 0, pending: 0 } })),
    rows: arr<J>(tree.rows).map((r) => ({ id: n(r.id), row_key: s(r.row_key), outcome: (s(r.outcome) || 'pending') as NarrRes['rows'][number]['outcome'], node_path: s(r.node_path), quote: s(r.quote), said_at: s(r.said_at) || null, speaker: s(r.speaker), channel: s(r.channel), settle_band: s(r.settle_band), commute_dir: s(r.commute_dir) })),
    hypotheses: { updated_at: s(hyp.updated_at) || null, items: flatHypotheses(hyp.hypotheses) },
  };
}
async function narrPerson(mk: MikeikenSet, runId: string, rowKey: string): Promise<NarrPerson> {
  if (!RUN_ID.test(runId) || !/^[A-Za-z0-9_:.-]{1,80}$/.test(rowKey)) throw new Http(400, '指定が違います');
  const j = await get(`/api/analysis-narratives?action=person&run_id=${encodeURIComponent(runId)}&row_key=${encodeURIComponent(rowKey)}`, 40000);
  const p = (j.person as J) || {};
  if (!isMikeiken(mk, p.name)) throw new Http(404, 'この人は未経験のプロパーリストにいません');
  // ★health_rows・health_declared は返さない
  return {
    ok: true, name: s(p.name), outcome: (s(p.outcome) || 'pending') as NarrPerson['outcome'], outcome_at: s(p.outcome_at) || null, home_area: s(p.home_area), site_area: s(p.site_area),
    messages: arr<J>(j.messages).map((m) => ({ at: s(m.at), speaker: s(m.speaker), channel: s(m.channel), text: s(m.text), in_window: m.in_window === true, used: m.used === true })),
  };
}

async function cohort(): Promise<CohortRes> {
  const j = await get('/api/cohort?kpi=1', 40000);
  if (j.error) throw new Http(502, s(j.error));
  const t = (j.totals as J) || {}, w = (j.waitDays as J) || {}, o = (j.oneWeekRule as J) || {};
  return {
    ok: true, ready: j.ready === true,
    totals: { accepted: n(t.accepted), settled: n(t.settled), confirmed: n(t.confirmed), declined: n(t.declined), effectiveDeclineRateSettled: nOrNull(t.effectiveDeclineRateSettled), effectiveDeclineRateOverall: nOrNull(t.effectiveDeclineRateOverall) },
    monthly: arr<J>(j.monthly).map((m) => ({ month: s(m.month), total: n(m.total), confirmed: n(m.confirmed), declined: n(m.declined), inSales: n(m.inSales), beforeSales: n(m.beforeSales), participateRateSettled: nOrNull(m.participateRateSettled), declineRateSettled: nOrNull(m.declineRateSettled) })),
    funnel: arr<J>(j.funnel).map((f) => ({ stage: s(f.stage), label: s(f.label), count: n(f.count), fromAcceptedPct: nOrNull(f.fromAcceptedPct), dropFromPrevPct: nOrNull(f.dropFromPrevPct) })),
    waitDays: { median: nOrNull(w.median), p90: nOrNull(w.p90), known: n(w.known), missing: n(w.missing), byBucket: (w.byBucket as CohortRes['waitDays']['byBucket']) || {} },
    oneWeekRule: { within7: n(o.within7), evaluable: n(o.evaluable), complianceRate: nOrNull(o.complianceRate) },
    declineByStage: arr<J>(j.declineByStage).map((x) => ({ stage: s(x.stage), count: n(x.count) })),
  };
}

const PERIODS = ['last_30d', 'last_90d', 'last_12w'];
async function richmenu(mk: MikeikenSet, period: string): Promise<RichRes> {
  const p = PERIODS.includes(period) ? period : 'last_30d';
  const [st, pe] = await Promise.all([get(`/api/richmenu-stats?period=${p}`, 40000), get(`/api/richmenu-people?period=${p}&menu=all`, 40000).catch(() => null)]);
  if (st.ok === false) throw new Http(502, s(st.error));
  const den = (st.denominators as J) || {}, per = (st.period as J) || {}, tot = (st.totals as J) || {};
  return {
    ok: true, period: { key: s(per.key), label: s(per.label), from: s(per.from), to: s(per.to) },
    denominators: { kadou: n(den.kadou), friends: n(den.friends), notes: arr<string>(den.notes).map(String) },
    actions: arr<J>(st.actions).map((a) => ({ action: s(a.action), label: s(a.label), menu: s(a.menu), taps: n(a.taps), uniqueUsers: n(a.uniqueUsers), denominator: n(a.denominator), reactionRate: nOrNull(a.reactionRate), reachRate: nOrNull(a.reachRate) })),
    weekly: arr<J>(st.weekly).map((w) => ({ week: s(w.week), counts: (w.counts as Record<string, number>) || {} })),
    totals: { taps: n(tot.taps), uniqueUsers: n(tot.uniqueUsers) },
    // 人ごと：紐付いた名前（LINE の表示名ではない）で、未経験の人だけ
    people: pe && pe.ok !== false ? {
      columns: arr<J>(pe.actions).map((a) => ({ action: s(a.action), label: s(a.label) })),
      rows: arr<J>(pe.rows).filter((r) => s(r.nameSource) === 'linked' && isMikeiken(mk, r.name)).map((r) => ({ name: s(r.name), counts: (r.counts as Record<string, number>) || {}, total: n(r.total), lastTappedAt: s(r.lastTappedAt) || null })),
    } : null,
  };
}

async function botab(): Promise<BotAbRes> {
  const [q, r] = await Promise.all([get('/api/admin?action=botAbQuestions'), get('/api/admin?action=botAbResults')]);
  return {
    ok: true, batch: s(r.batch), models: arr<unknown>(q.models).map(String),
    questions: arr<J>(q.questions).map((x) => ({ id: s(x.id), label: s(x.label) })),
    rows: arr<J>(r.rows).map((x) => ({ qid: s(x.qid), model: s(x.model), route: s(x.route), answer: s(x.answer), latency_ms: n(x.latency_ms), cost_usd: n(x.cost_usd), error: s(x.error) || null })),
  };
}

async function myact(): Promise<MyActRes> {
  const [t, w, g] = await Promise.all([get('/api/my-activity?action=today').catch(() => null), get('/api/my-activity?action=week').catch(() => null), get('/api/my-activity?action=goal').catch(() => null)]);
  return {
    ok: true, signedIn: t?.signedIn !== false,
    today: t && t.ok !== false ? { today: n(t.today), weekAvg: nOrNull(t.weekAvg), days: arr<boolean>(t.days), kinds: (t.kinds as Record<string, number>) || {} } : null,
    week: w && w.ok !== false ? {
      from: s(w.from), to: s(w.to), mendan: n(w.mendan), mendanPrev: n(w.mendanPrev), ikou: n(w.ikou), ikouPrev: n(w.ikouPrev), okRate: nOrNull(w.okRate), teiji: n(w.teiji),
      sankaku: { n: n((w.sankaku as J)?.n), avgDays: nOrNull((w.sankaku as J)?.avgDays) },
      firstOffer: { x: n((w.firstOffer as J)?.x), y: n((w.firstOffer as J)?.y), prevX: n((w.firstOffer as J)?.prevX), prevY: n((w.firstOffer as J)?.prevY) },
    } : null,
    goal: g && g.ok !== false ? { month: s(g.month), goal: n(g.goal), done: nOrNull(g.done) } : null,
  };
}

async function office(): Promise<OfficeRes> {
  const j = await get('/api/office?action=state');
  // ★メールアドレスは返さない（名前に置き換える）
  const nameOf = new Map<string, string>();
  const members = arr<J>(j.members).map((m) => {
    nameOf.set(s(m.email).toLowerCase(), s(m.name));
    return { name: s(m.name), firstAt: s(m.firstAt), lastAt: s(m.lastAt), lastPath: s(m.lastPath), rooms: arr<J>(m.rooms).map((r) => ({ path: s(r.path), title: s(r.title), activeMs: n(r.activeMs) })) };
  });
  return {
    ok: true, date: s(j.date), members,
    events: arr<J>(j.events).slice(0, 200).map((e) => ({ at: s(e.at), name: nameOf.get(s(e.email).toLowerCase()) || '内勤', action: s(e.action), ok: e.ok !== false })),
  };
}

async function links(mk: MikeikenSet): Promise<LinksRes> {
  const [j, er] = await Promise.all([get('/api/roster?op=linkboard', 40000), get<EngineerRows>(MIKEIKEN_PATH, 40000)]);
  if (j.ok === false) throw new Http(502, s(j.error));
  const all = arr<J>(j.rows);
  // 紐付いた人は未経験だけ。未紐付けは誰か分からないので出す（紐付けるための画面）
  const rows = all.filter((r) => s(r.linkStatus) !== 'linked' || isMikeiken(mk, r.linkedName)).map((r) => ({
    userId: s(r.userId), displayName: s(r.displayName), linkedName: s(r.linkedName), linkSource: s(r.linkSource), linked: s(r.linkStatus) === 'linked',
    blocked: r.blocked === true, menu: (s(r.menu) === 'kadou' || s(r.menu) === 'sales' ? s(r.menu) : '') as LinksRes['rows'][number]['menu'],
    decided: typeof r.decided === 'boolean' ? r.decided : null, active: typeof r.active === 'boolean' ? r.active : null, lastMessageAt: s(r.lastMessageAt) || null,
  }));
  const names = [...new Set((er.rows || []).map((r) => s(r.name)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
  return { ok: true, rows, hidden: all.length - rows.length, menuKnown: j.menuKnown === true, syncMode: s(j.syncMode), note: s(j.note), names };
}

async function dropout(mk: MikeikenSet): Promise<DropoutRes> {
  const j = await get('/api/roster?op=crud&action=listDropout');
  if (j.ok === false) throw new Http(502, s(j.error));
  return {
    ok: true, rows: arr<J>(j.rows).filter((r) => isMikeiken(mk, r.name)).map((r) => ({
      name: s(r.name), at: s(r.at), phase: s(r.phase), taisha: r.taisha === true, taishaBi: s(r.taishaBi), taiki: r.taiki === true, inSales: r.inSales === true,
      tantou: s(r.tantou), shozoku: s(r.shozoku), sankakuKettei: r.sankakuKettei === true, jitai: r.jitai === true, nyuujouBi: s(r.nyuujouBi), shoudakuBi: s(r.shoudakuBi),
    })),
  };
}

async function orphans(mk: MikeikenSet): Promise<OrphansRes> {
  const [g, u] = await Promise.all([get('/api/proxy?action=getOrphanGroups', 40000), get('/api/proxy?action=getUnlinkedEngineers', 40000)]);
  const keys = [...mk];
  return {
    ok: true,
    // 営業リストの誰の名前も入っていないグループ（グループ名に未経験の人の名前が入っていれば、それは出さない）
    groups: arr<J>(g.groups).filter((x) => !matchGroupName(s(x.name), keys)).map((x) => ({ name: s(x.name), tags: arr<unknown>(x.tags).map(String), eki: s(x.eki), lastActivity: n(x.lastActivity) })),
    groupTotal: n(g.total),
    unlinked: arr<J>(u.rows).filter((r) => isMikeiken(mk, r.name)).map((r) => ({ name: s(r.name), status: arr<unknown>(r.status).map(String) })),
    error: [g.success === false ? s(g.error) : '', u.success === false ? s(u.error) : ''].filter(Boolean).join('／'),
  };
}

export async function GET(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const view = sp.get('view') || '';
  try {
    const needMk = !['cohort', 'botab', 'myact', 'office', 'narr'].includes(view);
    const mk = needMk ? await loadMikeikenSet() : new Set<string>();
    let body: unknown;
    switch (view) {
      case 'dash': body = await dash(mk); break;
      case 'nyuujou': body = await nyuujou(mk); break;
      case 'story': body = await story(mk, [30, 60, 120, 180, 365].includes(Number(sp.get('days'))) ? Number(sp.get('days')) : 120); break;
      case 'story-person': body = await storyPerson(mk, s(sp.get('name'))); break;
      case 'narr': body = await narr(s(sp.get('run'))); break;
      case 'narr-person': body = await narrPerson(await loadMikeikenSet(), s(sp.get('run')), s(sp.get('row'))); break;
      case 'cohort': body = await cohort(); break;
      case 'richmenu': body = await richmenu(mk, s(sp.get('period'))); break;
      case 'botab': body = await botab(); break;
      case 'myact': body = await myact(); break;
      case 'office': body = await office(); break;
      case 'links': body = await links(mk); break;
      case 'dropout': body = await dropout(mk); break;
      case 'orphans': body = await orphans(mk); break;
      default: return NextResponse.json({ error: '画面の指定が違います' }, { status: 400 });
    }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const st = e instanceof Http ? e.status : 502;
    return NextResponse.json({ error: (e as Error).message || '読めませんでした' }, { status: st });
  }
}
