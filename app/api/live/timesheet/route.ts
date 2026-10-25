import { NextResponse } from 'next/server';
import { ikeWrite } from '@/lib/ike-write';

// 勤務表の届き具合（/roumu/timesheet）の「いま取り直す」（10-25）。今の POST /api/roster?op=timesheet&action=refresh にだけ書く。
//   ・ミンミカから直近3か月の届き具合＋直近2日ぶんの元メールを取り直して、今のシステムの写し（mnm_timesheet_*）を入れ直す
//   ・メールは送らない（今のシステムの勤務表の口に「送る」操作は無い）。権限は今のシステムのページ権限 timesheet-arrival
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.action !== 'refresh') return NextResponse.json({ error: 'この操作はできません' }, { status: 400 });
  return ikeWrite(req, '/api/roster?op=timesheet&action=refresh', {}, { timeoutMs: 58000 });
}
