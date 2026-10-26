'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, HoryuFrame, Msg, Tabs, horyuPost, inputCls, tdCls, thCls, useHoryu, fmtAt } from '@/components/horyu/kit';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { FreeeSyncButton, KintaiAlertPanel, MnmSyncButton } from '@/components/horyu/Ops';

// 設定センター（保留・10-25 → 10-26 変えられるようにした）。今の /settings.html と同じ口（/api/settings）。
//   ・設定：その場で変えられる項目（オン/オフ・選ぶ・数・時刻・一覧）だけ。専用の画面が要る項目（担当ルール・勤務パターン・
//     LINE の部品など）は名前と「今の画面で」だけ出す。見える区分・変えられるか・承認つきかは今のシステムが決める
//     変える → 「何が変わる・影響」を今のシステムで出す（preview・書かない）→ 確認の窓 → 保存（承認つきなら承認の依頼）
//   ・承認待ち：承認・取り下げ（できるかは今のシステムが判定）
//   ・変更履歴：どの設定を・だれが・いつ。元に戻せるものは「元に戻す」（値そのものは出さない）
//   ・手で動かす：未打刻アラート・MNM 同期・freee 請求書の取り込み（全体管理者だけ・確認の窓のあと）
type Level = 'edit' | 'approve' | 'view' | 'hide';
type Item = { id: string; section: string; page: string; group: string; label: string; help?: string; type: string; min?: number; max?: number; unit?: string; options?: { value: string; label: string }[]; store: { kind: string; key?: string; path?: string }; wired: boolean; inline?: boolean };
type Val = { value: unknown; updatedAt: string | null; exists: boolean; label: string; section: string };
type Pending = { id: number; section: string; storeKey: string; label: string; changes: Change[] | null; requestedBy: string; requestedAt: string; expiresAt: string; mine: boolean; canApprove: boolean; canWithdraw: boolean };
type Change = { label?: string; before?: unknown; after?: unknown } | string;
type Center = { role: string; levels: Record<string, Level>; sections: { key: string; label: string }[]; items: Item[]; values: Record<string, Val>; pending: Pending[] };
type Row = { id: number; at: string; actor: string; section: string; sectionLabel: string; label: string; action: string; actionLabel: string; state: string; changes: Change[] | null; canUndo?: boolean };
type Preview = { label: string; plan: 'apply' | 'request' | 'deny'; changes: { label: string; before: string; after: string }[]; impact?: { text?: string; linked?: string[] }; counterparts?: string[]; pendingExists?: { requestedBy?: string } | null; warning?: string };

const STATE_LABEL: Record<string, string> = { ok: '反映ずみ', undone: '元に戻した', pending: '承認待ち', closed: '決まった', withdrawn: '取り下げ', revert: '元に戻す操作' };
const LEVEL_LABEL: Record<Level, string> = { edit: '編集できる', approve: '承認つき', view: '見るだけ', hide: '見えない' };
const storeKeyOf = (i: Item) => (i.store.kind === 'user_prefs' ? 'user_prefs' : i.store.key || '');
const curOf = (i: Item, values: Record<string, Val>): unknown => {
  const v = values[storeKeyOf(i)]?.value;
  return i.store.path ? (v && typeof v === 'object' ? (v as Record<string, unknown>)[i.store.path] : undefined) : v;
};
const show = (v: unknown) => (v == null || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'オン' : 'オフ') : Array.isArray(v) ? v.join('・') || '（なし）' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const changeText = (c: Change[] | null) => (c ?? []).map((x) => (typeof x === 'string' ? x : x.label || '')).filter(Boolean).join('・');
const hintOf = (r: { error: string; data: Record<string, unknown> }) => String(r.data.hint || '') || r.error;

