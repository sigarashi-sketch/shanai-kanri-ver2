// 保留（あとで決める）の画面の見本データ（ログインしていないとき）。名前は lib/sample.ts と同じ架空の人
import type {
  BotAbRes, CohortRes, DashRes, DropoutRes, IvStat, LinksRes, MyActRes, NarrPerson, NarrRes, NyuujouRes, OfficeRes, OrphansRes, RichRes, Story, StoryList,
} from './horyu';

const iv = (k: number): IvStat => ({
  total: 24 * k, win: 7 * k, decline: 4 * k, pass: 5 * k, ongoing: 8 * k, winRate: 43.8, declineRate: 25,
  byRep: [{ rep: '小林', total: 12 * k, win: 4 * k, decline: 2 * k, winRate: 50, declineRate: 25 }, { rep: '田中', total: 12 * k, win: 3 * k, decline: 2 * k, winRate: 37.5, declineRate: 25 }],
});
const months = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].reverse();

export const DASH_SAMPLE: DashRes = {
  ok: true, generatedAt: '2026-10-25 09:00', errors: [],
  joined: {
    m: { label: '10月', count: 3, diff: '先月 2名 ／ ▲ 1名', names: [{ name: '加藤 葵', decidedOn: '2026-10-21' }, { name: '中村 優', decidedOn: '2026-10-14' }, { name: '松本 結衣', decidedOn: '2026-10-03' }] },
    l: { label: '9月', count: 2, diff: '前々月 4名 ／ ▼ 2名', names: [{ name: '渡辺 涼', decidedOn: '2026-09-25' }, { name: '佐々木 蓮', decidedOn: '2026-09-08' }] },
    y: { label: '2026年', count: 18, diff: '2026年 1〜10月 累計', names: [{ name: '加藤 葵', decidedOn: '2026-10-21' }, { name: '中村 優', decidedOn: '2026-10-14' }] },
    undated: ['高橋 健'],
  },
  trend: {
    months: months.map((ym, i) => ({ ym, label: `${Number(ym.slice(5))}月`, count: [3, 2, 4, 1, 2, 3, 0, 2, 1, 0, 0, 0][i], offCount: i === 2 ? 1 : 0, names: i === 0 ? [{ name: '加藤 葵', decidedOn: '2026-10-21', tantou: '田中', active: true }, { name: '中村 優', decidedOn: '2026-10-14', tantou: '田中', active: true }, { name: '松本 結衣', decidedOn: '2026-10-03', tantou: '小林', active: true }] : [] })),
    tantouTotals: [{ tantou: '田中', count: 10 }, { tantou: '小林', count: 8 }], undatedChecked: 1, logStartsAt: '2026-07-23',
  },
  left: {
    mode: 'dry', canMode: true, rows: [
      { id: 's1', name: '渡辺 涼', group: '渡辺 涼 様 案件', changedAt: '2026-10-24T18:20:00+09:00', result: 'dry', canJitai: true },
      { id: 's2', name: '', group: '公式LINEのブロック', changedAt: '2026-10-23T10:02:00+09:00', result: 'unlinked', canJitai: false },
    ],
  },
  wf: {
    count: 5, newThisMonth: 1, showPrice: true, revenueMan: 210, avgPriceMan: 42,
    byRep: [{ rep: '小林', count: 3, revenueMan: 132 }, { rep: '田中', count: 2, revenueMan: 78 }],
    byEnd: [{ key: 'A社', count: 2 }, { key: 'C社', count: 1 }, { key: 'D社', count: 1 }, { key: 'G社', count: 1 }],
    priceBuckets: [{ key: '〜25万', count: 0 }, { key: '25-30万', count: 0 }, { key: '30-35万', count: 0 }, { key: '35-40万', count: 1 }, { key: '40-45万', count: 2 }, { key: '45万〜', count: 2 }],
    members: [{ name: '山田 太郎', rep: '小林', end: 'A社', priceMan: 45 }, { name: '鈴木 一郎', rep: '小林', end: 'D社', priceMan: 45 }, { name: '伊藤 誠', rep: '小林', end: 'C社', priceMan: 42 }, { name: '高橋 健', rep: '田中', end: 'G社', priceMan: 40 }, { name: '佐々木 蓮', rep: '田中', end: 'A社', priceMan: 38 }],
    yotei: [{ name: '加藤 葵', rep: '田中', end: 'E社' }],
  },
  cases: {
    total30: 142, total7: 31, prev30: 128, priceAvg: 41.5,
    trend: Array.from({ length: 12 }, (_, i) => ({ date: `W${i + 1}`, count: [22, 30, 28, 35, 31, 26, 40, 33, 29, 37, 34, 31][i] })),
    byArea: [{ key: '品川', count: 21 }, { key: '新宿', count: 17 }, { key: '大手町', count: 12 }, { key: '川崎', count: 9 }],
    byJob: [{ key: 'ヘルプデスク', count: 44 }, { key: 'サーバー運用', count: 31 }, { key: 'ネットワーク', count: 22 }],
  },
  send: {
    windows: { '7': { sends: 64, deliveries: 210, groups: 58, replyRate: 41.2, positiveRate: 18.5 }, '30': { sends: 260, deliveries: 880, groups: 120, replyRate: 39.4, positiveRate: 17.1 } },
    okng: { '7': { deliveries: 180, ok: 22, ng: 41, undecided: 12, okRate: 12.2, ngRate: 22.8, unansweredRate: 58.3 }, '30': { deliveries: 760, ok: 90, ng: 160, undecided: 40, okRate: 11.8, ngRate: 21.1, unansweredRate: 61.8 } },
    trend: Array.from({ length: 30 }, (_, i) => ({ date: `${i + 1}`, count: (i * 7) % 13 })),
  },
  iv: { thisMonth: iv(1), lastMonth: iv(1), all: iv(5) },
  report: [
    { caseNo: 'K1203', message: '【品川】ヘルプデスク 未経験可 週5 リモートなし', sent: 34, replied: 15, positive: 7, replyRate: 44.1, positiveRate: 20.6 },
    { caseNo: 'K1198', message: '【新宿】サーバー監視 夜勤あり', sent: 28, replied: 9, positive: 3, replyRate: 32.1, positiveRate: 10.7 },
  ],
};

