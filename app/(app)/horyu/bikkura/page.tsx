'use client';

import { useState } from 'react';
import { Card, HoryuFrame, Msg, Tabs, btnCls, fmtAt, horyuPost, inputCls, tdCls, thCls, useHoryu, type HState } from '@/components/horyu/kit';

// たまげたポン 管理・承認・設定（保留・10-25）。今の bikkura-admin.html / bikkura-approve.html と同じ中身。
//   ・承認＝承認者に指名された人（と管理者）。管理（ダッシュボード・受け取り待ち・設定・使える人）＝今のページ権限 bikkura-admin
//   ・見られるかは今のシステムが決める（403 のタブは出さない）
//   ・出てくる名前は内勤の人（未経験の要員ではない）なので小窓にはしない
type Pending = { id: number; name: string; kind: string; minutes: number; memo: string; at: string; mine: boolean };
type Decided = Pending & { status: string; miles: number | null; reason: string; decided_by_name: string; decided_at: string };
type Approvals = { pending: Pending[]; recent: Decided[]; max_miles: number; miles_per_draw: number };
type Draw = { id: number; email: string; drawn_at: string; result: string; prize_name_snapshot: string; fulfilled_at?: string | null };
type Dash = { kpi: { tasks: number; tasks_prev: number; hours: number; hours_prev: number; manual_ratio: number; capped_people: number; draws: number; waiting: number; hit_rate: number | null }; kinds: string[]; people: Array<{ email: string; name: string; role: string; count: number; hours: number; manual: number; day_avg: number; draws: number; capped: boolean }> };
type Settings = Record<string, number>;
type SettingsRes = { settings: Settings; own: boolean; role: string; jimu_roles: string[]; roles_with_own: string[] };
type User = { email: string; name: string; role: string; bikkura: boolean; since: string | null; jimu_role: string | null; approver: boolean };

const SETTING_LABEL: Array<[string, string]> = [
  ['miles_per_draw', '1回まわすのに要るマイル'], ['daily_mile_cap', '1日にためられるマイル'], ['manual_daily_cap', '画面の外のタスクの申請（1日）'],
  ['gold_rate', '大当たりの確率（0〜1）'], ['silver_rate', '当たりの確率（0〜1）'], ['pity_after', '天井（はずれが続いた回数）'], ['pity_gold_rate', '天井のあとの大当たり確率'],
  ['title_days', '称号を出す日数'], ['weekly_gold_per_person', '大当たり 1人1週の上限（0=なし）'], ['weekly_guarantee_draws', '大当たり 週の保証回数（0=なし）'],
  ['weekly_silver_per_person', '当たり 1人1週の上限'], ['weekly_silver_guarantee_draws', '当たり 週の保証回数'], ['daily_silver_per_person', '当たり 1人1日の上限'],
  ['daily_draw_cap', '1日にまわせる回数（0=なし）'], ['hold_cap_draws', 'マイルを持てるのは何回分まで（0=なし）'],
];

