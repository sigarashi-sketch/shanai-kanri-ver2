import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { loadRules, previewTpl, saveRules, sendTpl, sentMap } from '@/lib/sy/survey-tpl';

export const maxDuration = 60;

// 月次アンケート「スコア別の文章」（lib/survey-tpl.ts）。GET=一覧／PUT=保存／POST=送る前の確認（preview）・送信（send）
export async function GET() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const sent = await sentMap().catch(() => ({}));   // 印が読めなくても 画面は出す（送る前の確認で もう一度見る）
  return NextResponse.json({ ok: true, rules: await loadRules(), sent });
}
export async function PUT(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const r = await saveRules(await req.json().catch(() => ({})), u);
  return NextResponse.json(r.error ? { ok: false, error: r.error } : { ok: true, rules: r.rules });
}
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { action?: string; month?: string; ruleId?: string; keys?: unknown };
  const month = String(b.month || ''), ruleId = String(b.ruleId || '');
  if (b.action === 'preview') { const r = await previewTpl(month, ruleId); return NextResponse.json(r.error ? { ok: false, error: r.error } : { ok: true, ...r }); }
  if (b.action === 'send') {
    const keys = (Array.isArray(b.keys) ? b.keys : []).map((k) => String(k || '')).filter(Boolean);
    const r = await sendTpl(month, ruleId, keys, u);
    return NextResponse.json(r.error ? { ok: false, error: r.error } : { ok: true, ...r });
  }
  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
}
