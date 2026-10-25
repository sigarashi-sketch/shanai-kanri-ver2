'use client';

import { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { NotInLegacy } from '../Live';
import { RemainRing, useMotivation } from '../Motivation';
import { needText } from '../Perms';
import { AUD_LABEL, isoMdhm, viaLabel, type Audience, type DryRes, type PollDetailRes, type PollListRes, type PollRow, type Recipient } from '@/lib/live/renraku';
import { SAMPLE_JOINED, SAMPLE_POLLS, SAMPLE_RECIPIENTS, samplePollDetail } from '@/lib/live/renraku-sample';
import { buildNameIndex, matchName, parsePastedNames, suggestName } from '@/lib/live/renraku-names';
import { HoldButton, LinePreview, Note, Pills, SendProgress, Step, haishin, useHaishinRead } from './parts';

// 案内配信：今の line-broadcast.html?annai=1（送る）と poll.html（進み具合）と同じ（2026-10-25 shoya）。
//   送る … 件名・本文・選択肢（任意）・回答ボタン（任意）・人を選ぶ（名前の貼り付けでも）→ 長押しで送る
//          宛先の一覧＝POST /api/line-broadcast mode=dry（営業中 1:1／稼働中 1:1）。送信＝同 mode=send ＋ poll（app/api/live/haishin）
//          グループ宛ての案内は今の配信画面から（グループへ送れる人が限られるため。ここは 1:1 だけ）
//   進み具合 … POST /api/line-broadcast?action=poll-list / poll-detail（だれが答えた・未回答・返信）。ここからは送らない
type Choice = { label: string; ng: boolean };

export function AnnaiTab({ live, canSend, info, wide }: { live: boolean; canSend: boolean; info: boolean; wide: boolean }) {
  const [view, setView] = useState<'send' | 'progress'>('send');
  const on = live && !info;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
        <Pills items={[['send', '送る'], ['progress', '進み具合']] as const} value={view} onChange={setView} small />
        <span className="text-xs text-faint">案件ではなく、案内・お知らせを送るところ</span>
      </div>
      {info && <div className="px-4 pt-3"><NotInLegacy what="この公式アカウントの案内配信" /></div>}
      {view === 'send' ? <SendView on={on} canSend={canSend} wide={wide} onSent={() => setView('progress')} /> : <ProgressView on={on} wide={wide} />}
    </div>
  );
}

