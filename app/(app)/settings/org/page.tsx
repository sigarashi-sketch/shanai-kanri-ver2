'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Network, Search, ShieldCheck, Table2, Upload } from 'lucide-react';
import { PageTitle } from '@/components/ui';
import { LiveBanner, useIke } from '@/components/Live';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { NoAccess, usePerms } from '@/components/Perms';
import { INNAI_DOMAIN, SAVED_SHARED, loadOrg, loadShared, parseOrg, peopleFromAdmin, personKind, saveOrg, saveShared, type AdminList, type OrgState, type SharedLoad } from '@/lib/org';
import { ORG_SAMPLE_PEOPLE } from '@/lib/org-sample';
import { OrgChart } from './OrgChart';
import { PeopleTable } from './PeopleTable';
import { RolesEditor } from './RolesEditor';
import type { Commit, Ctl } from './shared';

// 組織表（設定の中）。人＝今の社内システムにログインできる全員（ログインしていなければ見本の人）。
//   組織・役職・ロール・個別の段階は ver2 の中だけの話なので、本物のデータのときも止めずに動かす（今のシステムには書かない・読むのは GET だけ）。
//   保存は今の社内システムの v2-settings（全員で共有・全体管理者だけ・10-25〜）。この端末の localStorage は控え。
//   ログインしていない・置き場がまだ無いときは、この端末にだけ保存（JSON の書き出し／読み込みで移す）。
type Tab = 'chart' | 'table' | 'roles';
const TABS: { key: Tab; label: string; icon: typeof Network }[] = [
  { key: 'chart', label: '組織図', icon: Network },
  { key: 'table', label: '一覧・権限付与', icon: Table2 },
  { key: 'roles', label: 'ロールと役職', icon: ShieldCheck },
];

