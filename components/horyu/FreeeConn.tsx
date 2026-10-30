'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useMePages } from '@/components/MePages';
import { opsPost } from './Ops';
import { Card, Msg, inputCls, tdCls, thCls } from './kit';

// freee 接続（再認可）タブ（10-30 shoya「ver2にも再認可タブ足して」）。今の /freee-invoices.html の「freee接続（再認可）」と同じ流れ:
//   その行の「①freeeで認可」→ freee で同じ会社を選んで許可 → 出たコードをその行に貼る
//   → 貼った瞬間に 保存（bootstrap&sync=1）→ 請求書の疎通（ping）→ 直近3か月の取り込み（sync）まで進む。
//   ★口は /api/live/horyu/ops（全体管理者だけ）。トークンの保存は今のシステムの bootstrap がやる（ver2 は中身に触らない）
//   ★コードは数分で失効・1回きり。1社ずつ
type Row = { company_id: string; name?: string | null; parent?: boolean; role?: string | null; invoices?: number; pending?: number };
type Status = { authorize_url?: string; names_error?: { message?: string } | null; rows?: Row[] };
type St = { ping?: 'ok' | 'ng'; pingMsg?: string; busy?: boolean; log: { bad?: boolean; good?: boolean; text: string }[] };

const errText = (d: Record<string, unknown>) => String(d.error || 'うまくいきませんでした');

