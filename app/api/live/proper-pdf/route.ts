import { NextResponse } from 'next/server';
import { ikeToken } from '@/lib/ike';
import { ikeWrite } from '@/lib/ike-write';

// スキシの「PDF出力」「Excel出力」（今の proper.html の genPdf / genXlsx と同じ：POST /api/skillsheet {action:'pdf'|'xlsx', rosterId}・決め打ち）。
//   そのときのスキシの中身で本名版／イニシャル版の PDF・Excel を作り直す（URL は変わらない・中身は今のシステムが作る）。スキシ（スプレッドシート）が無い人は今のシステムが断る
export const maxDuration = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ ok: false, error: 'ログインしてください' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { row?: unknown; kind?: unknown };
  const kind = b.kind === 'xlsx' ? 'xlsx' : 'pdf';
  const row = typeof b.row === 'string' ? b.row : '';
  if (!UUID.test(row)) return NextResponse.json({ ok: false, error: '行が違います' }, { status: 400 });
  return ikeWrite(req, '/api/skillsheet', { action: kind, rosterId: row }, { timeoutMs: 120_000 });
}
