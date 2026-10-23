'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, FileSpreadsheet, Search, X } from 'lucide-react';
import { LIVERS, PEOPLE, PROPERS, type Proper } from '@/lib/sample';
import { StaffList } from '@/components/lists/StaffList';
import { PageTitle, Pill, PrimaryButton } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import { DrawerPortal } from '@/components/DrawerPortal';
import { LiveBanner, useIke } from '@/components/Live';
import { liveProperRows, type LiverList, type LiveProper, type PartnerList } from '@/lib/live/proper';
import type { EngineerRows } from '@/lib/live/eigyo-common';

// 要員（プロパー）＋スキシ作成（2026-10-23 shoya「プロパーリストの中にスキシ作成をマージ」）。
//   スキシは客先に出す紙：本名は載せずイニシャル、経歴は古い順、稼働開始に健康情報らしい値は載せない（今のシステムと同じ決まり）。
//   本物（ログイン中）：プロパー＝/api/roster?action=getEngineerRows&area=main、営業共有リスト＝/api/partner-list?action=list、
//     ライバーリスト＝/api/livers（全体管理者だけ・見られるかは今の API が決める）。読むだけ。スキシを作るのは スキルシート作成 の画面から
//   名前を押すと要員ページ（/eigyo/proper/<id>）を開く
const SK_STYLE: Record<string, { bg: string; fg: string }> = {
  作成済み: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)' }, 未作成: { bg: 'var(--tone-mute-bg)', fg: 'var(--tone-mute-fg)' }, 要確認: { bg: 'var(--tone-bad-bg)', fg: 'var(--tone-bad-fg)' },
};

type ChipKey = 'すべて' | '営業中' | 'スキシ未作成' | 'スキシ要確認';
const CHIP_TEST: Record<ChipKey, (p: Proper) => boolean> = {
  すべて: () => true, 営業中: (p) => p.status === '営業中', スキシ未作成: (p) => p.sukishi.state === '未作成', スキシ要確認: (p) => p.sukishi.state === '要確認',
};

