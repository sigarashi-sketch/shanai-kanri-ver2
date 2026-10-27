import 'server-only';
import { ike, onIkeikeDb } from './db';
import { allowedRoles } from './session';
import { loadAccess } from './access';
import { roleOf } from './access-types';
import { PON_ACT_PREFIX, PON_SETTINGS_KEY, type PonKind, type PonUser } from './pon-types';

// たまげたポンの許可・設定を いけどんのDB（public）から読む。許可＝profiles.bikkura（開始日 bikkura_since 以降の操作だけ数わる）
export async function ponEnabled(userId: string): Promise<boolean> {
  if (!onIkeikeDb() || userId === 'dev') return userId === 'dev';
  const { data } = await ike().from('profiles').select('bikkura, bikkura_since').eq('user_id', userId).maybeSingle();
  return !!(data?.bikkura && data?.bikkura_since);
}
// それゆけ にログインできる人（いけどんのロールが ALLOWED_ROLES）と、その人の許可の状態
export async function listPonUsers(): Promise<(PonUser & { id: string })[]> {
  const out: (PonUser & { id: string })[] = [];
  if (!onIkeikeDb()) return out;
  const [{ data: profs }, access] = await Promise.all([
    ike().from('profiles').select('user_id, role, bikkura, bikkura_since, jimu_role').in('role', allowedRoles()), loadAccess(),
  ]);
  const by = new Map((profs || []).map((p) => [p.user_id as string, p]));
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await ike().auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    data.users.forEach((x) => {
      const p = by.get(x.id); if (!p || !x.email) return;
      const email = x.email.toLowerCase();
      out.push({ id: x.id, email, name: String(x.user_metadata?.full_name || x.user_metadata?.name || ''), appRole: roleOf(email, access), bikkura: !!p.bikkura, since: (p.bikkura_since as string) || null, jimuRole: String(p.jimu_role || '') });
    });
    if (data.users.length < 200) break;
  }
  return out.sort((a, b) => Number(b.bikkura) - Number(a.bikkura) || (a.name || a.email).localeCompare(b.name || b.email, 'ja'));
}
export async function loadPonKinds(): Promise<PonKind[]> {
  const { data } = await ike().from('bikkura_task_kinds').select('id, act_pattern, kind, std_minutes, miles, dedupe_per_target_day, note, active, uncapped').like('act_pattern', PON_ACT_PREFIX + '%').order('id');
  return (data || []) as PonKind[];
}
export async function loadPonSettings(): Promise<Record<string, unknown>> {
  const { data } = await ike().from('app_settings').select('value').eq('key', PON_SETTINGS_KEY).maybeSingle();
  return (data?.value as Record<string, unknown>) || {};
}
