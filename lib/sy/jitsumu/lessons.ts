import type { Cell, Quest, QuestProgress, Slide } from '../kyouiku-lessons';

// bdsh「スプレッドシート 実務編」（2026-10-12 shoya「中身じゃないかな」「基本はスプシでクレンジングとか覚えてもらえるといい」「現場が嬉しがる要素」）
//   手本にしたのは 1日8時間×4日の Excel 研修（ExcelCamp）の背骨＝「移動と選択」→「データクレンジング」→「チェック」→「集計して報告」。
//   基本編・応用編は 関数を1つずつ覚える作り。実務編は「現場から届いた汚い表を、そのまま使える表に直して 数字で報告する」作り。
//   ・1レッスン＝現場からの依頼1つ（動画の最初のコマ）。最後のコマに「現場で喜ばれるところ」
//   ・表は 大きめ（50〜190行）。小さい表だとマウスで足りてしまい、ショートカットの意味が分からないため。動画の表は 頭の数行だけ（vgrid）
//   ・しくみは 応用編と同じ: 動画（字幕の台本）→ 本人の練習用シート（基本編と同じ1冊にタブを足す・gid 601〜。あとから変えない）→ サーバが読んで答え合わせ
//   ・答え合わせは lib/jitsumu/judge.ts（サーバだけ）。値だけでなく、入力規則・条件付き書式・フィルタ表示・保護・固定 も Sheets API で見る
//   ・表の中身は 下の作り方（種つきの乱数）で毎回同じ。判定も 同じ作り方から正解を出す＝表を直したら 判定も勝手に合う
//   ・記録は kyouiku_progress の quest='_jt:<id>'
//   ★題材・手順・台本は Claude が書いた。本物のスプレッドシートでの確かめは super admin が 元栓を開ける前に通す（docs/kyouiku-jitsumu.md）
//   ★出てくる人の名前・会社名・番号は すべて作りもの
export const JITSUMU_LIVE = false;   // false の間は super admin だけ入れる（本物のシートで全レッスンを通してから true に）
export const JT_PREFIX = '_jt:';

export interface JtQuest extends Quest { group: string; mins: number }
export const JT_GROUPS = [
  { id: 'move', name: '速く動く', sub: 'マウスを使わず、大きい表の端まで一気に動いて選ぶ' },
  { id: 'clean', name: '汚いデータを直す', sub: '表記ゆれ・空白・全角・文字の日付を、使える形にそろえる' },
  { id: 'check', name: '確かめる', sub: '重複・抜け・あり得ない値・2つの表のずれを 見つける' },
  { id: 'share', name: '共有シートの作法', sub: 'みんなで使う表を 壊さない・入力しやすくする' },
  { id: 'report', name: '数字で報告する', sub: 'ピボットで集計して、報告の一文まで作る' },
  { id: 'exam', name: 'しあげ', sub: 'すべてのレッスンをクリアすると受けられます' },
] as const;

