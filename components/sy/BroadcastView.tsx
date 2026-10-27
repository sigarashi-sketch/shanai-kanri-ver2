'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Member } from '@/components/sy/compat';
import { STATUS_KEYS } from '@/lib/sy/stages';
import { useLineUsers, LineNotConfigured, type LineUser } from '@/components/sy/useLineUsers';
import { useRoster } from '@/components/sy/useRoster';
import { CheckCheck, Dumbbell, Search, Send, Tag, UsersRound } from 'lucide-react';
import { fx } from '@/components/sy/compat';
import { AttachButton, AttachPreview, useAttach, type AttachCtl } from '@/components/sy/Attach';
import { allTags, tagsOf } from '@/lib/sy/tags';
import { Avatar, Chip, PageHeader, StageBadge, TagBadge, ago, btnPrimary, inputCls } from '@/components/sy/ui';

interface Bc { id: string; text: string; target_count: number; sent_count: number; failed_count: number; error: string; created_by_name: string; created_by: string; created_at: string; filter: { label?: string; media?: { image?: { path: string } | null; pdf?: { name: string } | null; video?: { name: string } | null } } }
type Mode = 'all' | 'filter' | 'pick';
const NAME_ASK_ALL = 'いつもありがとうございます！\n担当者とのやりとりをスムーズにするため、お名前の登録をお願いしています。\n\nお手数ですが、このメッセージに「登録」とだけ返信してください。登録用のリンクをお送りします。';