export const NYUUJOU_SAMPLE: NyuujouRes = {
  ok: true, today: '2026-10-25',
  items: [
    { name: '加藤 葵', date: '2026-11-01', tantou: '田中', eki: '武蔵小杉', shozoku: 'E社', jitai: false, poa: false, kettei: true },
    { name: '中村 優', date: '2026-11-01', tantou: '田中', eki: '蕨', shozoku: 'B社', jitai: false, poa: false, kettei: true },
    { name: '松本 結衣', date: '2026-11-10', tantou: '小林', eki: '大宮', shozoku: 'F社', jitai: false, poa: false, kettei: true },
    { name: '渡辺 涼', date: '2026-10-20', tantou: '小林', eki: '川口', shozoku: 'C社', jitai: true, poa: false, kettei: false },
  ],
  unreadable: [{ name: '佐々木 蓮', raw: '11月中旬', tantou: '田中' }],
};

export const STORY_SAMPLE: StoryList = {
  ok: true, days: 120, medians: { sankaku: 21.5, jitai: 12, poa: 30 }, counts: { sankaku: 2, jitai: 1, poa: 1 },
  people: [
    { name: '加藤 葵', tantou: '田中', shoudaku_at: '2026-09-28T10:00:00+09:00', outcome: 'sankaku', outcome_at: '2026-10-21T15:00:00+09:00', days: 23.2 },
    { name: '中村 優', tantou: '田中', shoudaku_at: '2026-09-20T10:00:00+09:00', outcome: 'sankaku', outcome_at: '2026-10-10T15:00:00+09:00', days: 19.8 },
    { name: '渡辺 涼', tantou: '小林', shoudaku_at: '2026-09-15T10:00:00+09:00', outcome: 'jitai', outcome_at: '2026-09-27T12:00:00+09:00', days: 12 },
    { name: '佐々木 蓮', tantou: '田中', shoudaku_at: '2026-08-30T10:00:00+09:00', outcome: 'poa', outcome_at: '2026-09-29T09:00:00+09:00', days: 30 },
    { name: '松本 結衣', tantou: '小林', shoudaku_at: '2026-10-12T10:00:00+09:00', outcome: 'open', outcome_at: null, days: null },
  ],
};
const T = (d: string) => Date.parse(d);
export const STORY_PERSON_SAMPLE: Story = {
  ok: true, name: '加藤 葵', tantou: '田中', shoudaku_at: '2026-09-28T10:00:00+09:00', outcome: 'sankaku', outcome_at: '2026-10-21T15:00:00+09:00',
  events: [
    { t: T('2026-09-28T10:00:00+09:00'), kind: 'shoudaku', who: 'system', title: '承諾' },
    { t: T('2026-09-30T14:00:00+09:00'), kind: 'hearing', who: 'staff', title: '初回ヒアリング' },
    { t: T('2026-10-03T11:00:00+09:00'), kind: 'case', who: 'staff', title: '案件の紹介', text: '品川のヘルプデスクの案件です。いかがでしょう？' },
    { t: T('2026-10-03T19:30:00+09:00'), kind: 'msg', who: 'member', text: 'ぜひお願いします！' },
    { t: T('2026-10-10T16:00:00+09:00'), kind: 'interview', who: 'client', title: '客先面談' },
    { t: T('2026-10-21T15:00:00+09:00'), kind: 'outcome', who: 'system', title: '参画決定' },
  ],
  ball_totals: { member: 2 * 864e5, company: 9 * 864e5, client: 7 * 864e5, interview_wait: 5 * 864e5 },
};

