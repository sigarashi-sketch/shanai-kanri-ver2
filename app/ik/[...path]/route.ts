import { NextResponse } from 'next/server';
import { IKE_ORIGIN, ikeToken } from '@/lib/ike';
import { ASSET_TYPES, IK_PAGES, LOGIN_NOTICE, embedHtml, noticeHtml, rewriteAsset } from '../embed';

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
  const u = new URL(req.url);
  const pane = u.searchParams.get('v2pane');
  u.searchParams.delete('v2pane');
  const qs = u.search;

  if (ext === 'html') {
    // 今の画面がログイン切れで /login.html へ飛ばしたとき（/ik/login.html に向け直してある）
    if (name === 'login.html') return html(LOGIN_NOTICE());
    if (!(await ikeToken())) return html(LOGIN_NOTICE());
    if (!IK_PAGES.has(name)) return html(noticeHtml('この画面はまだ開けません', '今の社内システムの画面で開いてください。'), 404);
    try {
      const r = await fetch(`${IKE_ORIGIN}/${name}${qs}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (!r.ok) return html(noticeHtml('読めませんでした', `今の社内システムから画面を読めませんでした（${r.status}）。`), 502);
      return html(embedHtml(await r.text(), {
        pane: name === 'seikyu-make.html' && (pane === 'make' || pane === 'store') ? pane : undefined,
        noWatermarkDocs: name === 'seikyu-make.html' || name === 'seikyu.html',   // 請求書の書類に透かしを入れない
      }));
    } catch (e) {
      return html(noticeHtml('読めませんでした', `今の社内システムから画面を読めませんでした（${(e as Error).message}）。`), 502);
    }
  }

  const type = ASSET_TYPES[ext];
  if (!type) return new NextResponse('not found', { status: 404 });
  try {
    // 画面のコード・画像はデータを含まない（今のシステムでもログインなしで読める）。ブラウザに5分だけ控えてもらう（10-25）
    //   ＝ページを移るたびに今のシステムから取り直さない。直した画面のコードは長くても5分で届く。HTML は no-store のまま
    const r = await fetch(`${IKE_ORIGIN}/${name}${qs}`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return new NextResponse('not found', { status: r.status === 404 ? 404 : 502, headers: { 'cache-control': 'no-store' } });
    const headers = { 'content-type': type, 'cache-control': 'public, max-age=300' };
    // コード（JS・CSS）は行き先だけ書き換える。画像・字体はそのまま
    if (ext === 'js' || ext === 'css') return new NextResponse(rewriteAsset(name, await r.text()), { headers });
    return new NextResponse(r.body, { headers });
  } catch {
    return new NextResponse('upstream error', { status: 502 });
  }
}
