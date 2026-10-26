'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, ExternalLink, MessageSquareText, Phone } from 'lucide-react';
import { usePerms, needText } from '@/components/Perms';
import { OVERRIDE_CHOICES, rulePhaseOf, type StaffWrite } from '@/lib/live/staff-write';
import type { LiveStaff, StaffEdit } from '@/lib/live/staff';
import { useLiveWrite, WriteError } from './useLiveWrite';
import { staffReq, statusPatchOf } from './staffWrite';

// 社員ページの「名簿の入力」タブ（今の従業員名簿の行・詳細でできた入力を全部ここに・10-25 shoya「いけドンにあったのは全部いれて」）。
//   ・入れたらすぐ保存（自動保存）＋トーストの「取り消す」で元に戻せる
//   ・日付はカレンダーで選ぶ・決まった選択肢はプルダウン。駅名だけは文字（社内の担当が入れる欄）
//   ・見本（ログインしていない）のときは画面の中だけ変わる
export const EMPTY_EDIT: StaffEdit = {
  taisha: false, taiki: false, override: '', taikiYotei: '', taishaYotei: '', sai: false, sankaku: false, jitai: false, poa: false,
  nyushaManual: '', shokaiEnd: '', nyuujouRaw: '', hasLine: false, lineGroup: '', lineGroupId: '',
};
type Local = StaffEdit & { taishaBi: string; nyuujou: string; taijou: string; homeEki: string; siteEki: string; tantou: string };
const isoOrEmpty = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

