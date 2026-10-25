// 面談管理（今の /interviews.html）の決まりごと。画面（app/(app)/eigyo/mendan）と保存の口（app/api/live/mendan）で同じものを使う。
//   ・読む：今の /api/proxy?action=getInterviews（Google カレンダーの予定＋ステータスの表を読むだけ・書かない）
//   ・面談前／結果待ち の自動の振り分けは「見せ方だけ」。ステータスが空の行を書き換えない（今と同じ）
//   ・2026/07/09 より前の面談は扱わない（今と同じ）
//   ・時刻は日本時間で読む（今の面談日は 'YYYY-MM-DD HH:MM'＝日本時間の壁時計）

export type IvRec = {
  id: string; status: string; salesRep: string; name: string; trainer: string; caseInfo: string;
  rounds: string; category: string; date: string; location: string; memo: string;
};

/** ステータスの選択肢（今の STATUSES と同じ順）。'' は未設定 */
export const IV_STATUSES = ['結果待ち', '1回目通過', '2回目通過', '成約', '見送り', '辞退'] as const;
/** 進行中の列（カンバン）。左端の「面談前」は自動の列 */
export const IV_PROGRESS = ['結果待ち', '1回目通過', '2回目通過'] as const;
/** 着地ゾーン（終わり） */
export const IV_CLOSED = ['成約', '見送り', '辞退'] as const;
export const IV_PRE = '面談前';
export const IV_WAIT = '結果待ち';
export const IV_LOCATIONS = ['対面', 'オンライン'] as const;
/** 決定率の分母（結果が出たもの）。今の IV_DECIDED と同じ */
const IV_DECIDED = new Set(['成約', '見送り', '辞退', '社内他決', '内定辞退']);
const CLOSED_SET = new Set<string>(IV_CLOSED);

const CUTOFF = Date.parse('2026-07-09T00:00:00+09:00');

/** 面談日 → 日本時間の時刻（ms）。日付だけならその日の 0 時。読めなければ null */
export function ivDayMs(s: string): number | null {
  const t = String(s || '').trim();
  const full = t.match(/(20\d{2})[/\-年]\s*(\d{1,2})[/\-月]\s*(\d{1,2})/);
  if (!full) return null;
  const ms = Date.parse(`${full[1]}-${full[2].padStart(2, '0')}-${full[3].padStart(2, '0')}T00:00:00+09:00`);
  return Number.isFinite(ms) ? ms : null;
}

/** 並べる鍵＝日時。時刻が無い行はその日の 24:00。日付が無ければ最後 */
export function ivSortKey(r: Pick<IvRec, 'date'>): number {
  const d = ivDayMs(r.date);
  if (d == null) return Infinity;
  const m = String(r.date || '').match(/(\d{1,2}):(\d{2})/);
  const mins = m ? Number(m[1]) * 60 + Number(m[2]) : 24 * 60;
  return d + mins * 60_000;
}

/** 'YYYY-MM'（日本時間）。日時未定は '__none__' */
export function ivMonth(r: Pick<IvRec, 'date'>): string {
  const m = String(r.date || '').match(/(20\d{2})[/\-年]\s*(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : '__none__';
}
export const jstMonthNow = (now = Date.now()) => new Date(now + 9 * 3600_000).toISOString().slice(0, 7);

export const ivStat = (r: Pick<IvRec, 'status'>) => String(r.status || '').trim();
/** その行が出る列。ステータスが入っていればそれ、空なら日時で 面談前／結果待ち */
export function ivCol(r: Pick<IvRec, 'status' | 'date'>, now = Date.now()): string {
  const st = ivStat(r);
  if (st) return st;
  return ivSortKey(r) > now ? IV_PRE : IV_WAIT;
}
/** 自動で結果待ちに置いた（面談日時を過ぎたのに結果が未入力） */
export const ivAuto = (r: Pick<IvRec, 'status' | 'date'>, now = Date.now()) => !ivStat(r) && ivCol(r, now) === IV_WAIT;

/** 今の画面が扱う行だけ（2026/07/09 以降・日付あり）を日時順に */
export function ivUsable(rows: readonly IvRec[]): IvRec[] {
  return rows
    .filter((r) => { const d = ivDayMs(r.date); return d != null && d >= CUTOFF; })
    .sort((a, b) => ivSortKey(a) - ivSortKey(b) || String(a.name).localeCompare(String(b.name), 'ja'));
}

/** 月の数字（今の renderKpi と同じ定義） */
export function ivKpi(rows: readonly IvRec[], now = Date.now()) {
  let won = 0, decided = 0, needInput = 0;
  for (const r of rows) {
    const st = ivStat(r);
    if (st === '成約') won++;
    if (IV_DECIDED.has(st)) decided++;
    if (ivAuto(r, now)) needInput++;
  }
  return { total: rows.length, won, decided, needInput };
}

/** 並行数＝その人の「今月の進行中」の面談件数（今の computeParallelCounts と同じ）。面談を持つ人は 0 でも入れる */
export function ivParallelCounts(rows: readonly IvRec[], now = Date.now()): { name: string; count: number }[] {
  const cur = jstMonthNow(now);
  const m = new Map<string, number>();
  for (const r of rows) {
    const nm = String(r.name || '').trim();
    if (!nm) continue;
    if (!m.has(nm)) m.set(nm, 0);
    if (CLOSED_SET.has(String(r.status || ''))) continue;
    if (ivMonth(r) !== cur) continue;
    m.set(nm, (m.get(nm) || 0) + 1);
  }
  return [...m].map(([name, count]) => ({ name, count }));
}

/** 面談前はあと何時間、結果待ちは何日たったか */
export function ivTimeHint(r: IvRec, now = Date.now()): { t: string; tone?: 'warn' | 'bad' } | null {
  const k = ivSortKey(r);
  if (!Number.isFinite(k)) return null;
  const col = ivCol(r, now);
  if (col === IV_PRE) {
    const h = Math.floor((k - now) / 3600_000);
    if (h < 0) return null;
    return { t: h < 1 ? 'まもなく' : h < 24 ? `${h}時間後` : `${Math.floor(h / 24)}日後` };
  }
  if (col === IV_WAIT) {
    const h = Math.floor((now - k) / 3600_000);
    if (h < 0) return null;
    if (h < 24) return { t: `${h}時間経過` };
    const d = Math.floor(h / 24);
    return { t: `${d}日経過`, tone: d >= 3 ? 'bad' : 'warn' };
  }
  return null;
}

/** 'YYYY-MM-DD HH:MM' → datetime-local の値 */
export const ivToLocalInput = (s: string) => {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${(m[4] ?? '10').padStart(2, '0')}:${m[5] ?? '00'}` : '';
};
/** datetime-local の値 → 表に出す 'YYYY-MM-DD HH:MM' */
export const ivFromLocalInput = (s: string) => String(s || '').replace('T', ' ');
