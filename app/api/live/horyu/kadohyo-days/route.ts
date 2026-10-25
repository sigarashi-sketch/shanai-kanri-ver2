import { ikeWrite } from '@/lib/ike-write';
import { bad, isId, isYm } from '@/lib/live/horyu-guard';

// 稼働表出力（保留）の「freee の日次勤怠」＝今の /api/kadohyo?action=days。
//   今のシステムでは GET だが、freee を読んで控えの表（freee_work_records）に書くので、読む口（/api/ike）には通さずここから呼ぶ
//   （同じサイトからの POST だけ・行き先は決め打ち）。freee への書き込みは今のシステムもしない
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isYm(b.ym)) return bad('対象月が正しくありません');
  if (!isId(b.employee_id) || !isId(b.company_id)) return bad('freee の従業員が決まっていません');
  const q = new URLSearchParams({ action: 'days', ym: String(b.ym), employee_id: String(b.employee_id), company_id: String(b.company_id) });
  if (b.refresh === true) q.set('refresh', '1');
  return ikeWrite(req, `/api/kadohyo?${q}`, null, { method: 'GET', timeoutMs: 55000 });
}
