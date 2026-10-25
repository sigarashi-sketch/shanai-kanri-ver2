// 営業の画面（案件・案件進捗・要員リスト・待機・マップ・要員ページ）で共通に使う「今の社内システムの API の形」と、
// その形を読むための純粋な関数。値の決め方は今の社内システムに合わせる（迷ったら今の画面が正）。
//   ・ここには本物の名前・単価・顧客名を書かない（形とキー名だけ）

// ---- /api/roster?action=getEngineerRows&area=main（プロパーリスト proper.html と同じ口） ----
//   cells は columns[].idx の位置で引く（idx は詰めない）。bool 列は true/false、それ以外は文字
export type EngineerCol = { idx: number; col: string; label: string; type: 'text' | 'bool' };
export type EngineerRow = {
  row: string; name: string; active: boolean; needsReview?: boolean; kanagawa?: boolean; kansai?: boolean;
  cells: (string | boolean)[]; beforeSales?: boolean; dropout?: boolean;
  pdfUrl?: string; pdfAnonUrl?: string; xlsxUrl?: string; xlsxAnonUrl?: string;
};
export type EngineerRows = { columns: EngineerCol[]; rows: EngineerRow[]; total: number };

/** 列名 → 値（文字）。bool 列は 'true'/'' */
export function cellsOf(d: EngineerRows, r: EngineerRow): Record<string, string> {
  const o: Record<string, string> = {};
  for (const c of d.columns) { const v = r.cells[c.idx]; o[c.col] = typeof v === 'boolean' ? (v ? 'true' : '') : String(v ?? '').trim(); }
  return o;
}
export const on = (v: string | undefined) => v === 'true';

/** 営業リストの状態（今のプロパーリストの見え方に寄せる）。active＝今の isExcluded('main') でない＝営業中 */
export function properStatus(r: EngineerRow, c: Record<string, string>): '営業中' | '参画決定' | '稼働中' | '待機' | '止め・辞退' {
  if (on(c.jitai) || on(c.poa)) return '止め・辞退';
  if (on(c.kadou_chu) && !on(c.sai_assign)) return '稼働中';
  if (on(c.sankaku_kettei) && !on(c.sai_assign)) return '参画決定';
  return r.active ? '営業中' : '止め・辞退';
}

// ---- 氏名の名寄せ（今の api/_link.ts の normName と1文字も違わないように：空白を詰め、さん・様を外し、異体字を寄せる） ----
//   ★10-25 今に揃えた：齌→斉（斎ではない）・NFKC はかけない（今のシステムもかけていない＝半角カナ・全角英数はそのまま）
const VARIANT: Record<string, string> = { 髙: '高', 﨑: '崎', 邊: '辺', 邉: '辺', 齋: '斎', 齊: '斉', 齌: '斉', 澤: '沢', 濱: '浜', 濵: '浜', 德: '徳', 廣: '広', 曾: '曽', 眞: '真', 靑: '青', 惠: '恵', 槇: '槙', 渕: '淵', 冨: '富', 籠: '篭', 桒: '桑', 國: '国', 萬: '万' };
export function normName(s: unknown): string {
  return String(s ?? '').replace(/[\s　]+/g, '').replace(/(さん|サン|様|君|くん)$/, '').replace(/[髙﨑邊邉齋齊齌澤濱濵德廣曾眞靑惠槇渕冨籠桒國萬]/g, (c) => VARIANT[c] || c);
}
/** グループ名から、その中に名前が入っている人を1人に決める（今の matchRosterName と同じ＝いちばん長く一致した名前・1文字の名前は使わない） */
export function matchGroupName(groupName: string, norms: readonly string[]): string | null {
  const g = normName(groupName);
  let best: string | null = null;
  for (const n of norms) if (n && n.length >= 2 && g.includes(n) && (!best || n.length > best.length)) best = n;
  return best;
}

