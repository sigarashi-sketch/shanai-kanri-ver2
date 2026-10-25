import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { cellsOf, normName, type EngineerRows } from '@/lib/live/eigyo-common';
import { mikeikenSetOf, onlyMikeiken } from '@/lib/live/mikeiken';
import { buildSheetRows, fromSheetRows, type IkeJimuLite, type IkeSankakuSheet, type IkeNyushaOverlay, type IkeNyushaProgress } from '@/lib/live/nyusha';

// 入社手続き（＝労務の freee送信管理スプシ「参画決定者」タブと同じ列）の本物。lib/live/nyusha.ts の説明を参照。
//   ★まず労務のスプシそのもの（nyusha-progress?action=sheet・10-25 shoya「スプシ読んでいいよ」）。読めたら全部の列をスプシのまま出す。
//     読めないとき（権限が無い・Google が落ちている）だけ、下の材料から組み立てる（D・H〜L は「—」）
//   ★読むだけ。呼ぶのは次の GET だけ（どれも今のシステム側で SELECT しかしない）：
//     nyusha-progress?days=0（GET は読むだけ・POST は呼ばない）／roster?action=getEngineerRows（額面・未経験の絞り）
//     roster?op=nyusha&action=list（入社日・action=save は GET でも書くので list 以外は呼ばない）／roster?op=jimu&action=list（よみがな・入場日の補い）
//   ★cron-freee-send-sheet は書き込み（スプシへの追記・管理部タブの書き直し）を起こすので、?dry でも呼ばない
//   ★未経験の人だけ（今のプロパーリストに入っている人）。プロパーリストが読めなければ人の行は返さない
//   ★メール（basic_info.email）は今のシステムも画面に返さない＝ここでも出さない
class AuthGone extends Error {}

async function getJson<T>(path: string): Promise<T> {
  const r = await ikeFetch(path);
  if (r.status === 401) throw new AuthGone();
  if (!r.ok) throw new Error(`${path.split('?')[0]}（${r.status}）`);
  return (await r.json()) as T;
}
const soft = <T,>(p: Promise<T>) => p.catch((e) => { if (e instanceof AuthGone) throw e; return null; });

export async function GET() {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  try {
    const [sheet, eng0] = await Promise.all([
      soft(getJson<IkeSankakuSheet>('/api/nyusha-progress?action=sheet')),
      getJson<EngineerRows>('/api/roster?action=getEngineerRows'),
    ]);
    if (sheet?.ok && Array.isArray(sheet.rows)) {
      return NextResponse.json({ rows: onlyMikeiken(mikeikenSetOf(eng0), fromSheetRows(sheet.rows), 'name'), warnings: [], generatedAt: new Date().toISOString(), source: 'sheet' });
    }
    const [progress, eng, ny, jimu] = await Promise.all([
      getJson<IkeNyushaProgress>('/api/nyusha-progress?days=0'),
      Promise.resolve(eng0),
      soft(getJson<{ overlay?: IkeNyushaOverlay }>('/api/roster?op=nyusha&action=list')),
      soft(getJson<IkeJimuLite>('/api/roster?op=jimu&action=list')),
    ]);
    const warnings: string[] = ['スプシ（参画決定者タブ）が読めなかったので、今のシステムの材料から組み立てています'];
    if (!ny?.overlay) warnings.push('入社日（名簿の入社日）が読めませんでした');
    if (!jimu?.rows) warnings.push('よみがな・入場日の補い（事務ページの一覧）が読めませんでした');

    // 額面：同じ名前が複数あれば参画決定が ON の行を優先
    const gakumen = new Map<string, string>();
    for (const r of eng.rows || []) {
      const c = cellsOf(eng, r);
      const k = normName(r.name);
      if (!k || !c.gakumen) continue;
      if (!gakumen.has(k) || c.sankaku_kettei === 'true') gakumen.set(k, c.gakumen);
    }
    const rows = buildSheetRows({ progress, gakumen, nyusha: ny?.overlay || null, jimu: jimu || null });
    return NextResponse.json({ rows: onlyMikeiken(mikeikenSetOf(eng), rows, 'name'), warnings, generatedAt: new Date().toISOString(), source: 'build' });
  } catch (e) {
    if (e instanceof AuthGone) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
