import 'server-only';
import { db } from './db';

// ぼうさん＝接触禁止の人に 手で付ける印（それゆけ未経験だけの状態・2026-10-11 shoya。表は 0022 saiyou.bousan）。
//   決まりが あいまいなので 自動では付けない。名簿の詳細のチェックで 付け外しする（components/MemberInfo.tsx → /api/s/bousan）。
//   付いている人には こちらから送らない: 面談のリマインド（lib/mendan-remind.ts）・月次アンケートの文章（lib/survey-tpl.ts）・
//     配信（app/api/s/line/broadcast。「友だち全員」の LINE 一斉送信だけは 相手を選べないので 止められない）・
//     自動のタグ「アンケート未回答」（lib/roster.ts。催促の宛先に入らない）。
//   チャットの 1:1 も 止める（同日 shoya「ボタンごと止めて」。入力欄を出さない＋ /api/s/line/send・ask が 403）。送るときは チェックを外す。
//   チャットでは 紫で強調する（lib/tags.ts の 'bousan'）
//   ★送る側は 読めなかったら 送らない（throw する）＝印を確かめられないまま 接触禁止の人へ 送らないため
export const BOUSAN_LABEL = 'ぼうさん';

export async function bousanKeys(): Promise<Set<string>> {
  const { data, error } = await db().from('bousan').select('subject_key').limit(10000);
  if (error) throw new Error('ぼうさんの印を確認できませんでした: ' + error.message);
  return new Set(((data || []) as { subject_key: string }[]).map((r) => r.subject_key));
}
// LINE の userId のうち、紐付け先が ぼうさん のもの
export async function bousanUserIds(userIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!userIds.length) return out;
  const keys = await bousanKeys();
  if (!keys.size) return out;
  for (let i = 0; i < userIds.length; i += 300) {
    const { data, error } = await db().from('line_users').select('user_id, subject_key').in('user_id', userIds.slice(i, i + 300));
    if (error) throw new Error('ぼうさんの印を確認できませんでした: ' + error.message);
    ((data || []) as { user_id: string; subject_key: string }[]).forEach((u) => { if (u.subject_key && keys.has(u.subject_key)) out.add(u.user_id); });
  }
  return out;
}
export async function setBousan(key: string, name: string, on: boolean, by: string): Promise<{ error?: string }> {
  const { error } = on
    ? await db().from('bousan').upsert({ subject_key: key, name, added_by: by }, { onConflict: 'subject_key', ignoreDuplicates: true })
    : await db().from('bousan').delete().eq('subject_key', key);
  return error ? { error: error.message } : {};
}
