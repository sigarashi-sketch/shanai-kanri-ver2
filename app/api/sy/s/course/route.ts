import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { appRole, loadAccess } from '@/lib/sy/access';
import { audit } from '@/lib/sy/audit';
import { kyouikuUrl } from '@/lib/sy/kyouiku';
import { adminState, enroll, historyOf, notifyAll, review, saveUnit, seedUnits, setPublished } from '@/lib/sy/course/store';
import { isAdminUp } from '@/lib/sy/access-types';

export const maxDuration = 60;

// 講座「キッティングから情シスへ」の管理（内勤・ログイン）。画面は components/kyouiku/course/CourseAdmin.tsx
//   GET                                   … 回の一覧（本文つき）・受講者×回の状態・レビュー待ち・まだ知らせていない結果の数
//   POST {action:'seed'}                  … 下書きを取り込む（admin 以上・無い回を足すだけ・published=false）
//   POST {action:'unit', no, patch}       … 本文を直す（admin 以上）。受講者の状態は変えない
//   POST {action:'publish', no, published} … 公開／非公開（admin 以上）
//   POST {action:'enroll', key, name, enabled, target} … 受講者を足す・受講オン／オフ・対象者フラグ
//   POST {action:'review', id, verdict, comment, line} … 合格／差し戻し
//   POST {action:'notify'}                … 結果を LINE で知らせる（1人1通にまとめる・未連携は飛ばす）
//   POST {action:'history', key}          … その人の提出の履歴
//   POST {action:'url', key}              … その人の受講URL
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  try { return NextResponse.json(await adminState(isAdminUp(appRole(u, await loadAccess())))); }
  catch (e) { return bad('読み込めませんでした: ' + (e as Error).message, 500); }
}

export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = await req.json().catch(() => ({})); const action = String(b.action || ''); const by = u.email.toLowerCase();
  const editor = async () => isAdminUp(appRole(u, await loadAccess()));
  const key = String(b.key || ''); const keyOk = /^[nup]:.{1,80}$/.test(key);
  try {
    if (action === 'seed') {
      if (!(await editor())) return bad('下書きの取り込みは admin と super admin だけができます', 403);
      const r = await seedUnits(by); return 'error' in r ? bad(r.error, 500) : NextResponse.json({ ok: true, ...r });
    }
    if (action === 'unit') {
      if (!(await editor())) return bad('本文を直せるのは admin と super admin だけです', 403);
      const r = await saveUnit(Number(b.no), (b.patch || {}) as Record<string, unknown>, by); return 'error' in r ? bad(r.error) : NextResponse.json({ ok: true, ...r });
    }
    if (action === 'publish') {
      if (!(await editor())) return bad('公開を切り替えられるのは admin と super admin だけです', 403);
      const r = await setPublished(Number(b.no), !!b.published, by); if ('error' in r) return bad(r.error);
      await audit(u, 'course:publish', `kitting:${Number(b.no)}`, { published: !!b.published });
      return NextResponse.json({ ok: true });
    }
    if (action === 'enroll') {
      if (!keyOk) return bad('人のキーが正しくありません');
      const r = await enroll(key, String(b.name || '').slice(0, 80), { enabled: typeof b.enabled === 'boolean' ? b.enabled : undefined, target: typeof b.target === 'boolean' ? b.target : undefined }, by);
      if ('error' in r) return bad(r.error, 500);
      await audit(u, 'course:enroll', key, { enabled: b.enabled, target: b.target });
      return NextResponse.json({ ok: true });
    }
    if (action === 'review') {
      const verdict = String(b.verdict || ''); if (verdict !== 'passed' && verdict !== 'returned') return bad('指定が正しくありません');
      const r = await review(Number(b.id), verdict, String(b.comment || ''), String(b.line || ''), by); if ('error' in r) return bad(r.error);
      await audit(u, 'course:review', r.key, { no: r.no, verdict });
      return NextResponse.json({ ok: true });
    }
    if (action === 'notify') {
      const r = await notifyAll({ email: by, name: u.name }); if ('error' in r) return bad(r.error);
      if (r.sent) await audit(u, 'course:notify', '', { sent: r.sent, items: r.items });
      return NextResponse.json({ ok: true, ...r });
    }
    if (action === 'history') { if (!keyOk) return bad('人のキーが正しくありません'); return NextResponse.json({ list: await historyOf(key) }); }
    if (action === 'url') { if (!keyOk) return bad('人のキーが正しくありません'); return NextResponse.json({ url: kyouikuUrl(key) }); }
  } catch (e) { return bad('うまくいきませんでした: ' + (e as Error).message, 500); }
  return bad('action が正しくありません');
}
