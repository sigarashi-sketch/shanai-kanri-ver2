import { NextResponse } from 'next/server';
import { ikeWrite, sameSite } from '@/lib/ike-write';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { IV_LOCATIONS, IV_STATUSES, ivParallelCounts, ivUsable, type IvRec } from '@/lib/live/mendan';

// 面談管理の保存の口（今の /interviews.html と同じ書き方・行き先は op ごとに決め打ち）。
//   op=add     → /api/proxy?action=addInterview      … Google カレンダーに予定を作る＋ステータスを保存（今と同じ）
//   op=update  → /api/proxy?action=updateInterview   … カレンダーの予定を直す＋ステータスを保存
//   op=status  → /api/proxy?action=updateInterviewStatus（ステータスだけ・カレンダーは触らない）
//   op=delete  → /api/proxy?action=deleteInterview   … カレンダーの予定も消す（画面で確かめてから）
//   成約になったら /api/roster?op=crud&action=reflectInterviewStatus（営業リストの参画決定・氏名が1人に決まるときだけ）
//   op=parallel → 今月の進行中の件数を数えて /api/roster?op=crud&action=syncParallelCounts（数えるのはここ＝画面から名前や数を渡させない）
//   ★LINE は送らない。辞退は営業リストに反映しない（今と同じ）

const STATUS_SET = new Set<string>(['', ...IV_STATUSES]);
const LOC_SET = new Set<string>(['', ...IV_LOCATIONS]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2})?$/;
// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
// eslint-disable-next-line no-control-regex
const CTRL_ID = /[\u0000-\u001f\s]/;
const txt = (v: unknown, max: number) => String(v ?? '').replace(CTRL, '').trim().slice(0, max);
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

function idOf(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s && s.length <= 300 && !CTRL_ID.test(s) ? s : null;
}

/** add / update の中身（今の editParams と同じ項目）。おかしければ文字列で理由 */
function fields(b: Record<string, unknown>, needDate: boolean) {
  const name = txt(b.name, 100);
  if (!name) return '要員名を入れてください';
  const status = String(b.status ?? '');
  if (!STATUS_SET.has(status)) return 'ステータスが違います';
  const location = String(b.location ?? '');
  if (!LOC_SET.has(location)) return '対面／オンラインが違います';
  const date = String(b.date ?? '').trim();
  if (date && !DATE_RE.test(date)) return '面談日時の形が違います';
  if (needDate && !date) return '面談日時を入れてください（カレンダーに予定を作るため）';
  return {
    name, status, location, date,
    salesRep: txt(b.salesRep, 50), trainer: txt(b.trainer, 50), caseInfo: txt(b.caseInfo, 3000), memo: txt(b.memo, 3000),
  };
}

async function bodyOf(r: NextResponse): Promise<Record<string, unknown>> {
  try { return (await r.clone().json()) as Record<string, unknown>; } catch { return {}; }
}

/** 成約なら営業リストへ（ベストエフォート：面談の保存の成否には関わらせない・今と同じ） */
async function reflect(req: Request, name: string, status: string) {
  if (status !== '成約' || !name) return null;
  const r = await ikeWrite(req, '/api/roster?op=crud&action=reflectInterviewStatus', { name, status });
  const j = await bodyOf(r);
  return r.ok ? j : { success: false, error: j.error || '反映できませんでした' };
}

export async function POST(req: Request) {
  if (!sameSite(req)) return NextResponse.json({ error: 'この画面の外からは保存できません' }, { status: 403 });
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return bad('中身がありません');
  const op = String(b.op || '');

  if (op === 'add') {
    const f = fields(b, true);
    if (typeof f === 'string') return bad(f);
    const r = await ikeWrite(req, '/api/proxy?action=addInterview', f);
    if (!r.ok) return r;
    const j = await bodyOf(r);
    return NextResponse.json({ ...j, reflected: await reflect(req, f.name, f.status) });
  }

  if (op === 'update') {
    const id = idOf(b.id);
    if (!id) return bad('どの面談か分かりません');
    const f = fields(b, false);
    if (typeof f === 'string') return bad(f);
    const r = await ikeWrite(req, '/api/proxy?action=updateInterview', { id, ...f });
    if (!r.ok) return r;
    const j = await bodyOf(r);
    // 今と同じく「ステータスが変わったとき」だけ営業リストへ
    return NextResponse.json({ ...j, reflected: b.statusChanged === true ? await reflect(req, f.name, f.status) : null });
  }

  if (op === 'status') {
    const id = idOf(b.id);
    if (!id) return bad('どの面談か分かりません');
    const status = String(b.status ?? '');
    if (!STATUS_SET.has(status)) return bad('ステータスが違います');
    const name = txt(b.name, 100);
    const r = await ikeWrite(req, '/api/proxy?action=updateInterviewStatus', { id, status, name });
    if (!r.ok) return r;
    const j = await bodyOf(r);
    return NextResponse.json({ ...j, reflected: await reflect(req, name, status) });
  }

  if (op === 'delete') {
    const id = idOf(b.id);
    if (!id) return bad('どの面談か分かりません');
    if (b.confirmed !== true) return bad('削除は確かめてから押してください');
    return ikeWrite(req, '/api/proxy?action=deleteInterview', { id });
  }

  if (op === 'parallel') {
    // 面談一覧を読む（SELECT だけ）→ 今月の進行中の件数を数える → 営業リストの並行数へ（変わった人だけ書かれる）
    let rows: IvRec[];
    try {
      const r = await ikeFetch('/api/proxy?action=getInterviews', undefined, 30000);
      if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
      const j = (await r.json().catch(() => null)) as unknown;
      if (!r.ok || !Array.isArray(j)) return NextResponse.json({ error: '面談一覧が読めなかったので、並行数は直していません' }, { status: 502 });
      rows = ivUsable(j as IvRec[]);
    } catch (e) {
      return NextResponse.json({ error: `面談一覧が読めませんでした（${(e as Error).message}）` }, { status: 502 });
    }
    const counts = ivParallelCounts(rows);
    if (!counts.length) return NextResponse.json({ ok: true, updated: 0 });
    return ikeWrite(req, '/api/roster?op=crud&action=syncParallelCounts', { counts });
  }

  return bad('この操作はできません');
}
