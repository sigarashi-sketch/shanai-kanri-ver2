import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { sameSite } from '@/lib/ike-write';

// 連絡パネルの「手動配信」「案内配信」から、今の社内システムを呼ぶ口（2026-10-25 shoya「本物につないで」）。
//   ・今の API は POST しか無いので、ここで op の名前ごとに**決まった action だけ**を通す。それ以外の POST は通さない
//   ・送ってよいか（宛先の区分・ブロック・アダルト/店舗運営の案件・配信できる時間・案内の締め切り・人数/稼働月/粗利）は
//     全部今の API が決める。断られたら理由をそのまま返す（ver2 で判定を作り直さない）
//   ・ログインしていないときは呼ばない
//
//   読むだけ（LINE には送らない）
//     dry          … POST /api/line-broadcast { mode:'dry', audience }           宛先の一覧（今の配信画面の左の一覧と同じ）。名前・駅・稼働・担当だけ返す
//     poll-list    … POST /api/line-broadcast?action=poll-list                    送った案内の一覧（今の /poll.html と同じ。開いたときに返信から回答を自動で入れるのも今と同じ）
//     poll-detail  … POST /api/line-broadcast?action=poll-detail { id }           1件の相手ごとの回答・返信（同上）
//   送る（shoya が頼んだ3つの送信のうち、この口が受け持つ2つ。チャットは /api/live/chat）
//     ikou-create  … POST /api/ikou-requests?action=create&area=main { caseText, names, manual:true }
//                    今の手動配信（/ikou-manual.html）と同じ「手動配信の依頼」を積む＝案件番号（P…）が付く。自動配信は通さない（manual 固定）
//     send         … POST /api/line-broadcast { mode:'send', audience, text, to, kNo | poll }
//                    今の配信画面の 1:1 送信。kNo（手動配信の案件番号）か poll（案内配信）のどちらか一方が必ず要る。画像・PDF は通さない
//     ikou-mark-sent … POST /api/ikou-requests?action=markSent { id, note }       送れたあとに依頼を「送った」にする（今の配信画面と同じ。送信の引き金にはならない）
//   面談日程回収（10-30 shoya「今のいけどんでやってた面談候補の日程回収の一斉送信・営業中に・タブで送れるように」＝今の配信画面の「📅 面談日程回収」と同じ）
//     nittei-template … GET /api/availability?action=template&week=0|1   今週/来週の平日（祝日・過ぎた日つき）と決まった文面の頭（読むだけ）
//     nittei-groups   … GET /api/proxy?action=getGroups                   営業中の人の LINE グループ（今のシステムの絞り込みが効いたときだけ返す）
//     nittei-send     { target:'group'|'one', week, labels, to }
//                     本文は ver2 で組み直す＝今のシステムの文面の頭＋選んだ日（'7/27(月)：'）だけ（画面から好きな文を送らせない・返信の読み取りがこの形を前提にしている）
//                     group → POST /api/proxy?action=send { to, msg }（今の配信画面のグループ送信。案件番号なし＝案件進捗には載らない）。送り先は営業中のグループだけ
//                     one   → POST /api/line-broadcast { mode:'send', audience:'sales', text, to }（営業中の 1:1。Push＝従量課金）
type Body = Record<string, unknown>;
const READS = new Set(['dry', 'poll-list', 'poll-detail', 'nittei-template', 'nittei-groups']);
const SENDS = new Set(['ikou-create', 'send', 'ikou-mark-sent', 'nittei-send']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CASE_NO = /^[A-Z][0-9]{6}-[0-9]{6}$/;
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });
const str = (v: unknown) => (typeof v === 'string' ? v : '');