// ---- 表の作り方（種つきの乱数。同じ種なら いつも同じ表）
function rand(seed: number) {
  let s = seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
type R = () => number;
const pick = <T,>(r: R, a: readonly T[]): T => a[Math.floor(r() * a.length)];
const int = (r: R, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pad = (n: number, w: number) => String(n).padStart(w, '0');
const SEI = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水'] as const;
const MEI = ['健', '翔', '大輔', '美咲', '陽菜', '結衣', '拓也', '直樹', '彩', '葵', '蓮', '悠斗', 'さくら', '優子', '翔太', '真央', '亮', '舞'] as const;
const DEPT = ['総務部', '経理部', '営業部', '情報システム部', '人事部'] as const;
const name = (r: R) => `${pick(r, SEI)} ${pick(r, MEI)}`;
// 全角に（英数字だけ）
const zen = (s: string) => s.replace(/[A-Za-z0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
// 動画の表＝頭の n 行と「…」の行
const head = (g: Cell[][], n = 6): Cell[][] => [...g.slice(0, n), ['…']];
const none = { place: '', enemy: { name: '', body: '' } };
// 表の右側に 項目と答えの欄を足す（rows[i] の後ろに cols を足す・足りない行は空で伸ばす）
function side(rows: Cell[][], at: number, cells: Cell[][]): Cell[][] {
  const out = rows.map((r) => [...r]);
  cells.forEach((c, i) => { while (out.length <= i) out.push([]); const row = out[i]; while (row.length < at) row.push(''); c.forEach((v, k) => { row[at + k] = v; }); });
  return out;
}

// ---- 1 端まで動く（社員名簿 187 行）
export const D1 = (() => { const r = rand(101); return Array.from({ length: 187 }, (_, i) => ({ id: `E${pad(i + 1, 4)}`, name: name(r), dept: pick(r, DEPT), ot: int(r, 0, 45) })); })();
const G1: Cell[][] = side([['社員番号', '氏名', '部署', '残業時間'], ...D1.map((d) => [d.id, d.name, d.dept, d.ot])], 5, [['項目', '答え'], ['最後の社員番号', ''], ['残業時間の合計', ''], ['人数', '']]);

// ---- 2 一斉入力と穴埋め（端末の台帳。拠点は かたまりの最初の行にしか入っていない＝結合セルをほどいた表）
const BASES = [['本社', 12], ['横浜', 9], ['大宮', 11], ['千葉', 8], ['立川', 10]] as const;
export const D2 = (() => { const r = rand(202); let n = 1001; return BASES.flatMap(([b, c]) => Array.from({ length: c }, (_, i) => ({ base: b as string, first: i === 0, who: name(r), pc: `PC-${n++}` }))); })();
const G2: Cell[][] = side([['拠点', '担当', '端末番号', '状態'], ...D2.map((d) => [d.first ? d.base : '', d.who, d.pc, ''])], 6, [['拠点', '台数'], ...BASES.map(([b]) => [b, ''])]);

// ---- 型 見た目と中身（経費の一覧。金額に「文字の数字」がまざり、番号は文字で入っている）
export const D14 = (() => {
  const r = rand(1414); const KIND = ['交通費', '備品', '会議費'] as const;
  const shownAt: Record<number, (n: number) => string> = { 3: (n) => n.toLocaleString('en-US'), 8: (n) => n.toLocaleString('en-US'), 11: (n) => n.toLocaleString('en-US'), 6: (n) => zen(String(n)), 15: (n) => zen(String(n)), 19: (n) => zen(n.toLocaleString('en-US')).replace(/,/g, '，') };
  return Array.from({ length: 24 }, (_, i) => { const yen = int(r, 3, 40) * 500; return { no: String(1001 + i), name: name(r), yen, shown: (shownAt[i] ? shownAt[i](yen) : yen) as Cell, kind: pick(r, KIND) }; });
})();
export const LOOKUP14 = 1007;   // 数値で入っている「探す番号」（表の番号は文字）
const G14: Cell[][] = side([['番号', '氏名', '金額', '区分', '数値？', '金額（数値）'], ...D14.map((d) => [d.no, d.name, d.shown, d.kind, '', ''])], 7, [['合計（そのまま）', ''], ['合計（直したあと）', ''], [''], ['番号で氏名を引く', ''], [LOOKUP14, '']]);

// ---- 3 置換で表記をそろえる（取引先。正しい書き方は「株式会社◯◯」）
export const COMPANIES = ['アオバ商事', 'ミナト物流', 'サクラ電機', 'ヒカリ工業', 'ツバサ建設', 'カエデ食品'] as const;
const VARIANTS = ['株式会社#', '(株)#', '（株）#', '㈱#', '株式会社# 様', '株式会社#様', '株式会社#', '(株)# 様'] as const;
export const D3 = (() => { const r = rand(303); return Array.from({ length: 36 }, (_, i) => { const c = i < COMPANIES.length ? COMPANIES[i] : pick(r, COMPANIES); return { no: i + 1, base: c, shown: pick(r, VARIANTS).replace('#', c), yen: int(r, 3, 90) * 1000 }; }); })();
const G3: Cell[][] = side([['番号', '取引先', '金額'], ...D3.map((d) => [d.no, d.shown, d.yen])], 4, [['取引先', '件数'], ...COMPANIES.map((c) => ['株式会社' + c, ''])]);

// ---- 4 空白・全角・先頭の0（「レッスン2 と同じやり方」＝作業列→値だけ貼り付け→作業列を消す）（よその仕組みから出した社員リスト）
export const D4 = (() => {
  const r = rand(404);
  return Array.from({ length: 30 }, (_, i) => {
    const id = `E${pad(101 + i, 4)}`; const nm = name(r); const [s, m] = nm.split(' ');
    const sp = pick(r, [`${nm}`, ` ${nm}`, `${nm} `, `${s}  ${m}`, ` ${s}  ${m} `]);
    const tel = `${pick(r, ['090', '080', '070'])}-${pad(int(r, 1000, 9999), 4)}-${pad(int(r, 0, 9999), 4)}`;
    return { id: r() < 0.45 ? zen(id) : id, idOk: id, name: sp, nameOk: nm, tel };
  });
})();
const G4: Cell[][] = [['社員番号', '氏名', '電話', '電話（ハイフンなし）', ''], ...D4.map((d) => [d.id, d.name, d.tel, '', ''])];

// ---- 5 文字の日付を 本物の日付に（入館申請）
export const D5 = (() => {
  const r = rand(505);
  return Array.from({ length: 24 }, () => {
    const m = pick(r, [9, 10, 10, 10, 11]); const d = int(r, 1, m === 9 || m === 11 ? 30 : 31);
    const shown = pick(r, [`2026.${m}.${d}`, `2026年${m}月${d}日`, `2026/${m}/${d}`, `2026.${pad(m, 2)}.${pad(d, 2)}`]);
    return { m, d, shown, who: name(r), place: pick(r, ['本社', '横浜', '大宮']) };
  });
})();
const G5: Cell[][] = side([['申請日', '氏名', '入館先', '', '申請日（日付）'], ...D5.map((d) => [d.shown, d.who, d.place, '', ''])], 6, [['10月の申請', '']]);

export const serial = (m: number, d: number) => Math.round((Date.UTC(2026, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400e3);   // スプシの日付の正体（1899/12/30 から何日目か）
const S5 = serial(D5[0].m, D5[0].d);

// ---- 6 分ける・つなぐ（送付先リスト。郵便番号・住所は 作りもの）
const ADDR = [['1600022', '東京都', '新宿区'], ['2200012', '神奈川県', '横浜市西区'], ['3300854', '埼玉県', 'さいたま市大宮区'], ['0600001', '北海道', '札幌市中央区'], ['5300001', '大阪府', '大阪市北区'], ['4500002', '愛知県', '名古屋市中村区'], ['8120011', '福岡県', '福岡市博多区'], ['0100001', '秋田県', '秋田市']] as const;
export const D6 = (() => { const r = rand(606); return Array.from({ length: 20 }, (_, i) => { const a = i < ADDR.length ? ADDR[i] : pick(r, ADDR); return { id: `E${pad(201 + i, 4)}`, name: name(r), zip: a[0] as string, pref: a[1] as string, city: a[2] as string }; }); })();
const G6: Cell[][] = [['社員番号', '氏名', '姓', '名', '郵便番号', '郵便番号（-つき）', '都道府県', '市区町村', '宛先'], ...D6.map((d) => [d.id, d.name, '', '', d.zip, '', d.pref, d.city, ''])];

// ---- 7 重複を見つけて消す（研修の申込。同じ人が2回送ってきた行が 6つ・同姓同名が1組）
export const D7 = (() => {
  const r = rand(707);
  const base = Array.from({ length: 74 }, (_, i) => ({ id: `E${pad(301 + i, 4)}`, name: name(r), dept: pick(r, DEPT), day: `10/${pad(int(r, 1, 20), 2)}` }));
  base[40].name = base[12].name;   // 同姓同名（番号が違う＝別の人）
  const rows = [...base];
  for (const [src, at] of [[3, 20], [15, 33], [27, 47], [8, 58], [50, 66], [61, 75]] as const) rows.splice(at, 0, { ...base[src] });
  return rows;
})();
const G7: Cell[][] = side([['社員番号', '氏名', '部署', '申込日', '重複'], ...D7.map((d) => [d.id, d.name, d.dept, d.day, ''])], 6, [['重複している行', '']]);

// ---- 8 抜けとあり得ない値（勤怠と交通費の取り込み）
export const D8 = (() => {
  const r = rand(808);
  const rows: { id: string; name: string; dept: Cell; hours: Cell; fare: Cell }[] = Array.from({ length: 50 }, (_, i) => ({ id: `E${pad(401 + i, 4)}`, name: name(r), dept: pick(r, DEPT), hours: int(r, 12, 22) / 2, fare: int(r, 0, 40) * 500 }));
  rows[4].dept = ''; rows[17].hours = ''; rows[29].fare = ''; rows[41].dept = '';
  rows[9].hours = 24; rows[22].hours = -1; rows[35].hours = 18; rows[13].fare = 120000; rows[46].fare = -500;
  return rows;
})();
const G8: Cell[][] = side([['社員番号', '氏名', '部署', '実働時間', '交通費', '抜け', '要確認'], ...D8.map((d) => [d.id, d.name, d.dept, d.hours, d.fare, '', ''])], 8, [['抜け', ''], ['要確認', ''], [''], ['基準：実働 0〜15時間・交通費 0〜50000円']]);

// ---- 9 2つの表の突き合わせ（端末の台帳 と 配った記録）
export const D9 = (() => {
  const r = rand(909);
  const book = Array.from({ length: 40 }, (_, i) => ({ pc: `PC-${2001 + i}`, who: name(r), dept: pick(r, DEPT) }));
  const keys = book.map(() => r());   // 28 台を選ぶ（台帳の順のまま）
  const cut = [...keys].sort((a, b) => a - b)[27];
  const given = book.filter((_, i) => keys[i] <= cut).map((b) => b.pc);
  const handed = [...given.slice(0, 11), 'PC-2098', ...given.slice(11, 21), 'PC-2099', ...given.slice(21)].map((pc) => ({ pc, day: `10/${pad(int(r, 1, 10), 2)}` }));
  return { book, handed };
})();
const G9: Cell[][] = side(side([['資産番号', '利用者', '部署', '配布'], ...D9.book.map((b) => [b.pc, b.who, b.dept, ''])], 5, [['資産番号', '受取日', '台帳'], ...D9.handed.map((h) => [h.pc, h.day, ''])]), 9, [['未配布', '']]);

// ---- 10 固定とフィルタ表示（問い合わせの管理表 120 行）
export const STATUS3 = ['未対応', '対応中', '完了'] as const;
export const D10 = (() => { const r = rand(1010); return Array.from({ length: 120 }, (_, i) => ({ no: `Q-${pad(i + 1, 4)}`, day: `10/${pad(int(r, 1, 11), 2)}`, who: pick(r, ['佐藤', '鈴木', '高橋', '田中', '伊藤']), cat: pick(r, ['PC', 'アカウント', 'プリンタ', 'ネットワーク', 'その他']), st: pick(r, ['未対応', '対応中', '完了', '完了', '完了']) })); })();
const G10: Cell[][] = side([['受付番号', '受付日', '担当', 'カテゴリ', '状態'], ...D10.map((d) => [d.no, d.day, d.who, d.cat, d.st])], 6, [['未対応の件数', '']]);

// ---- 11 プルダウンと条件付き書式（チームのタスク表）
export const TASK_ST = ['未着手', '対応中', '完了'] as const;
const TASKS = ['新入社員のPC準備', 'アカウント発行', '入館証の申請', '月次レポート作成', 'プリンタ設置', 'ソフト更新の連絡', '貸出PCの回収', '名簿の更新', '会議室の予約整理', '問い合わせFAQ更新'] as const;
export const D11 = (() => { const r = rand(1111); return Array.from({ length: 20 }, (_, i) => ({ task: TASKS[i % TASKS.length] + (i >= TASKS.length ? '（2）' : ''), who: pick(r, SEI), due: `10/${pad(int(r, 13, 31), 2)}`, st: pick(r, TASK_ST) })); })();
const G11: Cell[][] = [['タスク', '担当', '期限', '状態'], ...D11.map((d) => [d.task, d.who, d.due, d.st])];

// ---- 12 並べ替え事故と保護（案件の一覧。税込の列は式）
export const D12 = (() => {
  const r = rand(1212); const used = new Set<number>();
  return Array.from({ length: 30 }, (_, i) => { let y = 0; do y = int(r, 30, 980) * 1000; while (used.has(y)); used.add(y); return { no: `K-${pad(i + 1, 3)}`, cust: '株式会社' + pick(r, COMPANIES), yen: y, who: pick(r, SEI) }; });
})();
export const taxIn = (y: number) => Math.round(y * 1.1);
const G12: Cell[][] = side([['案件番号', '顧客', '金額', '担当', '税込'], ...D12.map((d, i) => [d.no, d.cust, d.yen, d.who, `=ROUND(C${i + 2}*1.1)`])], 6, [['税込の合計', '']]);

// ---- 13 ピボットと報告の一文（問い合わせ 150 件）
export const CATS = ['PC', 'アカウント', 'プリンタ', 'その他'] as const;
export const D13 = (() => { const r = rand(1313); return Array.from({ length: 150 }, (_, i) => ({ no: `Q-${pad(i + 1, 4)}`, dept: pick(r, DEPT), cat: pick(r, CATS), st: pick(r, ['未対応', '対応中', '完了', '完了']) })); })();
const G13: Cell[][] = side([['受付番号', '部署', 'カテゴリ', '状態'], ...D13.map((d) => [d.no, d.dept, d.cat, d.st])], 5, [['未対応の件数', ''], ['報告', '']]);

// ---- 修了テスト（よその仕組みから出した 残業の一覧。全角の番号・余分な空白・重複・抜け・多すぎる残業が まざっている）
export const DX = (() => {
  const r = rand(9090);
  const base = Array.from({ length: 95 }, (_, i) => { const nm = name(r); const [s, m] = nm.split(' '); const id = `E${pad(501 + i, 4)}`; return { id, idShown: r() < 0.35 ? zen(id) : id, name: nm, nameShown: pick(r, [nm, nm, ` ${nm}`, `${s}  ${m}`, `${nm} `]), dept: pick(r, DEPT), ot: int(r, 0, 70) as Cell }; });
  base[7].ot = ''; base[33].ot = ''; base[61].ot = ''; base[12].ot = 92; base[48].ot = 85; base[80].ot = 120;
  const rows = base.map((b) => ({ ...b }));
  // 重複＝同じ人が もう一度入っている（番号は 全角と半角で ちがって見える・名前の空白も ちがう）
  for (const [src, at] of [[5, 30], [19, 44], [40, 60], [66, 82], [70, 99]] as const) rows.splice(at, 0, { ...base[src], idShown: base[src].idShown === base[src].id ? zen(base[src].id) : base[src].id, nameShown: ` ${base[src].name} ` });
  return { base, rows };
})();
const GX: Cell[][] = side([['社員番号', '氏名', '部署', '残業時間', 'チェック'], ...DX.rows.map((d) => [d.idShown, d.nameShown, d.dept, d.ot, ''])], 6, [['報告', '']]);

// ---- 台本と手順
const K = (cap: string, x: Omit<Slide, 'cap'> = {}): Slide => ({ cap, ...x });

export const JT_QUESTS: JtQuest[] = [
  {
    id: 'jt-01', gid: 601, no: 'レッスン1', tab: '実務1', group: 'move', mins: 3, title: '端まで一気に動く・選ぶ', ...none,
    goal: '187 行の表でも、Ctrl＋矢印で端まで動き、Ctrl＋Shift＋矢印で一気に選べる',
    grid: G1, vgrid: head(G1),
    slides: [
      K('依頼「残業時間の合計と人数、いますぐ出せる？」。表は 187 行。マウスで下までスクロールすると それだけで時間がかかります'),
      K('表の操作は「移動」「選択」「命令」の3つ。速い人は、移動と選択を キーボードでやっています'),
      K('Ctrl＋↓ で、データのいちばん下まで一気に移動。Ctrl＋↑ で上の端へ戻れます', { cell: 'A2', keys: ['Ctrl', '↓'] }),
      K('Ctrl＋Shift＋↓ は、いまのセルから端までを まとめて選択', { range: 'D2:D6', keys: ['Ctrl', 'Shift', '↓'] }),
      K('「=SUM(」と打ってから D2 を選び Ctrl＋Shift＋↓。範囲を打たずに式が書けます', { cell: 'G3', typed: '=SUM(D2:D188)' }),
      K('Ctrl＋Home で A1 へ。Mac は Ctrl のかわりに ⌘ を使います'),
      K('現場で喜ばれるところ：聞かれて「すぐ出します」と数字で返せる人は、次も頼まれます'),
    ],
    steps: [
      { title: '端まで移動', body: 'A1 を選んで Ctrl＋↓ で表のいちばん下へ移動し、最後の社員番号を G2 に入力してください（Ctrl＋↑ で上に戻れます）。', cells: ['G2'] },
      { title: '一気に選んで合計', body: 'G3 に「=SUM(」と打ち、D2 を選んで Ctrl＋Shift＋↓ で残業時間を下まで選び、「)」を打って Enter。残業時間の合計を出してください。', cells: ['G3'] },
      { title: '人数を数える', body: 'G4 に、人数（社員番号の数）を COUNTA で出してください。範囲は 同じように Ctrl＋Shift＋↓ で選びます。', cells: ['G4'] },
    ],
  },
  {
    id: 'jt-02', gid: 602, no: 'レッスン2', tab: '実務2', group: 'move', mins: 5, title: '一斉入力と 空白の穴埋め', ...none,
    goal: 'Ctrl＋Enter でまとめて入力し、空いているセルを「上と同じ」で埋めて 集計できる表にする',
    grid: G2, vgrid: head(G2, 8),
    slides: [
      K('依頼「拠点ごとの台数を出して。状態の列は いったん全部『未確認』で」'),
      K('この表は 拠点が かたまりの最初の行にしか入っていません。結合したセルを ほどくと こうなります。このままでは数えられません', { range: 'A2:A8' }),
      K('まず一斉入力。D2 から下を選んで「未確認」と打ち、Enter ではなく Ctrl＋Enter。選んだセル全部に入ります', { range: 'D2:D8', keys: ['Ctrl', 'Enter'], show: { D2: '未確認', D3: '未確認', D4: '未確認', D5: '未確認', D6: '未確認', D7: '未確認' } }),
      K('穴埋めは 作業用の列を使います。E2 に =IF(A2="",E1,A2)。「空なら1つ上、空でなければ そのまま」', { cell: 'E2', typed: '=IF(A2="",E1,A2)', show: { E2: '本社' } }),
      K('下までコピーすると、全部の行に拠点が入ります', { range: 'E2:E7', show: { E2: '本社', E3: '本社', E4: '本社', E5: '本社', E6: '本社', E7: '本社' } }),
      K('E 列をコピーして、A2 に「値だけ貼り付け」（Ctrl＋Shift＋V）。式ではなく 文字として入ります', { cell: 'A2', keys: ['Ctrl', 'Shift', 'V'] }),
      K('最後に 作業用の E 列を消します。残しておくと、次に開いた人が「この列は何？」と迷います'),
      K('現場で喜ばれるところ：空白のある表は、並べ替え・フィルタ・集計が全部くるいます。埋めてから渡すと 次の人が助かります'),
    ],
    steps: [
      { title: '一斉入力', body: 'D2 から D51 までを選んで「未確認」と打ち、Ctrl＋Enter で全部のセルに入れてください（空の列は Ctrl＋Shift＋↓ では選べません。左上の「名前ボックス」に D2:D51 と打って Enter で選べます）。', cells: ['D2', 'D51'] },
      { title: '空白を上の拠点で埋める', body: 'E2 に =IF(A2="",E1,A2) を入れて E51 までコピー → E2:E51 をコピーして A2 に 値だけ貼り付け（Ctrl＋Shift＋V）→ E 列を消してください。', cells: ['A2', 'A51', 'E2'] },
      { title: '拠点ごとに数える', body: 'H2 から H6 に、拠点ごとの台数を COUNTIF で出してください（範囲は $A$2:$A$51 と $ で固定してコピー）。', cells: ['H2', 'H6'] },
    ],
  },
  {
    id: 'jt-14', gid: 614, no: '', tab: '', group: 'clean', mins: 5, title: '見た目と中身（データの型）', ...none,
    goal: '数値・文字・TRUE/FALSE のちがいが分かり、式の中の文字は "" で囲む。「合計が合わない」「引けない」を型から直せる',
    grid: G14, vgrid: head(G14),
    slides: [
      K('依頼「経費の合計、なんか少ない気がする。それと 番号 1007 の人の名前も引いて」'),
      K('セルの中身には「型」があります。数値・文字（テキスト）・日付・TRUE/FALSE（論理値）・空白。見た目が同じでも 型がちがうと 別物です'),
      K('見分けるコツ：何もしていなければ、数値は右寄せ、文字は左寄せで入ります。「12,000」が左に寄っていたら 文字です', { range: 'C2:C6' }),
      K('確かめる関数は ISNUMBER。=ISNUMBER(C2) で、数値なら TRUE、文字なら FALSE', { cell: 'E2', typed: '=ISNUMBER(C2)', show: { E2: 'TRUE' } }),
      K('式の中で 文字を書く時は "" で囲みます。=IF(D2="交通費","○","")。数字は囲みません。=C2>10000', { cell: 'D2' }),
      K('"10" と書くと「文字の10」、10 と書くと「数値の10」。見た目は同じでも 別物です。"" だけなら「空っぽの文字」'),
      K('文字の数字を 数値に直す：=VALUE(SUBSTITUTE(ASC(C2),",",""))。全角を半角に → カンマを取る → 数値に', { cell: 'F2', typed: '=VALUE(SUBSTITUTE(ASC(C2),",",""))' }),
      K('SUM は 文字を黙って飛ばします。エラーが出ずに 少ない合計になる＝いちばん気づきにくい ミスです'),
      K('VLOOKUP が #N/A になる よくある原因：表の番号は文字、探す番号は数値。&"" を付けると 文字にそろいます', { cell: 'I5', typed: '=VLOOKUP(H5&"",A2:B25,2,FALSE)' }),
      K('現場で喜ばれるところ：「合計が合わない」「引けない」の原因を 型から見つけられる人は、どの現場でも重宝されます'),
    ],
    steps: [
      { title: '数値か文字か 見分ける', body: 'E2 に =ISNUMBER(C2) を入れて E25 までコピーし、金額が 数値（TRUE）か 文字（FALSE）かを出してください。', cells: ['E2', 'E25'] },
      { title: '文字の数字を 数値に', body: 'F2 に =VALUE(SUBSTITUTE(ASC(C2),",","")) を入れて F25 までコピー。I1 に =SUM(C2:C25)（そのまま）、I2 に =SUM(F2:F25)（直したあと）を出して 差を見てください。', cells: ['F2', 'F25', 'I1', 'I2'] },
      { title: '番号を そろえて引く', body: 'I5 に、H5 の番号（数値）の人の氏名を VLOOKUP で出してください。表の番号は文字なので、H5 に &"" を付けて 文字にそろえます。', cells: ['I5'] },
    ],
  },
  {
    id: 'jt-03', gid: 603, no: 'レッスン3', tab: '実務3', group: 'clean', mins: 4, title: '置換で 表記をそろえる', ...none,
    goal: '「(株)」「㈱」「様」などの表記ゆれを、検索と置換で 正しい書き方にそろえる',
    grid: G3, vgrid: head(G3, 8),
    slides: [
      K('依頼「取引先ごとの件数を出して」。ところが 同じ会社が「(株)」「㈱」「株式会社」とバラバラです', { range: 'B2:B8' }),
      K('このままだと COUNTIF で数えても、書き方ごとに別の会社として数えられてしまいます'),
      K('Ctrl＋H で「検索と置換」。検索に「(株)」、置換後に「株式会社」と入れて「すべて置換」', { keys: ['Ctrl', 'H'] }),
      K('「（株）」（全角のかっこ）と「㈱」（1文字）も 同じように置換します。㈱ は 表のセルからコピーして 検索に貼ると確実です'),
      K('次は「様」。置換後を空にして「 様」（前に空白あり）→「様」の順に置換すると、空白も残りません'),
      K('そろったら =COUNTIF($B$2:$B$37,E2) で数えられます', { cell: 'F2', typed: '=COUNTIF($B$2:$B$37,E2)' }),
      K('現場で喜ばれるところ：「数えてみたら合わない」の原因の多くは表記ゆれ。直してから数えると、二度手間がなくなります'),
    ],
    steps: [
      { title: '略し方をそろえる', body: 'Ctrl＋H で「(株)」「（株）」「㈱」の3つを、それぞれ「株式会社」に置換してください（範囲は B 列）。', cells: ['B2', 'B37'] },
      { title: '「様」を消す', body: '置換後を空にして、「 様」（前に空白）→「様」の順に置換し、取引先の名前から「様」を消してください。', cells: ['B2', 'B37'] },
      { title: '取引先ごとに数える', body: 'F2 から F7 に、取引先ごとの件数を COUNTIF で出してください。', cells: ['F2', 'F7'] },
    ],
  },
  {
    id: 'jt-04', gid: 604, no: 'レッスン4', tab: '実務4', group: 'clean', mins: 6, title: '空白・全角・先頭の0', ...none,
    goal: 'TRIM で余分な空白を、ASC で全角の英数字を直し、電話番号の先頭の0を消さずに整える',
    grid: G4, vgrid: head(G4),
    slides: [
      K('依頼「よそのシステムから出した社員リスト。番号で引けないから直して」'),
      K('よく見ると、社員番号に「Ｅ０１０２」（全角）が まざり、氏名には 前後や間に 余分な空白があります', { range: 'A2:B6' }),
      K('見た目は同じでも、コンピュータには別の文字。VLOOKUP や重複チェックが 当たらなくなります'),
      K('氏名は TRIM。前後の空白を消し、間の空白は1つにします。作業用の E 列に =TRIM(B2)', { cell: 'E2', typed: '=TRIM(B2)' }),
      K('下までコピー → E 列をコピーして B2 に 値だけ貼り付け → E 列を消す。レッスン2 と同じやり方です', { keys: ['Ctrl', 'Shift', 'V'] }),
      K('社員番号は ASC。全角の英数字を半角にします。=ASC(A2) を同じやり方で A 列に戻します', { cell: 'E2', typed: '=ASC(A2)' }),
      K('電話番号のハイフンは SUBSTITUTE で取ります。=SUBSTITUTE(C2,"-","")', { cell: 'D2', typed: '=SUBSTITUTE(C2,"-","")' }),
      K('数字として打ち直すと 先頭の0が消えます。電話・郵便番号・社員番号は「文字」として扱うのが鉄則です'),
      K('現場で喜ばれるところ：番号で引けない・数が合わない を自分で直せる人は、データを安心して任せてもらえます'),
    ],
    steps: [
      { title: '余分な空白を消す', body: 'E2 に =TRIM(B2) を入れて E31 までコピー → B2 に値だけ貼り付け → E 列を消してください。', cells: ['B2', 'B31', 'E2'] },
      { title: '全角を半角に', body: 'E2 に =ASC(A2) を入れて E31 までコピー → A2 に値だけ貼り付け → E 列を消してください。', cells: ['A2', 'A31', 'E2'] },
      { title: '電話番号のハイフンを取る', body: 'D2 に =SUBSTITUTE(C2,"-","") を入れて D31 までコピーしてください。先頭の0が残っていることを確かめます。', cells: ['D2', 'D31'] },
    ],
  },
  {
    id: 'jt-05', gid: 605, no: 'レッスン5', tab: '実務5', group: 'clean', mins: 5, title: '文字の日付を 本物の日付に', ...none,
    goal: '「2026.10.1」「2026年10月1日」のような文字を 日付に直し、月で数えられるようにする',
    grid: G5, vgrid: head(G5),
    slides: [
      K('依頼「10月の入館申請は何件？」。申請日の書き方が バラバラです', { range: 'A2:A6' }),
      K('セルの左に寄っているのは「文字」のしるし。文字のままだと、日付として比べたり 数えたりできません'),
      K('区切りを「-」にそろえてから DATEVALUE で日付に。置き換えは SUBSTITUTE を重ねます'),
      K('=DATEVALUE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(A2,".","-"),"年","-"),"月","-"),"日",""))', { cell: 'E2', typed: '=DATEVALUE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(A2,".","-"),"年","-"),"月","-"),"日",""))', show: { E2: S5 } }),
      K('「2026/10/5」のような「/」の日付は 置き換えなくても DATEVALUE で読めます。どの形でも同じ式で通ります'),
      K(`${S5} のような数字が出たら成功。日付の正体は「1899年12月30日から何日目か」という数字です`, { cell: 'E2', show: { E2: S5 } }),
      K('表示形式 → 数字 → 日付 にすると、見た目も日付になります'),
      K('=COUNTIFS(E2:E25,">="&DATE(2026,10,1),E2:E25,"<"&DATE(2026,11,1)) で 10月の件数', { cell: 'H1', typed: '=COUNTIFS(E2:E25,">="&DATE(2026,10,1),E2:E25,"<"&DATE(2026,11,1))' }),
      K('現場で喜ばれるところ：月ごと・週ごとの集計は 日付がそろっていないとできません。最初に直しておくと 後の集計が全部楽になります'),
    ],
    steps: [
      { title: '日付に直す', body: 'E2 に、A2 の申請日を日付に直す式を入れて E25 までコピーしてください（SUBSTITUTE で区切りを「-」にそろえて DATEVALUE）。', cells: ['E2', 'E25'] },
      { title: '日付の表示にする', body: 'E2:E25 を選んで、表示形式 → 数字 → 日付 にしてください。', cells: ['E2', 'E25'] },
      { title: '10月の件数', body: 'H1 に、10月（10/1〜10/31）の申請の件数を COUNTIFS で出してください。', cells: ['H1'] },
    ],
  },
  {
    id: 'jt-06', gid: 606, no: 'レッスン6', tab: '実務6', group: 'clean', mins: 5, title: '分ける・つなぐ', ...none,
    goal: '氏名を姓と名に分け、郵便番号に「-」を入れ、宛先の1行を 式でつなげて作る',
    grid: G6, vgrid: head(G6),
    slides: [
      K('依頼「書類の送付先リストを作って。姓と名は別の列、郵便番号は 123-4567 の形で」'),
      K('姓と名は SPLIT。=SPLIT(B2," ") で 空白のところで分かれ、右のセルへ広がります', { cell: 'C2', typed: '=SPLIT(B2," ")' }),
      K('郵便番号は LEFT と RIGHT。=LEFT(E2,3)&"-"&RIGHT(E2,4)。& で文字をつなぎます', { cell: 'F2', typed: '=LEFT(E2,3)&"-"&RIGHT(E2,4)' }),
      K('北海道の 060-0001 のように 0 から始まる番号があります。郵便番号の列が「文字」だから 0 が残っています', { range: 'E2:E6' }),
      K('宛先は ="〒"&F2&" "&G2&H2。セルと文字を & でつなげて、1行にまとめます', { cell: 'I2', typed: '="〒"&F2&" "&G2&H2' }),
      K('式で作っておけば、元の住所が変わっても 宛先は自動で変わります'),
      K('現場で喜ばれるところ：差し込み印刷やラベル作りの下準備を 頼まれた時に、手で打ち直さずに作れます'),
    ],
    steps: [
      { title: '姓と名に分ける', body: 'C2 に =SPLIT(B2," ") を入れて、C21 までコピーしてください（名は D 列に入ります）。', cells: ['C2', 'D2', 'C21'] },
      { title: '郵便番号に「-」', body: 'F2 に、E2 の郵便番号を「123-4567」の形にする式を入れて F21 までコピーしてください。', cells: ['F2', 'F21'] },
      { title: '宛先をつなげる', body: 'I2 に「〒123-4567 東京都新宿区」の形の宛先を作る式を入れて I21 までコピーしてください（〒 と 郵便番号、空白1つ、都道府県と市区町村）。', cells: ['I2', 'I21'] },
    ],
  },
  {
    id: 'jt-07', gid: 607, no: 'レッスン7', tab: '実務7', group: 'check', mins: 5, title: '重複を見つけて消す', ...none,
    goal: '番号で重複に印をつけて数え、重複を削除する。名前ではなく番号で見る理由がわかる',
    grid: G7, vgrid: head(G7),
    slides: [
      K('依頼「研修の申込、同じ人が2回送ってきてるかも。重複を消して人数を確定して」'),
      K('重複は「名前」ではなく「社員番号」で見ます。同姓同名の別の人がいるかもしれないからです'),
      K('E2 に =IF(COUNTIF($A$2:$A$81,A2)>1,"重複","")。同じ番号が2つ以上あれば 印がつきます', { cell: 'E2', typed: '=IF(COUNTIF($A$2:$A$81,A2)>1,"重複","")' }),
      K('=COUNTIF(E2:E81,"重複") で、重複している行の数。消す前に数を確かめておくと、消しすぎに気づけます', { cell: 'H1', typed: '=COUNTIF(E2:E81,"重複")' }),
      K('消すのは メニューから。表を選んで データ → データクリーンアップ → 重複を削除'),
      K('「データにヘッダー行が含まれている」に チェック。比べる列は 社員番号 だけにしても、全部の列でもかまいません'),
      K('現場で喜ばれるところ：「何件消しました」と言える人は信頼されます。印→数える→消す の順を守りましょう'),
    ],
    steps: [
      { title: '重複に印', body: 'E2 に、社員番号が重複していたら「重複」と出す式を入れて E81 までコピーしてください。', cells: ['E2', 'E81'] },
      { title: '重複している行の数', body: 'H1 に、「重複」の印がついた行の数を COUNTIF で出してください。', cells: ['H1'] },
      { title: '重複を削除', body: 'A1:E81 を選んで、データ → データクリーンアップ → 重複を削除 で、2回目以降の行を消してください（ヘッダー行あり）。', cells: ['A2', 'A75'] },
    ],
  },
  {
    id: 'jt-08', gid: 608, no: 'レッスン8', tab: '実務8', group: 'check', mins: 5, title: '抜けと あり得ない値', ...none,
    goal: '空欄と「基準の外」の値に 式で印をつけ、件数を数えて 確認を頼める形にする',
    grid: G8, vgrid: head(G8),
    slides: [
      K('依頼「今月の勤怠と交通費、給与に回す前に おかしいところがないか見て」'),
      K('おかしいのは2種類。入っていない「抜け」と、入っているけど あり得ない「異常値」です'),
      K('抜けは COUNTBLANK。=IF(COUNTBLANK(A2:E2)>0,"抜け","")。1行の中に空のセルがあれば印', { cell: 'F2', typed: '=IF(COUNTBLANK(A2:E2)>0,"抜け","")' }),
      K('異常値は 先に基準を決めます。ここでは「実働 0〜15時間」「交通費 0〜50000円」', { cell: 'I4' }),
      K('=IF(OR(D2<0,D2>15,E2<0,E2>50000),"要確認","")。OR は「どれか1つでも」', { cell: 'G2', typed: '=IF(OR(D2<0,D2>15,E2<0,E2>50000),"要確認","")' }),
      K('最後に それぞれの件数を COUNTIF で。人の目で1行ずつ見るより、速くて見落としもありません'),
      K('現場で喜ばれるところ：「全部で何件、うち要確認が何件」と 基準つきで渡せると、確認する側も すぐ動けます'),
    ],
    steps: [
      { title: '抜けに印', body: 'F2 に、その行に空のセルがあれば「抜け」と出す式を入れて F51 までコピーしてください。', cells: ['F2', 'F51'] },
      { title: 'あり得ない値に印', body: 'G2 に、実働が 0 未満か 15 より大きい、または 交通費が 0 未満か 50000 より大きい時に「要確認」と出す式を入れて G51 までコピーしてください。', cells: ['G2', 'G51'] },
      { title: '件数を数える', body: 'J1 に「抜け」の件数、J2 に「要確認」の件数を COUNTIF で出してください。', cells: ['J1', 'J2'] },
    ],
  },
  {
    id: 'jt-09', gid: 609, no: 'レッスン9', tab: '実務9', group: 'check', mins: 5, title: '2つの表の 突き合わせ', ...none,
    goal: '台帳と記録を COUNTIF で突き合わせて、「まだのもの」と「台帳に無いもの」を両方見つける',
    grid: G9, vgrid: head(G9),
    slides: [
      K('依頼「端末の台帳と、配った記録を突き合わせて。まだ配っていないのは どれ？」'),
      K('左が台帳（全部の端末）、右が 配った記録。2つの表を見比べる作業を、式にやらせます'),
      K('D2 に =IF(COUNTIF($F$2:$F$31,A2)>0,"配布済","未配布")。右の表に その番号が あるかどうか', { cell: 'D2', typed: '=IF(COUNTIF($F$2:$F$31,A2)>0,"配布済","未配布")' }),
      K('逆向きも見ます。H2 に =IF(COUNTIF($A$2:$A$41,F2)=0,"台帳に無い","")。配った記録にあるのに 台帳に無い番号', { cell: 'H2', typed: '=IF(COUNTIF($A$2:$A$41,F2)=0,"台帳に無い","")' }),
      K('片方向だけだと、打ちまちがい や 台帳への登録もれ を見逃します。突き合わせは 両方向が基本'),
      K('現場で喜ばれるところ：キッティングや貸出の現場で いちばん頼まれる作業です。両方向で見て「ずれは◯件」と報告しましょう'),
    ],
    steps: [
      { title: '配ったかどうか', body: 'D2 に、A2 の資産番号が 右の表（F2:F31）にあれば「配布済」、無ければ「未配布」と出す式を入れて D41 までコピーしてください。', cells: ['D2', 'D41'] },
      { title: '台帳に無い番号', body: 'H2 に、F2 の資産番号が 台帳（A2:A41）に無ければ「台帳に無い」と出す式を入れて H31 までコピーしてください。', cells: ['H2', 'H31'] },
      { title: 'まだの件数', body: 'K1 に、「未配布」の件数を COUNTIF で出してください。', cells: ['K1'] },
    ],
  },
  {
    id: 'jt-10', gid: 610, no: 'レッスン10', tab: '実務10', group: 'share', mins: 4, title: '見出しの固定と フィルタ表示', ...none, frozen: 0,
    goal: '見出しを固定し、ほかの人の画面を変えない「フィルタ表示」で 自分の見たい行だけを出す',
    grid: G10, vgrid: head(G10),
    slides: [
      K('依頼「問い合わせの管理表、未対応だけ見たい。でも みんなで同時に使ってるから 気をつけて」'),
      K('下へスクロールすると 見出しが消えて、どの列が何か分からなくなります。表示 → 固定 → 1行'),
      K('ふつうの「フィルタ」は、シートを開いている全員の画面が いっしょに変わります。共有の表で使うと 人の作業のじゃまになります'),
      K('自分だけに効くのが「フィルタ表示」。データ → フィルタ表示を作成（新しい画面では「フィルタ表示」→「新しいフィルタ表示を作成」）'),
      K('状態の列の ▼ で「未対応」だけにチェック。名前をつけて保存すれば、次からも すぐ呼び出せます', { range: 'E1:E6' }),
      K('件数は =COUNTIF(E2:E121,"未対応")。フィルタで見えている数を 目で数えるより確実です', { cell: 'H1', typed: '=COUNTIF(E2:E121,"未対応")' }),
      K('現場で喜ばれるところ：共有の表を勝手に絞り込まない人は、それだけで信頼されます'),
    ],
    steps: [
      { title: '見出しを固定', body: '表示 → 固定 → 1行 で、1行目の見出しを固定してください。', cells: ['A1'] },
      { title: 'フィルタ表示', body: 'データ → フィルタ表示を作成 で、状態（E 列）が「未対応」の行だけを出すフィルタ表示を作ってください。ふつうのフィルタは使いません。', cells: ['E1'] },
      { title: '未対応の件数', body: 'H1 に、未対応の件数を COUNTIF で出してください。', cells: ['H1'] },
    ],
  },
  {
    id: 'jt-11', gid: 611, no: 'レッスン11', tab: '実務11', group: 'share', mins: 6, title: 'プルダウンと 条件付き書式', ...none,
    goal: '状態をプルダウンで選ばせ、完了は灰色・対応中の行は黄色に 自動で色がつく表にする',
    grid: G11, vgrid: head(G11),
    slides: [
      K('依頼「チームのタスク表、みんな好き勝手に書くから『済』『done』『完了』がまざる。入力をそろえて、ひと目で分かるようにして」'),
      K('入力をそろえるのは プルダウン。D2:D21 を選んで データ → データの入力規則', { range: 'D2:D6' }),
      K('条件は「プルダウン」、項目は 未着手・対応中・完了。詳細オプションで「入力を拒否」にすると、ほかの字は入りません'),
      K('次は色。表示形式 → 条件付き書式。範囲 D2:D21・「次と完全に一致するテキスト」完了・背景を灰色'),
      K('行ごと塗るには カスタム数式。範囲を A2:D21 にして =$D2="対応中"、背景を黄色', { range: 'A2:D2' }),
      K('$D と列だけ固定するのがコツ。A列〜D列のどこでも「その行の D 列」を見るので、行全体に色がつきます'),
      K('現場で喜ばれるところ：入力がそろうと集計が一発で合い、色で 誰が見ても状況が分かる表になります'),
    ],
    steps: [
      { title: 'プルダウン', body: 'D2:D21 に、「未着手」「対応中」「完了」のプルダウンを付けてください。ほかの値は「入力を拒否」にします。', cells: ['D2', 'D21'] },
      { title: '完了を灰色', body: 'D2:D21 に、「完了」と完全に一致したら 背景が灰色になる条件付き書式を付けてください。', cells: ['D2', 'D21'] },
      { title: '対応中の行を黄色', body: 'A2:D21 に、カスタム数式 =$D2="対応中" で、行全体の背景が黄色になる条件付き書式を付けてください。', cells: ['A2', 'D21'] },
    ],
  },
  {
    id: 'jt-12', gid: 612, no: 'レッスン12', tab: '実務12', group: 'share', mins: 5, title: '並べ替え事故を防ぐ・式を守る', ...none,
    goal: '表ごと並べ替えて 行のずれを起こさない。式の列を保護して、うっかり消されないようにする',
    grid: G12, vgrid: head(G12),
    slides: [
      K('依頼「案件の一覧を 金額の大きい順に並べて。税込の列は式だから 壊さないでね」'),
      K('いちばん多い事故：金額の列だけ選んで並べ替え。金額だけが動いて、顧客との組み合わせが バラバラになります', { range: 'C2:C6' }),
      K('正しくは 表全体（A1:E31）を選んで、データ → 範囲を並べ替え。「データにヘッダー行が含まれている」にチェック', { range: 'A1:E6' }),
      K('並べ替える列は「金額」、順番は Z→A（大きい順）。行ごと動くので、組み合わせは くずれません'),
      K('もし失敗したら すぐ Ctrl＋Z。保存を待たずに戻せます', { keys: ['Ctrl', 'Z'] }),
      K('式の列は 保護しておきます。データ → シートと範囲を保護 → E2:E31 →「警告を表示」'),
      K('現場で喜ばれるところ：並べ替え事故は 気づかれずに広がるのが怖いところ。表ごと並べる・式を守る は、共有の表の基本です'),
    ],
    steps: [
      { title: '表ごと並べ替え', body: 'A1:E31 を選んで、データ → 範囲を並べ替え（ヘッダー行あり）で、金額の大きい順に並べ替えてください。', cells: ['A2', 'C2', 'E2'] },
      { title: '式の列を保護', body: 'データ → シートと範囲を保護 で、E2:E31 を保護してください（「警告を表示」で かまいません）。', cells: ['E2'] },
      { title: '税込の合計', body: 'H1 に、税込（E2:E31）の合計を出してください。', cells: ['H1'] },
    ],
  },
  {
    id: 'jt-13', gid: 613, no: 'レッスン13', tab: '実務13', group: 'report', mins: 6, title: 'ピボットと 報告の一文', ...none,
    goal: 'ピボットテーブルで部署ごとの件数を出し、「全◯件中、未対応は◯件です」を 式で作る',
    grid: G13, vgrid: head(G13),
    slides: [
      K('依頼「今月の問い合わせ、部署ごとに何件？ それと、未対応が何件あるか ひとことで教えて」'),
      K('部署ごとの件数は ピボットテーブル。表を選んで 挿入 → ピボットテーブル'),
      K('挿入先は「既存のシート」で、このタブの I1 を指定。別のシートに作ると、元の表と見比べにくくなります'),
      K('行に「部署」、値に「受付番号」（集計は COUNTA）。式を1つも書かずに、部署ごとの件数が出ます', { range: 'B2:B6' }),
      K('未対応の件数は =COUNTIF(D2:D151,"未対応")', { cell: 'G1', typed: '=COUNTIF(D2:D151,"未対応")' }),
      K('報告の一文も 式で。="全"&COUNTA(A2:A151)&"件中、未対応は"&G1&"件です"', { cell: 'G2', typed: '="全"&COUNTA(A2:A151)&"件中、未対応は"&G1&"件です"' }),
      K('式で作っておけば、データが増えても 数字は自動で変わります。チャットに そのまま貼れます'),
      K('現場で喜ばれるところ：報告は「全体の数」と「気になる数」をセットで。数字で言える人に、次の仕事が来ます'),
    ],
    steps: [
      { title: 'ピボット', body: '挿入 → ピボットテーブル で、範囲 A1:D151・挿入先「既存のシート」のこのタブの I1 に、行＝部署・値＝受付番号（COUNTA）のピボットテーブルを作ってください。', cells: ['I1'] },
      { title: '未対応の件数', body: 'G1 に、状態が「未対応」の件数を COUNTIF で出してください。', cells: ['G1'] },
      { title: '報告の一文', body: 'G2 に、「全150件中、未対応は◯件です」の文を 式で作ってください（件数は COUNTA と G1 を使い、数字を直接打たない）。', cells: ['G2'] },
    ],
  },
  {
    id: 'jt-ex', gid: 690, no: '修了テスト', tab: '実務テスト', group: 'exam', mins: 15, title: '現場から届いた表を 仕上げて報告する', ...none,
    goal: '動画なしで、汚い表を 直す → 重複を消す → 確かめる → 報告する まで通しでやる',
    grid: GX, vgrid: head(GX),
    slides: [],
    steps: [
      { title: '番号を半角に', body: '社員番号（A 列）の全角の英数字を、半角に直してください。作業用の列を使ったら、終わったら消します。', cells: ['A2', 'A101'] },
      { title: '名前の空白', body: '氏名（B 列）の 前後の空白と、間の余分な空白を消してください。', cells: ['B2', 'B101'] },
      { title: '重複を消す', body: '同じ社員番号の2回目以降の行を消してください。番号と名前を直してから消すと、見た目がちがう重複も見つかります。', cells: ['A2', 'A96'] },
      { title: '確かめる', body: 'E 列（チェック）に、残業時間が空か 80 より大きい行は「要確認」、それ以外は空になる式を入れてください。', cells: ['E2', 'E96'] },
      { title: '報告', body: 'H1 に、「全◯件中、要確認は◯件です」の文を 式で作ってください。', cells: ['H1'] },
    ],
  },
];
// レッスンの番号とタブ名は 並び順から付ける（あとから途中に足しても ずれない。答え合わせは タブの番号 gid で読むので、前に作られたタブの名前が古くても動く）
JT_QUESTS.forEach((q, i) => { if (q.group !== 'exam') { q.no = `レッスン${i + 1}`; q.tab = `実務${i + 1}`; } });
export const JT_LESSONS = JT_QUESTS.filter((q) => q.group !== 'exam');
export const JT_EXAM = JT_QUESTS.find((q) => q.group === 'exam')!;
export const jtById = (id: string) => JT_QUESTS.find((q) => q.id === id) || null;

// 修了テストに合格した人に出す「スキルシートに書ける一文」（営業が そのまま使える形）
export const JT_SKILL_LINE = 'Google スプレッドシートでのデータ整備（表記ゆれ・空白・全角の統一、文字列の日付変換、重複・欠損・異常値のチェック、2表の突き合わせ）と、入力規則・条件付き書式・保護を使った共有シートの運用、ピボットテーブルによる集計と報告';

// 受講ページに返す形（応用編と同じ）。open = 入れる人か（note = 入れない時のわけ）／quests = JT_QUESTS と同じ並び
export interface JitsumuState { open: boolean; note: string; quests: QuestProgress[] }
