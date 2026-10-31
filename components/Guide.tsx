'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, CircleHelp, Lock, Play, X } from 'lucide-react';
import { Dialog } from './Dialog';
import { Tour, type TourStep } from './Tour';
import { usePerms } from './Perms';
import { Z_MODAL } from '@/lib/layers';
import { LEVELS, atLeast, type Level } from '@/lib/access';
import { GUIDE } from '@/lib/guide';
import { isKanawest } from '@/lib/kubun';
import { NAV_HOME, type NavGroup, type NavItem } from '@/lib/nav';

// 使い方ガイド（10-27 shoya「各ロールに割り振った画面の説明を最初に表示」「このボタン押すと〜がみれます・〜はこういう表示・機能」「使い方ガイドとしてあとで示せるように」）。
//   ・出すのは その人が開ける画面だけ（左メニューと同じ決め方＝Shell が渡す visible）。画面ごとに 押すと見られるもの・見え方・できること（lib/guide.ts）
//   ・できることのうち（直す）（承認）の付いた操作は、その人の段階で足りなければ薄くして「この権限ではできません」
//   ・はじめて開いたときに1回だけ自動で出す（この端末に覚える・GUIDE_SEEN_KEY）。あとは右上の「使い方」からいつでも
//   ・10-27 shoya「実際の画面でポインタとか強調表示で」＝ふだんは実際の画面で案内する形（components/Tour.tsx）。この一覧の窓は その吹き出しの「一覧で見る」から
export const GUIDE_SEEN_KEY = 'v2_guide_seen_v1';
const NEED: Record<string, Level> = { '（直す）': 'edit', '（承認）': 'approve' };
const levelText = (l: Level) => LEVELS.find((x) => x.key === l)!.label;

export function GuideHost({ groups }: { groups: NavGroup[] }) {
  const [mode, setMode] = useState<'tour' | 'list' | null>(null);
  const [start, setStart] = useState(0);
  // 一覧の窓から選んだところ（はじめに・分類・画面）からガイドを始める（10-27 shoya「ここから選択すると使い方ガイド始まるように」）
  const tourFrom = (key: string) => { setStart(Math.max(0, steps.findIndex((x) => x.key === key))); setMode('tour'); };
  const steps = useTourSteps(groups);
  useEffect(() => {
    try { if (!localStorage.getItem(GUIDE_SEEN_KEY)) setMode('tour'); } catch { /* 覚えられない端末では自動では出さない */ }
  }, []);
  const close = () => { setMode(null); try { localStorage.setItem(GUIDE_SEEN_KEY, new Date().toISOString()); } catch { /* noop */ } };
  return (
    <>
      <button type="button" data-tour="guide" onClick={() => { setStart(0); setMode('tour'); }} className="flex min-h-10 items-center gap-1.5 rounded-[10px] border border-line px-2.5 text-sm font-semibold text-ink hover:bg-soft" title="使い方ガイド（実際の画面で順に案内します）">
        <CircleHelp size={16} strokeWidth={1.8} /><span className="max-md:sr-only">使い方</span>
      </button>
      {mode === 'tour' && <Tour key={start} steps={steps} start={start} onClose={close} onList={() => setMode('list')} />}
      {mode === 'list' && <GuideDialog groups={groups} onClose={close} onTour={tourFrom} />}
    </>
  );
}

// 連絡の窓を開く・閉じる（右上の「連絡」ボタンを押すのと同じ。ツアーの段に入ったときだけ）
const openRenraku = () => { if (!document.querySelector('[data-tour="renraku-tabs"]')) document.querySelector<HTMLButtonElement>('[data-tour="renraku"] button')?.click(); };
// 「見た目」の欄を開く・閉じる（右上の「見た目」ボタンを押すのと同じ）
const openTheme = () => { if (!document.querySelector('[data-tour="theme-menu"]')) document.querySelector<HTMLButtonElement>('[data-tour="theme"] button')?.click(); };
const closeTheme = () => { if (document.querySelector('[data-tour="theme-menu"]')) document.querySelector<HTMLButtonElement>('[data-tour="theme"] button')?.click(); };
const closeRenraku = () => { document.querySelector<HTMLButtonElement>('aside[aria-label^="連絡"] button[aria-label="閉じる"]')?.click(); };

