import 'server-only';
import { db, ike, onIkeikeDb } from './db';
import { isLiver, liverNorms } from './livers';
import { normName } from './name';
import { DEFAULT_TEIKI, LEADER_LABEL, cleanTeikiSettings, type TeikiRecord, type TeikiSettings } from './teiki-types';

// 定期面談ページのデータ。読むだけ（設定の保存だけ書く）。
//   記録の出どころは2つ（ホームのフィード lib/feed.ts と同じ）:
//     ・それゆけ未経験の面談メモ … saiyou.activities kind='mendan'（書いた人＝actor_email）
//     ・いけどんの対応歴       … public.roster_taiou_log の 定期面談/フォロー面談/面談。
//         書いた人の列が無いので、操作ログ(op_audit_log 'roster:extra:addTaiouLog') を「同じ名前・5分以内」で突き合わせる。
//         操作ログが無い古い記録は担当不明になる。それゆけへ写した分（source_id='ikeike_taiou:<id>'）は二重に出さない
const IKE_MENDAN = ['定期面談', 'フォロー面談', '面談', LEADER_LABEL];
const FIELD_LABEL: [string, string][] = [['genba_kenen', '現場懸念点'], ['kongo_ganbaru', 'これから頑張りたいこと'], ['hyouka_ima', '現状評価されていること']];
function detailsOf(fields: Record<string, unknown> | null | undefined) {
  const f = fields || {}; const out: { k: string; v: string }[] = [];
  FIELD_LABEL.forEach(([k, l]) => { const v = String(f[k] ?? '').trim(); if (v) out.push({ k: l, v }); });
  const h = String(f.benkyou_hours ?? '').trim();
  if (h) out.push({ k: '勉強時間', v: `${h}時間${f.benkyou_unit ? `／${String(f.benkyou_unit)}` : ''}` });
  return out;
}

export async function loadTeikiSettings(): Promise<TeikiSettings> {
  const { data } = await db().from('settings').select('value').eq('key', 'teiki').maybeSingle();
  return data?.value ? cleanTeikiSettings(data.value) : DEFAULT_TEIKI;
}
export async function saveTeikiSettings(v: unknown, by: string): Promise<{ settings?: TeikiSettings; error?: string }> {
  const settings = cleanTeikiSettings(v);
  const { error } = await db().from('settings').upsert({ key: 'teiki', value: settings, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return error ? { error: error.message } : { settings };
}

export async function loadTeikiRecords(): Promise<{ records: TeikiRecord[]; warnings: string[] }> {
  const warnings: string[] = [];
  type Act = { id: string; subject_key: string; name: string; label: string; body: string; actor_name: string; actor_email: string; created_at: string; fields: Record<string, unknown> | null; source_id: string | null };
  type Taiou = { id: string; name: string | null; kind: string | null; body: string | null; created_at: string; fields: Record<string, unknown> | null };
  type Audit = { at: string; actor: string | null; target: string | null };
  const useIke = onIkeikeDb();
  const [acts, taiou, audit, livers] = await Promise.all([
    db().from('activities').select('id, subject_key, name, label, body, actor_name, actor_email, created_at, fields, source_id').eq('kind', 'mendan').order('created_at', { ascending: false }).limit(5000),
    useIke ? ike().from('roster_taiou_log').select('id, name, kind, body, created_at, fields').in('kind', IKE_MENDAN).order('created_at', { ascending: false }).limit(5000) : Promise.resolve({ data: [] as Taiou[], error: null }),
    useIke ? ike().from('op_audit_log').select('at, actor, target').eq('action', 'roster:extra:addTaiouLog').order('at', { ascending: false }).limit(5000) : Promise.resolve({ data: [] as Audit[], error: null }),
    liverNorms(),
  ]);
  if (acts.error) warnings.push('面談メモ: ' + acts.error.message);
  if (taiou.error) warnings.push('いけどんの対応歴: ' + taiou.error.message);
  if (audit.error) warnings.push('操作ログ: ' + audit.error.message);
  // 操作ログ → 「誰が書いたか」。名前ごとに時刻を持っておく
  const who = new Map<string, { t: number; actor: string }[]>();
  ((audit.data || []) as Audit[]).forEach((a) => { const k = normName(a.target); if (!k || !a.actor) return; who.set(k, [...(who.get(k) || []), { t: Date.parse(a.at), actor: a.actor.toLowerCase() }]); });
  const actorOf = (name: string, at: string) => { const t = Date.parse(at); return (who.get(normName(name)) || []).find((x) => Math.abs(x.t - t) < 5 * 60e3)?.actor || ''; };

  const records: TeikiRecord[] = [];
  const copied = new Set<string>();
  ((acts.data || []) as Act[]).forEach((a) => {
    if (!a.name || isLiver(livers, a.name)) return;
    if (a.source_id) copied.add(a.source_id);
    // いけどんから写した分は actor が「いけどんから移行」なので、操作ログから書いた人を引く
    const email = (a.actor_email || '').toLowerCase() || actorOf(a.name, a.created_at);
    records.push({ id: 'ac' + a.id, key: a.subject_key || 'n:' + normName(a.name), name: a.name, at: a.created_at, label: a.label || '面談', body: a.body || '', tantou: email, tantouName: a.actor_email ? a.actor_name || '' : '', details: detailsOf(a.fields), source: 'soreike', leader: a.label === LEADER_LABEL });
  });
  ((taiou.data || []) as Taiou[]).forEach((t) => {
    const name = String(t.name || '').trim();
    if (!name || copied.has('ikeike_taiou:' + t.id) || isLiver(livers, name)) return;
    records.push({ id: 'tl' + t.id, key: 'n:' + normName(name), name, at: t.created_at, label: String(t.kind || '面談'), body: t.body || '', tantou: actorOf(name, t.created_at), tantouName: '', details: detailsOf(t.fields), source: 'ikeike', leader: t.kind === LEADER_LABEL });
  });
  records.sort((a, b) => b.at.localeCompare(a.at));
  // 同じ人に同じ本文を同じ日に書いたもの（いけどんと それゆけ の両方に書いた・押し直した）は1件に畳む。担当が分かるほうを残す
  const day = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  const seen = new Map<string, number>(); const out: TeikiRecord[] = [];
  records.forEach((r) => {
    const body = r.body.replace(/\s+/g, '');
    const k = body ? `${r.key}|${day(r.at)}|${body}` : r.id;
    const i = seen.get(k);
    if (i == null) { seen.set(k, out.length); out.push(r); } else if (!out[i].tantou && r.tantou) out[i] = { ...out[i], tantou: r.tantou, tantouName: r.tantouName };
  });
  return { records: out, warnings };
}