export const NARR_SAMPLE: NarrRes = {
  ok: true,
  runs: [{ id: '00000000-0000-0000-0000-000000000003', version: 3, status: 'done', total: 40, done: 40, window_days: 14, created_at: '2026-10-01T00:00:00Z', model: 'offline' }],
  run: { id: '00000000-0000-0000-0000-000000000003', version: 3, status: 'done', total: 40, done: 40, window_days: 14, created_at: '2026-10-01T00:00:00Z', model: 'offline' },
  nodes: [
    { path: '辞退', depth: 1, n: 3, outcome_counts: { jitai: 3, sankaku: 0, poa: 0, pending: 0 } },
    { path: '辞退/通勤', depth: 2, n: 2, outcome_counts: { jitai: 2, sankaku: 0, poa: 0, pending: 0 } },
    { path: '辞退/他社決定', depth: 2, n: 1, outcome_counts: { jitai: 1, sankaku: 0, poa: 0, pending: 0 } },
    { path: '参画', depth: 1, n: 2, outcome_counts: { jitai: 0, sankaku: 2, poa: 0, pending: 0 } },
    { path: '参画/早く働きたい', depth: 2, n: 2, outcome_counts: { jitai: 0, sankaku: 2, poa: 0, pending: 0 } },
  ],
  rows: [
    { id: 1, row_key: 'aaaaaaaaaaaaaaa1', outcome: 'jitai', node_path: '辞退/通勤', quote: '片道1時間半はちょっと厳しいです', said_at: '2026-09-20T20:00:00Z', speaker: 'member', channel: 'line', settle_band: '〜2週', commute_dir: '遠い' },
    { id: 2, row_key: 'aaaaaaaaaaaaaaa2', outcome: 'jitai', node_path: '辞退/通勤', quote: '乗り換えが多くて…', said_at: '2026-09-18T20:00:00Z', speaker: 'member', channel: 'line', settle_band: '〜1週', commute_dir: '遠い' },
    { id: 3, row_key: 'aaaaaaaaaaaaaaa3', outcome: 'jitai', node_path: '辞退/他社決定', quote: '別の会社で決まりました', said_at: '2026-09-10T20:00:00Z', speaker: 'member', channel: 'line', settle_band: '〜1か月', commute_dir: '' },
    { id: 4, row_key: 'aaaaaaaaaaaaaaa4', outcome: 'sankaku', node_path: '参画/早く働きたい', quote: '早く現場に出たいです', said_at: '2026-10-02T20:00:00Z', speaker: 'member', channel: 'line', settle_band: '〜2週', commute_dir: '近い' },
    { id: 5, row_key: 'aaaaaaaaaaaaaaa5', outcome: 'sankaku', node_path: '参画/早く働きたい', quote: 'どこでも大丈夫です！', said_at: '2026-10-05T20:00:00Z', speaker: 'member', channel: 'line', settle_band: '〜1週', commute_dir: '' },
  ],
  hypotheses: { updated_at: '2026-10-01T00:00:00Z', items: [{ label: '待機が長いほど辞退が増える', value: '支持（見本）' }, { label: '通勤が遠いと辞退が増える', value: '保留（見本）' }] },
};
export const NARR_PERSON_SAMPLE: NarrPerson = {
  ok: true, name: '渡辺 涼', outcome: 'jitai', outcome_at: '2026-09-27T12:00:00+09:00', home_area: '埼玉南部', site_area: '神奈川',
  messages: [
    { at: '2026-09-19T11:00:00+09:00', speaker: 'staff', channel: 'line', text: '川崎の案件はいかがですか？', in_window: true, used: false },
    { at: '2026-09-20T20:00:00+09:00', speaker: 'member', channel: 'line', text: '片道1時間半はちょっと厳しいです', in_window: true, used: true },
  ],
};