export default function OrgPage() {
  const { manageAccess } = usePerms();
  const { hit, toast } = useMotivation();
  const { data, state, error, reload, live } = useIke<AdminList>(manageAccess ? 'admin?action=list' : null);
  // 要員のログインが誰か＝教育（bdsh）で Google アカウントと人を紐づけたもの（今のシステム admin?action=googleLinks・super_admin だけ）
  const gl = useIke<{ links?: { email: string; kind: string; name: string }[] }>(manageAccess ? 'admin?action=googleLinks' : null);
  const links = useMemo(() => new Map((gl.data?.links || []).map((l) => [l.email, { kind: l.kind, name: l.name }])), [gl.data]);
  const [org, setOrg] = useState<OrgState | null>(null);
  const [tab, setTab] = useState<Tab>('chart');
  const [who, setWho] = useState<'内勤' | '要員'>('内勤');
  const [q, setQ] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [saveNg, setSaveNg] = useState(false);
  const orgRef = useRef<OrgState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 全員で共有する置き場（v2-settings）。dirty＝この画面で変えた（読み込んだだけでは保存しない）
  const [shared, setShared] = useState<SharedLoad>({ state: 'loading', value: null, canSave: false });
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = useRef(false);
  const toShared = shared.state === 'live' && shared.canSave;

  useEffect(() => {
    setOrg(loadOrg());
    let alive = true;
    void loadShared().then((s) => {
      if (!alive) return;
      setShared(s);
      const remote = s.value?.org ? parseOrg(s.value.org) : null;
      if (remote && !dirty.current) setOrg(remote);
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => { orgRef.current = org; if (org) setSaveNg(!saveOrg(org)); }, [org]);
  // 変えたら少し待ってから全員の分に保存（続けて触っても1回にまとめる）
  useEffect(() => {
    if (!org || !dirty.current || !toShared) return;
    const t = setTimeout(async () => {
      const r = await saveShared('org', org);
      if (r.ok) dirty.current = false;
      setSaveMsg(r.ok ? { ok: true, text: SAVED_SHARED } : { ok: false, text: `${r.error}（この端末には保存しています）` });
    }, 800);
    return () => clearTimeout(t);
  }, [org, toShared]);

  const commit: Commit = useCallback((fn, text, opts) => {
    const before = orgRef.current;
    if (!before) return;
    dirty.current = true;
    setOrg(fn(before));
    if (opts?.flash) { setFlash(null); requestAnimationFrame(() => setFlash(opts.flash!)); }
    hit();
    toast({ text, sub: opts?.sub ?? (toShared ? '→ 組織表に保存（全員に効きます）' : '→ この端末の組織表に保存'), undo: () => { dirty.current = true; setOrg(before); } });
  }, [hit, toast, toShared]);

  const people = useMemo(() => (live ? peopleFromAdmin(data) : ORG_SAMPLE_PEOPLE).slice().sort((a, b) => a.name.localeCompare(b.name, 'ja')), [live, data]);
  const match = (p: { name: string; email: string }) => !q || p.name.includes(q) || p.email.toLowerCase().includes(q.toLowerCase());
  // 内勤（会社のメール）と要員（それ以外）を分けて見る。組織図・未所属の数は内勤だけ
  const nInnai = people.filter((p) => !p.retired && personKind(p) === '内勤').length;
  const nYoin = people.filter((p) => !p.retired && personKind(p) === '要員').length;
  const active = people.filter((p) => !p.retired && personKind(p) === who && match(p));
  const retired = people.filter((p) => p.retired && personKind(p) === who && match(p));

  if (!manageAccess) return <NoAccess label="組織表" />;
  if (!org) return null;
  const ctl: Ctl = { org, people, commit, flash, openRoles: () => setTab('roles') };
  const known = new Set(org.units.map((u) => u.id));
  const allActive = people.filter((p) => !p.retired && personKind(p) === '内勤');
  const unassigned = allActive.filter((p) => !known.has(org.people[p.userId]?.unit ?? '')).length;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(org, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `組織表-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast({ text: '組織表を書き出しました', sub: '→ ほかの端末の「読み込む」で同じ中身にできます' });
  };
  const importJson = async (f: File) => {
    try {
      const next = parseOrg(JSON.parse(await f.text()));
      if (!next) { toast({ text: '組織表のファイルではないようです', sub: 'この画面で書き出した .json を選んでください' }); return; }
      commit(() => next, '組織表を読み込みました', { sub: `→ ${toShared ? '組織表（全員）' : 'この端末の組織表'}を置き換え（部署・チーム${next.units.length}・ロール${next.roles.length}）` });
    } catch { toast({ text: '読めませんでした', sub: 'この画面で書き出した .json を選んでください' }); }
  };

  return (
    <main className="flex flex-col gap-4 px-6 pb-12 pt-[22px]">
      <PageTitle title="組織表" sub="部署・チーム・役職・長を決めて、ロールと分類ごとの段階を付けます">
        <button onClick={exportJson} className="btn-secondary"><Download size={15} />書き出す</button>
        <button onClick={() => fileRef.current?.click()} className="btn-secondary"><Upload size={15} />読み込む</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ''; }} />
      </PageTitle>
      <LiveBanner state={state} error={error} onReload={reload}
        note={`人は今の社内システムから読んでいます（${people.length}人・読むだけ）。組織・役職・ロールはこの画面の中だけの話なので変えられます。今のシステムのロールは変わりません`} />
      <p className="text-sm text-faint">
        {shared.state === 'loading' ? '共有の設定を読んでいます…'
          : toShared ? '変えるとすぐ全員の分に保存します（全体管理者だけ）。'
          : shared.state === 'live' ? '全員の分を保存できるのは全体管理者（super_admin）だけです。いまはこの端末にだけ保存します。'
          : shared.state === 'missing' ? '今の社内システムに共有の置き場がまだ無いので、この端末にだけ保存します。'
          : shared.state === 'error' ? `共有の設定を読めませんでした（${shared.error}）。この端末にだけ保存します。`
          : 'ログインしていないので、この端末にだけ保存します。'}
        {saveMsg && <span className={saveMsg.ok ? 'ml-1 font-semibold text-ok' : 'ml-1 text-bad'}>{saveMsg.text}</span>}
        {saveNg && <span className="text-bad">　この端末に保存できませんでした（書き出すで控えを取ってください）</span>}
      </p>

      <section className="mo-fade-up flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        {unassigned > 0 ? (
          <div className="flex items-center gap-3"><RemainRing remain={unassigned} total={allActive.length} /><div className="text-body"><b>未所属 {unassigned}人</b><div className="text-sm text-muted">組織図でドラッグ、または一覧で所属を選ぶ</div></div></div>
        ) : (
          <div className="mo-fade-in text-body"><b>全員の所属が決まりました</b><div className="text-sm text-muted">{allActive.length}人・部署とチーム {org.units.length}</div></div>
        )}
        <div role="group" aria-label="内勤と要員" className="inline-flex overflow-hidden rounded-lg border border-field">
          {([['内勤', nInnai], ['要員', nYoin]] as const).map(([k, n]) => (
            <button key={k} aria-pressed={who === k} onClick={() => { setWho(k); if (k === '要員' && tab === 'chart') setTab('table'); }} className="px-3 py-1.5 text-body"
              style={who === k ? { background: 'var(--as)', color: 'var(--ad)', fontWeight: 700 } : { background: 'var(--color-surface)' }}>{k} {n}人</button>
          ))}
        </div>
        <div role="tablist" className="ml-auto inline-flex overflow-hidden rounded-lg border border-field">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-body"
              style={tab === t.key ? { background: 'var(--a)', color: 'var(--ao)', fontWeight: 700 } : { background: 'var(--color-surface)' }}><t.icon size={14} />{t.label}</button>
          ))}
        </div>
        {tab !== 'roles' && (
          <label className="flex items-center gap-1.5 rounded-lg border border-field bg-surface px-2 py-1.5 text-body">
            <Search size={14} className="text-faint" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・メールで探す" aria-label="名前・メールで探す" className="w-[160px] bg-transparent outline-none" />
          </label>
        )}
      </section>

      <div key={tab} className="mo-fade-in">
        {tab === 'chart' && (who === '内勤' ? <OrgChart ctl={ctl} list={active} /> : <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-body text-muted">組織図は内勤（会社のメール {INNAI_DOMAIN}）の人だけです。要員は「一覧」で見られます。</p>)}
        {tab === 'table' && <PeopleTable ctl={ctl} list={active} retired={retired} links={who === '要員' ? links : undefined} />}
        {tab === 'roles' && <RolesEditor ctl={ctl} />}
      </div>
      {tab === 'chart' && retired.length > 0 && <p className="text-sm text-faint">退職の{retired.length}人は組織図に出していません（一覧の下に畳んであります）。</p>}
    </main>
  );
}
