import { NextResponse } from 'next/server';
import { ikeKanawestNow, ikeToken } from '@/lib/ike';
import { sameSite } from '@/lib/ike-write';
import { syFetch } from '@/lib/soreyuke';

// 人財管理（それゆけ未経験から移した画面）の読み書きの口。/api/sy/s/teiki → それゆけの /api/s/teiki（lib/soreyuke.ts）。
//   ・通すのは移した画面が使う口だけ（SY_ALLOW）。中身は加工しない＝それゆけの画面で見るのと同じ
//   ・書き込み（POST・PUT・PATCH・DELETE）はこの画面（同じサイト）からだけ。止めるかどうかはそれゆけの決まりのまま（内勤一般は見るだけ 等）
//   ・gcal・freee-kintai はそれゆけを通して今の社内システムを読む（定期面談のカレンダー・名簿の詳細の勤怠・読むだけ）
const SY_ALLOW = new Set(['teiki', 'teams', 'roster', 'clubs', 'memos', 'mendan-remind', 'survey', 'survey-tpl', 'forms', 'enquete', 'richmenu', 'pon', 'ltv',
  // 従業員名簿・チャット・配信と、名簿の詳細（10-27 shoya「残した画面も人財管理へ」）
  'line', 'people', 'tags', 'member-tags', 'member-clubs', 'bousan', 'photo', 'roster-prefs', 'member-activity', 'proper-flags']);
export const maxDuration = 120;

async function handle(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const method = req.method.toUpperCase();
  if (!path.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return NextResponse.json({ error: '行き先が違います' }, { status: 400 });
  const ok = (path[0] === 's' && path.length >= 2 && SY_ALLOW.has(path[1]))
    || (path[0] === 's' && path[1] === 'kyouiku' && path[2] === 'check' && path.length === 3 && method === 'GET')   // 名簿の詳細のスキルチェック
    || ((path[0] === 'gcal' || path[0] === 'freee-kintai') && path.length === 1 && method === 'GET');   // 定期面談のカレンダー・名簿の詳細の勤怠（読むだけ）
  if (!ok) return NextResponse.json({ error: 'この口は通していません' }, { status: 403 });
  if (await ikeKanawestNow()) return NextResponse.json({ error: 'かな西エリアでは開けません' }, { status: 403 });
  if (method !== 'GET' && !sameSite(req)) return NextResponse.json({ error: 'この画面の外からは保存できません' }, { status: 403 });
  const token = await ikeToken();
  if (!token) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  const url = new URL(req.url);
  try {
    const r = await syFetch(token, `/api/${path.join('/')}${url.search}`, {
      method, body: method === 'GET' || method === 'HEAD' ? null : await req.arrayBuffer(), contentType: req.headers.get('content-type'),
    });
    if (r.status === 401) return NextResponse.json({ error: 'それゆけ未経験に入れませんでした（ロールが対象外か、ログインが切れています）' }, { status: 401 });
    const out = new Headers({ 'cache-control': 'no-store' });
    for (const k of ['content-type', 'content-disposition']) { const v = r.headers.get(k); if (v) out.set(k, v); }
    return new NextResponse(r.body, { status: r.status, headers: out });
  } catch (e) {
    return NextResponse.json({ error: `それゆけ未経験から読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
