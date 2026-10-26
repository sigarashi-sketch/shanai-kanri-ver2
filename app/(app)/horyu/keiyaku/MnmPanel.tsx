'use client';

import { useEffect, useState } from 'react';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { Card, Msg, btnCls, horyuPost, inputCls, useHoryu } from '@/components/horyu/kit';

// 契約報告の 4. MNM に登録（今の /keiyaku-houkoku.html の「MNM に登録する」と同じ口・10-26）
//   ① 案件確定 → ② 稼働追加（① が成功した後だけ）。送れない値があれば今のシステムが止めて理由を返す
//   ★試し送り／本番は今のシステムの MNM_DRY_RUN が決める。ver2 からは dry_run を渡さない（変えられない）
type Row = { status: string; at?: string; by?: string } | null;
type Status = { dryRun: boolean; configured: boolean; configProblem?: string; app: { kansai?: boolean } | null; problem?: string; confirmation: Row; assignment: Row };
type Masters = { companies: { id: string | number; name: string; formal_name?: string }[]; sections: { id: string | number; name: string }[] };
type Partner = { id: string | number; name: string; short_name?: string };
type Result = { blocked?: string[]; result?: { status: string; message: string; http_status?: number; submission_id?: string; details?: { field: string; message: string }[] } };
type Field = { key: string; value: string; src: string };

const ROW_LABEL: Record<string, string> = { pending: '送信中のまま', succeeded: '成功', rejected: '断られた', failed: '失敗（送り直せます）' };
const rowLabel = (r: Row) => (r ? `${ROW_LABEL[r.status] ?? r.status}（${String(r.at ?? '').slice(0, 16).replace('T', ' ')}）` : 'まだ送っていません');
const lbl = 'mb-1 block text-xs font-semibold text-muted';

