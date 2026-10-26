import { NextResponse } from 'next/server';
import { ikeFetch, ikeFetchCached, ikeToken } from '@/lib/ike';
import { loadMikeikenSet } from '@/lib/live/mikeiken-server';
import { isMikeiken, onlyMikeiken } from '@/lib/live/mikeiken';
import { roleCan } from '@/lib/live/role';
import { normName, type IkeRosterData } from '@/lib/live/staff';

// 社員（人事）で1人ぶん・その場で読むもの（読むだけ）。名前を URL に出さないように POST の本文で受ける（/api/live/person と同じ）。
//   what:
//     taiou   … 対応歴（GET /api/roster?op=extra&action=getTaiouLog＝今の名簿の「対応歴」と同じ・SELECT だけ）
//     tel     … 電話（GET /api/proxy?action=getRosterData の info.phone だけ。基本情報を見られるロールだけ・ほかの info は返さない）
//     exitGap … 記入漏れチェック（GET /api/roster?op=extra&action=exitGap・SELECT だけ）。名前は要らない
//   ★未経験の人（今のプロパーリストに入っている人）だけ
type Body = { what?: string; name?: string };

export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const b = ((await req.json().catch(() => null)) || {}) as Body;
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 60) : '';
  try {
    const mk = await loadMikeikenSet();
    if (b.what === 'exitGap') {
      const j = await get<{ success?: boolean; ready?: boolean; curYm?: string; rows?: { name: string }[]; error?: string }>('/api/roster?op=extra&action=exitGap');
      if (!j.success) return NextResponse.json({ error: j.error || '記入漏れチェックが読めませんでした' }, { status: 502 });
      return NextResponse.json({ ok: true, ready: j.ready !== false, curYm: j.curYm || '', rows: onlyMikeiken(mk, j.rows || [], 'name') });
    }
    if (!name) return NextResponse.json({ error: '氏名がありません' }, { status: 400 });
    if (!isMikeiken(mk, name)) return NextResponse.json({ error: '未経験の人（今のプロパーリストに入っている人）ではありません' }, { status: 403 });
    if (b.what === 'taiou') {
      const list = await get<unknown>(`/api/roster?op=extra&action=getTaiouLog&name=${encodeURIComponent(name)}`);
      return NextResponse.json({ ok: true, rows: Array.isArray(list) ? list : [] });
    }
    if (b.what === 'tel') {
      if (!(await roleCan('basic'))) return NextResponse.json({ error: 'あなたは電話番号を見られません（基本情報を見られる人だけ・組織表で変えられます）' }, { status: 403 });
      const r = await ikeFetchCached<Omit<IkeRosterData, 'rows'> & { rows?: { name: string; info?: { phone?: string } }[] }>('/api/proxy?action=getRosterData', 60_000);
      if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
      const row = (r.data.rows || []).find((x) => normName(x.name) === normName(name));
      const tel = String(row?.info?.phone || '').replace(/[^\d+]/g, '');
      return NextResponse.json({ ok: true, tel });
    }
    return NextResponse.json({ error: '読む種類が違います' }, { status: 400 });
  } catch (e) {
    const m = (e as Error).message;
    if (m.startsWith('ログインが切れ')) return NextResponse.json({ error: m }, { status: 401 });
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${m}）` }, { status: 502 });
  }
}

async function get<T>(path: string): Promise<T> {
  const r = await ikeFetch(path);
  if (r.status === 401) throw new Error('ログインが切れました。もう一度ログインしてください');
  if (!r.ok) throw new Error(`${path.split('?')[0]}（${r.status}）`);
  return (await r.json()) as T;
}