export const COHORT_SAMPLE: CohortRes = {
  ok: true, ready: true,
  totals: { accepted: 120, settled: 90, confirmed: 52, declined: 30, effectiveDeclineRateSettled: 33.3, effectiveDeclineRateOverall: 25 },
  monthly: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((month, i) => ({ month, total: 20 + i * 2, confirmed: 9 + i, declined: 5, inSales: 4, beforeSales: 2, participateRateSettled: 60 + i, declineRateSettled: 33 - i })),
  funnel: [
    { stage: 'accepted', label: '承諾', count: 120, fromAcceptedPct: 100, dropFromPrevPct: null },
    { stage: 'sales_started', label: '営業開始', count: 104, fromAcceptedPct: 86.7, dropFromPrevPct: 13.3 },
    { stage: 'pitched', label: '案件打診', count: 92, fromAcceptedPct: 76.7, dropFromPrevPct: 11.5 },
    { stage: 'client_interview', label: '客先面談', count: 70, fromAcceptedPct: 58.3, dropFromPrevPct: 23.9 },
    { stage: 'confirmed', label: '参画', count: 52, fromAcceptedPct: 43.3, dropFromPrevPct: 25.7 },
  ],
  waitDays: { median: 6, p90: 18, known: 100, missing: 20, byBucket: { '0-7': { n: 60, declined: 10, declineRate: 16.7 }, '8-14': { n: 25, declined: 8, declineRate: 32 }, '15-30': { n: 10, declined: 5, declineRate: 50 }, '31+': { n: 5, declined: 3, declineRate: 60 }, missing: { n: 20, declined: 4, declineRate: 20 } } },
  oneWeekRule: { within7: 60, evaluable: 100, complianceRate: 60 },
  declineByStage: [{ stage: '営業開始前', count: 9 }, { stage: '案件打診後', count: 12 }, { stage: '客先面談後', count: 9 }],
};

export const RICH_SAMPLE: RichRes = {
  ok: true, period: { key: 'last_30d', label: '直近30日', from: '2026-09-26', to: '2026-10-25' },
  denominators: { kadou: 80, friends: 640, notes: ['稼働中メニューの分母は「参画決定かつ LINE 紐付け済み」の人数です（見本）'] },
  actions: [
    { action: 'kintai', label: '勤務表を送る', menu: 'kadou', taps: 120, uniqueUsers: 54, denominator: 80, reactionRate: 67.5, reachRate: 88 },
    { action: 'keihi', label: '交通費・経費', menu: 'kadou', taps: 46, uniqueUsers: 30, denominator: 80, reactionRate: 37.5, reachRate: 72 },
    { action: 'studygroup', label: '勉強会', menu: 'kadou', taps: 12, uniqueUsers: 10, denominator: 80, reactionRate: 12.5, reachRate: null },
  ],
  weekly: Array.from({ length: 12 }, (_, i) => ({ week: `W${i + 1}`, counts: { kintai: 10 + (i % 4) * 3, keihi: 4 + (i % 3) } })),
  totals: { taps: 178, uniqueUsers: 61 },
  people: { columns: [{ action: 'kintai', label: '勤務表を送る' }, { action: 'keihi', label: '交通費・経費' }], rows: [{ name: '山田 太郎', counts: { kintai: 4, keihi: 1 }, total: 5, lastTappedAt: '2026-10-24T09:00:00+09:00' }, { name: '伊藤 誠', counts: { kintai: 3 }, total: 3, lastTappedAt: '2026-10-22T09:00:00+09:00' }] },
};

