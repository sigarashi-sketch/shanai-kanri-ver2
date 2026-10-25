'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Search, X } from 'lucide-react';
import { LIVERS, PEOPLE, PROPERS, type Proper } from '@/lib/sample';
import { StaffList } from '@/components/lists/StaffList';
import { LiverLive } from '@/components/lists/LiverLive';
import { PageTitle, Pill, PrimaryButton, SkeletonRows } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import { DrawerPortal } from '@/components/DrawerPortal';
import { LiveBanner, useIke } from '@/components/Live';
import { liveProperRows, type LiverList, type LiveProper, type PartnerList } from '@/lib/live/proper';
import { ProperList } from '@/components/ProperList';
import { sampleEngineerRows } from '@/lib/proper-sample';
import type { EngineerRows } from '@/lib/live/eigyo-common';
import { PersonName } from '@/components/Person';

// 要員（プロパー）＋スキシ作成（2026-10-23 shoya「プロパーリストの中にスキシ作成をマージ」）。
//   スキシは客先に出す紙：本名は載せずイニシャル、経歴は古い順、稼働開始に健康情報らしい値は載せない（今のシステムと同じ決まり）。
//   本物（ログイン中）：プロパー＝/api/roster?action=getEngineerRows&area=main、営業共有リスト＝/api/partner-list?action=list、
//     ライバーリスト＝/api/livers（全体管理者だけ・見られるかは今の API が決める）。スキシを作るのは スキルシート作成 の画面から
//   10-25 プロパーは今の proper.html の列を全部（スコア・チェック・文字の保存つき）＝components/ProperList.tsx
//   名前を押すと要員ページ（/eigyo/proper/<id>）を開く
// rows は親（タブの外）で持つ。タブを行き来しても、作ったスキシの状態が消えないように
//   表は components/ProperList.tsx（今のプロパーリストの列を全部・スコア・チェックの保存）。ここはスキシの引き出しだけ持つ
type DrawerP = (Omit<Proper, 'status'> & { status: string }) & Partial<LiveProper>;
function ProperTab({ data, reload, sampleRows, setRows, live }: { data: EngineerRows | null; reload: () => unknown; sampleRows: Proper[]; setRows: React.Dispatch<React.SetStateAction<Proper[]>>; live: boolean }) {
  const canEdit = usePerms().can('eigyo', 'edit') && !live;
  const { hit, toast } = useMotivation();
  const lrows = useMemo(() => liveProperRows(data), [data]);
  const byId = useMemo(() => new Map<string, DrawerP>((live ? lrows : sampleRows).map((p) => [p.id, p as DrawerP])), [live, lrows, sampleRows]);
  const done = useMemo(() => new Set(live ? [] : sampleRows.filter((p) => p.sukishi.state === '作成済み').map((p) => p.id)), [live, sampleRows]);
  // ?sukishi=<id> でそのスキシを開いた状態から始める（画面の見本を撮るとき用）
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? byId.get(openId) ?? null : null;
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('sukishi'); if (id) setOpenId(id); }, []);
  const [busy, setBusy] = useState(false);

  const make = (p: DrawerP) => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      const prev = sampleRows.find((r) => r.id === p.id)?.sukishi ?? p.sukishi;
      setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, sukishi: { ...r.sukishi, state: '作成済み', updated: '今日' } } : r)));
      setOpenId(null);
      hit();
      toast({ text: `${p.sukishi.initial || p.name} のスキシを作りました`, sub: '→ 案件の提案と、営業共有リストから開けます', undo: () => setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, sukishi: prev } : r))) });
    }, 900);
  };

  return (
    <div className="flex min-h-full">
      <div className={`flex min-w-0 flex-1 flex-col gap-3.5 ${open ? 'xl:pr-[444px]' : ''}`}>
        <ProperList data={data} live={live} reload={reload} onSukishi={setOpenId} sukishiDone={done} />
      </div>

      {open && (
        <DrawerPortal>
        <aside key={open.id} aria-label="スキシ" className="mo-drawer drawer">
          <div className="flex items-start justify-between px-5 py-4">
            <div><div className="text-sm text-faint">スキルシート（客先に出す紙）</div><div className="text-lg font-bold"><PersonName name={open.name} id={open.id} className="underline-offset-2 hover:underline" /></div></div>
            <button aria-label="閉じる" onClick={() => setOpenId(null)} className="flex size-[34px] items-center justify-center rounded-[10px] border border-line"><X size={16} /></button>
          </div>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 pb-4 text-body">
            {open.sukishi.warn && <div role="alert" className="mo-shake flex gap-2 rounded-[10px] border border-bad-line bg-bad-soft px-3 py-2.5 text-bad"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-bad" />{open.sukishi.warn}</div>}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-[10px] bg-soft px-4 py-3">
              <div><dt className="text-xs text-faint">名前（イニシャル）</dt><dd className="font-semibold">{open.sukishi.initial || <span className="text-bad">空欄</span>}</dd></div>
              <div><dt className="text-xs text-faint">年齢</dt><dd>{open.sukishi.age}</dd></div>
              <div><dt className="text-xs text-faint">最寄駅</dt><dd>{open.station}</dd></div>
              <div><dt className="text-xs text-faint">稼働開始</dt><dd>{open.sukishi.start}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-faint">資格</dt><dd>{open.sukishi.skills}</dd></div>
            </dl>
            {live && open.summary && <div><div className="mb-1.5 text-sm font-semibold text-muted">サマリ（客先に貼る紹介文）</div><p className="whitespace-pre-line rounded-[10px] border border-line px-3 py-2 text-sm">{open.summary}</p></div>}
            <div>
              <div className="mb-1.5 text-sm font-semibold text-muted">経歴（古い順）</div>
              {open.sukishi.history.length === 0 && <div className="rounded-[10px] bg-soft px-3 py-2 text-sm text-muted">{live ? '経歴は スキルシート作成 の画面（基本情報フォームの回答）で見られます' : 'まだありません'}</div>}
              <ol className="flex flex-col gap-2">
                {open.sukishi.history.map((h, i) => (
                  <li key={h.period} className="mo-fade-up rounded-[10px] border border-line px-3 py-2" style={{ ['--i' as string]: i + 1 }}><div className="text-xs text-faint">{h.period}</div>{h.text}</li>
                ))}
              </ol>
            </div>
            <p className="text-xs text-faint">出どころ：基本情報（氏名・年齢・最寄駅・資格）／経歴フォーム／プロパーの稼働開始。本名・健康に関する内容は載せません。</p>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            {live ? (<>
              {open.sukishiUrl && <a href={open.sukishiUrl} target="_blank" rel="noreferrer" className="btn-secondary">スプレッドシートを開く</a>}
              <Link href={`/eigyo/skillsheet?q=${encodeURIComponent(open.name)}`} className="btn-primary">スキルシート作成で作る</Link>
            </>) : (<>
            {open.sukishi.state === '作成済み' && <button onClick={() => toast({ text: `${open.sukishi.initial} のスキシを開きます（見本）`, sub: '→ 本物ではスプレッドシートが新しいタブで開きます' })} className="btn-secondary">スプレッドシートを開く</button>}
            <PrimaryButton onClick={() => make(open)} disabled={!canEdit || busy || !!open.sukishi.warn} title={!canEdit ? needText('edit') : open.sukishi.warn ? '先に要確認を直してください' : undefined}>
              {busy ? <span className="inline-flex items-center gap-2"><span className="mo-pulse">作成中</span></span> : open.sukishi.state === '作成済み' ? '作り直す' : 'スキシを作る'}
            </PrimaryButton>
            </>)}
          </div>
        </aside>
        </DrawerPortal>
      )}
    </div>
  );
}

