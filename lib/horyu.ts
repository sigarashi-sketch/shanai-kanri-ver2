// 保留（あとで決める）の画面で使う形（画面とサーバの両方から読む・純粋な型だけ）。
//   中身は今の社内システムの画面（dashboard / nyuujou / shoudaku / narratives / cohort / richmenu-stats / bot-ab /
//   my-activity / office / links / dropout-list / orphans）の読み口を、app/api/live/horyu で ver2 向けに整えたもの。
//   ★未経験の人だけ（プロパーリストに入っている人）。健康の欄・メールアドレスは返さない。単価は単価を見られるロールだけ

export type Named = { name: string; decidedOn: string };
export type JoinedBucket = { label: string; count: number; diff: string; names: Named[] };
export type TrendMonth = { ym: string; label: string; count: number; offCount: number; names: { name: string; decidedOn: string; tantou: string; active: boolean }[] };
export type LeftRow = { id: string; name: string; group: string; changedAt: string; result: string; canJitai: boolean };
export type DashWf = {
  count: number; newThisMonth: number; showPrice: boolean;
  revenueMan: number | null; avgPriceMan: number | null;
  byRep: { rep: string; count: number; revenueMan: number | null }[];
  byEnd: { key: string; count: number }[];
  priceBuckets: { key: string; count: number }[] | null;
  members: { name: string; rep: string; end: string; priceMan: number | null }[];
  yotei: { name: string; rep: string; end: string }[];
};
export type DashCases = { total30: number; total7: number; prev30: number; priceAvg: number; trend: { date: string; count: number }[]; byArea: { key: string; count: number }[]; byJob: { key: string; count: number }[] };
export type SendWin = { sends: number; deliveries: number; groups: number; replyRate: number; positiveRate: number };
export type OkngWin = { deliveries: number; ok: number; ng: number; undecided: number; okRate: number; ngRate: number; unansweredRate: number };
export type DashSend = { windows: Record<string, SendWin>; okng: Record<string, OkngWin>; trend: { date: string; count: number }[] };
export type IvStat = { total: number; win: number; decline: number; pass: number; ongoing: number; winRate: number; declineRate: number; byRep: { rep: string; total: number; win: number; decline: number; winRate: number; declineRate: number }[] };
export type ReportRow = { caseNo: string; message: string; sent: number; replied: number; positive: number; replyRate: number; positiveRate: number };
export type DashRes = {
  ok: true; generatedAt: string; errors: string[];
  joined: { m: JoinedBucket; l: JoinedBucket; y: JoinedBucket; undated: string[] } | null;
  trend: { months: TrendMonth[]; tantouTotals: { tantou: string; count: number }[]; undatedChecked: number; logStartsAt: string } | null;
  left: { mode: 'off' | 'dry' | 'on'; canMode: boolean; rows: LeftRow[] } | null;
  wf: DashWf | null; cases: DashCases | null; send: DashSend | null;
  iv: { thisMonth: IvStat; lastMonth: IvStat; all: IvStat } | null;
  report: ReportRow[] | null;
};

export type NyuujouItem = { name: string; date: string; tantou: string; eki: string; shozoku: string; jitai: boolean; poa: boolean; kettei: boolean };
export type NyuujouRes = { ok: true; today: string; items: NyuujouItem[]; unreadable: { name: string; raw: string; tantou: string }[] };

export type Outcome = 'sankaku' | 'jitai' | 'poa' | 'open';
export type StoryPerson = { name: string; tantou: string; shoudaku_at: string; outcome: Outcome; outcome_at: string | null; days: number | null };
export type StoryList = { ok: true; days: number; medians: Record<'sankaku' | 'jitai' | 'poa', number | null>; counts: Record<'sankaku' | 'jitai' | 'poa', number>; people: StoryPerson[] };
export type StoryEvent = { t: number; kind: string; who: 'member' | 'staff' | 'client' | 'system'; sender?: string; text?: string; title?: string; sub?: string; estimated?: boolean };
export type Story = { ok: true; name: string; tantou: string; shoudaku_at: string; outcome: Outcome; outcome_at: string | null; events: StoryEvent[]; ball_totals: Record<'member' | 'company' | 'client' | 'interview_wait', number> };

export type NarrOutcome = 'jitai' | 'sankaku' | 'poa' | 'pending';
export type NarrRun = { id: string; version: number; status: string; total: number; done: number; window_days: number; created_at: string; model: string };
export type NarrNode = { path: string; depth: number; n: number; outcome_counts: Record<NarrOutcome, number> };
export type NarrRow = { id: number; row_key: string; outcome: NarrOutcome; node_path: string; quote: string; said_at: string | null; speaker: string; channel: string; settle_band: string; commute_dir: string };
export type NarrRes = { ok: true; runs: NarrRun[]; run: NarrRun | null; nodes: NarrNode[]; rows: NarrRow[]; hypotheses: { updated_at: string | null; items: { label: string; value: string }[] } };
export type NarrPerson = { ok: true; name: string; outcome: NarrOutcome; outcome_at: string | null; home_area: string; site_area: string; messages: { at: string; speaker: string; channel: string; text: string; in_window: boolean; used: boolean }[] };