export default function SettingsCenterPage() {
  const [tab, setTab] = useState<'items' | 'pending' | 'history' | 'ops'>('items');
  const c = useHoryu<Center>('settings-center');
  const h = useHoryu<{ rows: Row[] }>(tab === 'history' ? 'settings-history' : null);
  const sample = !c.live; // 本物が読めていない（読み込み中・ログインなし・読めない）ときは書かない
  const center = c.data;
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const pendingN = center?.pending?.length ?? 0;

  return (
    <HoryuFrame title="設定センター" sub="社内システムの設定を変える・承認する・変更履歴から戻す" state={c.state} error={c.error} onReload={c.reload}>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'items', label: '設定' }, { key: 'pending', label: '承認待ち', badge: pendingN }, { key: 'history', label: '変更履歴' }, { key: 'ops', label: '手で動かす' }]} />
      <Msg text={msg.text} bad={msg.bad} />
      {tab === 'items' && center && <Items center={center} sample={sample} setMsg={setMsg} setConfirm={setConfirm} reload={c.reload} />}
      {tab === 'pending' && center && <PendingList center={center} sample={sample} setMsg={setMsg} setConfirm={setConfirm} reload={c.reload} />}
      {tab === 'history' && <History rows={h.data?.rows ?? []} loading={h.state === 'loading'} error={h.state === 'error' ? h.error : ''} sample={sample} setMsg={setMsg} setConfirm={setConfirm} reload={() => { void h.reload(); void c.reload(); }} />}
      {tab === 'ops' && (
        <div className="flex flex-col gap-3.5">
          <KintaiAlertPanel sample={sample} />
          <Card title="同期" note="自動で回っているものを、いま手で回します">
            <div className="flex flex-col gap-3 px-4 pb-4">
              <div className="flex flex-wrap items-center gap-2 text-sm"><b className="w-[150px]">ミンナのミカタ（MNM）</b><MnmSyncButton sample={sample} /></div>
              <div className="flex flex-wrap items-center gap-2 text-sm"><b className="w-[150px]">freee 請求書</b><FreeeSyncButton sample={sample} /></div>
            </div>
          </Card>
        </div>
      )}
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
    </HoryuFrame>
  );
}

type Ctl = { sample: boolean; setMsg: (m: { text: string; bad?: boolean }) => void; setConfirm: (s: ConfirmSpec | null) => void; reload: () => void };

function Items({ center, sample, setMsg, setConfirm, reload }: { center: Center } & Ctl) {
  const [sec, setSec] = useState('');
  const sections = center.sections.filter((s) => center.levels[s.key] && center.levels[s.key] !== 'hide');
  const items = center.items.filter((i) => (!sec || i.section === sec) && (center.levels[i.section] ?? 'hide') !== 'hide');
  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items) { const k = `${i.section}|${i.group}`; m.set(k, [...(m.get(k) || []), i]); }
    return [...m.entries()];
  }, [items]);
  const secLabel = (k: string) => center.sections.find((s) => s.key === k)?.label ?? k;

  const save = async (i: Item, next: unknown) => {
    const sk = storeKeyOf(i);
    const cur = center.values[sk];
    const whole = i.store.path ? { ...((cur?.value && typeof cur.value === 'object' ? cur.value : {}) as Record<string, unknown>), [i.store.path]: next } : next;
    if (sample) return;
    const pv = await horyuPost<Preview>('settings-preview', { storeKey: sk, value: whole });
    if (!pv.ok) { setMsg({ text: hintOf(pv), bad: true }); return; }
    const p = pv.data;
    const request = p.plan === 'request';
    const blocked = p.plan === 'deny' ? '見るだけのため保存できません' : p.pendingExists ? `承認待ちの変更があります（${p.pendingExists.requestedBy || ''}）。承認か取り下げのあとに保存してください` : !p.changes.length ? '変わるところがありません' : undefined;
    setConfirm({
      title: `${p.label || i.label}を${request ? '変える（承認の依頼）' : '変える'}`, okLabel: request ? '承認を依頼する' : '保存する', blocked,
      lines: [
        ...p.changes.map((x) => `${x.label}：${x.before} → ${x.after}`),
        `影響：${p.impact?.text || 'なし'}`, ...(p.impact?.linked || []),
        ...(p.warning ? [p.warning] : []),
        request ? `${p.counterparts?.length ? `${p.counterparts.join('・')}の` : '承認者の'}承認のあとに反映されます` : '保存後も、変更履歴から元に戻せます',
      ],
      run: async () => {
        const r = await horyuPost<{ pending?: boolean }>('settings-save', { storeKey: sk, value: whole, expectedUpdatedAt: cur?.updatedAt || '' });
        if (!r.ok) throw new Error(hintOf(r));
        setMsg({ text: r.data.pending ? `${i.label}：承認を依頼しました。承認されると反映されます` : `${i.label}：保存しました。変更履歴から元に戻せます` });
        reload();
      },
    });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="mo-fade-up flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3">
        <label className="flex items-center gap-1.5 text-sm text-muted">区分<select value={sec} onChange={(e) => setSec(e.target.value)} className={inputCls}><option value="">すべて</option>{sections.map((s) => <option key={s.key} value={s.key}>{s.label}（{LEVEL_LABEL[center.levels[s.key]]}）</option>)}</select></label>
        <span className="ml-auto text-sm text-faint">あなたのロール：{center.role}</span>
      </div>
      {groups.map(([k, list], gi) => {
        const lv = center.levels[list[0].section] ?? 'hide';
        return (
          <Card key={k} title={list[0].group} note={`${secLabel(list[0].section)}・${LEVEL_LABEL[lv]}`} i={gi + 1}>
            <div className="flex flex-col">
              {list.map((i) => <ItemRow key={i.id} item={i} value={curOf(i, center.values)} canEdit={lv === 'edit' || lv === 'approve'} onSave={(v) => void save(i, v)} />)}
            </div>
          </Card>
        );
      })}
      {!groups.length && <p className="text-body text-muted">見られる設定がありません</p>}
    </div>
  );
}

