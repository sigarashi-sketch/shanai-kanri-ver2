'use client';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, Search } from 'lucide-react';
import { QUESTS, WORLDS } from '@/lib/sy/kyouiku-lessons';
import { useRoster } from '@/components/sy/useRoster';
import { Avatar, Chip, PageHeader, Tabs, btnPrimary, inputCls } from '@/components/sy/ui';
import KyouikuStats from './KyouikuStats';
import KyouikuData from './KyouikuData';
import CcnaAdmin from './ccna/CcnaAdmin';
import CourseAdmin from './course/CourseAdmin';
import ReleaseAdmin from './ReleaseAdmin';
import KyouikuViews from './KyouikuViews';
import { useKept } from '@/components/sy/compat';

// 教育コンテンツ（内勤向けの管理画面）。
//   ・自分で試す … 自分用の受講URL（u:メール）で、要員と同じ画面を通しで試す（まず内勤でテスト・2026-10-02 shoya）
//   ・受講URLを渡す … 稼働中の人を選んで受講URLをコピー → チャットで本人に送る（PCからはリッチメニューが開けないのでURLで渡す）
//   ・おためし（2026-10-02 shoya → 2026-10-09「参画決定になるまで」）… 参画決定前の人に何を開くかは タブ「解放」で決める（ReleaseAdmin.tsx）。参画決定になると自動で全部開く（判定はサーバ・いけどんのプロパーリスト）。
//     「営業中（おためし）」で 営業中の人（プロパーリストだけの人・候補者も）を出して URL を渡せる
//   ・受講データ（最初のタブ） … 受講した人の一覧と進み具合。manager が進捗を管理する（KyouikuData.tsx）
//   ・キッティング（タブ） … 講座「キッティングから情シスへ」＝提出物のレビュー・進捗マトリクス・停滞・提案候補・公開の切り替え（course/CourseAdmin.tsx・2026-10-09）
//   ・練習用スプシは本人が「たたかう」を選んだ時にサーバが1冊作って共有する（受講者の準備なし・2026-10-02 shoya）。
//     本人の Google アドレスをここで入れておくと、その人だけに共有する。空なら「リンクを知っている人は編集可」で共有（アカウント不要）
interface Learner { key: string; name: string; done: number; total: number; last: string; cleared: string[] }

