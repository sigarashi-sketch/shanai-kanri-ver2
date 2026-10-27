import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';

// 人財管理の画面が読む今の社内システムの /api/gcal（読むだけ・10-27）。それゆけでは app/api/[...rest] が中継していたもの。
//   定期面談のカレンダーの予定（action=teikiEvents など）
// GET でも action が保存系の名前なら止める（それゆけ app/api/[...rest] の WRITE_ACTION と同じ）
const WRITE_ACTION = /^(save|add|set|update|upsert|delete|remove|refresh|sync|import|run|send|create|rename|assign|invite|reset|freee|apply|link|unlink|clear|mark)/i;
export const maxDuration = 60;
export async function GET(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ ok: false, error: 'ログインしてください' }, { status: 401 });
  const url = new URL(req.url);
  if (url.searchParams.getAll('action').length > 1 || WRITE_ACTION.test(url.searchParams.get('action') || '')) return NextResponse.json({ ok: false, error: 'この操作はここからは通していません' }, { status: 403 });
  try {
    const r = await ikeFetch(`/api/gcal${url.search}`, undefined, 55000);
    return new NextResponse(r.body, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
