import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { ikeWrite, sameSite } from '@/lib/ike-write';
import { ikeRole } from '@/lib/live/role';
import { loadMikeikenSet } from '@/lib/live/mikeiken-server';
import { isMikeiken } from '@/lib/live/mikeiken';

// 影響の大きい「動かす」操作（10-26 shoya「入ってないとこ全部」）。行き先は kind ごとに決め打ち。
//   ★全体管理者（super_admin）だけ。ここで今のシステムの me を見て確かめる（今のシステム側の口はログインしていれば通るため）。画面は確認の窓を出してから呼ぶ
//     kintai-alert-run   … 未打刻アラートを本番と同じ条件で送る（GET /api/kintai-alert?action=run）。
//                          KINTAI_ALERT_ENABLED が off なら今のシステムが送らない・同じ日に送ったあとは送らない（force・test は付けない）
//     kintai-alert-group {groupId} … 未打刻アラートの通知先の LINE グループを保存（action=setGroup・毎朝の自動もこの宛先）
//     mnm-sync           … ミンナのミカタ → DB の同期を手で回す（GET /api/proxy?action=mnmSync・今のダッシュボードの「MNM同期」と同じ）
//     freee-sync {months} … freee 請求書の取り込み（GET /api/freee-invoices?action=sync_all&months=1〜3・毎晩の自動と同じ関数）
//     freee 接続（再認可）… 今の /freee-invoices.html の「freee接続（再認可）」タブと同じ口（10-30 shoya「ver2にも再認可タブ足して」）
//       freee-reauth-status            … 事業所の一覧と認可の URL（GET /api/freee-invoices?action=reauth_status）
//       freee-bootstrap {companyId, code} … 認可コードを保存して従業員を同期（GET /api/freee-kintai?action=bootstrap&sync=1）。トークンの保存は今のシステムがやる
//       freee-ping {companyId} / freee-ping-all … 請求書の接続を確かめる（action=ping / ping_all・読むだけ）
//       freee-sync-one {companyId}     … その事業所の直近3か月の請求書を取り込む（action=sync&months=3）
//   読むだけ（だれでも・今のシステムが判定）:
//     kintai-alert-dry   … 送らずに対象・未打刻・送る文を見る（action=dry）
//     kintai-alert-groups … 通知先の候補と今の設定（action=groups・グループ名に人の名前が入るので super_admin だけ）
//   ★決定日（だれでも・今のダッシュボードと同じ）:
//     joined-date {name, decidedOn} … 参画決定日の手入力（POST /api/joined・空なら手入力を消す）。未経験の人だけ
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const SUPER = new Set(['kintai-alert-run', 'kintai-alert-group', 'kintai-alert-groups', 'mnm-sync', 'freee-sync',
  'freee-reauth-status', 'freee-bootstrap', 'freee-ping', 'freee-ping-all', 'freee-sync-one']);

async function read(path: string, timeoutMs = 55000) {
  try {
    const r = await ikeFetch(path, undefined, timeoutMs);
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status === 401) return bad('ログインが切れました。もう一度ログインしてください', 401);
    if (r.status === 403) return bad('今のシステムで権限がありません', 403);
    return NextResponse.json(j, { status: r.ok ? 200 : r.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return bad(`今の社内システムから読めませんでした（${(e as Error).message}）`, 502); }
}

export async function POST(req: Request) {
  if (!sameSite(req)) return bad('この画面の外からは動かせません', 403);
  if (!(await ikeToken())) return bad('not_logged_in', 401);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = String(b.kind || '');
  if (SUPER.has(kind) && (await ikeRole()) !== 'super_admin') return bad('この操作は全体管理者（super_admin）だけです', 403);

  if (kind === 'kintai-alert-dry') return read('/api/kintai-alert?action=dry');
  if (kind === 'kintai-alert-groups') return read('/api/kintai-alert?action=groups', 30000);
  if (kind === 'kintai-alert-run') return ikeWrite(req, '/api/kintai-alert?action=run', null, { method: 'GET', timeoutMs: 58000 });
  if (kind === 'kintai-alert-group') {
    const gid = String(b.groupId || '').trim();
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(gid)) return bad('グループを選んでください');
    // 候補（今のシステムの一覧）にあるものだけ
    const g = await ikeFetch('/api/kintai-alert?action=groups', undefined, 30000).then((r) => r.json()).catch(() => null) as { groups?: { id: string }[] } | null;
    if (!(g?.groups || []).some((x) => x.id === gid)) return bad('そのグループは候補にありません', 404);
    return ikeWrite(req, `/api/kintai-alert?action=setGroup&groupId=${encodeURIComponent(gid)}`, null, { method: 'GET' });
  }
  if (kind === 'mnm-sync') {
    const res = await ikeWrite(req, '/api/proxy?action=mnmSync', null, { method: 'GET', timeoutMs: 58000 });
    return res;
  }
  if (kind === 'freee-sync') {
    const months = Math.max(1, Math.min(3, Math.trunc(Number(b.months) || 1)));
    return ikeWrite(req, `/api/freee-invoices?action=sync_all&months=${months}`, null, { method: 'GET', timeoutMs: 58000 });
  }
  if (kind.startsWith('freee-') && kind !== 'freee-sync') {
    if (kind === 'freee-reauth-status') return read('/api/freee-invoices?action=reauth_status', 30000);
    if (kind === 'freee-ping-all') return read('/api/freee-invoices?action=ping_all', 58000);
    const cid = String(b.companyId || '').trim();
    if (!/^\d{1,20}$/.test(cid)) return bad('事業所を選んでください');
    if (kind === 'freee-ping') return read(`/api/freee-invoices?action=ping&company_id=${cid}`, 30000);
    if (kind === 'freee-sync-one') return ikeWrite(req, `/api/freee-invoices?action=sync&company_id=${cid}&months=3`, null, { method: 'GET', timeoutMs: 58000 });
    if (kind === 'freee-bootstrap') {
      const code = String(b.code || '').trim();
      if (!/^[A-Za-z0-9._~-]{10,300}$/.test(code)) return bad('認可コードの形が正しくありません（freee に出たコードをそのまま貼ってください）');
      return ikeWrite(req, `/api/freee-kintai?action=bootstrap&sync=1&company_id=${cid}&code=${encodeURIComponent(code)}`, null, { method: 'GET', timeoutMs: 58000 });
    }
  }
  if (kind === 'joined-date') {
    const name = String(b.name ?? '').trim().slice(0, 60);
    const decidedOn = String(b.decidedOn ?? '').trim();
    if (!name) return bad('氏名がありません');
    if (decidedOn && !/^\d{4}-\d{2}-\d{2}$/.test(decidedOn)) return bad('日付の形が正しくありません');
    try { if (!isMikeiken(await loadMikeikenSet(), name)) return bad('未経験の人（今のプロパーリストに入っている人）ではありません', 404); } catch (e) { return bad((e as Error).message, 502); }
    return ikeWrite(req, '/api/joined', { name, decidedOn });
  }
  return bad('操作の指定が違います');
}

export const maxDuration = 60;
