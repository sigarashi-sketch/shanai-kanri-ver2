// 要員ページ（/eigyo/proper/<id>）：今の社内システムの口 → この画面の形。読むだけ（送信は app/api/live/chat）。
//   ・人そのもの … /api/roster?action=getEngineerRows&area=main の行（id＝行の id）。無ければ営業共有リスト・ライバーリスト
//   ・送った案件 … /api/progress-stats?view=members（案件進捗の「要員別」と同じ。名前で当てる）
//   ・チャット個人 … /api/chat?action=contacts のうち「紐付けずみ（link_status=linked）で、紐付けた氏名がこの人」の LINE 相手
//                    → /api/chat?action=thread&userId=…
//   ・チャットグループ … /api/chat?action=groups のグループ名に、この人の氏名が入っているもの（今の chat.html と同じ当て方：
//                    グループ名を畳んで、名簿の全員の氏名のうち一番長く当たる人がこの人なら、この人のグループ）
//                    → /api/chat?action=groupThread&groupId=…
import { cellsOf, fileUrlsOf, matchGroupName, normName, properStatus, type EngineerRows, type SukishiFileUrls } from './eigyo-common';
import type { LiverList, PartnerList } from './proper';
import type { LiveStaff } from './staff';

export type Fact = [string, string];
export type LivePersonView = { id: string; name: string; status: string; facts: Fact[]; summary: string; career: string; sukishiUrl: string; source: 'プロパー' | '営業共有リスト' | 'ライバー';
  /** プロパーだけ：プロパーリストの行の id（PDF・Excel の出力先）とスキシのファイル */
  row?: string; files?: SukishiFileUrls };

const v = (s?: string | null) => (s && String(s).trim()) || '—';
const yn = (s?: string) => (s === 'true' ? '可' : s === 'false' ? '不可' : v(s));

export function livePerson(id: string, er: EngineerRows | null, pl: PartnerList | null, lv: LiverList | null, liver: boolean): LivePersonView | null {
  if (liver) {
    const l = lv?.rows?.find((x) => x.id === id);
    if (!l) return null;
    return {
      id, name: l.name, status: v(l.status), source: 'ライバー', summary: l.memo || '', career: '', sukishiUrl: '',
      facts: [['採用担当', v(l.tantou)], ['最寄駅', v(l.eki)], ['承諾日', v(l.shoudaku_bi)], ['入社日', v(l.nyusha_bi)], ['経路', v(l.source)]],
    };
  }
  const r = er?.rows?.find((x) => x.row === id) ?? (id.startsWith('n:') ? er?.rows?.find((x) => normName(x.name) === id.slice(2)) : undefined);
  if (r && er) {
    const c = cellsOf(er, r);
    return {
      id, name: r.name, status: properStatus(r, c), source: 'プロパー', summary: c.summary || '', career: c.zenshoku || '',
      sukishiUrl: /^https?:/.test(c.sukishi || '') ? c.sukishi : '', row: r.row, files: fileUrlsOf(r),
      facts: [
        ['最寄駅', v(c.eki)], ['希望職種', v(c.kibou_shokushu)], ['採用担当', v(c.tantou)], ['所属', v(c.shozoku)],
        ['稼働できる日', v(c.shoudaku_nyusha_bi || c.kadou)], ['額面', v(c.gakumen)], ['シフト', yn(c.shift)], ['夜勤', yn(c.yakin)],
        ['出張', yn(c.shucchou)], ['並行', v(c.heikou_suu)], ['通勤', v(c.tsuukin)], ['メモ', v(c.memo)],
      ],
    };
  }
  const p = pl?.people?.find((x) => x.id === id);
  if (p) {
    return {
      id, name: p.name, status: '営業中', source: '営業共有リスト', summary: '', career: '', sukishiUrl: '',
      facts: [['最寄駅', v(p.eki)], ['希望', v(p.kibou)], ['稼働', v(p.kadou)], ['稼働できる日', v(p.kanouBi)], ['並行', v(p.heikou)], ['タグ', p.tags?.join('・') || '—']],
    };
  }
  return null;
}

// ---- 送った案件（progress-stats?view=members） ----
export type MemberCase = { caseNo: string; label: string; sentAt: string; place?: string; kind?: string };
export type MemberRow = { name: string; ok: MemberCase[]; ng: MemberCase[]; other: MemberCase[]; undecided: number; sent: number; okRate: number | null; lastSentAt: string };
export type MembersRes = { ok: boolean; members?: MemberRow[]; error?: string };
export const memberOf = (d: MembersRes | null, name: string) => d?.members?.find((m) => normName(m.name) === normName(name)) ?? null;

