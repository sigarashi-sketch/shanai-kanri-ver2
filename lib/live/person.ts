// 要員ページ（/eigyo/proper/<id>）：今の社内システムの口 → この画面の形。読むだけ（送信は app/api/live/chat）。
//   ・人そのもの … /api/roster?action=getEngineerRows&area=main の行（id＝行の id）。無ければ営業共有リスト・ライバーリスト
//   ・送った案件 … /api/progress-stats?view=members（案件進捗の「要員別」と同じ。名前で当てる）
//   ・チャット個人 … /api/chat?action=contacts のうち「紐付けずみ（link_status=linked）で、紐付けた氏名がこの人」の LINE 相手
//                    → /api/chat?action=thread&userId=…
//   ・チャットグループ … /api/chat?action=groups のグループ名に、この人の氏名が入っているもの（今の chat.html と同じ当て方：
//                    グループ名を畳んで、名簿の全員の氏名のうち一番長く当たる人がこの人なら、この人のグループ）
//                    → /api/chat?action=groupThread&groupId=…
import { cellsOf, matchGroupName, normName, properStatus, type EngineerRows } from './eigyo-common';
import type { LiverList, PartnerList } from './proper';

export type Fact = [string, string];
export type LivePersonView = { id: string; name: string; status: string; facts: Fact[]; summary: string; career: string; sukishiUrl: string; source: 'プロパー' | '営業共有リスト' | 'ライバー' };

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
      sukishiUrl: /^https?:/.test(c.sukishi || '') ? c.sukishi : '',
      facts: [
        ['最寄駅', v(c.eki)], ['希望職種', v(c.kibou_shokushu)], ['採用担当', v(c.tantou)], ['所属', v(c.shozoku)],
        ['稼働できる日', v(c.shoudaku_nyusha_bi || c.kadou)], ['額面', v(c.gakumen)], ['シフト', yn(c.shift)], ['夜勤', yn(c.yakin)],
        ['出張', yn(c.shucchou)], ['並行', v(c.heikou)], ['通勤', v(c.tsuukin)], ['メモ', v(c.memo)],
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
export type ThreadMsg = { id: number | string; direction: 'in' | 'out' | string; message_type?: string; text?: string | null; sent_at: string; sender_name?: string | null };
export type ThreadRes = { contact: Contact | null; messages: ThreadMsg[]; error?: string };
export type Group = { groupId: string; name: string; lastAt: string | null; lastText?: string; unread?: number };
export type GroupsRes = { groups: Group[]; error?: string };
export type GroupMsg = { key?: string; ts?: number; sent_at: string; direction: 'in' | 'out' | string; text?: string | null; sender?: string | null; source?: string };
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

export type Bubble = { key: string; out: boolean; who: string; text: string; at: string };
const at = (iso: string) => { const t = Date.parse(iso); if (!t) return ''; const d = new Date(t + 9 * 3600e3); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const body = (text?: string | null, type?: string) => text || (type && type !== 'text' ? `（${type === 'image' ? '画像' : type === 'sticker' ? 'スタンプ' : type === 'file' ? 'ファイル' : type}）` : '');

export const threadBubbles = (d: ThreadRes | null): Bubble[] =>
  (d?.messages ?? []).map((m) => ({ key: String(m.id), out: m.direction === 'out', who: m.direction === 'out' ? (m.sender_name || 'あおい') : '', text: body(m.text, m.message_type), at: at(m.sent_at) }));
export const groupBubbles = (d: GroupThreadRes | null): Bubble[] =>
  (d?.messages ?? []).map((m, i) => ({ key: m.key || `${m.sent_at}-${i}`, out: m.direction === 'out', who: m.sender || (m.direction === 'out' ? '自社' : ''), text: body(m.text) || '（文字のない投稿）', at: at(m.sent_at) }));
