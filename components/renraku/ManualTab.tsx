'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { NotInLegacy, useIke } from '../Live';
import { useMotivation } from '../Motivation';
import { needText } from '../Perms';
import {
  cannotPick, caseHead, commuteJudge, fareBlock, ikouMessage, judgeKadou, pickGroups,
  type DryRes, type PartnerListRes, type PartnerPerson, type Recipient, type StationRes,
} from '@/lib/live/renraku';
import { SAMPLE_PARTNER, SAMPLE_RECIPIENTS, sampleStation } from '@/lib/live/renraku-sample';
import { buildNameIndex, matchName } from '@/lib/live/renraku-names';
import { HoldButton, LinePreview, Note, SendProgress, Step, haishin, useIkeDebounced } from './parts';

// 手動配信：今の営業共有リスト（partner-list.html / ikou-manual.html）と同じ流れ（2026-10-25 shoya）。
//   ① 案件情報を貼る → 案件文から駅・勤務条件・開始月・募集人数・単価を読む（GET /api/partner-list?action=station）
//   ② 人が絞られる（営業中の人＝GET /api/partner-list?action=list。通勤・稼働月・交通費・粗利の判定は今の API の答え）
//   ③ 人を選ぶ（選べない人は今の画面と同じ理由で止める）→ ④ 本文 → 長押しで配信
//   送ると：今の手動配信と同じ「手動配信の依頼」を積んで案件番号（P…）を付け（ikou-requests create・manual）、
//           その番号で 1:1 に送る（line-broadcast mode=send kNo）→ 案件進捗に載る → 依頼を「送った」にする（markSent）
//   ガード（条件・稼働月・交通費・人数・粗利・アダルト/店舗運営系・配信できる時間）は今の API が最後にもう一度見る。断られたら理由をそのまま出す
const PHRASES = ['お疲れ様です！', '{名前}さん', '興味がありましたら「興味あります」とご返信ください。', '見送りの場合もその旨いただけると助かります。', 'ご不明な点があればお気軽にご連絡ください。'];
type Result = { ok: boolean; title: string; lines: string[] };

