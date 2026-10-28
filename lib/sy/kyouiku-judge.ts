import 'server-only';
import { EXAM, QUESTS, type Quest } from './kyouiku-lessons';

// 教育コンテンツの答え合わせ（サーバだけ）。正解はここにしか書かない（スプシのスクリプトにもブラウザにも出さない）。
//   値で正誤を決める（全員が同じデータなので答えは1つ）。数式は「学んでほしい書き方か」を見て、足りなければヒント。
//   must … 満たさないと不正解（例: クエスト3の「$で固定」）／ hint … 正解だけど一言そえる
//   want の見方: value＝数字／text＝文字（全角半角・空白のちがいは気にしない）／empty＝空になっていること／today＝今日の日付
//   wrongHint … 値がちがう時に出す ひとこと（無ければ いつもの「見直してみましょう」）。応用編（lib/oyo/judge.ts）が使う
export interface Want { cell: string; value?: number; text?: string; empty?: true; today?: true }
export interface Rule { cell: string; re: RegExp; msg: string }
export interface StepJudge { want: Want[]; must?: Rule[]; hint?: Rule[]; wrongHint?: string }

export const V = (cell: string, value: number): Want => ({ cell, value });
export const S = (cell: string, text: string): Want => ({ cell, text });
const FORMULA = (cell: string, msg = '数字や文字を直接打つのではなく、「=」から始まる数式で出しましょう'): Rule => ({ cell, re: /^=/, msg });

