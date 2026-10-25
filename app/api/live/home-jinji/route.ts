import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { SALES_ROLES, buildHomeJinji, normName, type IkeInterview, type IkeNyuujou, type IkeRosterRows, type IkeRosterStatus, type IkeStoryList } from '@/lib/live/home-jinji';
import type { EngineerRows } from '@/lib/live/eigyo-common';

// ホーム人事の本物。今の社内システムの読むだけの GET をまとめて、フィードの投稿にして返す。
//   ★呼ぶのは GET だけ（どれも今のシステム側で SELECT・カレンダー読みしかしない口であることを確かめた）：
//     auth?action=me / shoudaku-story?list=1 / joined?action=nyuujou / proxy?action=getInterviews（READ 表）/
//     proxy?action=getRosterStatus（READ 表）/ roster?action=getEngineerRows&area=main / proxy?action=getRosterData（営業のときだけ）
//     ※ joined は action=backfill（管理者が書く）と POST があるので、action=nyuujou 以外は呼ばない
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
    // 今のシステムに「まとめて読む口」が無い種類（見本のまま）
    const missing = ['teiki', 'memo', 'reassign', 'line'];
    return NextResponse.json({ posts, scope, me: scope === 'mine' ? myName : '', missing, warnings: [...warn, ...warnings] });
  } catch (e) {
    if (e instanceof AuthGone) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
