import { NextResponse } from 'next/server';
import { ikeWrite } from '@/lib/ike-write';
import { ALL_SHIME_REASONS } from '@/lib/live/shime';

// 勤怠の締め（/roumu/shime）の書く口（10-25）。今の POST /api/roster?op=shime&action=close|reopen|close-matched にだけ書く。
//   ・権限は今の社内システムが見る（ページ権限 kintai-shime）。ver2 は中身の形だけ確かめる
//   ・close の理由は今の画面（kintai-shime.html）と同じ選択肢だけ（自由入力にしない）
//   ★close-matched は今の社内システムの決まりのまま、その月の「一致・freee だけ・記録なし・契約なし」の人を全員締める（未経験以外も含む）

const YM = /^\d{4}-\d{2}$/;

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action || '');
  const ym = String(b.ym || '');
  if (!YM.test(ym)) return NextResponse.json({ error: '月の指定が違います' }, { status: 400 });
  const key = String(b.key || '').slice(0, 80);
  if (action === 'close') {
    if (!key) return NextResponse.json({ error: '人の指定がありません' }, { status: 400 });
    const reason = String(b.reason || '');
    if (reason && !ALL_SHIME_REASONS.includes(reason)) return NextResponse.json({ error: '理由は選択肢から選んでください' }, { status: 400 });
    return ikeWrite(req, '/api/roster?op=shime&action=close', { ym, key, reason, note: '' });
  }
  if (action === 'reopen') {
    if (!key) return NextResponse.json({ error: '人の指定がありません' }, { status: 400 });
    return ikeWrite(req, '/api/roster?op=shime&action=reopen', { ym, key });
  }
  if (action === 'close-matched') return ikeWrite(req, '/api/roster?op=shime&action=close-matched', { ym }, { timeoutMs: 55000 });
  return NextResponse.json({ error: 'この操作はできません' }, { status: 400 });
}
