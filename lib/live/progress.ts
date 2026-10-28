// 案件進捗：今の社内システムの /api/proxy?action=getProgressData ＋ getProgressReplies → この画面の形。
//   ・1行＝1つの送信を1人（1グループ／1:1）に送った分。直近 DAYS 日の送信だけ並べる
//   ・判断（OK/NG/その他）は今の 📮判断（slackForwarded：案件No＋送り先ID）。OK は今の画面でも営業へ（Slack）回る
//   ・返信の当て方は今の progress.html と同じ（下の buildAttrib・引用リプライ／まとめ返信／スタンプなどの反応）
//   ・送った経路：今のシステムの送信はあおい（公式LINE）から。グループ直接の回収は今のシステムに無い
import type { Case, ChatMsg, ProgressRow } from '../types/eigyo';
import { FWD_SEP, caseTitle, mdhm, pickLabel, stationIn, type ProgressData, type ProgressReply } from './eigyo-common';

const DAYS = 7;
const BUFFER = 120000;   // グループ直接：載せた発言の直後2分は 書いた内勤の続きとして返事にしない

export function liveCases(d: ProgressData | null): Case[] {
  return (d?.cases ?? []).map((c) => ({ no: c.kNo, name: caseTitle(d!, c), place: stationIn(c.content), price: pickLabel(c.content, ['単価', '金額', '報酬', '月額']) }));
}

export type LiveProgress = { rows: ProgressRow[]; threads: Record<string, ChatMsg[]>; cases: Case[] };

