'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Search, X } from 'lucide-react';
import { LIVERS, PEOPLE, PROPERS, type Proper } from '@/lib/sample';
import { StaffList } from '@/components/lists/StaffList';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageTitle, Pill, PrimaryButton } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import { DrawerPortal } from '@/components/DrawerPortal';

// 要員（プロパー）＋スキシ作成（2026-10-23 shoya「プロパーリストの中にスキシ作成をマージ」）。
//   スキシは客先に出す紙：本名は載せずイニシャル、経歴は古い順、稼働開始に健康情報らしい値は載せない（今のいけどんと同じ決まり）。
const SK_STYLE: Record<string, { bg: string; fg: string }> = {
  作成済み: { bg: '#E9F7EE', fg: '#116B34' }, 未作成: { bg: '#F0F1F5', fg: '#5A5E75' }, 要確認: { bg: '#FFE4E9', fg: '#BE123C' },
};

function ProperTab() {
  const canEdit = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const [rows, setRows] = useState<Proper[]>(PROPERS);
  // ?sukishi=<id> でそのスキシを開いた状態から始める（画面の見本を撮るとき用）
  const [open, setOpen] = useState<Proper | null>(null);
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('sukishi'); const p = PROPERS.find((x) => x.id === id); if (p) setOpen(p); }, []);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const make = (p: Proper) => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, sukishi: { ...r.sukishi, state: '作成済み', updated: '今日' } } : r)));
      setFlash(p.id); setTimeout(() => setFlash(null), 1300);
      setOpen(null);
      hit();
      toast({ text: `${p.sukishi.initial || p.name} のスキシを作りました`, sub: '→ 案件の提案と、営業共有リストから開けます' });
    }, 900);
  };

  return (
    <div className="flex min-h-full">
      <div className={`flex min-w-0 flex-1 flex-col gap-3.5 ${open ? 'xl:pr-[444px]' : ''}`}>
        <div className="mo-fade-up flex flex-wrap gap-2" style={{ ['--i' as string]: 1 }}>
          {[['すべて', rows.length], ['営業中', rows.filter((r) => r.status === '営業中').length], ['スキシ未作成', rows.filter((r) => r.sukishi.state === '未作成').length], ['スキシ要確認', rows.filter((r) => r.sukishi.state === '要確認').length]].map(([l, n], i) => (
            <button key={l} className="min-h-9 rounded-full border px-3.5 text-[13px]" style={i === 0 ? { borderColor: 'var(--a)', background: 'var(--as)', color: 'var(--ad)', fontWeight: 700 } : { borderColor: '#DCDDE6', background: '#fff' }}>{l} <span className="num">{n}</span></button>
          ))}
        </div>
        <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-white" style={{ ['--i' as string]: 2 }}>
          <div className="flex flex-wrap items-center gap-2 px-3.5 py-3">
            <label className="flex min-h-9 min-w-[240px] items-center gap-2 rounded-[10px] border border-[#DCDDE6] px-3 text-faint"><Search size={15} /><input aria-label="この一覧を検索" placeholder="名前・最寄駅・希望" className="flex-1 bg-transparent text-[13px] text-ink outline-none" /></label>
            {['担当営業', '希望の職種', '稼働開始'].map((f) => <button key={f} className="min-h-9 rounded-[10px] border border-[#DCDDE6] bg-white px-3 text-[13px]">{f} ⌄</button>)}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-[13px]">
              <thead><tr className="text-left" style={{ background: 'var(--as)', color: 'var(--ad)' }}>
                <th className="px-4 py-2.5 font-semibold">要員</th><th className="px-2 py-2.5 font-semibold">状態</th><th className="px-2 py-2.5 font-semibold">最寄駅</th><th className="px-2 py-2.5 font-semibold">希望</th><th className="px-2 py-2.5 text-right font-semibold">単価</th><th className="px-2 py-2.5 font-semibold">担当営業</th><th className="px-2 py-2.5 font-semibold">スキシ</th><th className="px-4 py-2.5" />
              </tr></thead>
              <tbody>
                {rows.map((p, i) => {
                  const s = SK_STYLE[p.sukishi.state];
                  return (
                    <tr key={p.id} className={`mo-fade-in border-t border-line-soft ${flash === p.id ? 'mo-flash' : open?.id === p.id ? '' : 'row'}`} style={{ ['--i' as string]: i + 3, background: open?.id === p.id ? 'var(--as)' : undefined }}>
                      <td className="px-4 py-2.5 font-semibold">{p.name}</td>
                      <td className="px-2 py-2.5"><Pill>{p.status === '営業中' ? '待機' : p.status === '参画決定' ? '入場予定' : '稼働中'}</Pill> <span className="text-[11.5px] text-muted">{p.status}</span></td>
                      <td className="px-2 py-2.5">{p.station}</td>
                      <td className="px-2 py-2.5">{p.want}</td>
                      <td className="num px-2 py-2.5 text-right">{p.price}</td>
                      <td className="px-2 py-2.5">{p.sales}</td>
                      <td className="px-2 py-2.5"><span className="rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={{ background: s.bg, color: s.fg }}>{p.sukishi.state}</span>{p.sukishi.updated && <span className="ml-1.5 text-[11.5px] text-faint">{p.sukishi.updated}</span>}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => setOpen(p)} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-semibold" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}>
                          <FileSpreadsheet size={14} />{p.sukishi.state === '作成済み' ? 'スキシを見る' : 'スキシを作る'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {open && (
        <DrawerPortal>
        <aside key={open.id} aria-label="スキシ" className="mo-drawer fixed bottom-0 right-0 top-[var(--hdr,58px)] z-20 flex w-[min(420px,100vw)] flex-col border-l border-line bg-white shadow-[-12px_0_28px_rgba(25,27,46,.10)]">
          <div className="flex items-start justify-between px-5 py-4">
            <div><div className="text-[12px] text-faint">スキルシート（客先に出す紙）</div><div className="text-[18px] font-bold">{open.name}</div></div>
            <button aria-label="閉じる" onClick={() => setOpen(null)} className="flex size-[34px] items-center justify-center rounded-[10px] border border-line"><X size={16} /></button>
          </div>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 pb-4 text-[13px]">
            {open.sukishi.warn && <div role="alert" className="mo-shake flex gap-2 rounded-[10px] border border-[#FBC4CF] bg-[#FFF1F3] px-3 py-2.5 text-[#881337]"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-[#E11D48]" />{open.sukishi.warn}</div>}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-[10px] bg-[#F6F6FB] px-4 py-3">
              <div><dt className="text-[11.5px] text-faint">名前（イニシャル）</dt><dd className="font-semibold">{open.sukishi.initial || <span className="text-[#BE123C]">空欄</span>}</dd></div>
              <div><dt className="text-[11.5px] text-faint">年齢</dt><dd>{open.sukishi.age}</dd></div>
              <div><dt className="text-[11.5px] text-faint">最寄駅</dt><dd>{open.station}</dd></div>
              <div><dt className="text-[11.5px] text-faint">稼働開始</dt><dd>{open.sukishi.start}</dd></div>
              <div className="col-span-2"><dt className="text-[11.5px] text-faint">資格</dt><dd>{open.sukishi.skills}</dd></div>
            </dl>
            <div>
              <div className="mb-1.5 text-[12px] font-semibold text-muted">経歴（古い順）</div>
              <ol className="flex flex-col gap-2">
                {open.sukishi.history.map((h, i) => (
                  <li key={h.period} className="mo-fade-up rounded-[10px] border border-line px-3 py-2" style={{ ['--i' as string]: i + 1 }}><div className="text-[11.5px] text-faint">{h.period}</div>{h.text}</li>
                ))}
              </ol>
            </div>
            <p className="text-[11.5px] text-faint">出どころ：基本情報（氏名・年齢・最寄駅・資格）／経歴フォーム／プロパーの稼働開始。本名・健康に関する内容は載せません。</p>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            {open.sukishi.state === '作成済み' && <button className="min-h-10 rounded-[10px] border border-[#DCDDE6] bg-white px-3.5 text-[13.5px] font-semibold">スプレッドシートを開く</button>}
            <PrimaryButton onClick={() => make(open)} disabled={!canEdit || busy || !!open.sukishi.warn} title={!canEdit ? needText('edit') : open.sukishi.warn ? '先に要確認を直してください' : undefined}>
              {busy ? <span className="inline-flex items-center gap-2"><span className="mo-pulse">作成中</span></span> : open.sukishi.state === '作成済み' ? '作り直す' : 'スキシを作る'}
            </PrimaryButton>
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
  const router = useRouter();
  const sp = useSearchParams();
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'proper', label: 'プロパー・スキシ' },
    { key: 'shared', label: '営業共有リスト' },
    ...(can('jinji', 'view') ? [{ key: 'meibo' as TabKey, label: '従業員名簿' }] : []),
    ...(manageAccess ? [{ key: 'liver' as TabKey, label: 'ライバーリスト' }] : []),
  ];
  const want = (sp.get('tab') as TabKey) || 'proper';
  const tab = tabs.some((t) => t.key === want) ? want : 'proper';
  const go = (k: TabKey) => router.replace(`/eigyo/proper${k === 'proper' ? '' : `?tab=${k}`}`, { scroll: false });

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="要員リスト" sub="プロパー（スキシ作成つき）・営業共有リスト・従業員名簿を1か所で。タブで切り替え" />
      <div role="tablist" className="mo-fade-up flex gap-1 border-b border-line" style={{ ['--i' as string]: 1 }}>
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => go(t.key)} className="px-3.5 py-2.5 text-[14px]"
            style={tab === t.key ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: '#5A5E75' }}>
            {t.label}{t.key === 'liver' && <span className="ml-1.5 rounded bg-[#F0F1F5] px-1.5 text-[10.5px] text-muted">全体管理者だけ</span>}
          </button>
        ))}
      </div>
      <div key={tab} className="mo-axis">
        {tab === 'proper' && <ProperTab />}
        {tab === 'shared' && <SharedTab />}
        {tab === 'meibo' && <StaffList embedded />}
        {tab === 'liver' && <LiverTab />}
      </div>
    </main>
  );
}