export type CohortRes = {
  ok: true; ready: boolean;
  totals: { accepted: number; settled: number; confirmed: number; declined: number; effectiveDeclineRateSettled: number | null; effectiveDeclineRateOverall: number | null };
  monthly: { month: string; total: number; confirmed: number; declined: number; inSales: number; beforeSales: number; participateRateSettled: number | null; declineRateSettled: number | null }[];
  funnel: { stage: string; label: string; count: number; fromAcceptedPct: number | null; dropFromPrevPct: number | null }[];
  waitDays: { median: number | null; p90: number | null; known: number; missing: number; byBucket: Record<string, { n: number; declined: number; declineRate: number | null }> };
  oneWeekRule: { within7: number; evaluable: number; complianceRate: number | null };
  declineByStage: { stage: string; count: number }[];
};

export type RichPeriod = 'last_30d' | 'last_90d' | 'last_12w';
export type RichAction = { action: string; label: string; menu: string; taps: number; uniqueUsers: number; denominator: number; reactionRate: number | null; reachRate: number | null };
export type RichRes = {
  ok: true; period: { key: string; label: string; from: string; to: string };
  denominators: { kadou: number; friends: number; notes: string[] };
  actions: RichAction[]; weekly: { week: string; counts: Record<string, number> }[]; totals: { taps: number; uniqueUsers: number };
  people: { columns: { action: string; label: string }[]; rows: { name: string; counts: Record<string, number>; total: number; lastTappedAt: string | null }[] } | null;
};

export type BotAbRes = { ok: true; batch: string; models: string[]; questions: { id: string; label: string }[]; rows: { qid: string; model: string; route: string; answer: string; latency_ms: number; cost_usd: number; error: string | null }[] };

export type MyActRes = {
  ok: true; signedIn: boolean;
  today: { today: number; weekAvg: number | null; days: boolean[]; kinds: Record<string, number> } | null;
  week: { from: string; to: string; mendan: number; mendanPrev: number; ikou: number; ikouPrev: number; okRate: number | null; teiji: number; sankaku: { n: number; avgDays: number | null }; firstOffer: { x: number; y: number; prevX: number; prevY: number } } | null;
  goal: { month: string; goal: number; done: number | null } | null;
};

export type OfficeRes = { ok: true; date: string; members: { name: string; firstAt: string; lastAt: string; lastPath: string; rooms: { path: string; title: string; activeMs: number }[] }[]; events: { at: string; name: string; action: string; ok: boolean }[] };

export type LinkRow = { userId: string; displayName: string; linkedName: string; linkSource: string; linked: boolean; blocked: boolean; menu: '' | 'kadou' | 'sales'; decided: boolean | null; active: boolean | null; lastMessageAt: string | null };
export type LinksRes = { ok: true; rows: LinkRow[]; hidden: number; menuKnown: boolean; syncMode: string; note: string; names: string[] };

export type DropoutRow = { name: string; at: string; phase: string; taisha: boolean; taishaBi: string; taiki: boolean; inSales: boolean; tantou: string; shozoku: string; sankakuKettei: boolean; jitai: boolean; nyuujouBi: string; shoudakuBi: string };
export type DropoutRes = { ok: true; rows: DropoutRow[] };

export type OrphansRes = { ok: true; groups: { name: string; tags: string[]; eki: string; lastActivity: number }[]; groupTotal: number; unlinked: { name: string; status: string[] }[]; error: string };

export type HoryuView = 'dash' | 'nyuujou' | 'story' | 'story-person' | 'narr' | 'narr-person' | 'cohort' | 'richmenu' | 'botab' | 'myact' | 'office' | 'links' | 'dropout' | 'orphans';

export const OUTCOME_LABEL: Record<Outcome, string> = { sankaku: '参画', jitai: '辞退', poa: 'ぽあ（連絡途絶）', open: '進行中' };
export const NARR_LABEL: Record<NarrOutcome, string> = { jitai: '辞退', sankaku: '参画', poa: '連絡途絶', pending: '未決着' };
export const LEFT_RESULT: Record<string, string> = {
  checked: '自動で辞退にした', dry: '記録だけ（反映なし）', not_found: '該当なし', ambiguous: '同じ名前が複数', unlinked: '未紐付け',
  known_member_skip: '社員なので外した', error: 'エラー', checking: '処理中', joined: '入室', bot_left: 'botが退出', marked: 'dropoutにした',
  already: 'dropout済み', jitai: '辞退済み', taisha: '退社済み', long: '入場60日超（印なし）', none: '名簿に無し',
};