// ---- 返信の当て方（今の progress.html buildReplyIndex / replyTsFor / repliesFor と同じ決まり・2026-09-28／10-16） ----
//   1) 引用リプライで引用元が案件の配信なら その案件（いちばん先）
//   2) それ以外は 返信より前で いちばん新しく その相手へ送った案件。続けて送った案件に1通でまとめて答えた分（まとめ返信）は
//      直前の送信からさかのぼり、次の送信までに返事が無かった送信にも同じ返信を付ける（6時間以内・途中で返事があればそこまで）
//   3) 返信の記録に無い反応（スタンプ等で activity だけ進んだもの）は「直前の送信」の案件だけに付ける。
//      記録の保持範囲より前の送信は 送信〜最後の反応のあいだに別の案件を送っていなければ付ける
//   ★グループ直接で載せた発言も「その相手への送信」に数える（あおいの送信と同じ扱い）
const BATCH_REPLY_MS = 6 * 3600 * 1000;
type Send1 = { ts: number; k: string };
export type Attrib = {
  /** その案件のその送信への 最初の返信の時刻（0＝返信なし） */
  replyTs: (k: string, gid: string, sendTs: number) => number;
  /** やりとりに出す返信（その案件に当たったものと、当て先が決まらないもの） */
  replies: (k: string, gid: string, sendTs: number) => ProgressReply[];
};
export function buildAttrib(d: ProgressData | null, replies: ProgressReply[] | null, extra: { gid: string; ts: number; k: string }[] = []): Attrib {
  const sendsTo = new Map<string, Send1[]>();
  const add = (g: string, x: Send1) => { const a = sendsTo.get(g) ?? []; a.push(x); sendsTo.set(g, a); };
  for (const s of d?.sends ?? []) if (s.caseNo) s.groupIds.forEach((g) => add(g, { ts: s.timestamp, k: s.caseNo }));
  for (const e of extra) if (e.k) add(e.gid, { ts: e.ts, k: e.k });
  for (const a of sendsTo.values()) a.sort((x, y) => x.ts - y.ts);
  const byGroup = new Map<string, ProgressReply[]>();
  for (const r of replies ?? []) { if (!r?.groupId || !(r.ts > 0)) continue; const a = byGroup.get(r.groupId) ?? []; a.push(r); byGroup.set(r.groupId, a); }
  for (const a of byGroup.values()) a.sort((x, y) => x.ts - y.ts);
  const src = (g: string) => (g.charAt(0) === 'U' ? 'u' : 'g');
  const floor = { g: Infinity, u: Infinity };
  const owned = new Map<string, number[]>();   // 案件No＋送り先 → 当たった返信の時刻（昇順）
  const ks = new Map<ProgressReply, string[]>();
  const key = (k: string, g: string) => k + FWD_SEP + g;
  const batch = (g: string, ts: number): string[] => {
    const arr = sendsTo.get(g) ?? [], rs = byGroup.get(g) ?? [];
    let i = -1;
    for (let j = 0; j < arr.length && arr[j].ts < ts; j++) i = j;
    if (i < 0) return [];
    const out = [arr[i].k];
    for (let j = i - 1; j >= 0; j--) {
      const p = arr[j], nextTs = arr[j + 1].ts;
      if (ts - p.ts > BATCH_REPLY_MS) break;
      if (rs.some((m) => m.ts > p.ts && m.ts < nextTs)) break;   // この送信には返事が来ていた
      if (!out.includes(p.k)) out.push(p.k);
    }
    return out;
  };
  for (const [g, rs] of byGroup) for (const r of rs) {
    const sk = src(g);
    if (r.ts < floor[sk]) floor[sk] = r.ts;
    const k = r.quoted?.caseNo ? [r.quoted.caseNo] : batch(g, r.ts);
    if (!k.length) continue;
    ks.set(r, k);
    for (const x of k) { const a = owned.get(key(x, g)) ?? []; a.push(r.ts); owned.set(key(x, g), a); }
  }
  for (const a of owned.values()) a.sort((x, y) => x - y);
  const lastBefore = (g: string, ts: number) => { let hit: Send1 | null = null; for (const x of sendsTo.get(g) ?? []) { if (x.ts >= ts) break; hit = x; } return hit; };
  const nextAfter = (g: string, ts: number) => (sendsTo.get(g) ?? []).find((x) => x.ts > ts)?.ts ?? Infinity;
  const otherBetween = (g: string, k: string, from: number, to: number) => isFinite(floor[src(g)]) && (sendsTo.get(g) ?? []).some((x) => x.ts > from && x.ts < to && x.k !== k);
  return {
    replyTs(k, g, sendTs) {
      const own = owned.get(key(k, g)) ?? [];
      for (const t of own) if (t > sendTs) return t;
      const a = d?.activity?.[g];
      if (!(a && a.ts > sendTs)) return 0;
      if (sendTs < floor[src(g)]) return otherBetween(g, k, sendTs, a.ts) ? 0 : a.ts;
      if ((byGroup.get(g) ?? []).some((m) => m.ts >= a.ts)) return 0;   // 最後の反応は記録にある＝上で決まっている
      const ls = lastBefore(g, a.ts);
      return ls && ls.k === k && nextAfter(g, sendTs) > a.ts ? a.ts : 0;
    },
    replies(k, g, sendTs) {
      return (byGroup.get(g) ?? []).filter((m) => { const x = ks.get(m); return m.ts >= sendTs && (!x || x.includes(k)); });
    },
  };
}
const decOf = (st: string): ProgressRow['decision'] => (st === 'OK' ? 'OK' : st === 'NG' ? 'NG' : st === 'OTHER' ? 'その他' : '未判断');

export function liveProgress(d: ProgressData | null, replies: ProgressReply[] | null, nowMs = Date.now(), extra: { gid: string; ts: number; k: string }[] = []): LiveProgress {
  const cases = liveCases(d);
  if (!d) return { rows: [], threads: {}, cases };
  const since = nowMs - DAYS * 86400000;
  const fwd = d.slackForwarded ?? {};
  const at = buildAttrib(d, replies, extra);

  const rows: ProgressRow[] = [];
  const threads: Record<string, ChatMsg[]> = {};
  const sends = [...(d.sends ?? [])].filter((s) => s.caseNo && s.timestamp >= since).sort((a, b) => b.timestamp - a.timestamp);
  for (const s of sends) {
    s.groupIds.forEach((gid, i) => {
      const rts = at.replyTs(s.caseNo, gid, s.timestamp);
      const mine = at.replies(s.caseNo, gid, s.timestamp);
      const first = mine.find((r) => r.ts === rts) ?? mine[0];
      const st = fwd[s.caseNo + FWD_SEP + gid] || '';
      const id = `${s.caseNo}:${gid}:${s.timestamp}`;
      const name = s.groupNames[i] || '（名前なし）';
      rows.push({
        id, caseNo: s.caseNo, person: name, personId: '', group: name, via: 'あおい', sentAt: mdhm(s.timestamp), sender: 'あおい',
        reply: rts ? (first?.text || '（スタンプなど）') : '', replyAt: rts ? mdhm(rts) : undefined, replyTs: rts || undefined,
        decision: decOf(st), slack: st === 'OK',
      });
      threads[id] = [
        { id: 'send', at: mdhm(s.timestamp), who: 'aoi', name: 'あおい', text: s.message.slice(0, 800) },
        ...mine.slice(0, 12).map((r, j) => ({ id: `r${j}`, at: mdhm(r.ts), who: 'person' as const, name: r.name || name, text: r.text })),
      ];
    });
  }
  return { rows: rows.slice(0, 400), threads, cases };
}