export const BOTAB_SAMPLE: BotAbRes = {
  ok: true, batch: '見本', models: ['sonnet', 'opus'],
  questions: [{ id: 'q1', label: '勤務表の出し方' }, { id: 'q2', label: '交通費の申請' }],
  rows: [
    { qid: 'q1', model: 'sonnet', route: 'kb', answer: '勤務表は月末にリッチメニューの「勤務表を送る」から送ってください（見本）。', latency_ms: 4200, cost_usd: 0.012, error: null },
    { qid: 'q1', model: 'opus', route: 'kb', answer: '月末の最終営業日までに、メニューの「勤務表を送る」から画像かファイルで送ってください（見本）。', latency_ms: 7800, cost_usd: 0.041, error: null },
    { qid: 'q2', model: 'sonnet', route: 'kb', answer: '交通費はメニューの「交通費・経費」から申請します（見本）。', latency_ms: 3900, cost_usd: 0.011, error: null },
  ],
};

export const MYACT_SAMPLE: MyActRes = {
  ok: true, signedIn: true,
  today: { today: 7, weekAvg: 9.5, days: [true, true, true, false, false, false, false], kinds: { ikou: 3, mendan: 2, roster: 1, teiji: 1, kintai: 0, other: 0 } },
  week: { from: '2026-10-19', to: '2026-10-23', mendan: 6, mendanPrev: 4, ikou: 18, ikouPrev: 15, okRate: 28, teiji: 5, sankaku: { n: 2, avgDays: 19 }, firstOffer: { x: 8, y: 11, prevX: 6, prevY: 10 } },
  goal: { month: '2026-10', goal: 8, done: 3 },
};

export const OFFICE_SAMPLE: OfficeRes = {
  ok: true, date: '2026-10-25',
  members: [
    { name: '小林', firstAt: '2026-10-25T08:55:00+09:00', lastAt: '2026-10-25T11:40:00+09:00', lastPath: '/progress.html', rooms: [{ path: '/progress.html', title: '案件進捗', activeMs: 5400000 }, { path: '/proper.html', title: 'プロパーリスト', activeMs: 1800000 }] },
    { name: '田中', firstAt: '2026-10-25T09:10:00+09:00', lastAt: '2026-10-25T10:05:00+09:00', lastPath: '/chat.html', rooms: [{ path: '/chat.html', title: 'チャット', activeMs: 2400000 }] },
  ],
  events: [{ at: '2026-10-25T11:38:00+09:00', name: '小林', action: 'proxy:saveProgress', ok: true }, { at: '2026-10-25T10:01:00+09:00', name: '田中', action: 'chat:send', ok: true }],
};

export const LINKS_SAMPLE: LinksRes = {
  ok: true, hidden: 0, menuKnown: false, syncMode: 'off', note: 'RICHMENU_SYNC=off のため、メニュー列は不明のままで同期ボタンも何もしません。（見本）',
  names: ['中村 優', '伊藤 誠', '佐々木 蓮', '加藤 葵', '山田 太郎', '松本 結衣', '渡辺 涼', '鈴木 一郎', '高橋 健'],
  rows: [
    { userId: 'U00000000000000000000000000000001', displayName: 'やまだ', linkedName: '山田 太郎', linkSource: 'manual', linked: true, blocked: false, menu: '', decided: true, active: true, lastMessageAt: '2026-10-24T09:00:00+09:00' },
    { userId: 'U00000000000000000000000000000002', displayName: 'aoi', linkedName: '', linkSource: '', linked: false, blocked: false, menu: '', decided: null, active: null, lastMessageAt: '2026-10-23T21:00:00+09:00' },
    { userId: 'U00000000000000000000000000000003', displayName: 'R', linkedName: '', linkSource: '', linked: false, blocked: true, menu: '', decided: null, active: null, lastMessageAt: null },
  ],
};

export const DROPOUT_SAMPLE: DropoutRes = {
  ok: true, rows: [
    { name: '渡辺 涼', at: '2026-10-20T10:00:00+09:00', phase: 'eigyo', taisha: false, taishaBi: '', taiki: false, inSales: true, tantou: '小林', shozoku: '', sankakuKettei: false, jitai: true, nyuujouBi: '', shoudakuBi: '2026/09/15' },
    { name: '佐々木 蓮', at: '2026-10-02T10:00:00+09:00', phase: 'kadou', taisha: true, taishaBi: '2026/10/31', taiki: false, inSales: true, tantou: '田中', shozoku: 'A社', sankakuKettei: true, jitai: false, nyuujouBi: '2026/08/01', shoudakuBi: '2026/06/30' },
  ],
};

