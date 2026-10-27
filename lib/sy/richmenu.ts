import 'server-only';
import type { CurrentUser } from './auth';
import { appRole, loadAccess } from './access';
import { db } from './db';
import { isAdminUp } from './access-types';
import {
  CHAT_BAR_TEXT, EMPTY_LINE, MENU_NAME, MENU_SIZE, MENU_VERSION, cleanEditable, cleanSettings, menuAreas, type RichMenuSettings,
} from './richmenu-types';

// リッチメニューの設定（saiyou.settings key='richmenu'）と、LINE への反映。決まりは lib/richmenu-types.ts。
//   押したあとに開くページ（/m/<key>）の中身と本人確認は lib/m.ts
const API = 'https://api.line.me/v2/bot';
const DATA_API = 'https://api-data.line.me/v2/bot';
const auth = () => {
  const t = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!t) throw new Error('LINE_CHANNEL_ACCESS_TOKEN が未設定です');
  return { Authorization: `Bearer ${t}` };
};
async function line(method: string, url: string, body?: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown>; error: string }> {
  const r = await fetch(url, {
    method, cache: 'no-store',
    headers: body === undefined ? auth() : { ...auth(), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text(); let json: Record<string, unknown> = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* 本文が JSON でない */ }
  return { ok: r.ok, status: r.status, json, error: r.ok ? '' : `LINE ${r.status}: ${text.slice(0, 300)}` };
}

export async function loadRichMenu(): Promise<RichMenuSettings> {
  const { data } = await db().from('settings').select('value').eq('key', 'richmenu').maybeSingle();
  return cleanSettings(data?.value);
}
async function store(s: RichMenuSettings, by: string) {
  const { error } = await db().from('settings').upsert({ key: 'richmenu', value: s, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}
const isManager = async (u: CurrentUser) => !isAdminUp(appRole(u, await loadAccess()));
const DENY = 'リッチメニューを変えられるのは admin と super admin だけです';

// 設定の保存（admin 以上）: LIFF ID・ボタンごとの開け方・文面・面談の決まり。
//   LINE のメニューは作り直さない＝保存した瞬間から 次に開いた人に効く（LIFF ID を変えたときだけ もう一度「出す」が要る）
export async function saveRichMenu(v: unknown, by: CurrentUser): Promise<{ settings?: RichMenuSettings; error?: string }> {
  if (await isManager(by)) return { error: DENY };
  const cur = await loadRichMenu(); const next = { ...cur, ...cleanEditable(v) };
  try { await store(next, by.email); } catch (e) { return { error: (e as Error).message }; }
  return { settings: next };
}

// いま LINE 側で 友だち全員に出ているメニュー（無ければ ''）
export async function lineDefaultId(): Promise<string> {
  const r = await line('GET', `${API}/user/all/richmenu`);
  return r.ok ? String(r.json.richMenuId || '') : '';
}

// メニューを LINE に用意する（まだ誰にも出さない）。同じ版・同じ LIFF ID のものが LINE に残っていれば使い回す。
//   image … 画像の中身（PNG・1MB まで）。呼び側が public/richmenu/ から読んで渡す
async function ensureMenu(s: RichMenuSettings, image: ArrayBuffer): Promise<{ id: string; created: boolean; oldId: string }> {
  if (s.line.id && s.line.version === MENU_VERSION && s.line.liffId === s.liffId) {
    const g = await line('GET', `${API}/richmenu/${s.line.id}`);
    if (g.ok) return { id: s.line.id, created: false, oldId: '' };
  }
  const c = await line('POST', `${API}/richmenu`, { size: MENU_SIZE, selected: false, name: MENU_NAME, chatBarText: CHAT_BAR_TEXT, areas: menuAreas(s.liffId) });
  const id = String(c.json.richMenuId || '');
  if (!c.ok || !id) throw new Error(c.error || 'メニューを作れませんでした');
  const up = await fetch(`${DATA_API}/richmenu/${id}/content`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'image/png' }, body: image, cache: 'no-store' });
  if (!up.ok) {
    const msg = `LINE ${up.status}: ${(await up.text()).slice(0, 300)}`;
    await line('DELETE', `${API}/richmenu/${id}`);   // 画像の無いメニューを残さない
    throw new Error(`画像を登録できませんでした（${msg}）`);
  }
  return { id, created: true, oldId: s.line.id };
}

export type MenuAction = 'test' | 'apply' | 'off' | 'untest';
// LINE への反映（admin 以上）。
//   test   … 指定した1人にだけ出す（全員に出す前の確認用）。その人は どのボタンも開いて見える（testers）
//   untest … その1人から外す（全員向けのメニューに戻る）
//   apply  … 友だち全員に出す
//   off    … 全員から外す（メニュー自体は LINE に残す＝また apply すればすぐ戻る）
export async function runMenuAction(action: MenuAction, by: CurrentUser, opt: { userId?: string; image?: ArrayBuffer }): Promise<{ settings?: RichMenuSettings; error?: string }> {
  if (await isManager(by)) return { error: DENY };
  try {
    const cur = await loadRichMenu(); const uid = String(opt.userId || '');
    if (action === 'off') {
      const r = await line('DELETE', `${API}/user/all/richmenu`);
      if (!r.ok) return { error: r.error };
      const next = { ...cur, line: { ...cur.line, isDefault: false, appliedAt: new Date().toISOString(), appliedBy: by.email } };
      await store(next, by.email); return { settings: next };
    }
    if (action === 'untest') {
      if (!uid) return { error: '相手を選んでください' };
      const r = await line('DELETE', `${API}/user/${encodeURIComponent(uid)}/richmenu`);
      if (!r.ok) return { error: r.error };
      const next = { ...cur, testers: cur.testers.filter((t) => t !== uid) };
      await store(next, by.email); return { settings: next };
    }
    if (!cur.liffId) return { error: '先に LIFF ID を入れて保存してください（ボタンの行き先に使います）' };
    if (!opt.image) return { error: 'メニューの画像を読めませんでした' };
    const m = await ensureMenu(cur, opt.image);
    let next: RichMenuSettings = { ...cur, line: m.created ? { ...EMPTY_LINE, id: m.id, version: MENU_VERSION, liffId: cur.liffId, isDefault: false } : cur.line };
    if (m.created) await store(next, by.email);   // 先に控える（この後で失敗しても 作ったメニューを見失わない）
    const wasDefault = m.created && cur.line.isDefault;   // 作り直したとき、前の版が全員に出ていたなら 新しい版も全員に出し直す
    if (action === 'test') {
      if (!uid) return { error: '相手を選んでください' };
      const r = await line('POST', `${API}/user/${encodeURIComponent(uid)}/richmenu/${m.id}`);
      if (!r.ok) return { error: r.error };
      next = { ...next, testers: [...new Set([...next.testers, uid])] };
      await store(next, by.email);
    }
    if (action === 'apply' || wasDefault) {
      const r = await line('POST', `${API}/user/all/richmenu/${m.id}`);
      if (!r.ok) return { error: r.error };
      next = { ...next, line: { ...next.line, isDefault: true, appliedAt: new Date().toISOString(), appliedBy: by.email } };
      await store(next, by.email);
    }
    if (m.oldId && m.oldId !== m.id && (action === 'apply' || wasDefault || !cur.line.isDefault)) await line('DELETE', `${API}/richmenu/${m.oldId}`);   // 前の版は 全員を新しい版へ移してから消す
    return { settings: next };
  } catch (e) { return { error: (e as Error).message }; }
}
