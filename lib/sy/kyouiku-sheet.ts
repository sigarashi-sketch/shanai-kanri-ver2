import 'server-only';
import { db } from './db';
import { driveId, google, token } from './google';
import { QUESTS, type Quest } from './kyouiku-lessons';
import type { CellIn } from './kyouiku-judge';

// 教育コンテンツ（スプシ講座）: 受講者ごとの練習用スプシを、サーバ（サービスアカウント）が作って・共有して・読む。
//   2026-10-02 shoya「受講者にスプシまわりの準備をさせたくない」→ ひな形のコピー・スクリプトの承認・受講コード貼りを全部やめた
//   ・作る   … 共有ドライブに空のスプシ → タブ（クエストごと）と最初の表を書く。中身は lib/kyouiku-lessons.ts の grid（ひな形は要らない）
//   ・共有   … Google アカウントが分かれば本人に編集者で共有。分からなければ「リンクを知っている人は編集可」
//              内勤（u:メール）はメールがそのまま Google アカウント。要員（n:氏名）は内勤が /kyouiku で入れたアドレス（任意）
//   ・読む   … 答え合わせのとき、そのタブの A1:H12 の値と数式を Sheets API で読む（判定は lib/kyouiku-judge.ts）
//   記録は saiyou.kyouiku_sheets（0014）
export const sheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;   // タブは画面側で #gid=tabGid(クエスト) を足す

export interface SheetRow { subject_key: string; email: string; sheet_id: string; share: string }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const cleanEmail = (v: unknown) => { const s = String(v || '').trim().toLowerCase(); return EMAIL.test(s) && s.length <= 120 ? s : ''; };

export async function loadSheet(subject: string): Promise<SheetRow | null> {
  try {
    const { data } = await db().from('kyouiku_sheets').select('subject_key,email,sheet_id,share').eq('subject_key', subject).maybeSingle();
    return (data as SheetRow) || null;
  } catch { return null; }
}
export async function loadSheets(): Promise<SheetRow[]> {
  try {
    const { data } = await db().from('kyouiku_sheets').select('subject_key,email,sheet_id,share').limit(5000);
    return ((data || []) as SheetRow[]).filter((r) => !r.subject_key.startsWith(DECK));   // デザインリテラシーのスライド（'design:…'）は スプシではない
  } catch { return []; }
}
// デザインリテラシー コースの「本人用の Google スライド」も、この表に 'design:<subject_key>' の行で持つ（sheet_id = スライドのID。表を増やさない）
export const DECK = 'design:';
export async function loadDecks(): Promise<SheetRow[]> {
  try {
    const { data } = await db().from('kyouiku_sheets').select('subject_key,email,sheet_id,share').like('subject_key', DECK + '%').limit(5000);
    return ((data || []) as SheetRow[]).map((r) => ({ ...r, subject_key: r.subject_key.slice(DECK.length) }));
  } catch { return []; }
}
export async function saveSheetRow(subject: string, patch: Partial<SheetRow>, by = '') {
  const { error } = await db().from('kyouiku_sheets').upsert({ subject_key: subject, ...patch, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'subject_key' });
  if (error) throw new Error(error.message);
}

