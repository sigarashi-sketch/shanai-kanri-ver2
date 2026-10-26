import { NextResponse } from 'next/server';
import { ikeWrite, sameSite } from '@/lib/ike-write';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { blockReason, caseTitle, matchGroupName, normName, type ProgressData } from '@/lib/live/eigyo-common';

// 営業（/eigyo/*）の書く口（10-26 shoya「今週で本番に使えるようにするから、入ってないとこ全部」）。行き先は action ごとに決め打ち：
//   judge         {caseNo, gid, name, status:'OK'|'NG'|'OTHER'|'', prev}  → /api/proxy?action=markSlackForwarded（案件進捗の📮判断。OK は今と同じく Slack の案件スレッドへ）
//   directDecide  {id, decision, caseNo?}                                  → /api/roster?op=eigyo&action=directDecide（グループ直接の回収）
//   directUndo    {id}                                                     → /api/roster?op=eigyo&action=directUndo
//   taikiSave     {name, personId?, state?, nextCase?}                     → /api/roster?op=eigyo&action=taikiSave
//   kettei        {name, value, personId?}                                 → /api/proxy?action=setEngineerStatusByName（プロパーリストの「参画決定」）
//   casePlan      {kNo, names[]}   … 送る前の確かめ（送らない）。本文・送り先のグループ・見つからない人・今のシステムの dry（健全性・アダルト/店舗運営）
//   caseSend      {kNo, names[]}   → /api/proxy?action=send（今の配信画面の「送信」と同じ口。LINE グループへ届く）
//                                    ★本文は ver2 で決める（今の配信画面と同じ：案件の本文そのまま）＝画面から好きな文を送らせない
//                                    ★アダルト・店舗運営系は ver2 でも止め、今のシステムの送信関数でも止まる（二重）
//   slackSync     {}               → /api/proxy?action=syncSlackCache（要員マップの「案件を更新」＝Slack の案件を取り直す）
//   map*          → /api/cases-map?action=…（案件マップ：extract / create / fill / close / unreserve / reopen / sync）
//   nippo*        → /api/nippo（成約日報：submit（dry=確かめるだけ）/ fill / pref）
//   ★権限の判定は今の社内システム（ログインした人のトークン）。ログに名前・本文を出さない
// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
const txt = (v: unknown, max: number) => String(v ?? '').replace(CTRL, '').trim().slice(0, max);
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const CASE_NO = /^[A-Za-z]{1,3}[0-9A-Za-z-]{1,30}$/;
const GID = /^[CU][0-9a-f]{32}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const JUDGE = ['OK', 'NG', 'OTHER', ''];
const TAIKI_STATES = ['案件を探す', '案件を送った', '面談調整中', '参画決定', 'いったん保留'];
const MAP_CATS = ['事務', '軽作業', 'コールセンター', '製造', 'IT・SE', '営業', '販売', '生産管理', 'その他'];   // 今の api/_cases_map.ts CATEGORIES と同じ

type Groups = Record<string, { name: string; id: string }>;
type Target = { name: string; groupId: string; groupName: string };

/** 案件の本文と、送る人のグループを決める（plan と send で同じ決め方） */
async function resolveSend(kNo: string, names: string[]): Promise<{ error: string } | { title: string; msg: string; targets: Target[]; missing: string[]; ng: string | null; filter: string }> {
  const [pr, gr] = await Promise.all([ikeFetch('/api/proxy?action=getProgressData'), ikeFetch('/api/proxy?action=getGroups', undefined, 30000)]);
  if (pr.status === 401 || gr.status === 401) return { error: 'ログインが切れました。もう一度ログインしてください' };
  if (!pr.ok || !gr.ok) return { error: `今の社内システムから読めませんでした（${pr.ok ? gr.status : pr.status}）` };
  const pd = (await pr.json().catch(() => ({}))) as ProgressData;
  const groups = (await gr.json().catch(() => ({}))) as Groups;
  const filter = gr.headers.get('x-group-filter') || '';
  const c = (pd.cases || []).find((x) => x.kNo === kNo);
  if (!c) return { error: 'この案件が案件ストックに見つかりません（画面を読み直してください）' };
  const msg = String(c.content || '').trim();
  const gl = Object.values(groups || {}).filter((g) => g && GID.test(String(g.id)));
  const targets: Target[] = [], missing: string[] = [];
  for (const name of names) {
    const n = normName(name);
    const hits = gl.filter((g) => matchGroupName(g.name, [n]) === n);
    if (!hits.length) { missing.push(name); continue; }
    for (const g of hits) if (!targets.some((t) => t.groupId === g.id)) targets.push({ name, groupId: g.id, groupName: g.name });
  }
  return { title: caseTitle(pd, c), msg, targets, missing, ng: blockReason(msg), filter };
}

