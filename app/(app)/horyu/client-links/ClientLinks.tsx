'use client';

import { Fragment, useMemo, useState } from 'react';
import { Copy, Link2, RefreshCw, X } from 'lucide-react';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import { LiveBanner, useIke } from '@/components/Live';
import { PersonName } from '@/components/Person';
import { errText, horyuPost } from '@/lib/horyu-post';
import { CLIENT_LINKS, MENTION_CANDIDATES, type ClientLink, type Mention } from '@/lib/horyu-sample';
import { HoryuNote } from '../HoryuNote';

// 客先向けリンク（保留）。今の社内システムの「客先向けリンク」（client-links.html）。
//   ・一覧＝今の GET /api/client-view?action=links（読むだけ。★客先が開いたときの「最後に見た日時」はここでは書かない）
//   ・発行・URL を作り直す・停止・よろずやで呼ぶ人＝今の POST（/api/live/horyu/client-links から・行き先は決め打ち）
//   ・客先に渡す URL は今の客先の画面（<今のシステム>/client.html#k=…）。鍵は URL の # の後ろなのでサーバーの記録に残らない（今と同じ）
//   ・依頼・見送りの記録の名前は社内向け（客先には出ない）。名前を押すと人の小窓
const dt = (iso?: string | null) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d.getTime()) ? '—' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const inp = 'min-h-9 w-full rounded-[10px] border border-field bg-surface px-2.5 text-[13px] text-ink';
const ghost = 'inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 text-[12px] font-semibold disabled:opacity-40';
const tone = (t: string) => ({ background: `var(--tone-${t}-bg)`, color: `var(--tone-${t}-fg)` });

function Chips({ cands, sel, onToggle, disabled }: { cands: Mention[]; sel: Set<string>; onToggle: (uid: string) => void; disabled?: boolean }) {
  if (!cands.length) return <span className="text-[12px] text-faint">候補がいません（よろずやで一度 bot に話しかけた人が候補になります）</span>;
  return <div className="flex flex-wrap gap-1.5">{cands.map((c) => { const on = sel.has(c.uid); return (
    <button key={c.uid} type="button" disabled={disabled} aria-pressed={on} onClick={() => onToggle(c.uid)} className={ghost}
      style={on ? { color: 'var(--ad)', borderColor: 'var(--a)', background: 'var(--as)' } : undefined}>{c.name}</button>); })}</div>;
}

