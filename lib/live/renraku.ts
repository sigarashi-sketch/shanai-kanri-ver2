// 連絡パネル（components/Renraku.tsx）：今の社内システムの API の形 → パネルの形。読むだけの純粋な関数。
//   ・チャット … GET /api/chat?action=contacts / groups（判定は今の API の segment＝api/_chat_segment.ts の答えをそのまま使う）
//                 相手ボール（要対応）は今の api/_ball.ts isBallOnThem と同じ規則（1:1）。グループは API の ball をそのまま
//   ・案件配信 … GET /api/ikou-requests?action=history&status=sent ＋ action=pending（営業リストから積んだ依頼＝案件番号）
//                 × GET /api/proxy?action=getProgressData の sends（kNo つきの送信）と 📮判断（slackForwarded）
//   ・手動配信 … GET /api/partner-list?action=list / action=station（営業共有リストと同じ判定の材料）
//   ・案内配信 … POST /api/line-broadcast?action=poll-list / poll-detail（今の poll.html と同じ口。app/api/live/haishin 経由）
//   ・ここには本物の名前・単価・顧客名を書かない（形とキー名だけ）
import { FWD_SEP, caseTitle, mdhm, normName, type ProgressData } from './eigyo-common';

// ============================================================ チャット
export type ChatSeg = 'sales' | 'joined' | 'other';
export const SEG_LABEL: Record<ChatSeg, string> = { sales: '営業中', joined: '稼働中', other: 'その他' };

export type LiveContact = {
  line_user_id: string; display_name?: string | null; linked_name?: string | null; booking_name?: string | null;
  link_status?: string | null; is_blocked?: boolean | null; is_staff?: boolean | null;
  last_message_at?: string | null; last_message_preview?: string | null; unread_count?: number | null;
  last_direction?: string | null; last_in_at?: string | null; ball_cleared_at?: string | null;
  segment?: ChatSeg | null; segment_reason?: string | null;
};
export type LiveContactsRes = { contacts: LiveContact[]; segmentAvailable?: boolean; error?: string };
export type LiveGroup = {
  groupId: string; name: string; lastAt: string | null; lastText?: string; lastDirection?: string; lastSender?: string;
  lastInAt?: string | null; ball?: boolean; unread?: number; segment?: ChatSeg | null; segmentReason?: string | null;
};
export type LiveGroupsRes = { groups: LiveGroup[]; segmentAvailable?: boolean; error?: string };

export type ChatRow = {
  id: string; kind: 'one' | 'group'; name: string; sub?: string; last: string; at: string; atMs: number;
  ball: boolean; waitMs: number; unread: number; seg: ChatSeg; reason: string; blocked?: boolean;
};

