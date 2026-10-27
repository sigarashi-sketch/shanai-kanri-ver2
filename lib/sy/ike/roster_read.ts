// ★いけいけどんどん legacy/api/_roster_read.ts の写し（2026-09-30・いけどん側 4908e7b 時点）。
//   いけどん本番DBの名簿を採用版から直接読むため。いけどん側を直したら、ここも写し直すこと。
// 従業員名簿(getRosterData)の DB 源泉版。先頭 _ でVercel関数ルーティング除外。
//   ★機微方針(利用者確定 2026-07-30 shoya・2026-07-24の方針を更新):
//     - **従業員名簿では単価を表示する**（roster_compensation の tanka/精算幅を返す）。
//       これは社内管理画面(roster.html)専用。GAS経路が元々返していた形と互換にしてある。
//     - 要員側（LINE/LIFF・menu-*.html 等）に単価を出さない方針は**従来どおり維持**。
//       あちらは案件情報の配信経路であり、この関数を呼ばない。ここに単価が入ったからといって
//       要員向けの応答へ流用しないこと。
//     - 既往歴は DB basic_info テーブルに列自体が無い（ミラー時に除外済み）＝自動的に非返却。
//   源泉=他部署シート(稼働管理情報一覧)は「卒業」でなく「取込」: roster_entries(GAS getRosterForSync→
//     syncRoster で日次取込)を読む。取込GASは恒久残置。ここは読み取りのみ。
import type { SupabaseClient } from '@supabase/supabase-js';
import { normName } from '../name';
import { parseStations, extractStationsFromSummary } from './station';

// いけどん _shoudaku_analytics.ts ageFromBirth の写し
function ageFromBirth(birth: unknown, now: Date): number | null {
  if (!birth) return null;
  const m = String(birth).match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let age = now.getUTCFullYear() - y;
  const mm = now.getUTCMonth() + 1, dd = now.getUTCDate();
  if (mm < mo || (mm === mo && dd < d)) age--;
  if (age < 0 || age > 120) return null;
  return age;
}

export interface RosterEntryRow {
  id?: string | null;   // roster_compensation との突合キー
  year_month: string; name: string; normalized_name?: string | null; kana?: string | null;
  rep?: string | null; joi?: string | null; shozoku?: string | null; keiyaku?: string | null;
  // 稼働管理情報一覧の「所属会社」(L列・0098)。shozoku は部分一致で拾う H列「契約時の所属会社」なので別物。
  //   詳細は _kadohyo.ts 冒頭のコメント。0098 未適用のDBでは列が無い（select は下でフォールバックする）。
  shozoku_kadou?: string | null;
  joukyou?: string | null; houkoku?: string | null; start_date?: string | null; end_date?: string | null;
  site_eki_raw?: string | null; site_eki?: string | null; case_summary?: string | null;
}
export interface GroupLite { name: string; tags: string[] }
export interface BasicInfo { [k: string]: string }

// 単価/精算幅（roster_compensation）。tanka は人月単価の数値(円)で入っている
//   （GAS getRosterForSync が _normalizeTanka で数値化して同期している）。
export interface CompRow {
  tanka?: number | string | null; seisan_low?: number | string | null; seisan_high?: number | string | null;
  // 源泉シート「単価」欄の生値（0096）。方式(時給/日給/人月)はここからしか判定できない。
  //   0096 未適用のDB／次の同期がまだの行では空。空を人月とみなさないこと（画面は「推定」扱いにする）。
  tanka_raw?: string | null;
}

// buildRosterRows の追加材料。無指定でも従来どおり動く（＝既存の呼び出し・テストを壊さない）。
export interface RosterExtras {
  compByEntryId?: Record<string, CompRow>;   // roster_entries.id → 単価/精算
  salesEkiByNorm?: Record<string, string>;   // 正規化氏名 → sales_roster.eki（basic_info.eki が空のときの代替）
  nyushaByNorm?: Record<string, NyushaValue>; // 正規化氏名 → 入社日/初回契約終了日の自動導出（buildNyushaMap）
  lineLinkByNorm?: Record<string, LineLinkValue>; // 正規化氏名 → 手動で紐付けたLINEグループ（0072 roster_line_group）
  lineAddedByNorm?: Record<string, boolean>;      // 正規化氏名 → 公式LINEを1:1で友だち追加済み（sales_roster.line_added）
}

// LINEグループの手動紐付け（0072 roster_line_group）。書き込み側は api/_op_roster_line_group.ts。
export interface LineLinkValue { groupId: string; groupName: string; tags: string[] }
export interface LineLinkRow { normalized_name?: string | null; line_group_id?: string | null }
export interface LineGroupRow { line_group_id?: string | null; legacy_key?: string | null; name?: string | null; tags?: string[] | null }

// 紐付け行 + 台帳 → 正規化氏名で引ける形。純関数=テスト対象。
//   台帳から消えたグループIDの紐付けは落とす（存在しないグループで「LINEあり」にしない）。
export function buildLineLinkMap(
  rows: LineLinkRow[] | null | undefined, groups: LineGroupRow[] | null | undefined,
): Record<string, LineLinkValue> {
  const byId: Record<string, LineGroupRow> = {};
  for (const g of groups || []) {
    const id = String(g?.line_group_id || '').trim();
    if (id) byId[id] = g;
  }
  const out: Record<string, LineLinkValue> = {};
  for (const r of rows || []) {
    const nn = String(r?.normalized_name || '').trim();
    const gid = String(r?.line_group_id || '').trim();
    if (!nn || !gid) continue;
    const g = byId[gid];
    if (!g) continue;
    out[nn] = { groupId: gid, groupName: String(g.name || ''), tags: Array.isArray(g.tags) ? g.tags : [] };
  }
  return out;
}