// ---- チャット ----
export type Contact = { line_user_id: string; display_name?: string | null; link_status?: string | null; linked_name?: string | null; linked_normalized_name?: string | null; last_message_at?: string | null };
export type ContactsRes = { contacts: Contact[]; error?: string };
// 画像・ファイル（今の api/chat.ts が付ける media）と 引用リプライの引用元（quoted）・返信できるか（can_reply／canReply）
export type ChatMedia = { kind: 'image' | 'video' | 'audio' | 'file' | string; url: string; downloadUrl?: string; fileName?: string; fileSize?: number; sent?: boolean };
export type ChatQuoted = { found?: boolean; text?: string; direction?: string; sender?: string; at?: string };
export type ThreadMsg = { id: number | string; direction: 'in' | 'out' | string; message_type?: string; text?: string | null; sent_at: string; sender_name?: string | null;
  line_message_id?: string | null; media?: ChatMedia; quoted?: ChatQuoted; can_reply?: boolean };
export type ThreadRes = { contact: Contact | null; messages: ThreadMsg[]; error?: string };
export type Group = { groupId: string; name: string; lastAt: string | null; lastText?: string; unread?: number };
export type GroupsRes = { groups: Group[]; error?: string };
export type GroupMsg = { key?: string; ts?: number; sent_at: string; direction: 'in' | 'out' | string; text?: string | null; sender?: string | null; source?: string;
  msgId?: string; canReply?: boolean; media?: ChatMedia; quoted?: ChatQuoted };
export type GroupThreadRes = { group: { groupId: string; name: string } | null; messages: GroupMsg[]; error?: string };

/** この人の 1:1 の LINE 相手（紐付けずみだけ。紐付けの氏名で当てる） */
export function contactsOf(d: ContactsRes | null, name: string): Contact[] {
  const n = normName(name);
  if (!n) return [];
  return (d?.contacts ?? []).filter((c) => c.link_status === 'linked' && normName(c.linked_normalized_name || c.linked_name || '') === n);
}

/** この人のグループ（名簿の全員の氏名で一番長く当たる人がこの人のもの）。新しい順 */
export function groupsOf(d: GroupsRes | null, name: string, everyone: readonly string[]): Group[] {
  const n = normName(name);
  if (!n || n.length < 2) return [];
  const norms = Array.from(new Set([n, ...everyone.map(normName)]));
  return (d?.groups ?? []).filter((g) => matchGroupName(g.name, norms) === n);
}

