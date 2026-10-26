// 案件進捗：今の社内システムの /api/proxy?action=getProgressData ＋ getProgressReplies → この画面の形。
//   ・1行＝1つの送信を1人（1グループ／1:1）に送った分。直近 DAYS 日の送信だけ並べる
//   ・判断（OK/NG/その他）は今の 📮判断（slackForwarded：案件No＋送り先ID）。OK は今の画面でも営業へ（Slack）回る
//   ・返信は、その送り先からの「送ってから2分あと〜次に別の案件を送るまで」の最初の発言（今の replyTsFor のいちばん基本の決まり）
//   ・送った経路：今のシステムの送信はあおい（公式LINE）から。グループ直接の回収は今のシステムに無い
import type { Case, ChatMsg, ProgressRow } from '../types/eigyo';
import { FWD_SEP, caseTitle, mdhm, pickLabel, stationIn, type ProgressData, type ProgressReply } from './eigyo-common';

const DAYS = 7;
const BUFFER = 120000;   // 今と同じ：送った直後2分の発言は前の送信への返事にしない

export function liveCases(d: ProgressData | null): Case[] {
  return (d?.cases ?? []).map((c) => ({ no: c.kNo, name: caseTitle(d!, c), place: stationIn(c.content), price: pickLabel(c.content, ['単価', '金額', '報酬', '月額']) }));
}

export type LiveProgress = { rows: ProgressRow[]; threads: Record<string, ChatMsg[]>; cases: Case[] };

export function liveProgress(d: ProgressData | null, replies: ProgressReply[] | null, nowMs = Date.now()): LiveProgress {
  const cases = liveCases(d);
  if (!d) return { rows: [], threads: {}, cases };
  const since = nowMs - DAYS * 86400000;
  const fwd = d.slackForwarded ?? {};
  const byGroup = new Map<string, ProgressReply[]>();
  for (const r of replies ?? []) { const a = byGroup.get(r.groupId) ?? []; a.push(r); byGroup.set(r.groupId, a); }
  for (const a of byGroup.values()) a.sort((x, y) => x.ts - y.ts);
  // 送り先ごとの送信の時刻（次の別案件の送信まで、を決める）
  const sendsTo = new Map<string, { ts: number; k: string }[]>();
  for (const s of d.sends ?? []) s.groupIds.forEach((g) => { const a = sendsTo.get(g) ?? []; a.push({ ts: s.timestamp, k: s.caseNo }); sendsTo.set(g, a); });
  for (const a of sendsTo.values()) a.sort((x, y) => x.ts - y.ts);

  const rows: ProgressRow[] = [];
  const threads: Record<string, ChatMsg[]> = {};
  const sends = [...(d.sends ?? [])].filter((s) => s.timestamp >= since).sort((a, b) => b.timestamp - a.timestamp);
  for (const s of sends) {
    s.groupIds.forEach((gid, i) => {
      const next = (sendsTo.get(gid) ?? []).find((x) => x.ts > s.timestamp && x.k !== s.caseNo)?.ts ?? Infinity;
      const mine = (byGroup.get(gid) ?? []).filter((r) => r.ts > s.timestamp + BUFFER && r.ts < next);
      const st = fwd[s.caseNo + FWD_SEP + gid] || '';
      const id = `${s.caseNo}:${gid}:${s.timestamp}`;
      const name = s.groupNames[i] || '（名前なし）';
      rows.push({
        id, caseNo: s.caseNo, person: name, personId: '', group: name, via: 'あおい', sentAt: mdhm(s.timestamp), sender: 'あおい',
        reply: mine[0]?.text ?? '', replyAt: mine[0] ? mdhm(mine[0].ts) : undefined,
        decision: st === 'OK' ? 'OK' : st === 'NG' ? 'NG' : st === 'OTHER' ? 'その他' : '未判断', slack: st === 'OK',
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

/** 載せた発言 → 送った案件の行（返信＝その発言から2分あと〜次にそのグループへ別の案件を送るまでの最初の発言） */
export function liveDirectRows(dd: DirectData | null, d: ProgressData | null, replies: ProgressReply[] | null, nowMs = Date.now()): { rows: ProgressRow[]; threads: Record<string, ChatMsg[]>; extraCases: Case[] } {
  const rows: ProgressRow[] = [], threads: Record<string, ChatMsg[]> = {}, extraCases: Case[] = [];
  if (!dd?.confirmed) return { rows, threads, extraCases };
  const fwd = d?.slackForwarded ?? {};
  const since = nowMs - DAYS * 86400000;
  for (const c of dd.confirmed) {
    if (c.ts < since) continue;
    const nextSend = (d?.sends ?? []).filter((s) => s.groupIds.includes(c.groupId) && s.timestamp > c.ts && s.caseNo !== c.caseNo).map((s) => s.timestamp).sort((a, b) => a - b)[0] ?? Infinity;
    const mine = (replies ?? []).filter((r) => r.groupId === c.groupId && r.ts > c.ts + BUFFER && r.ts < nextSend).sort((a, b) => a.ts - b.ts);
    const st = fwd[c.caseNo + FWD_SEP + c.groupId] || '';
    const id = `${c.caseNo}:${c.groupId}:${c.ts}`;
    rows.push({
      id, caseNo: c.caseNo, person: c.group || '（名前なし）', personId: '', group: c.group, via: 'グループ直接', sentAt: mdhm(c.ts), sender: c.poster || '内勤',
      reply: mine[0]?.text ?? '', replyAt: mine[0] ? mdhm(mine[0].ts) : undefined,
      decision: st === 'OK' ? 'OK' : st === 'NG' ? 'NG' : st === 'OTHER' ? 'その他' : '未判断', slack: st === 'OK',
    });
    threads[id] = mine.slice(0, 12).map((r, j) => ({ id: `r${j}`, at: mdhm(r.ts), who: 'person' as const, name: r.name || c.group, text: r.text }));
    if (c.caseTitle && !(d?.cases ?? []).some((x) => x.kNo === c.caseNo)) extraCases.push({ no: c.caseNo, name: c.caseTitle, place: '', price: '' });
  }
  return { rows, threads, extraCases };
}

/** 送った案件の行の id（案件No:送り先ID:時刻）から送り先ID を取り出す */
export const gidOfRow = (id: string) => { const p = id.split(':'); return p.length >= 3 ? p[p.length - 2] : ''; };
