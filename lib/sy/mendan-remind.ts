import 'server-only';
import { bousanUserIds } from './bousan';
import { db } from './db';
import { IKEIKE_BASE } from './ikeike';
import { lineConfigured, pushText } from './line';
import { loadRichMenu } from './richmenu';
import { loadTeikiSettings } from './teiki';
import { DEFAULT_REMIND, cleanRemind, fillRemind, planOf, whenText, type MendanRemindSettings, type RemindRow, type StepKey } from './mendan-remind-types';

// 面談のリマインド（決め方は lib/mendan-remind-types.ts）。
//   ★予約の台帳は持たない。いけどんの口（/api/community teikiList）が 担当の Google カレンダーから
//     「メニューから予約された 定期面談・リーダー面談」を返す（だれの予約か・いつ予約したか つき）。
//     内勤がカレンダーで 予定を動かした・消した ときは そのまま反映される（動かした先の日時で数え直す）
//   ★10分おきに Vercel の cron が run() を呼ぶ（app/api/cron/mendan-remind）。送る前に line_messages へ
//     line_message_id='remind:<予定>:<開始>:<どれ>' の行を入れる＝同じものは二度入らない（一意）ので 二重には送らない。
//     送れなかったら その行を消す（次の回で もう一度）
interface Booking { id: string; host: string; userId: string; start: string; end: string; meetUrl: string; bookedAt: string; kind: 'leader' | 'teiki' }
const SENDER = '自動（面談のリマインド）';
const lmid = (b: Booking, k: StepKey) => `remind:${b.id}:${b.start}:${k}`;

export async function loadRemind(): Promise<MendanRemindSettings> {
  const { data } = await db().from('settings').select('value').eq('key', 'mendan_remind').maybeSingle();
  return data?.value ? cleanRemind(data.value) : DEFAULT_REMIND;
}
export async function saveRemind(v: unknown, by: string): Promise<{ settings?: MendanRemindSettings; error?: string }> {
  const settings = cleanRemind(v);
  const { error } = await db().from('settings').upsert({ key: 'mendan_remind', value: settings, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return error ? { error: error.message } : { settings };
}

async function bookings(): Promise<Booking[]> {
  const m = (await loadRichMenu()).mendan;
  const r = await fetch(IKEIKE_BASE() + '/api/community', {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(25000),
    headers: { Authorization: `Bearer ${String(process.env.IKEIKE_SERVICE_ROLE || '')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'teikiList', hosts: [m.leaderHost, m.memberHost] }),
  });
  const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; bookings?: Booking[] } | null;
  if (!j?.ok) throw new Error(`予約の一覧を読めませんでした（${j?.error || r.status}）`);
  return j.bookings || [];
}
interface Friend { user_id: string; followed: boolean; subject_name: string | null; claimed_name: string | null }
async function friendsOf(ids: string[]): Promise<Map<string, Friend>> {
  if (!ids.length) return new Map();
  const { data, error } = await db().from('line_users').select('user_id, followed, subject_name, claimed_name').in('user_id', ids);
  if (error) throw new Error(error.message);
  return new Map(((data || []) as Friend[]).map((f) => [f.user_id, f]));
}
const kindName = (b: Booking) => (b.kind === 'leader' ? 'リーダー面談' : '定期面談');
async function hostNames(): Promise<(email: string) => string> {
  const t = (await loadTeikiSettings().catch(() => null))?.tantou || [];
  return (email) => t.find((x) => x.email === email)?.name || email.split('@')[0];
}

// いま送る分を送る。返すのは 件数だけ（cron の記録用）
export async function runRemind(nowMs = Date.now()): Promise<{ ok: boolean; on: boolean; bookings: number; sent: number; failed: number; error?: string }> {
  const s = await loadRemind();
  if (!s.on || !lineConfigured()) return { ok: true, on: false, bookings: 0, sent: 0, failed: 0 };
  const list = await bookings();
  const due = list.flatMap((b) => planOf(Date.parse(b.bookedAt), Date.parse(b.start), nowMs, s).filter((p) => p.state === 'due').map((p) => ({ b, key: p.key })));
  if (!due.length) return { ok: true, on: true, bookings: list.length, sent: 0, failed: 0 };
  const dueIds = [...new Set(due.map((d) => d.b.userId))];
  const [friends, hostName, stop] = await Promise.all([friendsOf(dueIds), hostNames(), bousanUserIds(dueIds)]);
  let sent = 0, failed = 0;
  for (const { b, key } of due) {
    const f = friends.get(b.userId);
    if (!f || !f.followed) continue;   // ブロックされた・友だちでない人には送らない
    if (stop.has(b.userId)) continue;  // ぼうさん（接触禁止）には送らない
    const name = String(f.subject_name || f.claimed_name || '').trim();
    const text = fillRemind(s.steps[key].text, { name, kind: kindName(b), when: whenText(b.start, b.end), host: hostName(b.host), meetUrl: b.meetUrl }).replace(/^さん\n+/, '');
    const id = lmid(b, key);
    const ins = await db().from('line_messages').insert({
      user_id: b.userId, direction: 'out', type: 'text', text, line_message_id: id, sender_name: SENDER,
      payload: { mendanRemind: { event: b.id, start: b.start, step: key } }, created_at: new Date().toISOString(),
    });
    if (ins.error) { if (ins.error.code !== '23505') { failed++; console.error('mendan remind claim', ins.error.message); } continue; }   // 23505＝もう送ってある
    const p = await pushText(b.userId, text).catch((e) => ({ ok: false, error: (e as Error).message }));
    if (p.ok) sent++;
    else { failed++; console.error('mendan remind push', key, p.error); await db().from('line_messages').delete().eq('line_message_id', id); }
  }
  return { ok: true, on: true, bookings: list.length, sent, failed };
}

// 画面用: これからの予約と、それぞれのリマインドが どうなるか（送信済み・これから・出さない）
export async function remindRows(s: MendanRemindSettings, nowMs = Date.now()): Promise<RemindRow[]> {
  const list = await bookings();
  if (!list.length) return [];
  const ids = [...new Set(list.map((b) => b.userId))];
  const [friends, hostName, stop, sentQ] = await Promise.all([
    friendsOf(ids), hostNames(), bousanUserIds(ids),
    db().from('line_messages').select('line_message_id').like('line_message_id', 'remind:%').gte('created_at', new Date(nowMs - 40 * 86400_000).toISOString()).limit(5000),
  ]);
  const sent = new Set(((sentQ.data || []) as { line_message_id: string }[]).map((r) => r.line_message_id));
  return list.map((b) => {
    const f = friends.get(b.userId);
    return {
      id: b.id, name: String(f?.subject_name || f?.claimed_name || '（名前なし）'), kind: kindName(b), host: hostName(b.host), when: whenText(b.start, b.end),
      start: b.start, bookedAt: b.bookedAt, linked: !!f?.followed, bousan: stop.has(b.userId),
      // ぼうさん には これからの分を 出さない（画面でも「出さない」と見せる）。もう送った分は 送信済みのまま
      steps: planOf(Date.parse(b.bookedAt), Date.parse(b.start), nowMs, s).map((p) => ({ key: p.key, at: new Date(p.at).toISOString(), state: sent.has(lmid(b, p.key)) ? 'sent' as const : stop.has(b.userId) && (p.state === 'wait' || p.state === 'due') ? 'skip' as const : p.state })),
    };
  });
}
