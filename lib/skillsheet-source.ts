import 'server-only';
import { cookies } from 'next/headers';
import type { SsDetail, SsList, SsQuery, SsResult, SsRow } from './skillsheet-types';

// スキルシート作成のデータの出どころ。
//   ・本物：今の社内システム（IKEIKE_ORIGIN）の /api/basic-info・/api/skillsheet を、ログインした人のトークンで呼ぶ。
//     中身の計算（検索・絞り込み・件数・生成・PDF・Excel）は全部今のシステムがやる＝仕様は今と同じ
//   ・トークンが無いとき（まだログインをつないでいない）は見本データ。見本では本物を作らない
export const IKE_TOKEN_COOKIE = 'v2_ike_token';
const ORIGIN = process.env.IKEIKE_ORIGIN || 'https://ikeike-app.vercel.app';

async function token(): Promise<string> {
  return (await cookies()).get(IKE_TOKEN_COOKIE)?.value || '';
}

async function callIke<T>(path: string, init?: RequestInit, timeoutMs = 25000): Promise<T> {
  const t = await token();
  const r = await fetch(ORIGIN + path, {
    ...init, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
  });
  const j = (await r.json().catch(() => ({ error: `応答が読めませんでした（${r.status}）` }))) as T & { error?: string };
  if (r.status === 401) return { ...j, error: 'ログインが切れました。もう一度ログインしてください' } as T;
  return j;
}

export async function isLive() { return !!(await token()); }

export async function listRows(q: SsQuery): Promise<SsList> {
  if (await isLive()) {
    const p = new URLSearchParams({ action: 'list', limit: String(q.limit), offset: String(q.offset), sort: q.sort });
    for (const k of ['q', 'gender', 'pref', 'tantou', 'sukishi', 'roster'] as const) if (q[k]) p.set(k, q[k]);
    const j = await callIke<SsList>(`/api/basic-info?${p}`);
    return { ...j, rows: j.rows || [], source: 'live' };
  }
  return { ...sampleList(q), source: 'sample' };
}

export async function detailOf(name: string): Promise<SsDetail> {
  if (await isLive()) return callIke<SsDetail>(`/api/basic-info?action=detail&name=${encodeURIComponent(name)}`);
  return sampleDetail(name);
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
    sheet: { name: r.name, kana: '（見本）', gender: r.gender, birth: r.birth, address: `${r.prefecture}（見本）`, eki: r.eki, email: '（見本）', gakureki: '高等学校卒業', tools: 'Excel・Word', shikaku: 'なし', tokui: '事務', shift: '可', yakin: '不可', shutcho: '不可' },
    work: [{ company: '見本の会社', from: '2019/04', to: '2023/03', emp_type: '正社員', job_category: '事務', description: '受発注の入力・電話対応（見本）' }],
    analysis: [{ label: '希望の働き方', value: '（見本）' }],
    health: [], submittedAt: new Date().toISOString(), durationSec: 900,
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
