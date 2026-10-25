import { NextResponse } from 'next/server';
import { ikeFetchCached, ikeToken } from '@/lib/ike';
import { storeCompanies, type IkeGenba, type IkeMonthSum, type IkeSaved, type IkeStamped } from '@/lib/live/seikyu-store';

// 請求書（格納ベース）の本物。lib/live/seikyu-store.ts の説明を参照。
//   ★読むだけ。呼ぶのは /api/seikyu の GET 4つ（month-summary・make・saved-list・stamped-list）。今の請求書作成の画面が開いたときに呼ぶのと同じ
//   ★make は全員ぶんの下書きを計算するので 10〜20秒かかる
//   ★10-25 開いたときの月は今の請求書作成と同じ＝日本時間の先月（今の api/seikyu.ts defaultYm。make を ym なしで呼んだときの月）
//   ★make・saved-list・stamped-list・month-summary は一度に呼ぶ。答えはその人だけ3分控える（lib/cache.ts・キーに月が入る）。?refresh=1 で読み直す
//   ★stamped-list が「読みかけ（pending>0）」なら 2秒・4秒待って2回まで呼び直す（読みかけの答えは控えない）
export const maxDuration = 60;
class AuthGone extends Error {}
const TTL = 3 * 60_000;

async function getJson<T>(path: string, opts?: { refresh?: boolean; timeoutMs?: number; keep?: (d: T) => boolean }): Promise<T> {
  const r = await ikeFetchCached<T & { ok?: boolean; error?: unknown }>(path, TTL, opts);
  if (r.status === 401) throw new AuthGone();
  const j = r.data;
  if (!r.ok || j?.ok === false) throw new Error(`${path.split('&')[0]}（${r.status}${j?.error ? `・${String((j.error as { message?: string }).message || j.error)}` : ''}）`);
  return j;
}
const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
/** 今の api/seikyu.ts defaultYm と同じ：日本時間の今月の1つ前 */
function defaultYm(nowMs: number): string {
  const d = new Date(nowMs + 9 * 3600e3);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(); // m は 0 始まり＝そのまま「先月」の 1 始まりの数
  return m === 0 ? `${y - 1}-12` : `${y}-${String(m).padStart(2, '0')}`;
}

export async function GET(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  try {
    const sp = new URL(req.url).searchParams;
    const want = sp.get('ym') || '';
    const refresh = sp.get('refresh') === '1';
    const ym = /^\d{4}-\d{2}$/.test(want) ? want : defaultYm(Date.now());
    const e = encodeURIComponent(ym);
    type St = { stamped?: IkeStamped[]; pending?: number };
    const stampedPath = `/api/seikyu?action=stamped-list&ym=${e}`;
    const notPending = (d: St) => !(d.pending || 0);
    const [sum, make, sv, st0] = await Promise.all([
      getJson<{ months?: IkeMonthSum[] }>('/api/seikyu?action=month-summary', { refresh }),
      // make は全員ぶんの下書きを計算するので長めに待つ（maxDuration 60 の中で）
      getJson<{ genba?: IkeGenba | null }>(`/api/seikyu?action=make&ym=${e}`, { refresh, timeoutMs: 45000 }),
      getJson<{ saved?: IkeSaved[] }>(`/api/seikyu?action=saved-list&ym=${e}`, { refresh }),
      // 中身の文字をまだ読み終えていないファイルがあると pending>0（今の画面も読み終えるまで呼び直す）
      (async () => {
        let st = await getJson<St>(stampedPath, { refresh, keep: notPending });
        for (const ms of [2000, 4000]) {
          if (!(st.pending || 0)) break;
          await wait(ms);
          st = await getJson<St>(stampedPath, { refresh: true, keep: notPending });
        }
        return st;
      })(),
    ]);
    const months = sum.months || [];
    const saved = sv.saved || [], stamped = st0.stamped || [];
    return NextResponse.json({
      ym, months, companies: storeCompanies(make.genba || null, saved, stamped),
      savedN: saved.length, stampedN: stamped.length, pending: st0.pending || 0, generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof AuthGone) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(err as Error).message}）` }, { status: 502 });
  }
}
