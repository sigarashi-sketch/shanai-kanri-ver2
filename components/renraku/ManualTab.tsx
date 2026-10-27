'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useIke } from '../Live';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { useMotivation } from '../Motivation';
import { needText } from '../Perms';
import {
  cannotPick, caseHead, commuteJudge, fareBlock, genderOf, ikouMessage, judgeKadou, pickGroups, skillChips,
  type DryRes, type PartnerListRes, type PartnerPerson, type Recipient, type StationRes,
} from '@/lib/live/renraku';
import { buildNameIndex, matchName, parsePastedNames, suggestName } from '@/lib/live/renraku-names';
import { normName } from '@/lib/live/eigyo-common';
import { HoldButton, LinePreview, Note, SendProgress, Step, haishin, useIkeDebounced } from './parts';

// 手動配信：今の営業共有リスト（partner-list.html / ikou-manual.html）と同じ流れ（2026-10-25 shoya）。
//   ① 案件情報を貼る → 案件文から駅・勤務条件・開始月・募集人数・単価を読む（GET /api/partner-list?action=station）
//   ② 人が絞られる（営業中の人＝GET /api/partner-list?action=list。通勤・稼働月・交通費・粗利の判定は今の API の答え）
//   ③ 人を選ぶ（選べない人は今の画面と同じ理由で止める）→ ④ 本文 → 長押しで配信
//   送ると：今の手動配信と同じ「手動配信の依頼」を積んで案件番号（P…）を付け（ikou-requests create・manual）、
//           その番号で 1:1 に送る（line-broadcast mode=send kNo）→ 案件進捗に載る → 依頼を「送った」にする（markSent）
//   10-27 shoya「名前コピペで選択・フリーワード 性別 スキルなどで絞れる検索欄」：
//     ③の「名前を貼り付けて選ぶ」＝今の配信画面の PASTENAMES と同じ照合（lib/live/renraku-names.ts。1字違いは自動で選ばず「もしかして」）
//     ②の検索欄＝フリーワード（サマリ・前職・希望・駅・資格・ツール・タグ…）／スキル（資格・ツール・得意・職歴）／性別（基本情報フォームの回答＝/api/live/genders）
//   ガード（条件・稼働月・交通費・人数・粗利・アダルト/店舗運営系・配信できる時間）は今の API が最後にもう一度見る。断られたら理由をそのまま出す
const PHRASES = ['お疲れ様です！', '{名前}さん', '興味がありましたら「興味あります」とご返信ください。', '見送りの場合もその旨いただけると助かります。', 'ご不明な点があればお気軽にご連絡ください。'];
type Result = { ok: boolean; title: string; lines: string[] };

