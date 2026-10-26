import { NextResponse } from 'next/server';
import { ikeToken } from '@/lib/ike';
import { ikeWrite } from '@/lib/ike-write';
import { normName } from '@/lib/live/eigyo-common';

// プロパーリストの dropout（飛び）の印をつける・外す口（10-25 shoya「全部いれて」）。
//   書く先は今の POST /api/roster?op=crud&action=setDropout だけ（決め打ち・今の dropout.js と同じ body）。
//   {name, normalized_name, row, on, phase?, after?}
//     phase … eigyo＝参画決定の前（辞退にする）／kettei＝参画決定の後・入場前（参画決定のまま辞退）／kadou＝現場に入った後（辞退にしない）
//     after … kadou のときだけ mark（印だけ）／taisha（退社）／taiki（待機）。それ以外は mark
//   外す（on:false）は印だけ外す（辞退・退社などは今のシステムも戻さない）
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHASES = ['eigyo', 'kettei', 'kadou'];
const AFTERS = ['mark', 'taisha', 'taiki'];

export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ ok: false, error: 'ログインしてください' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { name?: unknown; row?: unknown; on?: unknown; phase?: unknown; after?: unknown };
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name || name.length > 60) return NextResponse.json({ ok: false, error: '氏名が違います' }, { status: 400 });
  const row = typeof b.row === 'string' ? b.row : '';
  if (row && !UUID.test(row)) return NextResponse.json({ ok: false, error: '行が違います' }, { status: 400 });
  if (typeof b.on !== 'boolean') return NextResponse.json({ ok: false, error: 'つける／外すが違います' }, { status: 400 });
  const body: Record<string, unknown> = { name, normalized_name: normName(name), row, on: b.on };
  if (b.on) {
    if (typeof b.phase !== 'string' || !PHASES.includes(b.phase)) return NextResponse.json({ ok: false, error: 'いつ飛んだかを選んでください' }, { status: 400 });
    const after = b.phase === 'kadou' && typeof b.after === 'string' && AFTERS.includes(b.after) ? b.after : 'mark';
    body.phase = b.phase; body.after = after;
  }
  return ikeWrite(req, '/api/roster?op=crud&action=setDropout', body);
}
