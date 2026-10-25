import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';

// 連絡パネルの「手動配信」「案内配信」から、今の社内システムを呼ぶ口（2026-10-25 shoya「本物につないで」）。
//   ・今の API は POST しか無いので、ここで op の名前ごとに**決まった action だけ**を通す。それ以外の POST は通さない
//   ・送ってよいか（宛先の区分・ブロック・アダルト/店舗運営の案件・配信できる時間・案内の締め切り・人数/稼働月/粗利）は
//     全部今の API が決める。断られたら理由をそのまま返す（ver2 で判定を作り直さない）
//   ・ログインしていない（見本）ときは呼ばない
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
type Body = Record<string, unknown>;
const READS = new Set(['dry', 'poll-list', 'poll-detail']);
const SENDS = new Set(['ikou-create', 'send', 'ikou-mark-sent']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CASE_NO = /^[A-Z][0-9]{6}-[0-9]{6}$/;
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });
const str = (v: unknown) => (typeof v === 'string' ? v : '');

async function call(path: string, payload: Body) {
  const r = await ikeFetch(path, { method: 'POST', body: JSON.stringify(payload) }, 60000);
  const j = (await r.json().catch(() => ({}))) as Body;
  if (r.status === 401) return { r, j: { ok: false, error: 'ログインが切れました。もう一度ログインしてください' } as Body };
  return { r, j };
}
const errOf = (j: Body, status: number) => str(j.error) && j.error !== 'ROSTER_UNAVAILABLE' ? str(j.error) : str(j.hint) || str(j.detail) || str(j.error) || `今の社内システムで止まりました（${status}）`;

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Body;
  const op = str(b.op);
  if (!READS.has(op) && !SENDS.has(op)) return bad('この操作はここからはできません');
  if (!(await ikeToken())) {
    return READS.has(op)
      ? NextResponse.json({ error: 'not_logged_in' }, { status: 401 })
      : NextResponse.json({ ok: false, sample: true, error: '見本なので送っていません' }, { status: 401 });
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

    // ---------------------------------------------------------------- 送る
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
