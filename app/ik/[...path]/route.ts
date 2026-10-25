import { NextResponse } from 'next/server';
import { IKE_ORIGIN, ikeToken } from '@/lib/ike';
import { ASSET_TYPES, IK_PAGES, LOGIN_NOTICE, embedHtml, noticeHtml, rewritePaths } from '../embed';

// 今の社内システムの画面を ver2 と同じ origin の /ik/… から出す（お手本：それゆけ app/ik/[...path]/route.ts）。
//   /ik/seikyu.html      … 請求書づくり（現場マスタ・取引先マスタなど）
//   /ik/seikyu-make.html … 請求書作成（作成・格納）
//   /ik/shell.js など    … その画面が読むコード（今のものを毎回そのまま取る・行き先だけ /ik/ に向け直す）
//   ★画面のコードもデータも今のシステムが正。ver2 は写しを持たない＝本番を切り替えても同じデータ・同じ計算
//   ★画面が呼ぶ /api/… は /ik/api/… に向け直してあり、そこで今のシステムへ中継する（app/ik/api/[...path]/route.ts）
const html = (body: string, status = 200) =>
  new NextResponse(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!path.length || !path.every((p) => /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(p))) return html(noticeHtml('開けません', '行き先が違います。'), 400);
  const name = path.join('/');
  const ext = (name.split('.').pop() || '').toLowerCase();
  const qs = new URL(req.url).search;

  if (ext === 'html') {
    // 今の画面がログイン切れで /login.html へ飛ばしたとき（/ik/login.html に向け直してある）
    if (name === 'login.html') return html(LOGIN_NOTICE());
    if (!(await ikeToken())) return html(LOGIN_NOTICE());
    if (!IK_PAGES.has(name)) return html(noticeHtml('この画面はまだ開けません', '今の社内システムの画面で開いてください。'), 404);
    try {
      const r = await fetch(`${IKE_ORIGIN}/${name}${qs}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (!r.ok) return html(noticeHtml('読めませんでした', `今の社内システムから画面を読めませんでした（${r.status}）。`), 502);
      return html(embedHtml(await r.text()));
    } catch (e) {
      return html(noticeHtml('読めませんでした', `今の社内システムから画面を読めませんでした（${(e as Error).message}）。`), 502);
    }
  }

  const type = ASSET_TYPES[ext];
  if (!type) return new NextResponse('not found', { status: 404 });
  try {
    const r = await fetch(`${IKE_ORIGIN}/${name}${qs}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!r.ok) return new NextResponse('not found', { status: r.status === 404 ? 404 : 502 });
    const headers = { 'content-type': type, 'cache-control': 'no-store' };
    // コード（JS・CSS）は行き先だけ書き換える。画像・字体はそのまま
    if (ext === 'js' || ext === 'css') return new NextResponse(rewritePaths(await r.text()), { headers });
    return new NextResponse(r.body, { headers });
  } catch {
    return new NextResponse('upstream error', { status: 502 });
  }
}
