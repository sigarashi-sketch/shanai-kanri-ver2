'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowLeft, ArrowUp, Check, CirclePlus, Copy, Download, Eye, GripHorizontal, Link2, RefreshCw, Trash2, X } from 'lucide-react';
import { fx } from '@/components/sy/compat';
import {
  DEFAULT_CONFIRM, ENQ_HOST, LIMITS, Q_TYPES, DESIGNS, answerText, answerUrl, hasOptions, jst, newId, newQuestion, optionsOf, scaleOf, designOf,
  type EnqForm, type EnqResponse, type QType, type Question,
} from '@/lib/sy/enquete-types';
import { copyText, enqOrigin } from '@/components/sy/enquete/EnqueteList';
import { useKept } from '@/components/sy/compat';

// フォームの編集画面（質問／回答／設定 の3タブ・変えたら勝手に保存・「回答URL」でリンクを出す）。
//   見た目は DESIGN.md（白＋細い線＋青）。2026-10-09 shoya「Googleフォームすぎる」で 色の帯・灰色の入力欄・浮いた道具箱をやめた
//   答えるページのデザインは 設定タブで10種類から選ぶ（lib/enquete-types.ts DESIGNS）。絵文字は使わない
type Tab = 'q' | 'r' | 's';
const card = 'rounded-xl border border-[#dbdbdb] bg-white';
const line = 'w-full border-b border-transparent bg-transparent py-1 outline-none hover:border-[#dbdbdb] focus:border-b-2 focus:border-[var(--enq)]';
const iconBtn = 'rounded-full p-2 text-[#737373] hover:bg-[#f2f2f2] disabled:opacity-30';

const noSub = () => () => {};

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      {label}
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
        className="relative h-3.5 w-9 rounded-full transition-colors" style={{ background: on ? 'color-mix(in srgb, var(--enq) 45%, white)' : '#b9b9b9' }}>
        <span className="absolute -top-[3px] h-5 w-5 rounded-full shadow transition-all" style={{ left: on ? 16 : 0, background: on ? 'var(--enq)' : '#fff', border: on ? 'none' : '1px solid #dbdbdb' }} />
      </button>
    </label>
  );
}