// 人月単価の表示文字列。GAS(_normalizeTanka の commaYen)と同形の "570,000円" に揃える
//   （roster.html の _fmtTanka は「円」を含む文字列をそのまま出す＝GAS経路と見た目が一致する）。
export function fmtTankaYen(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'string' && !/^[\d.,\s]+$/.test(v)) return v.trim();   // 変換不能な生表記はそのまま
  const n = Number(String(v).replace(/[^\d.]/g, ''));
  if (!isFinite(n) || n <= 0) return '';
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '円';
}

// 精算幅（h）。GAS経路はシートの生値(文字列)を返していたので、数値は文字列化して同形にする。
export function fmtSeisan(v: unknown): string {
  if (v == null || v === '') return '';
  return String(v).trim();
}

// ---- 入社日/初回契約終了日（2026-08-03 定義 → 2026-08-25 shoya が源泉を変更） -----------
//   入社日 = うちの会社案件に最初に参画した日。
//     優先順位: 手入力(roster_nyusha/0046・api/_op_roster_nyusha.ts)
//               > **稼働管理情報一覧でその人の最古の開始日**
//               > 営業リストの参画日(sales_roster.sankaku_bi)  ← 仮行（一覧に行が無い人）の保険
//               > ブランク。
//   初回契約終了日 = その最古の行の終了日（手入力があればそちら）。
//
//   ★なぜ源泉を変えたか（2026-08-25 実測）: 旧定義の材料が2つとも実データでは空だった。
//     ・営業リストの参画日は日付が**1件も無い**（1,021行の中身は '1'502 / 空260 / '0'257 / '2'1 / '9月'1）。
//     ・契約区分「未経験新規」の行が**全1,914行中0行**（準委任1,476・派遣291・支援費132・出向6・転籍5）。
//     結果、自動導出で入社日が入る人は0人・手入力11名だけだった。最古の開始日なら当月名簿237名の
//     **237名(100%)** に入る。
//   ★限界: roster_entries は取込済みの月しか無い（2026-07/08の2か月）。この2か月の間に現場が
//     変わった人（実測10名）は「いまの現場の開始日」＝本当の入社日より後になる。だから出所を
//     画面のtitleに必ず出し、手入力で上書きできるようにしてある（手入力が最優先）。
//   ★日付として読めない値は無理に解釈せず**ブランク**（利用者確定: 不明は一旦ブランク）。
//   ★手入力オーバーレイは画面(roster.html)側で最優先に重なる。ここは自動導出だけを返す。

export interface NyushaValue {
  nyusha: string;                                  // 'YYYY-MM-DD' or ''
  // 出所（画面のtitleに出す）。'roster'=稼働管理情報一覧の最古の開始日 / 'sankaku_bi'=営業リストの参画日
  nyushaFrom: 'roster' | 'sankaku_bi' | '';
  shokaiEnd: string;                               // 'YYYY-MM-DD' or ''
  shokaiEndFrom: 'roster' | '';
}

// 稼働管理情報一覧の状況欄が「その現場が終わった」と言っているか（名簿の状態判定・稼働人数で共用）。
//   「8月末」だけの行は拾わない（終了なのか更新待ちなのか読めないため）。
export function hasEndWording(joukyou: unknown): boolean {
  return /終了|退職|退社/.test(String(joukyou == null ? '' : joukyou));
}

// 退場日が「いま効いている」か（名簿の状態判定・稼働人数で共用。2026-09-29 shoya）。
//   ・退場日が未来 → まだ現場にいる（false）
//   ・退場日より後に入場した記録がある（再成約して別現場に入った／入る）→ 退場は過去の話（false）
//   ・読めない記入は従来どおり効かせる（true）
//   entryDates: 開始日・入場日など（どれか1つでも退場日より後なら false）。today 未指定なら未来判定はしない。
export function taijouEffective(taijou: unknown, today: string, entryDates: unknown[]): boolean {
  const raw = String(taijou == null ? '' : taijou).trim();
  if (!raw) return false;
  const iso = parseDateIso(raw);
  if (!iso) return true;
  if (today && iso > today) return false;
  for (const d of entryDates) { const e = parseDateIso(d); if (e && e > iso) return false; }
  return true;
}

// 何でも来る日付表記を ISO(YYYY-MM-DD) へ。読めなければ ''（＝ブランク方針）。
//   対応: 2026/4/1・2026-04-01・2026年4月1日・2026.4.1・Excelシリアル値(例 46000)。
//   sankaku_bi はシート由来の text 列なので、シリアル値・自由記入が混ざりうる。
export function parseDateIso(v: unknown): string {
  const raw = String(v == null ? '' : v).trim();
  if (!raw) return '';
  if (/^\d{5}$/.test(raw)) {                       // Excelシリアル値（1899-12-30起点）
    const n = Number(raw);
    if (n < 20000 || n > 80000) return '';         // 1954〜2119年の範囲外は日付とみなさない
    return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
  }
  const m = raw.match(/^(\d{4})[/\-.年](\d{1,2})[/\-.月](\d{1,2})日?$/);
  if (!m) return '';
  const mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return m[1] + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
}

