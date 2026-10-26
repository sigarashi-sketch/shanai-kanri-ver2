import { NextResponse } from 'next/server';
import { IKE_ORIGIN, ikeFetchCached, ikeToken } from '@/lib/ike';

// /ik/ で出した今の画面が呼ぶ /api/…（/ik/api/… に向け直してある）を、今の社内システムへそのまま中継する。
//   ・ログインした人のトークンで呼ぶ（Bearer＋Cookie sb_access・lib/ike.ts の ikeFetch と同じ）。権限の判定は全部今のシステム
//   ・中身は加工しない（計算・変換・コピーをしない）＝今の画面で見るのと同じデータ
//   ★半本番なので書き込みは通さない：GET 以外は全部 403
//   ★GET も、請求の2画面に要る口だけ通す（10-25 action を名前で決めた。今のシステムには GET でも書く口があるので「これ以外」で止めない）
//     seikyu … 請求書づくり（seikyu.html）・請求書作成（seikyu-make.html・seikyu-sheets.js）が GET で読む action だけ（SEIKYU_GET）
//     auth   … action=me だけ（今の画面の auth-guard.js / shell.js が「ログインしているか」を聞く）
//     live   … 他の人の保存の合図を読むだけ（live_events を select するだけ・live.js）。?since=数字 だけ通す
//   ★名前が書き込みっぽい action（save・set・delete…）は念のため全部止める
export const maxDuration = 60;

const WRITE_BLOCKED = '半本番では保存できません。今の社内システムの画面で操作してください';
const NOT_ALLOWED = 'この読み口は通していません';
const SEIKYU_GET = new Set([
  // seikyu.html
  'list', 'docs', 'mails', 'mails-summary',
  // seikyu-make.html
  'make', 'genba-inputs', 'month-summary', 'saved-list', 'saved-get', 'saved-pdf', 'saved-pdf-check', 'stamped-list', 'stamped-pdf', 'gk-list', 'gk-file', 'issuers',
  // seikyu-sheets.js
  'mnm-sheets', 'mnm-sheet-file',
]);
// 語の頭だけで見る（saved-list・saved-pdf など「保存したものを読む」口まで止めていた・10-26）
const WRITE_LIKE = /^(save|set|delete|update|add|remove|create|send|upsert|toggle)(?![a-z])/i;

function allowedGet(api: string, rest: string[], sp: URLSearchParams): boolean {
  if (rest.length) return false;
  if (sp.getAll('action').length > 1) return false;
  const action = sp.get('action') || '';
  if (WRITE_LIKE.test(action)) return false;
  if (api === 'seikyu') return SEIKYU_GET.has(action);
  if (api === 'auth') return action === 'me';
  if (api === 'live') return [...sp.keys()].every((k) => k === 'since') && /^\d*$/.test(sp.get('since') || '');
  return false;
}

// live.js は見えているタブで5秒ごとに呼ぶ。同じ人の同じ since は5秒だけ控えを返す（タブを2つ開いていても今のシステムには1本）
const LIVE_TTL = 5000;

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
  if (!allowedGet(api, rest, url.searchParams)) return NextResponse.json({ error: NOT_ALLOWED, success: false }, { status: 403 });
  if (api === 'live') {
    try {
      const r = await ikeFetchCached(`/api/live${url.search}`, LIVE_TTL, { timeoutMs: 15000 });
      return NextResponse.json(r.data, { status: r.status, headers: { 'cache-control': 'no-store' } });
    } catch (e) {
      return NextResponse.json({ ok: false, error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
    }
  }
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
