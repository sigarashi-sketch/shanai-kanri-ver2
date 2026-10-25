import { NextResponse } from 'next/server';
import { ikeWrite } from '@/lib/ike-write';
import { KINMU_CHOICES, TODAY_NOTE_MAX } from '@/lib/live/today';

// 当日の出勤状況（/roumu/today）の書く口（10-25）。
//   note  {date,key,name,note} → 今の POST /api/kintai-today?action=note（内勤のメモ。空にすると消える）
//   kubun {name,kinmuKubun}    → 今の POST /api/roster?op=extra&action=saveKinmuKubun（名簿・未打刻のお知らせの対象にも効く）
//   ★freee の勤怠は書き換えない（今のシステムの口がそもそも書かない）
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, max: number) => String(v == null ? '' : v).trim().slice(0, max);

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.action === 'note') {
    const date = str(b.date, 10), name = str(b.name, 80), key = str(b.key, 80);
    if (!DATE.test(date) || !name) return NextResponse.json({ error: '日付と氏名がありません' }, { status: 400 });
    return ikeWrite(req, '/api/kintai-today?action=note', { date, key, name, note: String(b.note == null ? '' : b.note).slice(0, TODAY_NOTE_MAX) });
  }
  if (b.action === 'kubun') {
    const name = str(b.name, 80), kubun = str(b.kinmuKubun, 20);
    if (!name) return NextResponse.json({ error: '氏名がありません' }, { status: 400 });
    if (kubun && !(KINMU_CHOICES as readonly string[]).includes(kubun)) return NextResponse.json({ error: '勤務区分は選択肢から選んでください' }, { status: 400 });
    return ikeWrite(req, '/api/roster?op=extra&action=saveKinmuKubun', { name, kinmuKubun: kubun });
  }
  return NextResponse.json({ error: 'この操作はできません' }, { status: 400 });
}