function SendView({ on, canSend, wide, onSent }: { on: boolean; canSend: boolean; wide: boolean; onSent: () => void }) {
  const { hit, toast } = useMotivation();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [useChoices, setUseChoices] = useState(false);
  const [choices, setChoices] = useState<Choice[]>([{ label: '', ng: false }, { label: '', ng: false }]);
  const [buttons, setButtons] = useState(true);
  const [aud, setAud] = useState<Audience>('sales');
  const dry = useHaishinRead<DryRes>(on ? 'dry' : null, { audience: aud });
  const all: Recipient[] = on ? dry.data?.recipients ?? [] : aud === 'sales' ? SAMPLE_RECIPIENTS : SAMPLE_JOINED;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [paste, setPaste] = useState('');
  const [pasteMsg, setPasteMsg] = useState<{ miss: string[]; maybe: { from: string; to: Recipient }[]; n: number } | null>(null);
  const [prog, setProg] = useState<{ done: number; total: number; label: string } | null>(null);
  const [err, setErr] = useState('');

  const idx = useMemo(() => buildNameIndex(all.map((r) => ({ name: r.name, value: r }))), [all]);
  const shown = all.filter((r) => !q || r.name.replace(/\s/g, '').includes(q.replace(/\s/g, '')) || r.eki.includes(q) || r.tantou.includes(q));
  const pick = (ids: string[], v: boolean) => setSel((s) => { const x = new Set(s); ids.forEach((id) => (v ? x.add(id) : x.delete(id))); return x; });
  const changeAud = (a: Audience) => { setAud(a); setSel(new Set()); setPasteMsg(null); };
  const applyPaste = () => {
    const names = parsePastedNames(paste);
    const hits: string[] = [], miss: string[] = [], maybe: { from: string; to: Recipient }[] = [];
    for (const n of names) {
      const m = matchName(n, idx);
      if (m) { hits.push(m.value.userId); continue; }
      const s = suggestName(n, idx);
      if (s) maybe.push({ from: n, to: s.value }); else miss.push(n);
    }
    setSel(new Set(hits)); setPasteMsg({ miss, maybe, n: hits.length });   // 今と同じく「置き換え」
  };

  const cs = useChoices ? choices.filter((c) => c.label.trim()) : [];
  const chosen = all.filter((r) => sel.has(r.userId));
  const block = !canSend ? needText('edit') : !title.trim() ? '件名を入れてください' : title.length > 60 ? '件名は60字までです'
    : !text.trim() ? '本文が空です' : !chosen.length ? '送る人を選んでください'
    : useChoices && cs.length === 1 ? '選択肢は2つ以上（使わないなら空に）' : cs.some((c) => c.label.length > 20) ? '選択肢は20字までです' : '';

  const go = async () => {
    setErr('');
    const n = chosen.length;
    if (!on) {
      let k = 0; setProg({ done: 0, total: n, label: '' });
      const iv = setInterval(() => { k += 1; setProg({ done: k, total: n, label: `${k} / ${n}` }); if (k >= n) { clearInterval(iv); setTimeout(() => setProg(null), 400); hit(n); toast({ text: '見本なので送っていません', sub: `→ 本物なら ${n}人に届き、進み具合に「${title}」が出ます` }); setSel(new Set()); onSent(); } }, 220);
      return;
    }
    const poll = { title: title.trim(), choices: cs.map((c) => ({ label: c.label.trim(), ng: c.ng })), buttons: buttons && cs.length >= 2 };
    const per = text.includes('{名前}');
    const batches = per ? chosen.map((c) => [c]) : [chosen];
    let sent = 0; let pollId = ''; const failed: string[] = [];
    setProg({ done: 0, total: n, label: '送っています…' });
    for (const b of batches) {
      const r = await haishin<{ ok?: boolean; error?: string; sent?: number; failed?: { name: string; error: string }[]; pollId?: string; pollError?: string }>('send', {
        audience: aud, to: b.map((x) => x.userId), text: per ? text.replaceAll('{名前}', b[0].name) : text,
        poll: pollId ? { id: pollId, buttons: poll.buttons } : poll,
      });
      if (typeof r.sent !== 'number') { setErr(r.error || '送れませんでした'); break; }
      sent += r.sent; if (r.pollId) pollId = r.pollId;
      failed.push(...(r.failed ?? []).map((f) => `${f.name}（${f.error}）`));
      if (r.pollError) setErr(`送れましたが、送った相手の記録に失敗しました：${r.pollError}`);
      setProg({ done: sent + failed.length, total: n, label: `${sent + failed.length} / ${n}` });
    }
    setTimeout(() => setProg(null), 500);
    if (failed.length) setErr((e) => [e, `届かなかった ${failed.length}人：${failed.join('、')}`].filter(Boolean).join('\n'));
    if (sent) { hit(sent); toast({ text: `「${title}」を ${sent}人に送りました`, sub: '→ 進み具合で、だれが答えたか見られます' }); setSel(new Set()); setTitle(''); setText(''); onSent(); }
  };

  const compose = (
    <Step n={1} title="件名と本文" done={!!title.trim() && !!text.trim()}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} aria-label="件名" placeholder="件名（進み具合の一覧に出る名前。例：勉強会のご案内）"
        className="mb-2 w-full rounded-lg border border-field bg-surface px-2.5 py-1.5 text-body outline-none" />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={wide ? 8 : 5} maxLength={5000} aria-label="本文" placeholder="本文（{名前} は一人ずつその人の名前になります）"
        className="w-full resize-y rounded-[10px] border border-field bg-surface px-3 py-2 text-body outline-none" />
      <div className="mt-1 flex flex-wrap gap-1.5">{['お疲れ様です！', '{名前}さん', 'ご都合のよい回をご返信ください。', 'ご確認よろしくお願いします。'].map((x) => (
        <button key={x} type="button" onClick={() => setText((t) => t + x)} className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">{x}</button>))}</div>
      <label className="mt-2.5 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={useChoices} onChange={(e) => setUseChoices(e.target.checked)} />回答の選択肢を決める（任意）</label>
      {useChoices && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {choices.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input value={c.label} maxLength={20} onChange={(e) => setChoices((xs) => xs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder={`選択肢${i + 1}（20字まで）`}
                className="min-w-0 flex-1 rounded-lg border border-field bg-surface px-2 py-1 text-sm outline-none" />
              <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={c.ng} onChange={(e) => setChoices((xs) => xs.map((x, j) => (j === i ? { ...x, ng: e.target.checked } : x)))} />NG</label>
              {choices.length > 2 && <button type="button" aria-label="この選択肢を消す" onClick={() => setChoices((xs) => xs.filter((_, j) => j !== i))} className="text-faint"><X size={14} /></button>}
            </div>
          ))}
          {choices.length < 6 && <button type="button" onClick={() => setChoices((xs) => [...xs, { label: '', ng: false }])} className="flex items-center gap-1 self-start text-sm font-semibold" style={{ color: 'var(--ad)' }}><Plus size={13} />選択肢を足す</button>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={buttons} onChange={(e) => setButtons(e.target.checked)} />回答ボタンを付けて送る（任意）</label>
          <p className="text-xs text-faint">ボタンを付けなくても、返信の文面（「第2回で」など）から読み取れた回答は進み具合に自動で入ります（今のシステムと同じ）。</p>
        </div>
      )}
    </Step>
  );
  const people = (
    <Step n={2} title={`人を選ぶ（${chosen.length}人）`} done={!!chosen.length}>
      <Pills items={(['sales', 'joined'] as const).map((k) => [k, AUD_LABEL[k]] as const)} value={aud} onChange={changeAud} small />
      <details className="mt-2 rounded-lg border border-line-soft px-2.5 py-1.5 text-sm">
        <summary className="cursor-pointer font-semibold text-muted">名前を貼り付けて選ぶ</summary>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} placeholder={'1行に1人（表計算からの貼り付けもそのまま）'} className="mt-1.5 w-full resize-y rounded-lg border border-field bg-surface px-2 py-1 text-sm outline-none" />
        <button type="button" disabled={!paste.trim()} onClick={applyPaste} className="mt-1 rounded-full border px-2.5 py-0.5 text-sm font-semibold disabled:opacity-40" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}>この名前で選ぶ（今の選択と入れ替え）</button>
      </details>
      {pasteMsg && (
        <div className="mt-1.5 flex flex-col gap-1">
          <Note tone="ok">{pasteMsg.n}人を選びました</Note>
          {pasteMsg.maybe.map((m) => (
            <Note key={m.from} tone="warn">「{m.from}」は見つかりません。もしかして <b>{m.to.name}</b>？ <button type="button" className="ml-1 font-semibold underline" onClick={() => { pick([m.to.userId], true); setPasteMsg((p) => p && { ...p, maybe: p.maybe.filter((x) => x.from !== m.from), n: p.n + 1 }); }}>この人を選ぶ</button></Note>
          ))}
          {!!pasteMsg.miss.length && <Note tone="bad">この一覧にいない（1:1 未追加・区分が違う・ブロック）：{pasteMsg.miss.join('、')}</Note>}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <label className="flex min-h-8 flex-1 items-center gap-1.5 rounded-lg border border-field px-2 text-faint"><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・駅・担当" className="flex-1 bg-transparent text-sm text-ink outline-none" /></label>
        <button type="button" onClick={() => pick(shown.map((r) => r.userId), !shown.every((r) => sel.has(r.userId)))} className="shrink-0 text-sm font-semibold" style={{ color: 'var(--ad)' }}>{shown.length && shown.every((r) => sel.has(r.userId)) ? 'すべて外す' : 'すべて選ぶ'}</button>
      </div>
      {on && dry.state === 'loading' && <p className="mt-2 text-sm text-muted">宛先の一覧を読み込んでいます…</p>}
      {on && dry.error && <Note tone="bad">{dry.error}</Note>}
      <div className={`mt-1 overflow-y-auto ${wide ? 'max-h-[40vh]' : 'max-h-[240px]'}`}>
        {shown.slice(0, 300).map((r) => (
          <label key={r.userId} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-body hover:bg-soft">
            <input type="checkbox" checked={sel.has(r.userId)} onChange={(e) => pick([r.userId], e.target.checked)} />
            <span className="flex-1">{r.name}</span><span className="text-xs text-faint">{[r.eki, r.tantou && `担当 ${r.tantou}`].filter(Boolean).join('・')}</span>
          </label>
        ))}
        {!shown.length && dry.state !== 'loading' && <p className="py-3 text-center text-sm text-muted">この区分に送れる人がいません</p>}
      </div>
      <p className="mt-1 text-xs text-faint">公式LINE（あおい）を 1:1 で追加している人だけが出ます。グループ宛ての案内は今の配信画面から。</p>
    </Step>
  );
  const preview = <LinePreview text={text} title={title} name={text.includes('{名前}') ? chosen[0]?.name || all[0]?.name : undefined} choices={buttons ? cs : undefined} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`min-h-0 flex-1 overflow-y-auto px-4 py-3 ${wide ? 'grid grid-cols-2 items-start gap-3' : 'flex flex-col gap-3'}`}>
        <div className="flex flex-col gap-3">{compose}{wide && preview}</div>
        <div className="flex flex-col gap-3">{people}{!wide && preview}{err && <Note tone="bad">{err}</Note>}</div>
      </div>
      <div className="flex items-center gap-3 border-t border-line px-4 py-3">
        {prog ? <SendProgress done={prog.done} total={prog.total} label={prog.label} /> : <span className="flex-1 text-sm text-muted">{block || `${chosen.length}人に案内を送ります（${AUD_LABEL[aud]}）`}</span>}
        <HoldButton label={`長押しで送る（${chosen.length}人）`} disabled={!!block || !!prog} title={block || undefined} onDone={go} />
      </div>
    </div>
  );
}

