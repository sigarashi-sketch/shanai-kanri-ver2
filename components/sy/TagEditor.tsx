'use client';
import { useEffect, useState } from 'react';
import { Plus, Tag, X } from 'lucide-react';
import type { Member } from '@/components/sy/compat';
import { fx } from '@/components/sy/compat';

// 手で付けるタグ（0016 tags / member_tags）。配信の「条件で絞る → タグ」とチャットの絞り込みに出る（lib/tags.ts）
export interface ManualTag { id: string; name: string; count: number }

function useTagMaster() {
  const [tags, setTags] = useState<ManualTag[] | null>(null);
  useEffect(() => { fetch('/api/sy/s/tags').then((r) => r.json()).then((j) => setTags(j.tags || [])).catch(() => setTags([])); }, []);
  return [tags, setTags] as const;
}
async function post(url: string, body: unknown): Promise<{ ok: boolean; j: Record<string, unknown> }> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  if (!r || !r.ok) fx.toast(String(j.error || '保存に失敗しました'), 'err');
  return { ok: !!r && r.ok, j };
}
async function createTag(name: string): Promise<ManualTag | null> {
  const { ok, j } = await post('/api/sy/s/tags', { name });
  return ok ? (j.tag as ManualTag) : null;
}

// 1人ぶん：名簿の詳細（MemberDrawer）に置く。押すと付く・もう一度押すと外れる。新しいタグもここで作れる
export function TagEditor({ m, onPatch }: { m: Member; onPatch: (p: Partial<Member>) => void }) {
  const [tags, setTags] = useTagMaster();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [tidy, setTidy] = useState(false);

  async function toggle(t: ManualTag) {
    const on = !m.tags.includes(t.name);
    setBusy(true);
    const { ok } = await post('/api/sy/s/member-tags', { tagId: t.id, on, people: [{ key: m.key, name: m.name }] });
    setBusy(false);
    if (!ok) return;
    onPatch({ tags: on ? [...m.tags, t.name] : m.tags.filter((x) => x !== t.name) });
    setTags((ts) => ts && ts.map((x) => (x.id === t.id ? { ...x, count: x.count + (on ? 1 : -1) } : x)));
  }
  async function add() {
    const n = name.trim(); if (!n) return;
    const hit = (tags || []).find((t) => t.name === n);
    if (hit) { setName(''); if (!m.tags.includes(n)) await toggle(hit); return; }
    setBusy(true);
    const t = await createTag(n);
    if (!t) { setBusy(false); return; }
    const { ok } = await post('/api/sy/s/member-tags', { tagId: t.id, on: true, people: [{ key: m.key, name: m.name }] });
    setBusy(false); setName('');
    setTags((ts) => [...(ts || []), { ...t, count: ok ? 1 : 0 }]);
    if (ok) { onPatch({ tags: [...m.tags, t.name] }); fx.toast(`タグ「${t.name}」を作って付けました`); }
  }
  async function remove(t: ManualTag) {
    if (!confirm(`タグ「${t.name}」を消します。付いている${t.count}人全員から外れます。よろしいですか？`)) return;
    setBusy(true);
    const { ok } = await post('/api/sy/s/tags', { action: 'delete', id: t.id });
    setBusy(false);
    if (!ok) return;
    setTags((ts) => ts && ts.filter((x) => x.id !== t.id));
    if (m.tags.includes(t.name)) onPatch({ tags: m.tags.filter((x) => x !== t.name) });
    fx.toast(`タグ「${t.name}」を消しました（ほかの画面は開き直すと反映されます）`);
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-xs text-ig-muted"><Tag size={13} />タグ（配信・チャットの絞り込みに使えます）
        {!!tags?.length && <button onClick={() => setTidy((x) => !x)} className="ml-auto underline">{tidy ? '整理を終える' : 'タグを整理'}</button>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags === null && <span className="text-xs text-ig-muted">読み込み中…</span>}
        {(tags || []).map((t) => {
          const on = m.tags.includes(t.name);
          return tidy
            ? <button key={t.id} disabled={busy} onClick={() => remove(t)} title="このタグを消す" className="inline-flex items-center gap-1 rounded-lg bg-ig-hover px-2.5 py-1 text-xs font-semibold text-ig-danger">{t.name}<span className="font-normal text-ig-muted">{t.count}人</span><X size={12} /></button>
            : <button key={t.id} disabled={busy} onClick={() => toggle(t)} className={`ig-press rounded-lg px-2.5 py-1 text-xs font-semibold ${on ? 'bg-ig-text text-white' : 'bg-ig-hover text-ig-text'}`}>{t.name}</button>;
        })}
        {!tidy && (
          <span className="inline-flex items-center gap-1">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="新しいタグ" disabled={busy}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); }}
              className="w-28 rounded-lg border border-ig-border px-2 py-1 text-xs outline-none focus:border-ig-muted" />
            <button disabled={busy || !name.trim()} onClick={add} className="inline-flex items-center gap-0.5 rounded-lg bg-ig-hover px-2 py-1 text-xs font-semibold text-ig-text disabled:opacity-40"><Plus size={12} />付ける</button>
          </span>
        )}
      </div>
    </div>
  );
}

// まとめて：名簿でいま表示している人たち全員に、1つのタグを付ける・外す
export function BulkTag({ people, onDone, onClose }: { people: Member[]; onDone: (name: string, on: boolean) => void; onClose: () => void }) {
  const [tags, setTags] = useTagMaster();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(on: boolean) {
    const n = name.trim(); if (!n || !people.length) return;
    let t = (tags || []).find((x) => x.name === n) || null;
    if (!t && !on) { fx.toast(`タグ「${n}」はありません`, 'err'); return; }
    if (!confirm(`表示中の${people.length}人${on ? `にタグ「${n}」を付けます` : `からタグ「${n}」を外します`}${!t ? '（新しく作ります）' : ''}。よろしいですか？`)) return;
    setBusy(true);
    if (!t) { t = await createTag(n); if (!t) { setBusy(false); return; } setTags((ts) => [...(ts || []), t!]); }
    const { ok } = await post('/api/sy/s/member-tags', { tagId: t.id, on, people: people.map((p) => ({ key: p.key, name: p.name })) });
    setBusy(false);
    if (!ok) return;
    onDone(t.name, on);
    fx.toast(on ? `${people.length}人にタグ「${t.name}」を付けました` : `${people.length}人からタグ「${t.name}」を外しました`);
  }

  return (
    <div className="mx-4 mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-ig-subtle px-3 py-2 text-xs md:mx-8">
      <Tag size={13} className="text-ig-muted" /><span>表示中の <b>{people.length}人</b> に</span>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} list="bulk-tag-names" placeholder="タグの名前（選ぶか新しく入れる）" disabled={busy}
        className="w-56 rounded-lg border border-ig-border bg-white px-2 py-1 text-xs outline-none focus:border-ig-muted" />
      <datalist id="bulk-tag-names">{(tags || []).map((t) => <option key={t.id} value={t.name} />)}</datalist>
      <button disabled={busy || !name.trim() || !people.length} onClick={() => run(true)} className="rounded-lg bg-ig-primary px-3 py-1 font-semibold text-white disabled:opacity-40">付ける</button>
      <button disabled={busy || !name.trim() || !people.length} onClick={() => run(false)} className="rounded-lg bg-ig-hover px-3 py-1 font-semibold text-ig-text disabled:opacity-40">外す</button>
      <button onClick={onClose} className="ml-auto text-ig-muted underline">閉じる</button>
    </div>
  );
}
