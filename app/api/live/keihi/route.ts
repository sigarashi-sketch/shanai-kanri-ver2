import { NextResponse } from 'next/server';
import { ikeWrite } from '@/lib/ike-write';

// 交通費・経費（/keiri/keihi）の書く口（10-25）。今の POST /api/keihi にだけ書く（ページ権限 keihi-admin は今のシステムが見る）。
//   decide      {id, decision:'approve'|'return', comment} … 申請の承認・差し戻し（差し戻しは理由が要る）
//   ringiDecide {id, decision:'approve'|'reject', comment} … 稟議の承認・見送り（見送りは理由が要る）
//   ★どちらも本人の LINE に結果が届く（今のシステムが送る）。画面は押す前に確認の窓でそれを出す
//   ★定期つきの申請は、月が終わっていれば今のシステムが承認の前に打刻を確かめ、漏れがあれば承認せず差し戻す
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(b.id || '');
  if (!UUID.test(id)) return NextResponse.json({ error: '申請の指定が違います' }, { status: 400 });
  const decision = String(b.decision || '');
  const comment = String(b.comment == null ? '' : b.comment).trim().slice(0, 500);
  if (b.action === 'decide') {
    if (decision !== 'approve' && decision !== 'return') return NextResponse.json({ error: '承認か差し戻しを選んでください' }, { status: 400 });
    if (decision === 'return' && !comment) return NextResponse.json({ error: '差し戻しの理由を選んでください（本人の LINE に届きます）' }, { status: 400 });
    return ikeWrite(req, '/api/keihi?action=decide', { id, decision, comment }, { timeoutMs: 55000 });
  }
  if (b.action === 'ringiDecide') {
    if (decision !== 'approve' && decision !== 'reject') return NextResponse.json({ error: '承認か見送りを選んでください' }, { status: 400 });
    if (decision === 'reject' && !comment) return NextResponse.json({ error: '見送りの理由を書いてください（本人の LINE に届きます）' }, { status: 400 });
    return ikeWrite(req, '/api/keihi?action=ringiDecide', { id, decision, comment });
  }
  return NextResponse.json({ error: 'この操作はできません' }, { status: 400 });
}