// 1クエストぶんのタブを作るリクエスト（タブ＋最初の表）。index を渡すとその位置に、省くと末尾に足す
//   行・列は 表より少し広く（実務編は 200 行ほどの表がある）。「=」で始まる文字は 式として入れる（実務編の 税込の列。ほかのコースの表には無い）
function tabRequests(q: Quest, index?: number): unknown[] {
  const cell = (v: string | number, head: boolean) => ({
    ...(v === '' ? {} : { userEnteredValue: typeof v === 'number' ? { numberValue: v } : v.startsWith('=') ? { formulaValue: v } : { stringValue: v } }),
    ...(head ? { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.98, green: 0.98, blue: 0.98 } } } : {}),
  });
  const w = Math.max(...q.grid.map((r) => r.length));
  return [
    { addSheet: { properties: { sheetId: q.gid, title: q.tab, ...(index === undefined ? {} : { index }), gridProperties: { rowCount: Math.max(50, q.grid.length + 30), columnCount: Math.max(12, w + 4), frozenRowCount: q.frozen ?? 1 } } } },
    { updateCells: {
      start: { sheetId: q.gid, rowIndex: 0, columnIndex: 0 }, fields: 'userEnteredValue,userEnteredFormat(textFormat.bold,backgroundColor)',
      rows: q.grid.map((r, i) => ({ values: Array.from({ length: w }, (_, k) => cell(r[k] ?? '', i === 0)) })),
    } },
  ];
}
const sheetIds = async (id: string) => (await google<{ sheets: { properties: { sheetId: number } }[] }>(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.sheetId`)).sheets?.map((x) => x.properties.sheetId) || [];

// 最初の表を書いたスプシを作る（共有はまだ）。タブは quests ぶん（ふつうは全ワールド。おためしの人は 入れるワールドだけ＝稼働中になったら ensureTabs が残りを足す）
async function createSheet(title: string, quests: Quest[]): Promise<string> {
  const f = await google<{ id: string }>('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id', {
    body: { name: title, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [driveId()] },
  });
  const first = await sheetIds(f.id);
  const requests: unknown[] = quests.flatMap((q, k) => tabRequests(q, k));
  for (const sid of first) requests.push({ deleteSheet: { sheetId: sid } });   // 最初から入っている空のシート
  await google(`https://sheets.googleapis.com/v4/spreadsheets/${f.id}:batchUpdate`, { body: { requests } });
  return f.id;
}

// あとから増えたクエストのタブを、すでに配ったスプシに足す（無いタブだけ・末尾に）。戻り値＝足した数
export async function ensureTabs(id: string, quests: Quest[] = QUESTS): Promise<number> {
  const have = new Set(await sheetIds(id));
  const missing = quests.filter((q) => !have.has(q.gid));
  if (!missing.length) return 0;
  await google(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, { body: { requests: missing.flatMap((q) => tabRequests(q)) } });
  return missing.length;
}

// そのタブを 最初の表に戻す（修了テストの やり直し用）。タブが無ければ足す
export async function resetTab(id: string, q: Quest): Promise<void> {
  if (!(await sheetIds(id)).includes(q.gid)) { await ensureTabs(id, [q]); return; }
  await google(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, { body: { requests: [
    { updateCells: { range: { sheetId: q.gid, startRowIndex: 0, endRowIndex: 50, startColumnIndex: 0, endColumnIndex: 12 }, fields: 'userEnteredValue,userEnteredFormat' } },
    tabRequests(q)[1],
  ] } });
}

// 共有する。email があれば本人に編集者、だめなら／無ければ リンク共有（編集可）。戻り値 = 'user' | 'anyone' | ''（どちらも失敗）
export async function shareFile(id: string, email: string): Promise<{ share: string; err: string }> {
  const url = `https://www.googleapis.com/drive/v3/files/${id}/permissions?supportsAllDrives=true&sendNotificationEmail=false`;
  let err = '';
  if (email) {
    try { await google(url, { body: { type: 'user', role: 'writer', emailAddress: email } }); return { share: 'user', err: '' }; }
    catch (e) { err = (e as Error).message; }
  }
  try { await google(url, { body: { type: 'anyone', role: 'writer' } }); return { share: 'anyone', err }; }
  catch (e) { return { share: '', err: err || (e as Error).message }; }
}

// 受講者のスプシを用意する（無ければ作る・共有がまだなら共有する）。何度呼んでも同じ1冊を返す
export async function ensureSheet(subject: string, name: string, quests: Quest[] = QUESTS): Promise<{ id: string; share: string; err: string; created?: boolean }> {
  const cur = await loadSheet(subject);
  const email = subject.startsWith('u:') ? cleanEmail(subject.slice(2)) : cur?.email || '';
  let id = cur?.sheet_id || '';
  const created = !id;
  if (!id) {
    id = await createSheet(`bdsh_${name || subject.slice(2)}`, quests);
    await saveSheetRow(subject, { email, sheet_id: id, share: '' });
  }
  if (cur?.sheet_id && cur.share) return { id, share: cur.share, err: '' };
  const s = await shareFile(id, email);
  if (s.share) await saveSheetRow(subject, { share: s.share });
  return { id, ...s, created };
}

// 内勤が要員の Google アカウントを入れる（任意）。すでにスプシがあれば、その場で本人にも共有する
export async function setSheetEmail(subject: string, email: string, by: string): Promise<{ err: string }> {
  const cur = await loadSheet(subject);
  await saveSheetRow(subject, { email }, by);
  if (!cur?.sheet_id || !email) return { err: '' };
  const s = await shareFile(cur.sheet_id, email);
  if (s.share === 'user') { await saveSheetRow(subject, { share: 'user' }, by); return { err: '' }; }
  return { err: s.err || 'このアドレスには共有できませんでした（リンク共有のままです）' };
}

// 答え合わせ用に、そのクエストのタブの A1:H12 を読む（値と数式）
//   rows = 読む行数（応用編は 結果が下へ広がるので 20 行）
export async function readCells(id: string, tab: string, rows = 12): Promise<Record<string, CellIn>> {
  const range = encodeURIComponent(`'${tab.replace(/'/g, "''")}'!A1:H${rows}`);
  const get = (opt: string) => google<{ values?: unknown[][] }>(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}?valueRenderOption=${opt}`);
  const [v, f] = await Promise.all([get('UNFORMATTED_VALUE'), get('FORMULA')]);
  const cells: Record<string, CellIn> = {};
  for (let r = 0; r < rows; r++) for (let c = 0; c < 8; c++) {
    const val = v.values?.[r]?.[c] ?? ''; const raw = f.values?.[r]?.[c];
    const formula = typeof raw === 'string' && raw.startsWith('=') ? raw : '';
    if (val !== '' || formula) cells[String.fromCharCode(65 + c) + (r + 1)] = { v: val, f: formula };
  }
  return cells;
}

// 応用編の IMPORTRANGE: 本人のスプシから 共有データ（src）を読む許可を、サーバが先に出しておく。
//   ふつうは 本人が セルの「アクセスを許可」を押すが、Google に入っていない人（リンク共有で開いている人）は押せないので、その人のぶんだけ ここで通す。
//   Google の 公開されていない口なので、通らなくても 何もしない（その時は 本人が押す）
export async function allowImport(id: string, src: string): Promise<boolean> {
  try {
    const r = await fetch(`https://docs.google.com/spreadsheets/d/${id}/externaldata/addimportrangepermissions?donorDocId=${src}`, { method: 'POST', headers: { Authorization: 'Bearer ' + (await token()) } });
    return r.ok;
  } catch { return false; }
}