async function call(path: string, payload: Body, timeoutMs = 60000) {
  const r = await ikeFetch(path, { method: 'POST', body: JSON.stringify(payload) }, timeoutMs);
  const j = (await r.json().catch(() => ({}))) as Body;
  if (r.status === 401) return { r, j: { ok: false, error: 'ログインが切れました。もう一度ログインしてください' } as Body };
  return { r, j };
}
type NitteiDay = { date: string; label: string; holiday: boolean; past: boolean; checked: boolean };
type Template = { ok?: boolean; week?: number; days?: NitteiDay[]; head?: string; warning?: string; error?: string; hint?: string };
async function nitteiTemplate(week: unknown): Promise<{ status: number; j: Template }> {
  const w = week === 0 || week === 1 || week === '0' || week === '1' ? `&week=${week}` : '';
  const r = await ikeFetch(`/api/availability?action=template${w}`, undefined, 30000);
  const j = (await r.json().catch(() => ({}))) as Template;
  return { status: r.status, j };
}
const GID = /^C[0-9a-f]{32}$/;
/** 営業中の人のグループ（今の配信画面の「グループ（営業中）」と同じ一覧）。絞り込みが効いていなければ null */
async function salesGroups(): Promise<{ error: string } | { groups: { id: string; name: string }[] }> {
  const r = await ikeFetch('/api/proxy?action=getGroups', undefined, 30000);
  if (r.status === 401) return { error: 'ログインが切れました。もう一度ログインしてください' };
  if (!r.ok) return { error: `グループの一覧を読めませんでした（${r.status}）` };
  if ((r.headers.get('x-group-filter') || '') !== 'applied') return { error: '営業中の人の絞り込みが今のシステムで確かめられないので、グループには送れません（1:1 にするか、今の配信画面で確かめてください）' };
  const g = (await r.json().catch(() => ({}))) as Record<string, { id?: string; name?: string }>;
  const groups = Object.values(g || {}).filter((x) => x && GID.test(String(x.id))).map((x) => ({ id: String(x.id), name: String(x.name || '') }));
  return { groups: groups.sort((a, b) => a.name.localeCompare(b.name, 'ja')) };
}
const errOf = (j: Body, status: number) => str(j.error) && j.error !== 'ROSTER_UNAVAILABLE' ? str(j.error) : str(j.hint) || str(j.detail) || str(j.error) || `今の社内システムで止まりました（${status}）`;

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Body;
  const op = str(b.op);
  if (!READS.has(op) && !SENDS.has(op)) return bad('この操作はここからはできません');
  if (!(await ikeToken())) {
    return READS.has(op)
      ? NextResponse.json({ error: 'not_logged_in' }, { status: 401 })
      : NextResponse.json({ ok: false, error: 'ログインしてください' }, { status: 401 });
  }
  const audience = str(b.audience) === 'joined' ? 'joined' : 'sales';

  try {
    // ---------------------------------------------------------------- 読むだけ
    if (op === 'dry') {
      const { r, j } = await call('/api/line-broadcast', { mode: 'dry', audience });
      if (!r.ok || j.ok === false) return NextResponse.json({ ok: false, error: errOf(j, r.status) }, { status: r.status === 401 ? 401 : 200 });
      // 額面・性別など、この画面で使わない項目は落として返す
      const recipients = (Array.isArray(j.recipients) ? j.recipients as Body[] : []).map((x) => ({
        name: str(x.name), userId: str(x.userId), eki: str(x.eki), kadou: str(x.kadou), tantou: str(x.tantou),
      })).filter((x) => /^U[0-9a-f]{32}$/.test(x.userId));
      return NextResponse.json({ ok: true, recipients, total: recipients.length, excluded: Number(j.excluded) || 0 });
    }
    if (op === 'poll-list' || op === 'poll-detail') {
      if (op === 'poll-detail' && !UUID.test(str(b.id))) return bad('案内の id が違います');
      const { r, j } = await call(`/api/line-broadcast?action=${op}`, op === 'poll-detail' ? { id: str(b.id) } : {});
      return NextResponse.json(j, { status: r.status === 401 ? 401 : r.ok ? 200 : r.status });
    }

    if (op === 'nittei-template') {
      const { status, j } = await nitteiTemplate(b.week);
      if (!j.ok) return NextResponse.json({ ok: false, error: str(j.hint) || str(j.error) || `日程の文面を作れませんでした（${status}）` }, { status: status === 401 ? 401 : 200 });
      return NextResponse.json({ ok: true, week: j.week, days: j.days || [], head: j.head || '', warning: j.warning || '' });
    }
    if (op === 'nittei-groups') {
      const g = await salesGroups();
      if ('error' in g) return NextResponse.json({ ok: false, error: g.error });
      return NextResponse.json({ ok: true, groups: g.groups });
    }

    // ---------------------------------------------------------------- 送る
    if (op === 'nittei-send') {
      if (!sameSite(req)) return bad('この画面の外からは送れません', 403);
      const target = str(b.target) === 'one' ? 'one' : 'group';
      const labels = Array.isArray(b.labels) ? (b.labels as unknown[]).map(str) : [];
      const to = Array.isArray(b.to) ? [...new Set((b.to as unknown[]).map(str))] : [];
      if (!labels.length) return bad('日付を1つ以上選んでください');
      if (!to.length || to.length > 500) return bad('送り先を選んでください');
      const t = await nitteiTemplate(b.week);
      if (!t.j.ok || !t.j.head || !t.j.days?.length) return bad(str(t.j.hint) || str(t.j.error) || '日程の文面を作れませんでした', 502);
      const days = t.j.days.filter((d) => labels.includes(d.label));
      if (days.length !== new Set(labels).size) return bad('日付が今週・来週の平日と合いません（画面を読み直してください）');
      const text = t.j.head + days.map((d) => `${d.label}：`).join('\n');
      if (target === 'one') {
        if (!to.every((id) => /^U[0-9a-f]{32}$/.test(id))) return bad('送り先（LINE の相手）が違います');
        const { r, j } = await call('/api/line-broadcast', { mode: 'send', audience: 'sales', text, to }, 120000);
        if (typeof j.sent !== 'number') return NextResponse.json({ ok: false, error: errOf(j, r.status) }, { status: r.status === 401 ? 401 : 200 });
        const failed = Array.isArray(j.failed) ? (j.failed as Body[]).map((f) => `${str(f.name)}（${str(f.error)}）`) : [];
        return NextResponse.json({ ok: !!j.ok, sent: j.sent, failed });
      }
      const g = await salesGroups();
      if ('error' in g) return bad(g.error, 409);
      const known = new Map(g.groups.map((x) => [x.id, x.name]));
      if (!to.every((id) => known.has(id))) return bad('営業中ではないグループが混ざっています（画面を読み直してください）', 409);
      const { r, j } = await call('/api/proxy?action=send', { to: to.join(','), msg: text }, 120000);
      if (r.status === 401) return NextResponse.json({ ok: false, error: str(j.error) }, { status: 401 });
      if (j.blocked || !r.ok) return NextResponse.json({ ok: false, error: str(j.error) || str(j.detail) || `送れませんでした（${r.status}）` });
      const results = (Array.isArray(j) ? j : Array.isArray(j.results) ? j.results : []) as Body[];
      const okIds = new Set(results.filter((x) => Number(x?.code) === 200).map((x) => str(x.id)));
      const failed = results.filter((x) => x && !x.skipped && Number(x.code) !== 200).map((x) => `${known.get(str(x.id)) || 'グループ'}（${str(x.error) || `code ${str(x.code)}`}）`);
      return NextResponse.json({ ok: !failed.length, sent: okIds.size || results.filter((x) => Number(x?.code) === 200).length, failed });
    }
    if (op === 'ikou-create') {
      const caseText = str(b.caseText).trim();
      const names = Array.isArray(b.names) ? (b.names as unknown[]).map((n) => str(n).trim()).filter(Boolean) : [];
      if (!caseText) return bad('案件情報が空です');
      if (caseText.length > 10000) return bad('案件情報が長すぎます');
      if (!names.length || names.length > 50) return bad('送る人を選んでください');
      const { r, j } = await call('/api/ikou-requests?action=create&area=main', { caseText, names, manual: true });
      if (!r.ok || !j.ok) return NextResponse.json({ ok: false, error: errOf(j, r.status) }, { status: r.status === 401 ? 401 : 200 });
      const reqRow = (j.request || {}) as Body;
      return NextResponse.json({ ok: true, caseNo: str(j.caseNo), requestId: str(reqRow.id) });
    }
    if (op === 'ikou-mark-sent') {
      const id = str(b.id);
      if (!/^[0-9A-Za-z-]{1,64}$/.test(id)) return bad('依頼の id が違います');
      const { r, j } = await call('/api/ikou-requests?action=markSent', { id, note: str(b.note).slice(0, 200) });
      return NextResponse.json({ ok: !!j.ok, changed: j.changed, error: j.ok ? undefined : errOf(j, r.status) });
    }
    // op === 'send'
    const text = str(b.text);
    if (!text.trim()) return bad('本文が空です');
    if (text.length > 5000) return bad('本文が長すぎます（5,000字まで）');
    const to = Array.isArray(b.to) ? (b.to as unknown[]).map(str) : [];
    if (!to.length || to.length > 500 || !to.every((id) => /^U[0-9a-f]{32}$/.test(id))) return bad('送り先（LINE の相手）が違います');
    const kNo = str(b.kNo).trim();
    const poll = b.poll && typeof b.poll === 'object' ? b.poll as Body : null;
    if (!!kNo === !!poll) return bad('案件番号か案内のどちらか一方が要ります');
    if (kNo && !CASE_NO.test(kNo)) return bad('案件番号が違います');
    let pollOut: Body | undefined;
    if (poll) {
      if (poll.id) {
        if (!UUID.test(str(poll.id))) return bad('案内の id が違います');
        pollOut = { id: str(poll.id), buttons: poll.buttons === true };
      } else {
        const choices = Array.isArray(poll.choices) ? (poll.choices as Body[]).slice(0, 10).map((c) => ({ label: str(c?.label), ng: c?.ng === true })) : [];
        pollOut = { title: str(poll.title), choices, buttons: poll.buttons === true };
      }
    }
    const { r, j } = await call('/api/line-broadcast', { mode: 'send', audience, text, to, ...(kNo ? { kNo } : {}), ...(pollOut ? { poll: pollOut } : {}) });
    if (typeof j.sent !== 'number') return NextResponse.json({ ok: false, error: errOf(j, r.status) }, { status: r.status === 401 ? 401 : 200 });
    const failed = Array.isArray(j.failed) ? (j.failed as Body[]).map((f) => ({ name: str(f.name), error: str(f.error) })) : undefined;
    return NextResponse.json({
      ok: !!j.ok, sent: j.sent, target: j.target, failed, caseNo: j.caseNo, recorded: j.recorded, historyError: j.historyError,
      pollId: j.pollId, pollError: j.pollError,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `今の社内システムに届きませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
