// 案件進捗：今の社内システムの /api/proxy?action=getProgressData ＋ getProgressReplies → この画面の形。
//   ・1行＝1つの送信を1人（1グループ／1:1）に送った分。直近 DAYS 日の送信だけ並べる
//   ・判断（OK/NG/その他）は今の 📮判断（slackForwarded：案件No＋送り先ID）。OK は今の画面でも営業へ（Slack）回る
//   ・返信の当て方は今の progress.html の replyTsFor と同じ（10-28 shoya「まえの管理みたいに」）：
//       1) 引用リプライで引用元が案件の一斉送信なら、その案件（quoted.caseNo）がいちばん先
//       2) それ以外は 返信より前に いちばん新しく その相手へ送った案件。続けて送った案件に1通でまとめて答えた分は
//          さかのぼって前の案件にも付ける（6時間以内・途中で返信があればそこまで＝今の _batchReplyCases）
//       3) 返信の記録に無い反応（スタンプ等で activity だけ進んだ分）は「直前の送信」の案件にだけ付ける
//          返信の記録より前の送信は材料が無いので activity が送信より後なら返信あり（あいだに別の案件を送っていなければ）
//   ・グループ直接で載せた発言（回収候補で ✓ にした分）も「送った」に数えて当てる
//   ・送った経路：今のシステムの送信はあおい（公式LINE）から
import type { Case, ChatMsg, ProgressRow, Quoted } from '../types/eigyo';
import { FWD_SEP, caseTitle, mdhm, pickLabel, stationIn, type ProgressData, type ProgressReply } from './eigyo-common';

const DAYS = 7;
const BATCH_REPLY_MS = 6 * 3600 * 1000;
const THREAD_MAX = 10;   // やりとりは今と同じく最新10件

export function liveCases(d: ProgressData | null): Case[] {
  return (d?.cases ?? []).map((c) => ({ no: c.kNo, name: caseTitle(d!, c), place: stationIn(c.content), price: pickLabel(c.content, ['単価', '金額', '報酬', '月額']), body: c.content }));
}

const quotedOf = (r?: ProgressReply): Quoted | undefined => (r?.quoted ? { found: r.quoted.found, text: r.quoted.text, sender: r.quoted.sender } : undefined);
type Owned = ProgressReply & { ks?: string[] };

/** 返信を「どの案件への返信か」に振り分けた索引（今の buildReplyIndex） */
function replyIndex(d: ProgressData | null, dd: DirectData | null, replies: ProgressReply[] | null) {
  const sendsByGroup = new Map<string, { ts: number; k: string }[]>();
  const add = (g: string, ts: number, k: string) => { if (!g || !k) return; const a = sendsByGroup.get(g) ?? []; a.push({ ts, k }); sendsByGroup.set(g, a); };
  for (const s of d?.sends ?? []) s.groupIds.forEach((g) => add(g, s.timestamp, s.caseNo));
  for (const c of dd?.confirmed ?? []) add(c.groupId, c.ts, c.caseNo);
  for (const a of sendsByGroup.values()) a.sort((x, y) => x.ts - y.ts);
  const byGroup = new Map<string, Owned[]>();
  for (const r of replies ?? []) { if (!r?.groupId || !(r.ts > 0)) continue; const a = byGroup.get(r.groupId) ?? []; a.push({ ...r }); byGroup.set(r.groupId, a); }
  for (const a of byGroup.values()) a.sort((x, y) => x.ts - y.ts);
  const src = (g: string) => (g.charAt(0) === 'U' ? 'u' : 'g');
  const floor = { g: Infinity, u: Infinity };
  const batch = (g: string, ts: number): string[] => {
    const arr = sendsByGroup.get(g) ?? [], rs = byGroup.get(g) ?? [];
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
    r.ks = r.quoted?.caseNo ? [r.quoted.caseNo] : batch(g, r.ts);
  }
  const lastSendBefore = (g: string, ts: number) => { let hit: { ts: number; k: string } | null = null; for (const x of sendsByGroup.get(g) ?? []) { if (x.ts >= ts) break; hit = x; } return hit; };
  const nextSendAfter = (g: string, ts: number) => (sendsByGroup.get(g) ?? []).find((x) => x.ts > ts)?.ts ?? Infinity;
  const otherBetween = (g: string, k: string, from: number, to: number) => (sendsByGroup.get(g) ?? []).some((x) => x.ts > from && x.ts < to && x.k !== k);

  /** (案件, 相手, 送った時刻) への返信。first＝最初の返信（記録に無い反応は text なし）、thread＝この案件に当たった返信 */
  return (k: string, g: string, sendTs: number): { first: { ts: number; r?: ProgressReply } | null; thread: ProgressReply[] } => {
    const rs = byGroup.get(g) ?? [];
    const thread = rs.filter((m) => m.ts >= sendTs && (!m.ks?.length || m.ks.includes(k)));
    const own = rs.find((m) => m.ts > sendTs && m.ks?.includes(k));
    if (own) return { first: { ts: own.ts, r: own }, thread };
    const a = d?.activity?.[g];
    if (!(a && a.ts > sendTs)) return { first: null, thread };
    if (sendTs < floor[src(g)]) return { first: otherBetween(g, k, sendTs, a.ts) ? null : { ts: a.ts }, thread };
    if (rs.some((m) => m.ts >= a.ts)) return { first: null, thread };   // 最後の反応は記録ずみ＝上で決まっている
    const ls = lastSendBefore(g, a.ts);
    return { first: ls && ls.k === k && nextSendAfter(g, sendTs) > a.ts ? { ts: a.ts } : null, thread };
  };
}

