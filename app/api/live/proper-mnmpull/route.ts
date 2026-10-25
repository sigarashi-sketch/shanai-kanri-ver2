import { NextResponse } from 'next/server';
import { ikeToken } from '@/lib/ike';
import { ikeWrite } from '@/lib/ike-write';

// プロパーリストの「↻ミンミカ取り込み」（今の POST /api/roster?op=mnmpull・決め打ち）。
//   ミンミカで営業開始前になった未経験の人を、15分おきの自動を待たずにいま取り込む。中身は送らない
export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ ok: false, sample: true, error: '見本なので取り込んでいません' }, { status: 401 });
  return ikeWrite(req, '/api/roster?op=mnmpull', {}, { timeoutMs: 55_000 });
}
