import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { SALES_ROLES, buildHomeJinji, isMine, normName, type IkeInterview, type IkeNyuujou, type IkeRosterRows, type IkeRosterStatus, type IkeStoryList } from '@/lib/live/home-jinji';
import type { EngineerRows } from '@/lib/live/eigyo-common';
import type { FeedPost } from '@/lib/home-jinji-sample';
import type { JFeedRaw } from '@/lib/live/jinji';

// ホーム人事の本物。今の社内システムの読むだけの GET をまとめて、フィードの投稿にして返す。
//   ★呼ぶのは GET だけ（どれも今のシステム側で SELECT・カレンダー読みしかしない口であることを確かめた）：
//     auth?action=me / shoudaku-story?list=1 / joined?action=nyuujou / proxy?action=getInterviews（READ 表）/
//     proxy?action=getRosterStatus（READ 表）/ roster?action=getEngineerRows&area=main / proxy?action=getRosterData（営業のときだけ）
//     ※ joined は action=backfill（管理者が書く）と POST があるので、action=nyuujou 以外は呼ばない
//     ＋ jinji-v2?action=feed（10-26 足した読む口：定期面談・メモ・再アサイン・採用LINEの友だち追加。SELECT だけ）
//   ★絞り込みはここ（サーバ側）でする：未経験（プロパーリストにいる人）だけ・営業なら自分が担当営業の人だけ
const DAYS = 7;
class AuthGone extends Error {}

async function getJson<T>(path: string): Promise<T> {
  const r = await ikeFetch(path, undefined, 25000);
  if (r.status === 401) throw new AuthGone();
  if (!r.ok) throw new Error(`${path.split('?')[0]}（${r.status}）`);
  return (await r.json()) as T;
}
const soft = <T,>(p: Promise<T>, what: string, warn: string[]) => p.catch((e) => { if (e instanceof AuthGone) throw e; warn.push(`${what}が読めませんでした`); return null; });

/** ログインのトークン（Supabase の JWT）に入っている Google の表示名。今のシステムも同じ所から名前を取る（_auth.ts）。署名の確かめは今のシステムが毎回する */
function nameInToken(t: string): string {
  try {
    const p = JSON.parse(Buffer.from(t.split('.')[1] || '', 'base64url').toString('utf8')) as { user_metadata?: { full_name?: string; name?: string } };
    return String(p.user_metadata?.full_name || p.user_metadata?.name || '').trim();
  } catch { return ''; }
}

export async function GET() {
  const token = await ikeToken();
  if (!token) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const warn: string[] = [];
  try {
    const me = await getJson<{ authenticated?: boolean; role?: string }>('/api/auth?action=me');
    if (!me.authenticated) throw new AuthGone();
    const scope: 'all' | 'mine' = SALES_ROLES.includes(String(me.role || '')) ? 'mine' : 'all';
    const myName = scope === 'mine' ? nameInToken(token) : '';
    const [story, nyuujou, interviews, status, engineers, roster] = await Promise.all([
      soft(getJson<IkeStoryList>('/api/shoudaku-story?list=1&days=60'), '承諾・参画決定・辞退', warn),
      soft(getJson<IkeNyuujou>('/api/joined?action=nyuujou'), '入場日', warn),
      soft(getJson<IkeInterview[]>('/api/proxy?action=getInterviews'), '現場面談', warn),
      soft(getJson<IkeRosterStatus[]>('/api/proxy?action=getRosterStatus'), '退社', warn),
      soft(getJson<EngineerRows>('/api/roster?action=getEngineerRows&area=main'), 'プロパーリスト', warn),
      scope === 'mine' ? soft(getJson<IkeRosterRows>('/api/proxy?action=getRosterData'), '担当営業（名簿）', warn) : Promise.resolve(null),
    ]);
    // 定期面談・メモ・再アサイン・LINE 友だち追加（読めなければ見本のまま＝missing に残す）
    const feed = await getJson<{ ok: boolean; rows: JFeedRaw[]; warnings?: string[] }>(`/api/jinji-v2?action=feed&days=${DAYS}`).catch((e) => { if (e instanceof AuthGone) throw e; return null; });
    const mikeiken = engineers?.rows ? new Map(engineers.rows.map((r) => [normName(r.name), r.name] as [string, string]).filter(([k]) => !!k)) : null;
    let reps: Map<string, string[]> | null = null;
    if (roster?.rows) {
      reps = new Map();
      for (const r of roster.rows) { const k = normName(r.name); const v = String(r.rep || '').trim(); if (k && v) reps.set(k, [...(reps.get(k) || []), v]); }
    }
    const { posts, warnings } = buildHomeJinji({
      now: Date.now(), days: DAYS, story, nyuujou, interviews: Array.isArray(interviews) ? interviews : null,
      status: Array.isArray(status) ? status : null, mikeiken, reps, meNorm: normName(myName), scope,
    });
    const missing = feed ? [] : ['teiki', 'memo', 'reassign', 'line'];
    if (feed && mikeiken) {
      const since = Date.now() - DAYS * 86400000;
      const extra: FeedPost[] = [];
      for (const r of feed.rows || []) {
        const nn = normName(r.name); const name = mikeiken.get(nn);
        if (!name || !(Date.parse(r.at) >= since)) continue;
        const sales = reps?.get(nn)?.[0] || '';
        if (scope === 'mine' && !isMine(sales, normName(myName))) continue;
        extra.push({ id: `v2-${r.id}`, type: r.type, at: r.at, people: [{ name, ...(sales ? { sales } : {}) }], text: r.text, sub: r.sub });
      }
      posts.push(...extra);
      posts.sort((a, b) => String(b.at).localeCompare(String(a.at)));
      for (const w of feed.warnings || []) warnings.push(`${w}が読めませんでした`);
    }
    return NextResponse.json({ posts, scope, me: scope === 'mine' ? myName : '', missing, warnings: [...warn, ...warnings] });
  } catch (e) {
    if (e instanceof AuthGone) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