/** 実際の画面で案内する段（components/Tour.tsx）。その人が開ける画面だけ・メニューの並びのまま */
function useTourSteps(groups: NavGroup[]): TourStep[] {
  const { me, kperms, pages, home, open } = usePerms();
  const kw = isKanawest(kperms);
  const levelOf = (gr: NavGroup, it: NavItem): { l: Level; note?: string } =>
    open(it.href) === 'kanawest' ? { l: 'view', note: '神奈川要員だけ' }
      : kperms[gr.module] !== 'none' ? { l: kperms[gr.module] }
      : pages.includes(it.href) ? { l: 'view', note: 'この画面だけ' } : { l: 'none' };
  const n = groups.reduce((a, g) => a + g.items.length, 0);
  const homeLabel = home === '/home/eigyo' ? 'ホーム営業' : home === '/home/jinji' ? 'ホーム人事' : 'ホーム';
  const out: TourStep[] = [
    { key: 'hello', section: 'はじめに', target: 'sidenav', title: `${me.name}さん、ようこそ`, text: `実際の画面を開きながら、あなたが使える画面（${groups.length}つの分類・${n}画面）を順に案内します。\n\n左がメニューです。ふだんはアイコンだけの細い帯で、マウスを合わせると広がります。上のピンで広げたまま固定できます。\n\n「次へ」か →キーで進み、「×」か Esc でいつでも終われます。あとから右上の「使い方」でもう一度見られます。` },
    { key: 'home', section: 'はじめに', path: home, target: 'home', showPage: true, title: 'ホーム', text: home === '/home/eigyo' ? '「ホーム」を押すと ホーム営業 が開きます。上のタブで「成約・売上」（担当営業ごとの成約数・売上・粗利）と「フィード」（担当の要員の動きをインスタのように）を切り替えます。' : home === '/home/jinji' ? '「ホーム」を押すと ホーム人事 が開きます。未経験の要員の動き（承諾・参画・面談・退社など）がインスタのように流れてきます。' : `「ホーム」を押すと ${homeLabel} が開きます。いま対応が要るものと件数をまとめて見られます。` },
  ];
  for (const it of NAV_HOME) if (open(it.href)) out.push({ key: it.href, section: 'はじめに', path: it.href, target: `nav-${it.href}`, showPage: true, title: it.label, entry: GUIDE[it.href] });
  groups.forEach((g, gi) => {
    const start = out.length;
    const lv = kw ? '見るだけ（神奈川要員だけ）' : kperms[g.module] !== 'none' ? `「${LEVELS.find((x) => x.key === kperms[g.module])!.label}」の権限` : '一部の画面だけ「見る」';
    out.push({ key: `grp-${g.module}`, section: g.label, target: `grp-${g.module}`, group: g.module, mod: g.module, title: g.label, text: `見出しを押すと、この分類の画面が下に開きます。あなたは${lv}で、${g.items.length}画面を使えます。\n\nこれから1つずつ実際に開きます。` });
    for (const it of g.items) out.push({ key: it.href, section: g.label, path: it.href, target: `nav-${it.href}`, showPage: true, group: g.module, mod: g.module, title: it.label, level: levelOf(g, it), entry: GUIDE[it.href], text: GUIDE[it.href] ? undefined : '説明はまだありません' });
    void gi;
    const end = out.length;
    for (let k = start; k < end; k++) out[k].skipTo = end;
  });
  out.push(
    { key: 'renraku', section: 'おわりに（連絡・見た目）', target: 'renraku', onEnter: closeRenraku, title: '連絡', text: 'どの画面でも右上の「連絡」から、LINE のチャットと配信を開けます。人事の画面＝インフォメーション、それ以外＝あおい の公式アカウントです。右上の数は 返事を待っている人の数です。' },
    { key: 'renraku-tabs', section: 'おわりに（連絡・見た目）', target: 'renraku-tabs', onEnter: openRenraku, title: '連絡の5つのタブ', text: '・チャット：1:1 とグループのトーク。相手を選ぶとやり取りが出て、下の欄から返信できます（送信は長押し＝間違えて送らないため）。📎で画像1枚・PDF1つを添付、吹き出しの横の ↩ で そのメッセージに返信（引用）。届いた画像はトークの中にそのまま出ます。1:1 は見出しの「紐付け／未紐付け」で 営業リストの氏名に結びつけられます（近い名前の候補・氏名で探す・紐付け解除）。一覧の「未紐付けのみ」で まだの人を集められます。相手の発言で止まっているトークは赤く「要対応」（1日以上は「◯日待ち」）。行の「✓ 対応済み」かトークの見出しで消せて（相手がまた送ると自動で戻る）、「要対応に戻す」で戻せます。「要対応のみ」で返していないトークを全部集められます。トークを開くと上のタブで「トーク／要員の情報」を切り替え＝その人の社員ページ・要員ページがその場に出ます（1:1 は紐付けた氏名で探す）\n・案件配信：営業リストから送った案件と、送った人数・日時・OK／NG\n・手動配信：案件文を貼ると合う人が絞られ、選んでまとめて送る。フリーワード・スキル・性別・稼働月で絞れて、「名前を貼り付けて選ぶ」で名前のコピペからまとめて選べます（1字違いは「もしかして」）。1人ずつ 駅・稼働・稼働可能日・通勤・シフト・夜勤・出張・並行数・希望職種・資格・スキシ・サマリ・経歴が出ます（サマリは「▾ 全文」で開く）\n・案内配信：件名・本文・回答ボタンつきで送って、進み具合を見る\n・日程回収：今週／来週の平日（祝日・過ぎた日は外す）を選ぶと 面談可能日を聞く決まった文面ができ、営業中のグループ（または営業中の 1:1）を選んで まとめて送れます。行ごとに本人の稼働月が出て、「稼働月で選ぶ」のチェックでその月の人をまとめて選べます。返ってきた日程は今のシステムが拾います\n\n手動配信・案内配信は「大きく開く」で広く使えます。' },
    { key: 'summary', section: 'おわりに（連絡・見た目）', target: 'summary', fallback: 'renraku-tabs', onEnter: openRenraku, title: '要約ボタン', text: 'チャットで相手（人・グループ）を選ぶと、右上に「要約」が出ます。押すと、直近のやり取りを AI が まとめます（ひとこと・起きたこと・待っていること・気をつけること）。\n\n横の「3日／7日」で、どこまでさかのぼってまとめるかを選べます。押した人にだけ出て、相手には届きません。人の詳細のチャットにも同じボタンがあります。' },
    { key: 'theme', section: 'おわりに（連絡・見た目）', target: 'theme', onEnter: closeRenraku, title: '見た目（着せ替え）', text: '右上の「見た目」で、画面の見た目を自分好みに変えられます。押すと選ぶ欄が開きます。' },
    { key: 'theme-menu', section: 'おわりに（連絡・見た目）', target: 'theme-list', fallback: 'theme', onEnter: openTheme, title: '着せ替えを選ぶ', text: '上の一覧から選ぶと、すぐ画面全体の雰囲気が変わります（深い宝石色・墨と金・白黒＋色は点だけ・夜のダーク など）。\n\n分類ごとの色（人事＝青・営業＝黄 など）は、どれを選んでも そのまま残ります。何度でも選び直せます。' },
    { key: 'chat-colors', section: 'おわりに（連絡・見た目）', target: 'chat-colors', fallback: 'theme', onEnter: openTheme, title: 'チャットの色', text: '下の「チャットの色」で、吹き出しの色を こちら（送った側）と相手 で別々に選べます。丸を押すか、「＋」で好きな色。見本の吹き出しで すぐ見え方が分かります。\n\n字の色（白か黒）は自動で読みやすい方になります。あなたの分として保存するので どの端末でも同じ色、「元の色に戻す」でいつでも戻せます。' },
    ...(open('/settings') ? [{ key: 'settings', section: 'おわりに（連絡・見た目）', path: '/settings', target: 'nav-/settings', showPage: true, onEnter: closeTheme, title: '設定（分類ごとの色）', text: '左下の「設定」（管理者だけ）では、見た目の着せ替えに加えて、分類ごとの色（人事管理・営業 など）を選べます。ほかの分類が使っている色は選べません（色がかぶらないように）。「最初の色に戻す」で元に戻せます。\n\nこの色はこの端末に覚えます。' } as TourStep] : []),
    { key: 'guide', section: 'おわりに（連絡・見た目）', target: 'guide', onEnter: closeTheme, title: 'このガイド', text: 'これで終わりです。右上の「使い方」から、いつでもこの案内をもう一度見られます。吹き出しの「一覧で見る」で、全部の画面の説明を一覧でも見られます。\n\nほかにも：人の名前を押すとその人の情報が上に出る・右クリックで画面を移る／並べる・片づけたあとは「取り消す」で戻せます。' },
  );
  return out;
}