/** media / quoted は今の API のまま。replyId＝この吹き出しに返信（引用）できるときの LINE のメッセージ ID */
export type Bubble = { key: string; out: boolean; who: string; text: string; at: string; media?: ChatMedia; quoted?: ChatQuoted; replyId?: string };
const at = (iso: string) => { const t = Date.parse(iso); if (!t) return ''; const d = new Date(t + 9 * 3600e3); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const body = (text?: string | null, type?: string) => text || (type && type !== 'text' ? `（${type === 'image' ? '画像' : type === 'sticker' ? 'スタンプ' : type === 'file' ? 'ファイル' : type}）` : '');

/** 受信の画像・ファイルの実体は今の /api/line-content（ログインが要る）→ ver2 の中継 /api/live/line-content に向ける。
 *  この画面から送った分は Storage の署名つき URL（そのまま開ける） */
export function mediaUrl(u?: string): string {
  if (!u) return '';
  if (u.startsWith('/api/line-content')) return '/api/live/line-content' + u.slice('/api/line-content'.length);
  return /^https:\/\//.test(u) ? u : '';
}
const mediaOf = (m?: ChatMedia): ChatMedia | undefined => {
  const url = mediaUrl(m?.url);
  return m && url ? { ...m, url, downloadUrl: mediaUrl(m.downloadUrl) || url } : undefined;
};
const quotedOf = (q?: ChatQuoted): ChatQuoted | undefined => (q ? { ...q, text: maskSecrets(q.text || '') } : undefined);

export const threadBubbles = (d: ThreadRes | null): Bubble[] =>
  (d?.messages ?? []).map((m) => ({
    key: String(m.id), out: m.direction === 'out', who: m.direction === 'out' ? (m.sender_name || 'あおい') : '', text: maskSecrets(body(m.text, m.message_type)), at: at(m.sent_at),
    media: mediaOf(m.media), quoted: quotedOf(m.quoted), replyId: m.can_reply && m.line_message_id ? String(m.line_message_id) : undefined,
  }));
export const groupBubbles = (d: GroupThreadRes | null): Bubble[] =>
  (d?.messages ?? []).map((m, i) => ({
    key: m.key || `${m.sent_at}-${i}`, out: m.direction === 'out', who: m.sender || (m.direction === 'out' ? '自社' : ''), text: maskSecrets(body(m.text)) || '（文字のない投稿）', at: at(m.sent_at),
    media: mediaOf(m.media), quoted: quotedOf(m.quoted), replyId: m.canReply && m.msgId ? m.msgId : undefined,
  }));

// ---- パスワードらしい文字を伏せる（10-25：トークに現場のログイン情報が貼られていることがある） ----
//   ・「パスワード／PW／pass／暗証番号」のすぐ後ろの値（英数字・記号 4 文字以上）を伏せる
//   ・見出しだけの行（「PW：」など）の次の行も伏せる
//   ・見出しが出てきたあとの行では、英字と数字がまざった 8 文字以上のかたまり（URL・メールは除く）も伏せる
export const SECRET_MASK = '••••（伏せています）';
const LABEL = '(?:パスワード|ﾊﾟｽﾜｰﾄﾞ|暗証番号|パス(?=\\s*[:：=＝])|(?<![A-Za-z])(?:password|passwd|pass|pwd|pw)(?![A-Za-z]))';
const RE_LABEL = new RegExp(LABEL, 'i');
const RE_LABEL_ONLY = new RegExp(`^\\s*[【\\[(（<＜]?\\s*${LABEL}\\s*[】\\])）>＞]?\\s*[:：=＝]?\\s*$`, 'i');
const RE_LABEL_VAL = new RegExp(`(${LABEL}\\s*[】\\])）>＞]?\\s*(?:[:：=＝]|は|→)?\\s*)([\\x21-\\x7E]{4,})`, 'gi');
const RE_MIXED = /(?<![\x21-\x7E])(?=[\x21-\x7E]*[A-Za-z])(?=[\x21-\x7E]*\d)[\x21-\x7E]{8,}/g;
export function maskSecrets(text: string): string {
  if (!text || !RE_LABEL.test(text)) return text;
  let seen = false;
  let nextMask = false;
  return text.split('\n').map((line) => {
    if (nextMask && line.trim()) { nextMask = false; return SECRET_MASK; }
    if (RE_LABEL_ONLY.test(line)) { seen = true; nextMask = true; return line; }
    let out = line;
    if (RE_LABEL.test(line)) { seen = true; out = out.replace(RE_LABEL_VAL, (_m, lab: string) => `${lab}${SECRET_MASK}`); }
    if (seen) out = out.replace(RE_MIXED, (t) => (t.includes('://') || t.includes('@') || t.includes(SECRET_MASK) ? t : SECRET_MASK));
    return out;
  }).join('\n');
}

// ---- 名前の小窓（/api/live/person の返り） ----
export type PersonCan = { chat: boolean; summary: boolean; basic: boolean; price: boolean };
export const CAN_ALL: PersonCan = { chat: true, summary: true, basic: true, price: true };
/** 小窓の候補1人ぶん。同姓同名なら複数（採用担当・所属・最寄駅で見分ける） */
export type PersonCandidate = {
  key: string; name: string; staff: LiveStaff | null; proper: LivePersonView | null;
  hint: { recruiter: string; company: string; station: string };
  /** 人の番号＝応募ID（わかれば。同姓同名の基本情報をこの人の分だけ出すのに使う・10-25） */
  personId?: string;
};
export type PersonRes = {
  ok: true; name: string; month: string; candidates: PersonCandidate[]; everyone: string[]; can: PersonCan; notMikeiken?: boolean;
};
export const memoOf = (p: LivePersonView | null) => ({ memo: (p?.facts.find(([k]) => k === 'メモ')?.[1] || '').replace(/^—$/, ''), summary: p?.summary || '' });

// ---- 見たことを残す（チャット・基本情報・面談メモ・要約）。画面は待たない ----
export function logView(kind: 'chat' | 'basic' | 'memo' | 'summary', target: string) {
  if (typeof window === 'undefined') return;
  try {
    void fetch('/api/live/view-log', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ kind, target: String(target || '').slice(0, 80), page: window.location.pathname }),
    }).catch(() => {});
  } catch { /* 残せなくても画面は止めない */ }
}
