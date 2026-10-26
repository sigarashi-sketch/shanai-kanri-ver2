import { NextResponse } from 'next/server';
import { detailOf, listRows, runSkillsheet } from '@/lib/skillsheet-source';
import type { SsQuery } from '@/lib/skillsheet-types';

// スキルシート作成の口。中身は lib/skillsheet-source.ts（今の社内システムのAPI／ログインしていなければ空）。
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  if (u.get('action') === 'detail') return NextResponse.json(await detailOf(u.get('name') || ''));
  const one = <T extends string>(k: string, ok: readonly T[], d: T) => (ok.includes(u.get(k) as T) ? (u.get(k) as T) : d);
  const q: SsQuery = {
    q: u.get('q') || '', gender: u.get('gender') || '', pref: u.get('pref') || '', tantou: u.get('tantou') || '',
    sukishi: one('sukishi', ['', 'yes', 'no'] as const, ''), roster: one('roster', ['', 'yes', 'no'] as const, ''),
    sort: one('sort', ['desc', 'asc'] as const, 'desc'),
    limit: Math.min(100, Math.max(1, Number(u.get('limit')) || 20)), offset: Math.max(0, Number(u.get('offset')) || 0),
  };
  return NextResponse.json(await listRows(q));
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { action?: 'pdf' | 'xlsx'; name?: string; rosterId?: string; force?: boolean };
  if (!b.rosterId) return NextResponse.json({ ok: false, error: '保存先（営業リストの行）がありません' }, { status: 400 });
  return NextResponse.json(await runSkillsheet({ action: b.action, name: b.name, rosterId: b.rosterId, force: !!b.force }));
}
