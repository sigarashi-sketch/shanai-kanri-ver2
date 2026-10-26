import 'server-only';
import { IKE_TOKEN_COOKIE, ikeFetch, ikeToken } from './ike';
import { loadMikeikenSet } from './live/mikeiken-server';
import { isMikeiken } from './live/mikeiken';
import type { SsDetail, SsList, SsQuery, SsResult } from './skillsheet-types';

// スキルシート作成のデータの出どころ。
//   ・本物：今の社内システム（IKEIKE_ORIGIN）の /api/basic-info・/api/skillsheet を、ログインした人のトークンで呼ぶ。
//     中身の計算（検索・絞り込み・件数・生成・PDF・Excel）は全部今のシステムがやる＝仕様は今と同じ
//   ・トークンが無いとき（まだログインをつないでいない）は空＋「ログインしてください」（source: 'sample' は未ログインのしるし・架空のデータは出さない）
export { IKE_TOKEN_COOKIE };

async function callIke<T>(path: string, init?: RequestInit, timeoutMs = 25000): Promise<T> {
  const r = await ikeFetch(path, init, timeoutMs);
  const j = (await r.json().catch(() => ({ error: `応答が読めませんでした（${r.status}）` }))) as T & { error?: string };
  if (r.status === 401) return { ...j, error: 'ログインが切れました。もう一度ログインしてください' } as T;
  return j;
}

const NEED_LOGIN = 'ログインしてください（会社のアカウントでログインすると見られます）';

export async function isLive() { return !!(await ikeToken()); }

// ★本物は未経験の人だけ（今のプロパーリスト＝営業リスト sales_roster に入っている人・10-25 shoya）。
//   今の /api/basic-info の roster=yes（営業リストに名前がある＝全エリアの sales_roster）で絞る。件数・stats も絞ったあとの数になる
//   （同じ名前が営業リストに2人いる「要確認」の行も roster=yes に入る＝同姓同名は区別しない）
export async function listRows(q: SsQuery): Promise<SsList> {
  if (await isLive()) {
    const p = new URLSearchParams({ action: 'list', limit: String(q.limit), offset: String(q.offset), sort: q.sort });
    for (const k of ['q', 'gender', 'pref', 'tantou', 'sukishi'] as const) if (q[k]) p.set(k, q[k]);
    p.set('roster', 'yes');
    if (q.roster === 'no') p.set('limit', '1');   // 「リストにいない」＝未経験ではない人なので出さない（件数の材料だけ読む）
    const j = await callIke<SsList>(`/api/basic-info?${p}`);
    if (q.roster === 'no') return { ...j, rows: [], total: 0, offset: 0, stats: { shown: 0, inRoster: 0, hasSukishi: 0, noSukishi: 0, hasBirth: 0 }, source: 'live' };
    return { ...j, rows: j.rows || [], source: 'live' };
  }
  return {
    ok: false, error: NEED_LOGIN, rows: [], total: 0, grandTotal: 0, offset: 0,
    stats: { shown: 0, inRoster: 0, hasSukishi: 0, noSukishi: 0, hasBirth: 0 }, facets: { gender: [], pref: [], tantou: [] }, source: 'sample',
  };
}

export async function detailOf(name: string): Promise<SsDetail> {
  if (await isLive()) {
    const mk = await loadMikeikenSet().catch(() => null);
    if (!mk || !isMikeiken(mk, name)) return { ok: false, error: mk ? '未経験の人（今のプロパーリストに入っている人）ではないので出していません' : 'プロパーリストが読めないので、未経験の人か確かめられませんでした' };
    // ★健康状況は読まない（health=0）。連絡先・住所・生年月日・緊急連絡先もここで落としてから画面へ返す（10-25 shoya「健康の情報は出さない」）
    const j = await callIke<SsDetail & Record<string, unknown>>(`/api/basic-info?action=detail&health=0&name=${encodeURIComponent(name)}`);
    return safeDetail(j);
  }
  return { ok: false, error: NEED_LOGIN };
}

// 画面に渡さない項目（要配慮・連絡先・住所・生年月日・緊急連絡先）。年齢だけは残す
const DROP_SHEET = new Set(['phone', 'email', 'address', 'birth', 'emName', 'emRelation', 'emPhone', 'emAddress', 'keirekiText', 'timestamp']);
function safeDetail(j: SsDetail & Record<string, unknown>): SsDetail {
  const { health: _h, healthConsentAt: _c, healthError: _e, ...rest } = j as Record<string, unknown>;
  void _h; void _c; void _e;
  const sheet = j.sheet ? Object.fromEntries(Object.entries(j.sheet).filter(([k]) => !DROP_SHEET.has(k))) as Record<string, string> : j.sheet;
  return { ...(rest as SsDetail), sheet };
}

export async function runSkillsheet(body: { action?: 'pdf' | 'xlsx'; name?: string; rosterId: string; force?: boolean }): Promise<SsResult> {
  if (await isLive()) return callIke<SsResult>('/api/skillsheet', { method: 'POST', body: JSON.stringify(body) }, 90000);
  return { ok: false, error: NEED_LOGIN };
}
