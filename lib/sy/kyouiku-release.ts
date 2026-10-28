import 'server-only';
import { db } from './db';
import { learnerInfo } from './kyouiku';
import { normName } from './name';
import { DEFAULT_RELEASE, cleanRelease, gateOpen, type GateCourse, type ReleaseSettings } from './kyouiku-release-types';

// bdsh のコースを いつ開くか（決め方は lib/kyouiku-release-types.ts）。受講ページを開くたびに読むので 30秒だけ覚える
let cache: { at: number; s: ReleaseSettings } | null = null;
export async function loadRelease(): Promise<ReleaseSettings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.s;
  try {
    const { data } = await db().from('settings').select('value').eq('key', 'kyouiku_release').maybeSingle();
    const s = data?.value ? cleanRelease(data.value) : DEFAULT_RELEASE;
    cache = { at: Date.now(), s }; return s;
  } catch { return DEFAULT_RELEASE; }
}
export async function saveRelease(v: unknown, by: string): Promise<{ settings?: ReleaseSettings; error?: string }> {
  const settings = cleanRelease(v);
  const { error } = await db().from('settings').upsert({ key: 'kyouiku_release', value: settings, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return { error: error.message };
  cache = { at: Date.now(), s: settings };
  return { settings };
}
// この人に このコースを開いてよいか（参画決定前かどうか × 設定）。super admin かどうか・人ごとのオンは 呼ぶ側で見る
export async function courseGate(subject: string, id: GateCourse): Promise<boolean> {
  const [s, info] = await Promise.all([loadRelease(), learnerInfo(subject)]);
  return gateOpen(s, id, info.trial);
}

// 勉強会（火・木・土）の回答に名前がある人（正規化氏名）。出席・リモート＝来た／来る予定（先の日付も含む）。欠席だけの人は入れない
//   ★曜日では分けない: 回答シート（名前は「土曜日勉強会」）には 火曜・木曜の回も入っている（2026-10-10 shoya「CCNAの勉強会 火曜も木曜もある」・DB でも 火・木・土 の行を確認）
//   元は saiyou.study_attendance（いけどんの cron が 回答シートから10分ごとに写す・supabase/0020）。60秒だけ覚える。読めなかったときは だれも入れない
let studyCache: { at: number; set: Set<string> } | null = null;
async function studyNames(): Promise<Set<string>> {
  if (studyCache && Date.now() - studyCache.at < 60_000) return studyCache.set;
  const set = new Set<string>();
  try {
    for (let from = 0; from < 50000; from += 1000) {
      const { data, error } = await db().from('study_attendance').select('normalized_name, name, attended').or('attended.is.null,attended.eq.true').range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const r of data || []) { const n = normName(r.normalized_name || r.name); if (n) set.add(n); }
      if (!data || data.length < 1000) break;
    }
  } catch (e) { console.error('study names', (e as Error).message); return set; }
  studyCache = { at: Date.now(), set }; return set;
}
// CCNA を 勉強会で開いてよいか（設定 ccnaStudy がオンで、本人の氏名が 勉強会の回答にある）。内勤（u:）は 対象外
export async function ccnaByStudy(subject: string): Promise<boolean> {
  if (!(await loadRelease()).ccnaStudy) return false;
  const nn = subject.startsWith('n:') ? subject.slice(2) : subject.startsWith('p:') ? normName((await learnerInfo(subject)).name) : '';
  return !!nn && (await studyNames()).has(nn);
}
