// 交通費チェック：今の社内システムの /keihi-check.html の読み込み部分を移したもの（10-25）。
//   ・MF経費の「明細CSV」（1行＝1明細）と「承認一覧CSV」（1行＝1申請）を、ブラウザの中で読む（どこにも保存しない）
//   ・判定は今のシステムの POST /api/freee-kintai?action=keihi_check|keihi_month（api/_keihi_check.ts）だけ。ここで判定し直さない
//   ・列は見出しの名前で探す（MF の列の並びが変わっても読めるように・今の画面と同じ）

export type KcRow = { key: string; file: string; rowNo: number; seq?: number; person: string; date: string; category: string; content: string; memo: string; amount: number; title: string; status: string; applicationNo: string };
export type KcApp = { key: string; no: string; person: string; title: string; status: string; amount: number; appliedAt: string };
export type KcLevel = 'ng' | 'warn' | 'ok' | 'na' | 'skip';
export type KcVerdict = { rowNo: number; level: KcLevel; reasons: string[]; kintai: string };
export type KcMiss = { date: string; kind: 'none' | 'noOut' | 'noIn' };
export type KcCheckRes = {
  ok: boolean; name: string; error?: unknown;
  match: { status: 'none' | 'unique' | 'multiple'; candidates: { company_id: string; employee_id: string; raw_name: string; num: string }[] };
  merged: boolean; verdicts: KcVerdict[];
  summary: { total: number; ng: number; warn: number; na: number; ok: number; skip: number; ngAmount: number };
  apps: { applicationNo: string; title: string; ym: string; fetched: boolean; miss: KcMiss[]; shiftLike: boolean; sendBack: boolean; comment: string }[];
  errors: string[];
};
export type KcMonthRes = {
  ok: boolean; name: string; error?: unknown; match: KcCheckRes['match'];
  verdicts: { key: string; ym: string; level: KcLevel; reasons: string[]; perDay: number | null; sendBack?: boolean; comment?: string }[];
  errors: string[];
};

/** MF の出力は Shift_JIS。UTF-8（BOM付き）で保存し直したものも読めるよう、UTF-8 を厳密に試してから落とす */
export function decodeCsv(buf: ArrayBuffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); } catch { return new TextDecoder('shift_jis').decode(buf); }
}

/** RFC4180（"" のエスケープ・セルの中の改行） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

const toDate = (s: string) => { const m = /(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/.exec(String(s || '')); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''; };
const yenNum = (s: string) => Number(String(s).replace(/[¥,円\s]/g, '')) || 0;

/** 1ファイル → 明細（明細CSV）か申請（承認一覧CSV） */
export function readKeihiFile(name: string, text: string): { rows?: KcRow[]; apps?: KcApp[]; error?: string } {
  const rows = parseCsv(text);
  if (!rows.length) return { error: `${name}：空のファイルです` };
  const h = rows[0].map((x) => String(x).trim());
  const col = (...ks: string[]) => { for (const k of ks) { const i = h.indexOf(k); if (i >= 0) return i; } return -1; };
  const cDate = col('日付', '利用日'), cEmp = col('従業員', '従業員名', '申請者');
  if (cDate < 0) {
    if (col('合計金額') >= 0 && col('申請番号') >= 0) {
      const cNo = h.indexOf('申請番号'), cApp = h.indexOf('申請者'), cTitle = h.indexOf('タイトル'), cSt = h.indexOf('ステータス'), cAmt = h.indexOf('合計金額'), cAt = h.indexOf('申請日時');
      if (cApp < 0) return { error: `${name}：「申請者」列が見つかりません` };
      const apps: KcApp[] = [];
      for (let i = 1; i < rows.length; i++) {
        const g = (k: number) => (k >= 0 ? String(rows[i][k] ?? '').trim() : '');
        // 申請者は「氏名（社員番号）」の形なので括弧を外す
        const person = g(cApp).replace(/[（(][^）)]*[）)]\s*$/, '').trim();
        if (!person) continue;
        apps.push({ key: g(cNo) || `${name}:${i}`, no: g(cNo), person, title: g(cTitle), status: g(cSt) || '（不明）', amount: yenNum(g(cAmt)), appliedAt: g(cAt).slice(0, 10) });
      }
      return { apps };
    }
    return { error: `${name}：「日付」列が見つかりません（MF経費の明細CSVか確かめてください）` };
  }
  if (cEmp < 0) return { error: `${name}：「従業員」列が見つかりません` };
  const cNo = col('明細番号'), cCat = col('経費科目'), cContent = col('支払先・内容', '内容'), cMemo = col('メモ');
  const cAmt = col('円換算金額', '金額（税込）', '金額'), cTitle = col('経費申請タイトル'), cStatus = col('申請ステータス'), cApp = col('経費申請番号');
  const out: KcRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const g = (k: number) => (k >= 0 ? String(rows[i][k] ?? '').trim() : '');
    const person = g(cEmp);
    if (!person) continue;
    out.push({
      key: cNo >= 0 && g(cNo) ? `no:${g(cNo)}` : `${name}:${i}`, file: name, rowNo: i + 1, person, date: toDate(g(cDate)),
      category: g(cCat), content: g(cContent), memo: g(cMemo), amount: yenNum(g(cAmt)), title: g(cTitle), status: g(cStatus) || '（不明）', applicationNo: g(cApp),
    });
  }
  return { rows: out };
}

export const titleYm = (t: string) => { const m = /(\d{4})\s*年\s*(\d{1,2})\s*月/.exec(String(t || '')); return m ? `${m[1]}-${m[2].padStart(2, '0')}` : ''; };
export const MISS_LABEL: Record<KcMiss['kind'], string> = { none: '打刻なし', noOut: '退勤の打刻なし', noIn: '出勤の打刻なし' };
export const LEVEL_LABEL: Record<KcLevel, { label: string; tone: string }> = {
  ng: { label: '要確認', tone: 'bad' }, warn: { label: '注意', tone: 'warn' }, ok: { label: 'OK', tone: 'ok' }, na: { label: '判定できない', tone: 'mute' }, skip: { label: '対象外', tone: 'mute' },
};
export const errText = (e: unknown) => (typeof e === 'string' ? e : (e as { message?: string } | null)?.message || '照らし合わせできませんでした');
