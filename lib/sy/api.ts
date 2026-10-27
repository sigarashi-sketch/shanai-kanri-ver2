import 'server-only';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { currentUser, type CurrentUser } from './auth';
import { appRole, loadAccess } from './access';
import { READONLY_MSG } from './access-types';
import { ikeKanawestNow } from '@/lib/ike';

// 内勤一般でも通す書き込み口（その人自身の画面の覚え書きだけ・名簿などのデータではない）
const STAFF_WRITE_OK = new Set(['/api/s/roster-prefs']);

// API用の関所。未ログインなら 401 を返す（呼び側: `const u = await apiUser(); if (u instanceof NextResponse) return u;`）
export async function apiUser(): Promise<CurrentUser | NextResponse> {
  // かな西エリアだけの人（神奈川要員だけを見る人）は人財管理の口を使えない（ver2 lib/kanawest-scope.ts・10-27）
  if (await ikeKanawestNow()) return NextResponse.json({ error: 'かな西エリアでは開けません', ok: false }, { status: 403 });
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized', hint: 'ログインが必要です' }, { status: 401 });
  // 内勤一般は 見るだけ（2026-10-13 shoya）。読む以外（POST・PUT・PATCH・DELETE）は ここで止める。
  //   メソッドと道は proxy.ts が x-sa-method / x-sa-path に入れる（外から送られた同名のヘッダーは proxy が上書きする）
  const h = await headers(); const method = (h.get('x-sa-method') || 'GET').toUpperCase();
  // 書き込みはこの画面（同じサイト）からだけ（ver2 の書く口と同じ決まり・lib/ike-write.ts sameSite）
  if (method !== 'GET' && method !== 'HEAD') {
    const site = h.get('sec-fetch-site'), origin = h.get('origin'), host = h.get('host');
    let ok = site ? site === 'same-origin' : false;
    if (ok && origin) { try { ok = new URL(origin).host === host; } catch { ok = false; } }
    if (!ok) return NextResponse.json({ error: 'この画面の外からは保存できません', ok: false }, { status: 403 });
  }
  if (method !== 'GET' && method !== 'HEAD' && !STAFF_WRITE_OK.has(h.get('x-sa-path') || '') && appRole(u, await loadAccess()) === 'staff')
    return NextResponse.json({ error: READONLY_MSG, ok: false }, { status: 403 });
  return u;
}
