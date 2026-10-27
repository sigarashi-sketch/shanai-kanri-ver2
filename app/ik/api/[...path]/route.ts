import { NextResponse } from 'next/server';
import { IKE_ORIGIN, ikeFetchCached, ikeKanawestNow, ikeToken } from '@/lib/ike';
import { sameSite } from '@/lib/ike-write';
import { dropUserCache } from '@/lib/cache';

// /ik/ で出した今の画面が呼ぶ /api/…（/ik/api/… に向け直してある）を、今の社内システムへそのまま中継する。
//   ・ログインした人のトークンで呼ぶ（Bearer＋Cookie sb_access・lib/ike.ts の ikeFetch と同じ）。権限の判定は全部今のシステム
//   ・中身は加工しない（計算・変換・コピーをしない）＝今の画面で見るのと同じデータ
//   ★書き込み（POST）は請求の3画面が今の画面で押す口だけ通す（SEIKYU_POST・10-26 shoya「今の画面と同じ保存・PDF・格納を押せるように」）。
//     ほかの口・ほかの API・PUT/PATCH/DELETE は 403。同じサイト（この iframe）からの POST だけ
//   ★GET も、請求の2画面に要る口だけ通す（10-25 action を名前で決めた。今のシステムには GET でも書く口があるので「これ以外」で止めない）
//     seikyu … 請求書づくり（seikyu.html）・請求書作成（seikyu-make.html・seikyu-sheets.js）が GET で読む action だけ（SEIKYU_GET）
//     auth   … action=me だけ（今の画面の auth-guard.js / shell.js が「ログインしているか」を聞く）
//     live   … 他の人の保存の合図を読むだけ（live_events を select するだけ・live.js）。?since=数字 だけ通す
//   ★名前が書き込みっぽい action（save・set・delete…）は念のため全部止める
export const maxDuration = 300;   // 勤務表の AI 読み（sheet-ai）・PDF づくりは今のシステムでも 300 秒まで待つ

const WRITE_BLOCKED = 'この操作は ver2 からは通していません。今の社内システムの画面で操作してください';
const NOT_ALLOWED = 'この読み口は通していません';
const SEIKYU_GET = new Set([
  // seikyu.html
  'list', 'docs', 'mails', 'mails-summary',
  // seikyu-make.html
  'make', 'genba-inputs', 'month-summary', 'saved-list', 'saved-get', 'saved-pdf', 'saved-pdf-check', 'stamped-list', 'stamped-pdf', 'gk-list', 'gk-file', 'issuers',
  // 格納ページ（?v2pane=store）は下書きを計算せずにこれだけ読む（10-26）
  'store-base',
  // 格納ページの「請求書勤怠表」タブ（人ごとの請求金額・勤務時間・10-26）
  'store-sheet',
  // seikyu-sheets.js
  'mnm-sheets', 'mnm-sheet-file',
]);
// 語の頭だけで見る（saved-list・saved-pdf など「保存したものを読む」口まで止めていた・10-26）
// 請求書づくり（seikyu.html）・請求書作成／格納（seikyu-make.html）・勤務表（seikyu-sheets.js）が POST する口（今の api/seikyu.ts の POST only の action）
const SEIKYU_POST = new Set([
  // seikyu.html
  'doc-set', 'kintai-import', 'mail-refresh', 'mark', 'mnm-refresh', 'paystmt-import', 'site-order', 'site-people', 'site-set',
  // seikyu-make.html（作成・保存・PDF・押印の格納・勤務表の格納・発行会社・表）
  'genba-save', 'saved-save', 'saved-number', 'saved-del', 'saved-pdf-fix', 'fmt-make', 'paystmt-make',
  'stamped-upload', 'stamped-ext-upload', 'stamped-ext-del', 'gk-upload', 'gk-del', 'store-persons',
  'store-sheet-set',   // 請求書勤怠表で手で入れる請求金額（請求書ベースの粗利の売上になる・10-26）
  'store-hours-set',   // 勤務表勤怠表で手で入れる勤務時間（請求書ベースの粗利の給与はこの時間で計算・10-26）
  'issuer-set', 'issuer-del', 'table-set', 'sheet-set', 'sheet-save',
  // seikyu-sheets.js
  'sheet-ai', 'mnm-sheet-mark',
]);
const WRITE_LIKE = /^(save|set|delete|update|add|remove|create|send|upsert|toggle)(?![a-z])/i;

function allowedGet(api: string, rest: string[], sp: URLSearchParams): boolean {
  if (rest.length) return false;
  if (sp.getAll('action').length > 1) return false;
  const action = sp.get('action') || '';
  if (WRITE_LIKE.test(action)) return false;
  if (api === 'seikyu') return SEIKYU_GET.has(action);
  if (api === 'auth') return action === 'me';
  if (api === 'live') return [...sp.keys()].every((k) => k === 'since') && /^\d*$/.test(sp.get('since') || '');
  // 3D の出勤ボード（attendance-3d.html・当日の出勤状況のタブ・10-27）が読む口。送る（chat send・recipients）は POST なので通らない＝見るだけ
  if (api === 'attendance-board') return ['', 'absence', 'habits', 'rev', 'recipient'].includes(action);
  if (api === 'office') return action === 'state';
  if (api === 'proxy') return action === 'getRosterStatus';
  if (api === 'shared-kv') return [...sp.keys()].every((k) => k === 'scope');
  return false;
}

// live.js は見えているタブで5秒ごとに呼ぶ。同じ人の同じ since は5秒だけ控えを返す（タブを2つ開いていても今のシステムには1本）
const LIVE_TTL = 5000;

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (await ikeKanawestNow()) return NextResponse.json({ ok: false, success: false, error: 'かな西エリアでは開けません' }, { status: 403 }); // かな西エリアだけの人（lib/kanawest-scope.ts）
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

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (await ikeKanawestNow()) return NextResponse.json({ ok: false, success: false, error: 'かな西エリアでは開けません' }, { status: 403 }); // かな西エリアだけの人（lib/kanawest-scope.ts）
  const { path } = await ctx.params;
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';
  if (path.length !== 1 || path[0] !== 'seikyu' || url.searchParams.getAll('action').length !== 1 || !SEIKYU_POST.has(action)) return blocked();
  if (!sameSite(req)) return NextResponse.json({ ok: false, success: false, error: 'この画面の外からは保存できません' }, { status: 403 });
  const token = await ikeToken();
  if (!token) return NextResponse.json({ ok: false, error: 'ログインしてください' }, { status: 401 });
  try {
    const r = await fetch(`${IKE_ORIGIN}/api/seikyu${url.search}`, {
      method: 'POST', cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(295000),
      headers: { Authorization: `Bearer ${token}`, Cookie: `sb_access=${token}`, 'Content-Type': req.headers.get('content-type') || 'application/json', Accept: req.headers.get('accept') || '*/*' },
      body: await req.arrayBuffer(),
    });
    if (r.ok) dropUserCache(token);
    const out = new Headers();
    for (const k of ['content-type', 'cache-control', 'content-disposition']) {
      const v = r.headers.get(k); if (v) out.set(k, v);
    }
    return new NextResponse(r.body, { status: r.status, headers: out });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `今の社内システムに保存できませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}

function blocked() {
  return NextResponse.json({ ok: false, success: false, error: WRITE_BLOCKED }, { status: 403 });
}
export { blocked as PUT, blocked as PATCH, blocked as DELETE };
