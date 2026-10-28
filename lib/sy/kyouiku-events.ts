import 'server-only';
import { db } from './db';
import { COURSES } from './kyouiku-courses';

// bdsh の「開いた・押した」の記録（2026-10-19 shoya「bdsh の集計 クリック率とか スキルチェックの結果とか ダッシュボードで見やすく」）。
//   表は増やさず kyouiku_progress に quest='_ev:<何>' の1行（step=0・ok=true）。同じ人の同じ記録は 1日（日本時間）1行まで＝人数を数えるための記録
//   _ev:open        … 受講ページを開いた
//   _ev:menu        … 公式LINEのリッチメニューの bdsh を押した（lib/m.ts）
//   _ev:c:<コースid> … コースを選ぶ画面で そのコースを押した（スキルチェックは c:check）
//   ★'_' 始まりなので 受講データ（lib/kyouiku-data.ts）のクエストの集計には混ざらない。集計は lib/kyouiku-stats.ts
export const EV_PREFIX = '_ev:';
const COURSE_IDS = new Set([...COURSES.filter((c) => c.ready).map((c) => c.id), 'check']);
export const cleanEv = (raw: unknown): string | null => {
  const s = String(raw || '');
  if (s === 'open') return s;   // menu は サーバ（lib/m.ts）だけが書く
  if (s.startsWith('c:') && COURSE_IDS.has(s.slice(2))) return s;
  return null;
};

// 日本時間の その日の 0時（UTC の ISO）
const jstDayStart = () => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCHours(0, 0, 0, 0); return new Date(d.getTime() - 9 * 3600e3).toISOString(); };

export async function logEvent(subject: string, ev: string, name = ''): Promise<void> {
  try {
    const quest = EV_PREFIX + ev;
    const { data } = await db().from('kyouiku_progress').select('id').eq('subject_key', subject).eq('quest', quest).gte('created_at', jstDayStart()).limit(1);
    if (data?.length) return;
    await db().from('kyouiku_progress').insert({ subject_key: subject, name, quest, step: 0, ok: true, detail: {} });
  } catch (e) { console.error('kyouiku ev', (e as Error).message); }
}
