import { NextResponse } from 'next/server';
import { ikeWrite } from '@/lib/ike-write';

// チャットの「要対応」（相手ボール）を 対応済みにする／要対応に戻す口（10-30 shoya「チャットに要対応の表示とボタン入れて・いけどんのこっちボール」）。
//   ・通すのは今の社内システムの POST /api/chat?action=clearBall（1:1）と groupClearBall（グループ）だけ（今の chat.html の「✓ 対応済み」「↩ 要対応に戻す」と同じ口・同じ形）
//       { userId, restore? } / { groupId, restore? }
//   ・対応済みに入れる時刻は今の API が決める（押した瞬間ではなく最後に受信した時刻＝そのあと相手がまた送れば自動で要対応に戻る）
//   ・インフォメーション（それゆけ未経験）の 1:1 は saiyou の line_users なので、人財管理の口 /api/sy/s/line/ball を画面から直接呼ぶ（ここは通らない）
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { userId?: unknown; groupId?: unknown; restore?: unknown };
  const restore = b.restore === true;
  if (typeof b.groupId === 'string' && b.groupId) {
    if (!/^C[0-9a-f]{32}$/.test(b.groupId)) return NextResponse.json({ error: 'グループが違います' }, { status: 400 });
    return ikeWrite(req, '/api/chat?action=groupClearBall', { groupId: b.groupId, restore });
  }
  const userId = typeof b.userId === 'string' ? b.userId : '';
  if (!/^U[0-9a-f]{32}$/.test(userId)) return NextResponse.json({ error: '連絡先（LINE の相手）が違います' }, { status: 400 });
  return ikeWrite(req, '/api/chat?action=clearBall', { userId, restore });
}
