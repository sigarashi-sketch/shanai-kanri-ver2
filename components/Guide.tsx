'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, CircleHelp, Lock, X } from 'lucide-react';
import { Dialog } from './Dialog';
import { usePerms } from './Perms';
import { Z_MODAL } from '@/lib/layers';
import { LEVELS, atLeast, type Level } from '@/lib/access';
import { GUIDE } from '@/lib/guide';
import { NAV_HOME, type NavGroup, type NavItem } from '@/lib/nav';

// 使い方ガイド（10-27 shoya「各ロールに割り振った画面の説明を最初に表示」「このボタン押すと〜がみれます・〜はこういう表示・機能」「使い方ガイドとしてあとで示せるように」）。
//   ・出すのは その人が開ける画面だけ（左メニューと同じ決め方＝Shell が渡す visible）。画面ごとに 押すと見られるもの・見え方・できること（lib/guide.ts）
//   ・できることのうち（直す）（承認）の付いた操作は、その人の段階で足りなければ薄くして「この権限ではできません」
//   ・はじめて開いたときに1回だけ自動で出す（この端末に覚える・GUIDE_SEEN_KEY）。あとは右上の「使い方」からいつでも
export const GUIDE_SEEN_KEY = 'v2_guide_seen_v1';
const NEED: Record<string, Level> = { '（直す）': 'edit', '（承認）': 'approve' };
const levelText = (l: Level) => LEVELS.find((x) => x.key === l)!.label;

export function GuideHost({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem(GUIDE_SEEN_KEY)) setOpen(true); } catch { /* 覚えられない端末では自動では出さない */ }
  }, []);
  const close = () => { setOpen(false); try { localStorage.setItem(GUIDE_SEEN_KEY, new Date().toISOString()); } catch { /* noop */ } };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-10 items-center gap-1.5 rounded-[10px] border border-line px-2.5 text-sm font-semibold text-ink hover:bg-soft" title="使い方ガイド（あなたが開ける画面の説明）">
        <CircleHelp size={16} strokeWidth={1.8} />使い方
      </button>
      {open && <GuideDialog groups={groups} onClose={close} />}
    </>
  );
}

