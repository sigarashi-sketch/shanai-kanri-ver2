import { NextResponse } from 'next/server';
import { ikeWrite } from '@/lib/ike-write';

// ライバーリストの 足す・直す・消す（10-25）。今の /api/livers の POST だけ（全体管理者だけ＝今のシステムのページ権限 livers が判定）。
//   消せるのは手で足した行だけ（Slack から入った行は今のシステムが断る）。プロパーリストには書かない
const STATUSES = ['', '稼働中', '辞退', '終了'];
const s = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const YMD = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = s(b.action, 10);
  const nyusha = b.nyusha_bi === undefined ? undefined : s(b.nyusha_bi, 10);
  if (nyusha && !YMD.test(nyusha)) return NextResponse.json({ error: '入社日は YYYY-MM-DD で' }, { status: 400 });
  if (action === 'add') {
    const name = s(b.name, 60);
    if (!name) return NextResponse.json({ error: '氏名を入れてください' }, { status: 400 });
    return ikeWrite(req, '/api/livers', { action, name, tantou: s(b.tantou, 30), nyusha_bi: nyusha ?? '', memo: s(b.memo, 2000) });
  }
  const id = s(b.id, 60);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: '行が見つかりません' }, { status: 400 });
  if (action === 'delete') return ikeWrite(req, '/api/livers', { action, id });
  if (action !== 'update') return NextResponse.json({ error: 'この操作は通していません' }, { status: 400 });
  const body: Record<string, unknown> = { action, id };
  if (b.status !== undefined) { const st = s(b.status, 10); if (!STATUSES.includes(st)) return NextResponse.json({ error: '状態が正しくありません' }, { status: 400 }); body.status = st; }
  if (b.memo !== undefined) body.memo = s(b.memo, 2000);
  if (b.tantou !== undefined) body.tantou = s(b.tantou, 30);
  if (nyusha !== undefined) body.nyusha_bi = nyusha;
  return ikeWrite(req, '/api/livers', body);
}
