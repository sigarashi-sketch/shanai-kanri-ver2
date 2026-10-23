import { NextResponse } from 'next/server';

// 会社アカウント（Google）でログインする入口。今の社内システムと同じ Supabase のログインを使う。
//   戻り先 /auth/callback は Supabase の Redirect URLs に登録が要る（無いと今の社内システムのほうへ戻ってしまう）。
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pdoppvhuimcinyamtuvm.supabase.co';

export async function GET(req: Request) {
  const back = `${new URL(req.url).origin}/auth/callback`;
  return NextResponse.redirect(`${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`, 302);
}
