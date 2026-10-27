import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

// 採用版の公式LINE（Messaging API）。いけどんの公式LINEとは別アカウント。
//   env: LINE_CHANNEL_SECRET（Webhook署名の検証）/ LINE_CHANNEL_ACCESS_TOKEN（送信・プロフィール取得）
const API = 'https://api.line.me/v2/bot';
function token() {
  const t = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!t) throw new Error('LINE_CHANNEL_ACCESS_TOKEN が未設定です');
  return t;
}
export function lineConfigured() { return !!(process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN); }

export function verifySignature(raw: string, sig: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !sig) return false;
  const mac = createHmac('sha256', secret).update(raw).digest();
  const got = Buffer.from(sig, 'base64');
  return got.length === mac.length && timingSafeEqual(got, mac);
}

export async function getProfile(userId: string): Promise<{ displayName?: string; pictureUrl?: string } | null> {
  try {
    const r = await fetch(`${API}/profile/${encodeURIComponent(userId)}`, { headers: { Authorization: `Bearer ${token()}` }, cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; error: string }> {
  const r = await fetch(`${API}${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), cache: 'no-store',
  });
  if (r.ok) return { ok: true, error: '' };
  return { ok: false, error: `LINE ${r.status}: ${(await r.text()).slice(0, 300)}` };
}

export const textMsg = (text: string) => ({ type: 'text', text: text.slice(0, 5000) });
// 本文・画像・PDFカードをまとめて送る（1回の送信に5つまで。添付は lib/media.ts buildOutParts が作る）
type Msg = Record<string, unknown>;
export const pushMessages = (to: string, messages: Msg[]) => post('/message/push', { to, messages });
export const broadcastAllMessages = (messages: Msg[]) => post('/message/broadcast', { messages });
export async function multicastMessages(to: string[], messages: Msg[]): Promise<{ sent: number; failed: number; error: string }> {
  let sent = 0, failed = 0, error = '';
  for (let i = 0; i < to.length; i += 500) {
    const chunk = to.slice(i, i + 500);
    const r = await post('/message/multicast', { to: chunk, messages });
    if (r.ok) sent += chunk.length; else { failed += chunk.length; error = r.error; }
  }
  return { sent, failed, error };
}
export const pushText = (to: string, text: string) => post('/message/push', { to, messages: [textMsg(text)] });
// multicast は1回500人まで
export async function multicastText(to: string[], text: string): Promise<{ sent: number; failed: number; error: string }> {
  let sent = 0, failed = 0, error = '';
  for (let i = 0; i < to.length; i += 500) {
    const chunk = to.slice(i, i + 500);
    const r = await post('/message/multicast', { to: chunk, messages: [textMsg(text)] });
    if (r.ok) sent += chunk.length; else { failed += chunk.length; error = r.error; }
  }
  return { sent, failed, error };
}

export async function getContent(messageId: string): Promise<Response> {
  return fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
    headers: { Authorization: `Bearer ${token()}` }, cache: 'no-store',
  });
}

// トークンが有効かの確認（公式LINEの表示名・ID・友だち追加URLを返す）
export async function getBotInfo(): Promise<{ displayName?: string; basicId?: string; pictureUrl?: string } | null> {
  try {
    const r = await fetch(`${API}/info`, { headers: { Authorization: `Bearer ${token()}` }, cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// 返信（replyToken）。友だち追加直後・メッセージ直後に使える。通数に数えられない。
export const replyText = (replyToken: string, text: string) => post('/message/reply', { replyToken, messages: [textMsg(text)] });
export const replyMessages = (replyToken: string, messages: Msg[]) => post('/message/reply', { replyToken, messages });

// 友だちの userId 一覧（認証済み/プレミアムアカウントだけ使える。それ以外は 403）
export async function getFollowerIds(start?: string): Promise<{ ids: string[]; next?: string; error?: string; status: number }> {
  const u = new URL(`${API}/followers/ids`); u.searchParams.set('limit', '1000'); if (start) u.searchParams.set('start', start);
  const r = await fetch(u, { headers: { Authorization: `Bearer ${token()}` }, cache: 'no-store' });
  if (!r.ok) return { ids: [], status: r.status, error: (await r.text()).slice(0, 300) };
  const j = (await r.json()) as { userIds?: string[]; next?: string };
  return { ids: j.userIds || [], next: j.next, status: 200 };
}

// 友だち全員へ一斉送信（userId が分からない友だちにも届く。友だち数ぶん通数を使う）
export const broadcastAllText = (text: string) => post('/message/broadcast', { messages: [textMsg(text)] });
