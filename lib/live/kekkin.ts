// 欠勤管理：今の社内システムの形 → この画面の型。
//   読むのは GET /api/roster?op=kekkin&action=list&month=YYYY-MM（その月の欠勤＝LINE の欠勤連絡＋手で足した行・1人1日1行）。
//   ★今のシステムの欠勤管理は「欠勤の日」だけを並べる（遅刻・後日の相談などは載らない）。連絡の本文・現場への連絡の印は持っていない
//   ★氏名が引けなかった連絡は誰の欠勤か決められないので載らない（件数 unresolved だけ）
import type { Absence } from '@/lib/types/roumu';

export type IkeKekkinRow = {
  date: string; nn: string; name: string; tantou: string; contact: boolean; manual: boolean; id: string;
  reason: string; note: string; evidence: { path: string; name: string; size: number; at: string }[]; updatedBy: string; updatedAt: string;
};
export type IkeKekkin = { ok: boolean; error?: string; month: string; today: string; reasons: string[]; ruleStart: string; rows: IkeKekkinRow[]; unresolved: number };

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const dayLabel = (d: string) => { const t = new Date(d + 'T00:00:00Z'); return `${t.getUTCMonth() + 1}/${t.getUTCDate()}（${DOW[t.getUTCDay()]}）`; };
export const kekkinDay = (d: string) => dayLabel(d);

export const ymOfOffset = (back: number) => { const j = new Date(Date.now() + 9 * 3600_000); const d = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth() - back, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
export const monthLabel = (ym: string) => `${Number(ym.slice(5))}月`;

/** 欠勤の行 → 画面の行。回数の数え方（ルール欠勤）は ruleStart 以降の日だけ */
export function kekkinFromIke(k: IkeKekkin | null, label: string): (Absence & { evidence: number; beforeRule: boolean })[] {
  return (k?.rows || []).map((r) => ({
    id: `${r.date}|${r.nn}`, personId: r.nn, name: r.name, site: r.manual ? '手で追加した欠勤' : 'LINE の欠勤連絡から', sales: r.tantou || '未設定',
    month: label as Absence['month'], day: dayLabel(r.date), at: r.updatedAt ? `理由を入れた人 ${r.updatedBy || '—'}` : '—',
    route: r.contact ? 'LINEの欠勤連絡' : '手で追加',
    text: r.note || (r.contact ? '（連絡の本文は欠勤管理には残していません。チャットで確かめてください）' : '（手で追加した欠勤）'),
    kind: '欠勤', reason: r.reason || '未分類', siteNotified: true,
    evidence: r.evidence.length, beforeRule: !!k?.ruleStart && r.date < k.ruleStart,
  }));
}

// 書くときの決まり（今のシステム api/_kekkin.ts と同じ値）
export const KEKKIN_NOTE_MAX = 200;
export const EVIDENCE_MAX = 10;
export const EVIDENCE_MAX_BYTES = 25 * 1024 * 1024;
export const EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