function GuideDialog({ groups, onClose, onTour }: { groups: NavGroup[]; onClose: () => void; onTour: (key: string) => void }) {
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
            <>
              <button type="button" onClick={() => onTour('hello')} className="btn mb-4 bg-sumi text-white"><Play size={14} />実際の画面で案内をはじめる（最初から）</button>
              <Intro home={home} homeItems={homeItems} groups={groups} kanawest={isKanawest(kperms)} />
            </>
          ) : g ? (
            <div className="flex flex-col gap-3">
              <h3 className="flex items-center gap-2 text-md font-bold"><i className="size-2.5 rounded-full" style={{ background: `var(--c-${g.module})` }} />{g.label}
                <span className="text-sm font-normal text-muted">{isKanawest(kperms) ? '見るだけ（神奈川要員だけ）' : kperms[g.module] !== 'none' ? `「${levelText(kperms[g.module])}」の権限` : '一部の画面だけ「見る」'}</span>
                <button type="button" onClick={() => onTour(`grp-${g.module}`)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-semibold text-white" style={{ background: `var(--c-${g.module})`, color: `var(--o-${g.module})` }}><Play size={13} />この分類を実際の画面で案内</button>
              </h3>
              {g.items.map((it, n) => <ItemCard key={it.href} it={it} mod={g.module} n={n} {...levelOf(g, it)} onGo={onClose} onTour={() => onTour(it.href)} />)}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-line px-5 py-3">
        <span className="text-sm text-faint">{i + 1} / {secs.length}</span>
        {i > 0 && <button type="button" onClick={() => setSec(secs[i - 1].key)} className="btn-secondary ml-auto">戻る</button>}
        {i < secs.length - 1
          ? <button type="button" onClick={() => setSec(secs[i + 1].key)} className={`btn ${i > 0 ? '' : 'ml-auto'} bg-sumi text-white`}>次へ（{secs[i + 1].label}）<ArrowRight size={15} /></button>
          : <button type="button" onClick={() => onTour('hello')} className="btn bg-sumi text-white"><Play size={14} />実際の画面で案内をはじめる</button>}
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
          <li>携帯では帯を出さず、左上の <b className="text-ink">≡</b> を押すとメニューが左から出ます（画面を選ぶか、外を押すと閉じます）。名前とログアウトはメニューのいちばん下です（PC は 右上と 左メニューのいちばん下）。</li>
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
          <li>右上の「連絡」：チャット・配信・手動配信（人事の画面＝インフォメーション、それ以外＝あおい）。送信は長押しです。チャットは📎で画像・PDF を添付、吹き出しの横の ↩ で返信（引用）できます。1:1 は見出しの「紐付け」で営業リストの氏名に結びつけます（「未紐付けのみ」でまだの人を集める）。相手の発言で止まっているトークは「要対応」（✓ 対応済み／要対応に戻す）。トークを開くと「要員の情報」タブでその人の情報を見られます。</li>
          <li>右クリック：画面の一覧から移る・スプリット（2〜4画面を並べる）。</li>
          <li>チャットの「要約」：相手（人・グループ）を選ぶと右上に出ます。直近のやり取りを AI がまとめます（ひとこと・起きたこと・待っていること・気をつけること）。横の「3日／7日」でさかのぼる日数を選べます。押した人にだけ出ます。</li>
          <li>人の名前を押すと、その人の情報が画面の上に出ます。</li>
          <li>画面は開いたままでも自動で新しくなります（1分ごと。だれかが書き込んだら すぐ・別のタブで操作したときも）。しばらく触らないと止まり、触るとすぐ読み直します。</li>
          <li>何かを片づけると下に知らせが出て、「取り消す」で戻せます。</li>
          <li>右上の「見た目」：画面の着せ替え（8種類・分類の色はそのまま）と、<b className="text-ink">チャットの色</b>（こちら＝送った側・相手 の吹き出しの色）を選べます。好きな色は「＋」から。どのチャット（連絡・人の詳細・人財管理のチャット）にも効き、あなたの分として保存するので どの端末でも同じ色です。「元の色に戻す」でいつでも戻せます。</li>
          <li>このガイドは右上の「使い方」（携帯では ? のボタン）からいつでも開けます。</li>
        </ul>
      </section>
    </div>
  );
}

function ItemCard({ it, mod, n, l, note, onGo, onTour }: { it: NavItem; mod: string; n: number; l: Level; note?: string; onGo: () => void; onTour: () => void }) {
  const e = GUIDE[it.href];
  return (
    <article className="mo-fade-up rounded-xl border border-line bg-surface p-4" style={{ ['--i' as string]: Math.min(n, 12) }}>
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-md">{it.label}</b>
        {l !== 'none' && <span className="chip" style={{ background: `var(--c-${mod})`, color: `var(--o-${mod})` }}>{levelText(l)}{note ? `・${note}` : ''}</span>}
        <button type="button" onClick={onTour} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-field px-2 py-0.5 text-sm font-semibold hover:bg-soft" title="ここから実際の画面で案内する"><Play size={12} />ここから案内</button>
        <Link href={it.href} onClick={onGo} className="inline-flex items-center gap-1 text-sm font-semibold hover:underline">開く<ArrowRight size={14} /></Link>
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
