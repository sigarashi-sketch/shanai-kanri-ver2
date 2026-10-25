import 'server-only';
import { IKE_TOKEN_COOKIE, ikeFetch, ikeToken } from './ike';
import { loadMikeikenSet } from './live/mikeiken-server';
import { isMikeiken } from './live/mikeiken';
import type { SsDetail, SsList, SsQuery, SsResult, SsRow } from './skillsheet-types';

// スキルシート作成のデータの出どころ。
//   ・本物：今の社内システム（IKEIKE_ORIGIN）の /api/basic-info・/api/skillsheet を、ログインした人のトークンで呼ぶ。
//     中身の計算（検索・絞り込み・件数・生成・PDF・Excel）は全部今のシステムがやる＝仕様は今と同じ
//   ・トークンが無いとき（まだログインをつないでいない）は見本データ。見本では本物を作らない
export { IKE_TOKEN_COOKIE };

async function callIke<T>(path: string, init?: RequestInit, timeoutMs = 25000): Promise<T> {
  const r = await ikeFetch(path, init, timeoutMs);
  const j = (await r.json().catch(() => ({ error: `応答が読めませんでした（${r.status}）` }))) as T & { error?: string };
  if (r.status === 401) return { ...j, error: 'ログインが切れました。もう一度ログインしてください' } as T;
  return j;
}

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
  return { ...sampleList(q), source: 'sample' };
}

export async function detailOf(name: string): Promise<SsDetail> {
  if (await isLive()) {
    const mk = await loadMikeikenSet().catch(() => null);
    if (!mk || !isMikeiken(mk, name)) return { ok: false, error: mk ? '未経験の人（今のプロパーリストに入っている人）ではないので出していません' : 'プロパーリストが読めないので、未経験の人か確かめられませんでした' };
    // ★健康状況は読まない（health=0）。連絡先・住所・生年月日・緊急連絡先もここで落としてから画面へ返す（10-25 shoya「健康の情報は出さない」）
    const j = await callIke<SsDetail & Record<string, unknown>>(`/api/basic-info?action=detail&health=0&name=${encodeURIComponent(name)}`);
    return safeDetail(j);
  }
  return safeDetail(sampleDetail(name));
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
  return sampleRun(body);
}

// ---- 見本（本物の名前・数字ではない） ---------------------------------------------
const SEI = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '清水', '山崎'];
const MEI = ['陽菜', '蓮', '結衣', '湊', '美咲', '大翔', '葵', '悠真', 'さくら', '颯太', '芽依', '陸', '凛', '翼', '心春', '海斗', '莉子', '樹', '七海', '蒼'];
const PREF = [['東京都', '新宿'], ['神奈川県', '武蔵小杉'], ['埼玉県', '大宮'], ['千葉県', '船橋'], ['東京都', '池袋'], ['神奈川県', '横浜'], ['埼玉県', '浦和'], ['東京都', '立川']];
const TANTOU = ['中村', '佐藤', '高木', '森'];
const SAMPLE: SsRow[] = Array.from({ length: 46 }, (_, i) => {
  const [prefecture, eki] = PREF[(i * 3) % PREF.length];
  const inRoster = i % 9 !== 4;
  const ambiguous = i === 13 || i === 31;
  const has = inRoster && !ambiguous && i % 4 !== 1;
  const y = 1990 + ((i * 7) % 15), m = ((i * 5) % 12) + 1, d = ((i * 11) % 27) + 1;
  return {
    name: `${SEI[i % SEI.length]} ${MEI[(i * 7) % MEI.length]}`,
    gender: i % 3 === 0 ? '男性' : '女性',
    birth: i % 10 === 7 ? '' : `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`,
    prefecture, eki, tantou: ambiguous ? '' : TANTOU[i % TANTOU.length],
    inRoster: inRoster || ambiguous, ambiguous,
    rosterId: inRoster && !ambiguous ? `r${1000 + i}` : undefined,
    sukishi: has ? `見本のスキルシート（${i + 1}）` : '',
  };
});

function facet(rows: SsRow[], k: 'gender' | 'prefecture' | 'tantou') {
  const m = new Map<string, number>();
  for (const r of rows) if (r[k]) m.set(r[k], (m.get(r[k]) || 0) + 1);
  return [...m].map(([v, n]) => ({ v, n })).sort((a, b) => b.n - a.n);
}

function sampleList(q: SsQuery): SsList {
  const norm = (s: string) => s.replace(/[\s　]/g, '');
  const hit = SAMPLE.filter((r) =>
    (!q.q || norm(r.name).includes(norm(q.q))) && (!q.gender || r.gender === q.gender) && (!q.pref || r.prefecture === q.pref) &&
    (!q.tantou || r.tantou === q.tantou) && (!q.sukishi || (q.sukishi === 'yes') === !!r.sukishi) && (!q.roster || (q.roster === 'yes') === r.inRoster));
  const sorted = q.sort === 'asc' ? [...hit].reverse() : hit;
  const offset = Math.min(q.offset, Math.max(0, Math.floor((sorted.length - 1) / q.limit) * q.limit));
  return {
    ok: true, rows: sorted.slice(offset, offset + q.limit), total: sorted.length, grandTotal: SAMPLE.length, offset,
    stats: { shown: hit.length, inRoster: hit.filter((r) => r.inRoster).length, hasSukishi: hit.filter((r) => r.sukishi).length, noSukishi: hit.filter((r) => !r.sukishi).length, hasBirth: hit.filter((r) => r.birth).length },
    facets: { gender: facet(SAMPLE, 'gender'), pref: facet(SAMPLE, 'prefecture'), tantou: facet(SAMPLE, 'tantou') },
    syncedAt: new Date().toISOString(),
  };
}

function sampleDetail(name: string): SsDetail {
  const r = SAMPLE.find((x) => x.name === name);
  if (!r) return { ok: false, error: '見つかりませんでした' };
  return {
    ok: true,
    sheet: { name: r.name, kana: '（見本）', gender: r.gender, eki: r.eki, gakureki: '高等学校卒業', tools: 'Excel・Word', shikaku: 'なし', tokui: '事務', shift: '可', yakin: '不可', shutcho: '不可' },
    work: [{ company: '見本の会社', from: '2019/04', to: '2023/03', emp_type: '正社員', job_category: '事務', description: '受発注の入力・電話対応（見本）' }],
    analysis: [{ label: '希望の働き方', value: '（見本）' }],
    submittedAt: new Date().toISOString(), durationSec: 900,
  };
}

const sampleDone = new Set<string>();
async function sampleRun(body: { action?: string; rosterId: string; force?: boolean }): Promise<SsResult> {
  await new Promise((res) => setTimeout(res, 1600));
  const r = SAMPLE.find((x) => x.rosterId === body.rosterId);
  if (!r) return { ok: false, error: '営業リストに一意にいないので保存先が決められません' };
  if (!body.action && r.sukishi && !body.force && !sampleDone.has(body.rosterId)) return { needsConfirm: true, existing: r.sukishi };
  if (!body.action) { r.sukishi = r.sukishi || `見本のスキルシート（${r.name}）`; sampleDone.add(body.rosterId); }
  const note = '見本なので本物は作っていません';
  if (body.action === 'pdf') return { ok: true, pdfUrl: note, pdfAnonUrl: note };
  if (body.action === 'xlsx') return { ok: true, xlsxUrl: note, xlsxAnonUrl: note };
  return { ok: true, url: note, anonymized: true, pdfUrl: note, pdfAnonUrl: note };
}