// 契約区分が「未経験新規」か。空白を除いた包含判定（「未経験（新規）」等の表記ゆれも拾う）。
export function isMikeikenKubun(keiyaku: unknown): boolean {
  return String(keiyaku == null ? '' : keiyaku).replace(/[\s　]+/g, '').indexOf('未経験') !== -1;
}

// 全月の履歴＋営業リストから、人ごとの入社日/初回契約終了日を導出する。純関数=テスト対象。
//   entries は roster_entries の**全月**。year_month('YYYY年MM月')の昇順で最初に現れた
//   未経験新規の行を「初回契約」とみなす（更新後の月は開始日が更改後に変わりうるため必ず最古を取る）。
export function buildNyushaMap(entries: RosterEntryRow[], sales: SalesLiteRow[]): Record<string, NyushaValue> {
  // 人ごとの「最古の開始日の行」。契約区分は見ない（「未経験新規」という区分は実データに無い）。
  //   ★年月タブ(year_month)の古さではなく**開始日そのもの**で最古を選ぶ。継続案件の行は更改しても
  //     開始日が当初のままなので、7月タブより8月タブの方が古い開始日を持つことがある。
  const firstRow: Record<string, { row: RosterEntryRow; start: string }> = {};
  for (const e of entries || []) {
    const nn = String(e.normalized_name || '').trim() || normName(String(e.name || ''));
    if (!nn) continue;
    const d = parseDateIso(e.start_date);
    if (!d) continue;                              // 読めない開始日は無かったことにする（ブランク方針）
    const cur = firstRow[nn];
    if (!cur || d < cur.start) firstRow[nn] = { row: e, start: d };
  }
  const out: Record<string, NyushaValue> = {};
  const ensure = (nn: string) => (out[nn] = out[nn] || { nyusha: '', nyushaFrom: '', shokaiEnd: '', shokaiEndFrom: '' });
  // 第一ソース: 稼働管理情報一覧の最古の開始日。初回契約終了日もその行から取る。
  for (const nn of Object.keys(firstRow)) {
    const f = firstRow[nn];
    const v = ensure(nn);
    v.nyusha = f.start; v.nyushaFrom = 'roster';
    const end = parseDateIso(f.row.end_date);
    if (end) { v.shokaiEnd = end; v.shokaiEndFrom = 'roster'; }
  }
  // 第二ソース: 営業リストの参画日。一覧にまだ行が無い人（仮行）の保険。
  //   ※2026-08-25 時点でこの列に日付は1件も入っていない＝実質ブランク。列が直れば自動で効く。
  for (const s of sales || []) {
    const nn = String(s.normalized_name || '').trim() || normName(String(s.name || ''));
    if (!nn) continue;
    const d = parseDateIso(s.sankaku_bi);
    if (!d) continue;
    const v = ensure(nn);
    if (!v.nyusha) { v.nyusha = d; v.nyushaFrom = 'sankaku_bi'; }   // 一覧の値がある人は上書きしない
  }
  return out;
}

export interface RosterOutRow {
  name: string; kana: string; rep: string; joi: string; shozoku: string; keiyaku: string;
  // shozoku=「契約時の所属会社」(H列)／shozokuKadou=「所属会社」(L列・いま所属している会社)。
  //   転籍しても shozoku は契約当時のまま動かないので、名簿は2列に分けて出す（2026-09-03）。
  //   0098 未適用・未同期の月では空になる（画面は shozoku へフォールバック表示）。
  shozokuKadou: string;
  joukyou: string; houkoku: string; start: string; end: string;
  hasLine: boolean; lineGroup: string; lineTags: string[]; inEngineerSheet: boolean;
  // LINEグループの出所。'name'=台帳のグループ名に氏名が含まれた（自動突合）/ 'manual'=人が紐付けた(0072) / ''=無し。
  //   LINE側でグループ名が未設定のまま作られたグループは台帳に「新しいグループ N」で入るため
  //   氏名で当たらない。その救済が manual（画面の詳細＝プルダウンで選ぶ）。
  lineFrom: string;
  lineGroupId: string;
  // 公式LINEを1:1で友だち追加しているか（sales_roster.line_added）。
  //   ★hasLine（グループ）とは別物。グループには居るが1:1では追加していない人が普通に居るため、
  //     一斉送信(グループ宛)と1:1配信の到達差はこの列で見る。判定/更新の在処は api/_link.ts の
  //     reflect/reconcile 一箇所（ここは読み取りのみ）。
  line1to1: boolean;
  info?: BasicInfo;
  // 単価/精算幅（roster_compensation・2026-07-30 shoya決定で名簿には出す）。
  //   tanka は表示用の文字列（"570,000円"）。数値が要るときは tankaValue を使う。
  tanka: string;
  tankaValue: number | null;
  // 源泉の生値（0096 roster_compensation.tanka_raw）。"時給1800" 等。
  //   ★tanka は GAS が人月へ換算した後の額なので、そこから方式は復元できない。
  //     方式を出す画面（roster.html の _tankaCell / chingin.html）は必ずこちらを見る。
  //     空文字＝生値が無い（0096 未適用 or 未同期）＝方式不明。
  tankaRaw: string;
  seisanL: string;
  seisanU: string;
  // 現場情報（0039）。一覧には出さず、詳細（クリック）でだけ見せる。
  siteEki: string;        // 正規化後の表示（複数駅は「・」区切り／取れなければ空）
  siteEkiRaw: string;     // シートの生値
  siteEkiList: string[];  // 駅ごとの配列（毎日現場が違う人は複数入る）
  siteEkiDaily: boolean;  // 「日によって変動」と書かれている
  siteEkiNote: string;    // 駅として解釈できなかった残り
  siteEkiFrom: string;    // 出所: 'column'=現場駅の列 / 'summary'=案件サマリーからの推定 / ''=不明
  siteEkiSnippet: string; // summary のとき、根拠として切り出した原文
  siteEkiLabel: string;   // summary のとき、一致したラベル（'最寄駅' 等）
  homeEki: string;        // 要員の最寄り駅（basic_info.eki を同じ正規化で整えたもの）
  homeEkiRaw: string;
  caseSummary: string;    // 案件サマリー（顧客名を含みうる）
  provisional: boolean;   // 仮行（稼働管理情報一覧に**一度も**載っていない。営業リスト側から名前だけ立てた行）
  // 引き継ぎ行: 当月タブに行が無いので直近の過去月の行をそのまま出している（'2026年08月' 等／通常は ''）。
  //   ★自動延長で契約報告が上がらない月があると当月タブから消える。氏名だけの仮行にすると単価・所属・
  //     案件が全部空になって名簿として使えないので、前月の行を引き継ぐ（利用者確定 2026-09-04 shoya）。
  carriedFrom?: string;
  // 入社日/初回契約終了日の自動導出（0046。手入力オーバーレイは画面側で最優先に重なる）
  nyusha: string;         // 'YYYY-MM-DD' or ''（不明はブランク）
  nyushaFrom: string;     // 'sankaku_bi'=営業リストの参画日 / 'mikeiken'=未経験新規の開始日 / ''
  shokaiEnd: string;      // 初回契約終了日 'YYYY-MM-DD' or ''
  shokaiEndFrom: string;  // 'mikeiken' / ''
}

