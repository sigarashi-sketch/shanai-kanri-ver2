import 'server-only';
import type { CurrentUser } from './auth';
import { audit } from './audit';
import { bousanKeys } from './bousan';
import { db, ike } from './db';
import { pushText } from './line';
import { isLiver, liverNorms } from './livers';
import { normName } from './name';
import { surveyMonthOf } from './survey';
import { cleanRules, fillTpl, latestByPerson, ruleHits, ruleLabel, rulesError, type ScoreRule, type TplTarget } from './survey-tpl-types';

// 月次アンケート「スコア別の文章」のサーバ側（決め方は lib/survey-tpl-types.ts）。
//   送り先は それゆけの公式LINE（インフォメーション）の 1:1。名簿と紐付いた友だち（line_users.subject_key='n:<正規化氏名>'）が ちょうど1人のときだけ送る。
//   ★宛先も本文も ここで引き直す（画面の言い値で送らない）。同じ月分に一度送った人には もう送らない（どの範囲の文章でも）
const KEY = 'survey_templates';

export async function loadRules(): Promise<ScoreRule[]> {
  const { data } = await db().from('settings').select('value').eq('key', KEY).maybeSingle();
  return cleanRules(data?.value);
}
export async function saveRules(v: unknown, by: CurrentUser): Promise<{ rules?: ScoreRule[]; error?: string }> {
  const src = (v as { rules?: unknown } | null)?.rules;
  if (!Array.isArray(src)) return { error: '文章の一覧がありません' };
  const rules = cleanRules(src);
  if (rules.length !== src.length) return { error: 'スコアの範囲は 1〜10 の整数で指定してください（10件まで）' };
  const err = rulesError(rules);
  if (err) return { error: err };
  const { error } = await db().from('settings').upsert({ key: KEY, value: { rules }, updated_by: by.email, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return { error: error.message };
  await audit(by, 'survey:tpl-save', '', { rules: rules.map(ruleLabel) });
  return { rules };
}

// 送信済みの印（'<月分>|<正規化氏名>' → '10/9 送信済み（だれ）'）。画面の行の印と、二重に送らないための確認の両方がこれを読む
export async function sentMap(): Promise<Record<string, string>> {
  const { data, error } = await db().from('line_messages').select('created_at, sender_name, month:payload->surveyTpl->>month, key:payload->surveyTpl->>key')
    .eq('direction', 'out').not('payload->surveyTpl', 'is', null).order('created_at', { ascending: true }).limit(5000);
  if (error) throw new Error('送信の記録を確認できませんでした: ' + error.message);
  const out: Record<string, string> = {};
  for (const m of (data || []) as unknown as { created_at: string; sender_name: string; month: string | null; key: string | null }[]) {
    const d = new Date(new Date(m.created_at).getTime() + 9 * 3600e3);
    out[`${m.month || ''}|${m.key || ''}`] = `${d.getUTCMonth() + 1}/${d.getUTCDate()} 送信済み${m.sender_name ? `（${m.sender_name}）` : ''}`;
  }
  return out;
}

type Target = TplTarget & { userId?: string };
// その月分・その文章が当たる人を、宛先（紐付いた LINE）と 送信済みの印つきで並べる
async function targetsOf(month: string, rule: ScoreRule): Promise<Target[]> {
  const { data, error } = await ike().from('monthly_survey_responses').select('submitted_at, name, manzoku').order('submitted_at', { ascending: false }).limit(5000);
  if (error) throw new Error('回答を読めませんでした: ' + error.message);
  const livers = await liverNorms();   // ライバーは対象外（画面と同じ）
  const rows = ((data || []) as { submitted_at: string; name: string; manzoku: string }[])
    .filter((r) => surveyMonthOf(r.submitted_at) === month && !isLiver(livers, r.name));
  const people = [...latestByPerson(rows, (r) => normName(r.name)).entries()]
    .filter(([, r]) => ruleHits(rule, r.manzoku))
    .sort((a, b) => a[1].submitted_at.localeCompare(b[1].submitted_at));
  if (!people.length) return [];

  const { data: us, error: uErr } = await db().from('line_users').select('user_id, subject_key, followed').in('subject_key', people.map(([k]) => 'n:' + k)).limit(2000);
  if (uErr) throw new Error('LINE の友だちを確認できませんでした: ' + uErr.message);
  const users = (us || []) as { user_id: string; subject_key: string; followed: boolean }[];

  const stop = await bousanKeys();   // ぼうさん（接触禁止）には送らない
  const all = await sentMap();
  const sent = new Map<string, string>();
  for (const [k, v] of Object.entries(all)) if (k.startsWith(month + '|')) sent.set(k.slice(month.length + 1), v);

  return people.map(([key, r]) => {
    const base = { key, name: r.name, manzoku: r.manzoku };
    if (sent.has(key)) return { ...base, status: 'sent' as const, note: sent.get(key)! };
    if (stop.has('n:' + key)) return { ...base, status: 'bousan' as const, note: 'ぼうさん（接触禁止）のため送りません' };
    const mine = users.filter((x) => x.subject_key === 'n:' + key);
    if (!mine.length) return { ...base, status: 'no_line' as const, note: 'LINE が紐付いていません（チャットで紐付けると送れます）' };
    const live = mine.filter((x) => x.followed !== false);
    if (!live.length) return { ...base, status: 'blocked' as const, note: 'ブロック中・友だち解除' };
    if (live.length > 1) return { ...base, status: 'many' as const, note: `紐付いた LINE が${live.length}件あり、どれか決められません` };
    return { ...base, status: 'ok' as const, note: '', userId: live[0].user_id };
  });
}
const pub = ({ key, name, manzoku, status, note }: Target): TplTarget => ({ key, name, manzoku, status, note });

async function ruleOf(month: string, ruleId: string): Promise<{ rule?: ScoreRule; error?: string }> {
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: '月を1つ選んでください（「すべて」では送れません）' };
  const rule = (await loadRules()).find((r) => r.id === ruleId);
  return rule ? { rule } : { error: 'この文章は見つかりません（保存し直してください）' };
}
export async function previewTpl(month: string, ruleId: string): Promise<{ rule?: ScoreRule; targets?: TplTarget[]; error?: string }> {
  const { rule, error } = await ruleOf(month, ruleId);
  if (!rule) return { error };
  try { return { rule, targets: (await targetsOf(month, rule)).map(pub) }; } catch (e) { return { error: (e as Error).message }; }
}
// keys（正規化した氏名）の人へ送る。1回10人まで（画面が小分けに呼ぶ）
export async function sendTpl(month: string, ruleId: string, keys: string[], by: CurrentUser): Promise<{ results?: { key: string; name: string; ok: boolean; error?: string }[]; error?: string }> {
  if (!keys.length || keys.length > 10) return { error: '宛先は 1〜10 人ずつ送ってください' };
  const { rule, error } = await ruleOf(month, ruleId);
  if (!rule) return { error };
  let targets: Target[];
  try { targets = await targetsOf(month, rule); } catch (e) { return { error: (e as Error).message }; }
  const results: { key: string; name: string; ok: boolean; error?: string }[] = [];
  for (const key of keys) {
    const t = targets.find((x) => x.key === key);
    if (!t) { results.push({ key, name: key, ok: false, error: 'この文章の対象ではありません' }); continue; }
    if (t.status !== 'ok' || !t.userId) { results.push({ key, name: t.name, ok: false, error: t.note || '送れません' }); continue; }
    const text = fillTpl(rule.text, t.name);
    const r = await pushText(t.userId, text);
    if (!r.ok) { results.push({ key, name: t.name, ok: false, error: r.error }); continue; }
    const at = new Date().toISOString();
    await db().from('line_messages').insert({
      user_id: t.userId, direction: 'out', type: 'text', text, payload: { surveyTpl: { month, key, rule: ruleLabel(rule) } },
      sender_email: by.email, sender_name: by.name, created_at: at,
    });
    await db().from('line_users').update({ last_message_at: at, last_text: text.slice(0, 200), last_direction: 'out', updated_at: at }).eq('user_id', t.userId);
    results.push({ key, name: t.name, ok: true });
  }
  const n = results.filter((r) => r.ok).length;
  if (n) await audit(by, 'survey:tpl-send', `${month}:${ruleLabel(rule)}`, { month, rule: ruleLabel(rule), sent: n });
  return { results };
}