// ---- 送ってはいけない案件（今の api/_adult_case.ts と同じ語。警告ではなく止める） ----
const ADULT: { re: RegExp; word: string; skipLine?: RegExp }[] = [
  { re: /(?<![A-Za-zＡ-Ｚａ-ｚ])[AＡ][VＶ]\s*(?:女優|男優|メーカー|作品|監督|撮影|出演|事務所|モデル)/gi, word: 'AV' },
  { re: /セクシー\s*女優/g, word: 'セクシー女優' },
  { re: /アダルト/g, word: 'アダルト' },
  { re: /成人\s*向け|成人\s*指定|18\s*禁|１８\s*禁|(?<![A-Za-z0-9])R\s*-?\s*18(?![0-9])/gi, word: '成人向け' },
  { re: /ポルノ|わいせつ|猥褻/g, word: 'ポルノ' },
  { re: /風俗|デリヘル|ソープランド|ピンサロ|ファッションヘルス|メンズ\s*エステ/g, word: '風俗' },
  { re: /チャット\s*レディ|ライブ\s*チャット|パパ活|出会い系/g, word: 'チャットレディ等' },
  { re: /OnlyFans|オンリーファンズ|Fantia|ファンティア/gi, word: '成人向けファンサイト' },
  { re: /店舗\s*(?:運営(?![にを])|スタッフ|マネジメント|マネージャー|責任者)|(?<!副)店長|副店長|販売\s*スタッフ|ショップ\s*スタッフ/g, word: '店舗運営', skipLine: /(?<!未)経験/ },
];
const lineAt = (s: string, i: number) => { const a = s.lastIndexOf('\n', i - 1) + 1, b = s.indexOf('\n', i); return s.slice(a, b < 0 ? s.length : b); };
/** 送れない理由（無ければ null）。今の adultBlockReason と同じ判定 */
export function blockReason(text: string): string | null {
  for (const p of ADULT) {
    p.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    let first: RegExpExecArray | null = null;
    while ((m = p.re.exec(text)) !== null) { if (m[0] === '') { p.re.lastIndex++; continue; } if (p.skipLine && p.skipLine.test(lineAt(text, m.index))) continue; first = m; break; }
    if (first) return p.word === '店舗運営' ? '店舗運営系の案件のため、要員には送れません（IT の仕事ではない）' : 'アダルト案件のため、要員には送れません';
  }
  return null;
}

// ---- /api/proxy?action=getProgressData（案件進捗 progress.html と同じ口・DBから組み立て・60秒の控えあり） ----
export type ProgressCase = { kNo: string; ts: string; content: string; date: string };
export type ProgressSend = { caseNo: string; timestamp: number; message: string; groupNames: string[]; groupIds: string[] };
export type ProgressData = {
  cases?: ProgressCase[]; sends?: ProgressSend[];
  activity?: Record<string, { name: string; ts: number }>;
  slackForwarded?: Record<string, string>;   // 案件No + \x1f + 送り先ID → 'OK' | 'NG' | 'OTHER'
  caseLabels?: Record<string, string>;
};
// ---- /api/proxy?action=getProgressReplies（返信。グループ＋1:1） ----
export type ProgressReply = { ts: number; groupId: string; groupName: string; name: string; text: string };
export const FWD_SEP = String.fromCharCode(31);

/** 案件の見出し（今の画面と同じ：手で付けた名前・自動の名前 → 無ければ本文の1行目） */
export function caseTitle(d: ProgressData, c: ProgressCase): string {
  const l = d.caseLabels?.[c.kNo];
  if (l) return l;
  const first = c.content.split('\n').map((s) => s.replace(/^[【\[■◆●\s]+|[】\]\s]+$/g, '').trim()).find(Boolean) ?? '';
  return first.slice(0, 28) || c.kNo;
}
/** 案件文からラベルのある値を1つ取る（例：「最寄駅：○○」「単価：○○」） */
export function pickLabel(text: string, labels: string[]): string {
  for (const l of labels) {
    const m = new RegExp(`(?:^|\\n)\\s*[・■◆●【\\[]?\\s*${l}\\s*[】\\]]?\\s*[：:]?\\s*([^\\n]+)`).exec(text);
    if (m && m[1].trim()) return m[1].trim().slice(0, 60);
  }
  return '';
}
export const stationIn = (text: string) => { const v = pickLabel(text, ['最寄り駅', '最寄駅', '最寄', '勤務地', '場所']); const m = /([^\s、,・()（）]{1,10})駅/.exec(v || text); return m ? m[1] : v.slice(0, 12); };

export const ymdJst = (ms: number) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
export const mdhm = (ms: number) => { const d = new Date(ms + 9 * 3600e3); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