// 名簿に載せる人の判定（= 営業リスト sales_roster に居るか）。GAS _buildRoster と同じ緩い包含突合。
//   ★稼働表(api/_kadohyo.ts listTargets)も同じ集合を対象にするため、ここを唯一の定義にして共有する。
//     片方だけ直すと「名簿に居るのに稼働表に出ない人」が生まれるので、必ずこの関数を経由すること。
export function inEngineerSheet(nn: string, engineerNorms: string[]): boolean {
  if (!nn) return false;
  return engineerNorms.some((en) => en.indexOf(nn) !== -1 || nn.indexOf(en) !== -1);
}

// GAS _buildRoster と同じ突合ロジック。純関数=テスト対象。
//   単価/精算幅は extras.compByEntryId（roster_entries.id で突合）から載せる。
export function buildRosterRows(
  entries: RosterEntryRow[], groups: GroupLite[], engineerNorms: string[], basicByNorm: Record<string, BasicInfo>,
  extras: RosterExtras = {},
): RosterOutRow[] {
  const compById = extras.compByEntryId || {};
  const salesEki = extras.salesEkiByNorm || {};
  const nyushaMap = extras.nyushaByNorm || {};
  const lineLink = extras.lineLinkByNorm || {};
  const lineAdded = extras.lineAddedByNorm || {};
  const normGroups = groups.map((g) => ({ n: normName(g.name), name: g.name, tags: g.tags || [] }));
  const engs = engineerNorms.filter(Boolean);
  const out: RosterOutRow[] = [];
  for (const e of entries) {
    const name = String(e.name || '').trim();
    if (!name || name === '要員名') continue;
    const nn = String(e.normalized_name || '').trim() || normName(name);
    const g = normGroups.find((x) => nn && x.n.indexOf(nn) !== -1);
    // 手動紐付け(0072)が最優先。無いときだけ従来どおりグループ名の自動突合に落ちる。
    const lk = lineLink[nn];
    const inEng = inEngineerSheet(nn, engs);
    const rec: RosterOutRow = {
      name,
      kana: String(e.kana || ''), rep: String(e.rep || ''), joi: String(e.joi || ''),
      shozoku: String(e.shozoku || ''), shozokuKadou: String(e.shozoku_kadou || ''),
      keiyaku: String(e.keiyaku || ''),
      joukyou: String(e.joukyou || ''), houkoku: String(e.houkoku || ''),
      start: String(e.start_date || ''), end: String(e.end_date || ''),
      hasLine: !!(lk || g),
      lineGroup: lk ? lk.groupName : (g ? g.name : ''),
      lineTags: lk ? (lk.tags || []) : (g ? g.tags : []),
      lineFrom: lk ? 'manual' : (g ? 'name' : ''),
      lineGroupId: lk ? lk.groupId : '',
      line1to1: lineAdded[nn] === true,
      inEngineerSheet: inEng,
      tanka: '', tankaValue: null, tankaRaw: '', seisanL: '', seisanU: '',
      siteEki: '', siteEkiRaw: '', siteEkiList: [], siteEkiDaily: false, siteEkiNote: '',
      siteEkiFrom: '', siteEkiSnippet: '', siteEkiLabel: '',
      homeEki: '', homeEkiRaw: '',
      caseSummary: String(e.case_summary || ''),
      provisional: false,
      nyusha: '', nyushaFrom: '', shokaiEnd: '', shokaiEndFrom: '',
    };
    // 入社日/初回契約終了日（自動導出）。手入力(roster_nyusha)は画面側で上に重なる。
    const ny = nyushaMap[nn];
    if (ny) {
      rec.nyusha = ny.nyusha; rec.nyushaFrom = ny.nyushaFrom;
      rec.shokaiEnd = ny.shokaiEnd; rec.shokaiEndFrom = ny.shokaiEndFrom;
    }
    // 現場の最寄り駅: 生値から毎回パースし直す（保存済みの site_eki には依存しない）。
    //   こうしておくと _station.ts を直しただけで表示が改善し、再同期を待たなくてよい。
    const siteRaw = String(e.site_eki_raw || '');
    const sp = parseStations(siteRaw || e.site_eki || '');
    rec.siteEkiRaw = siteRaw || String(e.site_eki || '');
    rec.siteEki = sp.display;
    rec.siteEkiList = sp.stations;
    rec.siteEkiDaily = sp.daily;
    rec.siteEkiNote = sp.note;
    rec.siteEkiFrom = sp.stations.length ? 'column' : '';
    // 現場駅の列は 964名中21名(2%)しか埋まっていない。案件サマリーの本文には
    //   「場所：」「最寄駅：」の形で書かれていることが多いので、列が空のときだけ拾う
    //   （2026-07-31 実測で 21名 → 475名/49% に増える）。
    //   ★列の値が正・サマリーは推定。出所を siteEkiFrom で必ず区別し、画面にも出す。
    if (!rec.siteEkiList.length && rec.caseSummary) {
      const sx = extractStationsFromSummary(rec.caseSummary);
      if (sx.stations.length) {
        rec.siteEki = sx.display;
        rec.siteEkiList = sx.stations;
        rec.siteEkiDaily = sx.daily;
        rec.siteEkiFrom = 'summary';
        rec.siteEkiSnippet = sx.snippet;
        rec.siteEkiLabel = sx.label;
      }
    }
    // 単価/精算幅（roster_entries.id → roster_compensation）。行が無ければ空欄のまま。
    const comp = e.id ? compById[String(e.id)] : undefined;
    if (comp) {
      rec.tanka = fmtTankaYen(comp.tanka);
      const tv = Number(String(comp.tanka == null ? '' : comp.tanka).replace(/[^\d.]/g, ''));
      rec.tankaValue = isFinite(tv) && tv > 0 ? tv : null;
      rec.tankaRaw = String(comp.tanka_raw || '');
      rec.seisanL = fmtSeisan(comp.seisan_low);
      rec.seisanU = fmtSeisan(comp.seisan_high);
    }
    const info = basicByNorm[nn];
    // 要員本人の最寄り駅: basic_info.eki が正。空のときだけ営業リスト(sales_roster.eki)で補う。
    //   ★手入力オーバーレイ(0040 roster_eki)は画面側で最優先に重なる。ここはその下の段。
    const eki = (info && info.eki) || salesEki[nn] || '';
    if (info) rec.info = eki && eki !== info.eki ? { ...info, eki } : info;
    // 表示だけ同じ正規化を通す（basic_info / sales_roster の保存値は書き換えない）。
    if (eki) {
      rec.homeEkiRaw = eki;
      rec.homeEki = parseStations(eki).display || eki;
    }
    out.push(rec);
  }
  // 名簿は未経験のみ表示（＝営業用リストに載っている人）
  return out.filter((r) => r.inEngineerSheet);
}

