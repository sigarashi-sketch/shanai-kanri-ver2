import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { sameSite } from '@/lib/ike-write';

// 交通費チェック（/keiri/check）の照らし合わせ（10-25）。今の POST /api/freee-kintai?action=keihi_check|keihi_month に1人ぶんずつ渡す。
//   ・今のシステムは「読むだけ」（経費の明細ファイルの中身を freee の打刻と日付で突き合わせて返す・何も保存しない）。
//     明細を body で受けるので POST。ver2 からも同じサイトの画面だけ通す
//   ・ファイルの読み込み（Shift_JIS・列の特定・人ごとの束ね）は画面。ここは形と上限だけ確かめて渡す
//   ★freee には読み取りだけ（今のシステムの口がそうなっている）。ページ権限 keihi-check は今のシステムが見る
const MAX_ROWS = 400, MAX_APPS = 50;
const s = (v: unknown, n: number) => String(v == null ? '' : v).slice(0, n);

export async function POST(req: Request) {
  if (!sameSite(req)) return NextResponse.json({ error: 'この画面の外からは使えません' }, { status: 403 });
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = s(b.name, 80).trim();
  if (!name) return NextResponse.json({ error: '氏名がありません' }, { status: 400 });
  let target = '', body: unknown;
  if (b.kind === 'rows' && Array.isArray(b.rows)) {
    target = '/api/freee-kintai?action=keihi_check';
    body = {
      name,
      rows: b.rows.slice(0, MAX_ROWS).map((x) => {
        const r = (x || {}) as Record<string, unknown>;
        return { rowNo: Number(r.rowNo) || 0, date: s(r.date, 10), category: s(r.category, 60), content: s(r.content, 200), memo: s(r.memo, 200), amount: Number(r.amount) || 0, title: s(r.title, 120), status: s(r.status, 30), applicationNo: s(r.applicationNo, 40) };
      }),
    };
  } else if (b.kind === 'apps' && Array.isArray(b.apps)) {
    target = '/api/freee-kintai?action=keihi_month';
    body = { name, apps: b.apps.slice(0, MAX_APPS).map((x) => { const a = (x || {}) as Record<string, unknown>; return { key: s(a.key, 40), title: s(a.title, 120), amount: Number(a.amount) || 0 }; }) };
  } else return NextResponse.json({ error: '明細か申請の一覧がありません' }, { status: 400 });
  try {
    const r = await ikeFetch(target, { method: 'POST', body: JSON.stringify(body) }, 58000);
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    if (r.status === 403) return NextResponse.json({ error: '交通費チェックの権限がありません' }, { status: 403 });
    return NextResponse.json(j, { status: r.ok ? 200 : r.status });
  } catch (e) {
    return NextResponse.json({ error: `照らし合わせできませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}

// ログインしているかだけ返す（画面が本物を出せるか決めるため・今のシステムは呼ばない）
export async function GET() {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  return NextResponse.json({ ok: true });
}
