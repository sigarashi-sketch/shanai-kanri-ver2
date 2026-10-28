// デザインリテラシー コース（2026-10-02 shoya）の型。画面とサーバの両方が使う。
//   スライドは 720×405pt（Google スライドの 16:9）。左上が (0,0)。大きさ・位置は pt
//   El   … レッスンで配るスライドの中身（最初の状態）。同じものから ①本人の Google スライドを作る ②画面のビフォーアフターの図を描く
//   NEl  … 答え合わせで見る形。本人のスライドを読んだ結果（lib/design/norm.ts）も、El から作ったもの（lib/design/check.ts specToN）も同じ形になる
export const PAGE_W = 720;
export const PAGE_H = 405;

export type Align = 'l' | 'c' | 'r' | 'j';
export interface RunSt { bold?: boolean; italic?: boolean; under?: boolean; color?: string; size?: number; font?: string }
export interface Run extends RunSt { a: number; b: number }   // 文字の範囲 [a, b) にだけ かける書式

export interface Box extends RunSt {
  k: string; t: 'box'; x: number; y: number; w: number; h: number;
  shape?: 'text' | 'rect' | 'round' | 'ellipse' | 'arrow';     // 省くと text（文字の箱）
  text?: string; align?: Align; lh?: number;                    // lh = 行間（100 = 1行ぶん）
  va?: 'top' | 'mid'; bullet?: boolean | 'num'; runs?: Run[];           // bullet: true = ●／'num' = 1. 2. 3.
  fill?: string; line?: string; lineW?: number;                 // 塗り・枠線の色（省くと無し）・枠線の太さ
}
export interface Line { k: string; t: 'line'; x: number; y: number; w: number; h: number; color?: string; weight?: number; arrow?: boolean }   // (x,y) から (x+w, y+h) へ
export interface Img { k: string; t: 'img'; x: number; y: number; w: number; h: number; src: string; ratio: number }   // ratio = もとの絵の 横÷縦
export interface CellSt extends RunSt { align?: Align; fill?: string }
export interface Tbl extends RunSt {
  k: string; t: 'table'; x: number; y: number; w: number; h: number; rows: string[][];
  align?: Align; cells?: Record<string, CellSt>;                // cells のキー: 'r,c'・'r,*'（行ぜんぶ）・'*,c'（列ぜんぶ）。あとに書いたものが勝つ
  vline?: boolean; border?: string; borderW?: number;           // vline = 中の縦線を出すか（省くと出す）
}
export type El = Box | Line | Img | Tbl;

// お手本（直したあとの姿）。ページごとに「どこを変えるか」だけ書く
export interface Patch { set?: Record<string, Partial<Box> | Partial<Line> | Partial<Img> | Partial<Tbl>>; del?: string[]; add?: El[]; notes?: string }

export interface NRun { text: string; size: number; bold: boolean; italic: boolean; under: boolean; font: string; color: string }
export interface NPara { text: string; align: Align; lh: number; bullet: boolean; num: boolean }   // num = 番号付きリスト
export interface NCell { text: string; runs: NRun[]; paras: NPara[]; fill: string }
export interface NEl {
  id: string; k: string; page: number;                          // k = 配ったときの名前（本人が足したものは ''）
  kind: 'box' | 'line' | 'img' | 'table' | 'other'; shape: string;
  x: number; y: number; w: number; h: number;
  text: string; runs: NRun[]; paras: NPara[];
  fill: string; line: string; lineW: number; arrow: boolean;   // fill / line は '' = 無し
  ratio: number;                                                // 絵: いま見えている 横÷縦
  cells: NCell[][]; vlines: number;                             // 表: セルと、見えている中の縦線の本数
}
export interface NPage { els: NEl[]; notes: string }

export interface Check { label: string; hint: string; test: (p: import('./check').P) => boolean }
export interface Step { do: string; ppt?: string }             // do = Google スライドでの操作／ppt = パワポでは
export interface Lesson {
  id: string; level: number; no: string; title: string; goal: string; minutes: number; boss?: boolean;
  point: string;                                                // ひとことで言うと
  why: string[];                                                // なぜ そうするのか（短い文）
  pages: El[][];                                                // 配るスライド（ふつうは1枚）
  fix: Patch[];                                                 // お手本（ページごと）
  steps: Step[];
  tips?: string[];                                              // 採点しない おまけ（スライドマスターなど）
  checks: Check[];
}
export interface Level { id: string; name: string; theme: string; sub: string; lessons: Lesson[] }
