import { NextResponse } from 'next/server';

// 会社アカウント（Google）でログインする入口。今の社内システムと同じ Supabase のログインを使う。
//   戻り先 /auth/callback は Supabase の Redirect URLs に登録が要る（無いと今の社内システムのほうへ戻ってしまう）。
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pdoppvhuimcinyamtuvm.supabase.co';

// URL 切替後は今の社内システムの URL から中継される（?via=ikeike を中継の設定が付ける）→ 戻り先もそちらにする
const VIA: Record<string, string> = { ikeike: 'https://ikeike-app.vercel.app' };

export async function GET(req: Request) {
  const u = new URL(req.url);
  const back = `${VIA[u.searchParams.get('via') || ''] || u.origin}/auth/callback`;
  return NextResponse.redirect(`${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`, 302);
}
