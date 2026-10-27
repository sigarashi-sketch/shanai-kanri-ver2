import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { loadTeikiRecords, loadTeikiSettings, saveTeikiSettings } from '@/lib/sy/teiki';

export const maxDuration = 30;

// 定期面談ページ: 実施の記録（全期間）と、担当・色の設定
export async function GET() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  try {
    const [r, settings] = await Promise.all([loadTeikiRecords(), loadTeikiSettings()]);
    return NextResponse.json({ ...r, settings, me: u.email });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
}
// 設定（担当の名前・カレンダーのアドレス・色、予定を拾う合言葉）を保存する。全員で共有
export async function PUT(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = await req.json().catch(() => ({}));
  const r = await saveTeikiSettings(b, u.email);
  return r.error ? NextResponse.json({ error: r.error }, { status: 500 }) : NextResponse.json({ ok: true, settings: r.settings });
}
