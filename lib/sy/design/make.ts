import type { Box, Img, Line, Run, RunSt, Tbl } from './types';

// レッスンのスライドを書くための短い書き方（l1〜l3.ts が使う）
export const INK = '#1F2937';     // 本文の黒
export const SUB = '#6B7280';     // 補足のグレー
export const ACC = '#2563EB';     // メインの青
export const RED = '#DC2626';     // 強調の赤
export const PALE = '#DBEAFE';    // うすい青（箱の地）
export const GRAY = '#CBD5E1';    // 目立たせない棒・線
export const NSJ = 'Noto Sans JP';

type BoxOpt = Partial<Omit<Box, 'k' | 't' | 'x' | 'y' | 'w' | 'h' | 'text' | 'size'>>;
// 文字の箱
export const T = (k: string, x: number, y: number, w: number, h: number, text: string, size: number, o: BoxOpt = {}): Box => ({ k, t: 'box', x, y, w, h, text, size, color: INK, font: NSJ, ...o });
// 図形（四角・角丸・丸）。文字を入れるときは o.text / o.size
export const R = (k: string, x: number, y: number, w: number, h: number, fill: string, o: Partial<Omit<Box, 'k' | 't' | 'x' | 'y' | 'w' | 'h' | 'fill'>> = {}): Box => ({ k, t: 'box', shape: 'rect', x, y, w, h, fill, color: INK, font: NSJ, size: 14, va: 'mid', align: 'c', ...o });
export const LN = (k: string, x: number, y: number, w: number, h: number, o: Partial<Omit<Line, 'k' | 't' | 'x' | 'y' | 'w' | 'h'>> = {}): Line => ({ k, t: 'line', x, y, w, h, color: INK, weight: 1, ...o });
export const IMG = (k: string, x: number, y: number, w: number, h: number, src: string, ratio: number): Img => ({ k, t: 'img', x, y, w, h, src, ratio });
export const TB = (k: string, x: number, y: number, w: number, h: number, rows: string[][], o: Partial<Omit<Tbl, 'k' | 't' | 'x' | 'y' | 'w' | 'h' | 'rows'>> = {}): Tbl => ({ k, t: 'table', x, y, w, h, rows, size: 14, color: INK, font: NSJ, align: 'l', ...o });
// 文の中の ある言葉にだけ 書式をかける
export const rg = (text: string, word: string, st: RunSt): Run => { const a = text.indexOf(word); if (a < 0) throw new Error(`「${word}」が文に無い: ${text}`); return { a, b: a + word.length, ...st }; };