export default function KyouikuAdmin() {
  const [d, setD] = useState<{ myUrl: string; sheetOn: boolean; learners: Learner[]; total: number; sheets: Record<string, { email: string; made: boolean }>; levels: Record<string, { level: string; start: string }>; staff: { email: string; name: string }[]; trial?: string[] } | null>(null);
  const [err, setErr] = useState('');
  const { members, proper } = useRoster();
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'active' | 'leader' | 'trial' | 'all'>('active');
  const [copied, setCopied] = useState('');
  const [tab, setTab] = useKept<'data' | 'stats' | 'views' | 'send' | 'release' | 'ccna' | 'kitting'>('tab', 'data');   // 更新しても戻す（lib/keep.ts）
  const [mail, setMail] = useState<Record<string, string>>({});   // 入力中のアドレス（key → 文字）
  const [saved, setSaved] = useState('');
  const [sq, setSq] = useState('');          // 内勤の絞り込み・手入力のメール

  useEffect(() => {
    fetch('/api/sy/s/kyouiku').then(async (r) => { const j = await r.json(); if (!r.ok) setErr(j.error || '読み込めませんでした'); else setD(j); });
  }, []);

  const trial = useMemo(() => new Set(d?.trial || []), [d]);
  const isTrial = (m: { key: string; kind?: string }) => trial.has(m.key) || m.kind === 'candidate';
  const list = useMemo(() => {
    const ms = members || [];
    const rows: { key: string; kind?: string; name: string; kana: string; status: string; company?: string; leader?: boolean }[] =
      // リーダー: コミュニティのリーダー（稼働中も 待機も。退社は 出さない）。2026-10-02 shoya「リーダーだけ絞り込めるように。稼働中とか待機中とか含めて」
      scope === 'leader' ? ms.filter((m) => m.kind === 'employee' && m.leader && m.status !== '退社')
      : scope === 'active' ? ms.filter((m) => m.kind === 'employee' && m.status === '稼働中')
      : scope === 'all' ? ms.filter((m) => m.kind === 'employee')
      // 営業中: 名簿に居て プロパーリストで営業中の人 ＋ 候補者（辞退・営業止めを除く）＋ プロパーリストだけに居る営業中の人
      : [...ms.filter((m) => (m.kind === 'employee' && trial.has(m.key)) || (m.kind === 'candidate' && !['辞退', '営業止め'].includes(m.status))), ...proper.filter((x) => x.from === 'proper' && x.status === '営業中')];
    return rows.filter((m) => !q || m.name.includes(q) || m.kana.includes(q)).slice(0, 50);
  }, [members, proper, q, scope, trial]);
  const progOf = useMemo(() => new Map((d?.learners || []).map((l) => [l.key, l])), [d]);

  // 内勤の一覧（名前かメールで絞る）。一覧に無い人は、メールをそのまま入れて発行できる
  const staff = useMemo(() => (d?.staff || []).filter((x) => !sq || x.name.includes(sq) || x.email.includes(sq.toLowerCase())).slice(0, 80), [d, sq]);
  const typedMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sq.trim()) && !(d?.staff || []).some((x) => x.email === sq.trim().toLowerCase()) ? sq.trim().toLowerCase() : '';

  async function copyUrl(key: string) {
    const r = await fetch('/api/sy/s/kyouiku', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
    const j = await r.json(); if (!r.ok) { setErr(j.error); return; }
    await navigator.clipboard?.writeText(`bdsh（スプシ講座）の受講ページです。PCで開いて、動画を見てから練習してみてください。\n${j.url}`);
    setCopied(key); setTimeout(() => setCopied(''), 2500);
  }

  // 本人の Google アドレスを保存（空で消す）。スプシが作成済みなら、その場で本人にも共有される
  async function saveMail(key: string) {
    const v = mail[key]; if (v === undefined || v.trim() === (d?.sheets[key]?.email || '')) return;
    const r = await fetch('/api/sy/s/kyouiku', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, email: v }) });
    const j = await r.json(); if (!r.ok) { setErr(j.error); return; }
    setErr(j.warn || '');
    setD((x) => x && { ...x, sheets: { ...x.sheets, [key]: { email: j.email, made: !!x.sheets[key]?.made } } });
    setMail((m) => { const n = { ...m }; delete n[key]; return n; });
    setSaved(key); setTimeout(() => setSaved(''), 2500);
  }

  return (
    <div>
      <PageHeader title="bdsh" sub={`教育コンテンツ（スプシ講座）　${WORLDS.length}ワールド・${QUESTS.length}クエスト（キーボードとセルの基本 → スプシの基本 → 実践 → 現場編）`} />
      <Tabs value={tab} onChange={setTab} items={[['data', '受講データ'], ['stats', '集計'], ['views', 'クリック数'], ['send', '配る・コンテンツ'], ['release', '解放'], ['ccna', 'CCNA'], ['kitting', 'キッティング']]} />
      {tab === 'data' ? <KyouikuData members={members} /> : tab === 'stats' ? <KyouikuStats members={members} /> : tab === 'views' ? <KyouikuViews /> : tab === 'release' ? <ReleaseAdmin /> : tab === 'ccna' ? <CcnaAdmin members={members} staff={d?.staff || []} /> : tab === 'kitting' ? <CourseAdmin members={members} staff={d?.staff || []} /> : (
        <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
    {err && <p className="mb-4 rounded-lg bg-ig-hover p-3 text-sm text-ig-danger">{err}</p>}
        {d && !d.sheetOn && (
          <p className="mb-4 flex items-start gap-2 rounded-lg border border-ig-border p-3 text-sm"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-ig-warn" />
            練習用スプシを自動で作るための Google の鍵がまだ設定されていません。設定するまで、受講ページのスプシは「じゅんびちゅう」と出ます（動画は見られます）。</p>
        )}

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-ig-border p-4">
            <h2 className="text-[15px] font-bold">自分で試す</h2>
            <p className="mt-1 text-sm text-ig-muted">要員に渡すのと同じ受講ページを、自分用のURLで通しで試せます。記録は「自分（メール）」として残ります。</p>
            <a href={d?.myUrl || '#'} target="_blank" rel="noopener" className={`${btnPrimary} mt-3 inline-flex items-center gap-1.5`}>受講ページを開く<ExternalLink size={14} /></a>
          </div>
          <div className="rounded-xl border border-ig-border p-4">
            <h2 className="text-[15px] font-bold">クエスト</h2>
            <div className="mt-2 max-h-56 space-y-2 overflow-y-auto text-sm">
              {WORLDS.map((w) => (
                <div key={w.id}>
                  <div className="text-xs font-semibold text-ig-muted">{w.title}</div>
                  <ol className="mt-0.5 space-y-0.5">{w.quests.map((x) => <li key={x.id}><span className="text-ig-muted">{x.no}</span>　{x.title}</li>)}</ol>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-[15px] font-bold">要員に渡す</h2>
          <p className="mt-1 text-sm text-ig-muted">「URLをコピー」で案内文つきのURLがコピーされます。チャットで本人に送ってください（本人ごとに違うURLです）。練習用スプシは本人が始めた時に自動で用意されます。Googleアドレスは任意で、入れるとその人だけに共有します（空ならリンク共有）。</p>
          <p className="mt-1 text-sm text-ig-muted">参画決定前の人は「おためし」で、タブ「解放」で決めたコースだけ開きます。いけどんで参画決定になると、同じURLのまま全部開きます。</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="relative"><Search size={16} className="absolute left-2.5 top-2.5 text-ig-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前で探す" className={`${inputCls} pl-8`} /></label>
            {([['active', '稼働中'], ['leader', 'リーダー'], ['trial', '営業中（おためし）'], ['all', '全員']] as const).map(([k, l]) => <Chip key={k} on={scope === k} onClick={() => setScope(k)}>{l}</Chip>)}
          </div>
          <ul className="mt-3 divide-y divide-ig-divider rounded-xl border border-ig-border">
            {members === null && <li className="p-4 text-sm text-ig-muted">名簿を読み込み中…</li>}
            {members && list.length === 0 && <li className="p-4 text-sm text-ig-muted">該当する人がいません</li>}
            {list.map((m) => {
              const p = progOf.get(m.key); const sh = d?.sheets[m.key]; const lv = d?.levels[m.key];
              return (
                <li key={m.key} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar name={m.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5"><span className="truncate text-sm font-semibold">{m.name}</span>{m.leader && <span className="shrink-0 rounded bg-ig-divider px-1.5 py-px text-[10px] font-semibold">リーダー</span>}{isTrial(m) && <span className="shrink-0 rounded bg-ig-hover px-1.5 py-px text-[10px] font-semibold text-ig-warn">おためし</span>}</div>
                    <div className="truncate text-xs text-ig-muted">{m.status}{m.company ? `・${m.company}` : ''}{p ? `・${p.done}/${p.total} ステップ` : lv ? '・アンケート済み' : '・未受講'}{lv ? `・レベル「${lv.level}」（${lv.start}から）` : ''}{sh?.made ? '・スプシ作成済み' : ''}</div>
                  </div>
                  <input type="email" inputMode="email" aria-label={`${m.name} の Googleアドレス`} placeholder="Googleアドレス（任意）"
                    value={mail[m.key] ?? sh?.email ?? ''} onChange={(e) => setMail((x) => ({ ...x, [m.key]: e.target.value }))}
                    onBlur={() => saveMail(m.key)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    className={`${inputCls} hidden w-56 text-xs md:block`} />
                  {saved === m.key && <Check size={14} className="shrink-0 text-ig-ok" />}
                  <button type="button" onClick={() => copyUrl(m.key)} className="inline-flex items-center gap-1 rounded-lg bg-ig-hover px-3 py-1.5 text-xs font-semibold hover:bg-ig-border">
                    {copied === m.key ? <Check size={14} /> : <Copy size={14} />}{copied === m.key ? 'コピーしました' : 'URLをコピー'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-[15px] font-bold">内勤に渡す</h2>
          <p className="mt-1 text-sm text-ig-muted">内勤のメンバーにも同じ講座を配れます。練習用スプシは、その人のメール（Google アカウント）に共有されます。一覧に無い人は、メールアドレスを入れると発行できます。</p>
          <label className="relative mt-3 inline-block"><Search size={16} className="absolute left-2.5 top-2.5 text-ig-muted" />
            <input value={sq} onChange={(e) => setSq(e.target.value)} placeholder="名前・メールで探す／メールを入れて発行" className={`${inputCls} w-80 max-w-full pl-8`} /></label>
          <ul className="mt-3 divide-y divide-ig-divider rounded-xl border border-ig-border">
            {!d && <li className="p-4 text-sm text-ig-muted">読み込み中…</li>}
            {d && staff.length === 0 && !typedMail && <li className="p-4 text-sm text-ig-muted">{sq ? '該当する人がいません（メールアドレスを最後まで入れると発行できます）' : '内勤の一覧を取得できませんでした。メールアドレスを入れると発行できます'}</li>}
            {[...(typedMail ? [{ email: typedMail, name: '' }] : []), ...staff].map((x) => {
              const key = 'u:' + x.email; const p = progOf.get(key); const lv = d?.levels[key];
              return (
                <li key={key} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar name={x.name || x.email} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{x.name || x.email.split('@')[0]}</div>
                    <div className="truncate text-xs text-ig-muted">{x.email}{p ? `・${p.done}/${p.total} ステップ` : lv ? '・アンケート済み' : '・未受講'}{lv ? `・レベル「${lv.level}」` : ''}</div>
                  </div>
                  <button type="button" onClick={() => copyUrl(key)} className="inline-flex items-center gap-1 rounded-lg bg-ig-hover px-3 py-1.5 text-xs font-semibold hover:bg-ig-border">
                    {copied === key ? <Check size={14} /> : <Copy size={14} />}{copied === key ? 'コピーしました' : 'URLをコピー'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        </div>
      )}
    </div>
  );
}