// ---- 要員ページ（タブ）：プロパー・スキシ／営業共有リスト／従業員名簿／ライバーリスト ----
//   2026-10-23 shoya「プロパーリストの中に別タブでライバーリスト、営業共有リスト、従業員名簿もマージ」。
//   ・従業員名簿は人事のデータ → 人事を「見る」以上の人だけ
//   ・ライバーリストは全体管理者だけ。プロパーには混ぜない（別のリストのまま）
//   ・営業共有リストは内勤以外の人が見る唯一の画面と同じ中身（ここは内勤向けの入口）
type TabKey = 'proper' | 'shared' | 'meibo' | 'liver';

export default function YoinPage() {
  const { can, manageAccess } = usePerms();
  const [rowsS, setRows] = useState<Proper[]>(PROPERS);
  const er = useIke<EngineerRows>('roster?action=getEngineerRows&area=main');
  const live = er.live;
  const sample = useMemo(() => sampleEngineerRows(), []);
  const data = live ? er.data : sample;
  const activeN = (er.data?.rows ?? []).filter((r) => r.active).length;
  const [want, setWant] = useState<TabKey>('proper');
  // クエリは useEffect で読む（hydration ずれ防止）
  useEffect(() => { const t = new URLSearchParams(window.location.search).get('tab') as TabKey | null; if (t) setWant(t); }, []);
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'proper', label: 'プロパー・スキシ' },
    { key: 'shared', label: '営業共有リスト' },
    ...(can('jinji', 'view') ? [{ key: 'meibo' as TabKey, label: '従業員名簿' }] : []),
    ...(manageAccess ? [{ key: 'liver' as TabKey, label: 'ライバーリスト' }] : []),
  ];
  const tab = tabs.some((t) => t.key === want) ? want : 'proper';
  const go = (k: TabKey) => { setWant(k); window.history.replaceState(null, '', `/eigyo/proper${k === 'proper' ? '' : `?tab=${k}`}`); };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="要員リスト" sub="プロパー（スキシ作成つき）・営業共有リスト・従業員名簿を1か所で。タブで切り替え" />
      <LiveBanner state={er.state} error={er.error} onReload={er.reload} note={`今のプロパーリスト ${er.data?.rows.length ?? 0}人（営業中 ${activeN}人）。チェック・文字は変えるとすぐ今のシステムに保存します（取り消せます）`} />
      <div role="tablist" className="mo-fade-up flex gap-1 overflow-x-auto border-b border-line" style={{ ['--i' as string]: 1 }}>
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => go(t.key)} className="tab">
            {t.label}{t.key === 'liver' && <span className="ml-1.5 rounded bg-sunken px-1.5 text-xs text-muted">全体管理者だけ</span>}
          </button>
        ))}
      </div>
      <div key={tab} className="mo-axis">
        {tab === 'proper' && <ProperTab data={data} reload={er.reload} sampleRows={rowsS} setRows={setRows} live={live} />}
        {tab === 'shared' && <SharedTab live={live} />}
        {tab === 'meibo' && <StaffList embedded />}
        {tab === 'liver' && <LiverTab live={live} />}
      </div>
    </main>
  );
}

