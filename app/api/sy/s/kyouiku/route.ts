import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { QUESTS } from '@/lib/sy/kyouiku-lessons';
import { stepCount } from '@/lib/sy/kyouiku-judge';
import { kyouikuUrl, loadIntakes, loadProgress, trialNames } from '@/lib/sy/kyouiku';
import { cleanEmail, loadSheets, setSheetEmail } from '@/lib/sy/kyouiku-sheet';
import { googleReady } from '@/lib/sy/google';
import { listStaff } from '@/lib/sy/staff';

export const maxDuration = 30;

// 教育コンテンツの管理（内勤）: 自分で試すURL・受講者ごとの進み具合・本人へ渡す受講URLの発行・本人の Google アカウント（任意）
export async function GET() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const [rows, sheetRows, intakes, staff, trial] = await Promise.all([loadProgress(), loadSheets(), loadIntakes(), listStaff(), trialNames().catch(() => new Set<string>())]);
  const by = new Map<string, { key: string; name: string; steps: Set<string>; last: string }>();
  for (const r of rows) {
    if (r.quest.startsWith('_')) continue;   // アンケートなど、クエスト以外の記録
    const x = by.get(r.subject_key) || { key: r.subject_key, name: r.name, steps: new Set<string>(), last: '' };
    x.steps.add(r.quest + ':' + r.step); x.last = r.created_at; if (r.name) x.name = r.name; by.set(r.subject_key, x);
  }
  const total = QUESTS.reduce((s, q) => s + stepCount(q), 0);
  const learners = [...by.values()].map((x) => ({
    key: x.key, name: x.name, done: x.steps.size, total, last: x.last,
    cleared: QUESTS.filter((q) => Array.from({ length: stepCount(q) }, (_, i) => x.steps.has(q.id + ':' + i)).every(Boolean)).map((q) => q.no),
  })).sort((a, b) => b.last.localeCompare(a.last));
  // 本人ごとのスプシ: email = 共有先の Google アカウント（任意）／ made = スプシを作成済みか
  const sheets = Object.fromEntries(sheetRows.map((s) => [s.subject_key, { email: s.email, made: !!s.sheet_id }]));
  // 最初のアンケートの結果（レベルと、本人が選んだ始める場所）
  const levels = Object.fromEntries(Object.entries(intakes).map(([k, v]) => [k, { level: v.level, start: QUESTS.find((q) => q.id === v.start)?.no || '' }]));
  return NextResponse.json({ myUrl: kyouikuUrl('u:' + u.email.toLowerCase()), sheetOn: googleReady(), learners, total, sheets, levels, staff,
    trial: [...trial].map((n) => 'n:' + n) });   // おためし（営業中）の人のキー。プロパーリストから（lib/kyouiku.ts trialNames）
}

// 本人へ渡す受講URL（それゆけ未経験の人のキーから作る。チャットで送る）。内勤に渡すときのキーは u:<メール>。
//   email を一緒に送ると、本人の Google アカウントとして覚える（'' で消す）。スプシが作成済みなら、その場で本人に共有する
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = await req.json().catch(() => ({}));
  const key = String(b.key || '');
  if (key.startsWith('u:')) {   // 内勤（メールがそのまま Google アカウント＝練習用スプシの共有先）
    const email = cleanEmail(key.slice(2));
    if (!email || email.length > 78) return NextResponse.json({ error: 'メールアドレスの形が正しくありません' }, { status: 400 });
    return NextResponse.json({ url: kyouikuUrl('u:' + email) });
  }
  if (!/^[np]:.{1,80}$/.test(key)) return NextResponse.json({ error: '人のキーが正しくありません' }, { status: 400 });
  if (typeof b.email === 'string') {
    const email = cleanEmail(b.email);
    if (b.email.trim() && !email) return NextResponse.json({ error: 'メールアドレスの形が正しくありません' }, { status: 400 });
    try {
      const r = await setSheetEmail(key, email, u.email);
      return NextResponse.json({ url: kyouikuUrl(key), email, warn: r.err });
    } catch (e) { return NextResponse.json({ error: '保存できませんでした: ' + (e as Error).message }, { status: 500 }); }
  }
  return NextResponse.json({ url: kyouikuUrl(key) });
}
