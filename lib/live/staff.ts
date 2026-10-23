// 社員一覧・社員ページ（人事管理）の本物のデータ。今の社内システムの「従業員名簿」（roster.html）と同じ材料・同じ判定。
//   材料（どれも読むだけ・GET）：
//     /api/proxy?action=getRosterData            … 名簿の行（当月→無ければ最新月。引き継ぎ行・仮行込み）
//     /api/proxy?action=getRosterStatus          … 退社・待機・手で選んだ状態（roster_status）
//     /api/roster?op=extra&action=salesOverlay   … 採用担当・再アサイン・参画決定・辞退/ぽあ・入場日・更新日・ミンミカ案件確定
//     /api/roster?op=nyusha&action=list          … 入社日・退場日の手入力（roster_nyusha）
//   状態は今のシステムの deriveRosterStatus（api/_op_roster_nyusha.ts）の写し。直すときは今のシステムに合わせる。
//   ここは純粋な関数だけ（画面とサーバの両方から読む）。

// ---- 今のシステムの形（使う列だけ） ----------------------------------------------
export type IkeRosterRow = {
  name: string; kana?: string; rep?: string; joi?: string; shozoku?: string; shozokuKadou?: string; keiyaku?: string;
  joukyou?: string; start?: string; end?: string; tanka?: string; homeEki?: string; siteEki?: string;
  provisional?: boolean; carriedFrom?: string; nyusha?: string;
};
export type IkeRosterData = { success?: boolean; error?: string; rows?: IkeRosterRow[]; selected?: { name?: string } };
export type IkeRosterStatus = { normalized_name: string; taisha?: boolean; taisha_bi?: string; taiki?: boolean; status_override?: string };
export type IkeSalesOverlay = Record<string, {
  tantou?: string; saiAssign?: boolean; sankakuKettei?: boolean; jitai?: boolean; poa?: boolean;
  nyuujouBi?: string; updatedAt?: string; mnmKakutei?: boolean; mnmJoined?: string;
}>;
export type IkeNyushaOverlay = Record<string, { nyushaBi?: string; shokaiEnd?: string; taijouBi?: string }>;

// ---- この画面の形 ----------------------------------------------------------------
export type RosterStatusKey = 'kadou' | 'yotei' | 'zaiseki' | 'taiki' | 'kyushoku' | 'taisha';
// ver2 の札の言葉。在籍（現場外）は ver2 の見本に無いので今のシステムの言葉のまま
export const STATUS_LABEL: Record<RosterStatusKey, string> = {
  kadou: '稼働中', yotei: '入場予定', taiki: '待機', zaiseki: '在籍（現場外）', kyushoku: '休職・産休', taisha: '退社',
};
export const STATUS_ORDER: RosterStatusKey[] = ['kadou', 'yotei', 'taiki', 'zaiseki', 'kyushoku', 'taisha'];

export type LiveStaff = {
  id: string; name: string; kana: string; status: string; statusKey: RosterStatusKey;
  site: string; siteEki: string; contract: string; start: string; end: string;
  joined: string; nyuujou: string; taijou: string; taishaBi: string;
  station: string; price: string; sales: string; recruiter: string; company: string;
  provisional: boolean; carriedFrom: string;
};
export type LiveStaffList = { ok: true; month: string; today: string; rows: LiveStaff[]; warnings: string[] };

// ---- 部品（今のシステムと同じ規則） ---------------------------------------------------
const VARIANT: Record<string, string> = {
  '髙': '高', '﨑': '崎', '邊': '辺', '邉': '辺', '齋': '斎', '齊': '斉', '齌': '斉', '澤': '沢', '濱': '浜', '濵': '浜', '德': '徳', '廣': '広',
  '曾': '曽', '眞': '真', '靑': '青', '惠': '恵', '槇': '槙', '渕': '淵', '冨': '富', '籠': '篭', '桒': '桑', '國': '国', '萬': '万',
};
/** 今のシステムのサーバ側の氏名キー（api/_link.ts normName と同じ）。 */
export function normName(s: unknown): string {
  return String(s ?? '').replace(/[\s　]+/g, '').replace(/(さん|サン|様|君|くん)$/, '').replace(/[髙﨑邊邉齋齊齌澤濱濵德廣曾眞靑惠槇渕冨籠桒國萬]/g, (c) => VARIANT[c] || c);
}
/** 社員ページの id。今の名簿には人ごとの番号が無いので、名簿の氏名キーから作る（名前そのものを URL に出さない）。
 *  見本の id（s0412 など）とは形が違う（r で始まる）。同姓同名は今の名簿でも1人にまとまるので、ここでも同じ id になる。 */
export function staffIdOf(name: string): string {
  let h = 0x811c9dc5;
  for (const ch of normName(name)) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; }
  return 'r' + h.toString(36).padStart(7, '0');
}
export const isLiveStaffId = (id: string) => /^r[0-9a-z]{7}$/.test(id);