// 仮行（provisional）の材料。sales_roster から最小限だけ引く。
export interface SalesLiteRow {
  normalized_name?: string | null; name?: string | null;
  sankaku_kettei?: unknown; kadou_chu?: unknown;
  eki?: string | null;   // basic_info.eki が空のときの最寄駅の代替源泉
  sankaku_bi?: unknown;  // AC 参画日（text・0012）。入社日の第一ソース（buildNyushaMap）
  line_added?: boolean | null;  // 公式LINEを1:1で友だち追加済み（_link.ts の reflect/reconcile が更新）
}

// 当月タブに行が無い人を、**直近の過去月の行**で埋める（引き継ぎ行）。純関数=テスト対象。
//   背景: 台帳(稼働管理情報一覧)の月タブは継続案件が毎月引き継がれる作りだが、自動延長のときに
//         契約報告が上がらず当月だけ名前が落ちることがある。実測(2026-09-04)で8月にいて9月に消えた
//         63名のうち13名は状況欄に終了/退職の記載も退社チェックも無く、4名は終了日が9/30＝契約期間内。
//   ★採るのは targetYm より**前**の月のうち最新の1行。当月と未来の月は見ない。
//   ★eligible で対象を絞る（呼び側は仮行と同じ「参画決定 or 稼働中」の集合を渡す）。
export function pickCarryOverEntries(
  all: RosterEntryRow[], targetYm: string, currentNorms: Iterable<string>, eligible: (nn: string) => boolean,
): RosterEntryRow[] {
  const have = new Set(Array.from(currentNorms).filter(Boolean));
  const best: Record<string, RosterEntryRow> = {};
  for (const e of all || []) {
    const ym = String(e.year_month || '');
    if (!ym || ym >= targetYm) continue;                     // 'YYYY年MM月' は文字列比較で時系列順
    const nn = String(e.normalized_name || '').trim() || normName(String(e.name || ''));
    if (!nn || have.has(nn) || !eligible(nn)) continue;
    const cur = best[nn];
    if (!cur || String(cur.year_month || '') < ym) best[nn] = e;
  }
  return Object.keys(best).map((nn) => best[nn]);
}

