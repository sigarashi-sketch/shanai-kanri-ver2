import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { loadMikeikenSet } from '@/lib/live/mikeiken-server';
import { isMikeiken } from '@/lib/live/mikeiken';
import { FORBIDDEN, roleCan } from '@/lib/live/role';

// 名前の小窓の「基本情報」タブ（10-25 shoya「名前クリックしたらチャットと基本情報の回答もだして」）。
//   今の GET /api/basic-info?action=detail を読んで、小窓に出す分だけに削って返す
//   ★生年月日・住所・既往歴（健康状況）も出す（10-27 shoya「既往歴と住所ちゃんとうつして・生年月日も」）。電話番号・メールアドレスも出す（10-30 shoya「要員リストの基本情報 電話番号とメールアドレスも示して」）。緊急連絡先は返さない
//   ★名前は URL に出さない＝POST { name }（10-25）。未経験の人だけ（今のプロパーリストに入っている人）
//   ★人事の情報なので、管理者と採用の担当だけ（lib/live/role.ts）。ほかのロールは 403
type Detail = {
  ok?: boolean; sheet?: Record<string, string> | null; sheetError?: string;
  analysis?: { label: string; value: string }[];
  work?: { company: string; from: string; to: string; emp_type: string; job_category: string; description: string }[];
  submittedAt?: string | null;
  sameName?: boolean; personId?: string;
  health?: { label: string; value: string }[]; healthError?: string;
};
const KEEP: [string, string][] = [
  ['kana', 'よみがな'], ['gender', '性別'], ['birth', '生年月日'], ['age', '年齢'], ['address', '住所'], ['phone', '電話番号'], ['email', 'メールアドレス'], ['eki', '最寄駅'], ['gakureki', '最終学歴'], ['tools', '使えるツール'],
  ['shikaku', '資格'], ['tokui', '得意なこと'], ['shift', 'シフト勤務'], ['yakin', '夜勤'], ['shutcho', '出張'], ['timestamp', '回答日'],
];

export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { name?: string; person?: string };
  const name = String(b.name || '').trim();
  // 人の番号（応募ID）。同姓同名のとき、その人の回答だけを今のシステムに頼む（basic-info?action=detail&person=・0364）
  const person = /^[0-9A-Za-z][0-9A-Za-z_-]{2,63}$/.test(String(b.person || '')) ? String(b.person) : '';
  if (!name || name.length > 60) return NextResponse.json({ error: '名前がありません' }, { status: 400 });
  if (!(await roleCan('basic'))) return NextResponse.json({ error: FORBIDDEN.basic }, { status: 403 });
  let mk: Awaited<ReturnType<typeof loadMikeikenSet>>;
  try { mk = await loadMikeikenSet(); } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ error: m.startsWith('ログインが切れ') ? m : 'プロパーリストが読めないので、未経験の人か確かめられませんでした' }, { status: m.startsWith('ログインが切れ') ? 401 : 502 });
  }
  if (!isMikeiken(mk, name)) return NextResponse.json({ answered: false, note: '未経験の人ではないので出していません' });
  const r = await ikeFetch(`/api/basic-info?action=detail&name=${encodeURIComponent(name)}${person ? `&person=${encodeURIComponent(person)}` : ''}`);
  if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
  if (!r.ok) return NextResponse.json({ error: `基本情報を読めませんでした（${r.status}）` }, { status: 502 });
  const d = (await r.json().catch(() => ({}))) as Detail;
  // 同姓同名で、この人の番号がまだわからない＝氏名の回答が別の人のものかもしれないので出さない（取り違えない・10-25）
  if (d.sameName && !person) return NextResponse.json({ answered: false, note: '同じ名前の人がいます。この人がだれか（応募）がまだつながっていないので、回答は出していません（設定の「同姓同名をつなぐ」で決めると出ます）' });
  const s = d.sheet || null;
  return NextResponse.json({
    answered: !!s || !!(d.analysis || []).length || !!(d.health || []).length,
    facts: s ? KEEP.map(([k, l]) => [l, String(s[k] || '')]).filter(([, v]) => v) : [],
    analysis: d.analysis || [],
    health: d.health || [],
    healthError: d.healthError || '',
    work: (d.work || []).map((w) => ({ company: w.company, from: w.from, to: w.to, emp: w.emp_type, job: w.job_category, description: w.description })),
    note: s ? '' : d.sheetError || '',
  });
}
