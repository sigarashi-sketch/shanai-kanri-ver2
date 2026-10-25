import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { sameSite } from '@/lib/ike-write';
import { isId, isYm, isYmd, str } from '@/lib/live/horyu-guard';

// 稼働表出力（保留）の「出力」＝今の POST /api/kadohyo?action=export（1人×1形式の Excel / PDF を1ファイル返す。保存はしない）。
//   答えがファイル（バイナリ）なので ikeWrite（JSON だけ）ではなく、同じ確かめ（同じサイトから・ログイン中）をしてそのまま返す。
//   今のシステムは出力の操作ログを1行残す（今の画面と同じ）
export async function POST(req: Request) {
  if (!sameSite(req)) return NextResponse.json({ error: 'この画面の外からは出力できません' }, { status: 403 });
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const t = (b.target || {}) as Record<string, unknown>;
  if (!isYm(b.ym)) return NextResponse.json({ error: '対象月が正しくありません' }, { status: 400 });
  const format = b.format === 'pdf' ? 'pdf' : 'xlsx';
  const name = str(t.name, 60);
  if (!name) return NextResponse.json({ error: '名前がありません' }, { status: 400 });
  const days = (Array.isArray(t.days) ? t.days : []).slice(0, 62).map((x) => {
    const d = (x || {}) as Record<string, unknown>;
    return { date: isYmd(d.date) ? d.date : '', weekday: str(d.weekday, 2), clockIn: str(d.clockIn, 5), clockOut: str(d.clockOut, 5), breakMins: Number(d.breakMins) || 0, note: str(d.note, 200), worked: !!d.worked };
  });
  const fares = (Array.isArray(t.fares) ? t.fares : []).slice(0, 200).map((x) => {
    const r = (x || {}) as Record<string, unknown>;
    return { date: isYmd(r.date) ? r.date : '', note: str(r.note, 60), carrier: str(r.carrier, 10), from: str(r.from, 60), to: str(r.to, 60), fare: Math.max(0, Number(r.fare) || 0) };
  });
  const target = {
    name, employeeId: isId(t.employeeId) ? t.employeeId : '', companyId: isId(t.companyId) ? t.companyId : '',
    ...(days.length ? { days } : {}), ...(fares.length ? { fares } : {}),
  };
  try {
    const r = await ikeFetch('/api/kadohyo?action=export', { method: 'POST', body: JSON.stringify({ ym: b.ym, format, includeFare: b.includeFare !== false, target }) }, 55000);
    if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } | string };
      const e = typeof j.error === 'string' ? j.error : j.error?.message;
      return NextResponse.json({ error: e || `出力できませんでした（${r.status}）` }, { status: r.ok ? 502 : r.status });
    }
    const bytes = await r.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: { 'Content-Type': ct || 'application/octet-stream', 'X-Kadohyo-Filename': r.headers.get('x-kadohyo-filename') || '', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return NextResponse.json({ error: `今の社内システムから出力できませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
