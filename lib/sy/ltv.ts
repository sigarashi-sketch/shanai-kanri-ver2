import 'server-only';
import { unstable_cache } from 'next/cache';
import { IKEIKE_BASE } from './ikeike';
import type { LtvData } from './ltv-types';

// 要員別の月ごとの売上・粗利を いけどんから読む（/api/chingin?action=people-ltv。合言葉は service role の鍵＝いけどん側 api/_s2s.ts）。
//   いけどん側の集計は月ごとに名簿・勤怠・請求書を回すので 40秒ほどかかる → 6時間ためておく（数字が動くのは 請求書・勤怠の取り込み＝日単位）。
//   ★金額が入る。呼ぶ側（app/api/s/ltv・app/(app)/ltv）が admin 以上かを必ず確かめること
async function fetchLtv(): Promise<LtvData> {
  const r = await fetch(IKEIKE_BASE() + '/api/chingin?action=people-ltv', {
    headers: { Authorization: `Bearer ${String(process.env.IKEIKE_SERVICE_ROLE || '')}` }, cache: 'no-store', signal: AbortSignal.timeout(110000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(`いけどんから粗利を読めませんでした（${j?.error || r.status}）`);
  return { at: j.at, months: j.months || [], people: j.people || [], basis: j.basis || {} };
}
export const loadLtv = unstable_cache(fetchLtv, ['people-ltv-v1'], { revalidate: 6 * 3600 });
