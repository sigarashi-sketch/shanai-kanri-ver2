import { NextResponse } from 'next/server';
import { ikeFetch, ikeFetchCached, ikeToken } from '@/lib/ike';

// 今の社内システムの API を「読むだけ」で通す口（GET だけ）。/api/ike/kintai-today?x=1 → 今の /api/kintai-today?x=1
//   ・書き込み（POST など）は通さない。本物の操作は今の社内システムの画面からする（ver2 は本番に入れる前にもう一度確かめる・10-23）
//   ・例外はスキルシート作成の 作る/PDF/Excel だけ（/api/skillsheet・shoya OK 10-23。この口ではなく lib/skillsheet-source.ts）
//   ★10-25 通すのは下の ALLOW にある 口×(op)×action だけ。今のシステムには GET でも書く口がある
//     （roster?op=nyusha&action=save・proxy?action=setGroupHidden・kintai-today?action=note など）。
//     ログインの Cookie は別のサイトからのリンクでも付くので、何でも通すと「リンクを踏んだだけで書かれる」。ver2 が実際に読む口だけにする
//   ★口を足すときは、今のシステムのその action が GET で SELECT しかしないのを確かめてから ALLOW に足す
const NOT_ALLOWED = 'この読み口は通していません';

// '' は action（op）なし。roster のように op で分かれる口は 'op:action'
const ALLOW: Record<string, readonly string[]> = {
  proxy: ['getProgressData', 'getProgressReplies', 'getMapData', 'getRosterStatus', 'getReplies', 'getGroupNames', 'getSalesTableData', 'getInterviews'],
  roster: ['getEngineerRows', 'jimu:list', 'kekkin:list', 'shime:board', 'timesheet:list'],
  'cases-map': ['list'],
  nippo: ['', 'pl-reps'],
  'partner-list': ['list', 'station'],
  livers: [''],
  teams: ['list'],
  rishoku: [''],
  'shikaku-apply': ['list'],
  tenseki: ['list'],
  seikyu: ['arari'],
  keihi: ['adminList'],
  kb: ['list', 'get', 'testSearch'],
  'shift-calendar': ['month', 'list', 'detail'],
  'kintai-today': [''],
  'attendance-board': ['absence'],
  admin: ['list', 'googleLinks'],
  'progress-stats': [''],
  chat: ['contacts', 'groups', 'thread', 'groupThread'],
  'ikou-requests': ['history', 'pending'],
  // 10-25 プロパーリストの列（フォーム回答＝回答済みの氏名だけ／通勤エリア＝一覧と1人ぶん）。どちらも GET は SELECT だけ
  'basic-info': ['names'],
  'commute-area': ['list', ''],
  // 面談可能日の承認・案件掲載/応募/反応（10-25 確認：どれも GET は SELECT だけ。書くのは /api/live/availability・/api/live/case-admin の POST）
  availability: ['candidates', 'list'],
  'case-admin': ['list', 'applications', 'get'],
  'case-stats': [''],
};
// 念のため：名前が書き込みっぽい action / op は ALLOW にあっても止める
const WRITE_LIKE = /^(save|set|delete|update|add|remove|create|send|upsert|toggle)/i;

function allowedIke(path: string[], sp: URLSearchParams): boolean {
  if (path.length !== 1) return false;
  const action = sp.get('action') || '', op = sp.get('op') || '';
  // 同じ名前を2回渡して、今のシステムに別の方を読ませるのを止める
  if (sp.getAll('action').length > 1 || sp.getAll('op').length > 1) return false;
  if (WRITE_LIKE.test(action) || WRITE_LIKE.test(op)) return false;
  return !!ALLOW[path[0]]?.includes(op ? `${op}:${action}` : action);
}

// 連絡の一覧（chat?action=contacts）は全員ぶんの select * で重い。同じ人の60秒以内は控えを返す（lib/cache.ts・人ごと）
const CACHE_TTL: Record<string, number> = { 'chat|contacts': 60_000 };

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!path.every((p) => /^[a-z0-9-]+$/i.test(p))) return NextResponse.json({ error: '行き先が違います' }, { status: 400 });
  const url = new URL(req.url);
  if (!allowedIke(path, url.searchParams)) return NextResponse.json({ error: NOT_ALLOWED }, { status: 403 });
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const refresh = url.searchParams.get('refresh') === '1';
  url.searchParams.delete('refresh');
  const target = `/api/${path.join('/')}${url.search}`;
  const ttl = CACHE_TTL[`${path[0]}|${url.searchParams.get('action') || ''}`];
  try {
    if (ttl) {
      const r = await ikeFetchCached(target, ttl, { refresh });
      if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
      return NextResponse.json(r.data, { status: r.status });
    }
    const r = await ikeFetch(target);
    const body = await r.text();
    if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    return new NextResponse(body, { status: r.status, headers: { 'Content-Type': r.headers.get('content-type') || 'application/json' } });
  } catch (e) {
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
