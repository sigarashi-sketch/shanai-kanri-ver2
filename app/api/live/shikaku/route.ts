import { NextResponse } from 'next/server';
import { ikeWrite, sameSite } from '@/lib/ike-write';

// 資格手当の申請の 段階（未確認／承認／却下）・確定手当額・メモ を変える／申請を消す（今の資格手当の管理画面 shikaku-admin.html と同じ口）。
//   POST {action:'updateStatus', id, status, allowance_amount?, memo?} → /api/shikaku-apply?action=updateStatus
//   POST {action:'delete', id}                                       → /api/shikaku-apply?action=delete（添付の証明書・領収書も消える・画面で必ず確かめる）
//   ★行き先は決め打ち。権限の判定は今のシステム（ログインした人のトークン）
const STATUSES = ['未確認', '承認', '却下'];

export async function POST(req: Request) {
  if (!sameSite(req)) return NextResponse.json({ error: 'この画面の外からは保存できません' }, { status: 403 });
  const b = ((await req.json().catch(() => null)) || {}) as Record<string, unknown>;
  const id = typeof b.id === 'string' ? b.id : '';
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return NextResponse.json({ error: '申請の番号が違います' }, { status: 400 });
  if (b.action === 'delete') return ikeWrite(req, '/api/shikaku-apply?action=delete', { id });
  if (b.action !== 'updateStatus') return NextResponse.json({ error: '書く種類が違います' }, { status: 400 });
  if (typeof b.status !== 'string' || !STATUSES.includes(b.status)) return NextResponse.json({ error: '段階が違います' }, { status: 400 });
  const body: Record<string, unknown> = { id, status: b.status };
  if ('allowance_amount' in b) {
    const a = b.allowance_amount;
    if (a === null || a === '') body.allowance_amount = null;
    else if (Number.isInteger(Number(a)) && Number(a) >= 0 && Number(a) <= 1_000_000) body.allowance_amount = Number(a);
    else return NextResponse.json({ error: '手当額が違います' }, { status: 400 });
  }
  if ('memo' in b) body.memo = String(b.memo ?? '').slice(0, 2000);
  return ikeWrite(req, '/api/shikaku-apply?action=updateStatus', body);
}