function GuideDialog({ groups, onClose }: { groups: NavGroup[]; onClose: () => void }) {
  const { me, kperms, pages, home, open } = usePerms();
  const homeItems = NAV_HOME.filter((it) => open(it.href));
  const secs = [{ key: 'intro', label: 'はじめに', color: 'var(--color-ink)' }, ...groups.map((g) => ({ key: g.module as string, label: g.label, color: `var(--c-${g.module})` }))];
  const [sec, setSec] = useState('intro');
  const i = secs.findIndex((s) => s.key === sec);
  const g = groups.find((x) => x.module === sec);
  // その画面での段階：かな西＝見るだけ（神奈川要員だけ）／区分の段階／画面ごとの「見るだけ」
  const levelOf = (gr: NavGroup, it: NavItem): { l: Level; note?: string } =>
    open(it.href) === 'kanawest' ? { l: 'view', note: '神奈川要員だけ' }
      : kperms[gr.module] !== 'none' ? { l: kperms[gr.module] }
      : pages.includes(it.href) ? { l: 'view', note: 'この画面だけ' } : { l: 'none' };

  return (
    <Dialog label="使い方ガイド" onClose={onClose} z={Z_MODAL} backdropClassName="bg-black/30"
      className="mo-scale-in fixed inset-x-3 top-[5vh] mx-auto flex max-h-[90vh] max-w-[960px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_64px_rgba(24,24,27,.28)]">
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">使い方ガイド</h2>
          <p className="text-sm text-muted">{me.name}さんが開ける画面と、それぞれで見られるもの・できることです（組織表で付いた権限で決まります）。右上の「使い方」からいつでも開けます。</p>
        </div>
        <button type="button" data-dialog-close onClick={onClose} aria-label="閉じる" className="rounded-lg p-1.5 text-muted hover:bg-sunken"><X size={18} /></button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav aria-label="ガイドの目次" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2 sm:w-[200px] sm:flex-col sm:border-b-0 sm:border-r">
          {secs.map((s) => (
            <button key={s.key} type="button" onClick={() => setSec(s.key)} aria-current={sec === s.key}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-body ${sec === s.key ? 'bg-sunken font-semibold' : 'hover:bg-soft'}`}>
              <i className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />{s.label}
              {s.key !== 'intro' && <span className="ml-auto text-xs text-faint">{groups.find((x) => x.module === s.key)?.items.length}</span>}
            </button>
          ))}
        </nav>
        <div key={sec} className="mo-fade-in min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {sec === 'intro' ? (
            <Intro home={home} homeItems={homeItems} groups={groups} kanawest={kperms.kanawest !== 'none'} />
          ) : g ? (
            <div className="flex flex-col gap-3">
              <h3 className="flex items-center gap-2 text-md font-bold"><i className="size-2.5 rounded-full" style={{ background: `var(--c-${g.module})` }} />{g.label}
                <span className="text-sm font-normal text-muted">{kperms.kanawest !== 'none' ? '見るだけ（神奈川要員だけ）' : kperms[g.module] !== 'none' ? `「${levelText(kperms[g.module])}」の権限` : '一部の画面だけ「見る」'}</span>
              </h3>
              {g.items.map((it, n) => <ItemCard key={it.href} it={it} mod={g.module} n={n} {...levelOf(g, it)} onGo={onClose} />)}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-line px-5 py-3">
        <span className="text-sm text-faint">{i + 1} / {secs.length}</span>
        {i > 0 && <button type="button" onClick={() => setSec(secs[i - 1].key)} className="btn-secondary ml-auto">戻る</button>}
        {i < secs.length - 1
          ? <button type="button" onClick={() => setSec(secs[i + 1].key)} className={`btn ${i > 0 ? '' : 'ml-auto'} bg-sumi text-white`}>次へ（{secs[i + 1].label}）<ArrowRight size={15} /></button>
          : <button type="button" onClick={onClose} className="btn bg-sumi text-white">はじめる</button>}
      </div>
    </Dialog>
  );
}

function Intro({ home, homeItems, groups, kanawest }: { home: string; homeItems: NavItem[]; groups: NavGroup[]; kanawest: boolean }) {
  const homeLabel = home === '/home/eigyo' ? 'ホーム営業（成約・売上とフィードのタブ）' : home === '/home/jinji' ? 'ホーム人事（要員の動きのフィード）' : 'ホーム（全体のやること）';
  return (
    <div className="flex flex-col gap-4 text-body">
      <section>
        <h3 className="text-md font-bold">左のメニュー</h3>
        <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-muted">
          <li>ふだんはアイコンだけの細い帯です。マウスを合わせると広がり、分類の見出しを押すと画面の一覧が開きます。上のピンで広げたまま固定できます。</li>
          <li>「ホーム」を押すと <b className="text-ink">{homeLabel}</b> が開きます。{homeItems.length > 0 && <>その下の「{homeItems.map((x) => x.label).join('・')}」もここから。</>}</li>
          <li>メニューに出ているのは、あなたが開ける画面だけです（{groups.length}つの分類・{groups.reduce((n, g) => n + g.items.length, 0)}画面）。左の目次から、分類ごとの説明を見られます。</li>
        </ul>
      </section>
      <section>
        <h3 className="text-md font-bold">権限の段階</h3>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
          {LEVELS.filter((l) => l.key !== 'none').map((l) => (
            <div key={l.key} className="rounded-xl border border-line px-3 py-2"><b>{l.label}</b><div className="text-sm text-muted">{l.hint}</div></div>
          ))}
        </div>
        <p className="mt-1.5 text-sm text-muted">足りない操作のボタンは押せず、どの権限が要るかが出ます。必要なときは全体管理者に組織表で付けてもらってください。</p>
        {kanawest && <p className="mt-1.5 rounded-lg border border-line bg-soft px-3 py-2 text-sm">かな西エリア：どの画面も神奈川要員の人だけが出ます（見るだけ）。</p>}
      </section>
      <section>
        <h3 className="text-md font-bold">どの画面でも使えるもの</h3>
        <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-muted">
          <li>右上の「連絡」：チャット・配信・手動配信（人事の画面＝インフォメーション、それ以外＝あおい）。送信は長押しです。</li>
          <li>右クリック：画面の一覧から移る・スプリット（2〜4画面を並べる）。</li>
          <li>人の名前を押すと、その人の情報が画面の上に出ます。</li>
          <li>何かを片づけると下に知らせが出て、「取り消す」で戻せます。</li>
          <li>右上の「見た目」：画面の着せ替えと、<b className="text-ink">チャットの色</b>（こちら＝送った側・相手 の吹き出しの色）を選べます。好きな色は「＋」から。どのチャット（連絡・人の詳細・人財管理のチャット）にも効き、あなたの分として保存するので どの端末でも同じ色です。「元の色に戻す」でいつでも戻せます。</li>
          <li>このガイドは右上の「使い方」からいつでも開けます。</li>
        </ul>
      </section>
    </div>
  );
}

function ItemCard({ it, mod, n, l, note, onGo }: { it: NavItem; mod: string; n: number; l: Level; note?: string; onGo: () => void }) {
  const e = GUIDE[it.href];
  return (
    <article className="mo-fade-up rounded-xl border border-line bg-surface p-4" style={{ ['--i' as string]: Math.min(n, 12) }}>
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-md">{it.label}</b>
        {l !== 'none' && <span className="chip" style={{ background: `var(--c-${mod})`, color: `var(--o-${mod})` }}>{levelText(l)}{note ? `・${note}` : ''}</span>}
        <Link href={it.href} onClick={onGo} className="ml-auto inline-flex items-center gap-1 text-sm font-semibold hover:underline">開く<ArrowRight size={14} /></Link>
      </div>
      {e ? (
        <div className="mt-2 flex flex-col gap-1.5 text-body">
          <p>{e.see}</p>
          <p className="text-muted"><span className="font-semibold text-ink">見え方：</span>{e.look}</p>
          <ul className="flex flex-col gap-0.5">
            {e.can.map((c) => {
              const tag = Object.keys(NEED).find((k) => c.endsWith(k));
              const ok = !tag || atLeast(l, NEED[tag]);
              return (
                <li key={c} className={`flex items-start gap-1.5 text-sm ${ok ? '' : 'text-faint'}`} title={ok ? undefined : `「${levelText(NEED[tag!])}」の権限が要ります`}>
                  {ok ? <Check size={14} className="mt-0.5 shrink-0" style={{ color: `var(--c-${mod})` }} /> : <Lock size={13} className="mt-0.5 shrink-0" />}
                  <span>{tag ? c.slice(0, -tag.length) : c}{!ok && <span className="ml-1 text-xs">（この権限ではできません）</span>}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : <p className="mt-2 text-sm text-faint">説明はまだありません</p>}
    </article>
  );
}
