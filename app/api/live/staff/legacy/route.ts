import { NextResponse } from 'next/server';
import { IKE_ORIGIN } from '@/lib/ike';

// 「月次勤怠を開く」の行き先＝今の社内システムの従業員名簿（その人の「稼働管理」で月次の勤怠を開く）。
//   月次の勤怠は freee を1人ずつ読む口（freee-kintai?action=monthly）で、読むたびに今のシステムの控えに書く＋freee の鍵を使うので、
//   ver2 からは呼ばずに今の画面へ渡す（10-25）。行き先は決め打ち
export function GET() {
  return NextResponse.redirect(`${IKE_ORIGIN}/roster.html`, 302);
}