const now = Date.now();
const S_APPROVALS: Approvals = {
  max_miles: 100, miles_per_draw: 5,
  pending: [{ id: 1, name: '事務 見本A', kind: '連絡・対応', minutes: 30, memo: '取引先との日程調整（見本）', at: new Date(now - 3600000).toISOString(), mine: false }],
  recent: [{ id: 2, name: '事務 見本B', kind: '名簿・書類', minutes: 20, memo: '書類の確認（見本）', at: new Date(now - 86400000).toISOString(), mine: false, status: 'approved', miles: 2, reason: '', decided_by_name: '管理 見本', decided_at: new Date(now - 80000000).toISOString() }],
};
const S_DASH: Dash = { kpi: { tasks: 412, tasks_prev: 380, hours: 96.5, hours_prev: 90, manual_ratio: 12, capped_people: 1, draws: 38, waiting: 2, hit_rate: 29 }, kinds: [], people: [
  { email: 'a@example.com', name: '事務 見本A', role: '営業事務', count: 160, hours: 38.2, manual: 12, day_avg: 32, draws: 14, capped: true },
  { email: 'b@example.com', name: '事務 見本B', role: '労務事務', count: 120, hours: 29.4, manual: 8, day_avg: 24, draws: 10, capped: false },
] };
const S_DRAWS = { waiting: [{ id: 11, email: 'a@example.com', drawn_at: new Date(now - 7200000).toISOString(), result: 'gold', prize_name_snapshot: 'お菓子セット（見本）' }], recent: [] as Draw[] };
const S_SETTINGS: SettingsRes = { settings: { miles_per_draw: 5, daily_mile_cap: 30, manual_daily_cap: 10, gold_rate: 0.03, silver_rate: 0.27, pity_after: 15, pity_gold_rate: 0.1, title_days: 7, weekly_gold_per_person: 1, weekly_guarantee_draws: 10, weekly_silver_per_person: 0, weekly_silver_guarantee_draws: 0, daily_silver_per_person: 1, daily_draw_cap: 6, hold_cap_draws: 6 }, own: true, role: '', jimu_roles: ['営業事務', '労務事務', '経理事務'], roles_with_own: [] };
const S_USERS: User[] = [{ email: 'a@example.com', name: '事務 見本A', role: 'staff', bikkura: true, since: '2026-09-12', jimu_role: '営業事務', approver: false }];

type TabKey = 'approve' | 'dash' | 'draws' | 'settings' | 'users';

export default function BikkuraPage() {
  const ap = useHoryu<Approvals>('bikkura-approvals');
  const dr = useHoryu<{ waiting: Draw[]; recent: Draw[] }>('bikkura-draws');
  const sample = ap.state === 'sample' || dr.state === 'sample';
  const canApprove = sample || ap.state === 'live';
  const canAdmin = sample || dr.state === 'live';
  const state: HState = sample ? 'sample' : ap.state === 'loading' || dr.state === 'loading' ? 'loading' : canApprove || canAdmin ? 'live' : ap.state === 'error' ? 'error' : 'forbidden';
  const tabs = [
    ...(canApprove ? [{ key: 'approve' as TabKey, label: '承認', badge: (sample ? S_APPROVALS : ap.data)?.pending.length }] : []),
    ...(canAdmin ? [{ key: 'dash' as TabKey, label: 'ダッシュボード' }, { key: 'draws' as TabKey, label: '受け取り待ち', badge: (sample ? S_DRAWS : dr.data)?.waiting.length }, { key: 'settings' as TabKey, label: '設定' }, { key: 'users' as TabKey, label: '使える人' }] : []),
  ];
  const [tab, setTab] = useState<TabKey>('approve');
  const cur = tabs.find((t) => t.key === tab) ? tab : tabs[0]?.key;

  return (
    <HoryuFrame title="たまげたポン 管理" sub="画面の外のタスクの承認・使われ方・景品の受け取り・設定" state={state} error={ap.error} onReload={() => { void ap.reload(); void dr.reload(); }}>
      <Tabs<TabKey> tabs={tabs} value={cur ?? 'approve'} onChange={setTab} />
      {cur === 'approve' && <ApproveTab sample={sample} data={sample ? S_APPROVALS : ap.data} reload={ap.reload} />}
      {cur === 'dash' && <DashTab sample={sample} />}
      {cur === 'draws' && <DrawsTab sample={sample} data={sample ? S_DRAWS : dr.data} reload={dr.reload} />}
      {cur === 'settings' && <SettingsTab sample={sample} />}
      {cur === 'users' && <UsersTab sample={sample} />}
    </HoryuFrame>
  );
}