function SharedTab({ live }: { live: boolean }) {
  const rows = PEOPLE.filter((p) => p.status === '待機' || p.status === '入場予定' || p.contractEnd);
  const pl = useIke<PartnerList>(live ? 'partner-list?action=list' : null);
  const [q, setQ] = useState('');
  if (live) {
    const people = (pl.data?.people ?? []).filter((p) => !q || `${p.name}${p.eki}${p.kibou}`.includes(q));
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted">今の営業共有リスト（営業中の人だけ）。内勤以外の人（営業など）が見られるのはこの中身だけです。</p>
          <label className="ml-auto flex min-h-9 items-center gap-2 rounded-[10px] border border-field bg-surface px-3 text-faint"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} aria-label="営業共有リストを検索" placeholder="名前・最寄駅・希望" className="w-44 bg-transparent text-body text-ink outline-none" /></label>
        </div>
        {pl.state === 'error' && <div className="rounded-xl px-4 py-2.5 text-sm" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>{pl.error}</div>}
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[720px] border-collapse text-body">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">要員</th><th className="px-2 py-2.5 font-semibold">最寄駅</th><th className="px-2 py-2.5 font-semibold">稼働</th><th className="px-2 py-2.5 font-semibold">稼働できる日</th><th className="px-2 py-2.5 font-semibold">希望</th><th className="px-4 py-2.5 text-right font-semibold">並行数</th>
            </tr></thead>
            <tbody>
              {pl.state === 'loading' && <tr><td colSpan={6} className="p-0"><SkeletonRows /></td></tr>}
              {people.slice(0, 300).map((p, i) => (
                <tr key={p.id} className="row mo-fade-in border-t border-line-soft" style={{ ['--i' as string]: Math.min(i, 20) }}>
                  <td className="px-4 py-2.5 font-semibold"><PersonName name={p.name} className="hover:underline underline-offset-2" />{p.tags.length > 0 && <span className="ml-1.5 text-xs font-normal text-muted">{p.tags.slice(0, 3).join('・')}</span>}</td>
                  <td className="px-2 py-2.5">{p.eki || '—'}</td><td className="px-2 py-2.5">{p.kadou || '—'}</td><td className="px-2 py-2.5">{p.kanouBi || '—'}</td>
                  <td className="px-2 py-2.5">{p.kibou || '—'}</td><td className="num px-4 py-2.5 text-right">{p.heikou || '—'}</td>
                </tr>
              ))}
              {pl.state === 'live' && people.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">この条件の人はいません</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">内勤以外の人（営業など）が見られるのはこの中身だけです。</p>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-body">
          <thead><tr className="th-row text-left">
            <th className="px-4 py-2.5 font-semibold">要員</th><th className="px-2 py-2.5 font-semibold">状態</th><th className="px-2 py-2.5 font-semibold">最寄駅</th><th className="px-2 py-2.5 font-semibold">稼働できる日</th><th className="px-4 py-2.5 font-semibold">担当営業</th>
          </tr></thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id} className="row mo-fade-in border-t border-line-soft" style={{ ['--i' as string]: i }}>
                <td className="px-4 py-2.5 font-semibold"><PersonName name={p.name} className="hover:underline underline-offset-2" /></td>
                <td className="px-2 py-2.5"><Pill>{p.status}</Pill>{p.contractEnd && <span className="ml-1.5 text-xs text-warn">{p.contractEnd}</span>}</td>
                <td className="px-2 py-2.5">{p.station}</td>
                <td className="px-2 py-2.5">{p.status === '待機' ? '即日' : p.contractEnd ? '12/1〜' : '—'}</td>
                <td className="px-4 py-2.5">{p.sales}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LiverTab({ live }: { live: boolean }) {
  const tone: Record<string, { bg: string; fg: string }> = { 連絡中: { bg: 'var(--tone-info-bg)', fg: 'var(--tone-info-fg)' }, 面談予定: { bg: 'var(--tone-warn-bg)', fg: 'var(--tone-warn-fg)' }, 見送り: { bg: 'var(--tone-mute-bg)', fg: 'var(--tone-mute-fg)' } };
  if (live) return <LiverLive />; // 本物＝足す・直す・消す（10-25・components/lists/LiverLive.tsx）
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">プロパーには入れない別のリストです（全体管理者だけ）。</p>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-body">
          <thead><tr className="th-row text-left">
            <th className="px-4 py-2.5 font-semibold">名前</th><th className="px-2 py-2.5 font-semibold">配信先</th><th className="px-2 py-2.5 text-right font-semibold">フォロワー</th><th className="px-2 py-2.5 font-semibold">状態</th><th className="px-4 py-2.5 font-semibold">メモ</th>
          </tr></thead>
          <tbody>
            {LIVERS.map((l, i) => (
              <tr key={l.id} className="row mo-fade-in border-t border-line-soft" style={{ ['--i' as string]: i }}>
                <td className="px-4 py-2.5 font-semibold"><Link href={`/eigyo/proper/${l.id}?list=liver`} className="hover:underline">{l.name}</Link></td><td className="px-2 py-2.5">{l.platform}</td><td className="num px-2 py-2.5 text-right">{l.followers}</td>
                <td className="px-2 py-2.5"><span className="chip" style={{ background: tone[l.status].bg, color: tone[l.status].fg }}>{l.status}</span></td>
                <td className="px-4 py-2.5 text-muted">{l.memo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