const NO_TEXT = '（スタンプ・画像などの反応）';
const decOf = (st: string): ProgressRow['decision'] => (st === 'OK' ? 'OK' : st === 'NG' ? 'NG' : st === 'OTHER' ? 'その他' : '未判断');
const threadOf = (rs: ProgressReply[], fallback: string): ChatMsg[] =>
  rs.slice(-THREAD_MAX).map((r, j) => ({ id: `r${j}`, at: mdhm(r.ts), who: 'person' as const, name: r.name || fallback, text: r.text, quoted: quotedOf(r) }));

export type LiveProgress = { rows: ProgressRow[]; threads: Record<string, ChatMsg[]>; cases: Case[] };

export function liveProgress(d: ProgressData | null, replies: ProgressReply[] | null, nowMs = Date.now(), dd: DirectData | null = null): LiveProgress {
  const cases = liveCases(d);
  if (!d) return { rows: [], threads: {}, cases };
  const since = nowMs - DAYS * 86400000;
  const fwd = d.slackForwarded ?? {};
  const replyOf = replyIndex(d, dd, replies);

  const rows: ProgressRow[] = [];
  const threads: Record<string, ChatMsg[]> = {};
  const sends = [...(d.sends ?? [])].filter((s) => s.caseNo && s.timestamp >= since).sort((a, b) => b.timestamp - a.timestamp);
  for (const s of sends) {
    s.groupIds.forEach((gid, i) => {
      const { first, thread } = replyOf(s.caseNo, gid, s.timestamp);
      const st = fwd[s.caseNo + FWD_SEP + gid] || '';
      const id = `${s.caseNo}:${gid}:${s.timestamp}`;
      const name = s.groupNames[i] || '（名前なし）';
      rows.push({
        id, caseNo: s.caseNo, person: name, personId: '', group: name, via: 'あおい', sentAt: mdhm(s.timestamp), sender: 'あおい',
        reply: first ? first.r?.text || NO_TEXT : '', replyAt: first ? mdhm(first.ts) : undefined,
        decision: decOf(st), slack: st === 'OK', sentMs: s.timestamp, replyMs: first?.ts, quoted: quotedOf(first?.r),
      });
      threads[id] = [{ id: 'send', at: mdhm(s.timestamp), who: 'aoi', name: 'あおい', text: s.message.slice(0, 800) }, ...threadOf(thread, name)];
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

/** 載せた発言 → 送った案件の行（返信の当て方は あおいの送信と同じ＝replyIndex） */
export function liveDirectRows(dd: DirectData | null, d: ProgressData | null, replies: ProgressReply[] | null, nowMs = Date.now()): { rows: ProgressRow[]; threads: Record<string, ChatMsg[]>; extraCases: Case[] } {
  const rows: ProgressRow[] = [], threads: Record<string, ChatMsg[]> = {}, extraCases: Case[] = [];
  if (!dd?.confirmed) return { rows, threads, extraCases };
  const fwd = d?.slackForwarded ?? {};
  const since = nowMs - DAYS * 86400000;
  const replyOf = replyIndex(d, dd, replies);
  for (const c of dd.confirmed) {
    if (c.ts < since) continue;
    const { first, thread } = replyOf(c.caseNo, c.groupId, c.ts);
    const st = fwd[c.caseNo + FWD_SEP + c.groupId] || '';
    const id = `${c.caseNo}:${c.groupId}:${c.ts}`;
    rows.push({
      id, caseNo: c.caseNo, person: c.group || '（名前なし）', personId: '', group: c.group, via: 'グループ直接', sentAt: mdhm(c.ts), sender: c.poster || '内勤',
      reply: first ? first.r?.text || NO_TEXT : '', replyAt: first ? mdhm(first.ts) : undefined,
      decision: decOf(st), slack: st === 'OK', sentMs: c.ts, replyMs: first?.ts, quoted: quotedOf(first?.r),
    });
    threads[id] = threadOf(thread, c.group);
    if (c.caseTitle && !(d?.cases ?? []).some((x) => x.kNo === c.caseNo)) extraCases.push({ no: c.caseNo, name: c.caseTitle, place: '', price: '' });
  }
  return { rows, threads, extraCases };
}

/** 送った案件の行の id（案件No:送り先ID:時刻）から送り先ID を取り出す */
export const gidOfRow = (id: string) => { const p = id.split(':'); return p.length >= 3 ? p[p.length - 2] : ''; };
