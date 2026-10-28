// MOS コース（Excel 365 一般レベル・2026-10-09 shoya）の型。画面とサーバの両方が使う。
//   ★正解の条件（checks の test）は サーバだけが使う。画面には 文（label・hint）だけ出す（lib/mos/index.ts の publicLesson）
//   ・練習は 本人のパソコンの Excel（本物）。サーバは「最初のファイル」を作って配り（lib/mos/write.ts）、本人が保存したファイルを読んで採点する（lib/mos/read.ts）
//   ・Excel の版（365／2021／2019／2016）と Windows／Mac は 人で違う。手順は「タブ → グループ → ボタンの名前」で書き、違う所だけ書き分ける（How）
import type { Bk } from './check';

export type Os = 'win' | 'mac';
export type Ver = '365' | '2021' | '2019' | '2016';
export interface Env { os: Os; ver: Ver }
export const VERS: { id: Ver; name: string }[] = [{ id: '365', name: 'Microsoft 365' }, { id: '2021', name: 'Excel 2021 / 2024' }, { id: '2019', name: 'Excel 2019' }, { id: '2016', name: 'Excel 2016' }];
// SORT・UNIQUE・SEQUENCE などの「スピル」する関数が使えるのは 365 と 2021 以降
export const hasDyn = (e: Env) => e.ver === '365' || e.ver === '2021';

// ── 配るファイルの中身（最初の状態） ──
export interface St { b?: boolean; i?: boolean; fmt?: string; fill?: string; color?: string; h?: 'left' | 'center' | 'right'; wrap?: boolean; border?: boolean; sz?: number }
export type CellV = string | number | null;   // '=' で始まる文字は数式
export interface ChartSpec { type: 'col' | 'bar' | 'line' | 'pie'; title?: string; cats: string; series: { name: string; vals: string }[]; anchor: [number, number, number, number]; legend?: 'r' | 'b' | 't' | 'none' }   // anchor = [左の列, 上の行, 右の列, 下の行]（1始まり）。cats・name・vals は 'シート名!$A$2:$A$6' の形
export interface SheetSpec {
  name: string; grid: CellV[][];
  widths?: Record<string, number>;        // 列幅 { A: 14 }
  styles?: Record<string, St>;            // 'A1:E1': { b: true, fill: 'DDEBF7' }（あとに書いたものが上書き）
  merges?: string[]; freeze?: { rows: number; cols: number };
  table?: { name: string; ref: string; style?: string };   // ref の1行目が見出し（文字であること）
  charts?: ChartSpec[];
  cf?: { ref: string; op: 'greaterThan' | 'lessThan' | 'equal' | 'between'; val: string; fill: string }[];
  links?: { ref: string; url: string }[];
  tabColor?: string; landscape?: boolean;
}
export interface BookSpec { sheets: SheetSpec[]; names?: Record<string, string>; props?: Partial<Record<'title' | 'subject' | 'creator' | 'keywords' | 'category' | 'description', string>>; extra?: { name: string; text: string }[] }   // extra = いっしょに配る テキスト／CSV（インポートの練習用）
// 日付（Excel の通し番号）。styles で fmt: 'yyyy/m/d' を付けて使う
export const D = (y: number, m: number, d: number) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);

// ── 手順 ──
//   1行＝1つの動き。文の中の記号: [ホーム] ＝ 押す所（タブ・ボタン・項目の名前）／ <Ctrl+T> ＝ キー ／ {A3:E20} ＝ セルや範囲 ／ 「…」はそのまま
//   Windows と Mac で違う時は { win, mac }、古い版で違う時は v に書く（v は その版の人にだけ 差し替えて出す）
export type HowLine = string | { win: string; mac: string; v?: Partial<Record<Ver, string>> };
export interface Check { label: string; hint: string; test: (b: Bk) => boolean }   // label = できた／まだ の横に出す文、hint = まだ の時に出す ひとこと
export interface Quiz { q: string; options: string[]; answer: number; why: string }   // ファイルでは採点できない所（クイック アクセス ツール バー など）は 選ぶ問題にする
export interface Task {
  title: string;
  ask: string;                 // 試験ふうの問題文（本番と同じ言い回し。これだけで解けるのが目標）
  how: HowLine[];              // やりかた（1つずつ）
  search?: string;             // 見つからない時に 検索ボックスへ打つ言葉
  why?: string;                // 何のための機能か（ひとこと）
  trap?: string;               // 本番で ひっかかりやすい所
  dyn?: boolean;               // 365／2021 以降でしか できない（古い版の人には quiz を出す）
  quiz?: Quiz;                 // これがあって checks が空なら 選ぶ問題
  checks: Check[];
}
export interface Enemy { name: string; body: string; boss?: boolean }
export interface Lesson {
  id: string; no: string; title: string; goal: string; obj: string;      // obj = 出題範囲の項目名
  place: string; enemy: Enemy;                                            // ゲーム風の場所と敵
  minutes: number; boss?: boolean;                                        // boss = ノーヒントの復習（やりかたを 最初は たたんで出す）
  book: BookSpec; tasks: Task[];
}
export interface World { id: string; title: string; sub: string; share?: string; lessons: Lesson[] }   // share = 試験での出題の割合

// ── 模擬試験 ──
export interface MockTask { ask: string; obj: number; lesson: string; checks: Check[] }   // obj = 分野（1〜5）、lesson = まちがえた時に戻るレッスンの id
export interface MockProject { id: string; title: string; intro: string; book: BookSpec; tasks: MockTask[] }
export interface MockSet { id: string; title: string; projects: MockProject[] }
// 配るファイルの名前（サーバが付ける名前と、練習フォルダに置く・読む時の名前を そろえる）。レッスンは no（'2-1'）、模擬は 'セットid_プロジェクトid'
export const mosFile = (id: string) => `bdsh_MOS_${id}.xlsx`;
export const lessonFile = (l: { id: string; no: string }) => mosFile(l.no.replace(/[^0-9A-Za-z-]/g, '') || l.id);
export const MOCK_MINUTES = 50;
export const MOCK_PASS = 700;      // 本番の合格の目安
export const MOCK_READY = 800;     // 「受けていい」の線。2回つづけて これ以上で 本番へ
export const DOMAINS = ['ワークシートやブックの管理', 'セルやセル範囲のデータの管理', 'テーブルとテーブルのデータの管理', '数式や関数を使用した演算の実行', 'グラフの管理'];

// ── 画面に返す形 ──
export interface PubTask { title: string; ask: string; how: HowLine[]; search?: string; why?: string; trap?: string; dyn?: boolean; quiz?: { q: string; options: string[] }; checks: { label: string; hint: string }[] }
export interface PubLesson { id: string; no: string; title: string; goal: string; obj: string; place: string; enemy: Enemy; minutes: number; boss: boolean; sheets: string[]; extra: string[]; tasks: PubTask[] }
export interface LessonState { id: string; open: boolean; cleared: boolean; done: number[] }
export interface MockRun { set: string; at: string; score: number; byDomain: { ok: number; total: number }[] }
export interface MosState { open: boolean; note: string; name: string; env: Env | null; all: boolean; worlds: { id: string; title: string; sub: string; share?: string; lessons: PubLesson[] }[]; lessons: LessonState[]; mocks: { id: string; title: string; projects: { id: string; title: string; intro: string; tasks: string[] }[] }[]; runs: MockRun[]; mockOpen: boolean; ready: boolean; live: { set: string; startedAt: string; submitted: string[] } | null }
