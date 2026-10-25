import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { storeCompanies, type IkeGenba, type IkeMonthSum, type IkeSaved, type IkeStamped } from '@/lib/live/seikyu-store';

// 請求書（格納ベース）の本物。lib/live/seikyu-store.ts の説明を参照。
//   ★読むだけ。呼ぶのは /api/seikyu の GET 4つ（month-summary・make・saved-list・stamped-list）。今の請求書作成の画面が開いたときに呼ぶのと同じ
//   ★make は全員ぶんの下書きを計算するので 10〜20秒かかる
export const maxDuration = 60;
class AuthGone extends Error {}

async function getJson<T>(path: string): Promise<T> {
  const r = await ikeFetch(path);
  if (r.status === 401) throw new AuthGone();
  const j = (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: unknown };
  if (!r.ok || j.ok === false) throw new Error(`${path.split('&')[0]}（${r.status}${j.error ? `・${String((j.error as { message?: string }).message || j.error)}` : ''}）`);
  return j;
}

export async function GET(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  try {
    const want = new URL(req.url).searchParams.get('ym') || '';
    const { months = [] } = await getJson<{ months?: IkeMonthSum[] }>('/api/seikyu?action=month-summary');
    const ym = /^\d{4}-\d{2}$/.test(want) ? want : months[0]?.ym || '';
    if (!ym) return NextResponse.json({ ym: '', months, companies: [], savedN: 0, stampedN: 0, pending: 0, generatedAt: new Date().toISOString() });
    const e = encodeURIComponent(ym);
    const [make, sv] = await Promise.all([
      getJson<{ genba?: IkeGenba | null }>(`/api/seikyu?action=make&ym=${e}`),
      getJson<{ saved?: IkeSaved[] }>(`/api/seikyu?action=saved-list&ym=${e}`),
    ]);
    // 中身の文字をまだ読み終えていないファイルがあると pending>0（今の画面も読み終えるまで呼び直す）。何回かまで待つ
    let st = await getJson<{ stamped?: IkeStamped[]; pending?: number }>(`/api/seikyu?action=stamped-list&ym=${e}`);
    for (let i = 0; i < 4 && (st.pending || 0) > 0; i++) st = await getJson(`/api/seikyu?action=stamped-list&ym=${e}`);
    const saved = sv.saved || [], stamped = st.stamped || [];
    return NextResponse.json({
      ym, months, companies: storeCompanies(make.genba || null, saved, stamped),
      savedN: saved.length, stampedN: stamped.length, pending: st.pending || 0, generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof AuthGone) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(err as Error).message}）` }, { status: 502 });
  }
}