export const ORPHANS_SAMPLE: OrphansRes = {
  ok: true, groupTotal: 420, error: '',
  groups: [{ name: '面談調整（テスト）', tags: ['テスト'], eki: '', lastActivity: Date.parse('2026-10-20T10:00:00+09:00') }, { name: '旧グループ', tags: [], eki: '品川', lastActivity: 0 }],
  unlinked: [{ name: '松本 結衣', status: [] }, { name: '渡辺 涼', status: ['辞退'] }],
};

// ---- 要員マップ・稼働表・客先リンクの見本（port/map） ----
// 保留（/horyu）の画面の見本データ（ログインしていないときに出す）。名前・会社・数字はすべて作りもの
// ---------------- 稼働表出力（今の /api/kadohyo?action=roster の形） ----------------
export type KadoRow = {
  name: string; normName: string; shozoku: string; joukyou: string; rep: string; start?: string; end?: string;
  source: 'freee' | 'freee_ambiguous' | 'csv_required'; employeeId: string; companyId: string; empNum?: string;
  candidates?: { employee_id: string; company_id: string; name: string; num: string }[];
  taisha?: boolean; taishaBi?: string; joi: string; kinmuRoute: string; kinmuDeadline: string; kinmuSoufu?: string;
  kinmuKind: 'genba' | 'freee' | 'none'; kinmuReason?: string; fare?: { rows: number; total: number };
};
export type KadoRoster = { ok: boolean; ym: string; freee_configured?: boolean; rows: KadoRow[]; error?: unknown };
export type DayRow = { date: string; weekday: string; clockIn: string; clockOut: string; breakMins: number; note: string; worked: boolean };
export type FareRow = { date: string; carrier: string; from: string; to: string; fare: number; note?: string };

const k = (name: string, o: Partial<KadoRow>): KadoRow => ({
  name, normName: name.replace(/\s/g, ''), shozoku: 'ミカタ', joukyou: '稼働中', rep: '小林', source: 'freee', employeeId: '1001', companyId: '2001',
  joi: '株式会社サンプル商事', kinmuRoute: '本人→弊社', kinmuDeadline: '翌月3営業日', kinmuKind: 'freee', fare: { rows: 0, total: 0 }, ...o,
});
export const KADO_ROSTER: KadoRow[] = [
  k('中村 優', { fare: { rows: 20, total: 18400 } }),
  k('佐々木 蓮', { shozoku: 'ファースト', employeeId: '1002' }),
  k('松本 結衣', { source: 'csv_required', employeeId: '', companyId: '', shozoku: '協力会社A' }),
  k('井上 翔', { source: 'freee_ambiguous', employeeId: '', companyId: '', candidates: [{ employee_id: '1010', company_id: '2001', name: '井上 翔', num: '0123' }, { employee_id: '1011', company_id: '2002', name: '井上 翔', num: '0456' }] }),
  k('森 拓海', { joi: 'KMS Partners（見本）', kinmuKind: 'genba', kinmuReason: '現場フォーマット', employeeId: '1003' }),
  k('渡辺 涼', { joukyou: '終了', taisha: true, taishaBi: '2026-09-30', employeeId: '1004' }),
  k('井上 さくら', { shozoku: 'スキラボ', employeeId: '1005', fare: { rows: 4, total: 6200 } }),
];
export const sampleDays = (ym: string): DayRow[] => {
  const [y, m] = ym.split('-').map(Number), last = new Date(y, m, 0).getDate(), out: DayRow[] = [];
  for (let d = 1; d <= last; d++) {
    const dt = new Date(y, m - 1, d), wd = dt.getDay(), worked = wd !== 0 && wd !== 6;
    out.push({ date: `${ym}-${String(d).padStart(2, '0')}`, weekday: '日月火水木金土'[wd], clockIn: worked ? '09:00' : '', clockOut: worked ? '18:00' : '', breakMins: worked ? 60 : 0, note: '', worked });
  }
  return out;
};
export const SAMPLE_FARES: FareRow[] = [{ date: '', carrier: '電車', from: '蕨(往復)', to: '品川', fare: 920 }];

