// ホーム人事（/home/jinji）の本物。今の社内システムの読むだけの GET の形 → フィードの投稿（純粋な関数だけ）。
//   ・承諾／参画決定／辞退 … /api/shoudaku-story?list=1&days=60（承諾者ストーリーの一覧。承諾時刻と決着＝参画・辞退・ぽあ の時刻）
//   ・現場デビュー         … /api/joined?action=nyuujou（入場日カレンダー。sales_roster.nyuujou_bi を読める日付にしたもの）
//   ・現場面談             … /api/proxy?action=getInterviews（面談カンバン。date は 'YYYY-MM-DD HH:mm' JST、salesRep＝営業）
//   ・退社                 … /api/proxy?action=getRosterStatus（退社チェックと退社日）
//   ・未経験の人だけ       … /api/roster?action=getEngineerRows&area=main（プロパーリスト）に名前がある人だけ出す
//   ・担当営業             … /api/proxy?action=getRosterData の rep（稼働管理情報一覧の営業）＋ 面談カンバンの salesRep
//   本物の名前・単価はここに書かない（形とキー名だけ）
import { GROUP_TEXT, toPosts, type FeedPerson, type FeedPost, type FeedType } from '@/lib/home-jinji-sample';

export type IkeStoryList = { people?: Array<{ name: string; norm?: string; tantou?: string; shoudaku_at: string; outcome: 'sankaku' | 'jitai' | 'poa' | 'open'; outcome_at: string | null }> };
export type IkeNyuujou = { items?: Array<{ name: string; nn?: string; date: string; tantou?: string; jitai?: boolean; poa?: boolean }> };
export type IkeInterview = { id: string; status?: string; salesRep?: string; name: string; date: string; caseInfo?: string };
export type IkeRosterStatus = { normalized_name: string; taisha?: boolean; taisha_bi?: string };
export type IkeRosterRows = { rows?: Array<{ name: string; rep?: string }> };

// 今の normName と同じ（空白を詰め、さん・様を外し、異体字を寄せる）
const VARIANT: Record<string, string> = { 髙: '高', 﨑: '崎', 邊: '辺', 邉: '辺', 齋: '斎', 齊: '斉', 齌: '斎', 澤: '沢', 濱: '浜', 濵: '浜', 德: '徳', 廣: '広', 曾: '曽', 眞: '真', 靑: '青', 惠: '恵', 槇: '槙', 渕: '淵', 冨: '富', 籠: '篭', 桒: '桑', 國: '国', 萬: '万' };
export function normName(s: unknown): string {
  return String(s ?? '').normalize('NFKC').replace(/[\s　]+/g, '').replace(/(さん|サン|様|君|くん)$/, '').replace(/[髙﨑邊邉齋齊齌澤濱濵德廣曾眞靑惠槇渕冨籠桒國萬]/g, (c) => VARIANT[c] || c);
}

/** 営業として「自分の人だけ」に絞るロール（今のシステムで 営業(sales_admin)・staff_sales・かな西営業）。それ以外（管理者・人事）は全員分 */
export const SALES_ROLES = ['sales_admin', 'staff_sales', 'kanawest_sales'];

/** 担当営業の名前が自分か。担当は苗字だけのことが多いので、自分の氏名（空白なし）の頭と一致でも可（2文字以上） */
export function isMine(rep: string, meNorm: string): boolean {
  const r = normName(rep);
  if (!r || !meNorm || r.length < 2) return false;
  return r === meNorm || meNorm.startsWith(r) || r.startsWith(meNorm);
}

const ymdOf = (v: unknown): string => {
  const m = String(v ?? '').match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
};

export type BuildIn = {
  now: number; days: number;
  story: IkeStoryList | null; nyuujou: IkeNyuujou | null; interviews: IkeInterview[] | null; status: IkeRosterStatus[] | null;
  mikeiken: Map<string, string> | null;   // 未経験（プロパーリスト）の 正規化氏名 → 表示名
  reps: Map<string, string[]> | null;     // 正規化氏名 → 担当営業（営業のときだけ）
  meNorm: string;                          // 営業のときの自分（正規化）。空なら誰も出さない
  scope: 'all' | 'mine';
};

