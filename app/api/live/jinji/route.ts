import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { ikeWrite, sameSite } from '@/lib/ike-write';

// 人事の「今のシステムに無かったもの」の口（10-26 shoya「今週で本番に使えるようにする」）。行き先は今のシステムの /api/jinji-v2 だけ。
//   GET  ?what=me|yoyaku|mendan-follow|mendan-rishoku|shikaku|sankyu|community|jimu|feed|rishoku … 読むだけ
//   POST {action, ...} … 下の WRITES にある action だけ（決め打ち）。値の検証は今のシステム側（_jinji_v2.ts）でもする
//     history / ocr-current / ocr-read は「読む」だが、名前・写真を URL に出さないため POST
//   ★人に届く送信はしない（コミュニティの呼びかけは「呼びかけた」と残すだけ）
//   ★権限の判定は今のシステム（ログインした人のトークン・ロール）
const READS: Record<string, string> = {
  me: 'me', yoyaku: 'yoyaku', 'mendan-follow': 'mendan&kind=follow', 'mendan-rishoku': 'mendan&kind=rishoku', shikaku: 'shikaku',
  sankyu: 'sankyu', community: 'community', jimu: 'jimu', feed: 'feed&days=7', rishoku: 'rishoku',
};
const WRITES = new Set([
  'history', 'ocr-current', 'ocr-read', 'ocr-apply',
  'yoyaku-add', 'yoyaku-approve', 'yoyaku-cancel', 'yoyaku-restore',
  'mendan-save', 'mendan-set',
  'shikaku-check', 'shikaku-reflect',
  'sankyu-save', 'sankyu-done', 'sankyu-close',
  'community-event-save', 'community-event-delete', 'community-call', 'community-rsvp',
  'jimu-lane',
]);

export async function GET(req: Request) {
  const what = new URL(req.url).searchParams.get('what') || '';
  const q = READS[what];
  if (!q) return NextResponse.json({ error: '読み口が違います' }, { status: 400 });
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  try {
    const r = await ikeFetch(`/api/jinji-v2?action=${q}`, undefined, 30000);
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    if (!r.ok) return NextResponse.json({ ...j, error: (j as { error?: string; hint?: string }).hint || (j as { error?: string }).error || `読めませんでした（${r.status}）` }, { status: r.status });
    return NextResponse.json(j);
  } catch (e) {
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!sameSite(req)) return NextResponse.json({ error: 'この画面の外からは保存できません' }, { status: 403 });
  const b = ((await req.json().catch(() => null)) || {}) as Record<string, unknown>;
  const action = typeof b.action === 'string' ? b.action : '';
  if (!WRITES.has(action)) return NextResponse.json({ error: '書く種類が違います' }, { status: 400 });
  const rest = { ...b };
  delete rest.action;
  // 写真は大きいので待ちを長く（読み取りは 60秒まで）
  return ikeWrite(req, `/api/jinji-v2?action=${action}`, rest, { timeoutMs: action === 'ocr-read' ? 70000 : 30000 });
}