function SharedTab() {
  const rows = PEOPLE.filter((p) => p.status === '待機' || p.status === '入場予定' || p.contractEnd);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] text-muted">内勤以外の人（営業など）が見られるのはこの中身だけです。</p>
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead><tr className="text-left" style={{ background: 'var(--as)', color: 'var(--ad)' }}>
            <th className="px-4 py-2.5 font-semibold">要員</th><th className="px-2 py-2.5 font-semibold">状態</th><th className="px-2 py-2.5 font-semibold">最寄駅</th><th className="px-2 py-2.5 font-semibold">稼働できる日</th><th className="px-4 py-2.5 font-semibold">担当営業</th>
          </tr></thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id} className="row mo-fade-in border-t border-line-soft" style={{ ['--i' as string]: i }}>
                <td className="px-4 py-2.5 font-semibold">{p.name}</td>
                <td className="px-2 py-2.5"><Pill>{p.status}</Pill>{p.contractEnd && <span className="ml-1.5 text-[11.5px] text-[#B45309]">{p.contractEnd}</span>}</td>
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

function LiverTab() {
  const tone: Record<string, { bg: string; fg: string }> = { 連絡中: { bg: '#EAF2FE', fg: '#134A9C' }, 面談予定: { bg: '#FFF4E0', fg: '#8A4B00' }, 見送り: { bg: '#F0F1F5', fg: '#5A5E75' } };
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] text-muted">プロパーには入れない別のリストです（全体管理者だけ）。</p>
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead><tr className="text-left" style={{ background: 'var(--as)', color: 'var(--ad)' }}>
            <th className="px-4 py-2.5 font-semibold">名前</th><th className="px-2 py-2.5 font-semibold">配信先</th><th className="px-2 py-2.5 text-right font-semibold">フォロワー</th><th className="px-2 py-2.5 font-semibold">状態</th><th className="px-4 py-2.5 font-semibold">メモ</th>
          </tr></thead>
          <tbody>
            {LIVERS.map((l, i) => (
              <tr key={l.id} className="row mo-fade-in border-t border-line-soft" style={{ ['--i' as string]: i }}>
                <td className="px-4 py-2.5 font-semibold">{l.name}</td><td className="px-2 py-2.5">{l.platform}</td><td className="num px-2 py-2.5 text-right">{l.followers}</td>
                <td className="px-2 py-2.5"><span className="rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={{ background: tone[l.status].bg, color: tone[l.status].fg }}>{l.status}</span></td>
                <td className="px-4 py-2.5 text-muted">{l.memo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
