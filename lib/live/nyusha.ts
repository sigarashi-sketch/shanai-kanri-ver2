// 入社手続き（人事管理）＝労務の「freee送信管理」スプシの「参画決定者」タブと同じ並び・同じ列（2026-10-25 shoya
//   「労務に共有したスプシ…あれで送信した人いれば示して欲しい」「あれベースでいい」「カラムとかも」）。
//
//   スプシ（今のシステムの api/_freee_send_sheet.ts が15分ごとに書いている）の列：
//     A参画決定日／B氏名／Cよみがな／Dメールアドレス／E入社日／F入場日／G賃金（額面月給）
//     H freee送信☑／I送信日／Jメモ／K辞退・入社取消／L辞退・取消日（Kに値がある行はグレー）
//
//   ★今のシステムには、このスプシ（参画決定者タブ）の中身を返す GET が無い（あるのは cron の書き込み口だけ＝呼ばない）。
//     ver2 には Google の鍵も無い。なので本物のときは、スプシと同じ材料を返す今の GET から組み立てられる列だけ出す：
//       A 参画決定日 … /api/nyusha-progress?days=0 の decided_at（参画決定ログの最後の true・JST の日付）
//       B 氏名       … 同上（営業リストの参画決定 ON・辞退でない人）
//       C よみがな   … /api/roster?op=jimu&action=list の kana（名簿に載っている人だけ。スプシは basic_info.kana）
//       E 入社日     … /api/roster?op=nyusha&action=list（roster_nyusha.nyusha_bi＝スプシと同じ）→無ければ jimu の nyusha
//       F 入場日     … nyusha-progress の nyuujou_bi（営業リスト）→空なら jimu の nyuujou（日報の入場日で補った値）
//       G 賃金       … /api/roster?action=getEngineerRows の 額面（sales_roster.gakumen＝スプシと同じ）
//     D メール・H freee送信・I 送信日・J メモ・K 辞退/入社取消・L 日付 は今のシステムに読む口が無い → null（画面は「スプシで見る」）
//   ★対象の人はスプシに寄せる：参画決定日が 10/1(JST) 以降、または 9月に決まって入場日が 10/1 以降（10/21 に手で足した分）。
//     スプシの初回だけ freee に同名がいる人を外した分・労務が手で消した行は、ここでは区別できない。
import { normName } from './eigyo-common';
import { parseDateIso, staffIdOf } from './staff';

export const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1IDxINA1QXAU_5zLp9Ds6ktmUfbGcjPJ2sLo5mIEKLE0/edit';
export const SHEET_TAB = '参画決定者';
/** スプシの見出し（A〜L）。名前も並びもスプシと同じ */
export const SHEET_HEADER = ['参画決定日', '氏名', 'よみがな', 'メールアドレス', '入社日', '入場日', '賃金（額面月給）', 'freee送信', '送信日', 'メモ', '辞退・入社取消', '辞退・取消日'] as const;
export const SHEET_SINCE = '2026-10-01';      // cron の自動追記はこの日(JST)以降の参画決定
export const SHEET_SEPT_FROM = '2026-09-01';  // 9月に決まって10月以降に入場する人（10/21 に手で足した分）

export type ExceptKind = '' | '辞退' | '入社取消';
/** スプシの1行。null＝本物では読めない列（スプシにだけある） */
export type SheetRow = {
  id: string; personId: string;
  decidedOn: string;          // A 'YYYY-MM-DD'
  name: string;               // B
  kana: string;               // C
  email: string | null;       // D
  nyushaOn: string;           // E 'YYYY-MM-DD' / 空
  nyuujouOn: string;          // F 'YYYY-MM-DD' / 空
  nyuujouRaw: string;         //   日付に読めなかったときの元の文字
  wage: string;               // G
  sent: boolean | null;       // H
  sentOn: string | null;      // I
  memo: string | null;        // J
  except: ExceptKind | null;  // K
  exceptOn: string | null;    // L
};
export type NyushaSheetLive = { rows: SheetRow[]; warnings: string[]; generatedAt: string };