export function FreeeConnTab() {
  const { isSuper, ready } = useMePages();
  const [status, setStatus] = useState<Status | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [sts, setSts] = useState<Record<string, St>>({});
  const [active, setActive] = useState('');
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [pingAll, setPingAll] = useState(false);

  const load = async () => {
    const r = await opsPost('freee-reauth-status');
    if (!r.ok) { setLoadErr(errText(r.data)); return; }
    setLoadErr(''); setStatus(r.data as Status);
  };
  useEffect(() => { if (ready && isSuper) void load(); }, [ready, isSuper]);

  if (!ready) return <Card><div className="px-4 py-8 text-center text-muted">読んでいます…</div></Card>;
  if (!isSuper) return <Card><div className="px-4 py-8 text-center text-muted">freee の接続は全体管理者（super_admin）だけが直せます</div></Card>;

  const upd = (id: string, f: (s: St) => St) => setSts((m) => ({ ...m, [id]: f(m[id] || { log: [] }) }));
  const log = (id: string, text: string, o: { bad?: boolean; good?: boolean } = {}) => upd(id, (s) => ({ ...s, log: [...s.log, { text, ...o }] }));

  const open = (id: string) => {
    setActive(id);
    upd(id, (s) => ({ ...s, log: [] }));
    if (status?.authorize_url) window.open(status.authorize_url, '_blank', 'noopener');
  };

  const save = async (id: string, code: string) => {
    if (sts[id]?.busy || code.length < 10) return;
    upd(id, () => ({ busy: true, log: [] }));
    log(id, '保存中…（認可コードを交換しています）');
    try {
      const b = await opsPost('freee-bootstrap', { companyId: id, code });
      if (!b.ok) {
        const m = errText(b.data);
        if (/invalid_grant|認可コードの交換/.test(JSON.stringify(b.data))) throw new Error(`${m}（コードが失効か使用済み。①からやり直し。トークンは入れ替わっていないので勤怠はそのまま）`);
        if (/403/.test(m)) throw new Error('⚠️ 勤怠が見えなくなりました。認可した freee アカウントが、この会社の【人事労務】で admin ではありません。この会社の人事労務で admin のアカウントに切り替えて、この行の①からやり直してください（請求書だけは読める状態です）');
        throw new Error(m);
      }
      const d = b.data as { scope?: string; employees_synced?: number };
      const hasIv = /invoice:/.test(d.scope || '');
      log(id, `保存OK（勤怠の従業員 ${d.employees_synced != null ? `${d.employees_synced}名` : '-'}）${hasIv ? '・請求書の権限あり' : '・★scope に請求書の権限が無い（アプリの権限設定を確認）'}`, { good: hasIv, bad: !hasIv });
      log(id, '請求書の接続を確認中…');
      const p = await opsPost('freee-ping', { companyId: id });
      if (!p.ok) { upd(id, (s) => ({ ...s, ping: 'ng' })); throw new Error(`${errText(p.data)}（freee で別の会社を選んだか、その会社で freee請求書を使っていない可能性があります）`); }
      upd(id, (s) => ({ ...s, ping: 'ok' }));
      log(id, '請求書 OK。直近3か月を取り込み中…（最大1分）', { good: true });
      const y = await opsPost('freee-sync-one', { companyId: id });
      if (!y.ok) throw new Error(errText(y.data));
      const yd = y.data as { count?: number; details?: { fetched?: number; pending?: number } };
      log(id, `取り込み完了：請求書 ${yd.count ?? 0}件・明細 ${yd.details?.fetched ?? 0}件${yd.details?.pending ? `（残り ${yd.details.pending}件は2分おきの自動が続けます）` : ''}`, { good: true });
      setActive('');
      setCodes((c) => ({ ...c, [id]: '' }));
      void load();
    } catch (e) {
      log(id, (e as Error).message, { bad: true });
    } finally {
      upd(id, (s) => ({ ...s, busy: false }));
    }
  };

  const doPingAll = async () => {
    setPingAll(true);
    const r = await opsPost('freee-ping-all');
    setPingAll(false);
    if (!r.ok) { setLoadErr(errText(r.data)); return; }
    for (const x of ((r.data as { results?: { company_id: string; ok: boolean; error?: { message?: string } }[] }).results || [])) {
      upd(x.company_id, (s) => ({ ...s, ping: x.ok ? 'ok' : 'ng', pingMsg: x.ok ? '' : x.error?.message || '' }));
    }
  };

  const rows = status?.rows || [];
  const done = rows.filter((r) => sts[r.company_id]?.ping === 'ok').length;
  return (
    <>
      <Card title="1社ずつの手順">
        <ul className="list-disc space-y-1 px-8 pb-3 text-body">
          <li>その行の <b>①freeeで認可</b> を押す → 開いた freee の画面で <b>その行と同じ会社</b> を選んで「許可する」</li>
          <li>出てきたコードをコピーして、その行の欄に <b>貼るだけ</b>（貼った瞬間に 保存 → 接続の確認 → 取り込み まで進みます）</li>
          <li>コードは数分で失効・1回きり。1社終わってから次の行へ</li>
          <li><b>⚠️ 認可する freee アカウントは、その会社の【人事労務】で admin であること。</b>admin でないと、請求書は読めても その会社の勤怠（打刻）が見えなくなります</li>
        </ul>
        <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
          <button className="btn-secondary btn-sm" onClick={doPingAll} disabled={pingAll}><RefreshCw size={13} />{pingAll ? '確認中…（最大1分）' : '全社の請求書接続を確認'}</button>
          {done > 0 && <b className="text-body">{done}/{rows.length}社 接続OK</b>}
          <Msg text={loadErr} bad />
          {status?.names_error && <Msg text={`事業所名を取れませんでした（名前なしで表示）：${status.names_error.message || ''}`} bad />}
        </div>
      </Card>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-body">
            <thead><tr className="th-row"><th className={thCls}>事業所</th><th className={thCls}>company_id</th><th className={thCls}>会計の権限</th><th className={thCls}>請求書接続</th><th className={`${thCls} text-right`}>取り込み済み</th><th className={thCls}>作業</th></tr></thead>
            <tbody>
              {!status && !loadErr && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">読んでいます…</td></tr>}
              {rows.map((r) => {
                const st = sts[r.company_id] || { log: [] };
                const show = active === r.company_id || st.busy || st.log.length > 0;
                return (
                  <tr key={r.company_id} className="row border-t border-line-soft align-top" style={st.ping === 'ok' ? { background: 'var(--tone-ok-bg)' } : undefined}>
                    <td className={tdCls}><b>{r.name || '（名前不明）'}</b>{r.parent && <span className="ml-1.5 text-xs text-faint">親会社</span>}</td>
                    <td className={`${tdCls} num text-faint`}>{r.company_id}</td>
                    <td className={tdCls}>{r.role == null ? <span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>所属なし（認可できない）</span> : <span className="text-muted">{r.role}</span>}</td>
                    <td className={tdCls}>{st.ping === 'ok' ? <span className="text-ok font-semibold">OK</span> : st.ping === 'ng' ? <><span className="text-warn font-semibold">未接続</span>{st.pingMsg && <div className="text-xs text-faint">{st.pingMsg.slice(0, 60)}</div>}</> : <span className="text-faint">未確認</span>}</td>
                    <td className={`${tdCls} num text-right`}>{(r.invoices || 0).toLocaleString('ja-JP')}件</td>
                    <td className={tdCls}>
                      <button className={active === r.company_id ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'} disabled={st.busy || !status?.authorize_url} onClick={() => open(r.company_id)}><ExternalLink size={13} />①freeeで認可</button>
                      {show && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <input className={inputCls} placeholder="②コードをここに貼る" autoComplete="off" disabled={st.busy} value={codes[r.company_id] || ''} aria-label={`${r.name || r.company_id} の認可コード`}
                            onChange={(e) => setCodes((c) => ({ ...c, [r.company_id]: e.target.value }))}
                            onPaste={(e) => { const v = e.clipboardData.getData('text').trim(); if (v.length >= 20) { e.preventDefault(); setCodes((c) => ({ ...c, [r.company_id]: v })); void save(r.company_id, v); } }} />
                          <button className="btn-secondary btn-sm" disabled={st.busy} onClick={() => { const v = (codes[r.company_id] || '').trim(); if (v) void save(r.company_id, v); }}>保存</button>
                        </div>
                      )}
                      {st.log.length > 0 && (
                        <div className="mt-1.5 space-y-0.5 text-sm">
                          {st.log.map((l, i) => <div key={i} className={l.bad ? 'text-warn' : l.good ? 'text-ok' : 'text-muted'} style={{ whiteSpace: 'pre-wrap' }}>{l.text}</div>)}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
