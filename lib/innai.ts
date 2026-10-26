// 内勤と要員の分け方（サーバーと画面の両方で使う）。
//   会社のメール（@engineer-mikata.com）＝内勤、それ以外＝要員（10-25 shoya）
//   ★要員はこのシステムに絶対に入れない（10-26 shoya「組織表に入っている要員は絶対にシステムにアクセスさせない・基本情報や bdsh はいい」）
//     → ログインの入口（/api/ike-auth/session）と、トークンを使うところ（lib/ike.ts の ikeToken）の2か所で止める
export const INNAI_DOMAIN = '@engineer-mikata.com';
export const isInnaiEmail = (email: string | null | undefined) => String(email || '').trim().toLowerCase().endsWith(INNAI_DOMAIN);
export const personKind = (p: { email: string }): '内勤' | '要員' => (isInnaiEmail(p.email) ? '内勤' : '要員');

/** Supabase のトークン（JWT）の中のメール。読めなければ ''（署名の確かめは今の社内システムがやる） */
export function tokenEmail(t: string): string {
  try {
    const part = t.split('.')[1] || '';
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return String((JSON.parse(json) as { email?: string }).email || '');
  } catch { return ''; }
}
