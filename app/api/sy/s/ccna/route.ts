import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { db } from '@/lib/sy/db';

export const maxDuration = 60;

// CCNA コースの管理（内勤・ログイン）＝「配る人」だけ。計画は docs/kyouiku-ccna.md
//   GET                                  … CCNA をオンにした人・試験対策をオンにした人
//   POST {action:'member', key, enabled} … 人ごとに CCNA をオン／オフ
//   POST {action:'member', key, prep}    … 人ごとに「試験対策」（買った 練習問題・lib/ccna/prep.ts）をオン／オフ。CCNA のオン／オフに関係なく この人だけ開く（完全に手作業）
//   ★モンスターと問題のレビュー・下書きの取り込み・「おかしい」は 2026-10-20 に消した（図鑑あつめを消したため）
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  try {
    const mem = await db().from('ccna_members').select('*');
    if (mem.error) throw new Error(mem.error.message);
    return NextResponse.json({
      members: Object.fromEntries((mem.data || []).map((r) => [r.subject_key, !!r.enabled])), prep: Object.fromEntries((mem.data || []).map((r) => [r.subject_key, !!r.prep])), me: u.email.toLowerCase(),
    });
  } catch (e) { return bad('読み込めませんでした: ' + (e as Error).message, 500); }
}

export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = await req.json().catch(() => ({})); const action = String(b.action || ''); const by = u.email.toLowerCase();
  try {
    if (action === 'member') {
      const key = String(b.key || '');
      if (!/^[nup]:.{1,80}$/.test(key)) return bad('人のキーが正しくありません');
      if (typeof b.prep === 'boolean') {   // 試験対策だけ変える（CCNA のオン／オフは触らない。行が無い人は CCNA オフのまま作る）
        const stamp = { prep: b.prep, updated_by: by, updated_at: new Date().toISOString() };
        const up = await db().from('ccna_members').update(stamp).eq('subject_key', key).select('subject_key');
        if (up.error) return bad(up.error.message, 500);
        if (!up.data?.length) { const ins = await db().from('ccna_members').insert({ subject_key: key, enabled: false, ...stamp }); if (ins.error) return bad(ins.error.message, 500); }
        return NextResponse.json({ ok: true });
      }
      const { error } = await db().from('ccna_members').upsert({ subject_key: key, enabled: !!b.enabled, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'subject_key' });
      if (error) return bad(error.message, 500);
      return NextResponse.json({ ok: true });
    }
  } catch (e) { return bad('うまくいきませんでした: ' + (e as Error).message, 500); }
  return bad('action が正しくありません');
}
