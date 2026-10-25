// 保留（あとで決める）の画面から今の社内システムに書く口（POST だけ・lib/ike-write.ts の ikeWrite を通す）。
//   kind ごとに行き先は決め打ち。画面は kind と最小の値しか渡せない:
//     left-handle {id}          … POST /api/member-left?action=handle（退会・ブロック検知を「対応済み」に）
//     left-jitai  {id}          … その検知の人を辞退にチェック（GET /api/proxy?action=setEngineerStatusByName&statusKey=辞退&value=true）→ 対応済み
//                                 ★名前は画面から受け取らない。今の未対応一覧をサーバで読み直し、id の行の名前を使う（未経験の人だけ）
//     left-mode   {mode}        … POST /api/member-left?action=setMode（off/dry/on・今のシステム側で管理者だけ）
//     link        {userId,name} … POST /api/chat?action=link（LINE の連絡先を要員に紐付け。name は未経験の人の名前か空＝解除）
//     link-sync   {}            … POST /api/roster?op=linkboard&do=sync（稼働中メニューの同期。RICHMENU_SYNC=off なら何もしない）
//   ★権限の判定は今のシステム。ここでは形と中身（一覧にいる id か・未経験の名前か）だけ確かめる
import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { ikeWrite, sameSite } from '@/lib/ike-write';
import { loadMikeikenSet } from '@/lib/live/mikeiken-server';
import { isMikeiken, MIKEIKEN_PATH } from '@/lib/live/mikeiken';
import type { EngineerRows } from '@/lib/live/eigyo-common';

const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
const ID = /^[A-Za-z0-9_-]{1,64}$/;

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  const r = await ikeFetch(path);
  if (!r.ok) return null;
  return (await r.json().catch(() => null)) as Record<string, unknown> | null;
}

export async function POST(req: Request) {
  if (!sameSite(req)) return bad('この画面の外からは保存できません', 403);
  if (!(await ikeToken())) return bad('not_logged_in', 401);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = String(b.kind || '');

  if (kind === 'left-handle') {
    const id = String(b.id || '');
    if (!ID.test(id)) return bad('どの検知か分かりません');
    return ikeWrite(req, '/api/member-left?action=handle', { id });
  }
  if (kind === 'left-mode') {
    const mode = String(b.mode || '');
    if (!['off', 'dry', 'on'].includes(mode)) return bad('モードは off / dry / on のどれかです');
    return ikeWrite(req, '/api/member-left?action=setMode', { mode });
  }
  if (kind === 'left-jitai') {
    const id = String(b.id || '');
    if (!ID.test(id)) return bad('どの検知か分かりません');
    const list = await readJson('/api/member-left?action=list');
    const row = ((list?.rows as Record<string, unknown>[]) || []).find((r) => String(r.id) === id);
    const name = String(row?.name || '').trim();
    if (!row || !name) return bad('この検知は一覧にないか、名前が引けていません', 404);
    if (!isMikeiken(await loadMikeikenSet(), name)) return bad('この人は未経験のプロパーリストにいません', 404);
    const q = new URLSearchParams({ action: 'setEngineerStatusByName', name, statusKey: '辞退', value: 'true' });
    const res = await ikeWrite(req, `/api/proxy?${q}`, null, { method: 'GET' });
    if (!res.ok) return res;
    return ikeWrite(req, '/api/member-left?action=handle', { id });
  }
  if (kind === 'link') {
    const userId = String(b.userId || '');
    const name = String(b.name ?? '').trim();
    if (!/^U[0-9a-f]{32}$/.test(userId)) return bad('LINE の相手が分かりません');
    const board = await readJson('/api/roster?op=linkboard');
    if (!((board?.rows as Record<string, unknown>[]) || []).some((r) => String(r.userId) === userId)) return bad('この連絡先は一覧にありません', 404);
    if (name) {
      // 選ぶだけ（自由入力はさせない）：今のプロパーリストの名前そのものと一致すること
      const er = (await readJson(MIKEIKEN_PATH)) as EngineerRows | null;
      if (!(er?.rows || []).some((r) => String(r.name || '').trim() === name)) return bad('プロパーリストの名前から選んでください');
    }
    return ikeWrite(req, '/api/chat?action=link', { userId, name });
  }
  if (kind === 'link-sync') return ikeWrite(req, '/api/roster?op=linkboard&do=sync', {}, { timeoutMs: 55000 });
  return bad('操作の指定が違います');
}

export const maxDuration = 60;
