import { NextResponse } from 'next/server';
import { ikeWrite } from '@/lib/ike-write';

// チャット（1:1）の連絡先を 営業リストの氏名に紐付ける／外す口（10-28 shoya「チャットの紐付けできないやんけ」）。
//   ・通すのは今の社内システムの POST /api/chat?action=link だけ（今の chat.html の「名前を保存」「候補」「紐付け解除」と同じ口・同じ形）
//       { userId, name }  name が空＝紐付け解除。営業リストと1件だけ一致すれば公式の表記で保存（今の API が決める）
//       紐付いた相手が参画決定なら稼働中メニューを貼る・初回ヒアリングの追い書き なども今の API がそのままやる
//   ・{ refresh: true } は候補（営業リストの氏名）を今すぐ読み直す（今の POST ?action=refreshRoster＝控えを捨てるだけ）
//   ・送ってよい人かは今の API が決める。書いたら その人の読み取りの控えを捨てる（ikeWrite）
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { userId?: unknown; name?: unknown; refresh?: unknown };
  if (b.refresh === true) return ikeWrite(req, '/api/chat?action=refreshRoster', {});
  const userId = typeof b.userId === 'string' ? b.userId : '';
  if (!/^U[0-9a-f]{32}$/.test(userId)) return NextResponse.json({ error: '連絡先（LINE の相手）が違います' }, { status: 400 });
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (name.length > 60) return NextResponse.json({ error: '氏名が長すぎます' }, { status: 400 });
  return ikeWrite(req, '/api/chat?action=link', { userId, name });
}
