'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fx } from '@/components/sy/compat';
import { ROLE_LABEL, type AppRole } from '@/lib/sy/access-types';
import { PON_ACT_LABEL, PON_FIELDS, PON_ROLE, type PonKind, type PonUser } from '@/lib/sy/pon-types';
import { Avatar, PageHeader, btnGray, btnPrimary, inputCls } from '@/components/sy/ui';

// たまげたポンの設定（admin と super admin だけ）。上から 許可する人／操作ごとのマイル／マネージャーの設定。
//   数字はどれも仮置き（2026-10-07 shoya「マイル一旦仮置きで」）＝いけどんの事務と同じ 1件1マイル・営業事務と同じ設定から始めている
export default function PonSettingsView() {
  const [me, setMe] = useState<{ email: string; role: AppRole } | null>(null);
  const [users, setUsers] = useState<PonUser[]>([]);
  const [kinds, setKinds] = useState<PonKind[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch('/api/sy/s/pon').then((r) => r.json()).then((j) => { if (j.error) { setErr(j.error); return; } setMe(j.me); setUsers(j.users || []); setKinds(j.kinds || []); setSettings(j.settings || {}); }).catch(() => setErr('読み込みに失敗しました'));
  }, []);
  async function post(body: Record<string, unknown>) {
    setBusy(true);
    const r = await fetch('/api/sy/s/pon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { fx.toast(j.error || '保存できませんでした', 'err'); return null; }
    return j;
  }
  if (err && !me) return <div><PageHeader title="たまげたポンの設定" /><p className="p-6 text-sm text-ig-danger">{err}</p></div>;
  if (!me) return <div><PageHeader title="たまげたポンの設定" sub="読み込み中…" /></div>;
  const isSuper = me.role === 'super_admin';
  const onN = users.filter((u) => u.bikkura).length;

  async function grant(u: PonUser) {
    if (!u.bikkura && !confirm(`${u.name || u.email} さんに たまげたポンを許可します。\nいまから先の操作でマイルが貯まり、当たると景品（現物）を渡すことになります。よろしいですか？`)) return;
    const j = await post({ op: 'grant', email: u.email, on: !u.bikkura });
    if (j) { setUsers(j.users); fx.toast(u.bikkura ? '許可を外しました' : '許可しました'); }
  }
  async function saveKind(k: PonKind, p: Partial<PonKind>) {
    const next = { ...k, ...p };
    const j = await post({ op: 'kind', id: k.id, miles: next.miles, std_minutes: next.std_minutes, active: next.active, uncapped: next.uncapped });
    if (j) { setKinds(j.kinds); fx.toast('保存しました'); }
  }
  async function saveSettings() {
    const patch: Record<string, number> = {};
    for (const f of PON_FIELDS) if (f.k in draft && draft[f.k].trim() !== '') patch[f.k] = Number(draft[f.k]);
    const j = await post({ op: 'settings', patch });
    if (j) { setSettings(j.settings); setDraft({}); fx.toast('設定を保存しました'); }
  }
  const num = (k: PonKind, field: 'miles' | 'std_minutes', max: number) => (
    <input type="number" min={0} max={max} defaultValue={k[field]} key={k.id + field + k[field]} disabled={busy}
      onBlur={(e) => { const v = Number(e.target.value); if (v !== k[field]) saveKind(k, { [field]: v }); }} className={`${inputCls} w-16 px-2 py-1 text-right`} />
  );

  return (
    <div>
      <PageHeader title="たまげたポンの設定" sub={`許可している人 ${onN}人・数字はどれも仮置きです`}>
        <Link href="https://soreyuke.vercel.app/pon" className={btnGray}>たまげたポンを開く</Link>
      </PageHeader>
      <div className="mx-auto max-w-4xl space-y-7 px-4 py-5 md:px-6">
        <p className="rounded-lg bg-ig-subtle p-3 text-xs leading-relaxed text-ig-muted">
          それゆけ未経験 での操作（チャットの送信・面談の記録 など）でマイルが貯まり、貯まったマイルで ガラポンをまわせます。仕組み・景品・抽選は いけいけどんどん のたまげたポンと同じものです。
          景品と在庫・大当たりの決まり・受け取り待ちは いけいけどんどん の管理画面（たまげたポン管理）で扱います。
        </p>

        <section>
          <h2 className="mb-1 text-sm font-bold">許可する人</h2>
          <p className="mb-2 text-xs text-ig-muted">それゆけ未経験 にログインできる人の一覧です。許可した時刻より後の操作だけがマイルになります。{!isSuper && '付け外しは super admin だけができます。'}</p>
          <div className="overflow-hidden rounded-lg border border-ig-border bg-white">
            {users.map((u) => (
              <div key={u.email} className="flex items-center gap-3 border-b border-ig-divider px-3 py-2 text-sm last:border-b-0">
                <Avatar name={u.name || u.email} size="sm" />
                <div className="min-w-0 flex-1"><div className="truncate font-semibold">{u.name || u.email.split('@')[0]}<span className="ml-1.5 rounded bg-ig-hover px-1 text-[10px] font-normal">{ROLE_LABEL[u.appRole as AppRole] || u.appRole}</span></div>
                  <div className="truncate text-[11px] text-ig-muted">{u.email}{u.jimuRole && `・役割: ${u.jimuRole}`}{u.bikkura && u.since && `・${new Date(u.since).toLocaleDateString('ja-JP')} から`}</div></div>
                <button disabled={busy || !isSuper} onClick={() => grant(u)} aria-pressed={u.bikkura}
                  className={`ig-press rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${u.bikkura ? 'bg-ig-text text-white' : 'bg-white text-ig-text ring-1 ring-ig-border'}`}>{u.bikkura ? '許可中' : '許可する'}</button>
              </div>
            ))}
            {users.length === 0 && <div className="p-6 text-center text-xs text-ig-muted">一覧を読めませんでした</div>}
          </div>
          <p className="mt-1 text-[11px] text-ig-muted">新しく許可した人の役割は「{PON_ROLE}」になります（すでに いけいけどんどん で役割が付いている人はそのまま＝その役割の設定で動きます）。</p>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-bold">操作ごとのマイル</h2>
          <div className="overflow-x-auto rounded-lg border border-ig-border bg-white">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-ig-divider bg-ig-subtle text-[11px] text-ig-muted">
                <th className="px-3 py-1.5 text-left font-semibold">操作</th><th className="px-2 py-1.5 text-left font-semibold">種別</th><th className="px-2 py-1.5 text-right font-semibold">マイル</th>
                <th className="px-2 py-1.5 text-right font-semibold">標準の分</th><th className="px-2 py-1.5 text-center font-semibold">1日の上限の外</th><th className="px-2 py-1.5 text-center font-semibold">数える</th>
              </tr></thead>
              <tbody>
                {kinds.map((k) => (
                  <tr key={k.id} className={`border-b border-ig-divider last:border-b-0 ${k.active ? '' : 'opacity-50'}`}>
                    <td className="px-3 py-1.5"><div className="font-semibold">{PON_ACT_LABEL[k.act_pattern] || k.note || k.act_pattern}</div><div className="text-[11px] text-ig-muted">{k.dedupe_per_target_day ? '同じ相手は1日1件' : '1回ごとに1件'}</div></td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-xs text-ig-muted">{k.kind}</td>
                    <td className="px-2 py-1.5 text-right">{num(k, 'miles', 10)}</td>
                    <td className="px-2 py-1.5 text-right">{num(k, 'std_minutes', 600)}</td>
                    <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={k.uncapped} disabled={busy} onChange={() => saveKind(k, { uncapped: !k.uncapped })} className="h-4 w-4 cursor-pointer accent-[#0095f6]" /></td>
                    <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={k.active} disabled={busy} onChange={() => saveKind(k, { active: !k.active })} className="h-4 w-4 cursor-pointer accent-[#0095f6]" /></td>
                  </tr>
                ))}
                {kinds.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-xs text-ig-muted">操作の種別がまだありません</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-bold">{PON_ROLE}の設定</h2>
          <p className="mb-2 text-xs text-ig-muted">役割が「{PON_ROLE}」の人にだけ効きます。次にまわすときから効きます。{!isSuper && '当たりの率と個数は super admin だけが変えられます。'}</p>
          <div className="overflow-hidden rounded-lg border border-ig-border bg-white">
            {PON_FIELDS.map((f) => { const cur = settings[f.k]; const locked = !!f.superOnly && !isSuper; return (
              <label key={f.k} className="flex items-center gap-3 border-b border-ig-divider px-3 py-2 text-sm last:border-b-0">
                <span className="min-w-0 flex-1"><span className="font-semibold">{f.label}</span>{f.hint && <span className="ml-2 text-[11px] text-ig-muted">{f.hint}</span>}</span>
                <input type="number" step={f.lim[2] ? 1 : 0.01} min={f.lim[0]} max={f.lim[1]} disabled={busy || locked} value={f.k in draft ? draft[f.k] : cur == null ? '' : String(cur)}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.k]: e.target.value }))} className={`${inputCls} w-24 px-2 py-1 text-right disabled:opacity-60`} />
              </label>
            ); })}
          </div>
          <div className="mt-2 flex justify-end"><button disabled={busy || !Object.keys(draft).length} onClick={saveSettings} className={btnPrimary}>設定を保存する</button></div>
        </section>
      </div>
    </div>
  );
}
