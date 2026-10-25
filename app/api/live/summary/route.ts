import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import type { GroupThreadRes, ThreadRes } from '@/lib/live/person';

// チャットの要約（10-25 shoya「使い回しありで自分で押す・ソネット」「7日分も任意で」「ポップで表示」）。
//   POST { kind: 'user' | 'group', id, days: 3 | 7 } → { ok, text, count, cached }
//   ・会話は今の社内システムの GET（chat?action=thread / groupThread）をログインした人のトークンで読む＝見てよいかは今の API が決める
//   ・同じ会話・同じ日数で新しい書き込みが無ければ前の要約を返す（このサーバーの手元に持つ。画面側でも覚える）
//   ・要約そのものは今の社内システム（POST /api/assistant?action=chat-summary）に頼む＝鍵は今の ANTHROPIC_API_KEY のまま
//     （10-25 shoya「既存のいけどんのキーじゃだめなん」「どうせ一緒になるよ」）。指示文とモデルは向こうの api/_chat_summary.ts
export const maxDuration = 60;

type Line = { at: string; who: string; text: string };
const memo = new Map<string, { text: string; count: number }>();
const MEMO_MAX = 500;

const jst = (iso: string) => {
  const t = Date.parse(iso);
  if (!t) return '';
  const d = new Date(t + 9 * 3600e3);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const kindText = (text?: string | null, type?: string) =>
  text || (type && type !== 'text' ? `（${type === 'image' ? '画像' : type === 'sticker' ? 'スタンプ' : type === 'file' ? 'ファイル' : type}）` : '');

export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { kind?: string; id?: string; days?: number };
  const kind = b.kind === 'group' ? 'group' : 'user';
  const id = String(b.id || '');
  const days = b.days === 7 ? 7 : 3;
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(id)) return NextResponse.json({ error: '相手が分かりません' }, { status: 400 });

  // 1) 会話を読む（今の API・GET だけ）
  const path = kind === 'user' ? `/api/chat?action=thread&userId=${encodeURIComponent(id)}` : `/api/chat?action=groupThread&groupId=${encodeURIComponent(id)}`;
  const r = await ikeFetch(path);
  if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
  if (!r.ok) return NextResponse.json({ error: `会話が読めませんでした（${r.status}）` }, { status: 502 });
  const since = Date.now() - days * 86400e3;
  let lines: Line[] = [];
  let lastKey = '';
  if (kind === 'user') {
    const d = (await r.json()) as ThreadRes;
    const ms = (d.messages || []).filter((m) => Date.parse(m.sent_at) >= since).sort((a, c) => Date.parse(a.sent_at) - Date.parse(c.sent_at));
    lines = ms.map((m) => ({ at: jst(m.sent_at), who: m.direction === 'out' ? `自社${m.sender_name ? `（${m.sender_name}）` : ''}` : '相手', text: kindText(m.text, m.message_type) }));
    lastKey = ms.length ? `${ms[ms.length - 1].id}` : '';
  } else {
    const d = (await r.json()) as GroupThreadRes;
    const ms = (d.messages || []).filter((m) => Date.parse(m.sent_at) >= since).sort((a, c) => Date.parse(a.sent_at) - Date.parse(c.sent_at));
    lines = ms.map((m) => ({ at: jst(m.sent_at), who: m.sender || (m.direction === 'out' ? '自社' : 'メンバー'), text: kindText(m.text) || '（文字のない投稿）' }));
    lastKey = ms.length ? `${ms[ms.length - 1].key || ms[ms.length - 1].sent_at}` : '';
  }
  if (!lines.length) return NextResponse.json({ ok: true, text: `直近${days}日のやり取りはありません。`, count: 0, cached: false });

  // 2) 新しい書き込みが無ければ前の要約
  const key = `${kind}:${id}:${days}:${lines.length}:${lastKey}`;
  const hit = memo.get(key);
  if (hit) return NextResponse.json({ ok: true, ...hit, cached: true, key });

  // 3) 要約する（今の社内システムに頼む）
  const r2 = await ikeFetch('/api/assistant?action=chat-summary', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, days, lines: lines.map((l) => `[${l.at}] ${l.who}: ${l.text}`) }),
  }, 58000);
  if (r2.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
  const j = (await r2.json().catch(() => ({}))) as { ok?: boolean; text?: string; error?: string };
  if (!r2.ok || !j.ok || !j.text) return NextResponse.json({ error: j.error && j.error !== 'empty' ? j.error : `要約に失敗しました（${r2.status}）` }, { status: r2.status >= 400 ? r2.status : 502 });
  if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value as string);
  memo.set(key, { text: j.text, count: lines.length });
  return NextResponse.json({ ok: true, text: j.text, count: lines.length, cached: false, key });
}