export async function POST(req: Request) {
  if (!sameSite(req)) return bad('この画面の外からは保存できません', 403);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action || '');

  if (action === 'judge') {
    const caseNo = txt(b.caseNo, 40), gid = txt(b.gid, 40), status = txt(b.status, 8), prev = txt(b.prev, 8);
    if (!CASE_NO.test(caseNo) || !GID.test(gid)) return bad('案件か送り先が正しくありません');
    if (!JUDGE.includes(status) || !JUDGE.includes(prev)) return bad('判断が正しくありません');
    const res = await ikeWrite(req, '/api/proxy?action=markSlackForwarded', { caseNo, gid, name: txt(b.name, 120), status, prev }, { timeoutMs: 60000 });
    if (res.ok) return res;
    // 他の人が先に押していた（今のシステムは書かずに今の値を返す）→ 誰が何にしたかを文にして返す
    const j = (await res.json().catch(() => ({}))) as { conflict?: boolean; status?: string; judgedBy?: string; error?: string };
    if (j.conflict) {
      const lab: Record<string, string> = { OK: 'OK', NG: 'NG', OTHER: 'その他' };
      return NextResponse.json({ conflict: true, status: j.status || '', error: `${j.judgedBy ? `${j.judgedBy} さん` : '他の人'}が先に${j.status ? `「${lab[j.status] || j.status}」にしていました` : '判断を外していました'}。保存していません（Slack にも流していません）` }, { status: 409 });
    }
    return NextResponse.json(j, { status: res.status });
  }

  if (action === 'directDecide') {
    const id = txt(b.id, 200), decision = txt(b.decision, 10), caseNo = txt(b.caseNo, 40);
    if (!/^ce_[\w.:-]{1,180}$/.test(id) || !['case', 'not_case'].includes(decision)) return bad('指定が違います');
    if (caseNo && !CASE_NO.test(caseNo)) return bad('案件No が正しくありません');
    return ikeWrite(req, '/api/roster?op=eigyo&action=directDecide', { id, decision, caseNo });
  }
  if (action === 'directUndo') {
    const id = txt(b.id, 200);
    if (!/^ce_[\w.:-]{1,180}$/.test(id)) return bad('指定が違います');
    return ikeWrite(req, '/api/roster?op=eigyo&action=directUndo', { id });
  }

  if (action === 'taikiSave') {
    const name = txt(b.name, 60);
    if (!name) return bad('氏名がありません');
    const body: Record<string, unknown> = { name };
    if (b.personId !== undefined) body.personId = txt(b.personId, 40);
    if (b.state !== undefined) { const st = txt(b.state, 20); if (!TAIKI_STATES.includes(st)) return bad('状態が正しくありません'); body.state = st; }
    if (b.nextCase !== undefined) { const c = txt(b.nextCase, 40); if (c && !CASE_NO.test(c)) return bad('案件No が正しくありません'); body.nextCase = c; }
    return ikeWrite(req, '/api/roster?op=eigyo&action=taikiSave', body);
  }

  // 待機の人を「参画決定」にしたとき、プロパーリストの「参画決定」にも付ける（今のダッシュボード・プロパーリストと同じ口）
  if (action === 'kettei') {
    const name = txt(b.name, 60);
    if (!name) return bad('氏名がありません');
    return ikeWrite(req, '/api/proxy?action=setEngineerStatusByName', { name, statusKey: '参画決定', value: b.value === false ? 'false' : 'true', person_id: txt(b.personId, 40) });
  }

  if (action === 'casePlan' || action === 'caseSend') {
    if (!(await ikeToken())) return bad('not_logged_in', 401);
    const kNo = txt(b.kNo, 40);
    const names = Array.isArray(b.names) ? [...new Set(b.names.map((n) => txt(n, 60)).filter(Boolean))].slice(0, 50) : [];
    if (!CASE_NO.test(kNo)) return bad('案件を選んでください');
    if (!names.length) return bad('送る人を選んでください');
    let r: Awaited<ReturnType<typeof resolveSend>>;
    try { r = await resolveSend(kNo, names); } catch (e) { return bad(`今の社内システムから読めませんでした（${(e as Error).message}）`, 502); }
    if ('error' in r) return bad(r.error, 502);
    if (r.ng) return bad(r.ng);
    if (r.filter !== 'applied') return bad('営業中の人の絞り込みが今のシステムで確かめられないので、送りません（今の配信画面で確かめてください）', 409);
    if (!r.targets.length) return bad(`送り先の LINE グループが見つかりません（${r.missing.join('、')}）`);
    const to = r.targets.map((t) => t.groupId).join(',');
    if (action === 'casePlan') {
      // 今のシステムの dry（送らない）：営業リストの健全性・アダルト/店舗運営・NGワード・もう送った相手を確かめる
      const dry = await ikeWrite(req, '/api/proxy?action=send', { to, msg: r.msg, kNo, dry: '1' }, { timeoutMs: 60000 });
      const dj = (await dry.json().catch(() => ({}))) as { blocked?: boolean; error?: string; recipients?: number; willSkip?: number };
      if (!dry.ok || dj.blocked) return bad(dj.error || '今のシステムが送れないと答えました', dry.status === 403 ? 403 : 409);
      return NextResponse.json({ ok: true, title: r.title, msg: r.msg, targets: r.targets, missing: r.missing, recipients: dj.recipients ?? r.targets.length, willSkip: dj.willSkip ?? 0 });
    }
    const res = await ikeWrite(req, '/api/proxy?action=send', { to, msg: r.msg, kNo }, { timeoutMs: 120000 });
    const j = (await res.json().catch(() => ({}))) as { blocked?: boolean; error?: string; results?: Array<{ ok?: boolean; success?: boolean }>; skipped?: number };
    if (!res.ok || j.blocked) return NextResponse.json({ error: j.error || '送れませんでした' }, { status: res.ok ? 409 : res.status });
    const sent = (j.results || []).filter((x) => x.ok !== false && x.success !== false).length;
    return NextResponse.json({ ok: true, sent, skipped: j.skipped ?? 0, failed: (j.results || []).length - sent, missing: r.missing });
  }

  if (action === 'slackSync') return ikeWrite(req, '/api/proxy?action=syncSlackCache', {}, { method: 'GET', timeoutMs: 60000 });

  // ---- 案件マップ（今の /cases-map.html と同じ口） ----
  if (action === 'mapExtract') {
    const text = txt(b.text, 8000);
    if (text.length < 10) return bad('案件文が短すぎます');
    return ikeWrite(req, '/api/cases-map?action=extract', { text }, { timeoutMs: 60000 });
  }
  if (action === 'mapCreate') {
    const f = (b.fields || {}) as Record<string, unknown>;
    const category = txt(f.category, 20);
    if (!MAP_CATS.includes(category)) return bad('カテゴリを選んでください');
    const pinnable = f.pinnable !== false;
    const body = {
      title: txt(f.title, 120), company: txt(f.company, 120), category, access: txt(f.access, 200), address: txt(f.address, 200),
      area: pinnable ? '' : txt(f.area, 60), summary: txt(f.summary, 500), case_text: txt(f.case_text, 8000), pay: txt(f.pay, 120), hours: txt(f.hours, 120),
      holiday: txt(f.holiday, 120), start_text: txt(f.start_text, 120), require_text: txt(f.require_text, 300), station: txt(f.station, 40), pinnable,
      commute_modes: Array.isArray(f.commute_modes) ? f.commute_modes.map((m) => txt(m, 20)).slice(0, 6) : ['公共交通機関'],
      ...(f.reserve_date && YMD.test(String(f.reserve_date)) ? { reserve_date: String(f.reserve_date), reserve_note: '' } : {}),
    };
    if (!body.title) return bad('案件名は必須です');
    return ikeWrite(req, '/api/cases-map?action=create', body, { timeoutMs: 60000 });
  }
  if (action === 'mapFill' || action === 'mapClose' || action === 'mapUnreserve' || action === 'mapReopen') {
    const id = txt(b.id, 40);
    if (!UUID.test(id) && !/^\d{1,12}$/.test(id)) return bad('案件が見つかりません');
    const a = { mapFill: 'fill', mapClose: 'close', mapUnreserve: 'unreserve', mapReopen: 'reopen' }[action];
    const body: Record<string, unknown> = { id, note: txt(b.note, 40) };
    if (action === 'mapFill') {
      body.kind = b.kind === 'reserve' ? 'reserve' : 'now';
      if (body.kind === 'reserve') { const d = txt(b.date, 10); if (!YMD.test(d)) return bad('充足予定日が正しくありません'); body.date = d; }
    }
    return ikeWrite(req, `/api/cases-map?action=${a}`, body);
  }
  if (action === 'mapSync') return ikeWrite(req, '/api/cases-map?action=sync', {}, { timeoutMs: 60000 });

  // ---- 成約日報（今の /nippo.html と同じ口。dry=true は日報②に書かずに「どこに何を書くか」だけ返す） ----
  if (action === 'nippoSubmit') {
    const p = (b.payload || {}) as Record<string, unknown>;
    const arr = (v: unknown) => (Array.isArray(v) ? v.slice(0, 20) : []);
    const body = {
      action: 'submit', dry: p.dry === true, kind: p.kind === 'keiken' ? 'keiken' : 'mikeiken', as: txt(p.as, 30),
      seiyaku: arr(p.seiyaku), taijou: arr(p.taijou), taisha: arr(p.taisha), jitai: arr(p.jitai),
      act: p.act && typeof p.act === 'object' ? p.act : null,
    };
    return ikeWrite(req, '/api/nippo', body, { timeoutMs: 60000 });
  }
  if (action === 'nippoFill') {
    const id = txt(b.id, 40);
    if (!UUID.test(id)) return bad('成約が見つかりません');
    const nyuujou = txt(b.nyuujou, 10);
    if (nyuujou && !YMD.test(nyuujou)) return bad('入場日が正しくありません');
    const unit = txt(b.unit, 10);
    if (unit && !['jikyu', 'nikkyu', 'ningetsu'].includes(unit)) return bad('売上の単位が正しくありません');
    return ikeWrite(req, '/api/nippo', { action: 'fill', id, nyuujou, unit, raw: unit ? Number(b.raw) || 0 : '' });
  }
  if (action === 'nippoPref') return ikeWrite(req, '/api/nippo', { action: 'pref', food: txt(b.food, 20) });

  return bad('この操作はできません');
}