// ---------------- 現場稼動表（今の /api/genba-kadohyo の形） ----------------
export type GenbaFile = { filename: string; mimeType: string; subject: string; sender: string; direction: string; receivedAt: string | null; url: string };
export type GenbaItem = { name: string; normalizedName: string; tantou: string; shozoku: string; kadouChu: boolean; jitai: boolean; lastAt: string | null; files: GenbaFile[] };
export type GenbaData = { ok: boolean; ym: string; months: string[]; items: GenbaItem[]; missing: { name: string; tantou: string; shozoku: string }[]; error?: string };
export const GENBA: GenbaData = {
  ok: true, ym: '2026-09', months: ['2026-10', '2026-09', '2026-08'],
  items: [
    { name: '中村 優', normalizedName: '中村優', tantou: '小林', shozoku: 'ミカタ', kadouChu: true, jitai: false, lastAt: '2026-10-02T10:12:00+09:00',
      files: [{ filename: '勤務表_9月.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', subject: '9月分 勤務表', sender: '現場の担当者', direction: 'in', receivedAt: '2026-10-02T10:12:00+09:00', url: '#' }] },
    { name: '森 拓海', normalizedName: '森拓海', tantou: '田中', shozoku: 'ミカタ', kadouChu: true, jitai: false, lastAt: '2026-10-01T18:40:00+09:00',
      files: [{ filename: '稼動報告書.pdf', mimeType: 'application/pdf', subject: '稼動報告（9月）', sender: '現場の担当者', direction: 'in', receivedAt: '2026-10-01T18:40:00+09:00', url: '#' }] },
  ],
  missing: [{ name: '井上 さくら', tantou: '三枝', shozoku: 'スキラボ' }],
};

// ---------------- 客先向けリンク（今の /api/client-view?action=links の形） ----------------
export type Mention = { uid: string; name: string };
export type LinkEvent = { link_id?: string; kind: 'request' | 'decline'; target_name: string; reason?: string; case_no?: string; source?: string; created_at: string };
export type ClientLink = {
  id: string; label: string; note: string; created_by: string; created_at: string; expires_at: string | null; revoked_at: string | null;
  last_seen_at: string | null; view_count: number; mention?: Mention[]; token: string; counts: { request: number; decline: number }; events: LinkEvent[];
};
export const CLIENT_LINKS: ClientLink[] = [
  { id: 'l1', label: '株式会社サンプル（見本）', note: '首都圏の案件で使う', created_by: 'eigyo@example.com', created_at: '2026-10-01T10:00:00+09:00', expires_at: null, revoked_at: null,
    last_seen_at: '2026-10-24T15:20:00+09:00', view_count: 12, mention: [{ uid: 'U' + '0'.repeat(32), name: '営業 小林' }], token: 'SAMPLEsampleSAMPLEsampleSAMPLE00', counts: { request: 2, decline: 1 },
    events: [
      { kind: 'request', target_name: '中村 優', case_no: 'P261020-101010', source: 'match', created_at: '2026-10-20T11:00:00+09:00' },
      { kind: 'request', target_name: '佐々木 蓮', source: 'catalog', created_at: '2026-10-18T09:30:00+09:00' },
      { kind: 'decline', target_name: '松本 結衣', reason: '通勤', source: 'match', created_at: '2026-10-18T09:20:00+09:00' },
    ] },
  { id: 'l2', label: '見本テック株式会社', note: '', created_by: 'eigyo@example.com', created_at: '2026-09-12T10:00:00+09:00', expires_at: null, revoked_at: '2026-10-10T10:00:00+09:00',
    last_seen_at: '2026-10-05T10:00:00+09:00', view_count: 3, token: '', counts: { request: 0, decline: 0 }, events: [] },
];
export const MENTION_CANDIDATES: Mention[] = [{ uid: 'U' + '0'.repeat(32), name: '営業 小林' }, { uid: 'U' + '1'.repeat(32), name: '営業 田中' }];

