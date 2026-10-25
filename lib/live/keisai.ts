// 案件掲載・応募管理・案件ページの反応（今の /case-admin.html・/case-apps.html・/case-stats.html）の決まりごと。
//   選択肢は今の api/_case_text.ts の許可リストと同じ（今のシステムも保存のときに照合する＝片方だけ増やしても保存できない）

export const CASE_AREAS = ['東京23区', '東京都下', '千葉', '埼玉', '神奈川', 'その他・地方'] as const;
export const CASE_JOBS = ['ヘルプデスク／サポート', 'インフラ・NW', '開発', 'PMO・事務', 'テスト・検証', 'キッティング・現地作業'] as const;
export const CASE_WORK_STYLES = ['出社', '一部リモート', 'フルリモート', 'シフト制', '日勤のみ'] as const;
export const CASE_BADGES = ['未経験OK', '経験者向け', '急募'] as const; // NEW は公開日から7日で自動（選ばない）
export const CASE_AUDIENCES = [
  { v: 'all', label: '営業中の要員 全員（友だち全員）' },
  { v: 'tag', label: '特定タグの要員のみ（Phase2）' },
  { v: 'link', label: '限定URL（一覧に出さない）' },
] as const;

export const APP_STATUSES = [
  { v: 'new', label: '未対応' }, { v: 'checking', label: '確認中' }, { v: 'interview', label: '面談調整中' },
  { v: 'passed', label: '成約' }, { v: 'declined', label: '見送り' },
] as const;
export type AppStatus = (typeof APP_STATUSES)[number]['v'];
export const appStatusLabel = (s: string) => APP_STATUSES.find((x) => x.v === s)?.label ?? '未対応';

// 雛形（今の TEMPLATES と同じ。要員に必要要件は見せない＝スキル欄なし）
export const CASE_TEMPLATES = [
  { label: '通常', text: '【業務内容】\n・\n・\n\n【1日の流れ】\n09:00\n12:00\n18:00\n\n【勤務時間】\n\n【勤務場所】\n\n【勤務体系】\n\n【この案件のいいところ】\n・' },
  { label: '現場の雰囲気重視', text: '【業務内容】\n・\n\n【現場の雰囲気】\n・年齢層：\n・チーム人数：\n・服装：\n\n【入場までの流れ】\n1. 書類提出\n2. 面談（回）\n3. 参画' },
  { label: '急募', text: '【急募】\n開始:\n必要人数:\n\n【業務内容】\n・\n\n【勤務時間】\n\n【勤務場所】\n\n【選考】\n・' },
] as const;

// 単価に見える表記（今の detectPriceWords と同じ規則）。公開は止めない・確かめるだけ
const PRICE_PATTERNS = [/単価/g, /単金/g, /[0-9０-９][0-9０-９,，.．]*\s*万/g, /[0-9０-９][0-9０-９,，.．]*\s*円/g, /[¥￥]\s*[0-9０-９]/g];
export function detectPrice(text: string): { word: string; context: string }[] {
  const s = String(text || '');
  const hits: { word: string; index: number; context: string }[] = [];
  for (const re0 of PRICE_PATTERNS) {
    const re = new RegExp(re0.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      if (m[0] === '') { re.lastIndex++; continue; }
      hits.push({ word: m[0], index: m.index, context: s.slice(Math.max(0, m.index - 12), m.index + m[0].length + 12).replace(/\n/g, ' ') });
    }
  }
  hits.sort((a, b) => a.index - b.index || b.word.length - a.word.length);
  const out: typeof hits = [];
  for (const h of hits) { const p = out[out.length - 1]; if (p && (p.index === h.index || h.index < p.index + p.word.length)) continue; out.push(h); }
  return out.map(({ word, context }) => ({ word, context }));
}

export type CasePostRow = {
  id: string; title: string; area: string | null; job: string | null; status: string; audience: string; pinned: boolean;
  headcount: number | null; close_on: string | null; published_at: string | null; updated_at: string | null;
  tab: 'draft' | 'open' | 'closed'; expired: boolean; views: number; applies: number;
};
export type CaseListResp = { ok: boolean; items: CasePostRow[]; counts: { draft: number; open: number; closed: number }; errors?: string[] };
export type CasePostFull = {
  id: string; title: string; body_text: string; area: string | null; station: string | null; job: string | null;
  work_styles: string[] | null; badges: string[] | null; start_text: string | null; headcount: number | null;
  audience: string | null; pinned: boolean | null; close_on: string | null; slack_permalink: string | null; status: string;
};
export type CaseGetResp = { ok: boolean; item: CasePostFull };

export type AppItem = {
  id: string; appNo: string; postId: string; caseTitle: string; caseArea: string | null; caseStation: string | null;
  name: string; unlinked: boolean; note: string; skillsheetState: string; skillsheetLabel: string;
  status: string; statusLabel: string; assignee: string; appliedAt: string; lateApply: boolean;
};
export type AppsResp = {
  ok: boolean; items: AppItem[];
  counts: { new: number; working: number; all: number; declined: number };
  kpi: { thisWeek: number; lastWeek: number; newCount: number; oldestNewAt: string | null; interviewCount: number; last30Total: number; last30Interview: number; interviewRate: number | null };
};

export type StatsResp = {
  ok: boolean; period: { from?: string; to?: string; label?: string; preset?: string } & Record<string, unknown>; friends: number;
  funnel: { steps: { key: string; label: string; hint: string; count: number; users: number; passRate: number | null; exceeded: boolean }[]; friends: number; menuOfFriends: number | null };
  buttons: { event: string; label: string; place: string; taps: number; users: number; denominator: number; denominatorLabel: string; reactionRate: number | null; deltaPt: number | null }[];
  posts: { postId: string; title: string; area: string | null; publishedAt: string | null; pinned: boolean; cardImpr: number; detailOpen: number; openRate: number | null; applyOpen: number; applySubmit: number; applyRate: number | null }[];
  weekly: { week: string; detailOpen: number; applySubmit: number }[];
  totals: { events: number; users: number };
  meta?: { orphanEvents?: number; notes?: string[] };
};

export const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 1000) / 10}%`);
