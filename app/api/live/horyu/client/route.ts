import { ikeWrite } from '@/lib/ike-write';
import { bad, isClientKey, str } from '@/lib/live/horyu-guard';

// 客先向けの画面（保留）＝今の client.html と同じ /api/client-view の客先の口。鍵（URL の #k=）は X-Client-Key で渡す。
//   ・list    … 一覧（★今のシステムはここで「最後に見た日時・見た回数」を書く＝客先の画面を開いたときだけ呼ぶ）
//   ・history … 送信履歴（読むだけ）
//   ・match   … 案件文 → 合う人（読むだけ。並びは 必須が全部合う人が先 → 歓迎条件の一致×10＋通勤の回答あり）
//   ・request … 意向確認の依頼（ikou_requests に積む・よろずやに知らせる＝今と同じ）
//   ・decline … 見送り（理由の記録だけ）
const REASONS = ['経験・スキルが合わない', '通勤', '稼働時期', 'その他'];
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const op = String(b.op || '');
  if (!isClientKey(b.key)) return bad('リンクの鍵がありません', 401);
  const headers = { 'X-Client-Key': String(b.key) };
  if (op === 'list') return ikeWrite(req, '/api/client-view?action=list', null, { method: 'GET', headers });
  if (op === 'history') return ikeWrite(req, '/api/client-view?action=history', null, { method: 'GET', headers });
  if (op === 'match') {
    const caseText = str(b.caseText, 5000);
    if (!caseText) return bad('案件情報を貼り付けてください');
    return ikeWrite(req, '/api/client-view?action=match', { caseText, station: str(b.station, 30) }, { headers });
  }
  if (op === 'request') {
    const refs = (Array.isArray(b.refs) ? b.refs : []).map((x) => str(x, 40)).filter(Boolean);
    if (!refs.length) return bad('対象を選んでください');
    if (refs.length > 10) return bad('一度に10名までです');
    const source = b.source === 'match' ? 'match' : 'catalog';
    return ikeWrite(req, '/api/client-view?action=request', { refs, source, caseText: source === 'match' ? str(b.caseText, 5000) : '' }, { headers });
  }
  if (op === 'decline') {
    const ref = str(b.ref, 40), reason = str(b.reason, 40);
    if (!ref) return bad('対象がありません');
    if (reason && !REASONS.includes(reason)) return bad('理由が正しくありません');
    return ikeWrite(req, '/api/client-view?action=decline', { ref, reason, caseText: str(b.caseText, 5000) }, { headers });
  }
  return bad('この操作はできません');
}