export function MnmPanel({ live, name, houkoku, fields }: { live: boolean; name: string; houkoku: string; fields: Field[] }) {
  const fv = (k: string) => (fields.find((f) => f.key === k)?.value ?? '').trim();
  const st = useHoryu<Status>(live ? 'keiyaku-mnm-status' : null, { name });
  const s = st.data;
  const masters = useHoryu<Masters>(live && s?.configured ? 'keiyaku-mnm-masters' : null);
  const [on, setOn] = useState<Record<string, string>>({});
  const [osaka, setOsaka] = useState(false);
  const [ex, setEx] = useState<Record<string, string>>({});
  const [kw, setKw] = useState({ partner: '', support: '' });
  const [cands, setCands] = useState<{ partner: Partner[] | null; support: Partner[] | null }>({ partner: null, support: null });
  const [pick, setPick] = useState<{ partner: Partner | null; support: Partner | null }>({ partner: null, support: null });
  const [res, setRes] = useState<{ confirm?: Result | string; assign?: Result | string }>({});
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  // 雛形から入れられる値は入れておく（今の画面の mnmPrefill と同じ）
  useEffect(() => {
    setOn({ start_date: fv('開始日'), salary_division: /^(12割|13割)$/.test(fv('要員契約区分')) ? fv('要員契約区分') : '', sales_unit_price: fv('単価'), member_contract_unit_price: fv('要員契約単価') });
    setKw({ partner: fv('上位会社'), support: '' });
    setPick({ partner: null, support: null }); setCands({ partner: null, support: null }); setRes({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, houkoku]);

  const tenseki = /転籍/.test(fv('入社手続き'));
  const shienhi = !!fv('支援費単価') && fv('支援費単価') !== '0';
  const ready = !!(s?.configured && s?.app);
  const confDone = s?.confirmation?.status === 'succeeded';
  const left = fields.filter((f) => /★/.test(f.value)).length;
  const modeTxt = s ? (s.dryRun ? '試し送り（MNM には登録されません）' : '本番（MNM に登録されます）') : '';

  const search = async (key: 'partner' | 'support') => {
    const k = kw[key].trim(); if (!k) return;
    setPick((p) => ({ ...p, [key]: null })); setCands((c) => ({ ...c, [key]: null }));
    const r = await fetch(`/api/live/horyu/keiyaku-mnm-partners?keyword=${encodeURIComponent(k)}`, { cache: 'no-store' });
    const j = (await r.json().catch(() => ({}))) as { partners?: Partner[] };
    setCands((c) => ({ ...c, [key]: j.partners ?? [] }));
  };

  const send = (op: 'confirm' | 'assign' | 'resend', box: 'confirm' | 'assign', submissionId?: string) => {
    const head = s?.dryRun ? '【試し送り】MNM には登録されません' : op === 'assign' ? '【本番】MNM に案件・紹介・稼働を作ります' : '【本番】MNM の営業ラウンドが案件確定になり、総務へ入社手続きの連絡が飛びます';
    const body = op === 'resend' ? { op, submission_id: submissionId }
      : op === 'confirm' ? { op, name, houkoku, onboarding: { ...on, osaka_office: osaka, nyusha_tetsuzuki: fv('入社手続き') } }
      : { op, name, houkoku, fields: fields.map((f) => ({ key: f.key, value: f.value })), extra: { ...ex, client_partner: pick.partner, support_partner: pick.support } };
    setConfirm({
      title: op === 'resend' ? '同じ内容で送り直す' : op === 'confirm' ? '① 案件確定を送る' : '② 稼働追加を送る',
      lines: [head, `報告区分: ${houkoku || '—'}`],
      okLabel: '送る', danger: !s?.dryRun, sends: s?.dryRun ? undefined : 'MNM に登録されます（取り消しは MNM の画面で）',
      run: async () => {
        const r = await horyuPost<Result>('keiyaku-mnm', body);
        setRes((x) => ({ ...x, [box]: r.ok ? r.data : r.error }));
        void st.reload();
      },
    });
  };

  const Res = ({ v, box }: { v?: Result | string; box: 'confirm' | 'assign' }) => {
    if (!v) return null;
    if (typeof v === 'string') return <Msg text={`送れませんでした: ${v}`} bad />;
    if (v.blocked) return (
      <div className="mt-2 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>
        MNM には送っていません。MNM の画面で登録するか、値を直してください。
        <ul className="ml-4 list-disc">{v.blocked.map((b) => <li key={b}>{b}</li>)}</ul>
      </div>
    );
    const r = v.result; if (!r) return null;
    const tone = r.status === 'succeeded' ? 'ok' : r.status === 'rejected' ? 'bad' : 'warn';
    return (
      <div className="mt-2 rounded-lg px-3 py-2 text-sm" style={{ background: `var(--tone-${tone}-bg)`, color: `var(--tone-${tone}-fg)` }}>
        {r.message}{r.http_status ? `（HTTP ${r.http_status}）` : ''}
        {!!r.details?.length && <ul className="ml-4 list-disc">{r.details.map((d) => <li key={d.field + d.message}><b>{d.field}</b>：{d.message}</li>)}</ul>}
        {r.status === 'rejected' && <div className="text-xs">直してからもう一度押すと、新しい送信IDで送ります。</div>}
        {r.status === 'failed' && r.http_status !== 401 && r.http_status !== 403 && r.submission_id && (
          <button className={`${btnCls} mt-1.5`} onClick={() => send('resend', box, r.submission_id)}>同じ内容で送り直す</button>
        )}
      </div>
    );
  };

  const inp = (k: string, label: string, ph = '', set = setOn, val = on, max?: number) => (
    <label className="block"><span className={lbl}>{label}</span><input value={val[k] ?? ''} placeholder={ph} maxLength={max} onChange={(e) => set((o) => ({ ...o, [k]: e.target.value }))} className={`${inputCls} w-full`} /></label>
  );
  const PartnerPick = ({ k, title }: { k: 'partner' | 'support'; title: string }) => (
    <div className="mt-3">
      <span className={lbl}>{title}</span>
      <div className="flex flex-wrap items-center gap-2">
        <input value={kw[k]} onChange={(e) => setKw((o) => ({ ...o, [k]: e.target.value }))} placeholder="名前の一部" className={`${inputCls} w-64`} />
        <button className={btnCls} onClick={() => void search(k)} disabled={!live}>検索</button>
        <span className="text-xs text-muted">候補が1件でも自動では決めません。選んでください</span>
      </div>
      {cands[k] && (cands[k]!.length ? (
        <div className="mt-1.5 flex flex-col gap-1 text-sm">
          {cands[k]!.map((p) => (
            <label key={String(p.id)} className="flex items-center gap-1.5"><input type="radio" name={`mnm-${k}`} checked={pick[k]?.id === p.id} onChange={() => setPick((x) => ({ ...x, [k]: { id: p.id, name: p.name } }))} />{p.name}{p.short_name && <span className="text-xs text-muted">（{p.short_name}）</span>}</label>
          ))}
        </div>
      ) : <Msg text="MNM に取引先がありません。MNM の画面で取引先を作ってから送ってください。" bad />)}
    </div>
  );

  return (
    <Card title="4. MNM に登録する" right={s && <span className="chip" style={{ background: s.dryRun ? 'var(--tone-ok-bg)' : 'var(--tone-bad-bg)', color: s.dryRun ? 'var(--tone-ok-fg)' : 'var(--tone-bad-fg)' }}>{modeTxt}</span>}>
      {!live ? <p className="text-sm text-muted">読み込みが終わると、ここから MNM に ① 案件確定・② 稼働追加を送れます。</p> : (
        <div className="flex flex-col gap-1 text-sm">
          {!s ? <span className="text-muted">{st.state === 'error' ? `MNM の状態を読めませんでした: ${st.error}` : '読み込み中…'}</span> : (<>
            {!s.configured && <span style={{ color: 'var(--tone-bad-fg)' }}>MNM 連携の設定がまだです: {s.configProblem}</span>}
            {!s.app ? <span style={{ color: 'var(--tone-bad-fg)' }}>{s.problem}</span> : <span>MNM 応募ID: あり{s.app.kansai ? '・関西の要員（対象外）' : ''}</span>}
            <span>① 案件確定: {rowLabel(s.confirmation)}　／　② 稼働追加: {rowLabel(s.assignment)}</span>
          </>)}
          <span className="text-xs text-muted">対象は関西以外・未経験・正社員/契約社員の新しい成約だけです。送れない値（★要確認・その他・変換表に無い値）が1つでもあれば MNM には送らず、理由を出します。</span>
        </div>
      )}

      <h3 className="mb-2 mt-4 text-sm font-bold">① 案件確定（入社手続きの情報）</h3>
      <div className="grid grid-cols-1 gap-x-3.5 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {inp('start_date', '開始日', '2026/11/01')}
        <label className="block"><span className={lbl}>要員契約区分</span>
          <select value={on.salary_division ?? ''} onChange={(e) => setOn((o) => ({ ...o, salary_division: e.target.value }))} className={`${inputCls} w-full`}><option value="">選ぶ</option><option>12割</option><option>13割</option></select></label>
        {inp('sales_unit_price', '単価（円/月）')}
        {inp('member_presented_unit_price', '本人提示単価（円/月）')}
        {inp('member_contract_unit_price', '要員契約単価（月給・任意）')}
        <label className="block"><span className={lbl}>試用期間</span>
          <select value={on.trial_period ?? ''} onChange={(e) => setOn((o) => ({ ...o, trial_period: e.target.value }))} className={`${inputCls} w-full`}><option value="">選ぶ</option><option value="3months">3か月</option><option value="6months">6か月</option></select></label>
        {inp('member_email', '要員のメール', '本人のメール')}
        {inp('special_notes', '特記事項（100文字まで・任意）', '', setOn, on, 100)}
        <label className="flex items-center gap-1.5 self-end text-sm"><input type="checkbox" checked={osaka} onChange={(e) => setOsaka(e.target.checked)} />大阪事業所の要員</label>
        {tenseki && <>
          <label className="block"><span className={lbl}>転籍先の会社</span>
            <select value={on.transfer_to_company_id ?? ''} onChange={(e) => setOn((o) => ({ ...o, transfer_to_company_id: e.target.value }))} className={`${inputCls} w-full`}><option value="">選ぶ</option>{(masters.data?.companies ?? []).map((c) => <option key={String(c.id)} value={String(c.id)}>{c.formal_name || c.name}</option>)}</select></label>
          <label className="block"><span className={lbl}>福利厚生を置く会社</span>
            <select value={on.transfer_welfare_company ?? ''} onChange={(e) => setOn((o) => ({ ...o, transfer_welfare_company: e.target.value }))} className={`${inputCls} w-full`}><option value="">選ぶ</option><option value="before">転籍前の会社</option><option value="after">転籍先の会社</option></select></label>
        </>}
      </div>
      <div className="mt-2.5 flex items-center gap-2"><button className="btn-primary btn-sm" disabled={!live || !ready} onClick={() => send('confirm', 'confirm')}>① 案件確定を送る</button></div>
      <Res v={res.confirm} box="confirm" />

      <h3 className="mb-2 mt-5 text-sm font-bold">② 稼働追加（52項目＋MNM の取引先）</h3>
      <div className="grid grid-cols-1 gap-x-3.5 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {inp('project_title', '案件名', '例: 物流システム保守', setEx, ex)}
        {inp('commercial_flow_depth', '商流の深さ（任意・エンド直請け＝0）', '', setEx, ex)}
        <label className="block"><span className={lbl}>事業部（任意）</span>
          <select value={ex.section_id ?? ''} onChange={(e) => setEx((o) => ({ ...o, section_id: e.target.value }))} className={`${inputCls} w-full`}><option value="">選ばない</option>{(masters.data?.sections ?? []).map((c) => <option key={String(c.id)} value={String(c.id)}>{c.name}</option>)}</select></label>
        {inp('average_working_hours', '平均稼働時間（月・時給制・空なら160）', '160', setEx, ex)}
        {inp('average_working_days', '平均稼働日数（月・日給制・空なら20）', '20', setEx, ex)}
        <label className="block"><span className={lbl}>月中稼働の計算方法（途中入場なら必須）</span>
          <select value={ex.mid_month_billing ?? ''} onChange={(e) => setEx((o) => ({ ...o, mid_month_billing: e.target.value }))} className={`${inputCls} w-full`}><option value="">途中入場ではない</option><option value="prorate">日割り</option><option value="deduction">控除</option><option value="man_month">人月</option></select></label>
      </div>
      <PartnerPick k="partner" title="上位会社（MNM の取引先から選ぶ）" />
      {shienhi && <PartnerPick k="support" title="支援費の相手先（MNM の取引先から選ぶ）" />}
      <span className={`${lbl} mt-3`}>送付先（52項目の「勤務表_請求書_送付先」から振り分けて入れてください。複数はカンマ区切り）</span>
      <div className="whitespace-pre-wrap rounded-lg bg-soft px-2.5 py-2 text-xs text-muted">{fv('勤務表_請求書_送付先') || '（空）'}</div>
      <div className="mt-2 grid grid-cols-1 gap-x-3.5 gap-y-2.5 sm:grid-cols-2">
        {inp('invoice_to_emails', '請求書の宛先(To)', '', setEx, ex)}
        {inp('invoice_cc_emails', '請求書のCc', '', setEx, ex)}
        {inp('timesheet_to_emails', '勤務表の宛先(To)', '', setEx, ex)}
        {inp('timesheet_cc_emails', '勤務表のCc', '', setEx, ex)}
      </div>
      <label className="mt-2.5 block"><span className={lbl}>メールの署名（請求書がメール送付なら必須）</span>
        <textarea rows={2} value={ex.email_signature ?? ''} onChange={(e) => setEx((o) => ({ ...o, email_signature: e.target.value }))} className={`${inputCls} w-full`} /></label>
      <label className="mt-2.5 block"><span className={lbl}>メール以外の送り先（郵送先・アップロード先など・任意）</span>
        <textarea rows={2} maxLength={1000} value={ex.invoice_delivery_info ?? ''} onChange={(e) => setEx((o) => ({ ...o, invoice_delivery_info: e.target.value }))} className={`${inputCls} w-full`} /></label>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button className="btn-primary btn-sm" disabled={!live || !ready || !confDone || left > 0} onClick={() => send('assign', 'assign')}>② 稼働追加を送る</button>
        <span className="text-xs text-muted">{!confDone ? '① 案件確定が成功してから送れます' : left > 0 ? `★要確認の項目が ${left} 件残っています` : ''}</span>
      </div>
      <Res v={res.assign} box="assign" />
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
    </Card>
  );
}
