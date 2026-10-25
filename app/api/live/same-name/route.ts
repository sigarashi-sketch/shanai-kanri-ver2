import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { loadMikeikenSet } from '@/lib/live/mikeiken-server';
import { filterSameName, type SameNameItem } from '@/lib/live/same-name';
import { ikeRole } from '@/lib/live/role';

// 同姓同名をつなぐ（設定の中・全体管理者だけ・10-25 shoya「応募IDで進めて」）。
//   GET  … 今のシステムの GET /api/roster?op=person&action=list（SELECT だけ）を読んで、未経験の人の同姓同名だけ返す
//   POST … { kind: 'roster', name, ym, personId } ＝その月の名簿の行がだれか
//          { kind: 'basic', name, token, personId } ＝基本情報フォームのその回答がだれか
//          → 今のシステムの POST /api/roster?op=person&action=setRoster|setBasic（super_admin / admin だけ。今のシステムでも確かめる）
//   ★人は選ぶだけ（手で番号を打たない）。選べるのはその名前の応募（営業リストの行）だけ
//   ★電話・住所などは返さない（採用担当・所属・最寄駅・回答日だけ）
const ADMIN = new Set(['super_admin', 'admin']);
const GONE = 'ログインが切れました。もう一度ログインしてください';

async function gate(): Promise<NextResponse | null> {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const role = await ikeRole();
  if (!ADMIN.has(role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return null;
}

export async function GET(req: Request) {
  const g = await gate();
  if (g) return g;
  const ym = new URL(req.url).searchParams.get('ym') || '';
  try {
    const [r, mk] = await Promise.all([
      ikeFetch(`/api/roster?op=person&action=list${/^\d{4}年\d{2}月$/.test(ym) ? `&ym=${encodeURIComponent(ym)}` : ''}`),
      loadMikeikenSet(),
    ]);
    if (r.status === 401) return NextResponse.json({ error: GONE }, { status: 401 });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; ym?: string; sameName?: SameNameItem[]; error?: string };
    if (!r.ok || !j.ok) return NextResponse.json({ error: `今の社内システムから読めませんでした（${r.status}${j.error ? `・${j.error}` : ''}）` }, { status: 502 });
    return NextResponse.json({ ok: true, ym: j.ym || '', items: filterSameName(j.sameName || [], mk) });
  } catch (e) {
    const m = (e as Error).message;
    if (m.startsWith('ログインが切れ')) return NextResponse.json({ error: GONE }, { status: 401 });
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${m}）` }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const g = await gate();
  if (g) return g;
  const b = (await req.json().catch(() => ({}))) as { kind?: string; name?: string; ym?: string; token?: string; personId?: string };
  const name = String(b.name || '').trim();
  const personId = String(b.personId || '').trim();
  if (!name || name.length > 60) return NextResponse.json({ error: '名前がありません' }, { status: 400 });
  if (!/^[0-9A-Za-z][0-9A-Za-z_-]{2,63}$/.test(personId)) return NextResponse.json({ error: '人を選んでください' }, { status: 400 });
  let action = '', body: Record<string, string> = {};
  if (b.kind === 'roster') {
    const ym = String(b.ym || '');
    if (!/^\d{4}年\d{2}月$/.test(ym)) return NextResponse.json({ error: '月がありません' }, { status: 400 });
    action = 'setRoster'; body = { name, ym, personId };
  } else if (b.kind === 'basic') {
    const token = String(b.token ?? '');
    if (token && !/^[A-Za-z0-9_-]{6,64}$/.test(token)) return NextResponse.json({ error: '回答の番号の形が違います' }, { status: 400 });
    action = 'setBasic'; body = { name, token, personId };
  } else return NextResponse.json({ error: 'kind が違います' }, { status: 400 });
  try {
    const r = await ikeFetch(`/api/roster?op=person&action=${action}`, { method: 'POST', body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; hint?: string };
    if (r.status === 401) return NextResponse.json({ error: GONE }, { status: 401 });
    if (r.status === 403) return NextResponse.json({ error: '全体管理者だけがつなげます' }, { status: 403 });
    if (!r.ok || !j.ok) return NextResponse.json({ error: j.error || j.hint || `つなげませんでした（${r.status}）` }, { status: r.status >= 400 && r.status < 500 ? r.status : 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `今の社内システムに届きませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
