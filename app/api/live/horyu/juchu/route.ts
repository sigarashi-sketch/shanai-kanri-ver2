import { ikeWrite } from '@/lib/ike-write';
import { bad, isId } from '@/lib/live/horyu-guard';

// 案件受注（保留）の書き込み＝今の juchu.html と同じ /api/kaitaku-cases の POST。
//   stock（営業共有リストへ転記＝案件ストックに P 番号で入る）／archive（一覧から下げる・戻す）
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isId(b.id)) return bad('案件の id がありません');
  if (b.op === 'stock') return ikeWrite(req, '/api/kaitaku-cases?action=stock', { id: b.id });
  if (b.op === 'archive') return ikeWrite(req, '/api/kaitaku-cases?action=archive', { id: b.id, archived: b.archived !== false });
  return bad('この操作はできません');
}