export default function EnqueteEditor({ initial, initialResponses }: { initial: EnqForm; initialResponses: EnqResponse[] }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [tab, setTab] = useKept<Tab>('tab', 'q');   // 更新しても戻す（lib/keep.ts）
  const [active, setActive] = useState<string>(initial.questions[0]?.id || '');
  const [save, setSave] = useState<'saved' | 'saving' | 'error'>('saved');
  const [responses, setResponses] = useState(initialResponses);
  const [sendOpen, setSendOpen] = useState(false);
  const [dragId, setDragId] = useState('');
  const t = { main: '#0095f6', bg: '#fafafa' };   // 編集画面の色は固定（--enq）
  const design = designOf(form.settings.design);
  // 手元（localhost）では その場のホスト、本番では ENQ_HOST。サーバの描画と食い違わないよう 画面が出てから決める
  const origin = useSyncExternalStore(noSub, enqOrigin, () => ENQ_HOST);
  const url = answerUrl(form.id, origin);

  // 変えたら 0.7秒後に勝手に保存（Googleフォームと同じ）。画面を離れるときに 残りがあれば その場で送る
  const latest = useRef(form); const pending = useRef(false); const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(async (keepalive = false) => {
    if (!pending.current) return;
    pending.current = false; if (timer.current) clearTimeout(timer.current);
    const f = latest.current;
    try {
      const r = await fetch('/api/sy/s/enquete/' + f.id, {
        method: 'PUT', keepalive, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: f.title, description: f.description, questions: f.questions, settings: f.settings, accepting: f.accepting }),
      });
      if (!r.ok) throw new Error();
      if (!pending.current) setSave('saved');
    } catch { setSave('error'); }
  }, []);
  const change = useCallback((fn: (f: EnqForm) => EnqForm) => {
    setForm((p) => { const n = fn(p); latest.current = n; return n; });
    pending.current = true; setSave('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), 700);
  }, [flush]);
  useEffect(() => {
    const bye = () => { flush(true); };
    window.addEventListener('pagehide', bye);
    return () => { window.removeEventListener('pagehide', bye); bye(); };
  }, [flush]);

  const setQs = (fn: (qs: Question[]) => Question[]) => change((f) => ({ ...f, questions: fn(f.questions) }));
  const updQ = (id: string, patch: Partial<Question>) => setQs((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  function addQ() {
    if (form.questions.length >= LIMITS.questions) return fx.toast(`質問は ${LIMITS.questions}個までです`, 'err');
    const q = newQuestion('radio');
    setQs((qs) => { const i = qs.findIndex((x) => x.id === active); const n = [...qs]; n.splice(i < 0 ? qs.length : i + 1, 0, q); return n; });
    setActive(q.id);
    setTimeout(() => document.getElementById('eq-' + q.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }
  function dupQ(q: Question) {
    const c = { ...q, id: newId(), options: [...q.options] };
    setQs((qs) => { const i = qs.findIndex((x) => x.id === q.id); const n = [...qs]; n.splice(i + 1, 0, c); return n; });
    setActive(c.id);
  }
  function delQ(q: Question) {
    const i = form.questions.findIndex((x) => x.id === q.id);
    setQs((qs) => qs.filter((x) => x.id !== q.id));
    setActive(form.questions[i + 1]?.id || form.questions[i - 1]?.id || '');
  }
  const moveQ = (id: string, to: number) => setQs((qs) => {
    const i = qs.findIndex((x) => x.id === id); if (i < 0 || to < 0 || to >= qs.length || i === to) return qs;
    const n = [...qs]; const [x] = n.splice(i, 1); n.splice(to, 0, x); return n;
  });

  async function reload() {
    const r = await fetch('/api/sy/s/enquete/' + form.id); const j = await r.json().catch(() => ({}));
    if (r.ok) { setResponses(j.responses || []); fx.toast('回答を読み直しました'); } else fx.toast(j.error || '読めませんでした', 'err');
  }
  async function delResponse(id: string) {
    if (!confirm('この回答を削除しますか？（元に戻せません）')) return;
    const r = await fetch('/api/sy/s/enquete/' + form.id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'deleteResponse', responseId: id }) });
    if (r.ok) { setResponses((p) => p.filter((x) => x.id !== id)); fx.toast('削除しました'); } else fx.toast('削除できませんでした', 'err');
  }
  async function delForm() {
    if (!confirm(`「${form.title || '無題のフォーム'}」を削除しますか？\n回答URLは開けなくなります。`)) return;
    const r = await fetch('/api/sy/s/enquete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: form.id }) });
    if (r.ok) { pending.current = false; router.push('/jinzai/enquete'); } else fx.toast('削除できませんでした', 'err');
  }

  return (
    <div className="min-h-screen pb-24 text-[#000]" style={{ background: t.bg, ['--enq' as string]: t.main }}>
      <div className="sticky top-0 z-20 border-b border-[#dbdbdb] bg-white">
        <div className="flex items-center gap-2 px-3 pt-2 md:px-5">
          <Link href="/jinzai/enquete" title="フォームの一覧へ" className={iconBtn}><ArrowLeft size={20} strokeWidth={1.75} /></Link>
          <div className="min-w-0 flex-1 truncate text-base md:text-lg">{form.title || '無題のフォーム'}</div>
          <span className={`hidden shrink-0 text-xs sm:inline ${save === 'error' ? 'text-[#ed4956]' : 'text-[#737373]'}`}>
            {save === 'saving' ? '保存中…' : save === 'error' ? '保存できませんでした' : '変更内容をすべて保存しました'}
          </span>
          <a href={url} target="_blank" rel="noreferrer" title="プレビュー（回答ページを開く）" onClick={() => flush()} className={iconBtn}><Eye size={20} strokeWidth={1.75} /></a>
          <button type="button" onClick={() => { flush(); setSendOpen(true); }} className="flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold text-white" style={{ background: t.main }}><Link2 size={16} strokeWidth={2} />回答URL</button>
        </div>
        <div className="flex justify-center gap-10">
          {([['q', '質問'], ['r', '回答'], ['s', '設定']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px flex items-center gap-1.5 border-b px-2 pb-2.5 pt-3 text-xs font-semibold tracking-wider ${tab === k ? 'border-black' : 'border-transparent text-[#737373]'}`}>
              {l}
              {k === 'r' && responses.length > 0 && <span className="rounded-full px-1.5 text-xs text-white" style={{ background: t.main }}>{responses.length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-[720px] space-y-3 px-3 pt-4">
          {tab === 'q' && (
            <>
              <div className={card} onClick={() => setActive('')}>
                <div className="px-6 py-5">
                  <input value={form.title} maxLength={LIMITS.title} placeholder="フォームのタイトル" onFocus={(e) => { if (form.title === '無題のフォーム') e.target.select(); }} onChange={(e) => change((f) => ({ ...f, title: e.target.value }))} className={`${line} text-2xl font-bold`} />
                  <textarea value={form.description} maxLength={LIMITS.text} rows={1} placeholder="フォームの説明" onChange={(e) => change((f) => ({ ...f, description: e.target.value }))} className={`${line} mt-2 resize-none text-sm [field-sizing:content]`} />
                </div>
              </div>
              {form.questions.map((q, i) => (
                <div key={q.id} id={'eq-' + q.id} onClick={() => setActive(q.id)}
                  onDragOver={(e) => { if (dragId) { e.preventDefault(); if (dragId !== q.id) moveQ(dragId, i); } }} onDrop={() => setDragId('')}
                  className={`${card} relative overflow-hidden ${dragId === q.id ? 'opacity-50' : ''} ${active === q.id ? '!border-black' : 'cursor-pointer'}`}>
                  {active === q.id ? (
                    <QuestionEdit q={q} index={i} total={form.questions.length} upd={(p) => updQ(q.id, p)} dup={() => dupQ(q)} del={() => delQ(q)} move={(to) => moveQ(q.id, to)}
                      onDrag={(e) => { setDragId(q.id); e.dataTransfer.effectAllowed = 'move'; const el = document.getElementById('eq-' + q.id); if (el) e.dataTransfer.setDragImage(el, el.clientWidth / 2, 12); }} onDragEnd={() => setDragId('')} />
                  ) : <QuestionPreview q={q} />}
                </div>
              ))}
              {!form.questions.length && <div className={`${card} p-6 text-center text-sm text-[#737373]`}>質問がありません。「質問を追加」から足してください。</div>}
              <button type="button" onClick={addQ} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#c7c7c7] bg-white py-3.5 text-sm font-semibold text-[#737373] hover:border-black hover:text-black"><CirclePlus size={20} strokeWidth={1.75} />質問を追加</button>
            </>
          )}
          {tab === 'r' && <Responses form={form} responses={responses} reload={reload} del={delResponse} setAccepting={(v) => change((f) => ({ ...f, accepting: v }))} />}
          {tab === 's' && (
            <>
              <div className={`${card} px-6 py-5`}>
                <div className="text-sm font-bold">回答ページのデザイン</div>
                <div className="text-xs text-[#737373]">答える人に見える画面の見た目です（いまは「{design.label}」）。目のアイコンから実物を確かめられます</div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                  {DESIGNS.map((d, i) => (
                    <button key={d.key} type="button" aria-pressed={d.key === design.key} onClick={() => change((f) => ({ ...f, settings: { ...f.settings, design: d.key } }))}
                      className={`ig-press overflow-hidden rounded-lg border text-left ${d.key === design.key ? 'border-black ring-1 ring-black' : 'border-[#dbdbdb] hover:border-[#737373]'}`}>
                      <div className="flex h-20 flex-col justify-center gap-1.5 px-3" style={{ background: d.swatch[0] }}>
                        <span className="h-2 w-3/4 rounded-full" style={{ background: d.swatch[2], outline: '1px solid rgba(128,128,128,.25)' }} />
                        <span className="h-2 w-1/2 rounded-full" style={{ background: d.swatch[2], outline: '1px solid rgba(128,128,128,.25)' }} />
                        <span className="mt-1 h-3.5 w-12 rounded-full" style={{ background: d.swatch[1] }} />
                      </div>
                      <div className="flex items-start gap-1.5 border-t border-[#efefef] bg-white px-2 py-1.5">
                        <span className="text-xs text-[#737373]">{i + 1}</span>
                        <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{d.label}</span><span className="block truncate text-[11px] text-[#737373]">{d.sub}</span></span>
                        {d.key === design.key && <Check size={14} strokeWidth={2.5} />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className={`${card} divide-y divide-[#efefef]`}>
                <div className="flex items-center justify-between gap-4 px-6 py-4">
                  <div><div className="text-sm">回答を受け付ける</div><div className="text-xs text-[#737373]">オフにすると 回答URLを開いても答えられなくなります</div></div>
                  <Switch on={form.accepting} onChange={(v) => change((f) => ({ ...f, accepting: v }))} label="" />
                </div>
                <div className="px-6 py-4">
                  <div className="text-sm">確認メッセージ</div><div className="text-xs text-[#737373]">送信したあとに出る文</div>
                  <input value={form.settings.confirm} maxLength={LIMITS.short} placeholder={DEFAULT_CONFIRM} onChange={(e) => change((f) => ({ ...f, settings: { ...f.settings, confirm: e.target.value } }))} className={`${line} mt-2 !border-[#dbdbdb] text-sm`} />
                </div>
                <div className="flex items-center justify-between gap-4 px-6 py-4">
                  <div><div className="text-sm">「別の回答を送信」のリンクを表示</div><div className="text-xs text-[#737373]">同じ人が 続けてもう1回 答えられるようにする</div></div>
                  <Switch on={form.settings.again} onChange={(v) => change((f) => ({ ...f, settings: { ...f.settings, again: v } }))} label="" />
                </div>
              </div>
              <div className={`${card} flex items-center justify-between gap-4 px-6 py-4`}>
                <div><div className="text-sm">フォームを削除</div><div className="text-xs text-[#737373]">回答URLは開けなくなります</div></div>
                <button type="button" onClick={delForm} className="rounded border border-[#dbdbdb] px-4 py-1.5 text-sm font-medium text-[#ed4956] hover:bg-[#fdecee]">削除</button>
              </div>
            </>
          )}
      </div>

      {sendOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSendOpen(false)}>
          <div className="ig-pop w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="text-base font-bold">回答URL</h2><button type="button" aria-label="閉じる" onClick={() => setSendOpen(false)} className={iconBtn}><X size={20} strokeWidth={1.75} /></button></div>
            <input readOnly value={url} onFocus={(e) => e.target.select()} className="mt-4 w-full rounded-lg border border-[#dbdbdb] bg-[#fafafa] px-3 py-2 text-sm outline-none" />
            <p className="mt-2 text-xs text-[#737373]">このURLを知っている人は だれでも答えられます（ログイン不要）。チャットや配信に貼って送ってください。</p>
            {!form.accepting && <p className="mt-2 text-xs text-[#ed4956]">いまは 回答の受け付けを止めています（「回答」タブでオンにできます）。</p>}
            <div className="mt-5 flex justify-end gap-2">
              <a href={url} target="_blank" rel="noreferrer" className="rounded px-4 py-2 text-sm font-medium text-[#737373] hover:bg-[#f2f2f2]">開く</a>
              <button type="button" onClick={() => copyText(url, '回答URLをコピーしました')} className="rounded-lg px-5 py-1.5 text-sm font-semibold text-white" style={{ background: t.main }}>コピー</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 選んでいない質問＝答える人に見える形を 薄く出す
function QuestionPreview({ q }: { q: Question }) {
  const mark = (multi: boolean) => <span className={`h-[18px] w-[18px] shrink-0 border-2 border-[#c7c7c7] ${multi ? 'rounded-sm' : 'rounded-full'}`} />;
  return (
    <div className="p-6">
      <div className="break-words text-base">{q.title || '質問'}{q.required && <span className="ml-1 text-[#ed4956]">*</span>}</div>
      {q.help && <div className="mt-1 break-words text-xs text-[#737373]">{q.help}</div>}
      <div className="mt-3 space-y-2 text-sm text-[#737373]">
        {(q.type === 'short' || q.type === 'long') && <div className={`border-b border-dotted border-[#c7c7c7] pb-1 ${q.type === 'short' ? 'w-1/2' : ''}`}>{q.type === 'short' ? '記述式テキスト（短文回答）' : '記述式テキスト（長文回答）'}</div>}
        {(q.type === 'radio' || q.type === 'checkbox') && [...optionsOf(q), ...(q.other ? ['その他…'] : [])].map((o) => <div key={o} className="flex items-center gap-3 text-[#000]">{mark(q.type === 'checkbox')}<span className="break-words">{o}</span></div>)}
        {q.type === 'select' && optionsOf(q).map((o, i) => <div key={o} className="text-[#000]">{i + 1}. {o}</div>)}
        {q.type === 'scale' && <div className="flex items-end gap-4">{q.minLabel && <span>{q.minLabel}</span>}{scaleOf(q).map((n) => <span key={n} className="flex flex-col items-center gap-2"><span>{n}</span>{mark(false)}</span>)}{q.maxLabel && <span>{q.maxLabel}</span>}</div>}
        {q.type === 'date' && <div className="w-40 border-b border-dotted border-[#c7c7c7] pb-1">年 / 月 / 日</div>}
        {q.type === 'time' && <div className="w-24 border-b border-dotted border-[#c7c7c7] pb-1">時刻</div>}
      </div>
    </div>
  );
}

function QuestionEdit({ q, index, total, upd, dup, del, move, onDrag, onDragEnd }: {
  q: Question; index: number; total: number; upd: (p: Partial<Question>) => void; dup: () => void; del: () => void; move: (to: number) => void;
  onDrag: (e: React.DragEvent) => void; onDragEnd: () => void;
}) {
  const [focusOpt, setFocusOpt] = useState(-1);
  const multi = q.type === 'checkbox';
  const setOpt = (i: number, s: string) => upd({ options: q.options.map((o, j) => (j === i ? s : o)) });
  function addOpt() {
    if (q.options.length >= LIMITS.options) return;
    setFocusOpt(q.options.length); upd({ options: [...q.options, `選択肢 ${q.options.length + 1}`] });
  }
  const mark = q.type === 'select' ? null : <span className={`h-[18px] w-[18px] shrink-0 border-2 border-[#c7c7c7] ${multi ? 'rounded-sm' : 'rounded-full'}`} />;
  return (
    <div className="px-6 pb-2">
      <div draggable onDragStart={onDrag} onDragEnd={onDragEnd} title="ドラッグして並べ替え" className="flex cursor-move justify-center py-1 text-[#c7c7c7]"><GripHorizontal size={20} strokeWidth={1.75} /></div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <input autoFocus={!q.title} value={q.title} maxLength={LIMITS.title} placeholder="質問" onChange={(e) => upd({ title: e.target.value })}
          className="min-w-0 flex-1 rounded-lg border border-[#dbdbdb] bg-[#fafafa] px-3 py-2.5 text-base font-semibold outline-none focus:border-[#737373]" />
        <select value={q.type} aria-label="質問の種類" onChange={(e) => { const type = e.target.value as QType; upd({ type, options: hasOptions(type) && !q.options.length ? ['選択肢 1'] : q.options, other: type === 'select' ? false : q.other }); }}
          className="rounded-lg border border-[#dbdbdb] bg-white px-3 py-2.5 text-sm outline-none sm:w-48">
          {Q_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <input value={q.help} maxLength={LIMITS.short} placeholder="説明（任意）" onChange={(e) => upd({ help: e.target.value })} className={`${line} mt-2 text-xs`} />

      <div className="mt-3 text-sm">
        {(q.type === 'short' || q.type === 'long') && <div className={`border-b border-dotted border-[#c7c7c7] pb-1 text-[#737373] ${q.type === 'short' ? 'w-1/2' : ''}`}>{q.type === 'short' ? '記述式テキスト（短文回答）' : '記述式テキスト（長文回答）'}</div>}
        {q.type === 'date' && <div className="w-40 border-b border-dotted border-[#c7c7c7] pb-1 text-[#737373]">年 / 月 / 日</div>}
        {q.type === 'time' && <div className="w-24 border-b border-dotted border-[#c7c7c7] pb-1 text-[#737373]">時刻</div>}
        {hasOptions(q.type) && (
          <div className="space-y-1">
            {q.options.map((o, i) => (
              <div key={i} className="flex items-center gap-3">
                {mark || <span className="w-5 shrink-0 text-[#737373]">{i + 1}.</span>}
                <input value={o} maxLength={LIMITS.short} autoFocus={focusOpt === i} onFocus={(e) => e.target.select()} onChange={(e) => setOpt(i, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addOpt(); } }} className={`${line} py-2`} />
                {q.options.length > 1 && <button type="button" aria-label="選択肢を削除" onClick={() => upd({ options: q.options.filter((_, j) => j !== i) })} className={iconBtn}><X size={18} strokeWidth={1.75} /></button>}
              </div>
            ))}
            {q.other && (
              <div className="flex items-center gap-3">
                {mark}<span className="flex-1 border-b border-dotted border-[#c7c7c7] py-2 text-[#737373]">その他…</span>
                <button type="button" aria-label="「その他」を削除" onClick={() => upd({ other: false })} className={iconBtn}><X size={18} strokeWidth={1.75} /></button>
              </div>
            )}
            <div className="flex items-center gap-3 py-2">
              {mark || <span className="w-5 shrink-0 text-[#737373]">{q.options.length + 1}.</span>}
              <button type="button" onClick={addOpt} className="text-[#737373] hover:underline">選択肢を追加</button>
              {q.type !== 'select' && !q.other && <><span>または</span><button type="button" onClick={() => upd({ other: true })} className="font-medium text-[#0095f6] hover:underline">「その他」を追加</button></>}
            </div>
          </div>
        )}
        {q.type === 'scale' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <select value={q.min} aria-label="目盛の最小" onChange={(e) => upd({ min: Number(e.target.value) })} className="rounded border border-[#dbdbdb] bg-white px-2 py-2">{[0, 1].map((n) => <option key={n}>{n}</option>)}</select>
              <span>〜</span>
              <select value={q.max} aria-label="目盛の最大" onChange={(e) => upd({ max: Number(e.target.value) })} className="rounded border border-[#dbdbdb] bg-white px-2 py-2">{[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n}>{n}</option>)}</select>
            </div>
            <div className="flex items-center gap-3"><span className="w-6 text-[#737373]">{q.min}</span><input value={q.minLabel} maxLength={50} placeholder="ラベル（省略可）" onChange={(e) => upd({ minLabel: e.target.value })} className={`${line} sm:w-1/2`} /></div>
            <div className="flex items-center gap-3"><span className="w-6 text-[#737373]">{q.max}</span><input value={q.maxLabel} maxLength={50} placeholder="ラベル（省略可）" onChange={(e) => upd({ maxLabel: e.target.value })} className={`${line} sm:w-1/2`} /></div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-1 border-t border-[#dbdbdb] pt-2">
        <button type="button" title="上へ" aria-label="上へ" disabled={index === 0} onClick={(e) => { e.stopPropagation(); move(index - 1); }} className={iconBtn}><ArrowUp size={20} strokeWidth={1.75} /></button>
        <button type="button" title="下へ" aria-label="下へ" disabled={index === total - 1} onClick={(e) => { e.stopPropagation(); move(index + 1); }} className={iconBtn}><ArrowDown size={20} strokeWidth={1.75} /></button>
        <button type="button" title="コピーを作成" aria-label="コピーを作成" onClick={(e) => { e.stopPropagation(); dup(); }} className={iconBtn}><Copy size={20} strokeWidth={1.75} /></button>
        <button type="button" title="削除" aria-label="削除" onClick={(e) => { e.stopPropagation(); del(); }} className={iconBtn}><Trash2 size={20} strokeWidth={1.75} /></button>
        <span className="mx-2 h-8 border-l border-[#dbdbdb]" />
        <Switch on={q.required} onChange={(v) => upd({ required: v })} label="必須" />
      </div>
    </div>
  );
}

// 回答タブ: 件数・受付の切り替え・CSV／概要（質問ごとの集計）・個別（1件ずつ）
function Responses({ form, responses, reload, del, setAccepting }: { form: EnqForm; responses: EnqResponse[]; reload: () => void; del: (id: string) => void; setAccepting: (v: boolean) => void }) {
  const [view, setView] = useState<'sum' | 'one'>('sum');
  const [at, setAt] = useState(0);
  const idx = Math.min(at, Math.max(0, responses.length - 1)); const cur = responses[idx];
  function csv() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = [['タイムスタンプ', ...form.questions.map((q) => q.title || '無題の質問')], ...responses.map((r) => [jst(r.created_at), ...form.questions.map((q) => answerText(r.answers[q.id]))])];
    const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${form.title || 'アンケート'}（回答）.csv`; a.click(); URL.revokeObjectURL(a.href);
  }
  return (
    <>
      <div className={card}>
        <div className="flex flex-wrap items-center gap-2 px-6 pt-5">
          <div className="mr-auto text-xl font-bold">{responses.length} 件の回答</div>
          <button type="button" title="読み直す" aria-label="読み直す" onClick={reload} className={iconBtn}><RefreshCw size={20} strokeWidth={1.75} /></button>
          <button type="button" onClick={csv} disabled={!responses.length} className="flex items-center gap-1.5 rounded border border-[#dbdbdb] px-3 py-1.5 text-sm font-medium disabled:opacity-40" style={{ color: 'var(--enq)' }}><Download size={18} strokeWidth={1.75} />CSV をダウンロード</button>
        </div>
        <div className="flex justify-end px-6 py-3"><Switch on={form.accepting} onChange={setAccepting} label={form.accepting ? '回答を受付中' : '回答を受け付けていません'} /></div>
        <div className="flex justify-center gap-8 border-t border-[#dbdbdb]">
          {([['sum', '概要'], ['one', '個別']] as ['sum' | 'one', string][]).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setView(k)} className={`-mb-px border-b px-3 py-3 text-xs font-semibold tracking-wider ${view === k ? 'border-black' : 'border-transparent text-[#737373]'}`}>{l}</button>
          ))}
        </div>
      </div>
      {!responses.length && <div className={`${card} p-6 text-center text-sm text-[#737373]`}>回答を待っています。右上の「回答URL」からコピーして配ってください。</div>}
      {view === 'sum' && responses.length > 0 && form.questions.map((q) => <Summary key={q.id} q={q} responses={responses} />)}
      {view === 'one' && cur && (
        <>
          <div className={`${card} flex items-center gap-2 px-4 py-2`}>
            <button type="button" aria-label="前の回答" disabled={idx === 0} onClick={() => setAt(idx - 1)} className={iconBtn}><ArrowLeft size={20} strokeWidth={1.75} /></button>
            <span className="text-sm">{idx + 1} / {responses.length}</span>
            <button type="button" aria-label="次の回答" disabled={idx >= responses.length - 1} onClick={() => setAt(idx + 1)} className={`${iconBtn} rotate-180`}><ArrowLeft size={20} strokeWidth={1.75} /></button>
            <span className="ml-auto text-xs text-[#737373]" suppressHydrationWarning>{jst(cur.created_at)}</span>
            <button type="button" title="この回答を削除" aria-label="この回答を削除" onClick={() => del(cur.id)} className={iconBtn}><Trash2 size={20} strokeWidth={1.75} /></button>
          </div>
          {form.questions.map((q) => (
            <div key={q.id} className={`${card} p-6`}>
              <div className="break-words text-base">{q.title || '無題の質問'}</div>
              <div className={`mt-3 whitespace-pre-wrap break-words text-sm ${answerText(cur.answers[q.id]) ? '' : 'text-[#a8a8a8]'}`}>{answerText(cur.answers[q.id]) || '（未回答）'}</div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

function Summary({ q, responses }: { q: Question; responses: EnqResponse[] }) {
  const vals = responses.map((r) => r.answers[q.id]).filter((a) => (Array.isArray(a) ? a.length : a)) as (string | string[])[];
  const counts = new Map<string, number>();
  (q.type === 'scale' ? scaleOf(q) : hasOptions(q.type) ? optionsOf(q) : []).forEach((o) => counts.set(o, 0));   // 0件の選択肢も出す
  vals.flat().forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  const rows = [...counts.entries()]; const max = Math.max(1, ...rows.map(([, n]) => n));
  const pct = (n: number) => (vals.length ? Math.round((n / vals.length) * 1000) / 10 : 0);
  return (
    <div className={`${card} p-6`}>
      <div className="break-words text-base">{q.title || '無題の質問'}</div>
      <div className="mt-1 text-xs text-[#737373]">{vals.length} 件の回答</div>
      {!vals.length ? <div className="mt-3 text-sm text-[#a8a8a8]">この質問にはまだ回答がありません。</div>
        : q.type === 'scale' ? (
          <div className="mt-4 flex items-end justify-center gap-3">
            {rows.map(([k, n]) => (
              <div key={k} className="flex min-w-0 flex-1 flex-col items-center text-xs sm:max-w-20">
                <span className="whitespace-nowrap text-[#737373]">{n}（{pct(n)}%）</span>
                <div className="mt-1 w-full rounded-t" style={{ height: n ? (n / max) * 120 : 1, background: n ? 'var(--enq)' : '#dbdbdb' }} />
                <span className="mt-1 text-sm">{k}</span>
              </div>
            ))}
          </div>
        ) : hasOptions(q.type) ? (
          <div className="mt-4 space-y-3">
            {rows.map(([k, n]) => (
              <div key={k} className="text-sm">
                <div className="flex justify-between gap-3"><span className="break-words">{k}</span><span className="shrink-0 text-[#737373]">{n}（{pct(n)}%）</span></div>
                <div className="mt-1 h-4 rounded bg-[#f2f2f2]"><div className="h-full rounded" style={{ width: `${(n / max) * 100}%`, background: 'var(--enq)' }} /></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
            {rows.map(([k, n]) => <div key={k} className="flex justify-between gap-3 whitespace-pre-wrap break-words rounded bg-[#fafafa] px-3 py-2 text-sm"><span className="min-w-0">{k}</span>{n > 1 && <span className="shrink-0 text-[#737373]">{n}件</span>}</div>)}
          </div>
        )}
    </div>
  );
}
