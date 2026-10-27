import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { MIKEIKEN_PATH, isMikeiken, mikeikenKey, mikeikenSetOf } from '@/lib/live/mikeiken';
import { buildStaffList, type IkeNyushaOverlay, type IkeRosterData, type IkeRosterStatus, type IkeSalesOverlay } from '@/lib/live/staff';
import { storeCompanies, type IkeMonthSum, type IkeSaved } from '@/lib/live/seikyu-store';
import type { IkePlReps } from '@/lib/live/home-eigyo';
import type { EngineerRows } from '@/lib/live/eigyo-common';

// 本番切り替えの突き合わせ（10-25）。今の社内システムの数と、ver2 が同じ材料から出す数を並べる。★読むだけ（GET だけ）
//   (a) 稼働中の人数 … 今＝GET proxy?action=getDashboardData の workforce.activeCount（全員）
//                       ver2＝/api/live/home と同じ（名簿4つの材料→buildStaffList→状態が稼働中）。全員で数えた数と、未経験だけの数
//   (b) 未経験の人数 … 今＝プロパーリスト（roster?action=getEngineerRows・全エリア）の人数／ver2＝社員一覧（/api/live/staff）の人数
//   (c) 請求額（取引先ごと） … 今＝seikyu?action=saved-list（取引先ごとに最後に保存した請求書の合計）と month-summary の月の合計
//                             ver2＝/api/live/seikyu-store と同じ storeCompanies（会社ごとの格納の請求書の合計）
//                             ★seikyu?action=list は計算し直すと DB に控えを書くので呼ばない
//   (d) 粗利 … 今＝nippo?action=pl-reps の営業別の合計（ホーム営業に出る数）／ver2＝同じ口の成約ごとの粗利を、未経験の人だけ足し直した数
//   人数（a・b）は今の時点の数（月を選んでも変わらない）。1つ読めなくてもほかは出す
export const maxDuration = 60;

type Row = { label: string; legacy: number | null; v2: number | null; unit: '人' | '円' | '件'; ref?: boolean; note?: string };
type Section = { key: string; title: string; legacyFrom: string; v2From: string; note?: string; rows: Row[]; error?: string };

class AuthGone extends Error {}
async function getJson<T>(path: string, timeoutMs = 40000): Promise<T> {
  const r = await ikeFetch(path, undefined, timeoutMs);
  if (r.status === 401) throw new AuthGone();
  const j = (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: unknown };
  if (!r.ok || j.ok === false) throw new Error(`${path.split('?')[0]}（${r.status}${j.error ? `・${String((j.error as { message?: string }).message || j.error)}` : ''}）`);
  return j;
}
const soft = <T,>(p: Promise<T>) => p.then((v) => ({ ok: true as const, v }), (e: Error) => { if (e instanceof AuthGone) throw e; return { ok: false as const, error: e.message }; });

const thisYm = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 7);
const addYm = (ym: string, n: number) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };

