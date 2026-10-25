import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { loadMikeikenSet } from '@/lib/live/mikeiken-server';
import { isMikeiken } from '@/lib/live/mikeiken';
import { HR_FORBIDDEN, canSeeHr, ikeRole } from '@/lib/live/role';

// 名前の小窓の「基本情報」タブ（10-25 shoya「名前クリックしたらチャットと基本情報の回答もだして」）。
//   今の GET /api/basic-info?action=detail&health=0（健康状況は読まない）を読んで、小窓に出す分だけに削って返す
//   ★電話・メール・住所・生年月日・緊急連絡先は返さない（小窓はどの画面からも開くので。要るときは今の基本情報の画面で）
//   ★名前は URL に出さない＝POST { name }（10-25）。未経験の人だけ（今のプロパーリストに入っている人）
//   ★人事の情報なので、管理者と採用の担当だけ（lib/live/role.ts）。ほかのロールは 403
type Detail = {
  ok?: boolean; sheet?: Record<string, string> | null; sheetError?: string;
  analysis?: { label: string; value: string }[];
  work?: { company: string; from: string; to: string; emp_type: string; job_category: string; description: string }[];
  submittedAt?: string | null;
};
const KEEP: [string, string][] = [
  ['kana', 'よみがな'], ['gender', '性別'], ['age', '年齢'], ['eki', '最寄駅'], ['gakureki', '最終学歴'], ['tools', '使えるツール'],
  ['shikaku', '資格'], ['tokui', '得意なこと'], ['shift', 'シフト勤務'], ['yakin', '夜勤'], ['shutcho', '出張'], ['timestamp', '回答日'],
];

export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { name?: string };
  const name = String(b.name || '').trim();
  if (!name || name.length > 60) return NextResponse.json({ error: '名前がありません' }, { status: 400 });
  if (!canSeeHr(await ikeRole())) return NextResponse.json({ error: HR_FORBIDDEN }, { status: 403 });
  let mk: Awaited<ReturnType<typeof loadMikeikenSet>>;
  try { mk = await loadMikeikenSet(); } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ error: m.startsWith('ログインが切れ') ? m : 'プロパーリストが読めないので、未経験の人か確かめられませんでした' }, { status: m.startsWith('ログインが切れ') ? 401 : 502 });
  }
  if (!isMikeiken(mk, name)) return NextResponse.json({ answered: false, note: '未経験の人ではないので出していません' });
  const r = await ikeFetch(`/api/basic-info?action=detail&health=0&name=${encodeURIComponent(name)}`);
  if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
  if (!r.ok) return NextResponse.json({ error: `基本情報を読めませんでした（${r.status}）` }, { status: 502 });
  const d = (await r.json().catch(() => ({}))) as Detail;
  const s = d.sheet || null;
  return NextResponse.json({
    answered: !!s || !!(d.analysis || []).length,
    facts: s ? KEEP.map(([k, l]) => [l, String(s[k] || '')]).filter(([, v]) => v) : [],
    analysis: d.analysis || [],
    work: (d.work || []).map((w) => ({ company: w.company, from: w.from, to: w.to, emp: w.emp_type, job: w.job_category, description: w.description })),
    note: s ? '' : d.sheetError || '',
  });
}