export function buildHomeJinji(i: BuildIn): { posts: FeedPost[]; warnings: string[] } {
  const warnings: string[] = [];
  const since = i.now - i.days * 86400e3;
  const todayYmd = new Date(i.now + 9 * 3600e3).toISOString().slice(0, 10);
  const sinceYmd = new Date(since + 9 * 3600e3).toISOString().slice(0, 10);
  const inWin = (iso: string | null | undefined) => { const t = Date.parse(String(iso || '')); return Number.isFinite(t) && t >= since && t <= i.now; };
  type Raw = { id: string; type: FeedType; at: string; who: FeedPerson; text: string; sub: string };
  const raw: Raw[] = [];
  const person = (name: string, sales = ''): FeedPerson => ({ name, ...(sales ? { sales } : {}) });

  // 面談カンバンの営業（担当営業の補い）
  const ivRep = new Map<string, string>();
  (i.interviews || []).forEach((v) => { const n = normName(v.name); if (n && v.salesRep) ivRep.set(n, v.salesRep); });
  const salesOf = (nn: string) => (i.reps?.get(nn)?.[0]) || ivRep.get(nn) || '';

  (i.story?.people || []).forEach((p) => {
    const nn = normName(p.norm || p.name);
    if (inWin(p.shoudaku_at)) raw.push({ id: `sh:${nn}:${p.shoudaku_at}`, type: 'shoudaku', at: p.shoudaku_at, who: person(p.name, salesOf(nn)), text: GROUP_TEXT.shoudaku, sub: p.tantou ? `採用担当 ${p.tantou}` : '' });
    if ((p.outcome === 'sankaku' || p.outcome === 'jitai') && inWin(p.outcome_at)) {
      const type: FeedType = p.outcome; const s = salesOf(nn);
      raw.push({ id: `oc:${type}:${nn}:${p.outcome_at}`, type, at: p.outcome_at!, who: person(p.name, s), text: GROUP_TEXT[type], sub: type === 'sankaku' && s ? `営業 ${s}` : '' });
    }
  });
  (i.nyuujou?.items || []).forEach((r) => {
    if (r.jitai || r.poa || !r.date || r.date < sinceYmd || r.date > todayYmd) return;
    const nn = normName(r.nn || r.name);
    raw.push({ id: `db:${nn}:${r.date}`, type: 'debut', at: `${r.date}T09:00:00+09:00`, who: person(r.name, salesOf(nn)), text: GROUP_TEXT.debut, sub: r.tantou ? `採用担当 ${r.tantou}` : '' });
  });
  (i.interviews || []).forEach((v) => {
    const m = String(v.date || '').match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (!m || !v.name) return;
    const at = `${m[1]}T${(m[2] || '9').padStart(2, '0')}:${m[3] || '00'}:00+09:00`;
    // 今日の面談は時刻前でも出す（ストーリーの「今日面談」）。それ以外は過ぎたものだけ
    if (!(m[1] === todayYmd || inWin(at)) || Date.parse(at) < since) return;
    const nn = normName(v.name);
    raw.push({ id: `iv:${v.id || nn + at}`, type: 'mendan', at, who: person(v.name, v.salesRep || salesOf(nn)), text: '現場面談' + (v.status ? `（${v.status}）` : ''), sub: v.salesRep ? `営業 ${v.salesRep}` : '' });
  });
  (i.status || []).forEach((s) => {
    const d = ymdOf(s.taisha_bi);
    if (!s.taisha || !d || d < sinceYmd || d > todayYmd) return;
    const nn = normName(s.normalized_name);
    const name = i.mikeiken?.get(nn); if (!name) return;   // 表示名はプロパーリストから（未経験だけ）
    raw.push({ id: `ts:${nn}:${d}`, type: 'taisha', at: `${d}T18:00:00+09:00`, who: person(name, salesOf(nn)), text: GROUP_TEXT.taisha, sub: '' });
  });

  // 未経験（プロパーリストにいる人）だけ。読めなかったら出さない（関係ない人を出さない側に倒す）
  if (!i.mikeiken) { warnings.push('プロパーリストが読めなかったので、未経験の人を確かめられず何も出していません'); return { posts: [], warnings }; }
  let kept = raw.filter((r) => i.mikeiken!.has(normName(r.who.name)));
  // 営業は自分が担当営業の人だけ
  if (i.scope === 'mine') {
    if (!i.meNorm) warnings.push('ログインした人の名前が分からないので、担当の人を絞れず何も出していません');
    kept = kept.filter((r) => isMine(r.who.sales || '', i.meNorm));
  }
  const used = new Map<string, number>();
  kept.forEach((r) => { const c = used.get(r.id) || 0; used.set(r.id, c + 1); if (c) r.id += '#' + c; });
  return { posts: toPosts(kept), warnings };
}
