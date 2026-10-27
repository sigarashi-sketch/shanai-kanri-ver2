import 'server-only';
import { randomBytes } from 'crypto';
import { db } from './db';
import { DEFAULT_SETTINGS, LIMITS, checkAnswers, cleanQuestions, cleanSettings, newQuestion, type EnqForm, type EnqResponse } from './enquete-types';

// 自前のアンケートフォームの読み書き（saiyou.enq_forms / enq_responses・0018）。決まりは lib/enquete-types.ts
const COLS = 'id, title, description, questions, settings, accepting, created_by, created_at, updated_at';
type Row = Omit<EnqForm, 'count'> & { enq_responses?: { count: number }[] };
const shape = (r: Row): EnqForm => ({
  id: r.id, title: r.title, description: r.description, questions: cleanQuestions(r.questions), settings: cleanSettings(r.settings), accepting: r.accepting,
  created_by: r.created_by, created_at: r.created_at, updated_at: r.updated_at, count: r.enq_responses?.[0]?.count ?? 0,
});

export async function listForms(): Promise<EnqForm[]> {
  const { data, error } = await db().from('enq_forms').select(COLS + ', enq_responses(count)').is('deleted_at', null).order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data || []) as unknown as Row[]).map(shape);
}
export async function getForm(id: string): Promise<EnqForm | null> {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return null;
  const { data } = await db().from('enq_forms').select(COLS + ', enq_responses(count)').eq('id', id).is('deleted_at', null).maybeSingle();
  return data ? shape(data as unknown as Row) : null;
}
// 新しく作る。from があれば その写し（回答は写さない）
export async function createForm(by: string, from?: EnqForm): Promise<EnqForm> {
  const row = {
    id: randomBytes(9).toString('base64url'),
    title: from ? (from.title + ' のコピー').slice(0, LIMITS.title) : '無題のフォーム', description: from?.description || '',
    questions: from ? from.questions : [{ ...newQuestion('radio'), title: '' }],
    settings: from?.settings || DEFAULT_SETTINGS, accepting: true, created_by: by,
  };
  const { data, error } = await db().from('enq_forms').insert(row).select(COLS).single();
  if (error) throw new Error(error.message);
  return shape(data as unknown as Row);
}
export async function saveForm(id: string, v: Partial<EnqForm>): Promise<{ updated_at?: string; error?: string }> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (v.title !== undefined) patch.title = String(v.title).slice(0, LIMITS.title);
  if (v.description !== undefined) patch.description = String(v.description).slice(0, LIMITS.text);
  if (v.questions !== undefined) patch.questions = cleanQuestions(v.questions);
  if (v.settings !== undefined) patch.settings = cleanSettings(v.settings);
  if (v.accepting !== undefined) patch.accepting = !!v.accepting;
  const { data, error } = await db().from('enq_forms').update(patch).eq('id', id).is('deleted_at', null).select('updated_at').maybeSingle();
  if (error) return { error: error.message };
  return data ? { updated_at: data.updated_at } : { error: 'フォームが見つかりません' };
}
// 消す＝印を付けるだけ（回答URLは開けなくなる。回答は表に残る）
export async function removeForm(id: string): Promise<string | null> {
  const { error } = await db().from('enq_forms').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  return error ? error.message : null;
}
export async function listResponses(id: string): Promise<EnqResponse[]> {
  const out: EnqResponse[] = [];
  for (let from = 0; ; from += 1000) {   // PostgREST は1回1000行まで
    const { data, error } = await db().from('enq_responses').select('id, answers, created_at').eq('form_id', id).order('created_at').range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as EnqResponse[]));
    if (!data || data.length < 1000) return out;
  }
}
export async function removeResponse(formId: string, id: string): Promise<string | null> {
  const { error } = await db().from('enq_responses').delete().eq('id', id).eq('form_id', formId);
  return error ? error.message : null;
}
// 回答を受け取る（/f/<id> から・ログイン不要）。設問と突き合わせて 確かめたものだけ保存する
export async function submitAnswers(id: string, raw: unknown): Promise<{ ok: boolean; error?: string; errors?: Record<string, string> }> {
  const f = await getForm(id);
  if (!f) return { ok: false, error: 'フォームが見つかりません' };
  if (!f.accepting) return { ok: false, error: 'このフォームは回答の受け付けを終了しました' };
  const { answers, errors } = checkAnswers(f.questions, (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>);
  if (Object.keys(errors).length) return { ok: false, error: '入力を確かめてください', errors };
  const { error } = await db().from('enq_responses').insert({ form_id: id, answers });
  return error ? { ok: false, error: '保存できませんでした。もう一度お試しください' } : { ok: true };
}