function ProgressView({ on, wide }: { on: boolean; wide: boolean }) {
  const list = useHaishinRead<PollListRes>(on ? 'poll-list' : null);
  const polls: PollRow[] = on ? list.data?.polls ?? [] : SAMPLE_POLLS;
  const [openId, setOpenId] = useState<string | null>(null);
  if (openId) return <PollDetail id={openId} on={on} wide={wide} onBack={() => setOpenId(null)} />;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3">
      {on && list.state === 'loading' && <p className="text-body text-muted">読み込み中…</p>}
      {on && list.error && <Note tone="bad">{list.error}</Note>}
      {!polls.length && list.state !== 'loading' && <p className="py-6 text-center text-sm text-muted">送った案内はまだありません</p>}
      {polls.map((p, i) => {
        const s = p.summary;
        const remain = s ? (p.choices.length ? s.unanswered : Math.max(0, s.delivered - (p.replied ?? 0))) : 0;
        return (
          <button key={p.id} onClick={() => setOpenId(p.id)} className="mo-fade-up flex items-center gap-3 rounded-xl border border-line px-3.5 py-3 text-left hover:bg-soft" style={{ ['--i' as string]: Math.min(i, 10) }}>
            {s && <RemainRing remain={remain} total={s.delivered || s.total} />}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2"><b className="truncate text-body">{p.title}</b>{p.closedAt && <span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>締め切り</span>}</div>
              <div className="text-xs text-faint">{isoMdhm(p.sentAt || p.createdAt)}・{p.audience === 'joined' ? '稼働中' : p.audience === 'group' ? 'グループ' : '営業中'}・{s?.total ?? 0}人</div>
              {s && <div className="mt-1 flex flex-wrap gap-1 text-xs">
                {p.choices.length ? <>
                  <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>回答 {s.answered}</span>
                  <span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>未回答 {s.unanswered}</span>
                  {s.ng > 0 && <span className="chip" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>NG {s.ng}</span>}
                </> : null}
                <span className="chip" style={{ background: 'var(--tone-info-bg)', color: 'var(--tone-info-fg)' }}>返信 {p.replied ?? 0}</span>
              </div>}
            </div>
          </button>
        );
      })}
      <p className="text-xs text-faint">ここからは送りません。未回答の人へもう一度送るときは「送る」から。</p>
    </div>
  );
}