const J: Record<string, StepJudge[]> = {
  // ---- ワールド0（キーボードとセルの基本）: 操作そのものは見えないので、結果のセルで判定する
  'w0-0': [
    { want: [S('B2', 'りんご')] },
    { want: [V('C2', 3), V('D2', 120)] },
    { want: [S('B3', 'みかん'), V('C3', 5), V('D3', 80)] },
  ],
  'w0-1': [
    { want: [{ cell: 'D2', empty: true }] },
    { want: [S('A2', 'りんご')] },
    { want: [V('C4', 200)] },
  ],
  'w0-2': [
    { want: [S('A2', '東京支店'), S('A3', '東京支店'), S('A4', '東京支店')] },
    { want: [{ cell: 'D2', empty: true }, S('F2', '要確認')] },
    { want: [V('B6', 360), V('D6', 360)], must: [
      FORMULA('B6', 'B6 には =120*3 と、「=」から始まる数式で入力しましょう'),
      { cell: 'D6', re: /^$/, msg: 'D6 に数式ごと貼り付いています。D6 を消して、Ctrl + Shift + V（値だけ貼り付け）で貼り直しましょう' },
    ] },
  ],
  'w0-3': [
    { want: [V('A2', 1), V('A3', 2), V('A4', 3), V('A5', 4), V('A6', 5)] },
    { want: ['C2', 'C3', 'C4', 'C5', 'C6'].map((c) => S(c, '出勤')) },
    { want: [{ cell: 'F1', today: true }] },
  ],
  // ---- ワールド1（スプシの基本）
  'w1-0': [
    { want: [{ cell: 'D2', value: 1200 }], must: [{ cell: 'D2', re: /^=/, msg: '数字を直接打つのではなく、「=」から始まる数式で出してみましょう' }], hint: [{ cell: 'D2', re: /\*/, msg: 'かけ算は「*」を使うと、単価や数量が変わっても自動で計算し直されます' }] },
    { want: [{ cell: 'D2', value: 1200 }, { cell: 'D3', value: 900 }, { cell: 'D4', value: 1000 }], must: [{ cell: 'D4', re: /^=/, msg: 'D3・D4 も数式で出しましょう（D2 をコピーすると早いです）' }] },
    { want: [{ cell: 'D5', value: 3100 }], hint: [{ cell: 'D5', re: /SUM\(/i, msg: '合計は =SUM(D2:D4) のように SUM を使うと、行が増えても楽です' }] },
  ],
  'w1-1': [
    { want: [{ cell: 'D2', value: 156000 }], must: [{ cell: 'D2', re: /^=/, msg: '「=」から始まる数式で出してみましょう' }] },
    { want: [{ cell: 'D2', value: 156000 }, { cell: 'D3', value: 120000 }, { cell: 'D4', value: 112000 }, { cell: 'D5', value: 135200 }], must: [{ cell: 'D5', re: /B5\s*\*\s*C5|C5\s*\*\s*B5/i, msg: 'D5 の数式が D2 のコピーになっていないようです。D2 を選んで右下の四角を D5 までドラッグしてみましょう' }] },
    { want: [{ cell: 'D6', value: 523200 }], hint: [{ cell: 'D6', re: /SUM\(/i, msg: '=SUM(D2:D5) でも出せます' }] },
  ],
  'w1-2': [
    { want: [{ cell: 'C2', value: 3520 }], must: [{ cell: 'C2', re: /\$F\$?1|F\$1/i, msg: '答えは合っています。ただ、このまま下にコピーすると F1 がずれます。F1 に $ をつけて $F$1 にしましょう' }] },
    { want: [{ cell: 'C2', value: 3520 }, { cell: 'C3', value: 14080 }, { cell: 'C4', value: 1078 }, { cell: 'C5', value: 495 }] },
    { want: [{ cell: 'C6', value: 19173 }] },
  ],
  'w1-3': [
    { want: [{ cell: 'G2', value: 1940 }], hint: [{ cell: 'G2', re: /SUMIF\(/i, msg: '正解！SUMIF を使うと、行が増えても条件で自動に足してくれます' }] },
    { want: [{ cell: 'G2', value: 1940 }], must: [
      { cell: 'G2', re: /SUMIF\(/i, msg: 'SUMIF を使って出しましょう' },
      { cell: 'G2', re: /\$B\$2:\$B\$7/i, msg: '範囲（部署の列）を $B$2:$B$7 のように $ で固定しましょう' },
      { cell: 'G2', re: /\$D\$2:\$D\$7/i, msg: '合計範囲（金額の列）も $D$2:$D$7 のように $ で固定しましょう' },
    ] },
    { want: [{ cell: 'G2', value: 1940 }, { cell: 'G3', value: 580 }, { cell: 'G4', value: 590 }] },
  ],
  // ---- ワールド2（実践）
  'w2-0': [
    { want: [S('C2', 'OK')], must: [
      { cell: 'C2', re: /IF\(/i, msg: 'IF 関数を使って出しましょう。=IF(条件, 合うとき, 合わないとき)' },
      { cell: 'C2', re: /\$F\$?1|F\$1/i, msg: '答えは合っています。ただ、このまま下にコピーすると F1 がずれます。$F$1 と $ で固定しましょう' },
    ] },
    { want: [S('C2', 'OK'), S('C3', '不足'), S('C4', 'OK'), S('C5', 'OK'), S('C6', '不足')], must: [{ cell: 'C6', re: /IF\(/i, msg: 'C3〜C6 も数式で出しましょう（C2 をコピーすると早いです）' }] },
    { want: [V('F3', 2)], must: [{ cell: 'F3', re: /COUNTIF\(/i, msg: 'COUNTIF を使って数えましょう。=COUNTIF(範囲, "不足")' }] },
  ],
  'w2-1': [
    { want: [V('E2', 80.4)], must: [{ cell: 'E2', re: /AVERAGE\(/i, msg: 'AVERAGE を使って出しましょう' }] },
    { want: [V('E3', 91), V('E4', 67)], must: [{ cell: 'E3', re: /MAX\(/i, msg: 'E3 は MAX を使って出しましょう' }, { cell: 'E4', re: /MIN\(/i, msg: 'E4 は MIN を使って出しましょう' }] },
    { want: [V('E5', 5), V('E6', 3)], must: [{ cell: 'E5', re: /COUNT\(/i, msg: 'E5 は COUNT を使って数えましょう' }, { cell: 'E6', re: /COUNTIF\(/i, msg: 'E6 は COUNTIF を使って数えましょう。条件は ">=80"' }] },
  ],
  'w2-2': [
    { want: [S('F2', '高橋')], must: [
      { cell: 'F2', re: /VLOOKUP\(/i, msg: 'VLOOKUP を使って出しましょう' },
      { cell: 'F2', re: /\$A\$2:\$C\$5/i, msg: '探す表を $A$2:$C$5 のように $ で固定しましょう（コピーしてもずれません）' },
    ], hint: [{ cell: 'F2', re: /(FALSE|0)\s*\)\s*$/i, msg: '正解！最後に FALSE を入れると「ぴったり同じ番号だけ」を探すので安全です' }] },
    { want: [V('G2', 3500)], must: [{ cell: 'G2', re: /VLOOKUP\(/i, msg: 'VLOOKUP を使って出しましょう（列番号は 3）' }] },
    { want: [S('F2', '高橋'), V('G2', 3500), S('F3', '佐藤'), V('G3', 3200), S('F4', '田中'), V('G4', 3000)], must: [{ cell: 'G4', re: /VLOOKUP\(/i, msg: '3行目・4行目も VLOOKUP で出しましょう（F2 と G2 をコピーすると早いです）' }] },
  ],
  'w2-3': [
    { want: [V('E2', 8), V('E3', 10.5), V('E4', 8), V('E5', 7.5)], must: [FORMULA('E5', 'E2〜E5 は「=」から始まる数式で出しましょう（=C2-B2-D2）')] },
    { want: [V('F2', 0), V('F3', 2.5), V('F4', 0), V('F5', 0)], must: [
      { cell: 'F3', re: /IF\(|MAX\(/i, msg: 'IF を使って「超えた分だけ」を出しましょう。=IF(E2>$H$1, E2-$H$1, 0)' },
      { cell: 'F3', re: /\$H\$?1|H\$1/i, msg: '所定時間の H1 を $H$1 と $ で固定しましょう（コピーしてもずれません）' },
    ] },
    { want: [V('E6', 34), V('F6', 2.5)], hint: [{ cell: 'E6', re: /SUM\(/i, msg: '合計は SUM を使うと、行が増えても楽です' }] },
  ],
  // ---- ワールド3（現場編＝経理事務）
  'w3-0': [
    { want: [V('D2', 37500), V('D3', 4380), V('D4', 13993)], must: [FORMULA('D4', 'D2〜D4 は「=」から始まる数式で出しましょう（=B2*C2 を下にコピー）')] },
    { want: [V('D5', 55873), V('D6', 5587)], must: [
      FORMULA('D5', 'D5 の小計は SUM で出しましょう。=SUM(D2:D4)'),
      { cell: 'D6', re: /ROUNDDOWN\(|INT\(|TRUNC\(/i, msg: '消費税は ROUNDDOWN で1円未満を切り捨てましょう。=ROUNDDOWN(D5*$G$1,0)' },
    ] },
    { want: [V('D7', 61460)], must: [FORMULA('D7', 'D7 は「=」から始まる数式で出しましょう（=D5+D6）')] },
  ],
  'w3-1': [
    { want: [V('F2', 21200)], must: [{ cell: 'F2', re: /SUMIFS\(/i, msg: 'SUMIFS を使って出しましょう。=SUMIFS(合計する範囲, 範囲1, 条件1, 範囲2, 条件2)' }] },
    { want: [V('F2', 21200), V('G2', 1650), V('H2', 5500), V('F3', 2260), V('G3', 11000), V('H3', 0)], must: [{ cell: 'H3', re: /SUMIFS\(/i, msg: '6マスとも SUMIFS で出しましょう。F2 の範囲を $ で固定し、条件を $E2・F$1 の形にするとコピーできます' }] },
    { want: [V('F4', 23460), V('G4', 12650), V('H4', 5500)], hint: [{ cell: 'F4', re: /SUM\(/i, msg: '合計は SUM を使うと楽です' }] },
  ],
  'w3-2': [
    { want: [V('C2', 55000), V('C3', 0), V('C4', 33000), V('C5', 80000)], must: [
      { cell: 'C3', re: /VLOOKUP\(/i, msg: 'VLOOKUP を使って入金額を出しましょう（C2 を下にコピーします。表を $G$2:$H$4 と $ で固定しておくとずれません）' },
      { cell: 'C3', re: /IFERROR\(/i, msg: 'VLOOKUP を IFERROR で包み、入金が無いときは 0 と出るようにしましょう。=IFERROR(VLOOKUP(…),0)' },
    ] },
    { want: [V('D2', 0), V('D3', 120000), V('D4', 0), V('D5', 8000)], must: [FORMULA('D5', 'D2〜D5 は「=」から始まる数式で出しましょう（=B2-C2 を下にコピー）')] },
    { want: [S('E2', '消込済'), S('E3', '要確認'), S('E4', '消込済'), S('E5', '要確認')], must: [{ cell: 'E5', re: /IF\(/i, msg: 'IF を使った数式で出しましょう。=IF(D2=0,"消込済","要確認")' }] },
  ],
  'w3-3': [
    { want: [V('D2', 0), V('D3', 65000), V('D4', 88000), V('D5', 0), V('D6', 5000), S('E2', '回収済'), S('E3', '未回収'), S('E4', '未回収'), S('E5', '回収済'), S('E6', '未回収')], must: [
      FORMULA('D6', '残高は「=」から始まる数式で出しましょう（=B2-C2 を下にコピー）'),
      { cell: 'E6', re: /IF\(/i, msg: '状態は IF を使った数式で出しましょう。=IF(D2=0,"回収済","未回収")' },
    ] },
    { want: [V('H2', 3), V('H3', 158000)], must: [{ cell: 'H2', re: /COUNTIF/i, msg: 'H2 は COUNTIF を使って数えましょう。=COUNTIF(E2:E6,"未回収")' }, { cell: 'H3', re: /SUM/i, msg: 'H3 は SUMIF を使って出しましょう。=SUMIF(E2:E6,"未回収",D2:D6)' }] },
    { want: [V('H4', 0.8159)], must: [{ cell: 'H4', re: /^=.*\//, msg: 'H4 は割り算の数式で出しましょう。=SUM(C2:C6)/SUM(B2:B6)' }] },
  ],
  // ---- 修了テスト（さいごの しれん）。数字を直接打っただけでは通さない（must）。ヒントの文は 受講ページには返さない（API が ○× と セルの場所だけ返す）
  exam: [
    { want: [V('E2', 196000), V('E3', 120000), V('E4', 52000), V('E5', 28000), V('E6', 98000), V('E7', 72000)], must: [{ cell: 'E2', re: /^=.*\*/, msg: '' }, { cell: 'E7', re: /^=.*\*/, msg: '' }] },
    { want: [V('E8', 566000)], must: [{ cell: 'E8', re: /SUM\(/i, msg: '' }] },
    { want: [V('H2', 248000), V('H3', 218000), V('H4', 100000)], must: [{ cell: 'H2', re: /SUMIFS?\(/i, msg: '' }, { cell: 'H4', re: /SUMIFS?\(.*\$/i, msg: '' }] },
    { want: [V('H7', 622600)], must: [{ cell: 'H7', re: /^=.*\$?H\$?6/i, msg: '' }] },
    { want: [S('H9', '達成')], must: [{ cell: 'H9', re: /IFS?\(/i, msg: '' }] },
    { want: [V('H10', 2)], must: [{ cell: 'H10', re: /COUNTIFS?\(/i, msg: '' }] },
  ],
};

export interface CellIn { v: unknown; f: string }
export interface JudgeResult { ok: boolean; msg: string; hint: string; wrong: string[] }

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').normalize('NFKC').replace(/[,¥￥円\s]/g, '');   // 全角の数字で打っても数として見る
  return s && !isNaN(Number(s)) ? Number(s) : null;
};

const txt = (v: unknown) => String(v ?? '').normalize('NFKC').replace(/\s+/g, '');
// 今日の日付か（スプシの日付は 1899-12-30 からの日数。日本時間で、前後1日のずれは許す）
const isToday = (v: unknown): boolean => {
  const today = Math.floor((Date.now() + 9 * 3600e3) / 86400e3) + 25569;
  if (typeof v === 'number') return Math.abs(Math.floor(v) - today) <= 1;
  const d = new Date(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)); const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(txt(v));
  return !!m && Math.abs(Date.UTC(+m[1], +m[2] - 1, +m[3]) - d.getTime()) <= 86400e3;
};

export function stepCount(q: Quest) { return (J[q.id] || []).length; }

export function judge(questId: string, step: number, cells: Record<string, CellIn>): JudgeResult { return judgeStep(J[questId]?.[step], cells); }
// 1ステップぶんの判定（正解の定義を渡す）。応用編は 自分の定義を渡して これを呼ぶ
export function judgeStep(sj: StepJudge | undefined, cells: Record<string, CellIn>): JudgeResult {
  if (!sj) return { ok: false, msg: 'この問題が見つかりません', hint: '', wrong: [] };
  const get = (a: string) => cells[a] || cells[a.toUpperCase()] || { v: '', f: '' };
  const bad = (w: Want) => {
    const v = get(w.cell).v;
    if (w.empty) return txt(v) !== '';
    if (w.today) return !isToday(v);
    if (w.text !== undefined) return txt(v) !== txt(w.text);
    const n = num(v); return n === null || Math.abs(n - (w.value ?? 0)) > 0.01;
  };
  const wrongW = sj.want.filter(bad); const wrong = wrongW.map((w) => w.cell);
  // 「消す」問題で、まだ中身が残っている
  const left = wrongW.filter((w) => w.empty).map((w) => w.cell);
  if (!sj.wrongHint && left.length && left.length === wrong.length) return { ok: false, wrong, msg: `${left.join('・')} にまだ中身が残っています`, hint: 'セルを選んで Delete キーで消しましょう（切り取りなら Ctrl + X）' };
  if (wrong.length) {
    const empty = wrong.filter((c) => String(get(c).v ?? '') === '');
    return {
      ok: false, wrong,
      msg: empty.length === wrong.length ? `${empty.join('・')} がまだ空です` : `${wrong.join('・')} の答えが違うようです`,
      hint: sj.wrongHint || '入力した内容をもう一度見直してみましょう。動画をもう一度見るのもおすすめです',
    };
  }
  for (const r of sj.must || []) if (!r.re.test(get(r.cell).f || '')) return { ok: false, msg: '惜しい！', hint: r.msg, wrong: [r.cell] };
  const h = (sj.hint || []).find((r) => !r.re.test(get(r.cell).f || ''));
  return { ok: true, msg: '正解！', hint: h ? h.msg : '', wrong: [] };
}

// 練習シートのどのタブを見るか（スプシ側はこの名前のタブを読んで送ってくる）
export const TAB_OF = Object.fromEntries([...QUESTS, EXAM].map((q) => [q.id, q.tab]));
