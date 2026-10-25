import { NextResponse } from 'next/server';
import { ikeWrite } from '@/lib/ike-write';
import { APP_STATUSES, CASE_AREAS, CASE_AUDIENCES, CASE_BADGES, CASE_JOBS, CASE_WORK_STYLES } from '@/lib/live/keisai';

// 案件掲載・応募管理の保存の口（今の /case-admin.html・/case-apps.html と同じ）。行き先は op ごとに決め打ち：
//   create / save / publish / close / duplicate → /api/case-admin?action=<同じ名前>
//   app-status                                  → /api/case-admin?action=updateStatus（応募のステータス）
//   ★選択式の値はここでも許可リストと照合（今のシステムも照合する）。公開・締切は画面で確かめてから
//   ★案件は消さない（締切＝要員の一覧から下ろすだけ・今と同じ）
// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
const txt = (v: unknown, max: number) => String(v ?? '').replace(CTRL, '').trim().slice(0, max);
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const TARGET = {
  create: '/api/case-admin?action=create',
  save: '/api/case-admin?action=save',
  publish: '/api/case-admin?action=publish',
  close: '/api/case-admin?action=close',
  duplicate: '/api/case-admin?action=duplicate',
} as const;

const oneOf = <T extends readonly string[]>(v: unknown, list: T) => { const s = String(v ?? ''); return s === '' ? '' : (list as readonly string[]).includes(s) ? s : null; };
const manyOf = (v: unknown, list: readonly string[]) => {
  if (v == null) return [];
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v.map(String))];
  return out.every((x) => list.includes(x)) ? out : null;
};

function postBody(b: Record<string, unknown>) {
  const title = txt(b.title, 200);
  const bodyText = String(b.bodyText ?? '').replace(CTRL, '').replace(/\r\n?/g, '\n').slice(0, 20000);
  if (!title) return '掲載タイトルを入れてください';
  if (!bodyText.trim()) return '本文を入れてください';
  const area = oneOf(b.area, CASE_AREAS); if (area === null) return 'エリアが違います';
  const job = oneOf(b.job, CASE_JOBS); if (job === null) return '職種が違います';
  const workStyles = manyOf(b.workStyles, CASE_WORK_STYLES); if (!workStyles) return '勤務形態が違います';
  const badges = manyOf(b.badges, CASE_BADGES); if (!badges) return 'バッジが違います';
  const audience = oneOf(b.audience, CASE_AUDIENCES.map((x) => x.v)); if (audience === null) return '公開範囲が違います';
  const hc = Number(b.headcount);
  const closeOn = String(b.closeOn ?? '');
  if (closeOn && !/^\d{4}-\d{2}-\d{2}$/.test(closeOn)) return '掲載終了日の形が違います';
  const slack = txt(b.slackPermalink, 500);
  return {
    title, bodyText, area, job, workStyles, badges, audience: audience || 'all',
    station: txt(b.station, 100), startText: txt(b.startText, 100),
    headcount: Number.isFinite(hc) && hc > 0 ? Math.floor(hc) : '',
    pinned: b.pinned === true, closeOn,
    // 今の画面では隠れている欄。入っている案件を直したときに消さないよう、読んだ値をそのまま戻す
    slackPermalink: /^https:\/\//.test(slack) ? slack : '',
  };
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return bad('中身がありません');
  const op = String(b.op || '');
  const id = b.id == null || b.id === '' ? '' : String(b.id);
  if (id && !ID_RE.test(id)) return bad('どの案件か分かりません');

  if (op === 'create' || op === 'save' || op === 'publish') {
    const v = postBody(b);
    if (typeof v === 'string') return bad(v);
    if (op === 'save' && !id) return bad('どの案件か分かりません');
    if (op === 'create' && id) return bad('新しく作るときは案件を選ばないでください');
    if (op === 'publish' && b.confirmed !== true) return bad('公開は確かめてから押してください');
    return ikeWrite(req, TARGET[op], id ? { id, ...v } : v);
  }
  if (op === 'close' || op === 'duplicate') {
    if (!id) return bad('どの案件か分かりません');
    if (op === 'close' && b.confirmed !== true) return bad('締切は確かめてから押してください');
    return ikeWrite(req, TARGET[op], { id });
  }
  if (op === 'app-status') {
    if (!id) return bad('どの応募か分かりません');
    const status = String(b.status ?? '');
    if (!APP_STATUSES.some((x) => x.v === status)) return bad('ステータスが違います');
    return ikeWrite(req, '/api/case-admin?action=updateStatus', { id, status });
  }
  return bad('この操作はできません');
}
