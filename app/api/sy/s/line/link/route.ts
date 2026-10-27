import { NextResponse, type NextRequest } from 'next/server';
import { audit } from '@/lib/sy/audit';
import { apiUser } from '@/lib/sy/api';
import { db } from '@/lib/sy/db';

// LINEの友だちを名簿の人と紐付ける。
//   { user, key, name }            … 名簿の人（従業員 n:… / 候補者 p:…）と紐付け
//   { user, action:'candidate' }   … LINEの名前で候補者を新規作成して紐付け
//   { user, key:'' }               … 紐付けを外す
//   { user, key, check: true }     … 書かずに確かめるだけ: その人（key）に もうつながっている ほかの LINE の表示名（taken）を返す。
//     画面は これと「いまの紐付け先」を並べて 確認を出してから 本番の呼び出しをする（2026-10-22 後藤さんの LINE に平塚さんを つないでしまった件）
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { user?: string; key?: string; name?: string; action?: string };
  const uid = String(b.user || '');
  if (!uid) return NextResponse.json({ error: 'user が必要です' }, { status: 400 });
  let key = String(b.key || ''); let name = String(b.name || '');
  if (b.action === 'candidate') {
    const { data: lu } = await db().from('line_users').select('display_name').eq('user_id', uid).single();
    name = String(b.name || lu?.display_name || '').trim() || 'LINEの友だち';
    const { data, error } = await db().from('people').insert({
      name, normalized_name: name.replace(/[\s　]+/g, ''), stage: '営業中', source: 'line', recruit_tantou: '',
    }).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    key = 'p:' + data.id;
    await db().from('activities').insert({ subject_key: key, person_id: data.id, name, kind: 'stage', body: '公式LINEから候補者登録（営業中）', actor_email: u.email, actor_name: u.name });
  } else if (key && !/^(n|p):.+/.test(key)) {
    return NextResponse.json({ error: 'key が不正です' }, { status: 400 });
  }
  if ((b as { check?: boolean }).check) {
    if (!key) return NextResponse.json({ ok: true, taken: [] });
    const { data } = await db().from('line_users').select('display_name').eq('subject_key', key).eq('followed', true).neq('user_id', uid).limit(5);
    return NextResponse.json({ ok: true, taken: (data || []).map((r) => String(r.display_name || '（名前なし）')) });
  }
  const { error } = await db().from('line_users').update({ subject_key: key, subject_name: key ? name : '', updated_at: new Date().toISOString() }).eq('user_id', uid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // 画面が勝手にやる紐付け（名前が一致した相手の自動紐付け・auto）は 人の操作ではないので残さない
  if (!(b as { auto?: boolean }).auto) await audit(u, key ? 'link:set' : 'link:unset', uid);
  return NextResponse.json({ ok: true, key, name });
}