export function StaffOps({ staff, live, recruiters, onDone }: { staff: LiveStaff; live: boolean; recruiters: string[]; onDone?: () => void }) {
  const canEdit = usePerms().can('jinji', 'edit');
  const init = (): Local => ({
    ...EMPTY_EDIT, ...(staff.edit || {}), taishaBi: staff.taishaBi || '', nyuujou: isoOrEmpty(staff.nyuujou), taijou: staff.taijou || '',
    homeEki: '', siteEki: '', tantou: staff.recruiter === '—' ? '' : staff.recruiter,
  });
  const [v, setV] = useState<Local>(init);
  // 読み直して名簿の値が変わったら合わせる（同じ人のまま）
  useEffect(() => { setV(init()); }, [staff]); // eslint-disable-line react-hooks/exhaustive-deps
  const { send, error, setError, busy } = useLiveWrite(live, onDone);
  const name = staff.name;
  const off = !canEdit;
  const offTitle = off ? needText('edit') : undefined;

  /** 1項目を変えて保存（画面はすぐ変える・失敗したら戻す） */
  const put = (patch: Partial<Local>, w: StaffWrite, text: string, sub?: string, undo?: StaffWrite | null) => {
    const before = v;
    send(staffReq(w, text, { sub, undo, apply: () => setV((x) => ({ ...x, ...patch })), revert: () => setV(before) }));
  };
  const statusVal = v.taisha ? 'taisha' : v.override || '';
  const setStatus = (val: string) => {
    if (v.taisha && val !== 'taisha' && !window.confirm(`${name} さんは退社チェックが入っています。退社を外して「${OVERRIDE_CHOICES.find((c) => c.v === val)?.label}」にしますか？`)) return;
    const p = statusPatchOf(val);
    put({ taisha: !!p.taisha, taiki: p.taiki ?? v.taiki, override: p.override ?? '' }, { kind: 'status', name, patch: p },
      `${name} さんの状態を「${OVERRIDE_CHOICES.find((c) => c.v === val)?.label}」にしました`, val === 'kyushoku' ? '→ 当日の出勤状況・未打刻アラート・稼働人数の対象から外れます' : val === 'taisha' ? '→ 稼働中の人数から外れます' : val === 'taiki' ? '→ 当日の出勤状況・未打刻アラートの対象外（再アサインも自動で入ります）' : '→ 名簿の状態に出ます');
  };
  const flag = (k: 'jitai' | 'poa', label: '辞退' | 'ぽあ', on: boolean) =>
    put({ [k]: on }, { kind: 'flag', name, statusKey: label, value: on }, `${name} さんの「${label === 'ぽあ' ? '営業止め（ぽあ）' : label}」を${on ? '付けました' : '外しました'}`, '→ 営業リスト（プロパーリスト）の印に入りました', { kind: 'flag', name, statusKey: label, value: !on });
  const sales = (k: 'sai' | 'sankaku', field: 'sai_assign' | 'sankaku_kettei', label: string, on: boolean) =>
    put({ [k]: on }, { kind: 'sales', name, field, value: on }, `${name} さんの「${label}」を${on ? '付けました' : '外しました'}`, field === 'sankaku_kettei' ? '→ ONで一斉送信の対象から外れます（再アサインは自動で外れます）' : '→ 営業リストの再アサインに入りました', { kind: 'sales', name, field, value: !on });
  const date = (k: keyof Local, w: (val: string) => StaffWrite, label: string, val: string, sub?: string) => {
    const old = String(v[k] || '');
    if (old === val) return;
    const undoW = w(old);
    put({ [k]: val } as Partial<Local>, w(val), val ? `${name} さんの${label}を ${val.replaceAll('-', '/')} にしました` : `${name} さんの${label}を空にしました`, sub, undoW);
  };

  const ck = (on: boolean, onChange: (b: boolean) => void, label: string, tip?: string) => (
    <label className="flex min-h-9 items-center gap-2 text-body" title={offTitle ?? tip}>
      <input type="checkbox" checked={on} disabled={off} onChange={(e) => onChange(e.target.checked)} className="size-4" />{label}
    </label>
  );
  const dt = (label: string, val: string, onChange: (s: string) => void, tip?: string) => (
    <label className="flex flex-col gap-1 text-sm text-muted" title={offTitle ?? tip}>{label}
      <input type="date" value={val} disabled={off} onChange={(e) => onChange(e.target.value)} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-body text-ink disabled:opacity-50" />
    </label>
  );
  const sec = (title: string, sub: string, children: React.ReactNode) => (
    <section className="rounded-xl border border-line bg-surface px-[18px] py-3.5">
      <h3 className="text-body font-bold">{title}</h3><div className="mb-2.5 text-xs text-faint">{sub}</div>{children}
    </section>
  );
  const rec = Array.from(new Set([...recruiters.filter((x) => x && x !== '—'), ...(v.tantou ? [v.tantou] : [])])).sort((a, b) => a.localeCompare(b, 'ja'));

  return (
    <div className="flex flex-col gap-3">
      <WriteError error={error} onClose={() => setError('')} />
      {busy && <div className="text-sm text-muted">保存しています…</div>}
      {sec('状態・退社・待機', '退社チェック ＞ 手で選んだ状態 ＞ 自動の判定。待機は当日の出勤状況・未打刻アラートの対象から外れます', (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
          <label className="flex flex-col gap-1 text-sm text-muted" title={offTitle}>状態
            <select value={statusVal} disabled={off} onChange={(e) => setStatus(e.target.value)} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-body text-ink disabled:opacity-50">
              {OVERRIDE_CHOICES.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
            </select>
          </label>
          {ck(v.taisha, (on) => put({ taisha: on, ...(on ? { override: '', taishaYotei: '' } : {}) }, { kind: 'status', name, patch: on ? { taisha: true, override: '' } : { taisha: false } }, `${name} さんを${on ? '退社にしました' : '在籍に戻しました'}`, on ? '→ 稼働中の人数から外れます' : '→ 稼働中の人数に戻ります'), '退社')}
          {dt('退社日', v.taishaBi, (s) => date('taishaBi', (x) => ({ kind: 'status', name, patch: { taishaBi: x } }), '退社日', s))}
          {ck(v.taiki, (on) => put({ taiki: on, override: '', ...(on ? { taikiYotei: '' } : {}) }, { kind: 'status', name, patch: { taiki: on, override: '' } }, `${name} さんを${on ? '待機にしました' : '待機から外しました'}`, on ? '→ 当日の出勤状況・未打刻アラートの対象外（再アサインも自動で入ります）' : '→ 当日の出勤状況に戻ります'), '待機')}
          {dt('待機の予約日', v.taikiYotei, (s) => date('taikiYotei', (x) => ({ kind: 'status', name, patch: { taikiYotei: x } }), '待機の予約日', s, 'その日の朝6時に待機チェックが自動で入ります'), 'その日の朝に待機チェックが自動で入ります')}
          {dt('退社の予約日（退社日）', v.taishaYotei, (s) => date('taishaYotei', (x) => ({ kind: 'status', name, patch: { taishaYotei: x } }), '退社の予約日', s, '退社日の翌朝に退社チェックが自動で入ります'), '退社日の翌朝に退社チェックが自動で入ります')}
        </div>
      ))}
      {sec('営業リストの印', '今のプロパーリストと同じ印です（参画決定・再アサインは名簿の列、辞退・営業止めはダッシュボードの「辞退にチェック」と同じ口）', (
        <div className="flex flex-wrap gap-x-5">
          {ck(v.sankaku, (on) => sales('sankaku', 'sankaku_kettei', '参画決定', on), '参画決定', 'ONで一斉送信の対象から外れます')}
          {ck(v.sai, (on) => sales('sai', 'sai_assign', '再アサイン', on), '再アサイン')}
          {ck(v.jitai, (on) => flag('jitai', '辞退', on), '辞退')}
          {ck(v.poa, (on) => flag('poa', 'ぽあ', on), '営業止め（ぽあ）')}
        </div>
      ))}
      {sec('入社日・入場日・退場日', '手で入れた日付が一番優先です。空にすると自動の値（稼働管理情報一覧・ミンミカ）に戻ります', (
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {dt('入社日', v.nyushaManual, (s) => date('nyushaManual', (x) => ({ kind: 'nyusha', name, field: 'nyusha_bi', value: x }), '入社日', s), `今の値 ${staff.joined || '—'}（ミンミカに入社日がある人はミンミカが優先）`)}
          {dt('初回契約終了日', v.shokaiEnd, (s) => date('shokaiEnd', (x) => ({ kind: 'nyusha', name, field: 'shokai_end', value: x }), '初回契約終了日', s))}
          {dt('入場日', v.nyuujou, (s) => date('nyuujou', (x) => ({ kind: 'sales', name, field: 'nyuujou_bi', value: x }), '入場日', s, '→ 営業リストの入場日（プロパー画面と同じ値）'), v.nyuujouRaw && !isoOrEmpty(v.nyuujouRaw) ? `今の値「${v.nyuujouRaw}」` : undefined)}
          {dt('退場日', v.taijou, (s) => date('taijou', (x) => ({ kind: 'nyusha', name, field: 'taijou_bi', value: x }), '退場日', s, '→ 状態が「在籍（現場外）」になります'))}
        </div>
      ))}
      {sec('最寄駅・採用担当・LINEグループ', '最寄駅は手で入れた駅が一番優先（空にすると自動の判定に戻ります）', (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
          {(['homeEki', 'siteEki'] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1 text-sm text-muted" title={offTitle}>{k === 'homeEki' ? `最寄駅（今 ${staff.station}）` : `現場の最寄駅（今 ${staff.siteEki || '—'}）`}
              <input defaultValue="" disabled={off} placeholder="駅名を入れて Enter" onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                onBlur={(e) => { const val = e.target.value.trim(); if (!val) return; put({ [k]: val }, { kind: 'eki', name, field: k === 'homeEki' ? 'home_eki' : 'site_eki', value: val }, `${name} さんの${k === 'homeEki' ? '最寄駅' : '現場の最寄駅'}を「${val}」にしました`, '→ 名簿・交通費の駅に効きます', { kind: 'eki', name, field: k === 'homeEki' ? 'home_eki' : 'site_eki', value: '' }); e.target.value = ''; }}
                className="min-h-9 w-[180px] rounded-[10px] border border-field bg-surface px-2 text-body text-ink disabled:opacity-50" />
            </label>
          ))}
          <label className="flex flex-col gap-1 text-sm text-muted" title={offTitle}>採用担当
            <select value={v.tantou} disabled={off} onChange={(e) => { const val = e.target.value; put({ tantou: val }, { kind: 'tantou', name, value: val }, `${name} さんの採用担当を「${val || '未設定'}」にしました`, '→ 名簿・営業リストの採用担当', { kind: 'tantou', name, value: v.tantou }); }} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-body text-ink disabled:opacity-50">
              <option value="">未設定</option>
              {rec.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <LineGroupView cur={{ name: v.lineGroup, has: v.hasLine, id: v.lineGroupId }} name={name} live={live} off={off} offTitle={offTitle} onSaved={onDone} />
        </div>
      ))}
    </div>
  );
}

// LINEグループの手動紐付け（今の従業員名簿の詳細のプルダウンと同じ・/api/live/line-group・10-26）。
//   候補＝名前で自動の突き合わせができていないグループだけ。選んでも LINE 側のグループ名は変わらない。外すと自動の突き合わせに戻る
type LgCand = { groupId: string; name: string; lineName: string; speakers: string[]; lastMs: number };
function LineGroupView({ cur, name, live, off, offTitle, onSaved }: { cur: { name: string; has: boolean; id: string }; name: string; live: boolean; off: boolean; offTitle?: string; onSaved?: () => void }) {
  const [cands, setCands] = useState<LgCand[] | null>(null);
  const [val, setVal] = useState(cur.id);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setVal(cur.id); }, [cur.id]);
  const open = () => {
    if (cands || !live || off) return;
    fetch(`/api/live/line-group?name=${encodeURIComponent(name)}`, { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { if (j.error) setMsg({ text: j.error, bad: true }); else setCands(j.candidates || []); })
      .catch((e) => setMsg({ text: (e as Error).message, bad: true }));
  };
  const label = (c: LgCand) => {
    const sub = [c.lineName && `LINE上の名前: ${c.lineName}`, c.speakers.length && `発言: ${c.speakers.join('・')}`, c.lastMs && `最終 ${new Date(c.lastMs).toLocaleDateString('ja-JP')}`].filter(Boolean);
    return `${c.name || '（名前なし）'}${sub.length ? `（${sub.join(' / ')}）` : ''}`;
  };
  const save = async (groupId: string) => {
    const g = cands?.find((c) => c.groupId === groupId);
    if (!window.confirm(groupId ? `${name} さんに LINE グループ「${g?.name || '（名前なし）'}」を紐付けます。LINE 側のグループ名は変わりません。` : `${name} さんの LINE グループの紐付けを外します（グループ名からの自動の突き合わせに戻ります）。`)) { setVal(cur.id); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/live/line-group', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, groupId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) { setMsg({ text: j.error || `保存できませんでした（${r.status}）`, bad: true }); setVal(cur.id); return; }
      setMsg({ text: groupId ? 'LINEグループを紐付けました' : '紐付けを外しました' });
      setCands(null); onSaved?.();
    } finally { setBusy(false); }
  };
  const list = cands ? (cur.id && !cands.some((c) => c.groupId === cur.id) ? [{ groupId: cur.id, name: cur.name, lineName: '', speakers: [], lastMs: 0 }, ...cands] : cands) : [];
  return (
    <div className="flex flex-col gap-1 text-sm text-muted" title={off ? offTitle : live ? 'グループ名で自動の突き合わせができていないグループから選べます（LINE 側の名前は変わりません）' : '見本なので変えられません'}>
      LINEグループ
      {!live || off || !cands
        ? <button type="button" onClick={open} disabled={!live || off} className="min-h-9 max-w-[320px] rounded-[10px] border border-line bg-soft px-2 py-2 text-left text-body text-ink disabled:cursor-default">{cur.has ? cur.name || '（名前なし）' : 'なし'}{live && !off && <span className="ml-1.5 text-xs text-faint">（押すと選べます）</span>}</button>
        : <select value={val} disabled={busy} onChange={(e) => { setVal(e.target.value); void save(e.target.value); }} className="min-h-9 max-w-[320px] rounded-[10px] border border-field bg-surface px-2 text-body text-ink">
            <option value="">— 紐付けなし（グループ名から自動）—</option>
            {list.map((c) => <option key={c.groupId} value={c.groupId}>{label(c)}</option>)}
          </select>}
      {msg && <span className={msg.bad ? 'text-bad' : ''}>{msg.text}</span>}
    </div>
  );
}

