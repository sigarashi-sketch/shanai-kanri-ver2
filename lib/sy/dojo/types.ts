import type { Cell } from './engine';

// 関数道場（2026-10-11 shoya・見本8案から「8 以外ぜんぶ」「段階でつけちゃおう 最高7段」）の、画面とサーバで共通の形。
//   ・カード = 関数1つ。その関数の問題3つに 全部正解すると 手に入る（1）
//   ・稽古 = 組手（10本・2）／依頼（関数名を教えない・4）／こわれた式を直す（5）／早打ち（60秒・6）／逆引き（4択・7）
//   ・段 = 初段〜七段（3）。昇段審査は 8問・6問以上で合格。前の段に受かっていないと 次は受けられない
//   式は 画面の中の小さい表で計算する（lib/dojo/engine.ts）。答え合わせは サーバ（正解は lib/dojo/bank.ts＝サーバだけ）
export const DOJO_LIVE = true;   // 2026-10-11 shoya「元栓あけて全員に出して」。false にすると super admin だけ
export const DOJO_PREFIX = '_dojo:';
export const DAN_MAX = 7;
export const DAN_NAMES = ['無段', '初段', '二段', '三段', '四段', '五段', '六段', '七段'] as const;
export const BELTS = ['#E9ECEF', '#F2C94C', '#F2994A', '#27AE60', '#2D9CDB', '#9B51E0', '#8D5524', '#1B1B1F'] as const;   // 段ごとの帯の色（無段＝白）
export const EXAM_PASS = 6; export const EXAM_SIZE = 8;
export const SPEED_SEC = 60; export const KUMITE_SIZE = 10; export const REV_SIZE = 10;
export type QKind = 'card' | 'req' | 'fix';
export interface PubQ { id: string; kind: QKind; fn: string; dan: number; grid: string; target: string; prompt: string; from?: string }   // grid = 表の名前（DojoData.grids のキー）／from = 依頼の差出人
export interface PubCard { fn: string; dan: number; use: string; form: string; trap: string; qs: string[] }
export interface PubRev { id: string; q: string; choices: string[] }
export interface DojoData { grids: Record<string, Cell[][]>; cards: PubCard[]; qs: PubQ[]; rev: PubRev[]; exams: Record<number, string[]> }
export interface DojoState { open: boolean; note: string; dan: number; okQ: string[]; cards: string[]; cardTotal: number; best: { speed: number; rev: number; kumite: number } }