// ---- グループに直接書いた案件の回収（今の /api/roster?op=eigyo&action=direct・10-26） ----
//   candidates … 内勤のグループ発言のうち案件らしいもの（まだ決めていない）。match＝案件ストックで一番近い案件（近さ 0〜100）
//   confirmed  … 「案件進捗に載せる」にした発言。送った案件に「グループ直接」で並べる（返信・📮判断はあおいの送信と同じ扱い）
export type DirectCand = { id: string; ts: number; groupId: string; group: string; poster: string; text: string; words: number; match: { caseNo: string; score: number } | null };
export type DirectConfirmed = { id: string; ts: number; groupId: string; group: string; poster: string; caseNo: string; caseTitle: string; by: string; at: string };
export type DirectData = { ok: boolean; error?: string; days: number; candidates: DirectCand[]; confirmed: DirectConfirmed[]; notCase: number };

/** 載せた発言を「その相手への送信」として返信の当て方に入れる */
export const directSends = (dd: DirectData | null) => (dd?.confirmed ?? []).map((c) => ({ gid: c.groupId, ts: c.ts, k: c.caseNo }));

/** 載せた発言 → 送った案件の行（返信の当て方は あおいの送信と同じ buildAttrib・載せた発言の直後2分は除く） */
export function liveDirectRows(dd: DirectData | null, d: ProgressData | null, replies: ProgressReply[] | null, nowMs = Date.now()): { rows: ProgressRow[]; threads: Record<string, ChatMsg[]>; extraCases: Case[] } {
  const rows: ProgressRow[] = [], threads: Record<string, ChatMsg[]> = {}, extraCases: Case[] = [];
  if (!dd?.confirmed) return { rows, threads, extraCases };
  const fwd = d?.slackForwarded ?? {};
  const since = nowMs - DAYS * 86400000;
  const at = buildAttrib(d, replies, directSends(dd));
  for (const c of dd.confirmed) {
    if (c.ts < since) continue;
    const mine = at.replies(c.caseNo, c.groupId, c.ts).filter((r) => r.ts > c.ts + BUFFER);
    const rts0 = at.replyTs(c.caseNo, c.groupId, c.ts);
    const rts = rts0 > c.ts + BUFFER ? rts0 : mine[0]?.ts ?? 0;
    const first = mine.find((r) => r.ts === rts) ?? mine[0];
    const st = fwd[c.caseNo + FWD_SEP + c.groupId] || '';
    const id = `${c.caseNo}:${c.groupId}:${c.ts}`;
    rows.push({
      id, caseNo: c.caseNo, person: c.group || '（名前なし）', personId: '', group: c.group, via: 'グループ直接', sentAt: mdhm(c.ts), sender: c.poster || '内勤',
      reply: rts ? (first?.text || '（スタンプなど）') : '', replyAt: rts ? mdhm(rts) : undefined, replyTs: rts || undefined,
      decision: decOf(st), slack: st === 'OK',
    });
    threads[id] = mine.slice(0, 12).map((r, j) => ({ id: `r${j}`, at: mdhm(r.ts), who: 'person' as const, name: r.name || c.group, text: r.text }));
    if (c.caseTitle && !(d?.cases ?? []).some((x) => x.kNo === c.caseNo)) extraCases.push({ no: c.caseNo, name: c.caseTitle, place: '', price: '' });
  }
  return { rows, threads, extraCases };
}

/** 送った案件の行の id（案件No:送り先ID:時刻）から送り先ID を取り出す */
export const gidOfRow = (id: string) => { const p = id.split(':'); return p.length >= 3 ? p[p.length - 2] : ''; };
