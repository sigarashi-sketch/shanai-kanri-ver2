import { NextResponse } from 'next/server';
import { ikeWrite, sameSite } from '@/lib/ike-write';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { loadMikeikenSet } from '@/lib/live/mikeiken-server';
import { isMikeiken, type MikeikenSet } from '@/lib/live/mikeiken';
import { ALL_SHIME_REASONS, SHIME_AUTO, SHIME_BULK_MAX, type IkeShimeBoard } from '@/lib/live/shime';

// 勤怠の締め（/roumu/shime）の書く口（10-25）。今の POST /api/roster?op=shime&action=close|reopen にだけ書く。
//   ・権限は今の社内システムが見る（ページ権限 kintai-shime）。ver2 は中身の形だけ確かめる
//   ・close の理由は今の画面（kintai-shime.html）と同じ選択肢だけ（自由入力にしない）
//   ★まとめて締める（close-mine）は今の close-matched を使わない（あれは未経験以外も締める）。
//     画面から送られた人を、ここでもう一度「未経験（プロパーリスト）か・その月が一致など締めてよい状態か・月の途中でないか」を
//     今の締めの表とプロパーリストで確かめてから、1人ずつ close を呼ぶ。1回に SHIME_BULK_MAX 人まで（画面は何回かに分けて送る）

const YM = /^\d{4}-\d{2}$/;

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action || '');
  const ym = String(b.ym || '');
  if (!YM.test(ym)) return NextResponse.json({ error: '月の指定が違います' }, { status: 400 });
  const key = String(b.key || '').slice(0, 80);
  if (action === 'detail') return detail(ym, key);
  if (action === 'close') {
    if (!key) return NextResponse.json({ error: '人の指定がありません' }, { status: 400 });
    const reason = String(b.reason || '');
    if (reason && !ALL_SHIME_REASONS.includes(reason)) return NextResponse.json({ error: '理由は選択肢から選んでください' }, { status: 400 });
    return ikeWrite(req, '/api/roster?op=shime&action=close', { ym, key, reason, note: '' });
  }
  if (action === 'reopen') {
    if (!key) return NextResponse.json({ error: '人の指定がありません' }, { status: 400 });
    return ikeWrite(req, '/api/roster?op=shime&action=reopen', { ym, key });
  }
  if (action === 'close-mine') return closeMine(req, ym, b.keys);
  return NextResponse.json({ error: 'この操作はできません' }, { status: 400 });
}

// 読むだけ：1人1月の日ごと（勤怠の照合 /keiri/kintai-shogo）。今の GET roster?op=shime&action=detail は SELECT だけ。
//   名前（key）を画面の URL に出さないよう POST で受けて、サーバーから読む
async function detail(ym: string, key: string): Promise<NextResponse> {
  if (!key) return NextResponse.json({ error: '人の指定がありません' }, { status: 400 });
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  try {
    const r = await ikeFetch(`/api/roster?${new URLSearchParams({ op: 'shime', action: 'detail', ym, key })}`, undefined, 30000);
    if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!r.ok || !j.ok) return NextResponse.json({ error: j.error || `読めませんでした（${r.status}）` }, { status: r.status === 403 ? 403 : 502 });
    return NextResponse.json(j);
  } catch (e) {
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}

type One = { key: string; ok: boolean; error?: string };

async function closeMine(req: Request, ym: string, raw: unknown): Promise<NextResponse> {
  if (!sameSite(req)) return NextResponse.json({ error: 'この画面の外からは保存できません' }, { status: 403 });
  const keys = Array.isArray(raw) ? [...new Set(raw.map((k) => String(k || '').slice(0, 80)).filter(Boolean))] : [];
  if (!keys.length) return NextResponse.json({ error: '人の指定がありません' }, { status: 400 });
  if (keys.length > SHIME_BULK_MAX) return NextResponse.json({ error: `1回に ${SHIME_BULK_MAX}人までです` }, { status: 400 });
  let board: IkeShimeBoard, mk: MikeikenSet;
  try {
    const [r, set] = await Promise.all([ikeFetch('/api/roster?op=shime&action=board', undefined, 30000), loadMikeikenSet()]);
    if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    board = (await r.json()) as IkeShimeBoard;
    if (!r.ok || !board?.ok) return NextResponse.json({ error: '締めの表が読めないので締めませんでした' }, { status: 502 });
    mk = set;
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ error: m === 'not_logged_in' ? 'not_logged_in' : `確かめられないので締めませんでした（${m}）` }, { status: m === 'not_logged_in' ? 401 : 502 });
  }
  if (!board.currentYm || ym >= board.currentYm) return NextResponse.json({ error: 'まだ月の途中なので締められません' }, { status: 400 });
  const byKey = new Map(board.rows.map((r) => [r.key, r]));
  const results: One[] = [];
  for (const key of keys) {
    const row = byKey.get(key);
    const st = row?.cells?.[ym]?.status;
    if (!row || !isMikeiken(mk, row.name)) { results.push({ key, ok: false, error: '未経験の人ではないので締めません' }); continue; }
    if (!st || !SHIME_AUTO.includes(st)) { results.push({ key, ok: false, error: st === 'closed' ? 'もう締まっています' : '一致していないので締めません（1人ずつ理由を選んで締めます）' }); continue; }
    const res = await ikeWrite(req, '/api/roster?op=shime&action=close', { ym, key, reason: '', note: '' });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 401) return NextResponse.json({ error: j.error || 'not_logged_in', results }, { status: 401 });
    results.push(res.ok ? { key, ok: true } : { key, ok: false, error: j.error || `締められませんでした（${res.status}）` });
  }
  return NextResponse.json({ ok: true, results });
}