// 稼働管理情報一覧(roster_entries)に**どの月にも載っていない**人を、営業リストから「仮行」として起こす。
//   背景: 名簿の正データは他部署シートで、成約直後の人は反映が数日〜1ヶ月遅れる。その間その人は
//         名簿から完全に消えてしまい、採用担当/対応歴/退社などを付ける先が無かった。
//   ★対象は「参画決定 or 稼働中 が立っている人」だけに絞る（利用者確定 2026-07-31）。
//     無条件に出すと過去の退職者・ぽあ・辞退まで並ぶ（実測 639名）。この条件なら現場に入っている
//     はずなのに一覧に無い人＝あとでシート側に補填されるはずの人だけが出る（実測 60名）。
//   氏名以外は空欄。画面は provisional:true をバッジ表示に使う。
export function buildProvisionalRows(
  sales: SalesLiteRow[], entryNorms: string[], groups: GroupLite[], basicByNorm: Record<string, BasicInfo>,
  nyushaByNorm: Record<string, NyushaValue> = {},
  lineLinkByNorm: Record<string, LineLinkValue> = {},
): RosterOutRow[] {
  const truthy = (v: unknown) => v === true || v === 1 || /^(true|1|yes|✓|checked)$/i.test(String(v == null ? '' : v).trim());
  const have = new Set(entryNorms.filter(Boolean));
  const seen = new Set<string>();
  const normGroups = groups.map((g) => ({ n: normName(g.name), name: g.name, tags: g.tags || [] }));
  const out: RosterOutRow[] = [];
  for (const s of sales || []) {
    const name = String(s.name || '').trim();
    if (!name) continue;
    if (!truthy(s.sankaku_kettei) && !truthy(s.kadou_chu)) continue;
    const nn = String(s.normalized_name || '').trim() || normName(name);
    if (!nn || have.has(nn) || seen.has(nn)) continue;   // 一覧に居る人・同姓同名の2件目は出さない
    seen.add(nn);
    const g = normGroups.find((x) => x.n.indexOf(nn) !== -1);
    const lk = lineLinkByNorm[nn];
    const rec: RosterOutRow = {
      name,
      kana: '', rep: '', joi: '', shozoku: '', shozokuKadou: '', keiyaku: '', joukyou: '', houkoku: '', start: '', end: '',
      hasLine: !!(lk || g),
      lineGroup: lk ? lk.groupName : (g ? g.name : ''),
      lineTags: lk ? (lk.tags || []) : (g ? g.tags : []),
      lineFrom: lk ? 'manual' : (g ? 'name' : ''),
      lineGroupId: lk ? lk.groupId : '',
      // 仮行は sales_roster の行そのものが源泉なので、line_added はその行から直に取る。
      line1to1: (s as { line_added?: unknown }).line_added === true,
      inEngineerSheet: true,   // 定義上 sales_roster に居る＝未経験（名簿の表示対象）
      // 仮行は稼働管理情報一覧に行が無い＝roster_compensation も無いので単価は常に空。
      //   最寄駅も basic_info 由来のみ（営業リストからの補完はしない＝本行と区別が付くようにする）。
      tanka: '', tankaValue: null, tankaRaw: '', seisanL: '', seisanU: '',
      siteEki: '', siteEkiRaw: '', siteEkiList: [], siteEkiDaily: false, siteEkiNote: '',
      siteEkiFrom: '', siteEkiSnippet: '', siteEkiLabel: '',
      homeEki: '', homeEkiRaw: '',
      caseSummary: '',
      provisional: true,
      nyusha: '', nyushaFrom: '', shokaiEnd: '', shokaiEndFrom: '',
    };
    // 仮行にも入社日を出す（成約直後の人こそ営業リストの参画日が入っているため）。
    const ny = nyushaByNorm[nn];
    if (ny) {
      rec.nyusha = ny.nyusha; rec.nyushaFrom = ny.nyushaFrom;
      rec.shokaiEnd = ny.shokaiEnd; rec.shokaiEndFrom = ny.shokaiEndFrom;
    }
    const info = basicByNorm[nn];
    if (info) rec.info = info;
    if (info && info.eki) {
      rec.homeEkiRaw = info.eki;
      rec.homeEki = parseStations(info.eki).display || info.eki;
    }
    out.push(rec);
  }
  return out;
}

// 名簿が basic_info から読む列。★機微列（電話/メール/ふりがな/番地までの住所/学歴/緊急連絡先）は書かない。
//   2026-09-14 から basic_info に機微列の実データが入る（フォーム送信時の直接書き込み）。
//   それらを返すのは /api/basic-info?action=detail だけ。select('*') にしない（tests/basicInfoSensitive.test.ts）。
//   → 名簿の詳細の 携帯/メール/緊急連絡先 は空のまま（行ごと出ない）。見るのは基本情報リストの詳細。
export const ROSTER_BASIC_INFO_COLS = 'normalized_name, gender, birth, address, eki, shikaku, tokui, shift, yakin, shutcho, skillsheet, age';

// basic_info 行 → 画面が使う info 形（GAS _buildBasicInfoMap と同形・既往歴は元々無い）。
//   ★年齢: DBの age 列は誰も書いておらず全行空（2026-07-30 実測）。列を埋めに行くのではなく
//     birth から表示時点で算出する（誕生日を跨いだら自動で1つ増える＝保存値より正確）。
//     birth が空・不正形式・和暦のときは ageFromBirth が null を返す＝空欄のまま（エラーにしない）。
export function toBasicInfo(r: Record<string, unknown>, nowMs = Date.now()): BasicInfo {
  const s = (k: string) => String((r[k] as string) || '').trim();
  const emergency = [s('em_name'), s('em_relation'), s('em_phone'), s('em_address')].filter(Boolean).join(' / ');
  // ageFromBirth は UTC の年月日で比較するので、JST の「今日」を渡す（誕生日当日のズレ防止）。
  const age = ageFromBirth(s('birth'), new Date(nowMs + 9 * 3600000));
  return {
    gender: s('gender'), birth: s('birth'), address: s('address'), eki: s('eki'),
    phone: s('phone'), email: s('email'), shikaku: s('shikaku'), tokui: s('tokui'),
    shift: s('shift'), yakin: s('yakin'), shutcho: s('shutcho'), skillsheet: s('skillsheet'),
    age: s('age') || (age == null ? '' : String(age)), emergency,
  };
}