const ms = (v?: string | null) => { const t = v ? Date.parse(v) : 0; return Number.isFinite(t) ? t : 0; };
const shortAt = (iso?: string | null, nowMs = Date.now()) => {
  const t = ms(iso);
  if (!t) return '';
  const j = new Date(t + 9 * 3600e3), n = new Date(nowMs + 9 * 3600e3);
  if (j.toISOString().slice(0, 10) === n.toISOString().slice(0, 10)) return `${j.getUTCHours()}:${String(j.getUTCMinutes()).padStart(2, '0')}`;
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()}`;
};

/** 相手ボール（今の api/_ball.ts isBallOnThem と同じ：最後が受信・対応済みを押したあとにまた受信・ブロック/社員は点けない） */
export function ballOn(c: LiveContact): boolean {
  if (!c || c.is_blocked === true || c.is_staff === true) return false;
  if ((c.last_direction || '') !== 'in') return false;
  const lastIn = ms(c.last_in_at);
  return !!lastIn && lastIn > ms(c.ball_cleared_at);
}

/** その他に落ちた理由（今の chat.html segReasonLabel と同じ） */
function reasonLabel(r: string | null | undefined, kind: 'one' | 'group', linked: boolean): string {
  if (r === 'taisha') return '退社';
  if (r === 'inactive') return '営業対象外';
  if (r === 'unknown') return kind === 'group' ? '氏名不明' : linked ? '名簿に無し' : '';
  return '';
}

/** 一覧の名前（今の chat.html displayNameOf と同じ：紐付けの氏名 → 予約の名前 → LINE の表示名） */
export const contactName = (c: LiveContact) => (c.linked_name || '').trim() || (c.booking_name || '').trim() || c.display_name || '（名前未取得）';

export function contactRows(d: LiveContactsRes | null, nowMs = Date.now()): ChatRow[] {
  return (d?.contacts ?? []).map((c) => {
    const linked = (c.link_status || '') === 'linked';
    const name = contactName(c);
    return {
      id: c.line_user_id, kind: 'one', name, sub: c.display_name && c.display_name !== name ? `LINE：${c.display_name}` : undefined,
      last: c.is_blocked ? '（ブロックされています）' : c.last_message_preview || '', at: shortAt(c.last_message_at, nowMs), atMs: ms(c.last_message_at),
      ball: ballOn(c), waitMs: ms(c.last_in_at), unread: Number(c.unread_count) || 0, seg: (c.segment || 'other') as ChatSeg,
      reason: linked ? reasonLabel(c.segment_reason, 'one', true) : '未紐付け', blocked: !!c.is_blocked,
    };
  });
}

export function groupRows(d: LiveGroupsRes | null, nowMs = Date.now()): ChatRow[] {
  return (d?.groups ?? []).map((g) => ({
    id: g.groupId, kind: 'group', name: g.name, last: (g.lastSender && g.lastDirection === 'in' ? `${g.lastSender}：` : '') + (g.lastText || ''),
    at: shortAt(g.lastAt, nowMs), atMs: ms(g.lastAt), ball: !!g.ball, waitMs: ms(g.lastInAt), unread: Number(g.unread) || 0,
    seg: (g.segment || 'other') as ChatSeg, reason: reasonLabel(g.segmentReason, 'group', true),
  }));
}

/**
 * 一覧の絞り込み（今の chat.html と同じ）
 *   ・タブ（営業中/稼働中/その他）で分ける。振り分けの材料が無い（segmentAvailable=false）ときは全件
 *   ・「要対応のみ」と検索はタブをまたぐ（未返信はタブに散らばるため）。要対応は待たせている順（古い受信が上）
 */
export function filterChat(rows: ChatRow[], o: { seg: ChatSeg; segAvailable: boolean; ballOnly: boolean; q: string }): ChatRow[] {
  const q = normName(o.q).toLowerCase();
  const cross = o.ballOnly || !!q;
  let out = rows.filter((r) => (cross || !o.segAvailable ? true : r.seg === o.seg));
  if (o.ballOnly) out = out.filter((r) => r.ball);
  if (q) out = out.filter((r) => normName(r.name).toLowerCase().includes(q) || normName(r.sub || '').toLowerCase().includes(q) || r.last.toLowerCase().includes(q));
  return o.ballOnly ? [...out].sort((a, b) => a.waitMs - b.waitMs) : [...out].sort((a, b) => b.atMs - a.atMs);
}

export function segCounts(rows: ChatRow[]): Record<ChatSeg, number> {
  const c: Record<ChatSeg, number> = { sales: 0, joined: 0, other: 0 };
  for (const r of rows) if (r.ball) c[r.seg] = (c[r.seg] || 0) + 1;
  return c;
}

// ============================================================ 案件配信（営業リストから送った案件だけ）
export type IkouReq = {
  id: string; case_text: string; target_names: string[]; requested_by?: string | null; requested_by_name?: string | null;
  status: string; created_at: string; sent_at?: string | null; sent_note?: string | null; case_no?: string | null;
  auto_status?: string | null; auto_sent_names?: string[];
};
export type IkouListRes = { ok?: boolean; requests?: IkouReq[]; error?: string };

export type CaseTarget = { name: string; decision: 'OK' | 'NG' | 'その他' | '未判断'; at: string };
export type CaseHaishin = {
  caseNo: string; title: string; requester: string; requestedAt: string; how: '手動配信' | '自動配信' | '意向確認';
  waiting: string[];          // 依頼したが、まだ送っていない人（送信待ち）
  sentAt: string; sentMs: number; targets: CaseTarget[]; ok: number; ng: number; other: number; undecided: number;
};

const decisionOf = (s: string | undefined): CaseTarget['decision'] => (s === 'OK' ? 'OK' : s === 'NG' ? 'NG' : s === 'OTHER' ? 'その他' : '未判断');

/**
 * 営業リスト（営業共有リスト・手動配信）から積んだ依頼の案件番号ごとに、実際の送信（getProgressData の sends）と判断をまとめる。
 *   ・稼働中向けのアナウンス・案内配信・案件番号の無い送信は出ない（依頼の案件番号に当たる送信だけ）
 *   ・送り先は 1:1 もグループも、送った相手ごと1行（今の案件進捗と同じ単位）
 */
export function caseHaishinRows(pd: ProgressData | null, sent: IkouReq[], pending: IkouReq[]): CaseHaishin[] {
  const byNo = new Map<string, IkouReq[]>();
  for (const r of [...sent, ...pending]) {
    const no = (r.case_no || '').trim();
    if (!no) continue;
    const a = byNo.get(no) ?? [];
    a.push(r);
    byNo.set(no, a);
  }
  const fwd = pd?.slackForwarded ?? {};
  const out: CaseHaishin[] = [];
  for (const [no, reqs] of byNo) {
    reqs.sort((a, b) => ms(b.created_at) - ms(a.created_at));
    const latest = reqs[0];
    const sends = (pd?.sends ?? []).filter((s) => s.caseNo === no).sort((a, b) => b.timestamp - a.timestamp);
    const seen = new Map<string, CaseTarget>();
    for (const s of sends) s.groupIds.forEach((gid, i) => {
      if (seen.has(gid)) return;
      seen.set(gid, { name: s.groupNames[i] || '（名前なし）', decision: decisionOf(fwd[no + FWD_SEP + gid]), at: mdhm(s.timestamp) });
    });
    const targets = [...seen.values()];
    const sentNames = new Set(targets.map((t) => normName(t.name)));
    const waiting = reqs.filter((r) => r.status === 'pending').flatMap((r) => r.target_names).filter((n) => ![...sentNames].some((s) => s.includes(normName(n))));
    const c = (d: CaseTarget['decision']) => targets.filter((t) => t.decision === d).length;
    const pcase = pd?.cases?.find((x) => x.kNo === no);
    out.push({
      caseNo: no,
      title: pcase && pd ? caseTitle(pd, pcase) : (latest.case_text.split('\n').map((s) => s.replace(/^[【\[■◆●\s]+|[】\]\s]+$/g, '').trim()).find(Boolean) || no).slice(0, 28),
      requester: latest.requested_by_name || (latest.requested_by || '').split('@')[0] || '',
      requestedAt: mdhm(ms(latest.created_at)),
      how: reqs.some((r) => r.auto_status === 'manual') ? '手動配信' : reqs.some((r) => (r.auto_sent_names?.length ?? 0) > 0) ? '自動配信' : '意向確認',
      waiting: Array.from(new Set(waiting)),
      sentAt: sends[0] ? mdhm(sends[0].timestamp) : '', sentMs: sends[0]?.timestamp ?? ms(latest.created_at),
      targets, ok: c('OK'), ng: c('NG'), other: c('その他'), undecided: c('未判断'),
    });
  }
  return out.sort((a, b) => b.sentMs - a.sentMs);
}

// ============================================================ 手動配信（営業共有リストと同じ判定）
export type PartnerPerson = {
  id: string; name: string; key: string; eki: string; kadou: string; kanouBi?: string; tsuukin?: string;
  heikou?: string; kibou?: string; summary?: string; zenshoku?: string; tags?: string[];
  skills?: { shikaku?: string; tools?: string; tokui?: string }; career?: { text?: string }; kanagawa?: boolean;
};
export type CommuteEntry = { any: boolean; blocks: string[]; short?: string };
export type PartnerListRes = {
  ok?: boolean; people?: PartnerPerson[]; commute?: Record<string, CommuteEntry>;
  kadouMonths?: { ym: number; label: string }[]; kadouGrace?: { cur: number; next: number } | null; error?: string;
};
export type CaseNeeds = { shift: boolean; yakin: boolean; shucchou: boolean };
export type CaseLimits = { startYms: number[] | null; headcount: number | null; cap: number | null; tanka: { message: string } | null };
export type Fare = { limit: number; station: string; byId: Record<string, { state: 'ok' | 'over'; yen: number | null; src: string; km?: number; via?: string[] }>; pending?: number };
export type Margin = { min: number; ngById: Record<string, 'base' | 'fare'> };
export type StationRes = {
  ok?: boolean; needs?: CaseNeeds; limits?: CaseLimits; resolved?: boolean; reason?: string; station?: string; muni?: string;
  blockId?: string; blockName?: string; hint?: string; fare?: Fare; margin?: Margin; error?: string;
};

const KADOU_UNKNOWN = /(未定|未確定|調整中|確認中|相談|応相談|要相談|不明)/;
const KADOU_IMMEDIATE = /(即日|即時|すぐ|即稼働|即対応|即|直ちに)/;
/** 稼働の文字 → 年月（今の partner-list.js parseKadouYm と同じ。「今月」はサーバが作った選択肢の先頭） */
export function parseKadouYm(v: string, months: { ym: number }[]): number | null {
  const t = String(v ?? '').trim().normalize('NFKC');
  if (!t || KADOU_UNKNOWN.test(t) || !months.length) return null;
  const base = months[0].ym, nowY = Math.floor(base / 100), nowM = base % 100;
  const rel = (add: number) => { const m = nowM + add; return m > 12 ? (nowY + 1) * 100 + m - 12 : nowY * 100 + m; };
  if (KADOU_IMMEDIATE.test(t)) return rel(0);
  if (/再来月/.test(t)) return rel(2);
  if (/来月/.test(t)) return rel(1);
  if (/今月/.test(t)) return rel(0);
  const a = /(20\d{2})\s*[年/\-.]\s*(\d{1,2})/.exec(t);
  if (a && +a[2] >= 1 && +a[2] <= 12) return +a[1] * 100 + +a[2];
  const b = /(\d{1,2})\s*(?:月|\/)/.exec(t);
  if (b && +b[1] >= 1 && +b[1] <= 12) return (+b[1] >= nowM ? nowY : nowY + 1) * 100 + +b[1];
  return null;
}
/** 稼働月の判定（その月ちょうど。15日以降に今月を選ぶと来月稼働も ok。分からない人は隠さない） */
export function judgeKadou(p: PartnerPerson, target: number, l: PartnerListRes | null): 'none' | 'ok' | 'ng' | 'unknown' {
  if (!target) return 'none';
  const ym = parseKadouYm(p.kadou, l?.kadouMonths ?? []);
  if (ym == null) return 'unknown';
  if (ym === target) return 'ok';
  const g = l?.kadouGrace;
  return g && target === g.cur && ym === g.next ? 'ok' : 'ng';
}
/** 通勤の判定（今の judgeCommute と同じ。未回答は隠さず「判定できない」） */
export function commuteJudge(p: PartnerPerson, commute: Record<string, CommuteEntry> | undefined, st: StationRes | null): 'none' | 'ok' | 'ng' | 'na' {
  if (!st?.resolved || !st.blockId) return 'none';
  const e = commute?.[p.key];
  if (!e) return 'na';
  if (e.any) return 'ok';
  if (!e.blocks?.length) return 'na';
  return e.blocks.includes(st.blockId) ? 'ok' : 'ng';
}
/** 案件が求める勤務条件のうち、この人に意向が無いもの（判定の根拠はタグ） */
export function unmetNeeds(p: PartnerPerson, n: CaseNeeds | undefined): string[] {
  const tags = p.tags ?? [];
  const out: string[] = [];
  if (n?.shift && !tags.includes('シフト可')) out.push('シフト');
  if (n?.yakin && !tags.includes('夜勤可')) out.push('夜勤');
  if (n?.shucchou && !tags.includes('出張可')) out.push('出張');
  return out;
}
export function tooLate(p: PartnerPerson, lim: CaseLimits | undefined, l: PartnerListRes | null): boolean {
  const st = lim?.startYms;
  if (!st?.length) return false;
  const ym = parseKadouYm(p.kadou, l?.kadouMonths ?? []);
  return ym != null && ym > Math.max(...st);
}
const yen = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** 交通費・粗利で止める理由（無ければ ''） */
export function fareBlock(p: PartnerPerson, st: StationRes | null): string {
  const v = st?.fare?.byId?.[p.id];
  const over = v?.state === 'over';
  const m = st?.margin?.ngById?.[p.id];
  const min = `粗利${Math.round((st?.margin?.min || 30000) / 10000)}万円`;
  if (!over && m) return `${min}に届かない${m === 'fare' ? '（交通費を引くと不足）' : '（交通費を引く前に不足）'}`;
  if (over) return `交通費が月${Math.round((st?.fare?.limit || 40000) / 10000)}万円超${v?.yen ? `（定期1ヶ月 ${yen(v.yen)}円）` : ''}`;
  return '';
}
/** この人を選べない理由（今の toggleSel のガードと同じ順。選べるなら null） */
export function cannotPick(p: PartnerPerson, st: StationRes | null, l: PartnerListRes | null, picked: number): string | null {
  const ng = unmetNeeds(p, st?.needs);
  if (ng.length) return `【${ng.join('・')}】の意向が登録されていないため選べません（この案件は${ng.join('・')}が必要）`;
  if (tooLate(p, st?.limits, l)) return `稼働が「${p.kadou}」のため選べません（開始は${(st?.limits?.startYms ?? []).map((y) => `${y % 100}月`).join('・')}）`;
  if (st?.limits?.tanka) return st.limits.tanka.message;
  const fb = fareBlock(p, st);
  if (fb) return `${fb}ため選べません`;
  const cap = st?.limits?.cap;
  if (cap && picked >= cap) return `募集${st?.limits?.headcount}名の案件です。意向確認は${cap}名までにしてください`;
  return null;
}

export type PickGroups = { main: PartnerPerson[]; na: PartnerPerson[]; blocked: PartnerPerson[]; kadouNg: number };
/** 絞り込み（今の computeGroups の 駅・稼働月・言葉）。通勤が合わない人は落とし、未回答は下へ、交通費/粗利で止まる人は一番下に畳む */
export function pickGroups(l: PartnerListRes | null, st: StationRes | null, o: { kadou: number; word: string }): PickGroups {
  const words = o.word.trim().split(/[\s　]+/).filter(Boolean).map((w) => w.toLowerCase());
  const g: PickGroups = { main: [], na: [], blocked: [], kadouNg: 0 };
  for (const p of l?.people ?? []) {
    if (words.length) {
      const hay = [p.summary, p.zenshoku, p.kibou, p.name, p.eki, p.career?.text].join('\n').toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
    }
    if (judgeKadou(p, o.kadou, l) === 'ng') { g.kadouNg++; continue; }
    const j = commuteJudge(p, l?.commute, st);
    if (j === 'ng') continue;
    if (fareBlock(p, st)) g.blocked.push(p);
    else if (j === 'na') g.na.push(p);
    else g.main.push(p);
  }
  return g;
}

/** 案件の本文（今の配信画面 ikouMessage と同じ文面） */
export const ikouMessage = (caseText: string) =>
  'お疲れ様です！\n下記の案件について、ご意向を確認させてください。\n興味がありましたら「興味あります」とご返信ください（見送りの場合もその旨いただけると助かります）。\n\n'
  + '――――――――――\n' + caseText.trim() + '\n――――――――――\n';

/** 案件文から見出しを1行（一覧・トースト用） */
export const caseHead = (t: string) => (t.split('\n').map((s) => s.replace(/^[【\[■◆●\s]+|[】\]\s]+$/g, '').trim()).find(Boolean) || '').slice(0, 28);

// ============================================================ 1:1 の宛先（line-broadcast mode=dry・app/api/live/haishin で項目を絞って返す）
export type Audience = 'sales' | 'joined';
export const AUD_LABEL: Record<Audience, string> = { sales: '営業中（1:1）', joined: '稼働中（1:1）' };
export type Recipient = { name: string; userId: string; eki: string; kadou: string; tantou: string };
export type DryRes = { ok?: boolean; recipients?: Recipient[]; total?: number; excluded?: number; error?: string };

// ============================================================ 案内配信（poll）
export type PollChoice = { key: string; label: string; ng: boolean };
export type PollSummary = { total: number; delivered: number; answered: number; ng: number; unanswered: number; cardSent: number; byKey: Record<string, number> };
export type PollRow = { id: string; title: string; choices: PollChoice[]; message: string; audience: string; createdBy: string; createdAt: string; sentAt: string; closedAt: string; summary?: PollSummary; replied?: number };
export type PollListRes = { ok?: boolean; polls?: PollRow[]; error?: string; needsMigration?: boolean };
export type PollTarget = { line_user_id: string; name: string; delivered: boolean; card_sent_at: string | null; answer_key: string | null; answer_via: string | null; answered_at: string | null };
export type PollDetailRes = { ok?: boolean; poll?: PollRow; summary?: PollSummary; targets?: PollTarget[]; replies?: Record<string, { text: string; at: string }[]>; error?: string };

export const viaLabel = (v: string | null) => (v === 'button' ? 'ボタン' : v === 'auto' ? '返信から自動' : v === 'staff' ? '社員が入力' : '');
export const isoMdhm = (iso?: string | null) => (ms(iso) ? mdhm(ms(iso)) : '');
