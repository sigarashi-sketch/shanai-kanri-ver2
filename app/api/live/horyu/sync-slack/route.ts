import { ikeWrite } from '@/lib/ike-write';

// 要員マップ（保留）の「案件を更新」＝今の map.html と同じ proxy?action=syncSlackCache（Slack から案件を取り直して控えに入れる）。本文なし
export async function POST(req: Request) {
  return ikeWrite(req, '/api/proxy?action=syncSlackCache', {}, { timeoutMs: 60000 });
}
