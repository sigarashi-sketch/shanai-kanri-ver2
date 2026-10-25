import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { ikeWrite, sameSite } from '@/lib/ike-write';
import { loadMikeikenSet } from '@/lib/live/mikeiken-server';
import { isMikeiken } from '@/lib/live/mikeiken';
import { normName, type IkeRosterStatus } from '@/lib/live/staff';
import { parseStaffWrite, type StaffWrite } from '@/lib/live/staff-write';

// 社員（人事）から今の社内システムの名簿に書く口（10-25 shoya「いけドンにあったのは全部いれて」「参画とか辞退ボタンとかもね」）。
//   ★行き先は kind ごとにここで決め打ち（画面は kind と値しか送れない）。今の名簿（roster.html）と同じ口・同じ値：
//     status    … GET  /api/proxy?action=saveRosterStatus（退社・退社日・待機・手で選んだ状態・待機/退社の予約。値はクエリで渡す＝今の名簿と同じ）
//     eki       … POST /api/roster?op=eki&action=save          {name, field, value}
//     nyusha    … POST /api/roster?op=nyusha&action=save       {name, field, value}
//     sales     … POST /api/roster?op=extra&action=saveSalesField {name, field, value}（再アサイン・参画決定・入場日）
//     tantou    … POST /api/roster?op=extra&action=saveTantou  {name, value}
//     flag      … GET  /api/proxy?action=setEngineerStatusByName（辞退・ぽあ・参画決定。ダッシュボードの「辞退にチェック」と同じ）
//     taiou     … POST /api/roster?op=extra&action=addTaiouLog {name, kind, body, fields}
//   ★未経験の人（今のプロパーリストに入っている人）にだけ書く。プロパーリストが読めなければ書かない
//   ★saveRosterStatus は「退社・退社日・待機」を毎回まるごと書き直す口なので、今の値（getRosterStatus）を読んでから変える所だけ差し替える
//     （読めなければ書かない＝黙って退社を外さない）。答えに元の値（prev）を付けて返す＝画面の「取り消す」で戻せる
//   ★人の番号（応募ID・0365・10-25）: 退社・待機／入社日／営業リストの印（status・nyusha・sales・flag）は person_id を付けて送る。
//     番号は画面が送ったもの（その名前の応募にあるものだけ）→ 無ければいまの名簿の行の人（roster?op=person&action=one・SELECT だけ）。
//     同姓同名でも別の人の行を書き換えない。今のシステムが古くて番号を読めなければ、今までどおり氏名で送る
export async function POST(req: Request) {
  if (!sameSite(req)) return NextResponse.json({ error: 'この画面の外からは保存できません' }, { status: 403 });
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const w = parseStaffWrite(await req.json().catch(() => null));
  if (typeof w === 'string') return NextResponse.json({ error: w }, { status: 400 });
  try {
    if (!isMikeiken(await loadMikeikenSet(), w.name)) return NextResponse.json({ error: '未経験の人（今のプロパーリストに入っている人）ではないので、ここからは書けません' }, { status: 403 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
  let one: PersonOne | null = null;
  if (w.kind === 'status' || w.kind === 'nyusha' || w.kind === 'sales' || w.kind === 'flag') {
    const got = await readOne(w.name, w.personId);
    if (got === 'gone') return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    if (got && w.personId && got.personId !== w.personId) return NextResponse.json({ error: 'この名前の応募にその人の番号がありません' }, { status: 400 });
    one = got;
  }
  const pid = one?.personId || '';
  if (w.kind === 'status') return saveStatus(req, w, one);
  const t = target(w, pid);
  return ikeWrite(req, t.path, t.body, { method: t.method });
}

/** 今のシステムの roster?op=person&action=one の返り（使う分だけ） */
type PersonOne = {
  ok: true; personId: string; candidates: number;
  status: { where: 'main' | 'extra'; value: IkeRosterStatus | null };
  nyusha: { where: 'main' | 'extra'; value: { nyushaBi?: string; shokaiEnd?: string; taijouBi?: string } | null };
};
/** その人の番号と今の値（読むだけ）。今のシステムが古くて読めなければ null（＝今までどおり氏名で書く） */
async function readOne(name: string, personId?: string): Promise<PersonOne | null | 'gone'> {
  try {
    const q = new URLSearchParams({ op: 'person', action: 'one', name });
    if (personId) q.set('personId', personId);
    const r = await ikeFetch(`/api/roster?${q}`);
    if (r.status === 401) return 'gone';
    if (!r.ok) return null;
    const j = (await r.json()) as PersonOne;
    return j && j.ok && typeof j.personId === 'string' && j.status ? j : null;
  } catch {
    return null;
  }
}

function target(w: Exclude<StaffWrite, { kind: 'status' }>, pid: string): { path: string; body: unknown; method: 'POST' | 'GET' } {
  const person: Record<string, string> = pid ? { person_id: pid } : {};
  switch (w.kind) {
    case 'eki': return { path: '/api/roster?op=eki&action=save', body: { name: w.name, field: w.field, value: w.value }, method: 'POST' };
    case 'nyusha': return { path: '/api/roster?op=nyusha&action=save', body: { name: w.name, field: w.field, value: w.value, ...person }, method: 'POST' };
    case 'sales': return { path: '/api/roster?op=extra&action=saveSalesField', body: { name: w.name, field: w.field, value: w.value, ...person }, method: 'POST' };
    case 'tantou': return { path: '/api/roster?op=extra&action=saveTantou', body: { name: w.name, value: w.value }, method: 'POST' };
    case 'taiou': return { path: '/api/roster?op=extra&action=addTaiouLog', body: { name: w.name, kind: w.taiouKind, body: w.body, fields: w.fields }, method: 'POST' };
    case 'flag': {
      const q = new URLSearchParams({ action: 'setEngineerStatusByName', name: w.name, statusKey: w.statusKey, value: w.value ? 'true' : 'false', ...person });
      return { path: `/api/proxy?${q}`, body: null, method: 'GET' };
    }
  }
}

async function saveStatus(req: Request, w: Extract<StaffWrite, { kind: 'status' }>, one: PersonOne | null): Promise<NextResponse> {
  const nn = normName(w.name);
  let cur: IkeRosterStatus | undefined;
  // 人の番号がわかっていれば、その人の分の今の値（同姓同名で氏名の行が別の人のものなら、その人の別置きの分）
  if (one?.personId) cur = one.status.value || undefined;
  else try {
    const r = await ikeFetch('/api/proxy?action=getRosterStatus');
    if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    if (!r.ok) throw new Error(String(r.status));
    const list = (await r.json()) as IkeRosterStatus[];
    if (!Array.isArray(list)) throw new Error('形が違います');
    cur = list.find((x) => x.normalized_name === nn);
  } catch (e) {
    return NextResponse.json({ error: `今の退社・待機の印が読めないので保存しませんでした（${(e as Error).message}）` }, { status: 502 });
  }
  const p = w.patch;
  const prev = {
    taisha: !!cur?.taisha, taishaBi: cur?.taisha_bi || '', taiki: !!cur?.taiki, override: cur?.status_override || '',
    taikiYotei: cur?.taiki_yotei_bi || '', taishaYotei: cur?.taisha_yotei_bi || '',
  };
  const q = new URLSearchParams({
    action: 'saveRosterStatus', normalized_name: nn, name: cur?.name || w.name,
    taisha: (p.taisha ?? prev.taisha) ? '1' : '0', taisha_bi: p.taishaBi ?? prev.taishaBi, taiki: (p.taiki ?? prev.taiki) ? '1' : '0',
  });
  // 今の名簿と同じ：手でチェックを入れたら、その予約は用済み（残すと翌朝もう一度入れに来る）
  if (p.taisha === true && prev.taishaYotei && !('taishaYotei' in p)) p.taishaYotei = '';
  if (p.taiki === true && prev.taikiYotei && !('taikiYotei' in p)) p.taikiYotei = '';
  if ('override' in p) q.set('status_override', p.override || '');
  if ('taikiYotei' in p) q.set('taiki_yotei_bi', p.taikiYotei || '');
  if ('taishaYotei' in p) q.set('taisha_yotei_bi', p.taishaYotei || '');
  if (one?.personId) q.set('person_id', one.personId);
  const res = await ikeWrite(req, `/api/proxy?${q}`, null, { method: 'GET' });
  if (!res.ok) return res;
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  // 取り消し用：変えた項目だけ元の値
  const undo = Object.fromEntries(Object.keys(p).map((k) => [k, prev[k as keyof typeof prev]]));
  return NextResponse.json({ ...j, ok: true, prev: undo });
}