function ApproveTab({ sample, data, reload }: { sample: boolean; data: Approvals | null; reload: () => void }) {
  const [miles, setMiles] = useState<Record<number, string>>({});
  const [reason, setReason] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(0);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  if (!data) return null;
  const decide = async (p: Pending, approve: boolean) => {
    const m = Number(miles[p.id] ?? 1);
    if (approve && !(Number.isInteger(m) && m >= 0 && m <= data.max_miles)) { setMsg({ text: `マイルは0〜${data.max_miles}の整数で`, bad: true }); return; }
    if (!approve && !(reason[p.id] || '').trim()) { setMsg({ text: '却下するときは理由を入れてください', bad: true }); return; }
    if (sample) { setMsg({ text: `見本なので保存はしていません（${approve ? `承認 ${m}マイル` : '却下'}）` }); return; }
    setBusy(p.id);
    const r = await horyuPost('bikkura-decide', { id: p.id, approve, miles: m, reason: reason[p.id] || '' });
    setBusy(0);
    setMsg(r.ok ? { text: `${p.name} の申請を${approve ? `承認（${m}マイル）` : '却下'}しました` } : { text: r.error, bad: true });
    if (r.ok) reload();
  };
  return (
    <>
      <Msg text={msg.text} bad={msg.bad} />
      <Card title="承認待ち" note={`1回 ${data.miles_per_draw}マイル・自分の申請は決められません`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-body">
            <thead><tr className="th-row"><th className={thCls}>いつ</th><th className={thCls}>だれ</th><th className={thCls}>種別・分</th><th className={thCls}>内容</th><th className={thCls}>マイル</th><th className={thCls}>却下の理由</th><th className={thCls} /></tr></thead>
            <tbody>
              {data.pending.map((p) => (
                <tr key={p.id} className="border-t border-line-soft align-top">
                  <td className={`${tdCls} num whitespace-nowrap`}>{fmtAt(p.at)}</td><td className={`${tdCls} font-semibold`}>{p.name}</td>
                  <td className={tdCls}>{p.kind}<div className="text-xs text-faint">{p.minutes}分</div></td>
                  <td className={`${tdCls} max-w-[280px] whitespace-pre-wrap`}>{p.memo}</td>
                  <td className={tdCls}><input value={miles[p.id] ?? '1'} onChange={(e) => setMiles({ ...miles, [p.id]: e.target.value.replace(/[^\d]/g, '') })} inputMode="numeric" aria-label="与えるマイル" className={`${inputCls} num w-[64px]`} disabled={p.mine} /></td>
                  <td className={tdCls}><input value={reason[p.id] ?? ''} onChange={(e) => setReason({ ...reason, [p.id]: e.target.value })} aria-label="却下の理由" className={`${inputCls} w-[160px]`} disabled={p.mine} /></td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    {p.mine ? <span className="text-sm text-faint">自分の申請</span> : <>
                      <button className="btn-primary" disabled={busy === p.id} onClick={() => decide(p, true)}>承認</button>
                      <button className={`${btnCls} ml-1.5`} disabled={busy === p.id} onClick={() => decide(p, false)}>却下</button>
                    </>}
                  </td>
                </tr>
              ))}
              {!data.pending.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">承認待ちはありません</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="最近の決定">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-body">
            <thead><tr className="th-row"><th className={thCls}>決めた日</th><th className={thCls}>だれの</th><th className={thCls}>内容</th><th className={thCls}>結果</th><th className={thCls}>決めた人</th></tr></thead>
            <tbody>{data.recent.map((r) => (
              <tr key={r.id} className="border-t border-line-soft"><td className={`${tdCls} num`}>{fmtAt(r.decided_at)}</td><td className={tdCls}>{r.name}</td><td className={`${tdCls} max-w-[260px] truncate`}>{r.kind}・{r.memo}</td>
                <td className={tdCls}>{r.status === 'approved' ? `承認 ${r.miles ?? 0}マイル` : `却下${r.reason ? `（${r.reason}）` : ''}`}</td><td className={tdCls}>{r.decided_by_name}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function DashTab({ sample }: { sample: boolean }) {
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() + 9 * 3600000 - 6 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const d = useHoryu<Dash>(sample ? null : 'bikkura-dashboard', { from, to });
  const data = sample ? S_DASH : d.data;
  const k = data?.kpi;
  const tile = (label: string, v: string, prev?: string) => (
    <div className="rounded-xl border border-line bg-surface px-4 py-3"><div className="text-sm text-muted">{label}</div><div className="num text-xl font-bold">{v}</div>{prev && <div className="text-xs text-faint">前の期間 {prev}</div>}</div>
  );
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="いつから" className={inputCls} />〜
        <input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="いつまで" className={inputCls} />
        {!sample && d.state === 'error' && <Msg text={d.error} bad />}
      </div>
      {k && <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tile('タスク数', String(k.tasks), String(k.tasks_prev))}{tile('推定工数', `${k.hours}h`, `${k.hours_prev}h`)}
        {tile('手動の割合', `${k.manual_ratio}%`)}{tile('抽選', `${k.draws}回`, k.hit_rate == null ? undefined : `当たり率 ${k.hit_rate}%`)}
      </div>}
      <Card title="人ごと">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-body">
            <thead><tr className="th-row"><th className={thCls}>だれ</th><th className={thCls}>役割</th><th className={`${thCls} text-right`}>件数</th><th className={`${thCls} text-right`}>工数</th><th className={`${thCls} text-right`}>手動</th><th className={`${thCls} text-right`}>日平均</th><th className={`${thCls} text-right`}>抽選</th></tr></thead>
            <tbody>{(data?.people ?? []).map((p) => (
              <tr key={p.email} className="border-t border-line-soft"><td className={`${tdCls} font-semibold`}>{p.name}{p.capped && <span className="ml-1.5 text-xs text-warn">上限に届いた日あり</span>}</td><td className={tdCls}>{p.role}</td>
                <td className={`${tdCls} num text-right`}>{p.count}</td><td className={`${tdCls} num text-right`}>{p.hours}h</td><td className={`${tdCls} num text-right`}>{p.manual}</td><td className={`${tdCls} num text-right`}>{p.day_avg}</td><td className={`${tdCls} num text-right`}>{p.draws}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function DrawsTab({ sample, data, reload }: { sample: boolean; data: { waiting: Draw[]; recent: Draw[] } | null; reload: () => void }) {
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const [busy, setBusy] = useState(0);
  if (!data) return null;
  const fulfill = async (d: Draw) => {
    if (sample) { setMsg({ text: '見本なので保存はしていません' }); return; }
    setBusy(d.id);
    const r = await horyuPost('bikkura-fulfill', { id: d.id });
    setBusy(0);
    setMsg(r.ok ? { text: `「${d.prize_name_snapshot}」を渡したことにしました` } : { text: r.error, bad: true });
    if (r.ok) reload();
  };
  return (
    <>
      <Msg text={msg.text} bad={msg.bad} />
      <Card title="景品の受け取り待ち" note="現物が当たった分">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-body">
            <thead><tr className="th-row"><th className={thCls}>当たった日</th><th className={thCls}>だれ</th><th className={thCls}>景品</th><th className={thCls} /></tr></thead>
            <tbody>
              {data.waiting.map((d) => (
                <tr key={d.id} className="border-t border-line-soft"><td className={`${tdCls} num`}>{fmtAt(d.drawn_at)}</td><td className={tdCls}>{d.email.split('@')[0]}</td><td className={`${tdCls} font-semibold`}>{d.prize_name_snapshot}{d.result === 'gold' ? '（大当たり）' : ''}</td>
                  <td className={tdCls}><button className={btnCls} disabled={busy === d.id} onClick={() => fulfill(d)}>渡した</button></td></tr>
              ))}
              {!data.waiting.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">受け取り待ちはありません</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function SettingsTab({ sample }: { sample: boolean }) {
  const [role, setRole] = useState('');
  const s = useHoryu<SettingsRes>(sample ? null : 'bikkura-settings', { role });
  const data = sample ? S_SETTINGS : s.data;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const [busy, setBusy] = useState(false);
  if (!data) return s.state === 'error' ? <Msg text={s.error} bad /> : null;
  const val = (k: string) => draft[k] ?? String(data.settings[k] ?? '');
  const save = async () => {
    const settings: Record<string, unknown> = { ...data.settings };
    for (const [k] of SETTING_LABEL) { const n = Number(val(k)); if (!Number.isFinite(n)) { setMsg({ text: '数字で入れてください', bad: true }); return; } settings[k] = n; }
    if (sample) { setMsg({ text: '見本なので保存はしていません' }); return; }
    setBusy(true);
    const r = await horyuPost('bikkura-settings', { role, settings });
    setBusy(false);
    setMsg(r.ok ? { text: '設定を保存しました（次の抽選から）' } : { text: r.error, bad: true });
    if (r.ok) { setDraft({}); void s.reload(); }
  };
  return (
    <Card title="設定" note={role ? (data.own ? `${role} だけの設定` : `${role} はいま全体の設定で動いています（保存するとこの役割だけの設定になります）`) : '全体の設定'}
      right={<label className="flex items-center gap-1.5 text-sm text-muted">どの設定<select value={role} onChange={(e) => { setRole(e.target.value); setDraft({}); }} className={inputCls}><option value="">全体</option>{data.jimu_roles.map((r) => <option key={r} value={r}>{r}{data.roles_with_own.includes(r) ? '（別設定あり）' : ''}</option>)}</select></label>}>
      <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2">
        {SETTING_LABEL.map(([k, label]) => (
          <label key={k} className="flex items-center justify-between gap-2 rounded-lg border border-line-soft px-3 py-2 text-body">{label}
            <input value={val(k)} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} inputMode="decimal" className={`${inputCls} num w-[90px] text-right`} />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
        <button className="btn-primary" disabled={busy || !Object.keys(draft).length} onClick={save}>保存する</button>
        <Msg text={msg.text} bad={msg.bad} />
      </div>
    </Card>
  );
}

function UsersTab({ sample }: { sample: boolean }) {
  const u = useHoryu<{ users: User[]; jimu_roles: string[] }>(sample ? null : 'bikkura-users');
  const users = sample ? S_USERS : u.data?.users ?? [];
  const roles = sample ? ['営業事務', '労務事務', '経理事務'] : u.data?.jimu_roles ?? [];
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const grant = async (x: User, patch: Record<string, unknown>) => {
    if (sample) { setMsg({ text: '見本なので保存はしていません' }); return; }
    const r = await horyuPost('bikkura-grant', { email: x.email, ...patch });
    setMsg(r.ok ? { text: `${x.name} を直しました` } : { text: r.error, bad: true });
    if (r.ok) void u.reload();
  };
  return (
    <>
      <Msg text={msg.text} bad={msg.bad} />
      <Card title="使える人" note="ロールが付いている人だけ。開始日は最初に許可した日のまま">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-body">
            <thead><tr className="th-row"><th className={thCls}>だれ</th><th className={thCls}>使える</th><th className={thCls}>事務の役割</th><th className={thCls}>承認者</th><th className={thCls}>開始日</th></tr></thead>
            <tbody>{users.map((x) => (
              <tr key={x.email} className="border-t border-line-soft">
                <td className={tdCls}><b>{x.name}</b><div className="text-xs text-faint">{x.role}</div></td>
                <td className={tdCls}><input type="checkbox" checked={x.bikkura} onChange={(e) => grant(x, { on: e.target.checked })} aria-label={`${x.name} が使える`} /></td>
                <td className={tdCls}><select value={x.jimu_role || ''} onChange={(e) => grant(x, { jimu_role: e.target.value })} className={inputCls} aria-label="事務の役割"><option value="">なし</option>{roles.map((r) => <option key={r}>{r}</option>)}</select></td>
                <td className={tdCls}><input type="checkbox" checked={x.approver} onChange={(e) => grant(x, { approver: e.target.checked })} aria-label={`${x.name} を承認者にする`} /></td>
                <td className={`${tdCls} num`}>{x.since ? String(x.since).slice(0, 10) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