// 宛先の絞り込み：全員 / 条件（タグ・状態・コミュニティ・部活・採用担当＝各グループ内はOR、グループ間はAND）/ 個別に選ぶ
//   タグは lib/tags.ts の一覧（チャットのバッジと同じ。自動のタグ＋手で付けたタグ）。足せばここにも出る
export default function BroadcastView() {
  const { users, configured, bot } = useLineUsers();
  const { members, clubs } = useRoster();
  const [mode, setMode] = useState<Mode>('filter');
  const [fStatus, setFStatus] = useState<string[]>([]);
  const [fComm, setFComm] = useState<string[]>([]);
  const [fClub, setFClub] = useState<string[]>([]);
  const [fRt, setFRt] = useState<string[]>([]);
  const [fTag, setFTag] = useState<string[]>([]);   // タグの名前（label）
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [pq, setPq] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [hist, setHist] = useState<Bc[]>([]);
  const at = useAttach();
  const nMsg = 1 + (at.image ? 1 : 0) + (at.video ? 1 : 0) + (at.pdf ? 1 : 0);   // 通数は 吹き出しの数×宛先
  const loadHist = () => fetch('/api/sy/s/line/broadcast').then((r) => r.json()).then((j) => setHist(j.broadcasts || []));
  useEffect(() => { loadHist(); }, []);

  const memberOf = useMemo(() => new Map((members || []).map((m) => [m.key, m])), [members]);
  const friends = useMemo(() => (users || []).filter((u) => u.followed), [users]);
  // ぼうさん（接触禁止）は 宛先の候補に入れない（タグ・状態・個別のどれで選んでも出ない。サーバでも外す）
  const all = friends.map((u) => ({ u, m: memberOf.get(u.subject_key) || null }));
  const nStop = all.filter((x) => x.m?.bousan).length;
  const linked = all.filter((x) => !x.m?.bousan);
  const opts = useMemo(() => {
    const ms = linked.map((x) => x.m).filter(Boolean) as Member[];
    const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
    return {
      status: STATUS_KEYS.filter((s) => ms.some((m) => m.status === s)),
      comm: uniq(ms.map((m) => m.community)), rt: uniq(ms.map((m) => m.recruitTantou)),
      club: clubs.map((c) => c.name),
      tag: allTags(ms).map((t) => t.label), tagCount: Object.fromEntries(allTags(ms).map((t) => [t.label, ms.filter((m) => t.on(m)).length])),
    };
  }, [linked, clubs]); // eslint-disable-line react-hooks/exhaustive-deps

  const targets: { u: LineUser; m: Member | null }[] = useMemo(() => {
    if (mode === 'all') return linked;
    if (mode === 'pick') return linked.filter((x) => picked.has(x.u.user_id));
    const any = fTag.length || fStatus.length || fComm.length || fClub.length || fRt.length;
    if (!any) return [];
    return linked.filter(({ m }) => m && (!fTag.length || tagsOf(m).some((t) => fTag.includes(t.label))) &&
      (!fStatus.length || fStatus.includes(m.status)) && (!fComm.length || fComm.includes(m.community)) &&
      (!fClub.length || m.clubs.some((c) => fClub.includes(c))) && (!fRt.length || fRt.includes(m.recruitTantou)));
  }, [mode, linked, picked, fTag, fStatus, fComm, fClub, fRt]); // eslint-disable-line react-hooks/exhaustive-deps
  const finalTo = targets.filter((x) => !excluded.has(x.u.user_id));

  const label = mode === 'all' ? '友だち全員' : mode === 'pick' ? '個別に選択'
    : [fTag.length && 'タグ:' + fTag.join('/'), fStatus.length && '状態:' + fStatus.join('/'), fComm.length && 'コミュニティ:' + fComm.join('/'), fClub.length && '部活:' + fClub.join('/'), fRt.length && '採用担当:' + fRt.join('/')].filter(Boolean).join('・');

  async function send() {
    if (mode === 'all') return sendAll(text);
    if (!finalTo.length || !text.trim()) return;
    if (!confirm(`${finalTo.length}人に配信します${nMsg > 1 ? `（添付つき・1人あたり${nMsg}通ぶん）` : ''}。よろしいですか？\n\n宛先：${label}\n\n${text.slice(0, 200)}`)) return;
    setBusy(true); setMsg('');
    const r = await fetch('/api/sy/s/line/broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, userIds: finalTo.map((x) => x.u.user_id), filter: { label, mode, fTag, fStatus, fComm, fClub, fRt }, ...at.payload }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg('送信に失敗しました：' + (j.error || '')); fx.toast('送信に失敗しました', 'err'); return; }
    setMsg(`${j.sent}人に送りました${j.failed ? `（${j.failed}人は失敗：${j.error}）` : ''}`); setText(''); at.clear(); loadHist();
    fx.hit('broadcast'); fx.fanfare({ title: '配信しました', name: `${j.sent}人`, sub: label });
  }


  async function sendAll(body: string) {
    if (!body.trim()) return;
    if (!confirm(`友だち全員に一斉送信します（採用版に出ていない友だちにも届きます）。${nStop ? `\n\n★「ぼうさん（接触禁止）」の ${nStop}人にも届きます（LINE の一斉送信は 相手を選べません）。届けたくないときは「条件で絞る」で送ってください。\n\n` : ''}友だちの人数ぶん、月の通数を使います。よろしいですか？\n\n${body.slice(0, 200)}`)) return;
    setBusy(true); setMsg('');
    const r = await fetch('/api/sy/s/line/broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true, text: body, filter: { label: '友だち全員（LINE一斉送信）', mode: 'all' }, ...at.payload }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg('送信に失敗しました：' + (j.error || '')); fx.toast('送信に失敗しました', 'err'); return; }
    setMsg('友だち全員に送りました'); setText(''); at.clear(); loadHist();
    fx.hit('broadcast'); fx.fanfare({ title: '配信しました', name: '友だち全員', sub: 'LINE一斉送信' });
  }

  return (
    <div>
      <PageHeader title="配信" sub={users ? `友だち ${friends.length}人（名簿と紐付け済み ${linked.filter((x) => x.m).length}人）` : '読み込み中…'} />
      {!configured && <LineNotConfigured />}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-6 p-4 md:px-8 md:py-6">
        <div className="space-y-4">
          <section className="rounded-lg bg-white p-4 ring-1 ring-ig-border space-y-3">
            <h2 className="text-sm font-bold">1. 宛先</h2>
            <div className="flex gap-1">
              {([['all', '友だち全員'], ['filter', '条件で絞る'], ['pick', '個別に選ぶ']] as [Mode, string][]).map(([k, l]) => (
                <Chip key={k} on={mode === k} onClick={() => { setMode(k); setExcluded(new Set()); }}>{l}</Chip>
              ))}
            </div>
            {mode === 'all' && (
              <div className="rounded-lg bg-ig-subtle p-3 text-xs text-ig-text space-y-2">
                <p>LINEの一斉送信で、採用版にまだ出ていない友だちも含めて全員に届きます（右の一覧は採用版が知っている人だけです）。</p>
              </div>
            )}
            {mode === 'filter' && (
              <div className="space-y-3 text-sm">
                <div><div className="mb-1 flex items-center gap-1 text-xs text-ig-muted"><Tag size={13} />タグ</div><Chips all={opts.tag} sel={fTag} set={setFTag} count={opts.tagCount} /></div>
                <div><div className="mb-1 text-xs text-ig-muted">状態・ステージ</div><Chips all={opts.status} sel={fStatus} set={setFStatus} /></div>
                <div><div className="mb-1 flex items-center gap-1 text-xs text-ig-muted"><UsersRound size={13} />コミュニティ</div><Chips all={opts.comm} sel={fComm} set={setFComm} /></div>
                <div><div className="mb-1 flex items-center gap-1 text-xs text-ig-muted"><Dumbbell size={13} />部活</div><Chips all={opts.club} sel={fClub} set={setFClub} /></div>
                <div><div className="mb-1 text-xs text-ig-muted">採用担当</div><Chips all={opts.rt} sel={fRt} set={setFRt} /></div>
              </div>
            )}
            {mode === 'pick' && (
              <div>
                <label className="relative mb-2 block w-64"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ig-muted" /><input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="名前で探す" className={`${inputCls} w-full pl-9`} /></label>
                <div className="max-h-72 overflow-y-auto divide-y divide-ig-divider rounded-lg ring-1 ring-ig-border">
                  {linked.filter(({ u, m }) => !pq || (u.display_name + (m?.name || u.subject_name)).includes(pq)).map(({ u, m }) => (
                    <label key={u.user_id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-ig-hover">
                      <input type="checkbox" checked={picked.has(u.user_id)} onChange={(e) => { const s = new Set(picked); if (e.target.checked) s.add(u.user_id); else s.delete(u.user_id); setPicked(s); }} />
                      <span className="flex-1">{m?.name || u.subject_name || u.display_name}<span className="ml-1 text-xs text-ig-muted">({u.display_name})</span></span>
                      {m && <StageBadge stage={m.status} />}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-lg bg-white p-4 ring-1 ring-ig-border space-y-2">
            <h2 className="text-sm font-bold">2. 本文</h2>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} maxLength={5000} placeholder="配信するメッセージ" className={`${inputCls} w-full`} />
            <AttachPreview at={at} />
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs text-ig-muted"><AttachButton at={at} />{text.length} / 5000{nMsg > 1 && `・添付つきは1人あたり${nMsg}通ぶん`}</span>
              <button disabled={busy || at.busy || (mode !== 'all' && !finalTo.length) || !text.trim() || !configured} onClick={send}
                className={`ig-press inline-flex items-center gap-1.5 ${btnPrimary}`}><Send size={15} strokeWidth={2.2} />{busy ? '送信中…' : mode === 'all' ? '友だち全員に配信する' : `${finalTo.length}人に配信する`}</button>
            </div>
            {msg && <p className="text-sm">{msg}</p>}
          </section>
        </div>

        <div className="space-y-4">
          <DmPreview at={at} text={text} botName={bot?.name || 'インフォメーション'} count={mode === 'all' ? null : finalTo.length} />
          <section className="rounded-lg bg-white ring-1 ring-ig-border">
            <header className="flex items-center justify-between border-b border-ig-divider px-4 py-2.5">
              <h2 className="text-sm font-bold">宛先の確認</h2><span className="text-xs text-ig-muted">{finalTo.length}人{nStop > 0 && mode !== 'all' && `（ぼうさん ${nStop}人は 外してあります）`}</span>
            </header>
            <ul className="max-h-80 overflow-y-auto divide-y divide-ig-divider">
              {targets.length === 0 && <li className="p-4 text-center text-xs text-ig-muted">{mode === 'filter' ? '条件を選ぶとここに出ます' : '0人'}</li>}
              {targets.map(({ u, m }) => (
                <li key={u.user_id} className="flex items-center gap-2 px-4 py-1.5 text-sm">
                  <input type="checkbox" checked={!excluded.has(u.user_id)} title="外す" onChange={(e) => { const s = new Set(excluded); if (e.target.checked) s.delete(u.user_id); else s.add(u.user_id); setExcluded(s); }} />
                  <span className="flex-1 truncate">{m?.name || u.subject_name || u.display_name}</span>
                  {tagsOf(m).map((t) => <TagBadge key={t.key} tag={t} />)}
                  {m ? <StageBadge stage={m.status} /> : <span className="text-[10px] text-ig-warn">未紐付け</span>}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-lg bg-white ring-1 ring-ig-border">
            <header className="border-b border-ig-divider px-4 py-2.5"><h2 className="text-sm font-bold">配信の履歴</h2></header>
            <ul className="max-h-96 overflow-y-auto divide-y divide-ig-divider">
              {hist.length === 0 && <li className="p-4 text-center text-xs text-ig-muted">まだありません</li>}
              {hist.map((h) => (
                <li key={h.id} className="px-4 py-2 text-sm">
                  <div suppressHydrationWarning className="text-xs text-ig-muted">{ago(h.created_at)}・{h.created_by_name || h.created_by}・{h.filter?.label}</div>
                  <div className="line-clamp-2 whitespace-pre-wrap">{h.text}</div>
                  {h.filter?.media && <div className="text-xs text-ig-muted">添付：{[h.filter.media.image && '画像', h.filter.media.video && `動画（${h.filter.media.video.name}）`, h.filter.media.pdf && `PDF（${h.filter.media.pdf.name}）`].filter(Boolean).join('・')}</div>}
                  <div className="text-xs text-ig-muted">{h.sent_count < 0 ? '友だち全員に送信' : `送信 ${h.sent_count}人`}{h.failed_count ? ` / 失敗 ${h.failed_count}人` : ''}</div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Chips({ all, sel, set, count }: { all: string[]; sel: string[]; set: (v: string[]) => void; count?: Record<string, number> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.length === 0 && <span className="text-xs text-ig-muted">該当なし</span>}
      {all.map((v) => { const on = sel.includes(v); return (
        <button key={v} onClick={() => set(on ? sel.filter((x) => x !== v) : [...sel, v])}
          className={`rounded-full px-2.5 py-1 text-xs ring-1 ${on ? 'bg-ig-primary text-white ring-ig-text' : 'bg-white text-ig-text ring-ig-border'}`}>{v}{count && <span className="ml-1 opacity-70">{count[v] || 0}</span>}</button>); })}
    </div>
  );
}

// 受け取る人のスマホでどう見えるか（Instagram の DM 風に再現）
function DmPreview({ text, botName, count, at }: { text: string; botName: string; count: number | null; at: AttachCtl }) {
  const now = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  return (
    <section className="mx-auto w-full max-w-[320px]">
      <div className="text-center text-xs font-semibold text-ig-muted mb-2">プレビュー{count != null && `（${count}人に届きます）`}</div>
      <div className="overflow-hidden rounded-[36px] border-[10px] border-ig-text bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-ig-divider px-4 py-3">
          <Avatar name={botName} size="sm" ring />
          <div className="leading-tight"><div className="text-sm font-semibold">{botName}</div><div className="text-[11px] text-ig-muted">公式アカウント</div></div>
        </div>
        <div className="flex min-h-[300px] flex-col justify-end gap-1 bg-white px-3 py-4">
          <div className="text-center text-[11px] text-ig-muted mb-2">今日 {now}</div>
          {text.trim() ? (
            <div className="flex items-end gap-2">
              <Avatar name={botName} size="sm" />
              <div key={text.length > 0 ? 'on' : 'off'} className="ig-pop max-w-[80%] whitespace-pre-wrap break-words rounded-[22px] bg-ig-bubble-in px-4 py-2 text-[14px] leading-snug">{text}</div>
            </div>
          ) : (
            <div className="flex items-end gap-2"><Avatar name={botName} size="sm" /><div className="rounded-[22px] bg-ig-bubble-in px-4 py-3"><span className="ig-typing flex gap-1"><span /><span /><span /></span></div></div>
          )}
          {at.image && <div className="ml-10">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={at.image.thumb} alt="" className="max-h-40 rounded-2xl border border-ig-divider" /></div>}
          {at.video && (
            <div className="relative ml-10 w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={at.video.thumbUrl} alt="" className="max-h-40 rounded-2xl border border-ig-divider" />
              <span className="absolute inset-0 m-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white">▶</span>
            </div>
          )}
          {at.pdf && (
            <div className="ml-10 w-48 overflow-hidden rounded-2xl border border-ig-divider text-[12px]">
              <div className="space-y-0.5 p-3"><div className="text-[10px] font-bold text-ig-danger">PDF</div><div className="line-clamp-3 break-all font-semibold">{at.pdf.name}</div></div>
              <div className="px-3 pb-3"><div className="rounded-lg bg-[#06c755] py-1.5 text-center font-semibold text-white">PDFを開く</div></div>
            </div>
          )}
          {text.trim() && <div className="mt-1 flex items-center justify-end gap-1 pr-1 text-[10px] text-ig-muted"><CheckCheck size={12} />送信前</div>}
        </div>
        <div className="border-t border-ig-divider px-3 py-2"><div className="rounded-full border border-ig-border px-4 py-1.5 text-xs text-ig-muted">メッセージを入力…</div></div>
      </div>
    </section>
  );
}