// rows は親（タブの外）で持つ。タブを行き来しても、作ったスキシの状態が消えないように
function ProperTab({ rows, setRows, live }: { rows: (Proper & Partial<LiveProper>)[]; setRows: React.Dispatch<React.SetStateAction<Proper[]>>; live: boolean }) {
  const canEdit = usePerms().can('eigyo', 'edit') && !live;
  const SALES_OPTS = useMemo(() => Array.from(new Set(rows.map((p) => (live ? p.recruiter ?? '' : p.sales)))).filter(Boolean).sort(), [rows, live]);
  const START_OPTS = useMemo(() => Array.from(new Set(rows.map((p) => p.sukishi.start))).filter(Boolean).slice(0, 40), [rows]);
  const { hit, toast } = useMotivation();
  const [chip, setChip] = useState<ChipKey>('すべて');
  const [q, setQ] = useState('');
  const [fSales, setFSales] = useState('');
  const [fStart, setFStart] = useState('');
  const shown = rows.filter((p) => CHIP_TEST[chip](p) && (!q || `${p.name}${p.station}${p.want}`.includes(q)) && (!fSales || (live ? p.recruiter : p.sales) === fSales) && (!fStart || p.sukishi.start === fStart));
  const filtered = chip !== 'すべて' || q || fSales || fStart;
  // ?sukishi=<id> でそのスキシを開いた状態から始める（画面の見本を撮るとき用）
  const [open, setOpen] = useState<(Proper & Partial<LiveProper>) | null>(null);
  useEffect(() => { const u = new URLSearchParams(window.location.search); const id = u.get('sukishi'); const p = PROPERS.find((x) => x.id === id); if (p) setOpen(p); const qq = u.get('q'); if (qq) setQ(qq); }, []);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const make = (p: Proper) => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      const prev = rows.find((r) => r.id === p.id)?.sukishi ?? p.sukishi;
      setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, sukishi: { ...r.sukishi, state: '作成済み', updated: '今日' } } : r)));
      setFlash(p.id); setTimeout(() => setFlash(null), 1300);
      setOpen(null);
      hit();
      toast({ text: `${p.sukishi.initial || p.name} のスキシを作りました`, sub: '→ 案件の提案と、営業共有リストから開けます', undo: () => setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, sukishi: prev } : r))) });
    }, 900);
  };

  return (
    <div className="flex min-h-full">
      <div className={`flex min-w-0 flex-1 flex-col gap-3.5 ${open ? 'xl:pr-[444px]' : ''}`}>
        <div className="mo-fade-up flex flex-wrap gap-2" style={{ ['--i' as string]: 1 }}>
          {(Object.keys(CHIP_TEST) as ChipKey[]).map((l) => (
            <button key={l} onClick={() => setChip(l)} aria-pressed={chip === l} className="min-h-9 whitespace-nowrap rounded-full border px-3.5 text-[13px]" style={chip === l ? { borderColor: 'var(--a)', background: 'var(--as)', color: 'var(--ad)', fontWeight: 700 } : { borderColor: 'var(--color-field)', background: 'var(--color-surface)' }}>{l} <span className="num">{rows.filter(CHIP_TEST[l]).length}</span></button>
          ))}
        </div>
        <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
          <div className="flex flex-wrap items-center gap-2 px-3.5 py-3">
            <label className="flex min-h-9 min-w-[240px] items-center gap-2 rounded-[10px] border border-field px-3 text-faint"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} aria-label="この一覧を検索" placeholder="名前・最寄駅・希望" className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none" /></label>
            {([[live ? '採用担当' : '担当営業', fSales, setFSales, SALES_OPTS], ['稼働開始', fStart, setFStart, START_OPTS]] as const).map(([l, v, set, opts]) => (
              <select key={l} aria-label={`${l}で絞る`} value={v} onChange={(e) => set(e.target.value)} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-[13px]" style={v ? { borderColor: 'var(--a)', color: 'var(--ad)', fontWeight: 600 } : undefined}>
                <option value="">{l}：すべて</option>{opts.map((o) => <option key={o} value={o}>{l}：{o}</option>)}
              </select>
            ))}
            {filtered && <button onClick={() => { setChip('すべて'); setQ(''); setFSales(''); setFStart(''); }} className="text-[12.5px] text-muted underline">絞り込みを外す</button>}
            <span className="ml-auto text-[12.5px] text-muted"><span className="num">{shown.length}</span>人</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-[13px]">
              <thead><tr className="th-row text-left">
                <th className="px-4 py-2.5 font-semibold">要員</th><th className="px-2 py-2.5 font-semibold">状態</th><th className="px-2 py-2.5 font-semibold">最寄駅</th><th className="px-2 py-2.5 font-semibold">希望</th><th className="px-2 py-2.5 text-right font-semibold">{live ? '額面' : '単価'}</th><th className="px-2 py-2.5 font-semibold">{live ? '採用担当' : '担当営業'}</th><th className="px-2 py-2.5 font-semibold">スキシ</th><th className="px-4 py-2.5" />
              </tr></thead>
              <tbody>
                {shown.slice(0, 300).map((p, i) => {
                  const s = SK_STYLE[p.sukishi.state];
                  return (
                    <tr key={p.id} className={`mo-fade-in border-t border-line-soft ${flash === p.id ? 'mo-flash' : open?.id === p.id ? '' : 'row'}`} style={{ ['--i' as string]: i + 3, background: open?.id === p.id ? 'var(--as)' : undefined }}>
                      <td className="px-4 py-2.5 font-semibold"><Link href={`/eigyo/proper/${p.id}`} className="hover:underline">{p.name}</Link>{p.flag && <span className="ml-1.5 text-[11px] font-normal text-warn">{p.flag}</span>}</td>
                      <td className="whitespace-nowrap px-2 py-2.5"><Pill>{p.status === '営業中' ? '待機' : p.status === '参画決定' ? '入場予定' : '稼働中'}</Pill> <span className="text-[11.5px] text-muted">{p.status}</span></td>
                      <td className="px-2 py-2.5">{p.station}</td>
                      <td className="px-2 py-2.5">{p.want}</td>
                      <td className="num whitespace-nowrap px-2 py-2.5 text-right">{p.price}</td>
                      <td className="px-2 py-2.5">{live ? p.recruiter : p.sales}</td>
                      <td className="whitespace-nowrap px-2 py-2.5"><span className="chip" style={{ background: s.bg, color: s.fg }}>{p.sukishi.state}</span>{p.sukishi.updated && <span className="ml-1.5 text-[11.5px] text-faint">{p.sukishi.updated}</span>}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => setOpen(p)} className="inline-flex min-h-8 items-center whitespace-nowrap gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-semibold" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}>
                          <FileSpreadsheet size={14} />{p.sukishi.state === '作成済み' ? 'スキシを見る' : 'スキシを作る'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {shown.length > 300 && <tr><td colSpan={8} className="px-4 py-3 text-center text-[12px] text-muted">はじめの300人を出しています。検索や絞り込みで探してください</td></tr>}
                {shown.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-[13px] text-muted">この条件の要員はいません</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {open && (
        <DrawerPortal>
        <aside key={open.id} aria-label="スキシ" className="mo-drawer fixed bottom-0 right-0 top-[var(--hdr,58px)] z-20 flex w-[min(420px,100vw)] flex-col border-l border-line bg-surface shadow-[-12px_0_28px_rgba(25,27,46,.10)]">
          <div className="flex items-start justify-between px-5 py-4">
            <div><div className="text-[12px] text-faint">スキルシート（客先に出す紙）</div><div className="text-[18px] font-bold">{open.name}</div></div>
            <button aria-label="閉じる" onClick={() => setOpen(null)} className="flex size-[34px] items-center justify-center rounded-[10px] border border-line"><X size={16} /></button>
          </div>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 pb-4 text-[13px]">
            {open.sukishi.warn && <div role="alert" className="mo-shake flex gap-2 rounded-[10px] border border-bad-line bg-bad-soft px-3 py-2.5 text-bad"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-bad" />{open.sukishi.warn}</div>}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-[10px] bg-soft px-4 py-3">
              <div><dt className="text-[11.5px] text-faint">名前（イニシャル）</dt><dd className="font-semibold">{open.sukishi.initial || <span className="text-bad">空欄</span>}</dd></div>
              <div><dt className="text-[11.5px] text-faint">年齢</dt><dd>{open.sukishi.age}</dd></div>
              <div><dt className="text-[11.5px] text-faint">最寄駅</dt><dd>{open.station}</dd></div>
              <div><dt className="text-[11.5px] text-faint">稼働開始</dt><dd>{open.sukishi.start}</dd></div>
              <div className="col-span-2"><dt className="text-[11.5px] text-faint">資格</dt><dd>{open.sukishi.skills}</dd></div>
            </dl>
            {live && open.summary && <div><div className="mb-1.5 text-[12px] font-semibold text-muted">サマリ（客先に貼る紹介文）</div><p className="whitespace-pre-line rounded-[10px] border border-line px-3 py-2 text-[12.5px]">{open.summary}</p></div>}
            <div>
              <div className="mb-1.5 text-[12px] font-semibold text-muted">経歴（古い順）</div>
              {open.sukishi.history.length === 0 && <div className="rounded-[10px] bg-soft px-3 py-2 text-[12.5px] text-muted">{live ? '経歴は スキルシート作成 の画面（基本情報フォームの回答）で見られます' : 'まだありません'}</div>}
              <ol className="flex flex-col gap-2">
                {open.sukishi.history.map((h, i) => (
                  <li key={h.period} className="mo-fade-up rounded-[10px] border border-line px-3 py-2" style={{ ['--i' as string]: i + 1 }}><div className="text-[11.5px] text-faint">{h.period}</div>{h.text}</li>
                ))}
              </ol>
            </div>
            <p className="text-[11.5px] text-faint">出どころ：基本情報（氏名・年齢・最寄駅・資格）／経歴フォーム／プロパーの稼働開始。本名・健康に関する内容は載せません。</p>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            {live ? (<>
              {open.sukishiUrl && <a href={open.sukishiUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-[10px] border border-field bg-surface px-3.5 text-[13.5px] font-semibold">スプレッドシートを開く</a>}
              <Link href={`/jinji/skillsheet?q=${encodeURIComponent(open.name)}`} className="btn-primary inline-flex min-h-10 items-center rounded-[10px] px-4 text-[13.5px] font-semibold">スキルシート作成で作る</Link>
            </>) : (<>
            {open.sukishi.state === '作成済み' && <button onClick={() => toast({ text: `${open.sukishi.initial} のスキシを開きます（見本）`, sub: '→ 本物ではスプレッドシートが新しいタブで開きます' })} className="min-h-10 rounded-[10px] border border-field bg-surface px-3.5 text-[13.5px] font-semibold">スプレッドシートを開く</button>}
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
  const lrows = useMemo(() => liveProperRows(er.data), [er.data]);
  const rows = live ? lrows : rowsS;
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
      <LiveBanner state={er.state} error={er.error} onReload={er.reload} note={`今のプロパーリスト ${lrows.length}人（営業止め・辞退の人は出していません）。ここからは変えられません`} />
      <div role="tablist" className="mo-fade-up flex gap-1 overflow-x-auto border-b border-line" style={{ ['--i' as string]: 1 }}>
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => go(t.key)} className="whitespace-nowrap px-3.5 py-2.5 text-[14px]"
            style={tab === t.key ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: 'var(--color-muted)' }}>
            {t.label}{t.key === 'liver' && <span className="ml-1.5 rounded bg-sunken px-1.5 text-[10.5px] text-muted">全体管理者だけ</span>}
          </button>
        ))}
      </div>
      <div key={tab} className="mo-axis">
        {tab === 'proper' && <ProperTab rows={rows} setRows={setRows} live={live} />}
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
          <p className="text-[12.5px] text-muted">今の営業共有リスト（営業中の人だけ）。内勤以外の人（営業など）が見られるのはこの中身だけです。</p>
          <label className="ml-auto flex min-h-9 items-center gap-2 rounded-[10px] border border-field bg-surface px-3 text-faint"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} aria-label="営業共有リストを検索" placeholder="名前・最寄駅・希望" className="w-44 bg-transparent text-[13px] text-ink outline-none" /></label>
        </div>
        {pl.state === 'error' && <div className="rounded-xl px-4 py-2.5 text-[12.5px]" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>{pl.error}</div>}
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">要員</th><th className="px-2 py-2.5 font-semibold">最寄駅</th><th className="px-2 py-2.5 font-semibold">稼働</th><th className="px-2 py-2.5 font-semibold">稼働できる日</th><th className="px-2 py-2.5 font-semibold">希望</th><th className="px-4 py-2.5 text-right font-semibold">並行数</th>
            </tr></thead>
            <tbody>
              {pl.state === 'loading' && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">読み込み中…</td></tr>}
              {people.slice(0, 300).map((p, i) => (
                <tr key={p.id} className="row mo-fade-in border-t border-line-soft" style={{ ['--i' as string]: Math.min(i, 20) }}>
                  <td className="px-4 py-2.5 font-semibold"><Link href={`/eigyo/proper/${p.id}`} className="hover:underline">{p.name}</Link>{p.tags.length > 0 && <span className="ml-1.5 text-[11px] font-normal text-muted">{p.tags.slice(0, 3).join('・')}</span>}</td>
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
      <p className="text-[12.5px] text-muted">内勤以外の人（営業など）が見られるのはこの中身だけです。</p>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead><tr className="th-row text-left">
            <th className="px-4 py-2.5 font-semibold">要員</th><th className="px-2 py-2.5 font-semibold">状態</th><th className="px-2 py-2.5 font-semibold">最寄駅</th><th className="px-2 py-2.5 font-semibold">稼働できる日</th><th className="px-4 py-2.5 font-semibold">担当営業</th>
          </tr></thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id} className="row mo-fade-in border-t border-line-soft" style={{ ['--i' as string]: i }}>
                <td className="px-4 py-2.5 font-semibold"><Link href={`/eigyo/proper/${p.id}`} className="hover:underline">{p.name}</Link></td>
                <td className="px-2 py-2.5"><Pill>{p.status}</Pill>{p.contractEnd && <span className="ml-1.5 text-[11.5px] text-warn">{p.contractEnd}</span>}</td>
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
  const lv = useIke<LiverList>(live ? 'livers' : null);
  if (live) return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] text-muted">今のライバーリスト（プロパーには入れない別のリスト・全体管理者だけ）。状態・メモを直すのは今の画面から。</p>
      {lv.state === 'error' && <div className="rounded-xl px-4 py-2.5 text-[12.5px]" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>{lv.error}</div>}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead><tr className="th-row text-left">
            <th className="px-4 py-2.5 font-semibold">名前</th><th className="px-2 py-2.5 font-semibold">承諾日</th><th className="px-2 py-2.5 font-semibold">入社日</th><th className="px-2 py-2.5 font-semibold">採用担当</th><th className="px-2 py-2.5 font-semibold">状態</th><th className="px-4 py-2.5 font-semibold">メモ</th>
          </tr></thead>
          <tbody>
            {lv.state === 'loading' && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">読み込み中…</td></tr>}
            {(lv.data?.rows ?? []).map((l, i) => (
              <tr key={l.id} className="row mo-fade-in border-t border-line-soft" style={{ ['--i' as string]: Math.min(i, 20) }}>
                <td className="px-4 py-2.5 font-semibold"><Link href={`/eigyo/proper/${l.id}?list=liver`} className="hover:underline">{l.name}</Link>{lv.data?.inProper.includes(l.id) && <span className="ml-1.5 text-[11px] font-normal text-warn">プロパーにも居る</span>}</td>
                <td className="px-2 py-2.5">{l.shoudaku_bi || '—'}</td><td className="px-2 py-2.5">{l.nyusha_bi || '—'}</td><td className="px-2 py-2.5">{l.tantou || '—'}</td>
                <td className="px-2 py-2.5">{l.status ? <Pill>{l.status}</Pill> : <span className="text-faint">—</span>}</td>
                <td className="max-w-[320px] px-4 py-2.5 text-muted"><span className="line-clamp-2">{l.memo || ''}</span></td>
              </tr>
            ))}
            {lv.state === 'live' && !(lv.data?.rows ?? []).length && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">まだいません</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] text-muted">プロパーには入れない別のリストです（全体管理者だけ）。</p>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
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