/** 社員ページの上に出す 電話・対応歴・月次勤怠 のボタン */
export function PersonActions({ name, live, rule, onTaiou }: { name: string; live: boolean; rule?: { ok: boolean; n: number | undefined }; onTaiou: () => void }) {
  const [tel, setTel] = useState<string | null>(null);
  const [telErr, setTelErr] = useState('');
  const getTel = () => {
    if (!live) { setTelErr('見本なので電話番号はありません'); return; }
    fetch('/api/live/staff/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ what: 'tel', name }) })
      .then((r) => r.json()).then((j) => { if (j.error) setTelErr(j.error); else if (!j.tel) setTelErr('基本情報フォームに携帯の番号がありません'); else setTel(j.tel); })
      .catch((e) => setTelErr((e as Error).message));
  };
  const ph = rule?.ok && rule.n != null ? rulePhaseOf(rule.n) : null;
  const btn = 'inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-field bg-surface px-3 text-body font-semibold';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {tel ? <a href={`tel:${tel}`} className={btn} style={{ color: 'var(--ad)' }}><Phone size={14} />{tel} に電話</a>
        : <button onClick={getTel} className={btn}><Phone size={14} />電話</button>}
      <button onClick={onTaiou} className={btn}><MessageSquareText size={14} />対応歴（メモ）</button>
      <a href="/api/live/staff/legacy" target="_blank" rel="noopener" className={btn} title="月次の勤怠は今の社内システムの従業員名簿（この人の「稼働管理」）で開きます"><CalendarDays size={14} />月次勤怠を開く<ExternalLink size={12} /></a>
      {rule && (rule.ok
        ? <span className="chip" title="2026-10-05 以降の欠勤・遅刻・早退の連絡の回数（数えないにした日は除く）。1回=①営業面談／2回=②来社面談／3回=③書面注意・改善計画書／4回以上=④けん責を検討" style={ph ? { background: `var(--tone-${ph.tone}-bg)`, color: `var(--tone-${ph.tone}-fg)` } : { background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>
          ルール欠勤 {rule.n ?? 0}回{ph ? `・${ph.mark} ${ph.label}` : ''}</span>
        : <span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }} title="勤怠連絡を読めませんでした（0回ではなく不明）">ルール欠勤 不明</span>)}
      {telErr && <span className="text-sm text-bad">{telErr}</span>}
    </div>
  );
}
