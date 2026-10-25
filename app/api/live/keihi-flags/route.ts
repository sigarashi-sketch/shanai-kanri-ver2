import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { cached, userKey } from '@/lib/cache';
import { loadMikeikenSet } from '@/lib/live/mikeiken-server';
import { mikeikenKey } from '@/lib/live/mikeiken';
import {
  buildKeihiFlags, type FlagKind, type IkeHabits, type IkeKekkinLite, type IkeShiftListLite, type IkeShimeLite, type IkeTodayLite, type KeihiFlagsResp,
} from '@/lib/live/keihi-flags';

// 交通費・経費の「勤怠の印」（打刻漏れ・シフト表・欠勤の報告・勤務表とのずれ）。lib/live/keihi-flags.ts を参照。
//   ★読むだけ。呼ぶのは次の GET だけ（どれも今のシステム側で SELECT しかしない・freee には問い合わせない）：
//     attendance-board?action=habits（DB の freee キャッシュ・10分控え）／kintai-today?stale=1（キャッシュだけ）／
//     shift-calendar?action=list&month= ／ roster?op=kekkin&action=list&month= ／ roster?op=shime&action=board
//     月ごとの口は 申請に出てくる月（最大3つ）× 2本だけ。1日ずつは呼ばない
//   ★名前は URL に載せない（月だけ受け取り、返すのは未経験の人の分だけ）。理由・メモ・時間は返さない
//   ★どれかが読めない（権限が無い等）ときは、その種類の印を出さないだけ（read[kind]=false で画面に「確かめられていない」と出す）
//   ★10-25 答えはその人だけ3分控える（lib/cache.ts・キーに月が入る）。?refresh=1 で読み直す
class AuthGone extends Error {}

async function getJson<T>(path: string): Promise<T> {
  const r = await ikeFetch(path);
  if (r.status === 401) throw new AuthGone();
  if (!r.ok) throw new Error(`${path.split('?')[0]}（${r.status}）`);
  return (await r.json()) as T;
}
const soft = <T,>(p: Promise<T>) => p.catch((e) => { if (e instanceof AuthGone) throw e; return null; });
const YM = /^\d{4}-\d{2}$/;

export async function GET(req: Request) {
  const token = await ikeToken();
  if (!token) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const months = [...new Set((sp.get('ym') || '').split(',').filter((m) => YM.test(m)))].sort().reverse().slice(0, 3);
  if (!months.length) return NextResponse.json({ ok: true, months: [], people: {}, read: { dakoku: false, shift: false, kekkin: false, zure: false } } satisfies KeihiFlagsResp);
  try {
    const { v } = await cached(`${userKey(token)}|keihi-flags|${months.join(',')}`, 3 * 60_000, () => build(months), {
      refresh: sp.get('refresh') === '1',
      keep: (x) => Object.values(x.read).every(Boolean),   // 読めなかった材料がある答えは控えない（次に開いたときにもう一度読む）
    });
    return NextResponse.json(v);
  } catch (e) {
    if (e instanceof AuthGone || (e as Error).message.startsWith('ログインが切れ')) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}

async function build(months: string[]): Promise<KeihiFlagsResp> {
    const [mk, habits, today, shime, shiftL, kekkinL] = await Promise.all([
      loadMikeikenSet(),
      soft(getJson<IkeHabits>('/api/attendance-board?action=habits')),
      soft(getJson<IkeTodayLite>('/api/kintai-today?stale=1')),
      soft(getJson<IkeShimeLite>('/api/roster?op=shime&action=board')),
      Promise.all(months.map((m) => soft(getJson<IkeShiftListLite>(`/api/shift-calendar?action=list&month=${m}`)))),
      Promise.all(months.map((m) => soft(getJson<IkeKekkinLite>(`/api/roster?op=kekkin&action=list&month=${m}`)))),
    ]);
    const shift = Object.fromEntries(months.map((m, i) => [m, shiftL[i]]));
    const kekkin = Object.fromEntries(months.map((m, i) => [m, kekkinL[i]]));
    const people = buildKeihiFlags(months, { habits, today, shift, kekkin, shime }, (k) => mk.has(mikeikenKey(k)));
    const read: Record<FlagKind, boolean> = {
      dakoku: !!habits?.ok,
      shift: !!today?.ok && shiftL.every((x) => x?.ok),
      kekkin: kekkinL.every((x) => x?.ok),
      zure: !!shime?.ok,
    };
    return { ok: true, months, people, read, habitsFrom: habits?.from, habitsTo: habits?.to } satisfies KeihiFlagsResp;
}
