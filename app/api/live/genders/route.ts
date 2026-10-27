import { NextResponse } from 'next/server';
import { ikeFetchCached, ikeToken } from '@/lib/ike';
import { normName } from '@/lib/live/eigyo-common';
import type { SsList } from '@/lib/skillsheet-types';

// 手動配信の「性別で絞る」の材料（10-27 shoya「フリーワード 性別 スキルなどで絞れる検索欄ほしい」）。
//   営業共有リスト（/api/partner-list）には性別が無いので、今の GET /api/basic-info?action=list&roster=yes
//   （スキルシート作成の一覧と同じ口＝基本情報フォームの回答・未経験の人だけ）から 氏名→性別 だけを返す
//   ・同じ氏名で性別が食い違う人は入れない（取り違えない）。答えていない人は入らない＝画面では「不明」
//   ・10分ためる（その人だけの控え・lib/ike.ts ikeFetchCached）
const PAGE = 500, MAX_PAGES = 20;

export async function GET() {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const byName: Record<string, string> = {};
  const clash = new Set<string>();
  // 今の口が1回に返す数に上限があっても取りこぼさないよう、返ってきた数だけ進める
  let offset = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const r = await ikeFetchCached<SsList>(`/api/basic-info?action=list&roster=yes&limit=${PAGE}&offset=${offset}`, 10 * 60_000);
    if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    if (!r.ok || r.data?.ok === false) return NextResponse.json({ ok: false, error: r.data?.error || `性別を読めませんでした（${r.status}）` }, { status: 200 });
    const rows = r.data?.rows ?? [];
    for (const x of rows) {
      const k = normName(x.name), g = String(x.gender || '').trim();
      if (!k || !g) continue;
      if (byName[k] && byName[k] !== g) clash.add(k);
      else byName[k] = g;
    }
    offset += rows.length;
    if (!rows.length || offset >= (r.data?.total ?? 0)) break;
  }
  for (const k of clash) delete byName[k];
  return NextResponse.json({ ok: true, genders: byName });
}
