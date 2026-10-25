import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { normName } from '@/lib/live/eigyo-common';
import { MIKEIKEN_PATH, isMikeiken, mikeikenSetOf } from '@/lib/live/mikeiken';
import type { EngineerRows } from '@/lib/live/eigyo-common';
import { roleCan } from '@/lib/live/role';

// 要員マップ（保留）で駅の丸から名前の「詳細」を押したときの中身。読むだけ。名前は URL に出さないので POST で受ける。
//   今の map.html と同じ順：proxy?action=getGroups で 名前 → グループの key を当てて（前方一致 → 含む の順）、
//   proxy?action=getPersonDetail&key= を読む（どちらも今のシステムで SELECT だけ）
//   ・未経験の人（今のプロパーリストにいる人）だけ
//   ・メモ（営業用リストのメモ）は返さない（自由記述で体のことが書かれうる＝出すかは shoya が決める）
//   ・額面はロールで伏せる（単価・額面を見られるロールだけ）
type Group = { name?: string };
type Detail = {
  name?: string; eki?: string; kadou?: string; zokusei?: string; kibou?: string; shifts?: string[]; summary?: string; experience?: string;
  gakumen?: string; sukishi?: string; memo?: string; availability?: { items?: { label: string; val: string }[]; updatedAt?: string }; error?: string;
};
const n = (s: unknown) => String(s || '').replace(/[\s　]+/g, '').replace(/(さん|サン|様|君|くん)$/, '');

function keyFor(groups: Record<string, Group>, name: string): string | null {
  const map = new Map<string, string>();
  for (const [k, g] of Object.entries(groups || {})) { const x = n(g?.name); if (x && !map.has(x)) map.set(x, k); }
  const q = n(name);
  if (map.has(q)) return map.get(q)!;
  for (const [x, k] of map) if (x.startsWith(q) || q.startsWith(x)) return k;
  for (const [x, k] of map) if (x.includes(q) || q.includes(x)) return k;
  return null;
}

export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { name?: string };
  const name = String(b.name || '').trim();
  if (!name || name.length > 60) return NextResponse.json({ error: '名前がありません' }, { status: 400 });
  try {
    const [er, gr] = await Promise.all([ikeFetch(MIKEIKEN_PATH), ikeFetch('/api/proxy?action=getGroups')]);
    if (er.status === 401 || gr.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    const set = mikeikenSetOf(er.ok ? ((await er.json()) as EngineerRows) : null);
    if (!isMikeiken(set, normName(name))) return NextResponse.json({ error: '未経験の人（プロパーリストにいる人）ではないので出しません' }, { status: 404 });
    const groups = gr.ok ? ((await gr.json()) as Record<string, Group>) : {};
    const key = keyFor(groups, name);
    if (!key) return NextResponse.json({ error: 'この人の LINE グループが見つかりません（詳細は要員リストから見てください）' }, { status: 404 });
    const r = await ikeFetch(`/api/proxy?action=getPersonDetail&key=${encodeURIComponent(key)}`);
    const d = (await r.json().catch(() => ({}))) as Detail;
    if (!r.ok || d.error) return NextResponse.json({ error: d.error || `読めませんでした（${r.status}）` }, { status: r.ok ? 502 : r.status });
    const price = await roleCan('price');
    const { memo: _memo, gakumen, ...rest } = d;
    void _memo;
    return NextResponse.json({ ok: true, ...rest, gakumen: price ? gakumen || '' : '', priceHidden: !price && !!gakumen });
  } catch (e) {
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
