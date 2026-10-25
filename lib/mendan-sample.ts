// 面談管理・面談可能日の承認・案件掲載/応募/反応 の見本データ。本物の名前ではない（lib/sample.ts の見本の人）。
import type { IvRec } from './live/mendan';
import type { AppsResp, CaseListResp, CasePostFull, StatsResp } from './live/keisai';

const p2 = (n: number) => String(n).padStart(2, '0');
/** 日本時間の今日から d 日後の 'YYYY-MM-DD HH:MM' */
function at(now: number, d: number, hm: string) {
  const t = new Date(now + 9 * 3600_000 + d * 86400_000);
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())} ${hm}`;
}

export function sampleInterviews(now: number): IvRec[] {
  const r = (id: string, name: string, d: number, hm: string, status: string, salesRep: string, caseInfo: string, extra: Partial<IvRec> = {}): IvRec =>
    ({ id, name, date: at(now, d, hm), status, salesRep, caseInfo, memo: '', trainer: '', rounds: '', category: '', location: 'オンライン', ...extra });
  return [
    r('iv01', '中村 優', 1, '10:00', '', '田中', '金融系 ヘルプデスク（大手町）', { trainer: '加藤', rounds: '1回' }),
    r('iv02', '佐々木 蓮', 0, '23:30', '', '小林', '開発 Java 研修あり（品川）'),
    r('iv03', '松本 結衣', -1, '14:00', '', '小林', 'テスト・検証（川崎）', { rounds: '1回' }),
    r('iv04', '加藤 葵', -4, '11:00', '', '田中', 'キッティング（新宿）'),
    r('iv05', '中村 優', -2, '16:00', '結果待ち', '田中', 'インフラ監視 夜勤あり（蒲田）', { rounds: '1回', location: '対面' }),
    r('iv06', '佐々木 蓮', -6, '13:00', '1回目通過', '小林', 'PMO補佐（渋谷）', { rounds: '2回' }),
    r('iv07', '松本 結衣', -8, '15:00', '2回目通過', '小林', 'ヘルプデスク（横浜）', { rounds: '2回', trainer: '加藤' }),
    r('iv08', '伊藤 誠', -10, '10:30', '成約', '小林', 'NW構築補佐（大宮）', { rounds: '1回' }),
    r('iv09', '加藤 葵', -9, '17:00', '見送り', '田中', 'サーバー運用（品川）'),
    r('iv10', '中村 優', -12, '09:30', '辞退', '田中', 'ヘルプデスク（千葉）', { memo: '通勤が長いため' }),
    r('iv11', '佐々木 蓮', 3, '13:30', '', '小林', '開発 C#（新橋）'),
  ];
}

export type AvailCand = {
  normalizedName: string; name: string; displayName: string; groupId: string; groupName: string;
  body: string; srcTsMs: number; status: 'new' | 'updated' | 'same'; currentBody: string; rawText: string; savedBy: string;
};
export type AvailResp = { ok: boolean; tableReady: boolean; hint?: string; candidates: AvailCand[]; counts: { new: number; updated: number; same: number }; scannedReplies: number; days: number };

export function sampleAvail(now: number): AvailResp {
  const c = (name: string, status: AvailCand['status'], body: string, currentBody: string, raw: string, ago: number, savedBy = ''): AvailCand =>
    ({ normalizedName: name.replace(/\s/g, ''), name, displayName: name, groupId: `g-${name}`, groupName: `${name}（見本）`, body, srcTsMs: now - ago * 3600_000, status, currentBody, rawText: raw, savedBy });
  const cands = [
    c('中村 優', 'new', '月 終日\n水 13時以降\n金 午前', '', '月曜は1日大丈夫です。水曜は13時以降、金曜は午前ならいけます', 3),
    c('佐々木 蓮', 'updated', '火 10〜15時\n木 終日', '火 午後\n木 午前', '今週は火曜の10時〜15時、木曜は1日空いてます', 20),
    c('松本 結衣', 'same', '平日 18時以降', '平日 18時以降', '平日は18時以降なら大丈夫です', 30, 'auto'),
  ];
  return { ok: true, tableReady: true, candidates: cands, counts: { new: 1, updated: 1, same: 1 }, scannedReplies: 42, days: 21 };
}

const iso = (now: number, d: number) => new Date(now + d * 86400_000).toISOString();

export function sampleCaseList(now: number): CaseListResp {
  const items: CaseListResp['items'] = [
    { id: 'c1', title: '大手小売 店舗向けヘルプデスク', area: '東京23区', job: 'ヘルプデスク／サポート', status: 'open', audience: 'all', pinned: true, headcount: 2, close_on: null, published_at: iso(now, -3), updated_at: iso(now, -3), tab: 'open', expired: false, views: 58, applies: 4 },
    { id: 'c2', title: 'キッティング 短期・研修あり', area: '神奈川', job: 'キッティング・現地作業', status: 'open', audience: 'all', pinned: false, headcount: 5, close_on: null, published_at: iso(now, -9), updated_at: iso(now, -9), tab: 'open', expired: false, views: 31, applies: 2 },
    { id: 'c3', title: '監視運用 夜勤あり（下書き）', area: '千葉', job: 'インフラ・NW', status: 'draft', audience: 'all', pinned: false, headcount: null, close_on: null, published_at: null, updated_at: iso(now, -1), tab: 'draft', expired: false, views: 0, applies: 0 },
    { id: 'c4', title: 'テスト・検証 一部リモート', area: '埼玉', job: 'テスト・検証', status: 'closed', audience: 'all', pinned: false, headcount: 1, close_on: null, published_at: iso(now, -30), updated_at: iso(now, -12), tab: 'closed', expired: false, views: 77, applies: 6 },
  ];
  return { ok: true, items, counts: { draft: 1, open: 2, closed: 1 }, errors: [] };
}

export const sampleCaseFull = (id: string, list: CaseListResp): CasePostFull => {
  const r = list.items.find((x) => x.id === id);
  return {
    id, title: r?.title ?? '', status: r?.status ?? 'draft', area: r?.area ?? null, job: r?.job ?? null, station: '最寄駅 徒歩5分（見本）',
    body_text: '【業務内容】\n・PCの設定・問い合わせ対応\n\n【勤務時間】\n9:00〜18:00\n\n【この案件のいいところ】\n・研修あり', work_styles: ['出社'], badges: ['未経験OK'],
    start_text: '来月〜', headcount: r?.headcount ?? null, audience: 'all', pinned: !!r?.pinned, close_on: null, slack_permalink: null,
  };
};

export function sampleApps(now: number): AppsResp {
  const a = (id: string, name: string, title: string, status: string, ago: number, extra: Partial<AppsResp['items'][number]> = {}): AppsResp['items'][number] => ({
    id, appNo: `A${id}`, postId: 'c1', caseTitle: title, caseArea: '東京23区', caseStation: null, name, unlinked: !name, note: '', skillsheetState: 'submitted',
    skillsheetLabel: '提出済み', status, statusLabel: ({ new: '未対応', checking: '確認中', interview: '面談調整中', passed: '成約', declined: '見送り' } as Record<string, string>)[status], assignee: '', appliedAt: iso(now, -ago), lateApply: false, ...extra,
  });
  const items = [
    a('261020-1', '中村 優', '大手小売 店舗向けヘルプデスク', 'new', 0.2, { note: '通勤1時間以内希望' }),
    a('261019-2', '佐々木 蓮', 'キッティング 短期・研修あり', 'checking', 1.5),
    a('261018-1', '松本 結衣', '大手小売 店舗向けヘルプデスク', 'interview', 3),
    a('261012-3', '', 'テスト・検証 一部リモート', 'new', 6, { skillsheetState: 'none', skillsheetLabel: '未提出', lateApply: true }),
    a('261008-1', '加藤 葵', 'テスト・検証 一部リモート', 'declined', 12),
  ];
  return {
    ok: true, items,
    counts: { new: 2, working: 2, all: items.length, declined: 1 },
    kpi: { thisWeek: 4, lastWeek: 1, newCount: 2, oldestNewAt: iso(now, -6), interviewCount: 1, last30Total: 5, last30Interview: 1, interviewRate: 0.2 },
  };
}

export function sampleStats(): StatsResp {
  return {
    ok: true, period: { preset: 'last_30d' }, friends: 420,
    funnel: {
      friends: 420, menuOfFriends: 0.31,
      steps: [
        { key: 'menu', label: 'リッチメニュー「案件情報」', hint: '友だちのうち', count: 210, users: 130, passRate: null, exceeded: false },
        { key: 'list', label: '一覧を見た', hint: 'メニューを押した人のうち', count: 260, users: 121, passRate: 0.93, exceeded: false },
        { key: 'detail', label: '詳細を開いた', hint: '一覧を見た人のうち', count: 180, users: 74, passRate: 0.61, exceeded: false },
        { key: 'apply_open', label: '応募ボタン', hint: '詳細を開いた人のうち', count: 22, users: 15, passRate: 0.2, exceeded: false },
        { key: 'apply_submit', label: '応募を送った', hint: '応募ボタンを押した人のうち', count: 9, users: 8, passRate: 0.53, exceeded: false },
      ],
    },
    buttons: [
      { event: 'filter_new', label: '一覧: 新着', place: 'list', taps: 48, users: 33, denominator: 121, denominatorLabel: '一覧表示 121', reactionRate: 0.27, deltaPt: 3.1 },
      { event: 'filter_remote', label: '一覧: リモート可', place: 'list', taps: 40, users: 29, denominator: 121, denominatorLabel: '一覧表示 121', reactionRate: 0.24, deltaPt: -1.2 },
      { event: 'keep', label: '一覧: ♡キープ', place: 'list', taps: 21, users: 14, denominator: 121, denominatorLabel: '一覧表示 121', reactionRate: 0.12, deltaPt: null },
      { event: 'ask_sales', label: '詳細: 営業に聞く', place: 'detail', taps: 12, users: 10, denominator: 74, denominatorLabel: '詳細開封 74', reactionRate: 0.14, deltaPt: 0.5 },
    ],
    posts: [
      { postId: 'c1', title: '大手小売 店舗向けヘルプデスク', area: '東京23区', publishedAt: null, pinned: true, cardImpr: 110, detailOpen: 41, openRate: 0.37, applyOpen: 9, applySubmit: 4, applyRate: 0.1 },
      { postId: 'c2', title: 'キッティング 短期・研修あり', area: '神奈川', publishedAt: null, pinned: false, cardImpr: 96, detailOpen: 25, openRate: 0.26, applyOpen: 4, applySubmit: 2, applyRate: 0.08 },
    ],
    weekly: [
      { week: '第1週', detailOpen: 14, applySubmit: 1 }, { week: '第2週', detailOpen: 19, applySubmit: 2 },
      { week: '第3週', detailOpen: 22, applySubmit: 3 }, { week: '第4週', detailOpen: 19, applySubmit: 2 },
    ],
    totals: { events: 812, users: 133 },
  };
}
