import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { appRole, loadAccess } from '@/lib/sy/access';
import { db } from '@/lib/sy/db';
import { lineConfigured } from '@/lib/sy/line';
import { lineDefaultId, loadRichMenu, runMenuAction, saveRichMenu, type MenuAction } from '@/lib/sy/richmenu';
import { MENU_IMAGE } from '@/lib/sy/richmenu-types';
import { isAdminUp } from '@/lib/sy/access-types';

export const maxDuration = 30;

// リッチメニュー: いまの設定・LINE 側の状態。?q= は「まず1人で試す」相手さがし（友だちの名前で）
export async function GET(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const q = (req.nextUrl.searchParams.get('q') || '').trim().replace(/[%,()]/g, '');
  if (q) {
    const { data } = await db().from('line_users').select('user_id, display_name, subject_name')
      .eq('followed', true).or(`display_name.ilike.%${q}%,subject_name.ilike.%${q}%`).order('last_message_at', { ascending: false, nullsFirst: false }).limit(8);
    return NextResponse.json({ friends: data || [] });
  }
  const [settings, access, friends] = await Promise.all([
    loadRichMenu(), loadAccess(),
    db().from('line_users').select('user_id', { count: 'exact', head: true }).eq('followed', true),
  ]);
  const configured = lineConfigured();
  const liveId = configured ? await lineDefaultId().catch(() => '') : '';
  const { data: testers } = settings.testers.length ? await db().from('line_users').select('user_id, display_name, subject_name').in('user_id', settings.testers) : { data: [] };
  return NextResponse.json({ settings, configured, liveId, friends: friends.count || 0, testers: testers || [], canEdit: isAdminUp(appRole(u, access)) });
}

// 設定の保存（admin 以上）: LIFF ID・ボタンごとの開け方・文面・面談の決まり
export async function PUT(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const r = await saveRichMenu(await req.json().catch(() => ({})), u);
  return r.error ? NextResponse.json({ error: r.error }, { status: 403 }) : NextResponse.json({ ok: true, settings: r.settings });
}

// LINE への反映（admin 以上）: { action: 'test' | 'untest' | 'apply' | 'off', userId? }
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '') as MenuAction;
  if (!['test', 'untest', 'apply', 'off'].includes(action)) return NextResponse.json({ error: '不明な操作です' }, { status: 400 });
  let image: ArrayBuffer | undefined;
  if (action === 'test' || action === 'apply') {
    // 画像は public/ に置いてある（関数からはファイルとして読めないので 自分のURLから取る）
    const r = await fetch(new URL(MENU_IMAGE, req.nextUrl.origin), { cache: 'no-store' }).catch(() => null);
    if (!r || !r.ok) return NextResponse.json({ error: 'メニューの画像を読めませんでした' }, { status: 502 });
    image = await r.arrayBuffer();
  }
  const r = await runMenuAction(action, u, { userId: String(body?.userId || ''), image });
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  const { data: testers } = r.settings!.testers.length ? await db().from('line_users').select('user_id, display_name, subject_name').in('user_id', r.settings!.testers) : { data: [] };
  return NextResponse.json({ ok: true, settings: r.settings, testers: testers || [], liveId: await lineDefaultId().catch(() => '') });
}
