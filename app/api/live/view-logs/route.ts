import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';

// 閲覧ログ（だれが、だれのチャット・基本情報・面談メモ・要約を見たか・10-25）。
//   今の社内システムの GET /api/assistant?action=v2-views を読むだけ（super_admin だけ。ほかの人は今のシステムが 403 を返す）
//   ?kind= の絞りと期間（days）はここで絞る（今のシステムの kind の書き方が変わっても漏れないように）。q は今のシステムにも渡す
type ViewLogRow = { at: string; email: string; role: string; kind: string; target: string; page: string };

const KINDS = new Set(['chat', 'basic', 'memo', 'summary']);
/** 今のシステムの kind をこの画面の4つにそろえる（知らないものは other） */
function kindOf(k: string): string {
  const s = k.toLowerCase();
  if (s.includes('chat') || s.includes('チャット')) return 'chat';
  if (s.includes('basic') || s.includes('基本')) return 'basic';
  if (s.includes('memo') || s.includes('mendan') || s.includes('interview') || s.includes('面談')) return 'memo';
  if (s.includes('summary') || s.includes('要約')) return 'summary';
  return 'other';
}

export async function GET(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const u = new URL(req.url).searchParams;
  const kind = u.get('kind') || '';
  const q = (u.get('q') || '').trim().slice(0, 60);
  const days = Math.max(0, Math.min(366, Number(u.get('days')) || 0));
  try {
    const r = await ikeFetch(`/api/assistant?action=v2-views&limit=500${q ? `&q=${encodeURIComponent(q)}` : ''}`, undefined, 15000);
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; rows?: ViewLogRow[]; error?: string };
    if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    if (r.status === 403) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (r.status === 404) return NextResponse.json({ error: 'missing' }, { status: 404 });
    if (!r.ok || !j.ok) return NextResponse.json({ error: `閲覧ログを読めませんでした（${r.status}${j.error ? `・${j.error}` : ''}）` }, { status: 502 });
    const since = days ? Date.now() - days * 86400000 : 0;
    const rows = (j.rows || [])
      .map((x) => ({ at: String(x.at || ''), email: String(x.email || ''), role: String(x.role || ''), kind: kindOf(String(x.kind || '')), target: String(x.target || ''), page: String(x.page || '') }))
      .filter((x) => (!KINDS.has(kind) || x.kind === kind) && (!since || Date.parse(x.at) >= since))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 200);
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
