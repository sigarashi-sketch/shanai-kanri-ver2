import type { StatusPatch, StaffWrite } from '@/lib/live/staff-write';
import type { WriteReq } from './useLiveWrite';

// 社員（人事）の書き込み1件 → useLiveWrite に渡す形。行き先は /api/live/staff/write だけ（そこで今のシステムの口を決め打ち）
export const STAFF_WRITE_URL = '/api/live/staff/write';

/** undo：取り消しで送り直す StaffWrite（status は答えの prev から自動で作る） */
export function staffReq(w: StaffWrite, text: string, o?: { sub?: string; undo?: StaffWrite | null; apply?: () => void; revert?: () => void }): WriteReq {
  return {
    url: STAFF_WRITE_URL, body: w, text, sub: o?.sub, apply: o?.apply, revert: o?.revert,
    undo: (res) => {
      if (w.kind === 'status') {
        const prev = res.prev as StatusPatch | undefined;
        return prev && Object.keys(prev).length ? { url: STAFF_WRITE_URL, body: { kind: 'status', name: w.name, patch: prev, ...(w.personId ? { personId: w.personId } : {}) } } : null;
      }
      return o?.undo ? { url: STAFF_WRITE_URL, body: o.undo } : null;
    },
  };
}

/** 状態のプルダウン → 送る印（今の名簿 setRosterStatus と同じ：退社はチェック・待機はチェック＋手で選んだ印・それ以外は退社/待機を外して手で選んだ印） */
export function statusPatchOf(v: string): StatusPatch {
  if (v === 'taisha') return { taisha: true, override: '' };
  if (v === 'taiki') return { taisha: false, taiki: true, override: 'taiki' };
  return { taisha: false, taiki: false, override: v };
}