function PollDetail({ id, on, wide, onBack }: { id: string; on: boolean; wide: boolean; onBack: () => void }) {
  const d = useHaishinRead<PollDetailRes>(on ? 'poll-detail' : null, { id });
  const data = on ? d.data : samplePollDetail(id);
  const [f, setF] = useState<'all' | 'answered' | 'unanswered' | 'replied'>('all');
  const poll = data?.poll;
  const label = (k: string | null) => poll?.choices.find((c) => c.key === k)?.label ?? '';
  const ts = (data?.targets ?? []).filter((t) => f === 'all' || (f === 'answered' ? !!label(t.answer_key) : f === 'unanswered' ? t.delivered && !label(t.answer_key) : !!data?.replies?.[t.line_user_id]?.length));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button onClick={onBack} className="border-b border-line-soft px-4 py-2 text-left text-sm text-muted">← 案内の一覧 ／ <b className="text-ink">{poll?.title ?? '…'}</b></button>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {on && d.state === 'loading' && <p className="text-body text-muted">読み込み中…</p>}
        {on && d.error && <Note tone="bad">{d.error}</Note>}
        {poll && data?.summary && (
          <div className="mb-2.5 flex flex-wrap gap-1.5 text-sm">
            {poll.choices.map((c) => <span key={c.key} className="chip" style={{ background: c.ng ? 'var(--tone-bad-bg)' : 'var(--as)', color: c.ng ? 'var(--tone-bad-fg)' : 'var(--ad)' }}>{c.label} {data.summary!.byKey[c.key] ?? 0}</span>)}
            <span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>届いた {data.summary.delivered} / {data.summary.total}</span>
          </div>
        )}
        <Pills items={[['all', 'すべて'], ['answered', '回答あり'], ['unanswered', '未回答'], ['replied', '返信あり']] as const} value={f} onChange={setF} small />
        <div className={`mt-2 ${wide ? 'grid grid-cols-2 gap-x-4' : ''}`}>
          {ts.map((t) => {
            const rep = data?.replies?.[t.line_user_id] ?? [];
            const a = label(t.answer_key);
            return (
              <div key={t.line_user_id} className="border-b border-line-soft py-2 text-sm">
                <div className="flex items-center justify-between gap-2"><b>{t.name || '（名前なし）'}</b>
                  {a ? <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>{a}{viaLabel(t.answer_via) && `・${viaLabel(t.answer_via)}`}</span>
                    : !t.delivered ? <span className="chip" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>届いていない</span>
                    : poll?.choices.length ? <span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>未回答</span> : null}
                </div>
                {rep.slice(-3).map((r, i) => <div key={i} className="mt-0.5 truncate text-muted">「{r.text}」<span className="ml-1 text-xs text-faint">{isoMdhm(r.at)}</span></div>)}
              </div>
            );
          })}
          {!ts.length && d.state !== 'loading' && <p className="py-4 text-center text-sm text-muted">{f === 'unanswered' ? '全員答えてくれました' : '該当する人はいません'}</p>}
        </div>
        {poll?.message && <details className="mt-3 text-sm text-muted"><summary className="cursor-pointer">送った本文</summary><p className="mt-1 whitespace-pre-wrap">{poll.message}</p></details>}
      </div>
    </div>
  );
}
