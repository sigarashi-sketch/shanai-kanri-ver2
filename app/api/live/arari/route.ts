import { NextResponse } from 'next/server';
import { ikeWrite } from '@/lib/ike-write';

// 想定賃金・粗利（/keiri/chingin・請求書締め）の書く口（10-26）。今の「請求書ベースの粗利」と同じ口にだけ書く。
//   POST {kind:'salary'|'fare', ym:'YYYY-MM', key, value:number|null}
//     salary → POST /api/seikyu?action=arari-salary {ym,key,salary}（null で額面＝内定の月給に戻す）
//     fare   → POST /api/seikyu?action=arari-fare   {ym,key,fare}  （null で経費の申請の額か 仮 25,000円に戻す）
//   ★権限は今のシステムが見る（ロール別ページ表示 'seikyu-arari'）。値はここで桁と形を確かめる
//   ★計算のしかた・請求の仕様は変えない（直した値を残すだけ。今の画面と同じ）
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = b.kind === 'salary' ? 'salary' : b.kind === 'fare' ? 'fare' : '';
  if (!kind) return NextResponse.json({ error: '給与か交通費を選んでください' }, { status: 400 });
  const ym = String(b.ym || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return NextResponse.json({ error: '月の指定が違います' }, { status: 400 });
  const key = String(b.key || '');
  if (!key || key.length > 60) return NextResponse.json({ error: '人の指定が違います' }, { status: 400 });
  const raw = b.value;
  let value: number | null = null;
  if (raw != null && raw !== '') {
    const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[,，円¥\s]/g, ''));
    if (!Number.isInteger(n) || n < 0 || n > (kind === 'salary' ? 3_000_000 : 500_000)) return NextResponse.json({ error: kind === 'salary' ? '給与は 0〜300万円の整数で入れてください' : '交通費は 0〜50万円の整数で入れてください' }, { status: 400 });
    value = n;
  }
  return ikeWrite(req, `/api/seikyu?action=arari-${kind}`, { ym, key, [kind]: value });
}
