'use client';

import { useState } from 'react';
import { BellRing, RefreshCw } from 'lucide-react';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { useMePages } from '@/components/MePages';
import { Card, Msg, inputCls } from './kit';

// 影響の大きい「動かす」ボタン（10-26）。行き先は /api/live/horyu/ops（kind ごとに決め打ち・super_admin だけ）。
//   ・全体管理者でない人には押せない（理由を出す）。sample＝本物が読めていないとき（読み込み中・ログインなし）は押せない
//   ・押すと必ず確認の窓（何が起きるか・だれに届くか）を出してから動かす
type R = { ok: boolean; status: number; data: Record<string, unknown> & { error?: string } };
export async function opsPost(kind: string, extra: Record<string, unknown> = {}): Promise<R> {
  try {
    const r = await fetch('/api/live/horyu/ops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, ...extra }) });
    const data = (await r.json().catch(() => ({}))) as R['data'];
    return { ok: r.ok && !data.error, status: r.status, data };
  } catch (e) { return { ok: false, status: 0, data: { error: (e as Error).message } }; }
}
const errOf = (r: R) => (r.status === 401 ? 'ログインが切れました。もう一度ログインしてください' : String(r.data.error || `うまくいきませんでした（${r.status}）`));
const SUPER_ONLY = '全体管理者（super_admin）だけが動かせます';

/** ミンナのミカタ → DB の同期を手で回す（今のダッシュボードの「MNM同期」と同じ） */
export function MnmSyncButton({ sample, onDone }: { sample: boolean; onDone?: (msg: string) => void }) {
  const { isSuper, ready } = useMePages();
  const [spec, setSpec] = useState<ConfirmSpec | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const click = () => {
    if (sample) return;
    setSpec({
      title: 'MNM 同期を回す', okLabel: '同期する',
      lines: ['ミンナのミカタ（MNM）の内容を、この社内システムの DB に写します（5分ごとの自動と同じ）', '40秒で区切ります。終わらなかった分は次の回が続きからやります', 'MNM には何も書きません'],
      run: async () => {
        const r = await opsPost('mnm-sync');
        if (!r.ok) throw new Error(errOf(r));
        const d = r.data as { tablesSynced?: number; rowsUpserted?: number; backfilled?: number; partial?: boolean };
        const text = `MNM 同期：${d.tablesSynced ?? 0}表・${d.rowsUpserted ?? 0}行を入れ直し${d.backfilled ? `・空欄を${d.backfilled}件埋めました` : ''}${d.partial ? '（時間切れ。続きは次の回）' : ''}`;
        setMsg({ text }); onDone?.(text);
      },
    });
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button onClick={click} disabled={sample || (ready && !isSuper)} title={ready && !isSuper ? SUPER_ONLY : 'MNM の内容を DB に写します'} className="btn-secondary btn-sm"><RefreshCw size={13} />MNM 同期</button>
      <Msg text={msg.text} bad={msg.bad} />
      {spec && <ConfirmWrite spec={spec} onClose={() => setSpec(null)} />}
    </span>
  );
}

/** freee 請求書の取り込み（毎晩の自動と同じ関数）。期間は直近1〜3か月から選ぶ */
export function FreeeSyncButton({ sample, onDone }: { sample: boolean; onDone?: () => void }) {
  const { isSuper, ready } = useMePages();
  const [months, setMonths] = useState('1');
  const [spec, setSpec] = useState<ConfirmSpec | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const off = sample || (ready && !isSuper);
  const click = () => {
    if (sample) return;
    setSpec({
      title: 'freee 請求書を取り込む', okLabel: '取り込む',
      lines: [`請求日が直近${months}か月の請求書を、全事業所ぶん freee から読み直して DB に入れます（毎晩の自動と同じ）`, 'freee には何も書きません。1社読めなくても、ほかの事業所は続けます', '時間がかかるときは途中で区切り、明細の残りは次の回が続けます'],
      run: async () => {
        const r = await opsPost('freee-sync', { months: Number(months) });
        const d = r.data as { companies?: number; succeeded?: number; total?: number; detailsFetched?: number; detailsPending?: number };
        if (!r.ok && !d.companies) throw new Error(errOf(r));
        setMsg({ text: `freee 請求書：${d.succeeded ?? 0}/${d.companies ?? 0}社・${d.total ?? 0}件を取り込み（明細 ${d.detailsFetched ?? 0}件・残り ${d.detailsPending ?? 0}件）`, bad: !r.ok });
        onDone?.();
      },
    });
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <select value={months} onChange={(e) => setMonths(e.target.value)} className={inputCls} aria-label="取り込む期間" disabled={off}>
        <option value="1">直近1か月</option><option value="2">直近2か月</option><option value="3">直近3か月</option>
      </select>
      <button onClick={click} disabled={off} title={off && !sample ? SUPER_ONLY : undefined} className="btn-secondary btn-sm"><RefreshCw size={13} />freee から取り込む</button>
      <Msg text={msg.text} bad={msg.bad} />
      {spec && <ConfirmWrite spec={spec} onClose={() => setSpec(null)} />}
    </span>
  );
}

type Dry = { ok?: boolean; date?: string; targetCount?: number; unpunched?: unknown[]; needsLink?: string[]; fetchErrors?: unknown[]; decision?: { send?: boolean; reason?: string }; wouldSendText?: string; blockedReason?: string; nowJst?: string; group?: { id?: string; name?: string } | null; config?: { enabled?: boolean; groupConfigured?: boolean }; error?: { message?: string } | string };
type Groups = { groups?: { id: string; name: string }[]; current?: { id?: string; name?: string } | null; enabled?: boolean };

/** 未打刻アラート：送らずに確かめる → 通知先の LINE グループを選ぶ → 本番と同じ条件で送る */
export function KintaiAlertPanel({ sample }: { sample: boolean }) {
  const { isSuper, ready } = useMePages();
  const off = sample || (ready && !isSuper);
  const [dry, setDry] = useState<Dry | null>(null);
  const [groups, setGroups] = useState<Groups | null>(null);
  const [gq, setGq] = useState('');
  const [gid, setGid] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const [spec, setSpec] = useState<ConfirmSpec | null>(null);
  const errText = (d: Dry) => (typeof d.error === 'string' ? d.error : d.error?.message) || '';

  const check = async () => {
    if (sample) return;
    setBusy('dry'); setMsg({ text: '' });
    const r = await opsPost('kintai-alert-dry');
    setBusy('');
    if (!r.ok) { setMsg({ text: errOf(r), bad: true }); return; }
    setDry(r.data as Dry);
  };
  const loadGroups = async () => {
    if (sample) return;
    setBusy('groups');
    const r = await opsPost('kintai-alert-groups');
    setBusy('');
    if (!r.ok) { setMsg({ text: errOf(r), bad: true }); return; }
    const g = r.data as Groups; setGroups(g); setGid(g.current?.id || '');
  };
  const saveGroup = () => {
    const g = groups?.groups?.find((x) => x.id === gid);
    if (!g) return;
    setSpec({
      title: '未打刻アラートの通知先を変える', okLabel: '保存する',
      lines: [`通知先：「${g.name}」`, '毎朝の自動の知らせも、この LINE グループに届くようになります', '保存しただけでは何も送りません'],
      run: async () => { const r = await opsPost('kintai-alert-group', { groupId: gid }); if (!r.ok) throw new Error(errOf(r)); setMsg({ text: `通知先を「${g.name}」にしました` }); void loadGroups(); },
    });
  };
  const run = () => {
    if (!dry) return;
    const n = (dry.unpunched || []).length;
    setSpec({
      title: '未打刻アラートを送る', okLabel: '送る', danger: true,
      lines: [`${dry.date ?? '今日'}：未打刻 ${n}人（対象 ${dry.targetCount ?? 0}人）`, '本番と同じ条件で送ります。自動の知らせが止まっている（KINTAI_ALERT_ENABLED が off）なら今のシステムは送りません', '同じ日にもう送っていれば送りません（二重送信の防止）'],
      sends: `LINE グループ「${dry.group?.name || '設定された通知先'}」に届きます`,
      run: async () => {
        const r = await opsPost('kintai-alert-run');
        if (!r.ok) throw new Error(errOf(r));
        const d = r.data as Dry & { sent?: boolean };
        setMsg({ text: d.sent ? `送りました（未打刻 ${(d.unpunched || []).length}人）` : `送りませんでした：${d.blockedReason || d.decision?.reason || '送る条件に当たりませんでした'}` });
        setDry(null);
      },
    });
  };
  const shownGroups = (groups?.groups || []).filter((g) => !gq.trim() || g.name.includes(gq.trim()) || g.id === gid).slice(0, 200);
  return (
    <Card title="未打刻アラート" note="平日10時・管理者のグループへ。送る前に、だれが対象かを確かめられます">
      <div className="flex flex-col gap-3 px-4 pb-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={check} disabled={!!busy} className="btn-secondary btn-sm">{busy === 'dry' ? '数えています…' : '送らずに確かめる'}</button>
          <button onClick={run} disabled={!dry || off || !!busy} title={off && !sample ? SUPER_ONLY : !dry ? '先に「送らずに確かめる」を押してください' : undefined} className="btn-secondary btn-sm"><BellRing size={13} />送る</button>
          <button onClick={loadGroups} disabled={!!busy || off} title={off && !sample ? SUPER_ONLY : undefined} className="btn-secondary btn-sm">{busy === 'groups' ? '読んでいます…' : '通知先を見る・変える'}</button>
        </div>
        <Msg text={msg.text} bad={msg.bad} />
        {dry && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-line-soft px-3 py-2.5">
            {errText(dry) && <div className="text-bad">{errText(dry)}</div>}
            <div><b>{dry.date}</b>{dry.nowJst ? `（${dry.nowJst} 時点）` : ''}：対象 {dry.targetCount ?? 0}人・未打刻 <b>{(dry.unpunched || []).length}人</b>{dry.needsLink?.length ? `・freee の紐付け待ち ${dry.needsLink.length}人` : ''}{dry.fetchErrors?.length ? `・読めなかった ${dry.fetchErrors.length}人` : ''}</div>
            <div className="text-muted">送るか：{dry.decision?.send ? '送る' : `送らない（${dry.blockedReason || dry.decision?.reason || '—'}）`}・通知先：{dry.group?.name || '未設定'}・自動の知らせ：{dry.config?.enabled ? '動いている' : '止まっている'}</div>
            {dry.nowJst && dry.nowJst < '10:00' && <div className="text-warn">10時より前は、まだ出勤前の人も未打刻に数えます</div>}
            {dry.wouldSendText && <details><summary className="cursor-pointer text-muted">送る文を見る</summary><pre className="mt-1 whitespace-pre-wrap rounded bg-soft p-2 text-xs">{dry.wouldSendText}</pre></details>}
          </div>
        )}
        {groups && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line-soft px-3 py-2.5">
            <div className="w-full text-muted">いまの通知先：<b className="text-ink">{groups.current?.name || '未設定'}</b></div>
            <label className="flex flex-col gap-1 text-muted">グループ名で絞る<input value={gq} onChange={(e) => setGq(e.target.value)} className={`${inputCls} w-[180px]`} /></label>
            <label className="flex flex-col gap-1 text-muted">通知先<select value={gid} onChange={(e) => setGid(e.target.value)} className={`${inputCls} max-w-[320px]`}><option value="">選ぶ</option>{shownGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
            <button onClick={saveGroup} disabled={off || !gid || gid === groups.current?.id} title={off && !sample ? SUPER_ONLY : undefined} className="btn-primary btn-sm">保存する</button>
          </div>
        )}
      </div>
      {spec && <ConfirmWrite spec={spec} onClose={() => setSpec(null)} />}
    </Card>
  );
}