export async function GET(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const want = new URL(req.url).searchParams.get('ym') || '';
  const ym = /^\d{4}-\d{2}$/.test(want) ? want : thisYm();
  const e = encodeURIComponent(ym);
  try {
    const [dash, roster, status, sales, nyusha, proper, msum, saved, pl] = await Promise.all([
      soft(getJson<{ workforce?: { activeCount?: number; error?: string } }>('/api/proxy?action=getDashboardData')),
      soft(getJson<IkeRosterData>('/api/proxy?action=getRosterData')),
      soft(getJson<IkeRosterStatus[]>('/api/proxy?action=getRosterStatus')),
      soft(getJson<{ overlay?: IkeSalesOverlay }>('/api/roster?op=extra&action=salesOverlay')),
      soft(getJson<{ overlay?: IkeNyushaOverlay }>('/api/roster?op=nyusha&action=list')),   // action=list 以外は書くので呼ばない
      soft(getJson<EngineerRows>(MIKEIKEN_PATH)),
      soft(getJson<{ months?: IkeMonthSum[] }>('/api/seikyu?action=month-summary')),
      soft(getJson<{ saved?: IkeSaved[] }>(`/api/seikyu?action=saved-list&ym=${e}`)),
      soft(getJson<IkePlReps>(`/api/nippo?action=pl-reps&ym=${e}`, 55000)),
    ]);
    const mk = proper.ok ? mikeikenSetOf(proper.v) : null;
    const sections: Section[] = [];

    // (a)(b) 名簿から ver2 の社員一覧を作る
    const staff = roster.ok && roster.v.success
      ? buildStaffList(roster.v, status.ok && Array.isArray(status.v) ? status.v : null, sales.ok ? sales.v.overlay || null : null, nyusha.ok ? nyusha.v.overlay || null : null).rows
      : null;
    const staffErr = !roster.ok ? roster.error : roster.v.success ? '' : roster.v.error || '名簿を読めませんでした';
    const wf = dash.ok && dash.v.workforce && !dash.v.workforce.error ? dash.v.workforce : null;
    const kadouAll = staff ? staff.filter((r) => r.statusKey === 'kadou').length : null;
    const kadouMk = staff && mk ? staff.filter((r) => r.statusKey === 'kadou' && isMikeiken(mk, r.name)).length : null;
    sections.push({
      key: 'kadou', title: '稼働中の人数', legacyFrom: 'ダッシュボード（稼働中＝名簿−退社−待機−休職−退場−再アサイン−入場前）', v2From: 'ホーム人事・社員一覧（ダッシュボードと同じ外し方・入場日は営業リスト→日報②・10-27）',
      note: '今の時点の人数です（月を選んでも変わりません）。名簿で状態を手で選んだ人（現場外・参画予定・稼働中）は ver2 だけが見るので、その分ずれることがあります。下の行は参考です',
      error: [!dash.ok ? `今：${dash.error}` : !wf ? '今：稼働の数を読めませんでした' : '', staffErr ? `ver2：${staffErr}` : ''].filter(Boolean).join('／') || undefined,
      rows: [
        { label: '稼働中（全員）', legacy: wf?.activeCount ?? null, v2: kadouAll, unit: '人' },
        { label: '稼働中（未経験だけ・ver2 のホームに出る数）', legacy: null, v2: kadouMk, unit: '人', ref: true },
      ],
    });

    const inRoster = staff ? new Set(staff.map((r) => mikeikenKey(r.name))) : null;
    const properNames = mk ? [...mk] : null;
    sections.push({
      key: 'mikeiken', title: '未経験の人数', legacyFrom: 'プロパーリスト（全エリア・営業止め・辞退もふくむ）', v2From: '社員一覧（名簿にいて、プロパーリストに名前がある人）',
      // ver2 の「未経験」はプロパーリストそのもの（lib/live/mikeiken.ts）＝同じ表を読むので数はずれようがない。
      //   名簿にいる人といない人に分けて出すだけ（前は「名簿にいる人」と全体を比べて ⚠ になっていた・10-27 shoya「これだけちがう」）
      note: 'ver2 の未経験＝今のプロパーリストに名前がある人（同じ表を読んでいます）。名簿にいる人＋いない人（入社前・辞退など）がプロパーリストの人数です',
      error: [!proper.ok ? `今：${proper.error}` : '', staffErr ? `ver2：${staffErr}` : ''].filter(Boolean).join('／') || undefined,
      rows: [
        { label: '未経験の人（プロパーリストの人数）', legacy: mk ? mk.size : null, v2: properNames ? properNames.length : null, unit: '人' },
        { label: 'うち名簿にいる人（ver2 の社員一覧に出る）', legacy: null, v2: properNames && inRoster ? properNames.filter((n) => inRoster.has(n)).length : null, unit: '人', ref: true },
        { label: 'うち名簿にいない人（入社前・辞退など）', legacy: null, v2: properNames && inRoster ? properNames.filter((n) => !inRoster.has(n)).length : null, unit: '人', ref: true },
      ],
    });

    // (c) 請求額
    if (saved.ok) {
      const last = new Map<string, IkeSaved>();
      for (const x of saved.v.saved || []) { const c = last.get(x.group_key); if (!c || x.saved_at > c.saved_at) last.set(x.group_key, x); }
      const legacyBy = new Map<string, number>();
      for (const x of last.values()) { const k = String(x.partner || '').trim() || '（宛先なし）'; legacyBy.set(k, (legacyBy.get(k) || 0) + (Number(x.total) || 0)); }
      const v2By = new Map<string, number>();
      for (const c of storeCompanies(null, saved.v.saved || [], [])) v2By.set(c.company, (v2By.get(c.company) || 0) + c.invs.reduce((s, i) => s + i.total, 0));
      const names = [...new Set([...legacyBy.keys(), ...v2By.keys()])].sort((a, b) => a.localeCompare(b, 'ja'));
      const month = msum.ok ? (msum.v.months || []).find((m) => m.ym === ym) : undefined;
      sections.push({
        key: 'seikyu', title: '請求額（取引先ごと・税込）', legacyFrom: '請求書作成で保存した請求書（取引先ごとに最後に保存したもの）', v2From: '請求書（格納ベース）の会社ごとの合計',
        note: '取引先マスタに無い請求書は、ver2 では「取引先マスタ以外の請求書」に1つにまとめて出します',
        error: !msum.ok ? `今の月の合計：${msum.error}` : undefined,
        rows: [
          { label: 'この月の合計', legacy: month ? month.total : msum.ok ? 0 : null, v2: [...v2By.values()].reduce((s, n) => s + n, 0), unit: '円' },
          ...names.map((n): Row => ({ label: n, legacy: legacyBy.has(n) ? legacyBy.get(n)! : null, v2: v2By.has(n) ? v2By.get(n)! : null, unit: '円' })),
        ],
      });
    } else sections.push({ key: 'seikyu', title: '請求額（取引先ごと・税込）', legacyFrom: '請求書作成で保存した請求書', v2From: '請求書（格納ベース）', rows: [], error: saved.error });

    // (d) 粗利
    if (pl.ok && pl.v.ok !== false) {
      const reps = (pl.v.reps || []).filter((r) => r.ym === ym);
      const lines = (pl.v.lines || []).filter((l) => l.ym === ym && (!mk || isMikeiken(mk, l.name)));
      const lineGross = (t?: string) => lines.filter((l) => (!t || l.tantou === t) && !l.noBill && l.uriage != null && l.gross != null).reduce((s, l) => s + (l.gross || 0), 0);
      const lineUriage = lines.filter((l) => !l.noBill && l.uriage != null).reduce((s, l) => s + (l.uriage || 0), 0);
      const full = !!pl.v.all;
      sections.push({
        key: 'arari', title: '粗利（営業別・未経験の要員）', legacyFrom: '日報②の契約実績から計算した営業別（スプシ「営業別」と同じ決まり）', v2From: '同じ材料の成約ごとの行を、未経験の人だけ足し直した数',
        note: full ? '交通費は運賃の辞書にある分だけ（無い成約は0円）。成約ごとの行と営業別の合計がずれたら、未経験の絞りか差し引きの扱いが違います' : '成約ごとの行は自分の分しか読めないので、ver2 の数は自分の分だけです（全体管理者で見てください）',
        error: mk ? undefined : '未経験の人に絞れませんでした（プロパーリストが読めない）',
        rows: [
          { label: '粗利（チーム合計）', legacy: reps.reduce((s, r) => s + r.gross, 0), v2: lineGross(), unit: '円' },
          { label: '売上（チーム合計）', legacy: reps.reduce((s, r) => s + r.uriage, 0), v2: lineUriage, unit: '円' },
          { label: '成約数（チーム合計）', legacy: reps.reduce((s, r) => s + r.count, 0), v2: lines.length, unit: '件' },
          ...reps.map((r): Row => ({ label: `粗利：${r.tantou}`, legacy: r.gross, v2: lineGross(r.tantou), unit: '円' })),
        ],
      });
    } else sections.push({ key: 'arari', title: '粗利（営業別・未経験の要員）', legacyFrom: '日報②の契約実績', v2From: '成約ごとの行', rows: [], error: pl.ok ? '粗利を読めませんでした' : pl.error });

    const months = [...new Set([thisYm(), ...[1, 2, 3, 4, 5].map((n) => addYm(thisYm(), -n)), ...(msum.ok ? (msum.v.months || []).map((m) => m.ym) : [])])].sort().reverse();
    return NextResponse.json({ ok: true, ym, months, sections, generatedAt: new Date().toISOString() });
  } catch (err) {
    if (err instanceof AuthGone) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(err as Error).message}）` }, { status: 502 });
  }
}
