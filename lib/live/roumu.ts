'use client';

import { useMemo } from 'react';
import { useIke } from '@/components/Live';
import { postLive } from '@/lib/live/post';

// 労務の画面（/roumu/*）の「印」と、今のシステムの口 roster?op=roumu（0370・10-26）の型と道具。
//   読む: useIke('roster?op=roumu&action=…')（GET は SELECT だけ）／書く: POST /api/live/roumu（決め打ちの行き先）
//   ★値は選択肢だけ（今のシステム api/_roumu_v2.ts の MARK_KINDS と同じ値。サーバでも確かめる）
import { MARK_CHOICES } from '@/lib/live/roumu-const';
export { MARK_CHOICES };
export type MarkKind = keyof typeof MARK_CHOICES | 'nudge-punch' | 'nudge-depcall' | 'nudge-shift';
export type Mark = { kind: MarkKind; key: string; nn: string; ym: string; value: string; note: string; updated_by: string; updated_at: string };
export type MarksRes = { ok: boolean; rows: Mark[]; error?: string };

export const nnOf = (s: string) => String(s || '').replace(/[\s　]+/g, '').replace(/(さん|サン|様|君|くん)$/, '');

/** 印を読む（種類と月で）。get(kind, key) で1つ引ける */
export function useMarks(kinds: MarkKind[], ym?: string, enabled = true) {
  const q = useIke<MarksRes>(enabled ? `roster?op=roumu&action=marks&kinds=${kinds.join(',')}${ym ? `&ym=${ym}` : ''}` : null);
  const map = useMemo(() => new Map((q.data?.ok ? q.data.rows : []).map((r) => [`${r.kind}#${r.key}`, r])), [q.data]);
  return { ...q, get: (kind: MarkKind, key: string) => map.get(`${kind}#${key}`), rows: q.data?.rows || [] };
}

/** 印を付ける（value=''で外す） */
export function setMark(kind: MarkKind, key: string, value: string, extra?: { nn?: string; ym?: string; note?: string }) {
  return postLive<{ row?: Mark; removed?: boolean }>('/api/live/roumu', { action: 'mark', kind, key, value, ...extra });
}

/** 本人に促す（LINE）。今のシステムが既定で送らない設定（mode=on のときだけ送る）。送らなくても「促した」の印は残る */
export type NudgeRes = { mode: 'on' | 'dry'; results: { nn: string; sent: boolean; reason?: string }[] };
export function nudge(kind: 'punch' | 'depcall' | 'shift', date: string, people: { nn: string; name?: string }[]) {
  return postLive<NudgeRes>('/api/live/roumu', { action: 'nudge', kind, date, people: people.map((p) => ({ nn: p.nn })) });
}
export const nudgeSub = (r: NudgeRes) => (r.mode === 'on'
  ? `→ LINE で送りました（${r.results.filter((x) => x.sent).length}人${r.results.some((x) => !x.sent) ? `・送れなかった ${r.results.filter((x) => !x.sent).length}人` : ''}）`
  : '→ 促した印を残しました（LINE の送信はいま止めています。送るのは管理者が設定で ON にしてから）');

// ---- 出発報告 ----
export type DepState = 'departed' | 'waiting' | 'missing' | 'off' | 'over';
export type IkeDepCall = { ok: boolean; date: string; nowJst: string; rows: { nn: string; name: string; start: string; deadline: string; startSource: string; state: DepState }[]; error?: string };

// ---- 勤怠連絡 ----
export type IkeContact = { id: string; date: string; nn: string; name: string; tantou: string; kind: 'absent' | 'late' | 'early' | 'future' | 'unknown'; source: string; at: string; text: string };
export type IkeContacts = { ok: boolean; month: string; rows: IkeContact[]; error?: string };
export const CONTACT_KIND_LABEL: Record<IkeContact['kind'], string> = { absent: '欠勤', late: '遅刻', early: '遅刻', future: '後日の相談', unknown: '未確認' };

// ---- 締めの前のやること ----
export type IkeShimeTodo = { ok: boolean; ym: string; rows: { key: string; name: string; noPunchDays: number; noPunchDates: string[]; sheetKnown: boolean; otH: number | null; excessH: number | null }[]; error?: string };
export type IkeShimeUnread = { ok: boolean; ym: string; rows: { key: string; name: string; why: string; files: number }[] };

// ---- 36協定・有給 ----
export type IkeOvertime = {
  ok: boolean; through: string; startMonth: number; error?: string;
  rows: { nn: string; name: string; kubun: string; linked: boolean; months: number;
    ot: { yearStart: string; yearExcessH: number; over45: number; avg26H: number; avg26Months: number; lastMonthH: number; trend: number[]; months: { ym: string; excessH: number; holidayH: number }[] };
    leave: { grantYm: string; granted: number; taken: number; deadline: string; left: number } }[];
};

// ---- 派遣契約 ----
export type HakenDocs = { kobetsu: boolean; daicho: boolean; meiji: boolean };
export type IkeHakenRow = {
  nn: string; name: string; rep: string; site: string; kind: '派遣' | '準委任'; start: string; end: string; hakenFrom: string;
  conflictOn: string; conflictGuess: boolean; officeConflictOn: string; docs: HakenDocs; docsKnown: boolean;
  intent: '未確認' | '派遣先と調整中' | '更新' | '終了'; confirmed: boolean; proposedBy: string; confirmedBy: string; askedAt: string; askedTo: string; note: string;
};
export type IkeHaken = { ok: boolean; tab: string; rows: IkeHakenRow[]; error?: string };

// ---- シフトの呼び名 ----
export type ShiftPattern = { id: string; name: string; short: string; start_time: string; end_time: string; tone: string; sort: number };
export type IkeShiftPatterns = { ok: boolean; rows: ShiftPattern[]; error?: string };
/** 本人が入れた時間（'9:00〜18:00' / '22:00〜翌7:00'）に、呼び名がぴったり合えばそれ */
export function patternOf(times: string, ps: ShiftPattern[]): ShiftPattern | undefined {
  const m = /^(\d{1,2}):(\d{2})〜(?:翌)?(\d{1,2}):(\d{2})$/.exec(times || '');
  if (!m) return undefined;
  const a = `${m[1].padStart(2, '0')}:${m[2]}`, b = `${m[3].padStart(2, '0')}:${m[4]}`;
  return ps.find((p) => p.start_time === a && p.end_time === b);
}
