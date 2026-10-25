import { NextResponse } from 'next/server';
import { IKE_ORIGIN, ikeToken } from '@/lib/ike';

// /ik/ で出した今の画面が呼ぶ /api/…（/ik/api/… に向け直してある）を、今の社内システムへそのまま中継する。
//   ・ログインした人のトークンで呼ぶ（Bearer＋Cookie sb_access・lib/ike.ts の ikeFetch と同じ）。権限の判定は全部今のシステム
//   ・中身は加工しない（計算・変換・コピーをしない）＝今の画面で見るのと同じデータ
//   ★半本番なので書き込みは通さない：GET 以外は全部 403
//   ★GET も、請求の2画面に要る口だけ通す（ほかの口はまだ中身を確かめていないので止める）
//     seikyu … 請求書づくり・請求書作成のデータ（下の BLOCK_SEIKYU 以外の action）
//     auth   … action=me だけ（今の画面の auth-guard.js / shell.js が「ログインしているか」を聞く）
//     live   … 他の人の保存の合図を読むだけ（live_events を select するだけ・live.js）
export const maxDuration = 60;

const WRITE_BLOCKED = '半本番では保存できません。今の社内システムの画面で操作してください';
// mnm-push / sheet-bulk はログインではなく鍵で受ける口（ミンミカの画面・cron 用）。画面からは呼ばない
const BLOCK_SEIKYU = new Set(['mnm-push', 'sheet-bulk']);

function allowedGet(api: string, rest: string[], sp: URLSearchParams): boolean {
  if (rest.length) return false;
  if (api === 'seikyu') return !BLOCK_SEIKYU.has(sp.get('action') || '');
  if (api === 'auth') return sp.get('action') === 'me';
  if (api === 'live') return true;
  return false;
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!path.length || !path.every((p) => /^[a-z0-9-]+$/i.test(p))) return NextResponse.json({ error: '行き先が違います' }, { status: 400 });
  const url = new URL(req.url);
  const [api, ...rest] = path;
  const token = await ikeToken();
  if (!token) {
    // auth-guard.js は me の答えが authenticated:false ならログイン画面（/ik/login.html＝案内）へ飛ばす
    if (api === 'auth' && url.searchParams.get('action') === 'me') return NextResponse.json({ authenticated: false });
    return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  }
  if (!allowedGet(api, rest, url.searchParams)) return NextResponse.json({ error: 'この画面からは使えない口です（半本番）', success: false }, { status: 403 });
  try {
    const r = await fetch(`${IKE_ORIGIN}/api/${path.join('/')}${url.search}`, {
      method: 'GET', cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(58000),
      headers: { Authorization: `Bearer ${token}`, Cookie: `sb_access=${token}`, Accept: req.headers.get('accept') || '*/*' },
    });
    const out = new Headers();
    for (const k of ['content-type', 'cache-control', 'content-disposition']) {
      const v = r.headers.get(k); if (v) out.set(k, v);
    }
    // Set-Cookie は渡さない（ver2 のログインは v2_ike_token で持つ）
    return new NextResponse(r.body, { status: r.status, headers: out });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}

function blocked() {
  return NextResponse.json({ ok: false, success: false, error: WRITE_BLOCKED }, { status: 403 });
}
export { blocked as POST, blocked as PUT, blocked as PATCH, blocked as DELETE };
