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
//     linegroup … POST /api/roster?op=linegroup&action=save    {name, groupId}
//   ★未経験の人（今のプロパーリストに入っている人）にだけ書く。プロパーリストが読めなければ書かない
//   ★saveRosterStatus は「退社・退社日・待機」を毎回まるごと書き直す口なので、今の値（getRosterStatus）を読んでから変える所だけ差し替える
//     （読めなければ書かない＝黙って退社を外さない）。答えに元の値（prev）を付けて返す＝画面の「取り消す」で戻せる
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
  if (w.kind === 'status') return saveStatus(req, w);
  const t = target(w);
  return ikeWrite(req, t.path, t.body, { method: t.method });
}

function target(w: Exclude<StaffWrite, { kind: 'status' }>): { path: string; body: unknown; method: 'POST' | 'GET' } {
  switch (w.kind) {
    case 'eki': return { path: '/api/roster?op=eki&action=save', body: { name: w.name, field: w.field, value: w.value }, method: 'POST' };
    case 'nyusha': return { path: '/api/roster?op=nyusha&action=save', body: { name: w.name, field: w.field, value: w.value }, method: 'POST' };
    case 'sales': return { path: '/api/roster?op=extra&action=saveSalesField', body: { name: w.name, field: w.field, value: w.value }, method: 'POST' };
    case 'tantou': return { path: '/api/roster?op=extra&action=saveTantou', body: { name: w.name, value: w.value }, method: 'POST' };
    case 'taiou': return { path: '/api/roster?op=extra&action=addTaiouLog', body: { name: w.name, kind: w.taiouKind, body: w.body, fields: w.fields }, method: 'POST' };
    case 'linegroup': return { path: '/api/roster?op=linegroup&action=save', body: { name: w.name, groupId: w.groupId }, method: 'POST' };
    case 'flag': {
      const q = new URLSearchParams({ action: 'setEngineerStatusByName', name: w.name, statusKey: w.statusKey, value: w.value ? 'true' : 'false' });
      return { path: `/api/proxy?${q}`, body: null, method: 'GET' };
    }
  }
}

async function saveStatus(req: Request, w: Extract<StaffWrite, { kind: 'status' }>): Promise<NextResponse> {
  const nn = normName(w.name);
  let cur: IkeRosterStatus | undefined;
  try {
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
  const res = await ikeWrite(req, `/api/proxy?${q}`, null, { method: 'GET' });
  if (!res.ok) return res;
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  // 取り消し用：変えた項目だけ元の値
  const undo = Object.fromEntries(Object.keys(p).map((k) => [k, prev[k as keyof typeof prev]]));
  return NextResponse.json({ ...j, ok: true, prev: undo });
}