export function ManualTab({ live, canSend, info, wide }: { live: boolean; canSend: boolean; info: boolean; wide: boolean }) {
  const on = live && !info;
  const { hit, toast } = useMotivation();
  const list = useIke<PartnerListRes>(on ? 'partner-list?action=list&area=main' : null);
  const L = on ? list.data : SAMPLE_PARTNER;
  const [caseText, setCaseText] = useState('');
  const [station, setStation] = useState('');
  const [kadou, setKadou] = useState(0);
  const [word, setWord] = useState('');
  const [bump, setBump] = useState(0);

  // ① 案件文 → 駅・条件（今の API。打っている途中は待つ）
  const stPath = on && (caseText.trim() || station.trim().length >= 2)
    ? `partner-list?action=station&area=main${caseText.trim() ? `&q=${encodeURIComponent(caseText.trim())}` : ''}${station.trim().length >= 2 ? `&station=${encodeURIComponent(station.trim())}` : ''}${bump ? `&r=${bump}` : ''}`
    : null;
  const stLive = useIkeDebounced<StationRes>(stPath, bump ? 0 : 600);
  const ST: StationRes | null = on ? stLive.data : caseText.trim() || station.trim() ? sampleStation(station.trim() ? `${station.trim()}駅 ${caseText}` : caseText) : null;
  // 交通費は1回に引ける数に上限がある。残りがあれば少し待って続きを取りに行く（今の画面と同じ・最大8回）
  useEffect(() => {
    if (!on || !ST?.fare?.pending || bump >= 8) return;
    const t = setTimeout(() => setBump((b) => b + 1), 1200);
    return () => clearTimeout(t);
  }, [on, ST?.fare?.pending, bump]);
  useEffect(() => setBump(0), [caseText, station]);

  // ② 絞り込み ③ 選ぶ
  const g = useMemo(() => pickGroups(L, ST, { kadou, word }), [L, ST, kadou, word]);
  const [sel, setSel] = useState<string[]>([]);
  const [why, setWhy] = useState('');
  const people = useMemo(() => new Map((L?.people ?? []).map((p) => [p.id, p])), [L]);
  // 案件文が変わって条件に合わなくなった人は、黙って残さず外して知らせる（今の画面と同じ）
  useEffect(() => {
    const drop: string[] = [];
    const keep = sel.filter((id, i) => { const p = people.get(id); const r = p ? cannotPick(p, ST, L, i) : '名簿にいません'; if (r) drop.push(`${p?.name ?? id}（${r}）`); return !r; });
    if (drop.length) { setSel(keep); setWhy(`この案件の条件に合わない方の選択を外しました\n${drop.join('\n')}`); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ST, L]);
  const toggle = (p: PartnerPerson) => {
    if (sel.includes(p.id)) { setSel((s) => s.filter((x) => x !== p.id)); return; }
    const r = cannotPick(p, ST, L, sel.length);
    if (r) { setWhy(`${p.name} さんは${r.replace(/^【/, '【')}`); return; }
    setWhy(''); setSel((s) => [...s, p.id]);
  };
  const picked = sel.map((id) => people.get(id)).filter((p): p is PartnerPerson => !!p);

  // ④ 本文
  const [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const insert = (s: string) => {
    const el = box.current;
    if (!el) { setText((t) => t + s); return; }
    const a = el.selectionStart ?? text.length, b = el.selectionEnd ?? text.length;
    setText(text.slice(0, a) + s + text.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + s.length, a + s.length); });
  };

  // 送る
  const [prog, setProg] = useState<{ done: number; total: number; label: string } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const tanka = ST?.limits?.tanka?.message;
  const blockSend = !canSend ? needText('edit') : !caseText.trim() ? '先に①へ案件情報を貼り付けてください' : !picked.length ? '③で送る人を選んでください'
    : !text.trim() ? '④の本文が空です' : tanka ? tanka : '';

  const go = async () => {
    setResult(null);
    const names = picked.map((p) => p.name);
    if (!on) {
      const n = names.length; let k = 0; setProg({ done: 0, total: n, label: '' });
      const iv = setInterval(() => {
        k += 1; setProg({ done: k, total: n, label: `${k} / ${n}` });
        if (k >= n) { clearInterval(iv); setTimeout(() => setProg(null), 500); hit(n); toast({ text: '見本なので送っていません', sub: `→ 本物なら ${n}人に送り、案件進捗に載ります` }); setResult({ ok: true, title: `見本：${n}人に送ったことにしました`, lines: ['本物では、案件番号（P…）が付いて案件進捗に載ります'] }); setSel([]); }
      }, 260);
      return;
    }
    setProg({ done: 0, total: names.length, label: '宛先を確かめています…' });
    const dry = await haishin<DryRes & { ok?: boolean; error?: string }>('dry', { audience: 'sales' });
    if (!dry.ok) { setProg(null); setResult({ ok: false, title: '送れませんでした', lines: [dry.error || '宛先を読めませんでした'] }); return; }
    const idx = buildNameIndex<Recipient>((dry.recipients ?? []).map((r) => ({ name: r.name, value: r })));
    const hits: Recipient[] = [], miss: string[] = [];
    for (const n of names) { const m = matchName(n, idx); if (m && m.how !== 'partial') hits.push(m.value); else miss.push(n); }
    if (!hits.length) { setProg(null); setResult({ ok: false, title: '送れる人がいません', lines: [`選んだ ${names.length}人は全員、公式LINE（あおい）を 1:1 で追加していないため送れません。グループへは今の配信画面から送ってください`] }); return; }

    setProg({ done: 0, total: hits.length, label: '依頼を積んでいます…' });
    const c = await haishin<{ ok?: boolean; error?: string; caseNo?: string; requestId?: string }>('ikou-create', { caseText, names });
    if (!c.ok || !c.caseNo) { setProg(null); setResult({ ok: false, title: '送れませんでした（今のシステムが止めました）', lines: [c.error || '案件番号が付きませんでした'] }); return; }

    // {名前} があれば一人ずつ（その人の名前を入れて）、無ければ1回でまとめて送る
    let sent = 0; const failed: string[] = []; const errs: string[] = [];
    const per = text.includes('{名前}');
    const batches = per ? hits.map((h) => [h]) : [hits];
    for (const b of batches) {
      setProg({ done: sent + failed.length, total: hits.length, label: '送っています…' });
      const r = await haishin<{ ok?: boolean; error?: string; sent?: number; failed?: { name: string; error: string }[] }>('send', {
        audience: 'sales', kNo: c.caseNo, to: b.map((h) => h.userId), text: per ? text.replaceAll('{名前}', b[0].name) : text,
      });
      if (typeof r.sent !== 'number') { errs.push(r.error || '送れませんでした'); if (!per) break; failed.push(...b.map((h) => h.name)); continue; }
      sent += r.sent; failed.push(...(r.failed ?? []).map((f) => `${f.name}（${f.error}）`));
      setProg({ done: sent + failed.length, total: hits.length, label: `${sent + failed.length} / ${hits.length}` });
    }
    if (sent > 0 && c.requestId) await haishin('ikou-mark-sent', { id: c.requestId, note: `ver2 手動配信(1:1) ${sent}/${hits.length} 名成功` });
    setTimeout(() => setProg(null), 500);
    const lines = [
      ...(sent ? [`→ 案件進捗の ${c.caseNo} に載りました`] : [`案件番号 ${c.caseNo} の依頼は、今のシステムの受信トレイに「送信待ち」で残っています`]),
      ...(miss.length ? [`公式LINE を 1:1 で追加していないため送っていない ${miss.length}人：${miss.join('、')}`] : []),
      ...(failed.length ? [`届かなかった ${failed.length}人：${failed.join('、')}`] : []),
      ...errs,
    ];
    setResult({ ok: sent > 0, title: sent ? `${sent}人に送りました（${caseHead(caseText) || c.caseNo}）` : '送れませんでした', lines });
    if (sent) { hit(sent); toast({ text: `${sent}人に案件を送りました`, sub: `→ 案件進捗の ${c.caseNo} に載りました` }); setSel([]); }
  };

  const months = L?.kadouMonths ?? [];
  const list2 = (title: string, ps: PartnerPerson[], kind: 'main' | 'na' | 'blocked') => !!ps.length && (
    <div className="mt-2">
      <div className="mb-1 text-[11.5px] font-semibold text-faint">{title}（{ps.length}）</div>
      {ps.slice(0, 120).map((p) => {
        const on2 = sel.includes(p.id);
        const kj = judgeKadou(p, kadou, L);
        const cj = commuteJudge(p, L?.commute, ST);
        return (
          <label key={p.id} className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-[13px] ${kind === 'blocked' ? 'opacity-60' : 'hover:bg-soft'} ${on2 ? 'mo-flash' : ''}`}>
            <input type="checkbox" className="mt-1" checked={on2} disabled={kind === 'blocked'} onChange={() => toggle(p)} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2"><b>{p.name}</b><span className="text-[11.5px] text-faint">{p.eki || '駅—'}・稼働 {p.kadou || '—'}</span></span>
              <span className="mt-0.5 flex flex-wrap gap-1">
                {(p.tags ?? []).map((t) => <span key={t} className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{t}</span>)}
                {cj === 'ok' && <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>通勤OK</span>}
                {cj === 'na' && <span className="chip" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }}>通勤 未回答</span>}
                {kj === 'unknown' && <span className="chip" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }}>稼働月 不明</span>}
                {kind === 'blocked' && <span className="chip" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>{fareBlock(p, ST)}</span>}
              </span>
              {p.kibou && <span className="block truncate text-[11.5px] text-muted">希望：{p.kibou}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );

  const needs = ST?.needs; const lim = ST?.limits;
  const caseNotes = [
    lim?.tanka && `⛔ ${lim.tanka.message}`,
    needs && (needs.shift || needs.yakin || needs.shucchou) && `この案件は【${[needs.shift && 'シフト', needs.yakin && '夜勤', needs.shucchou && '出張'].filter(Boolean).join('・')}】が必要です。意向の無い方は選べません`,
    lim?.startYms?.length && `開始は${lim.startYms.map((y) => `${y % 100}月`).join('・')}です。それより後に空く方は選べません`,
    lim?.cap && `募集${lim.headcount}名です。意向確認は${lim.cap}名まで`,
  ].filter(Boolean) as string[];

  const left = (
    <>
      <Step n={1} title="案件情報を貼る" done={!!caseText.trim()}>
        <textarea value={caseText} onChange={(e) => setCaseText(e.target.value)} rows={wide ? 8 : 5} aria-label="案件情報"
          placeholder="案件の文をそのまま貼り付け（駅・勤務条件・開始月・募集人数・単価を読み取って、②の絞り込みに反映します）"
          className="w-full resize-y rounded-[10px] border border-field bg-surface px-3 py-2 text-[13px] outline-none" />
        <div className="mt-1.5 flex flex-col gap-1.5 text-[12px]">
          {on && stLive.busy && <span className="text-faint">案件文から駅を探しています…</span>}
          {ST?.resolved && <Note tone="info">「{ST.station}」（{ST.muni}／{ST.blockName}）に通えそうな人を出しています</Note>}
          {ST && !ST.resolved && ST.reason !== 'too_short' && (ST.hint || ST.error) && <Note tone="warn">{ST.hint || ST.error}</Note>}
          {!!caseNotes.length && <Note tone={lim?.tanka ? 'bad' : 'warn'}>{caseNotes.join('\n')}</Note>}
          <label className="flex items-center gap-2 text-muted">駅を手で直す
            <input value={station} onChange={(e) => setStation(e.target.value)} placeholder="例：品川" className="min-w-0 flex-1 rounded-lg border border-field bg-surface px-2 py-1 text-[12.5px] text-ink outline-none" /></label>
        </div>
      </Step>
      <Step n={2} title="人が絞られる（営業中の人）">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <select value={kadou} onChange={(e) => setKadou(Number(e.target.value))} aria-label="稼働月" className="rounded-lg border border-field bg-surface px-2 py-1.5">
            <option value={0}>稼働月を指定しない</option>{months.map((m) => <option key={m.ym} value={m.ym}>{m.label}稼働</option>)}
          </select>
          <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="言葉で絞る（例：CCNA ヘルプデスク）" aria-label="言葉で絞る" className="min-w-0 flex-1 rounded-lg border border-field bg-surface px-2 py-1.5 outline-none" />
        </div>
        {on && list.state === 'loading' && <p className="mt-2 text-[12.5px] text-muted">営業中の人を読み込んでいます…</p>}
        {on && list.error && <Note tone="bad">{list.error}</Note>}
        <p className="mt-1.5 text-[11.5px] text-faint">{g.main.length + g.na.length}人{kadou ? `・稼働月が違う ${g.kadouNg}人を除外` : ''}{ST?.fare?.pending ? '・交通費を調べています…' : ''}</p>
      </Step>
      <Step n={3} title={`人を選ぶ（${picked.length}人${lim?.cap ? ` / ${lim.cap}人まで` : ''}）`} done={!!picked.length}>
        {why && <Note tone="warn">{why}</Note>}
        <div className={`${wide ? 'max-h-[46vh]' : 'max-h-[300px]'} overflow-y-auto`}>
          {list2('合いそうな人', g.main, 'main')}
          {list2('通勤エリアが未回答の人', g.na, 'na')}
          {list2('交通費・粗利の条件で選べない人', g.blocked, 'blocked')}
          {!g.main.length && !g.na.length && !g.blocked.length && <p className="py-3 text-center text-[12.5px] text-muted">条件に合う人がいません</p>}
        </div>
      </Step>
    </>
  );

  const right = (
    <Step n={4} title="本文を書いて送る" done={!!text.trim()}>
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        <button type="button" disabled={!caseText.trim()} onClick={() => setText(ikouMessage(caseText))} className="rounded-full border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-40" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}>案件文を本文に入れる</button>
        <button type="button" onClick={() => insert('{名前}')} className="rounded-full border border-line px-2.5 py-1 text-[12px]">名前を差し込む</button>
      </div>
      <textarea ref={box} value={text} onChange={(e) => setText(e.target.value)} rows={wide ? 12 : 7} maxLength={5000} aria-label="本文"
        placeholder="「案件文を本文に入れる」で今の配信画面と同じ文面が入ります。{名前} は一人ずつその人の名前になります"
        className="w-full resize-y rounded-[10px] border border-field bg-surface px-3 py-2 text-[13px] outline-none" />
      <div className="mb-2 mt-1 flex flex-wrap gap-1.5">{PHRASES.map((x) => <button key={x} type="button" onClick={() => insert(x)} className="rounded-full border border-line px-2 py-0.5 text-[11.5px] text-muted">{x.length > 16 ? x.slice(0, 15) + '…' : x}</button>)}</div>
      <LinePreview text={text} name={text.includes('{名前}') ? picked[0]?.name || SAMPLE_RECIPIENTS[0].name : undefined} />
      {text.includes('{名前}') && <p className="mt-1 text-[11.5px] text-faint">{'{名前}'} を使うと、一人ずつ送ります（送った分は同じ案件番号で案件進捗にまとまります）</p>}
    </Step>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`min-h-0 flex-1 overflow-y-auto px-4 py-3 ${wide ? 'grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start gap-3' : 'flex flex-col gap-3'}`}>
        {info && <div className={wide ? 'col-span-2' : ''}><NotInLegacy what="この公式アカウントの手動配信" /></div>}
        <div className="flex flex-col gap-3">{left}</div>
        <div className="flex flex-col gap-3">{right}
          {result && (
            <div className="mo-scale-in rounded-xl border px-3.5 py-3 text-[12.5px]" style={{ background: `var(--tone-${result.ok ? 'ok' : 'bad'}-bg)`, color: `var(--tone-${result.ok ? 'ok' : 'bad'}-fg)`, borderColor: `var(--tone-${result.ok ? 'ok' : 'bad'}-bar)` }}>
              <b className="text-[13.5px]">{result.title}</b>{result.lines.map((l) => <div key={l} className="mt-0.5">{l}</div>)}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-line px-4 py-3">
        {prog ? <SendProgress done={prog.done} total={prog.total} label={prog.label} /> : <span className="flex-1 text-[12.5px] text-muted">{blockSend || `${picked.length}人に 1:1 で送ります（あおいから）`}</span>}
        <HoldButton label={`長押しで配信（${picked.length}人）`} disabled={!!blockSend || !!prog} title={blockSend || undefined} onDone={go} />
      </div>
    </div>
  );
}
