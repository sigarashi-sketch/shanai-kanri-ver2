import 'server-only';
import { ike, onIkeikeDb } from './db';
import { allowedRoles } from './session';
import { normName } from './name';

// 内勤（それゆけ未経験にログインできる人）の一覧。いけどんのロールが ALLOWED_ROLES の人（権限ページと同じ出し方）。
//   教育コンテンツで「内勤にも受講URLを配る」ために使う（2026-10-02 shoya）。取れないときは空（画面はメールの手入力で発行できる）
export interface Staff { email: string; name: string }
export async function listStaff(): Promise<Staff[]> {
  const out: Staff[] = [];
  if (!onIkeikeDb()) return out;
  try {
    const { data: profs } = await ike().from('profiles').select('user_id, role').in('role', allowedRoles());
    const ok = new Set((profs || []).map((p) => p.user_id as string));
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await ike().auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      data.users.forEach((x) => { if (ok.has(x.id) && x.email) out.push({ email: x.email.toLowerCase(), name: String(x.user_metadata?.full_name || x.user_metadata?.name || '') }); });
      if (data.users.length < 200) break;
    }
  } catch { /* 一覧が出ないだけ */ }
  return out.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'ja'));
}

// 内勤の氏名（正規化）。チャットの友だちが内勤かどうかを名前で見分ける（2026-10-14 shoya「吉村さん・坂田さん・長谷川さんみたいに追加した人が内勤」）。
//   友だち一覧は8秒おきに読み直すので 10分だけ覚えておく
let staffNames: { at: number; set: Set<string> } | null = null;
export async function staffNameSet(): Promise<Set<string>> {
  if (staffNames && Date.now() - staffNames.at < 10 * 60_000) return staffNames.set;
  const list = await listStaff();
  const set = new Set(list.map((x) => normName(x.name)).filter(Boolean));
  if (list.length) staffNames = { at: Date.now(), set };
  return set;
}