// 現在(JST)の年月を "YYYY年MM月" で返す（roster_entries.year_month=シートタブ名と同形式）。
export function currentYearMonth(nowMs: number): string {
  const jst = new Date(nowMs + 9 * 3600000);
  return jst.getUTCFullYear() + '年' + ('0' + (jst.getUTCMonth() + 1)).slice(-2) + '月';
}

// 全体の組み立て（I/O）。getRosterData と同形の応答を返す。失敗時は呼び側が GAS フォールバック。
export async function getRosterDataFromDb(db: SupabaseClient, gid: string | undefined, nowMs: number) {
  // roster_entries を全件ページングで取得（年月×~900）。
  const all: RosterEntryRow[] = [];
  // 0098(shozoku_kadou) 未適用のDBでは列が無くて select ごと落ちる。名簿を丸ごと落とすほどの列では
  //   ないので、その1列だけ外して引き直す（_kadohyo.ts listTargets と同じ流儀）。
  const BASE_COLS = 'id, year_month, name, normalized_name, kana, rep, joi, shozoku, keiyaku, joukyou, houkoku, start_date, end_date, site_eki_raw, site_eki, case_summary';
  let cols = BASE_COLS + ', shozoku_kadou';
  for (let from = 0; from <= 200000; from += 1000) {
    let { data, error } = await db.from('roster_entries').select(cols).range(from, from + 999);
    if (error && cols !== BASE_COLS && /shozoku_kadou/.test(error.message)) {
      cols = BASE_COLS;
      ({ data, error } = await db.from('roster_entries').select(cols).range(from, from + 999));
    }
    if (error) throw new Error('roster_entries select: ' + error.message);
    const batch = (data || []) as unknown as RosterEntryRow[];
    all.push(...batch);
    if (batch.length < 1000) break;
  }
  if (!all.length) return { success: false, error: '名簿データがありません', months: [], rows: [] };

  // 年月リスト（各月の件数）。gid/name とも year_month 文字列で統一（round-trip整合）。
  const countByYm = new Map<string, number>();
  for (const e of all) countByYm.set(e.year_month, (countByYm.get(e.year_month) || 0) + 1);
  const months = Array.from(countByYm.entries())
    .map(([ym, n]) => ({ name: ym, gid: ym, rows: n + 1 }))  // roster.html は (rows-1) を件数表示
    .sort((a, b) => (a.name < b.name ? -1 : 1));

  // 対象月: gid指定 > 当月 > 最新
  const cur = currentYearMonth(nowMs);
  let targetYm = '';
  if (gid && countByYm.has(gid)) targetYm = gid;
  else if (countByYm.has(cur)) targetYm = cur;
  else targetYm = months[months.length - 1].name;

  const entries = all.filter((e) => e.year_month === targetYm);

  // 突合材料: line_groups / sales_roster / basic_info
  //   ★sales_roster はページングで全件取る。無ページングだと Supabase 既定の1000行で黙って切れ、
  //     切れた分がまるごと名簿から消える（2026-07-31 時点で840行＝上限の84%まで来ていた）。
  //   ★basic_info / roster_compensation も同様にページングで取る（無ページングだと既定の1000行で
  //     黙って切れる。basic_info は 628行/2026-07-31 で、切れ始めるのは時間の問題だった）。
  const salesRows: SalesLiteRow[] = [];
  const bData: Array<Record<string, unknown>> = [];
  const compRows: Array<{ roster_entry_id: string } & CompRow> = [];
  const [{ data: gData }, { data: linkData }] = await Promise.all([
    db.from('line_groups').select('line_group_id, name, tags'),
    // LINEグループの手動紐付け(0072)。未適用のDBでも名簿は出す（エラーは握って空扱い）。
    db.from('roster_line_group').select('normalized_name, line_group_id'),
  ]);
  for (let from = 0; from <= 100000; from += 1000) {
    const { data, error } = await db.from('sales_roster')
      .select('normalized_name, name, sankaku_kettei, kadou_chu, eki, sankaku_bi, line_added').range(from, from + 999);
    if (error) throw new Error('sales_roster select: ' + error.message);
    const batch = (data || []) as unknown as SalesLiteRow[];
    salesRows.push(...batch);
    if (batch.length < 1000) break;
  }
  for (let from = 0; from <= 100000; from += 1000) {
    const { data, error } = await db.from('basic_info').select(ROSTER_BASIC_INFO_COLS).range(from, from + 999);
    if (error) throw new Error('basic_info select: ' + error.message);
    const batch = (data || []) as Array<Record<string, unknown>>;
    bData.push(...batch);
    if (batch.length < 1000) break;
  }
  // 単価/精算幅。RLS で elevated のみ select 可＝サーバー側(service role)からのみ読める。
  //   ★tanka_raw(0096) は未適用のDBだと列が無く、select ごと 42703 で落ちる＝名簿が丸ごと出なくなる。
  //     一度でも落ちたら以降は旧 select に落として読み直す（生値が無いぶん方式が出ないだけ）。
  let compCols = 'roster_entry_id, tanka, seisan_low, seisan_high, tanka_raw';
  for (let from = 0; from <= 100000; from += 1000) {
    let { data, error } = await db.from('roster_compensation').select(compCols).range(from, from + 999);
    if (error && compCols.includes('tanka_raw')) {
      compCols = 'roster_entry_id, tanka, seisan_low, seisan_high';
      ({ data, error } = await db.from('roster_compensation').select(compCols).range(from, from + 999));
    }
    if (error) throw new Error('roster_compensation select: ' + error.message);
    const batch = (data || []) as unknown as Array<{ roster_entry_id: string } & CompRow>;
    compRows.push(...batch);
    if (batch.length < 1000) break;
  }
  const groupRows = (gData || []) as Array<{ line_group_id?: string; name: string; tags: string[] }>;
  const groups = groupRows.map((g) => ({ name: g.name || '', tags: g.tags || [] }));
  const lineLinkByNorm = buildLineLinkMap(linkData as Array<{ normalized_name?: string | null; line_group_id?: string | null }>, groupRows);
  const engineerNorms = salesRows
    .map((r) => String(r.normalized_name || '').trim() || normName(r.name)).filter(Boolean);
  const basicByNorm: Record<string, BasicInfo> = {};
  for (const r of bData) {
    const nn = String((r.normalized_name as string) || '').trim();
    if (nn) basicByNorm[nn] = toBasicInfo(r, nowMs);
  }
  const compByEntryId: Record<string, CompRow> = {};
  for (const c of compRows) if (c.roster_entry_id) compByEntryId[String(c.roster_entry_id)] = c;
  // basic_info.eki は誰も書いていない（全行空）ため、営業リスト側の駅を代替源泉にする。
  const salesEkiByNorm: Record<string, string> = {};
  for (const s of salesRows) {
    const nn = String(s.normalized_name || '').trim() || normName(s.name);
    const v = String((s as { eki?: unknown }).eki || '').trim();
    if (nn && v && !salesEkiByNorm[nn]) salesEkiByNorm[nn] = v;   // 同姓同名は先勝ち（既存の突合と同じ）
  }

  // 公式LINEの1:1追加（sales_roster.line_added）。同姓同名は「どれか1行でも true なら true」。
  //   ★_link.ts の reflect は同姓同名2件ヒットだと付けない仕様なので、ここで甘く拾っても
  //     「本人でない人に◯が付く」ことは起きない（付いている行がある＝一意に確定した人）。
  const lineAddedByNorm: Record<string, boolean> = {};
  for (const s of salesRows) {
    const nn = String(s.normalized_name || '').trim() || normName(s.name);
    if (nn && s.line_added === true) lineAddedByNorm[nn] = true;
  }

  // 入社日/初回契約終了日の自動導出。全月の履歴(all)＋営業リストの参画日から人ごとに引く。
  const nyushaByNorm = buildNyushaMap(all, salesRows);

  const rows = buildRosterRows(entries, groups, engineerNorms, basicByNorm, { compByEntryId, salesEkiByNorm, nyushaByNorm, lineLinkByNorm, lineAddedByNorm });

  // 引き継ぎ行・仮行は「最新月を見ているとき」だけ足す。過去月を遡って見ているときに、まだ存在しない人が
  // 混ざると月次の実績が読めなくなるため。
  const isLatestMonth = targetYm === months[months.length - 1].name;
  const curNorms = entries.map((e) => String(e.normalized_name || '').trim() || normName(e.name));
  const truthy = (v: unknown) => v === true || v === 1 || /^(true|1|yes|✓|checked)$/i.test(String(v == null ? '' : v).trim());
  // 引き継ぎ行・仮行の対象（＝名簿に出す人）。従来の仮行と同じ「参画決定 or 稼働中」の集合。
  const gate = new Set<string>();
  for (const s of salesRows) {
    if (!truthy(s.sankaku_kettei) && !truthy(s.kadou_chu)) continue;
    const nn = String(s.normalized_name || '').trim() || normName(String(s.name || ''));
    if (nn) gate.add(nn);
  }
  // ① 当月タブに無いが過去月には行がある人 → 直近月の行を引き継ぐ（単価・所属・案件もそのまま出る）
  const carriedEntries = isLatestMonth ? pickCarryOverEntries(all, targetYm, curNorms, (nn) => gate.has(nn)) : [];
  const carriedYmByName: Record<string, string> = {};
  for (const e of carriedEntries) carriedYmByName[String(e.name || '').trim()] = String(e.year_month || '');
  const carried = buildRosterRows(carriedEntries, groups, engineerNorms, basicByNorm,
    { compByEntryId, salesEkiByNorm, nyushaByNorm, lineLinkByNorm, lineAddedByNorm })
    .map((r) => ({ ...r, carriedFrom: carriedYmByName[r.name] || '' }));
  // ② どの月にも行が無い人だけが本当の仮行（＝契約報告が一度も上がっていない人）
  const everNorms = all.map((e) => String(e.normalized_name || '').trim() || normName(e.name));
  const provisional = isLatestMonth
    ? buildProvisionalRows(salesRows, everNorms, groups, basicByNorm, nyushaByNorm, lineLinkByNorm)
    : [];

  return {
    success: true, months, selected: { name: targetYm, gid: targetYm },
    rows: rows.concat(carried, provisional),
    provisionalCount: provisional.length, carriedCount: carried.length, authorized: true,
  };
}
