import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ikeToken } from '@/lib/ike';
import { filterMikeiken } from '@/lib/live/mikeiken-server';

// 交通費・経費の月次：マネーフォワード クラウド経費で申請していた月（10-26 shoya「9月分だけマネフォ」）。
//   ・中身は mf/keihi-YYYY-MM.json（MF の申請一覧CSV を月で切り出したもの・1行＝1申請・git に入れない）
//   ・ログインしている人にだけ、未経験の人（今のプロパーリストに入っている人）の分だけ返す。読むだけ
//   ・月はタイトルで決めた（「9月分」と書いてあればそれ、無ければ「YYYY年MM月」）
export type MfKeihiRow = { no: string; name: string; title: string; status: string; amount: number; appliedAt: string; approvedAt: string; payOn: string };
export type MfKeihi = { ok: boolean; ym: string; source?: string; rows: MfKeihiRow[] };

export async function GET(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const ym = new URL(req.url).searchParams.get('ym') || '';
  if (!/^\d{4}-\d{2}$/.test(ym)) return NextResponse.json({ error: '月の指定が違います' }, { status: 400 });
  let j: { source?: string; rows?: MfKeihiRow[] };
  try { j = JSON.parse(await readFile(path.join(process.cwd(), 'mf', `keihi-${ym}.json`), 'utf8')); }
  catch { return NextResponse.json({ ok: true, ym, rows: [] } satisfies MfKeihi); }   // その月は MF の取り込みが無い
  try {
    return NextResponse.json({ ok: true, ym, source: j.source, rows: await filterMikeiken(j.rows || [], 'name') } satisfies MfKeihi);
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ error: m }, { status: m.startsWith('ログインが切れ') ? 401 : 502 });
  }
}