export function jstToday(now = Date.now()): string { return new Date(now + 9 * 3600000).toISOString().slice(0, 10); }
export function parseDateIso(v: unknown): string {
  const raw = String(v ?? '').trim();
  if (!raw) return '';
  if (/^\d{5}$/.test(raw)) { const n = Number(raw); if (n < 20000 || n > 80000) return ''; return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10); }
  const m = raw.match(/^(\d{4})[/\-.年](\d{1,2})[/\-.月](\d{1,2})日?/);
  if (!m) return '';
  const mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const daysBetween = (a: string, b: string) => {
  const p = (v: string) => { const m = String(v || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
  const x = p(a), y = p(b);
  return x == null || y == null ? null : Math.round((x - y) / 86400000);
};
const hasEndWording = (j: unknown) => /終了|退職|退社/.test(String(j ?? ''));
function taijouEffective(taijou: unknown, today: string, entries: unknown[]): boolean {
  const raw = String(taijou ?? '').trim();
  if (!raw) return false;
  const iso = parseDateIso(raw);
  if (!iso) return true;
  if (today && iso > today) return false;
  return !entries.some((d) => { const e = parseDateIso(d); return !!e && e > iso; });
}
const OVERRIDES = ['kadou', 'yotei', 'zaiseki', 'kyushoku', 'taiki'];
const YOTEI_STALE_DAYS = 30;

export type StatusInput = {
  taisha: boolean; saiAssign: boolean; taijouBi: string; hasEntry: boolean; startDate: string; endDate: string; joukyou: string;
  jitai: boolean; poa: boolean; sankakuKettei: boolean; lastUpdated: string; today: string; taiki: boolean; statusOverride: string;
  mnmKakutei: boolean; nyushaDay: string;
};
/** 今のシステムの deriveRosterStatus の写し：退社チェック ＞ 手で選んだ状態 ＞ 自動（待機チェックは 稼働中/現場外 を待機に差し替える）。 */
export function deriveStatus(x: StatusInput): RosterStatusKey {
  if (x.taisha) return 'taisha';
  const ov = OVERRIDES.includes(x.statusOverride) ? (x.statusOverride as RosterStatusKey) : null;
  if (ov && (ov !== 'taiki' || x.taiki)) return ov;
  const st = base(x);
  return x.taiki && (st === 'kadou' || st === 'zaiseki') ? 'taiki' : st;
}
function base(x: StatusInput): RosterStatusKey {
  if (x.saiAssign || taijouEffective(x.taijouBi, x.today, [x.startDate])) return 'zaiseki';
  if (!x.hasEntry) {
    if (x.jitai || x.poa) return 'zaiseki';
    const nd = parseDateIso(x.nyushaDay);
    if (x.mnmKakutei && nd && nd <= x.today) return 'kadou';
    if (!x.sankakuKettei) return 'zaiseki';
    const age = daysBetween(x.today, x.lastUpdated);
    return age != null && age <= YOTEI_STALE_DAYS ? 'yotei' : 'zaiseki';
  }
  const sd = parseDateIso(x.startDate);
  if (sd && sd > x.today) return x.jitai || x.poa ? 'zaiseki' : 'yotei';
  if (hasEndWording(x.joukyou)) { const ed = parseDateIso(x.endDate); if (!(ed && ed > x.today)) return 'zaiseki'; }
  return 'kadou';
}

/** "570,000円" → "57万"（読めなければそのまま・空は —） */
export function shortYen(s: string): string {
  const n = Number(String(s || '').replace(/[^\d.]/g, ''));
  if (!s) return '—';
  if (!isFinite(n) || n <= 0) return s;
  return n >= 10000 ? `${Math.round(n / 1000) / 10}万` : `${n.toLocaleString()}円`;
}
export const slashDate = (iso: string) => (iso ? iso.replaceAll('-', '/') : '—');

/** 4つの材料 → 社員一覧の行。info（住所・生年月日など）は受け取らない＝画面に渡さない。 */
export function buildStaffList(
  roster: IkeRosterData, statusList: IkeRosterStatus[] | null, sales: IkeSalesOverlay | null, nyusha: IkeNyushaOverlay | null, now = Date.now(),
): LiveStaffList {
  const warnings: string[] = [];
  if (!statusList) warnings.push('退社・待機の印が読めませんでした（状態は自動の判定だけです）');
  if (!sales) warnings.push('営業リストの補い（採用担当・参画決定など）が読めませんでした');
  if (!nyusha) warnings.push('入社日・退場日の手入力が読めませんでした');
  const today = jstToday(now);
  const stBy = new Map((statusList || []).map((s) => [s.normalized_name, s]));
  const rows = (roster.rows || []).map((r): LiveStaff => {
    const nn = normName(r.name);
    const s = sales?.[nn] || {}, st = stBy.get(nn), ny = nyusha?.[nn] || {};
    const key = deriveStatus({
      taisha: !!st?.taisha, saiAssign: !!s.saiAssign, taijouBi: ny.taijouBi || '', hasEntry: !r.provisional,
      startDate: r.start || '', endDate: r.end || '', joukyou: r.joukyou || '', jitai: !!s.jitai, poa: !!s.poa,
      sankakuKettei: !!s.sankakuKettei, lastUpdated: String(s.updatedAt || '').slice(0, 10), today, taiki: !!st?.taiki,
      statusOverride: st?.status_override || '', mnmKakutei: !!s.mnmKakutei, nyushaDay: s.mnmJoined || ny.nyushaBi || r.nyusha || '',
    });
    return {
      id: staffIdOf(r.name), name: r.name, kana: r.kana || '', status: STATUS_LABEL[key], statusKey: key,
      site: r.joi || '—', siteEki: r.siteEki || '', contract: r.keiyaku || '—', start: parseDateIso(r.start), end: parseDateIso(r.end),
      joined: parseDateIso(ny.nyushaBi) || parseDateIso(r.nyusha), nyuujou: parseDateIso(s.nyuujouBi) || String(s.nyuujouBi || ''),
      taijou: parseDateIso(ny.taijouBi), taishaBi: parseDateIso(st?.taisha_bi),
      station: r.homeEki || '—', price: shortYen(r.tanka || ''), sales: r.rep || '—', recruiter: s.tantou || '—',
      company: r.shozokuKadou || r.shozoku || '', provisional: !!r.provisional, carriedFrom: r.carriedFrom || '',
    };
  });
  return { ok: true, month: roster.selected?.name || '', today, rows, warnings };
}