export function ClientLinks({ origin }: { origin: string }) {
  const lk = useIke<{ ok: boolean; links: ClientLink[] }>('client-view?action=links');
  const mc = useIke<{ ok: boolean; candidates: Mention[] }>(lk.live ? 'client-view?action=mentionCandidates' : null);
  const live = lk.live;
  const [local, setLocal] = useState<ClientLink[]>(CLIENT_LINKS);
  const links = live ? lk.data?.links ?? [] : local;
  const cands = live ? mc.data?.candidates ?? [] : MENTION_CANDIDATES;
  const can = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const [label, setLabel] = useState(''), [note, setNote] = useState(''), [mention, setMention] = useState<Set<string>>(new Set());
  const [issued, setIssued] = useState<{ label: string; url: string } | null>(null), [busy, setBusy] = useState('');
  const [open, setOpen] = useState<string | null>(null), [confirm, setConfirm] = useState<{ id: string; op: 'revoke' | 'reissue' } | null>(null);
  const urlOf = (token: string) => (token ? `${origin}/client.html#k=${token}` : '');
  const copy = async (url: string) => { try { await navigator.clipboard.writeText(url); toast({ text: 'URL をコピーしました' }); } catch { toast({ text: 'コピーできませんでした（URL を選んでコピーしてください）' }); } };
  const tog = (s: Set<string>, uid: string) => { const n = new Set(s); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; };

  const issue = async () => {
    if (!label.trim()) { toast({ text: '客先名を入れてください' }); return; }
    setBusy('issue');
    if (!live) {
      const token = 'SAMPLE' + Math.random().toString(36).slice(2, 12);
      setLocal((l) => [{ id: `l${Date.now()}`, label, note, created_by: 'あなた', created_at: new Date().toISOString(), expires_at: null, revoked_at: null, last_seen_at: null, view_count: 0, token, counts: { request: 0, decline: 0 }, events: [], mention: cands.filter((c) => mention.has(c.uid)) }, ...l]);
      setIssued({ label, url: urlOf(token) });
    } else {
      const r = await horyuPost<{ token?: string }>('client-links', { op: 'issue', label, note, mention: [...mention] });
      if (!r.ok || !r.data.token) { setBusy(''); toast({ text: `発行できませんでした：${errText(r)}` }); return; }
      setIssued({ label, url: urlOf(r.data.token) }); lk.reload();
    }
    setBusy(''); hit(); setLabel(''); setNote(''); setMention(new Set());
  };
  const doConfirm = async () => {
    if (!confirm) return;
    const { id, op } = confirm; setConfirm(null); setBusy(id + op);
    if (!live) {
      setLocal((l) => l.map((x) => (x.id !== id ? x : op === 'revoke' ? { ...x, revoked_at: new Date().toISOString() } : { ...x, token: 'SAMPLE' + Math.random().toString(36).slice(2, 12) })));
      toast({ text: op === 'revoke' ? 'リンクを停止しました（見本）' : 'URL を作り直しました（見本）' });
    } else {
      const r = await horyuPost<{ token?: string }>('client-links', { op, id });
      if (!r.ok) toast({ text: `できませんでした：${errText(r)}` });
      else { hit(); toast({ text: op === 'revoke' ? 'リンクを停止しました（このURLはすぐ開けなくなります）' : 'URL を作り直しました（前のURLは使えません）' }); lk.reload(); }
    }
    setBusy('');
  };
  const setMentionFor = async (l: ClientLink, uid: string) => {
    const next = [...tog(new Set((l.mention ?? []).map((m) => m.uid)), uid)];
    if (!live) { setLocal((ls) => ls.map((x) => (x.id === l.id ? { ...x, mention: cands.filter((c) => next.includes(c.uid)) } : x))); return; }
    setBusy(l.id + 'm');
    const r = await horyuPost('client-links', { op: 'setMention', id: l.id, mention: next });
    setBusy('');
    if (!r.ok) toast({ text: `メンションを保存できませんでした：${errText(r)}` }); else lk.reload();
  };
  const sorted = useMemo(() => [...links].sort((a, b) => (a.revoked_at ? 1 : 0) - (b.revoked_at ? 1 : 0)), [links]);

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-24 pt-[22px]">
      <PageTitle title="客先向けリンク" sub="客先に要員リスト（案件から探す／人財カタログ）を見せる URL を発行します" />
      <HoryuNote from="客先向けリンク" />
      <LiveBanner state={lk.state} error={lk.error} onReload={lk.reload} note="今の客先向けリンクです。ここで発行・停止すると今のシステムに入ります" />
      <p className="text-[12.5px] leading-relaxed text-muted">お名前はイニシャル、単価・所属・会社名は出ません（紹介文は客先向けに削って表示）。基本情報フォーム未回答の方・既往歴ありの方は表示されません。
        客先が「意向を確認してほしい」を押すと、意向確認依頼に「客先：○○」として届き、LINE グループ「よろずや」にも知らせが流れます。</p>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="grid gap-2.5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-[12px] text-muted">客先名（客先の画面に「○○ 様」と出ます）<input className={inp} maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例）株式会社○○ 情シス部" /></label>
          <label className="flex flex-col gap-1 text-[12px] text-muted">社内メモ（任意・客先には出ません）<input className={inp} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例）訪問時に案内" /></label>
          <button className="btn-primary inline-flex min-h-9 items-center gap-1 rounded-[10px] px-4 text-[13px] font-semibold disabled:opacity-40" disabled={!can || busy === 'issue'} title={can ? undefined : needText('edit')} onClick={issue}><Link2 size={14} />リンクを発行</button>
        </div>
        <div className="flex flex-col gap-1 text-[12px] text-muted">この客先から依頼が来たら「よろずや」でメンションする人（任意）<Chips cands={cands} sel={mention} onToggle={(u) => setMention((s) => tog(s, u))} /></div>
        {issued && (
          <div className="mo-fade-up flex flex-wrap items-center gap-2 rounded-lg border p-3 text-[12.5px]" style={{ borderColor: 'var(--tone-ok-bar, var(--color-line))', background: 'var(--tone-ok-bg)' }}>
            <b>{issued.label} 様のリンクを発行しました</b>
            <input readOnly value={issued.url} onFocus={(e) => e.target.select()} className={`${inp} flex-1`} />
            <button className={ghost} onClick={() => copy(issued.url)}><Copy size={12} />コピー</button>
            <button aria-label="閉じる" onClick={() => setIssued(null)}><X size={14} /></button>
          </div>
        )}
        <p className="text-[11.5px] leading-relaxed text-faint">・発行した URL は下の一覧からいつでもコピーできます。「URL を作り直す」と新しい URL になり、前の URL は使えなくなります（メンション・履歴はそのまま）。<br />
          ・客先の担当者以外に転送されないよう、メールで直接お送りください。リンクに有効期限はありません。「停止」すると、その URL はすぐ開けなくなります。<br />
          ・ご本人の個人情報を客先に出すため、同意が取れていない方がいないか事前にご確認ください。</p>
      </section>

      <section className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[820px] text-[12.5px]">
          <thead><tr className="border-b border-line-soft text-left text-[11.5px] text-faint">
            <th className="p-2">客先</th><th className="p-2">状態</th><th className="p-2">最終閲覧</th><th className="p-2 text-right">閲覧</th><th className="p-2 text-right">依頼</th><th className="p-2 text-right">見送り</th><th className="p-2">発行</th><th className="p-2" />
          </tr></thead>
          <tbody>
            {lk.state === 'loading' && <tr><td colSpan={8} className="p-5 text-faint">読み込み中…</td></tr>}
            {lk.state !== 'loading' && !sorted.length && <tr><td colSpan={8} className="p-5 text-faint">まだリンクがありません</td></tr>}
            {sorted.map((l) => { const off = !!l.revoked_at, url = urlOf(l.token), isOpen = open === l.id; return (<Fragment key={l.id}>
              <tr className="border-b border-line-soft align-top" style={off ? { opacity: 0.55 } : undefined}>
                <td className="p-2"><b>{l.label}</b>{l.note && <div className="text-[11.5px] text-faint">{l.note}</div>}</td>
                <td className="p-2">{off ? <span className="chip" style={tone('mute')}>停止 {dt(l.revoked_at)}</span> : <span className="chip" style={tone('ok')}>有効</span>}</td>
                <td className="p-2 text-muted">{dt(l.last_seen_at)}</td>
                <td className="num p-2 text-right">{l.view_count}</td><td className="num p-2 text-right">{l.counts.request}</td><td className="num p-2 text-right">{l.counts.decline}</td>
                <td className="p-2 text-muted">{dt(l.created_at)}</td>
                <td className="p-2"><div className="flex flex-wrap justify-end gap-1.5">
                  {!off && (url ? <button className={ghost} onClick={() => copy(url)}><Copy size={12} />URL をコピー</button> : <span className="text-[11.5px] text-faint">URL を作り直すと出ます</span>)}
                  <button className={ghost} onClick={() => setOpen(isOpen ? null : l.id)}>{isOpen ? '閉じる' : '詳細'}</button>
                  {!off && <button className={ghost} disabled={!can || !!busy} title={can ? undefined : needText('edit')} onClick={() => setConfirm({ id: l.id, op: 'reissue' })}><RefreshCw size={12} />URL を作り直す</button>}
                  {!off && <button className={ghost} disabled={!can || !!busy} title={can ? undefined : needText('edit')} onClick={() => setConfirm({ id: l.id, op: 'revoke' })} style={{ color: 'var(--tone-bad-fg)' }}>停止</button>}
                </div></td>
              </tr>
              {isOpen && (
                <tr className="border-b border-line-soft bg-soft">
                  <td colSpan={8} className="p-3">
                    <div className="flex flex-col gap-2.5">
                      {!off && <div className="flex flex-col gap-1 text-[12px] text-muted">よろずやでメンションする人<Chips cands={cands} sel={new Set((l.mention ?? []).map((m) => m.uid))} disabled={!can || busy === l.id + 'm'} onToggle={(u) => setMentionFor(l, u)} /></div>}
                      <div className="text-[12px] text-muted">発行 {l.created_by}</div>
                      <div className="flex flex-col gap-1"><b className="text-[12.5px]">最近の依頼・見送り</b>
                        {l.events.length === 0 ? <span className="text-[12px] text-faint">まだありません</span> : l.events.map((e, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-1.5 text-[12px]">
                            <span className="text-faint">{dt(e.created_at)}</span>
                            <span className="chip" style={tone(e.kind === 'request' ? 'info' : 'mute')}>{e.kind === 'request' ? '意向確認の依頼' : '見送り'}</span>
                            <PersonName name={e.target_name} />
                            {e.reason && <span className="text-muted">理由：{e.reason}</span>}
                            {e.case_no && <span className="text-muted">案件 {e.case_no}</span>}
                            {e.source && <span className="text-faint">（{e.source === 'match' ? '案件から探す' : '人財カタログ'}）</span>}
                          </div>))}
                      </div>
                    </div>
                  </td>
                </tr>)}
            </Fragment>); })}
          </tbody>
        </table>
      </section>

      {confirm && (
        <div className="mo-fade-up fixed bottom-5 left-1/2 z-30 flex max-w-[calc(100%-32px)] -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] shadow-lg">
          <span>{confirm.op === 'revoke' ? 'このリンクを停止します。客先はすぐ開けなくなります。' : 'URL を作り直します。前の URL は使えなくなります。'}</span>
          <button className={ghost} onClick={() => setConfirm(null)}>やめる</button>
          <button className="btn-primary min-h-8 rounded-lg px-3 text-[12.5px] font-semibold" onClick={doConfirm}>{confirm.op === 'revoke' ? '停止する' : '作り直す'}</button>
        </div>
      )}
    </main>
  );
}
