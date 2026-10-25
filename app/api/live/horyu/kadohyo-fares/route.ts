import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { ikeWrite } from '@/lib/ike-write';
import { bad, isYm, isYmd, str } from '@/lib/live/horyu-guard';

// 稼働表出力（保留）の交通費。
//   op:'get' … 読む＝今の GET /api/kadohyo?action=fares&ym=&name=（SELECT だけ。名前を画面の URL に出さないよう POST で受けてサーバーから読む）
//   それ以外 … 保存＝今の POST /api/kadohyo?action=fares（その人・その月の行を全部入れ替える）
const CARRIERS = ['電車', 'バス', 'タクシー', 'その他'];
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isYm(b.ym)) return bad('対象月が正しくありません');
  const name = str(b.name, 60);
  if (!name) return bad('名前がありません');
  if (b.op === 'get') {
    if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
    try {
      const r = await ikeFetch(`/api/kadohyo?${new URLSearchParams({ action: 'fares', ym: String(b.ym), name })}`);
      if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; rows?: unknown[]; error?: { message?: string } | string };
      if (!r.ok || j.ok === false) return NextResponse.json({ error: (typeof j.error === 'string' ? j.error : j.error?.message) || `読めませんでした（${r.status}）` }, { status: 502 });
      return NextResponse.json({ ok: true, rows: j.rows ?? [] });
    } catch (e) {
      return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
    }
  }
  const raw = Array.isArray(b.rows) ? b.rows : [];
  if (raw.length > 200) return bad('交通費の行が多すぎます（200行まで）');
  const rows = raw.map((x) => {
    const r = (x || {}) as Record<string, unknown>;
    const carrier = str(r.carrier, 10);
    return {
      date: isYmd(r.date) ? String(r.date) : '', note: str(r.note, 60), carrier: CARRIERS.includes(carrier) ? carrier : '電車',
      from: str(r.from, 60), to: str(r.to, 60), fare: Math.max(0, Math.min(1_000_000, Math.round(Number(r.fare) || 0))),
    };
  }).filter((r) => (r.date || r.note) && r.fare);
  return ikeWrite(req, '/api/kadohyo?action=fares', { ym: b.ym, name, rows });
}