function ItemRow({ item: i, value, canEdit, onSave }: { item: Item; value: unknown; canEdit: boolean; onSave: (v: unknown) => void }) {
  const asText = Array.isArray(value) ? value.join('\n') : value == null ? '' : String(value);
  const [draft, setDraft] = useState<string>(asText);
  useEffect(() => { setDraft(asText); }, [asText]);
  const editable = canEdit && i.wired && !!i.inline;
  const note = !i.wired ? '準備中' : !i.inline ? '専用の画面で変えます（今の設定センターで）' : !canEdit ? '見るだけ' : '';
  let ctl: React.ReactNode = <span className="text-body">{show(value)}</span>;
  if (editable && i.type === 'toggle') ctl = (
    <label className="flex items-center gap-2"><input type="checkbox" checked={value === true} onChange={(e) => onSave(e.target.checked)} />{value === true ? 'オン' : 'オフ'}</label>
  );
  else if (editable && i.type === 'select') ctl = (
    <select value={String(value ?? '')} onChange={(e) => onSave(e.target.value)} className={inputCls}>{(i.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
  );
  else if (editable && (i.type === 'number' || i.type === 'time')) ctl = (
    <span className="flex items-center gap-1.5">
      <input type={i.type === 'time' ? 'time' : 'number'} min={i.min} max={i.max} value={draft} onChange={(e) => setDraft(e.target.value)} className={`${inputCls} w-[120px]`} />{i.unit && <span className="text-sm text-muted">{i.unit}</span>}
      <button className="btn-secondary btn-sm" disabled={draft === String(value ?? '') || draft === ''} onClick={() => onSave(i.type === 'number' ? Number(draft) : draft)}>変える</button>
    </span>
  );
  else if (editable && i.type === 'list') ctl = (
    <span className="flex flex-wrap items-end gap-1.5">
      <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} className={`${inputCls} w-[280px]`} placeholder="1行に1つ" />
      <button className="btn-secondary btn-sm" disabled={draft === (Array.isArray(value) ? value.join('\n') : '')} onClick={() => onSave(draft.split('\n').map((x) => x.trim()).filter(Boolean))}>変える</button>
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line-soft px-4 py-2.5">
      <div className="min-w-[220px] flex-1"><div className="text-body font-semibold">{i.label}</div>{i.help && <div className="text-xs text-faint">{i.help}</div>}</div>
      <div className="flex flex-wrap items-center gap-2">{ctl}{note && <span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{note}</span>}</div>
    </div>
  );
}

function PendingList({ center, sample, setMsg, setConfirm, reload }: { center: Center } & Ctl) {
  const act = (p: Pending, op: 'approve' | 'withdraw') => {
    if (sample) return;
    setConfirm({
      title: `${p.label}を${op === 'approve' ? '承認する' : '取り下げる'}`, okLabel: op === 'approve' ? '承認する' : '取り下げる', danger: op === 'withdraw',
      lines: [`依頼：${p.requestedBy.split('@')[0]}（${fmtAt(p.requestedAt)}）`, ...(changeText(p.changes) ? [`変わる所：${changeText(p.changes)}`] : []), op === 'approve' ? '承認するとすぐ反映されます。変更履歴から元に戻せます' : '取り下げると反映されません'],
      run: async () => {
        const r = await horyuPost('settings-pending', { id: p.id, op });
        if (!r.ok) throw new Error(hintOf(r));
        setMsg({ text: `${p.label}を${op === 'approve' ? '承認しました' : '取り下げました'}` }); reload();
      },
    });
  };
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-body">
          <thead><tr className="th-row"><th className={thCls}>設定</th><th className={thCls}>依頼した人</th><th className={thCls}>いつ</th><th className={thCls}>期限</th><th className={thCls} /></tr></thead>
          <tbody>
            {center.pending.map((p) => (
              <tr key={p.id} className="border-t border-line-soft align-top">
                <td className={tdCls}><b>{p.label}</b>{changeText(p.changes) && <div className="text-xs text-faint">{changeText(p.changes)}</div>}</td>
                <td className={tdCls}>{p.requestedBy.split('@')[0]}{p.mine && <span className="ml-1 text-xs text-faint">（自分）</span>}</td>
                <td className={`${tdCls} num`}>{fmtAt(p.requestedAt)}</td>
                <td className={`${tdCls} num`}>{fmtAt(p.expiresAt)}</td>
                <td className={`${tdCls} whitespace-nowrap`}>
                  <button className="btn-primary btn-sm" disabled={!p.canApprove} title={p.canApprove ? undefined : '承認できるのは承認者だけです（自分の依頼は承認できません）'} onClick={() => act(p, 'approve')}>承認</button>
                  <button className="btn-secondary btn-sm ml-1" disabled={!p.canWithdraw} onClick={() => act(p, 'withdraw')}>取り下げ</button>
                </td>
              </tr>
            ))}
            {!center.pending.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">承認待ちはありません</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function History({ rows, loading, error, sample, setMsg, setConfirm, reload }: { rows: Row[]; loading: boolean; error: string } & Ctl) {
  const [sec, setSec] = useState('');
  const sections = useMemo(() => [...new Map(rows.map((x) => [x.section, x.sectionLabel])).entries()], [rows]);
  const shown = rows.filter((x) => !sec || x.section === sec);
  const revert = (x: Row) => {
    if (sample) return;
    setConfirm({
      title: `${x.label}を元に戻す`, okLabel: '元に戻す',
      lines: [`${fmtAt(x.at)} に ${x.actor.split('@')[0] || '—'} が変えた分を、その前の値に戻します`, ...(changeText(x.changes) ? [`戻る所：${changeText(x.changes)}`] : []), '戻したことも変更履歴に残ります'],
      run: async () => {
        const r = await horyuPost('settings-revert', { auditId: x.id });
        if (!r.ok) throw new Error(hintOf(r));
        setMsg({ text: `${x.label}を元に戻しました` }); reload();
      },
    });
  };
  return (
    <div className="flex flex-col gap-3.5">
      <div className="mo-fade-up flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3">
        <label className="flex items-center gap-1.5 text-sm text-muted">区分<select value={sec} onChange={(e) => setSec(e.target.value)} className={inputCls}><option value="">すべて</option>{sections.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <span className="ml-auto text-sm text-faint">{shown.length}件</span>
      </div>
      {error && <Msg text={error} bad />}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-body">
            <thead><tr className="th-row"><th className={thCls}>いつ</th><th className={thCls}>だれが</th><th className={thCls}>区分</th><th className={thCls}>設定</th><th className={thCls}>操作</th><th className={thCls}>状態</th><th className={thCls} /></tr></thead>
            <tbody>
              {shown.map((x) => (
                <tr key={x.id} className="border-t border-line-soft align-top">
                  <td className={`${tdCls} num whitespace-nowrap`}>{fmtAt(x.at)}</td>
                  <td className={tdCls}>{x.actor.split('@')[0] || '—'}</td>
                  <td className={tdCls}>{x.sectionLabel}</td>
                  <td className={tdCls}><b>{x.label}</b>{changeText(x.changes) && <div className="text-xs text-faint">{changeText(x.changes)}</div>}</td>
                  <td className={tdCls}>{x.actionLabel}</td>
                  <td className={tdCls}>{STATE_LABEL[x.state] ?? x.state}</td>
                  <td className={tdCls}>{x.canUndo && <button className="btn-secondary btn-sm" onClick={() => revert(x)}>元に戻す</button>}</td>
                </tr>
              ))}
              {!loading && !shown.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">ありません</td></tr>}
              {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">読んでいます…</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
