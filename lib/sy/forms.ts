import 'server-only';
import type { CurrentUser } from './auth';
import { appRole, loadAccess } from './access';
import { db } from './db';
import { ikeJson } from './ikeike';
import { DEFAULT_FORMS, cleanForms, type FormDef, type FormSheet } from './forms-types';
import { isAdminUp } from './access-types';

// イベント出欠: フォームの一覧（saiyou.settings key='forms'）と、回答シートの読み込み（いけどん経由）。
export async function loadForms(): Promise<FormDef[]> {
  const { data } = await db().from('settings').select('value').eq('key', 'forms').maybeSingle();
  return data?.value ? cleanForms(data.value) : DEFAULT_FORMS;
}
// 一覧を保存する（足す・外す・名前を変える）。admin 以上だけ＝ここに載せたシートは ログインできる全員が読めるようになるため
export async function saveForms(v: unknown, by: CurrentUser): Promise<{ forms?: FormDef[]; error?: string }> {
  if (!isAdminUp(appRole(by, await loadAccess()))) return { error: 'フォームを足せるのは admin と super admin だけです' };
  const forms = cleanForms(v);
  const { error } = await db().from('settings').upsert({ key: 'forms', value: { forms }, updated_by: by.email, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return error ? { error: error.message } : { forms };
}
// 回答シートを読む。いけどんが サービスアカウント → s.igarashi の Google 連携 の順で開く（シートの共有は要らないことが多い）
export async function readForm(f: FormDef, gid: number | null): Promise<FormSheet> {
  const g = gid ?? f.gid;
  return ikeJson<FormSheet>(`/api/survey?action=formSheet&id=${encodeURIComponent(f.sheetId)}${g == null ? '' : `&gid=${g}`}`, { timeoutMs: 30000 });
}