// ---------------- 客先向けの画面（今の /api/client-view?action=list の形。名前は出ない） ----------------
export type ClientPerson = {
  ref: string; no: string; initial: string; age: string; gender: string; kadou: string; kibou: string; jobs: { job: string; years: string }[];
  shikaku: string; tools: string; tokui: string; tags: string[]; eki: string; summary: string; pdf: string;
  fit?: { ok: boolean | null; text: string }[]; mustAll?: boolean;
};
export type MatchRead = { station: string; stationUnresolved?: boolean; stationTried?: string; start: string; needs?: { shift?: boolean; yakin?: boolean; shucchou?: boolean }; must: string[]; want: string[] };
export type HistoryGroup = { at: string; kind: string; source: string; caseNo: string; caseTitle: string; reason: string; people: { ref: string; no: string; initial: string; listed: boolean }[] };
export type ClientList = { ok: boolean; client: string; expiresAt: string | null; people: ClientPerson[]; mine: Record<string, string>; kadouMonths: { ym: number; label: string }[]; declineReasons: string[]; coords?: Record<string, [number, number]> };
const cp = (no: string, initial: string, o: Partial<ClientPerson>): ClientPerson => ({
  ref: 'r' + no, no, initial, age: '20代後半', gender: '', kadou: '即日', kibou: 'ヘルプデスク', jobs: [], shikaku: '', tools: '', tokui: '', tags: [], eki: '', summary: '', pdf: '', ...o,
});
export const CLIENT_LIST: ClientList = {
  ok: true, client: '株式会社サンプル（見本）', expiresAt: null, mine: { r002: 'request' },
  kadouMonths: [{ ym: 202610, label: '10月' }, { ym: 202611, label: '11月' }, { ym: 202612, label: '12月' }, { ym: 202701, label: '1月' }], declineReasons: ['経験・スキルが合わない', '通勤', '稼働時期', 'その他'],
  people: [
    cp('001', 'Y.N.', { gender: '男性', kibou: 'インフラ', shikaku: 'CCNA / LPIC-1', tools: 'Excel', tokui: '手順どおりの作業', jobs: [{ job: '飲食店 店長', years: '4年' }], eki: '蕨', tags: ['資格あり', '即日OK'], summary: 'シフト管理と発注を任されていました。CCNA を取って IT の現場をめざしています。' }),
    cp('002', 'R.S.', { age: '20代前半', gender: '男性', kibou: '開発', shikaku: '基本情報', tools: 'Java（学習中）', jobs: [{ job: '物流倉庫', years: '2年' }], eki: '大宮', kadou: '11月' }),
    cp('003', 'Y.M.', { age: '30代前半', gender: '女性', kibou: 'テスト', shikaku: 'MOS', jobs: [{ job: 'コールセンター', years: '3年' }], eki: '赤羽', tags: ['シフト可'] }),
    cp('004', 'S.I.', { gender: '女性', kibou: '事務', shikaku: '日商簿記2級', jobs: [{ job: '施工管理の事務', years: '2年' }], eki: '横浜', kadou: '12月' }),
  ],
};

// ---------------- 案件受注（今の /api/kaitaku-cases?action=list の形） ----------------
export type JuchuCase = {
  id: string; company_name: string; company_pref?: string; company_area?: string; company_phone?: string; owner_name?: string; headline: string;
  station?: string; duties?: string; work_hours?: string; break_time?: string; work_days?: string; holidays?: string; start_text?: string; tanka?: string; notes?: string;
  case_text?: string; stock_case_no?: string | null; archived?: boolean; received_at: string; pushed_by?: string;
};
export const JUCHU: JuchuCase[] = [
  { id: 'c1', company_name: '見本物流株式会社', company_pref: '神奈川県', company_area: '厚木', owner_name: '博田', headline: '倉庫の在庫管理（PC入力あり）', station: '本厚木駅', duties: '・入出庫の入力\n・在庫の照合', work_hours: '8:30-17:30', break_time: '60分', work_days: '週5', holidays: '土日', start_text: '11月〜', tanka: '30万', notes: '車通勤可',
    case_text: '【案件】倉庫の在庫管理\n最寄駅：本厚木駅\n…', stock_case_no: null, archived: false, received_at: '2026-10-24T10:00:00+09:00', pushed_by: 'eigyo@example.com' },
  { id: 'c2', company_name: 'サンプル電機', company_pref: '神奈川県', company_area: '海老名', owner_name: '博田', headline: 'ヘルプデスク（工場内）', station: '海老名駅', duties: '・社員の PC 問い合わせ', work_hours: '9:00-18:00', start_text: '12月〜', tanka: '33万',
    case_text: '【案件】ヘルプデスク\n…', stock_case_no: 'P261020-090000', archived: false, received_at: '2026-10-20T09:00:00+09:00', pushed_by: 'eigyo@example.com' },
];