export function ManualTab({ live, canSend, info, wide }: { live: boolean; canSend: boolean; info: boolean; wide: boolean }) {
  const on = live && !info;
  const { hit, toast } = useMotivation();
  const list = useIke<PartnerListRes>(on ? 'partner-list?action=list&area=main' : null);
  const L = on ? list.data : null;
  const [caseText, setCaseText] = useState('');
  const [station, setStation] = useState('');
  const [kadou, setKadou] = useState(0);
  const [word, setWord] = useState('');
  const [skill, setSkill] = useState('');
  const [gender, setGender] = useState<'' | '男性' | '女性' | '不明'>('');
  // 性別は営業共有リストに無いので、選んだときだけ基本情報フォームの回答から読む（5分ごと）
  const gd = useLiveRoute<{ ok?: boolean; genders?: Record<string, string>; error?: string }>(on && gender ? '/api/live/genders' : null, { pollMs: 300_000 });
  const [bump, setBump] = useState(0);

  // ① 案件文 → 駅・条件（今の API。打っている途中は待つ）
  const stPath = on && (caseText.trim() || station.trim().length >= 2)
    ? `partner-list?action=station&area=main${caseText.trim() ? `&q=${encodeURIComponent(caseText.trim())}` : ''}${station.trim().length >= 2 ? `&station=${encodeURIComponent(station.trim())}` : ''}${bump ? `&r=${bump}` : ''}`
    : null;
  const stLive = useIkeDebounced<StationRes>(stPath, bump ? 0 : 600);
  const ST: StationRes | null = on ? stLive.data : null;
  // 交通費は1回に引ける数に上限がある。残りがあれば少し待って続きを取りに行く（今の画面と同じ・最大8回）
  useEffect(() => {
    if (!on || !ST?.fare?.pending || bump >= 8) return;
    const t = setTimeout(() => setBump((b) => b + 1), 1200);
    return () => clearTimeout(t);
  }, [on, ST?.fare?.pending, bump]);
  useEffect(() => setBump(0), [caseText, station]);

  // ② 絞り込み ③ 選ぶ
  const genders = gd.data?.genders ?? null;
  const g = useMemo(() => pickGroups(L, ST, { kadou, word, skill, gender: gender && genders ? gender : '', genders }), [L, ST, kadou, word, skill, gender, genders]);
  const chips = useMemo(() => skillChips(L), [L]);
  const toggleSkill = (w: string) => setSkill((s0) => { const ws = s0.split(/[\s　]+/).filter(Boolean); return (ws.includes(w) ? ws.filter((x) => x !== w) : [...ws, w]).join(' '); });
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

  // ③ 名前を貼り付けて選ぶ（営業中の人の中から。通勤エリア外・選べない人は理由を出して選ばない）
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [pasteRes, setPasteRes] = useState<{ added: string[]; already: string[]; ng: string[]; miss: string[]; maybe: { asked: string; p: PartnerPerson }[] } | null>(null);
  const applyPaste = () => {
    const names = parsePastedNames(paste);
    if (!names.length || !L) { setPasteRes(null); return; }
    const idx = buildNameIndex<PartnerPerson>((L.people ?? []).map((p) => ({ name: p.name, value: p })));
    const res = { added: [] as string[], already: [] as string[], ng: [] as string[], miss: [] as string[], maybe: [] as { asked: string; p: PartnerPerson }[] };
    const next = [...sel];
    for (const n of names) {
      const m = matchName(n, idx);
      if (!m || m.how === 'partial') {
        const sg = m ? { value: m.value } : suggestName(n, idx);
        if (sg) res.maybe.push({ asked: n, p: sg.value }); else res.miss.push(n);
        continue;
      }
      const p = m.value;
      if (next.includes(p.id)) { res.already.push(p.name); continue; }
      const r = commuteJudge(p, L.commute, ST) === 'ng' ? '通勤エリア外' : cannotPick(p, ST, L, next.length);
      if (r) { res.ng.push(`${p.name}（${r.replace(/ため選べません.*$/, '').replace(/^【|】/g, '')}）`); continue; }
      next.push(p.id); res.added.push(p.name);
    }
    setSel(next); setWhy(''); setPasteRes(res);
    if (!res.maybe.length && !res.miss.length && !res.ng.length) setPaste('');
  };
  const pickMaybe = (asked: string, p: PartnerPerson) => {
    setPasteRes((r) => r && { ...r, maybe: r.maybe.filter((x) => x.asked !== asked) });
    if (!sel.includes(p.id)) toggle(p);
  };

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
  const blockSend = !on ? '読み込めていません' : !canSend ? needText('edit') : !caseText.trim() ? '先に①へ案件情報を貼り付けてください' : !picked.length ? '③で送る人を選んでください'
    : !text.trim() ? '④の本文が空です' : tanka ? tanka : '';

  const go = async () => {
    setResult(null);
    const names = picked.map((p) => p.name);
    if (!on) return;
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
      <div className="mb-1 text-xs font-semibold text-faint">{title}（{ps.length}）</div>
      {ps.slice(0, 120).map((p) => {
        const on2 = sel.includes(p.id);
        const kj = judgeKadou(p, kadou, L);
        const cj = commuteJudge(p, L?.commute, ST);
        return (
          <label key={p.id} className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-body ${kind === 'blocked' ? 'opacity-60' : 'hover:bg-soft'} ${on2 ? 'mo-flash' : ''}`}>
            <input type="checkbox" className="mt-1" checked={on2} disabled={kind === 'blocked'} onChange={() => toggle(p)} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2"><b>{p.name}</b><span className="text-xs text-faint">{p.eki || '駅—'}・稼働 {p.kadou || '—'}</span></span>
              <span className="mt-0.5 flex flex-wrap gap-1">
                {gender && genders && genderOf(genders[normName(p.name)]) && <span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{genderOf(genders[normName(p.name)])}</span>}
                {(p.tags ?? []).map((t) => <span key={t} className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{t}</span>)}
                {cj === 'ok' && <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>通勤OK</span>}
                {cj === 'na' && <span className="chip" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }}>通勤 未回答</span>}
                {kj === 'unknown' && <span className="chip" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }}>稼働月 不明</span>}
                {kind === 'blocked' && <span className="chip" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>{fareBlock(p, ST)}</span>}
              </span>
              {p.kibou && <span className="block truncate text-xs text-muted">希望：{p.kibou}</span>}
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
          className="w-full resize-y rounded-[10px] border border-field bg-surface px-3 py-2 text-body outline-none" />
        <div className="mt-1.5 flex flex-col gap-1.5 text-sm">
          {on && stLive.busy && <span className="text-faint">案件文から駅を探しています…</span>}
          {ST?.resolved && <Note tone="info">「{ST.station}」（{ST.muni}／{ST.blockName}）に通えそうな人を出しています</Note>}
          {ST && !ST.resolved && ST.reason !== 'too_short' && (ST.hint || ST.error) && <Note tone="warn">{ST.hint || ST.error}</Note>}
          {!!caseNotes.length && <Note tone={lim?.tanka ? 'bad' : 'warn'}>{caseNotes.join('\n')}</Note>}
          <label className="flex items-center gap-2 text-muted">駅を手で直す
            <input value={station} onChange={(e) => setStation(e.target.value)} placeholder="例：品川" className="min-w-0 flex-1 rounded-lg border border-field bg-surface px-2 py-1 text-sm text-ink outline-none" /></label>
        </div>
      </Step>
      <Step n={2} title="人が絞られる（営業中の人）">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select value={kadou} onChange={(e) => setKadou(Number(e.target.value))} aria-label="稼働月" className="rounded-lg border border-field bg-surface px-2 py-1.5">
            <option value={0}>稼働月を指定しない</option>{months.map((m) => <option key={m.ym} value={m.ym}>{m.label}稼働</option>)}
          </select>
          <select value={gender} onChange={(e) => setGender(e.target.value as typeof gender)} aria-label="性別" className="rounded-lg border border-field bg-surface px-2 py-1.5">
            <option value="">性別：すべて</option><option value="男性">男性</option><option value="女性">女性</option><option value="不明">性別が不明</option>
          </select>
          <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="フリーワード（例：ヘルプデスク 品川 シフト可）" aria-label="フリーワード" className="min-w-0 flex-1 rounded-lg border border-field bg-surface px-2 py-1.5 outline-none" />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
          <input value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="スキル・資格（例：CCNA Excel）" aria-label="スキル・資格" className="min-w-0 flex-1 rounded-lg border border-field bg-surface px-2 py-1.5 outline-none" />
          {(word || skill || gender || kadou) ? <button type="button" onClick={() => { setWord(''); setSkill(''); setGender(''); setKadou(0); }} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">絞り込みを消す</button> : null}
        </div>
        {!!chips.length && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {chips.map((c) => { const onC = skill.split(/[\s　]+/).includes(c); return (
              <button key={c} type="button" aria-pressed={onC} onClick={() => toggleSkill(c)} className="chip" style={onC ? { background: 'var(--a)', color: 'var(--ao)' } : { background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{c}</button>
            ); })}
          </div>
        )}
        {gender && gd.state === 'loading' && <p className="mt-1.5 text-xs text-faint">性別を読み込んでいます…</p>}
        {gender && gd.data?.ok === false && <Note tone="warn">{gd.data.error || '性別を読めませんでした'}（性別では絞っていません）</Note>}
        {gender && gd.error && <Note tone="warn">{gd.error}（性別では絞っていません）</Note>}
        {(!on || list.state === 'loading') && <p className="mt-2 text-sm text-muted">営業中の人を読み込んでいます…</p>}
        {on && list.error && <Note tone="bad">{list.error}</Note>}
        <p className="mt-1.5 text-xs text-faint">{g.main.length + g.na.length}人{g.filtered ? `・検索で ${g.filtered}人を除外` : ''}{kadou ? `・稼働月が違う ${g.kadouNg}人を除外` : ''}{ST?.fare?.pending ? '・交通費を調べています…' : ''}</p>
      </Step>
      <Step n={3} title={`人を選ぶ（${picked.length}人${lim?.cap ? ` / ${lim.cap}人まで` : ''}）`} done={!!picked.length}>
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setPasteOpen((v) => !v)} aria-expanded={pasteOpen} className="rounded-full border border-line px-2.5 py-1 text-sm">名前を貼り付けて選ぶ</button>
          {!!picked.length && <button type="button" onClick={() => { setSel([]); setPasteRes(null); }} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">選択を全部外す</button>}
        </div>
        {pasteOpen && (
          <div className="mb-2 rounded-lg border border-line p-2">
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} aria-label="名前の貼り付け"
              placeholder={'名前をコピペ（改行・カンマ・読点で区切る。ふりがな・敬称・表の行のままでも可）\n例：山田 太郎\n鈴木花子さん'}
              className="w-full resize-y rounded-lg border border-field bg-surface px-2 py-1.5 text-body outline-none" />
            <div className="mt-1 flex items-center gap-2">
              <button type="button" disabled={!paste.trim() || !L} onClick={applyPaste} className="rounded-full px-3 py-1 text-sm font-semibold disabled:opacity-40" style={{ background: 'var(--a)', color: 'var(--ao)' }}>この名前を選ぶ</button>
              <span className="text-xs text-faint">{parsePastedNames(paste).length ? `${parsePastedNames(paste).length}人分` : ''}</span>
            </div>
            {pasteRes && (
              <div className="mt-1.5 flex flex-col gap-1 text-sm">
                {!!pasteRes.added.length && <Note tone="info">{`${pasteRes.added.length}人を選びました：${pasteRes.added.join('、')}`}</Note>}
                {!!pasteRes.already.length && <p className="text-xs text-faint">もう選んであった：{pasteRes.already.join('、')}</p>}
                {!!pasteRes.ng.length && <Note tone="warn">{`この案件では選べない ${pasteRes.ng.length}人\n${pasteRes.ng.join('\n')}`}</Note>}
                {!!pasteRes.maybe.length && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">もしかして：
                    {pasteRes.maybe.map((m) => <button key={m.asked} type="button" onClick={() => pickMaybe(m.asked, m.p)} className="rounded-full border px-2 py-0.5" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}>「{m.asked}」→ {m.p.name}</button>)}
                  </div>
                )}
                {!!pasteRes.miss.length && <Note tone="warn">{`営業中の人に見つからない ${pasteRes.miss.length}人：${pasteRes.miss.join('、')}`}</Note>}
              </div>
            )}
          </div>
        )}
        {why && <Note tone="warn">{why}</Note>}
        <div className={`${wide ? 'max-h-[46vh]' : 'max-h-[300px]'} overflow-y-auto`}>
          {list2('合いそうな人', g.main, 'main')}
          {list2('通勤エリアが未回答の人', g.na, 'na')}
          {list2('交通費・粗利の条件で選べない人', g.blocked, 'blocked')}
          {!g.main.length && !g.na.length && !g.blocked.length && <p className="py-3 text-center text-sm text-muted">条件に合う人がいません</p>}
        </div>
      </Step>
    </>
  );

  const right = (
    <Step n={4} title="本文を書いて送る" done={!!text.trim()}>
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        <button type="button" disabled={!caseText.trim()} onClick={() => setText(ikouMessage(caseText))} className="rounded-full border px-2.5 py-1 text-sm font-semibold disabled:opacity-40" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}>案件文を本文に入れる</button>
        <button type="button" onClick={() => insert('{名前}')} className="rounded-full border border-line px-2.5 py-1 text-sm">名前を差し込む</button>
      </div>
      <textarea ref={box} value={text} onChange={(e) => setText(e.target.value)} rows={wide ? 12 : 7} maxLength={5000} aria-label="本文"
        placeholder="「案件文を本文に入れる」で今の配信画面と同じ文面が入ります。{名前} は一人ずつその人の名前になります"
        className="w-full resize-y rounded-[10px] border border-field bg-surface px-3 py-2 text-body outline-none" />
      <div className="mb-2 mt-1 flex flex-wrap gap-1.5">{PHRASES.map((x) => <button key={x} type="button" onClick={() => insert(x)} className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">{x.length > 16 ? x.slice(0, 15) + '…' : x}</button>)}</div>
      <LinePreview text={text} name={text.includes('{名前}') ? picked[0]?.name : undefined} />
      {text.includes('{名前}') && <p className="mt-1 text-xs text-faint">{'{名前}'} を使うと、一人ずつ送ります（送った分は同じ案件番号で案件進捗にまとまります）</p>}
    </Step>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`min-h-0 flex-1 overflow-y-auto px-4 py-3 ${wide ? 'grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start gap-3' : 'flex flex-col gap-3'}`}>
        <div className="flex flex-col gap-3">{left}</div>
        <div className="flex flex-col gap-3">{right}
          {result && (
            <div className="mo-scale-in rounded-xl border px-3.5 py-3 text-sm" style={{ background: `var(--tone-${result.ok ? 'ok' : 'bad'}-bg)`, color: `var(--tone-${result.ok ? 'ok' : 'bad'}-fg)`, borderColor: `var(--tone-${result.ok ? 'ok' : 'bad'}-bar)` }}>
              <b className="text-body">{result.title}</b>{result.lines.map((l) => <div key={l} className="mt-0.5">{l}</div>)}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-line px-4 py-3">
        {prog ? <SendProgress done={prog.done} total={prog.total} label={prog.label} /> : <span className="flex-1 text-sm text-muted">{blockSend || `${picked.length}人に 1:1 で送ります（あおいから）`}</span>}
        <HoldButton label={`長押しで配信（${picked.length}人）`} disabled={!!blockSend || !!prog} title={blockSend || undefined} onDone={go} />
      </div>
    </div>
  );
}
