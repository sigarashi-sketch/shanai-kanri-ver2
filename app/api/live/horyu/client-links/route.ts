import { ikeWrite } from '@/lib/ike-write';
import { bad, isId, str } from '@/lib/live/horyu-guard';

// 客先向けリンク（保留）の書き込み＝今の client-links.html と同じ /api/client-view の社内用 POST。
//   issue（発行・鍵はこの答えでだけ返る）／reissue（URL を作り直す＝前の URL は使えなくなる）／revoke（停止）／setMention（よろずやで呼ぶ人）
const PATH: Record<string, string> = {
  issue: '/api/client-view?action=issue', reissue: '/api/client-view?action=reissue',
  revoke: '/api/client-view?action=revoke', setMention: '/api/client-view?action=setMention',
};
const uids = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => String(x)).filter((x) => /^U[0-9a-f]{32}$/.test(x)).slice(0, 10);

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const op = String(b.op || '');
  const path = PATH[op];
  if (!path) return bad('この操作はできません');
  if (op === 'issue') {
    const label = str(b.label, 60);
    if (!label) return bad('客先名を入れてください');
    return ikeWrite(req, path, { label, note: str(b.note, 200), mention: uids(b.mention) });
  }
  if (!isId(b.id)) return bad('リンクの id がありません');
  if (op === 'setMention') return ikeWrite(req, path, { id: b.id, mention: uids(b.mention) });
  return ikeWrite(req, path, { id: b.id });
}
