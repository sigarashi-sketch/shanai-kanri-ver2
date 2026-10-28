'use client';

import { useMemo, useState } from 'react';
import { Link2, Link2Off, RotateCw, X } from 'lucide-react';
import { useIke } from '../Live';
import { needText } from '../Perms';
import { normName } from '@/lib/live/eigyo-common';

// チャット（1:1）の「紐付け」（10-28 shoya「チャットの紐付けできないやんけ」）。今の chat.html の 連絡先の紐付け と同じ：
//   ・候補：予約フォームの名前（無ければ LINE の表示名）に近い 営業リストの氏名 上位3件（GET chat?action=suggest）。押すと確かめてから紐付け
//   ・氏名で探す：営業リストの氏名（GET chat?action=rosterNames・かな西の人は神奈川の要員だけ＝今の API が絞る）。候補に無い名前も打って保存できる
//   ・↻：営業リストに足した人が候補に出ないとき（今の refreshRoster）
//   ・紐付け解除：未紐付けに戻す（name を空で保存＝今の API と同じ）
//   書く口は /api/live/chat-link（今の POST /api/chat?action=link だけ）。紐付けで一覧の名前・営業中/稼働中の振り分けも変わる
type Suggest = { candidates?: { name: string }[] };
type Names = { names?: string[] };
const MAX = 30;

export function ChatLink({ userId, linked, linkedName, canEdit, onClose }: { userId: string; linked: boolean; linkedName: string; canEdit: boolean; onClose: () => void }) {
  const sg = useIke<Suggest>(`chat?action=suggest&userId=${encodeURIComponent(userId)}`, { pollMs: 0 });
  const rn = useIke<Names>('chat?action=rosterNames', { pollMs: 0 });
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'bad' | 'info'; text: string } | null>(null);

  const hits = useMemo(() => {
    const k = normName(q).toLowerCase();
    if (!k) return [];
    return (rn.data?.names ?? []).filter((n) => normName(n).toLowerCase().includes(k));
  }, [q, rn.data]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/live/chat-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; matched?: boolean; officialName?: string; reason?: string; count?: number };
    if (!r.ok || !j.ok) throw new Error(j.error || `保存できませんでした（${r.status}）`);
    return j;
  };

  const save = async (name: string, ask: boolean) => {
    const n = name.trim();
    if (!n) { setMsg({ tone: 'warn', text: '氏名が空です。外すときは「紐付け解除」を押してください' }); return; }
    if (ask && !confirm(`この連絡先を「${n}」に紐付けますか？`)) return;
    setBusy(true); setMsg(null);
    try {
      const j = await post({ userId, name: n });
      setQ('');
      setMsg(j.matched ? { tone: 'ok', text: `営業リストと一致：「${j.officialName || n}」で紐付けました` }
        : j.reason === 'ambiguous' ? { tone: 'warn', text: '同じ名前が複数あるので、打った名前のまま保存しました' }
        : { tone: 'info', text: '営業リストに無い名前のまま保存しました（リストに載ったら自動で照合し直します）' });
    } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); }
    setBusy(false);
  };

  const unlink = async () => {
    if (!confirm('この連絡先の紐付けを解除しますか？（未紐付けに戻ります）')) return;
    setBusy(true); setMsg(null);
    try { await post({ userId, name: '' }); setMsg({ tone: 'info', text: '紐付けを解除しました' }); }
    catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); }
    setBusy(false);
  };

  const refresh = async () => {
    setBusy(true); setMsg({ tone: 'info', text: '営業リストを読み直しています…' });
    try { const j = await post({ refresh: true }); await rn.reload(); setMsg({ tone: 'ok', text: `営業リストを読み直しました（候補 ${j.count ?? 0} 件）` }); }
    catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); }
    setBusy(false);
  };

  const cands = sg.data?.candidates ?? [];
  const off = busy || !canEdit;
  const tone = msg && { ok: 'var(--tone-ok-fg)', warn: 'var(--tone-caution-fg)', bad: 'var(--tone-bad-fg)', info: 'var(--tone-mute-fg)' }[msg.tone];

  return (
    <div className="mo-fade-up flex flex-col gap-2 border-b border-line-soft bg-soft px-4 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <b className="text-ink">連絡先の紐付け</b>
        <span className="min-w-0 flex-1 truncate text-muted">{linked ? <>いま：<b className="text-ink">{linkedName || '（名前なし）'}</b></> : '未紐付け（営業リストの氏名と結びつけます）'}</span>
        {linked && <button type="button" onClick={unlink} disabled={off} title={canEdit ? '未紐付けに戻す' : needText('edit')} className="inline-flex min-h-8 items-center gap-1 rounded-[10px] border border-field px-2 font-semibold text-bad disabled:opacity-40"><Link2Off size={13} />紐付け解除</button>}
        <button type="button" onClick={onClose} aria-label="紐付けを閉じる" className="inline-flex size-8 items-center justify-center rounded-[10px] text-muted hover:bg-sunken"><X size={15} /></button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-faint">候補</span>
        {sg.state === 'loading' && <span className="text-xs text-faint">読み込み中…</span>}
        {sg.state !== 'loading' && !cands.length && <span className="text-xs text-faint">近い名前はありません（下の欄で探してください）</span>}
        {cands.map((c) => (
          <button key={c.name} type="button" disabled={off} onClick={() => save(c.name, true)} title={canEdit ? `「${c.name}」に紐付ける` : needText('edit')}
            className="rounded-full border px-2.5 py-0.5 font-semibold disabled:opacity-40" style={{ borderColor: 'var(--tone-ok-fg)', color: 'var(--tone-ok-fg)' }}>{c.name}</button>
        ))}
      </div>
      <div className="relative flex items-center gap-1.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && !off) save(q, false); }}
          aria-label="紐付ける氏名" placeholder="氏名で探す（候補に無い名前も打って保存できます）" disabled={!canEdit}
          className="min-h-9 min-w-0 flex-1 rounded-[10px] border border-field bg-transparent px-3 text-body text-ink outline-none" />
        <button type="button" onClick={refresh} disabled={off} title="営業リストに足した人が候補に出ないとき押す（候補を今すぐ読み直す）" aria-label="候補を読み直す" className="inline-flex size-9 items-center justify-center rounded-[10px] border border-field text-muted disabled:opacity-40"><RotateCw size={14} /></button>
        <button type="button" onClick={() => save(q, false)} disabled={off || !q.trim()} title={canEdit ? undefined : needText('edit')} className="inline-flex min-h-9 items-center gap-1 rounded-[10px] px-3 font-semibold disabled:opacity-40" style={{ background: 'var(--a)', color: 'var(--ao)' }}><Link2 size={14} />名前を保存</button>
        {!!hits.length && (
          <ul className="absolute left-0 right-24 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-[10px] border border-field bg-surface py-1 shadow-lg">
            {hits.slice(0, MAX).map((n) => (
              <li key={n}><button type="button" disabled={off} onClick={() => save(n, true)} className="w-full px-3 py-1.5 text-left text-body hover:bg-soft disabled:opacity-40">{n}</button></li>
            ))}
            {hits.length > MAX && <li className="px-3 py-1 text-xs text-faint">ほか {hits.length - MAX} 件（もう少し打って絞ってください）</li>}
          </ul>
        )}
      </div>
      {!canEdit && <p className="text-xs text-faint">{needText('edit')}</p>}
      {rn.error && <p className="text-xs text-bad">営業リストの氏名を読めませんでした（{rn.error}）</p>}
      {msg && <p className="text-xs font-semibold" style={{ color: tone || undefined }}>{msg.text}</p>}
    </div>
  );
}