// ---- 今のシステムの GET の形（使う所だけ） ----------------------------------------
export type IkeNyushaProgressRow = { id: string; name: string; nyuujou_bi: string; decided_at: string };
export type IkeNyushaProgress = { ok?: boolean; rows: IkeNyushaProgressRow[] };
export type IkeJimuLite = { rows: { name: string; kana: string; nyusha: string; nyuujou: string }[] };
export type IkeNyushaOverlay = Record<string, { nyushaBi?: string }>;

/** ISO の時刻 → JST の日付 */
export const jstDate = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t + 9 * 3600000).toISOString().slice(0, 10) : ''; };

/** スプシに載る人か（参画決定日と入場日で決める） */
export function inSheetScope(decidedOn: string, nyuujouOn: string): boolean {
  if (!decidedOn) return false;
  if (decidedOn >= SHEET_SINCE) return true;
  return decidedOn >= SHEET_SEPT_FROM && !!nyuujouOn && nyuujouOn >= SHEET_SINCE;
}

/** 今の GET の返りから、スプシと同じ列の行を組み立てる（純関数）。gakumen は 正規化した氏名 → 額面 */
export function buildSheetRows(x: {
  progress: IkeNyushaProgress; gakumen: Map<string, string>; nyusha: IkeNyushaOverlay | null; jimu: IkeJimuLite | null;
}): SheetRow[] {
  const jimu = new Map<string, IkeJimuLite['rows'][number]>();
  for (const r of x.jimu?.rows || []) { const k = normName(r.name); if (k && !jimu.has(k)) jimu.set(k, r); }
  const seen = new Set<string>();
  const out: SheetRow[] = [];
  for (const r of x.progress.rows || []) {
    const k = normName(r.name);
    if (!k || seen.has(k)) continue;
    const j = jimu.get(k);
    const decidedOn = jstDate(r.decided_at);
    const nyuujouRaw = String(r.nyuujou_bi || '').trim() || String(j?.nyuujou || '').trim();
    const nyuujouOn = parseDateIso(nyuujouRaw);
    if (!inSheetScope(decidedOn, nyuujouOn)) continue;
    seen.add(k);
    out.push({
      id: r.id || k, personId: staffIdOf(r.name), decidedOn, name: r.name, kana: j?.kana || '', email: null,
      nyushaOn: parseDateIso(x.nyusha?.[k]?.nyushaBi || j?.nyusha || ''), nyuujouOn, nyuujouRaw,
      wage: x.gakumen.get(k) || '', sent: null, sentOn: null, memo: null, except: null, exceptOn: null,
    });
  }
  return out.sort((a, b) => a.decidedOn.localeCompare(b.decidedOn));
}

// ---- 画面で使う道具 ----------------------------------------------------------------
export type SheetFilter = 'すべて' | '未送信' | '送信済み' | '辞退・取消';
export const rowKind = (r: SheetRow): Exclude<SheetFilter, 'すべて'> | '不明' =>
  r.except ? '辞退・取消' : r.sent == null ? '不明' : r.sent ? '送信済み' : '未送信';

/** 未送信 → 送信済み → 辞退・取消 の順。同じ中は参画決定日の古い順（＝スプシの並び） */
export function sortSheetRows(rows: readonly SheetRow[]): SheetRow[] {
  const rank = (r: SheetRow) => ({ 未送信: 0, 不明: 0, 送信済み: 1, '辞退・取消': 2 })[rowKind(r)];
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.decidedOn.localeCompare(b.decidedOn) || a.name.localeCompare(b.name, 'ja'));
}

const WD = '日月火水木金土';
/** スプシと同じ書き方 'YYYY/MM/DD(曜)' */
export function fmtSheetDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  return `${iso.replace(/-/g, '/')}(${WD[d.getUTCDay()]})`;
}
