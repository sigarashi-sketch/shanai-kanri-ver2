import { NextResponse } from 'next/server';
import { ikeToken } from '@/lib/ike';
import { ikeWrite } from '@/lib/ike-write';

// プロパーリストの「PDF を作り直す」（今の proper.html の genPdf と同じ：POST /api/skillsheet {action:'pdf', rosterId}・決め打ち）。
//   そのときのスキシの中身で本名版／イニシャル版の PDF を作り直す（URL は変わらない）。スキシ（スプレッドシート）が無い人は今のシステムが断る
export const maxDuration = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ ok: false, sample: true, error: '見本なので作っていません' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { row?: unknown };
  const row = typeof b.row === 'string' ? b.row : '';
  if (!UUID.test(row)) return NextResponse.json({ ok: false, error: '行が違います' }, { status: 400 });
  return ikeWrite(req, '/api/skillsheet', { action: 'pdf', rosterId: row }, { timeoutMs: 120_000 });
}
