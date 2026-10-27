'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normName } from '@/lib/sy/name';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Ban, Check, IdCard, Pin, Search, Send, Trash2, Undo2 } from 'lucide-react';
import { AttachButton, AttachPreview, useAttach } from '@/components/sy/Attach';
import { Bubble, type Msg } from '@/components/sy/ChatBubble';
import { ballOn, waitDays } from '@/lib/sy/ball';
import { fx } from '@/components/sy/compat';
import type { Member, ProperLite } from '@/components/sy/compat';
import MemberDrawer from '@/components/sy/MemberDrawer';
import MemberInfo from '@/components/sy/MemberInfo';
import { useLineUsers, LineNotConfigured, type LegacyChat, type LineUser } from '@/components/sy/useLineUsers';
import { useRoster } from '@/components/sy/useRoster';
import { BOUSAN_TAG, allTags, tagsOf } from '@/lib/sy/tags';
import { PIN_COLORS, pinColor, type PinKind } from '@/lib/sy/pins';
import { Avatar, Chip, PageHeader, StageBadge, TagBadge, ago, btnGray, inputCls } from '@/components/sy/ui';
import { useKept } from '@/components/sy/compat';

type Filter = 'all' | 'ball' | 'unread' | 'unlinked' | 'staff' | `tag:${string}` | `pin:${string}`;   // tag:<key> は lib/tags.ts のタグ・pin:<id> は ピンの種類（lib/pins.ts）
// 紐付けの相手。従業員名簿＋候補者（Member）と、いけどんのプロパーリストだけに居る人（ProperLite）
interface Linkable { key: string; name: string; kana: string; status: string }

export default function ChatView() {
  const { users, setUsers, legacy, pinKinds, setPinKinds, configured, bot, reload } = useLineUsers(8000);
  const { members, proper, clubs, patchMember } = useRoster();
  const sp = useSearchParams();
  // 開いているトーク・絞り込み・検索は 更新しても戻す（lib/keep.ts）。?u= / ?k= で来たときはそちらが先
  const [sel, setSel] = useKept<string | null>('sel', sp.get('u'), !!(sp.get('u') || sp.get('k')));
  // ?k=<名簿の key> … その人のトークを開く（右クリックメニュー components/CtxMenu.tsx の「チャット」から。LINE の userId を知らない画面用）。最初の1回だけ
  const wantKey = useRef(sp.get('k'));
  useEffect(() => {
    if (!wantKey.current || !users) return;
    const hit = users.find((u) => u.subject_key === wantKey.current);
    wantKey.current = null;
    if (hit) setSel(hit.user_id);
  }, [users]);
  const [q, setQ] = useKept('q', '');
  const [filter, setFilter] = useKept<Filter>('filter', 'all');
  const [openKey, setOpenKey] = useKept<string | null>('open', null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);   // 一覧の行の右クリックメニュー
  // 右の欄＝開いている相手の情報（名簿の詳細と同じ中身）。広い画面だけ。ボタンを押したときだけ出す。
  //   最初は必ず閉じていて、開いたことは覚えない（2026-10-08 shoya「トリガーボタンに。出しっぱなしにならないように」）
  //   開いた相手を覚えておき、別の相手に切り替えたら閉じた状態に戻る（同日 shoya「相手を切り替えるたびに閉じる」）
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const infoOn = !!sel && infoFor === sel;
  const toggleInfo = useCallback(() => setInfoFor((x) => (x === sel ? null : sel)), [sel]);
  const memberOf = useMemo(() => new Map((members || []).map((m) => [m.key, m])), [members]);
  const properOf = useMemo(() => new Map(proper.map((p) => [p.key, p])), [proper]);
  const pool = useMemo<Linkable[] | null>(() => members && [...members, ...proper], [members, proper]);

  // その相手に付いているタグ（lib/tags.ts。名簿と紐付いている相手だけ分かる）。例: 月次アンケートに未回答の 稼働中・待機 ＝バッジ「アンケート未回答」
  const tagsFor = useCallback((key: string) => (key ? tagsOf(memberOf.get(key)) : []), [memberOf]);
  const tagHit = useCallback((key: string) => !filter.startsWith('tag:') || tagsFor(key).some((t) => 'tag:' + t.key === filter), [filter, tagsFor]);
  const list = useMemo(() => {
    const l = (users || []).filter((u) => {
      if (filter === 'ball' && !ballOn(u)) return false;
      if (!tagHit(u.subject_key)) return false;
      if (filter === 'unread' && !u.unread) return false;
      if (filter === 'unlinked' && (u.subject_key || u.staff)) return false;
      if (filter === 'staff' && !u.staff) return false;
      if (filter.startsWith('pin:') && !(u.pins || []).includes(filter.slice(4))) return false;
      const t = q.trim();
      return !t || [u.display_name, u.subject_name, u.claimed_name, u.last_text].join(' ').includes(t);
    });
    // 要対応だけ見るときは、待たせている順（最後の受信が古い順）
    if (filter === 'ball') return l.sort((a, b) => String(a.last_message_at).localeCompare(String(b.last_message_at)));
    // ピンが付いた相手を上に固める（その中の並びは元のまま＝新しくやりとりした順）
    return [...l.filter((u) => u.pins?.length), ...l.filter((u) => !u.pins?.length)];
  }, [users, q, filter, tagHit]);
  // 件数は絞り込み後ではなく一覧全体で数える（埋もれを防ぐのが目的）
  const ballCount = useMemo(() => (users || []).filter(ballOn).length, [users]);
  const tagList = useMemo(() => allTags((users || []).map((u) => memberOf.get(u.subject_key)).filter(Boolean) as Member[]), [users, memberOf]);
  const tagCount = useMemo(() => { const c: Record<string, number> = {}; (users || []).forEach((u) => tagsFor(u.subject_key).forEach((t) => { c[t.key] = (c[t.key] || 0) + 1; })); return c; }, [users, tagsFor]);
  const pinCount = useMemo(() => { const c: Record<string, number> = {}; (users || []).forEach((u) => (u.pins || []).forEach((k) => { c[k] = (c[k] || 0) + 1; })); return c; }, [users]);
  const cur = (users || []).find((u) => u.user_id === sel) || null;
  // まだ友だちとつながっていない過去トーク（管理画面から取り込み）。送信はできない＝見る・名簿と紐付けるだけ
  const legacyOnly = useMemo(() => legacy.filter((c) => !c.user_id).filter((c) => {
    if (filter === 'unread' || filter === 'ball' || filter === 'staff' || filter.startsWith('pin:')) return false;
    if (filter === 'unlinked' && c.subject_key) return false;
    if (!tagHit(c.subject_key)) return false;
    const t = q.trim(); return !t || [c.name, c.subject_name, c.last_text].join(' ').includes(t);
  }), [legacy, q, filter, tagHit]);
  const curLegacy = sel?.startsWith('L:') ? legacy.find((c) => 'L:' + c.chat_id === sel) || null : null;
  const curMember = memberOf.get((curLegacy ? curLegacy.subject_key : cur?.subject_key) || '') || null;
  const legacyOf = (uid: string) => legacy.filter((c) => c.user_id === uid);
  const onClose = useCallback(() => setOpenKey(null), []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const onPatch = useCallback((p: Partial<Member>) => openKey && patchMember(openKey, p), [openKey, patchMember]);
  const updateUser = (uid: string, p: Partial<LineUser>) => setUsers((us) => us && us.map((u) => (u.user_id === uid ? { ...u, ...p } : u)));
  // 「対応済み」/「要対応に戻す」。押した瞬間に画面へ反映し、裏でDBへ書く（失敗したら戻す）
  async function toggleBall(u: LineUser, restore: boolean) {
    const prev = u.ball_cleared_at ?? null;
    updateUser(u.user_id, { ball_cleared_at: restore ? null : (u.last_message_at || new Date().toISOString()) });
    const r = await fetch('/api/sy/s/line/ball', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: u.user_id, restore }) }).catch(() => null);
    if (!r || !r.ok) { updateUser(u.user_id, { ball_cleared_at: prev }); fx.toast((r && (await r.json().catch(() => ({}))).error) || '保存に失敗しました', 'err'); return; }
    if (!restore) fx.hit('line');
    fx.toast(restore ? '要対応に戻しました' : '対応済みにしました');
  }

  // 名前らしきもの（名乗りフォーム／あいさつに応えて送ってきた短い一言／LINEの表示名）が名簿の1人とだけ一致したら自動で紐付ける。
  //   同姓同名・該当なし・候補が2人以上に割れるときは人が選ぶ。
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!users || !pool) return;
    const byNorm = new Map<string, Linkable[]>();
    pool.forEach((m) => { const k = normName(m.name); byNorm.set(k, [...(byNorm.get(k) || []), m]); });
    const pick = (names: string[]) => {
      const hits = new Map<string, Linkable>();
      for (const n of names) { const h = byNorm.get(normName(n)) || []; if (h.length > 1) return null; if (h.length === 1) hits.set(h[0].key, h[0]); }
      return hits.size === 1 ? [...hits.values()][0] : null;
    };
    const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const jobs: (() => Promise<unknown>)[] = [];
    users.filter((u) => !u.subject_key && !tried.current.has('u' + u.user_id)).forEach((u) => {
      tried.current.add('u' + u.user_id);
      const m = pick([u.claimed_name, ...(u.name_guesses || []), u.display_name].filter(Boolean));
      if (m) jobs.push(() => post('/api/sy/s/line/link', { user: u.user_id, key: m.key, name: m.name, auto: true }).then((r) => r.ok && updateUser(u.user_id, { subject_key: m.key, subject_name: m.name })));
    });
    legacy.filter((c) => !c.user_id && !c.subject_key && !tried.current.has('l' + c.chat_id)).forEach((c) => {
      tried.current.add('l' + c.chat_id);
      const m = pick([...(c.name_guesses || []), c.name].filter(Boolean));
      if (m) jobs.push(() => post('/api/sy/s/line/legacy-link', { chat: c.chat_id, key: m.key, name: m.name }));
    });
    if (!jobs.length) return;
    (async () => { for (let i = 0; i < jobs.length; i += 5) await Promise.all(jobs.slice(i, i + 5).map((j) => j())); reload(); })();
  }, [users, legacy, pool]); // eslint-disable-line react-hooks/exhaustive-deps

  const [importMsg, setImportMsg] = useState('');
  async function importFollowers() {
    setImportMsg('取り込み中…');
    const r = await fetch('/api/sy/s/line/import', { method: 'POST' }); const j = await r.json();
    setImportMsg(r.ok ? `友だち${j.total}人のうち、新しく${j.added}人を取り込みました${j.remaining ? `（残り${j.remaining}人はもう一度押す）` : ''}` : j.error);
    reload();
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="チャット" sub={users ? `友だち ${users.filter((u) => u.followed).length}人・要対応 ${ballCount}人・未読 ${users.reduce((a, u) => a + (u.unread ? 1 : 0), 0)}人` : '読み込み中…'}>
        {bot?.addUrl && <a href={bot.addUrl} target="_blank" className="text-xs text-ig-primary underline">友だち追加URL（{bot.name} {bot.basicId}）</a>}
        {configured && <button onClick={importFollowers} className="rounded-lg px-2.5 py-1 text-xs ring-1 ring-ig-border hover:bg-ig-hover">既存の友だちを取り込む</button>}
      </PageHeader>
      {!configured && <LineNotConfigured />}
      {importMsg && <p className="mx-4 mt-2 rounded-lg bg-ig-hover px-3 py-2 text-xs text-ig-text">{importMsg}</p>}
      <div className="flex min-h-0 flex-1">
        <aside className={`${sel ? 'hidden md:flex' : 'flex'} w-full md:w-[360px] shrink-0 flex-col border-r border-ig-divider bg-white`}>
          <div className="space-y-2 p-3 border-b border-ig-divider">
            <label className="relative block"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ig-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="検索" className={`${inputCls} w-full bg-ig-hover border-transparent pl-9`} /></label>
            <div className="flex flex-wrap gap-1">
              {([['all', 'すべて'], ['ball', '要対応'], ['unread', '未読'], ['unlinked', '未紐付け'], ['staff', '内勤']] as [Filter, string][]).map(([k, l]) => (
                <Chip key={k} on={filter === k} onClick={() => setFilter(k)}>{l}{k === 'ball' && ballCount > 0 && <span className="ml-1 rounded-full bg-ig-danger px-1.5 text-[10px] text-white">{ballCount}</span>}</Chip>
              ))}
              {tagList.map((t) => (
                <Chip key={t.key} on={filter === 'tag:' + t.key} onClick={() => setFilter(`tag:${t.key}`)}>{t.label}{tagCount[t.key] > 0 && <span className={`ml-1 rounded-full px-1.5 text-[10px] text-white ${t.tone === 'plain' ? 'bg-ig-muted' : t.tone === 'stop' ? 'bg-ig-stop' : 'bg-ig-warn'}`}>{tagCount[t.key]}</span>}</Chip>
              ))}
              {pinKinds.map((k) => (
                <Chip key={k.id} on={filter === 'pin:' + k.id} onClick={() => setFilter(`pin:${k.id}`)}><Pin size={11} strokeWidth={2.25} className="mr-0.5 inline -translate-y-px" style={{ color: filter === 'pin:' + k.id ? undefined : pinColor(k.color) }} />{k.name}{pinCount[k.id] > 0 && <span className="ml-1 rounded-full px-1.5 text-[10px] text-white" style={{ background: pinColor(k.color) }}>{pinCount[k.id]}</span>}</Chip>
              ))}
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto divide-y divide-ig-divider">
            {users && list.length === 0 && legacyOnly.length === 0 && <li className="p-6 text-center text-xs text-ig-muted">{users.length ? '該当なし' : 'まだ友だちがいません。公式LINEを友だち追加してもらうとここに出ます。'}</li>}
            {list.map((u) => { const ball = ballOn(u); const wd = ball ? waitDays(u) : 0; const tags = tagsFor(u.subject_key); const stop = tags.some((t) => t.key === BOUSAN_TAG); const todo = !stop && tags.some((t) => t.row); return (
              <li key={u.user_id} data-ctx="native" onContextMenu={(e) => { e.preventDefault(); setMenu({ id: u.user_id, x: e.clientX, y: e.clientY }); }} className={`flex items-center ${stop ? (sel === u.user_id ? 'bg-ig-stop/30' : 'bg-ig-stop/15 hover:bg-ig-stop/25') : todo ? (sel === u.user_id ? 'bg-ig-warn/35' : 'bg-ig-warn/20 hover:bg-ig-warn/30') : sel === u.user_id ? 'bg-ig-hover' : ball ? 'bg-ig-danger/5 hover:bg-ig-danger/10' : 'hover:bg-ig-hover'} ${stop ? 'shadow-[inset_5px_0_0_var(--color-ig-stop)]' : ball ? 'shadow-[inset_3px_0_0_var(--color-ig-danger)]' : todo ? 'shadow-[inset_3px_0_0_var(--color-ig-warn)]' : u.staff ? 'shadow-[inset_3px_0_0_var(--color-ig-staff)]' : ''}`}>
                <button onClick={() => setSel(u.user_id)} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left">
                  <LineAvatar u={u} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className={`truncate text-sm ${u.unread || ball ? 'font-bold' : 'font-medium'} ${u.staff ? 'text-ig-staff' : ''}`}>{u.subject_name || u.claimed_name || u.display_name || '（名前なし）'}</span>
                      {ball && <span suppressHydrationWarning className="whitespace-nowrap rounded bg-ig-danger/10 px-1 text-[10px] font-semibold text-ig-danger">要対応{wd > 0 && `・${wd}日待ち`}</span>}
                      {pinKinds.filter((k) => u.pins?.includes(k.id)).map((k) => <PinBadge key={k.id} k={k} />)}
                      {tags.map((t) => <TagBadge key={t.key} tag={t} />)}
                      {!u.followed && <span className="rounded bg-ig-divider px-1 text-[10px] text-ig-text">ブロック</span>}
                      {u.staff ? <span className="whitespace-nowrap rounded bg-ig-staff px-1 text-[10px] font-semibold text-white">内勤</span>
                        : !u.subject_key && <span className="whitespace-nowrap rounded bg-ig-hover px-1 text-[10px] text-ig-warn">未紐付け</span>}
                    </div>
                    <div className={`truncate text-xs ${u.unread || ball ? 'font-semibold text-ig-text' : 'text-ig-muted'}`}>{u.last_direction === 'out' ? 'あなた: ' : ''}{u.last_text}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span suppressHydrationWarning className="text-[10px] text-ig-muted">{u.last_message_at ? ago(u.last_message_at) : ''}</span>
                    {u.unread > 0 && <span className="ig-pop h-2 w-2 rounded-full bg-ig-primary" title={`未読 ${u.unread}`} />}
                  </div>
                </button>
                {ball && <button onClick={() => toggleBall(u, false)} title="返信しなくてよいものを要対応から外します（相手からまた届けば自動で戻ります）"
                  className="ig-press mr-3 inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-ig-danger/40 bg-white px-2 py-1 text-[11px] font-semibold text-ig-danger hover:bg-ig-danger/10"><Check size={12} strokeWidth={2.25} />対応済み</button>}
              </li>
            ); })}
            {legacyOnly.length > 0 && <li className="bg-ig-subtle px-3 py-1.5 text-[11px] text-ig-muted">過去のトーク（採用版につなぐ前・まだメッセージが来ていない人）{legacyOnly.length}人</li>}
            {legacyOnly.map((c) => { const tags = tagsFor(c.subject_key); const stop = tags.some((t) => t.key === BOUSAN_TAG); const todo = !stop && tags.some((t) => t.row); return (
              <li key={c.chat_id} className={stop ? 'shadow-[inset_5px_0_0_var(--color-ig-stop)]' : todo ? 'shadow-[inset_3px_0_0_var(--color-ig-warn)]' : ''}>
                <button onClick={() => setSel('L:' + c.chat_id)} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${stop ? (sel === 'L:' + c.chat_id ? 'bg-ig-stop/30' : 'bg-ig-stop/15 hover:bg-ig-stop/25') : todo ? (sel === 'L:' + c.chat_id ? 'bg-ig-warn/35' : 'bg-ig-warn/20 hover:bg-ig-warn/30') : sel === 'L:' + c.chat_id ? 'bg-ig-hover' : 'hover:bg-ig-hover'}`}>
                  <Avatar name={c.name || '?'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-sm font-medium">{c.subject_name || c.name || '（名前なし）'}</span>
                      {tags.map((t) => <TagBadge key={t.key} tag={t} />)}
                      <span className="rounded bg-ig-divider px-1 text-[10px] text-ig-text">過去のみ</span>
                      {!c.friend && <span className="rounded bg-ig-divider px-1 text-[10px] text-ig-text">友だち外</span>}
                    </div>
                    <div className="truncate text-xs text-ig-muted">{c.last_text}</div>
                  </div>
                  <span suppressHydrationWarning className="text-[10px] text-ig-muted">{c.last_talked_at ? ago(c.last_talked_at) : ''}</span>
                </button>
              </li>
            ); })}
          </ul>
        </aside>
        <section className={`${sel ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col bg-white`}>
          {curLegacy ? <LegacyConversation key={curLegacy.chat_id} c={curLegacy} members={pool} member={memberOf.get(curLegacy.subject_key) || null} proper={properOf.get(curLegacy.subject_key) || null}
            onBack={() => setSel(null)} onOpenMember={setOpenKey} onReload={reload} infoOn={infoOn} onToggleInfo={toggleInfo} />
          : cur ? <Conversation key={cur.user_id} u={cur} legacyChats={legacyOf(cur.user_id)} members={pool} member={memberOf.get(cur.subject_key) || null} proper={properOf.get(cur.subject_key) || null}
            onBack={() => setSel(null)} onOpenMember={setOpenKey} onUser={(p) => updateUser(cur.user_id, p)} onReloadUsers={reload} onBall={(restore) => toggleBall(cur, restore)} pinKinds={pinKinds} setPinKinds={setPinKinds} onReloadKinds={reload} infoOn={infoOn} onToggleInfo={toggleInfo} />
            : <div className="m-auto text-sm text-ig-muted">左から相手を選んでください</div>}
        </section>
        {infoOn && curMember && (
          <aside className="hidden xl:block w-[380px] shrink-0 overflow-y-auto border-l border-ig-divider bg-white">
            <MemberInfo key={curMember.key} m={curMember} clubs={clubs} onPatch={(p) => patchMember(curMember.key, p)} />
          </aside>
        )}
      </div>
      {(() => { const mu = menu && (users || []).find((x) => x.user_id === menu.id); return menu && mu ? (
        <RowMenu u={mu} x={menu.x} y={menu.y} kinds={pinKinds} setKinds={setPinKinds} hasMember={memberOf.has(mu.subject_key)} onClose={closeMenu}
          onOpen={() => setSel(mu.user_id)} onUser={(p) => updateUser(mu.user_id, p)} onBall={(restore) => toggleBall(mu, restore)} onInfo={() => setOpenKey(mu.subject_key)} />
      ) : null; })()}
      {openKey && memberOf.get(openKey) && <MemberDrawer m={memberOf.get(openKey)!} clubs={clubs} onClose={onClose} onPatch={onPatch} />}
    </div>
  );
}

function LineAvatar({ u, ring, size }: { u: LineUser; ring?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  return <Avatar name={u.subject_name || u.display_name || '?'} src={u.picture_url || undefined} ring={ring} size={size} />;
}

// ピンのバッジ（色は種類ごと）
function PinBadge({ k }: { k: PinKind }) {
  const c = pinColor(k.color);
  return <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded px-1 text-[10px] font-semibold" style={{ color: c, background: c + '1f' }}><Pin size={9} strokeWidth={2.5} />{k.name}</span>;
}

async function pinPost(body: unknown) {
  const r = await fetch('/api/sy/s/line/pins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  if (!r || !r.ok) { fx.toast(j.error || '保存に失敗しました', 'err'); return null; }
  return j as { kind?: PinKind };
}
// ピンの付け外し。押した瞬間に画面へ反映し、失敗したら戻す
async function togglePin(u: LineUser, k: PinKind, onUser: (p: Partial<LineUser>) => void) {
  const mine = u.pins || [], has = mine.includes(k.id);
  onUser({ pins: has ? mine.filter((x) => x !== k.id) : [...mine, k.id] });
  if (!(await pinPost({ user: u.user_id, kindId: k.id, on: !has }))) onUser({ pins: mine });
  else fx.toast(has ? `「${k.name}」のピンを外しました` : `「${k.name}」でピン留めしました`);
}

// 一覧の行を右クリック（スマホは長押し）で出るメニュー。開かずにピン留め・対応済み・情報を開く ができる（2026-10-08 shoya「右クリックでピン留めとか」）
function RowMenu({ u, x, y, kinds, setKinds, hasMember, onClose, onOpen, onUser, onBall, onInfo }: {
  u: LineUser; x: number; y: number; kinds: PinKind[]; setKinds: React.Dispatch<React.SetStateAction<PinKind[]>>; hasMember: boolean;
  onClose: () => void; onOpen: () => void; onUser: (p: Partial<LineUser>) => void; onBall: (restore: boolean) => void; onInfo: () => void;
}) {
  const mine = u.pins || [];
  const ball = ballOn(u);
  const canRestore = !ball && u.followed && u.last_direction === 'in' && !!u.ball_cleared_at;
  const item = 'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-ig-hover';
  const run = (f: () => void) => () => { onClose(); f(); };
  async function create() {
    const n = (prompt('新しいピンの名前（12文字まで。例: 書類待ち）') || '').trim(); if (!n) return;
    const j = await pinPost({ action: 'create', name: n, color: PIN_COLORS[kinds.length % PIN_COLORS.length] });
    if (!j?.kind) return;
    const k = j.kind; setKinds((a) => [...a, k]);
    if (await pinPost({ user: u.user_id, kindId: k.id, on: true })) { onUser({ pins: [...mine, k.id] }); fx.toast(`「${k.name}」を作ってピン留めしました`); }
  }
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  // 画面の端で はみ出さないように寄せる
  const h = 150 + kinds.length * 32, left = Math.min(x, window.innerWidth - 232), top = Math.max(8, Math.min(y, window.innerHeight - h));
  return (
    <>
      <div data-ctx="native" className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="fixed z-50 w-56 rounded-lg bg-white p-1.5 text-sm shadow-xl ring-1 ring-ig-border" style={{ left, top }}>
        <div className="truncate px-2 pb-1 text-[11px] text-ig-muted">{u.subject_name || u.claimed_name || u.display_name || '（名前なし）'}</div>
        <button onClick={run(onOpen)} className={item}>トークを開く</button>
        {hasMember && <button onClick={run(onInfo)} className={item}>情報を開く</button>}
        {ball && <button onClick={run(() => onBall(false))} className={item}><Check size={14} strokeWidth={2.25} className="text-ig-danger" />対応済みにする</button>}
        {canRestore && <button onClick={run(() => onBall(true))} className={item}><Undo2 size={14} />要対応に戻す</button>}
        <div className="my-1 border-t border-ig-divider" />
        <div className="px-2 py-0.5 text-[11px] text-ig-muted">ピン留め</div>
        {kinds.map((k) => (
          <button key={k.id} onClick={run(() => togglePin(u, k, onUser))} className={item}>
            <Pin size={14} strokeWidth={2.25} style={{ color: pinColor(k.color) }} /><span className="min-w-0 flex-1 truncate">{k.name}</span>
            {mine.includes(k.id) && <Check size={15} strokeWidth={2.5} className="text-ig-primary" />}
          </button>
        ))}
        <button onClick={run(create)} className={`${item} text-ig-primary`}>＋ 新しいピンを作って付ける</button>
      </div>
    </>
  );
}

// ピン留めのボタン（会話の上）。押すと種類の一覧が開き、付け外し・種類を作る・種類を消す ができる（2026-10-08 shoya「チャットから設定できるように」）
function PinMenu({ u, kinds, setKinds, onUser, onReload }: {
  u: LineUser; kinds: PinKind[]; setKinds: React.Dispatch<React.SetStateAction<PinKind[]>>; onUser: (p: Partial<LineUser>) => void; onReload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PIN_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const mine = u.pins || [];
  const on = kinds.filter((k) => mine.includes(k.id));
  const post = pinPost;
  const toggle = (k: PinKind) => togglePin(u, k, onUser);
  async function create() {
    const n = name.trim(); if (!n || busy) return;
    setBusy(true);
    const j = await post({ action: 'create', name: n, color });
    if (j?.kind) {
      const k = j.kind; setKinds((a) => [...a, k]); setName('');
      // 作ったら そのまま この相手に付ける
      if (await post({ user: u.user_id, kindId: k.id, on: true })) { onUser({ pins: [...mine, k.id] }); fx.toast(`「${k.name}」を作ってピン留めしました`); }
    }
    setBusy(false);
  }
  async function remove(k: PinKind) {
    if (!confirm(`ピン「${k.name}」を消します。付いている全員から外れます。よろしいですか？`)) return;
    if (await post({ action: 'delete', id: k.id })) { setKinds((a) => a.filter((x) => x.id !== k.id)); onReload(); }
  }
  return (
    <div className="relative shrink-0">
      <button onClick={() => setOpen((x) => !x)} title="ピン留め（種類を選ぶ・作る）"
        className={`ig-press inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${on.length ? 'bg-ig-text text-white' : 'bg-ig-hover text-ig-text hover:bg-ig-border'}`}>
        <Pin size={14} strokeWidth={2} />{on.length ? on.map((k) => k.name).join('・') : 'ピン留め'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg bg-white p-2 text-sm shadow-xl ring-1 ring-ig-border">
            {kinds.length === 0 && <p className="px-2 py-1.5 text-xs text-ig-muted">ピンの種類はまだありません。下で作れます（例: 書類待ち・アンケート回答待ち）</p>}
            {kinds.map((k) => { const has = mine.includes(k.id); return (
              <div key={k.id} className="flex items-center">
                <button onClick={() => toggle(k)} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-ig-hover">
                  <Pin size={14} strokeWidth={2.25} style={{ color: pinColor(k.color) }} />
                  <span className="min-w-0 flex-1 truncate">{k.name}</span>
                  {has && <Check size={15} strokeWidth={2.5} className="text-ig-primary" />}
                </button>
                <button onClick={() => remove(k)} title="この種類を消す（全員から外れます）" className="rounded p-1.5 text-ig-muted hover:bg-ig-hover hover:text-ig-danger"><Trash2 size={13} /></button>
              </div>
            ); })}
            <div className="mt-1 border-t border-ig-divider px-2 pt-2">
              <div className="mb-1 text-[11px] text-ig-muted">新しい種類を作る</div>
              <div className="flex gap-1">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={12} placeholder="例: 書類待ち"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) create(); }}
                  className="min-w-0 flex-1 rounded-lg border border-ig-border px-2 py-1 text-sm outline-none focus:border-ig-muted" />
                <button disabled={busy || !name.trim()} onClick={create} className="rounded-lg bg-ig-primary px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40">作る</button>
              </div>
              <div className="mt-1.5 flex gap-1.5">
                {PIN_COLORS.map((c) => <button key={c} onClick={() => setColor(c)} aria-label="色" className={`h-5 w-5 rounded-full ${color === c ? 'ring-2 ring-ig-text ring-offset-1' : ''}`} style={{ background: c }} />)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// 相手の情報への入口。広い画面は右の欄を出す/隠す、狭い画面（欄が出ない）は 名簿の詳細パネルを開く
// ピン留めの左に置く 大きめのボタン（2026-10-08 shoya「もうすこし大きめにわかりやすく。ピン留めの左で」）
const INFO_BTN = 'ig-press shrink-0 items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold';
function InfoLinks({ k, onOpenMember, infoOn, onToggleInfo }: { k: string; onOpenMember: (k: string) => void; infoOn: boolean; onToggleInfo: () => void }) {
  return (
    <>
      <button onClick={() => onOpenMember(k)} className={`${INFO_BTN} inline-flex border-ig-primary text-ig-primary hover:bg-ig-primary/10 xl:hidden`}><IdCard size={17} strokeWidth={2} />情報</button>
      <button onClick={onToggleInfo} aria-pressed={infoOn} className={`${INFO_BTN} hidden xl:inline-flex ${infoOn ? 'border-ig-primary bg-ig-primary text-white' : 'border-ig-primary text-ig-primary hover:bg-ig-primary/10'}`}><IdCard size={17} strokeWidth={2} />{infoOn ? '情報を閉じる' : '情報を見る'}</button>
    </>
  );
}

function Conversation({ u, legacyChats, members, member, proper, onBack, onOpenMember, onUser, onReloadUsers, onBall, pinKinds, setPinKinds, onReloadKinds, infoOn, onToggleInfo }: {
  u: LineUser; legacyChats: LegacyChat[]; members: Linkable[] | null; member: Member | null; proper: ProperLite | null; onBack: () => void; onOpenMember: (k: string) => void;
  onUser: (p: Partial<LineUser>) => void; onReloadUsers: () => void; onBall: (restore: boolean) => void; infoOn: boolean; onToggleInfo: () => void;
  pinKinds: PinKind[]; setPinKinds: React.Dispatch<React.SetStateAction<PinKind[]>>; onReloadKinds: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [linking, setLinking] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const ball = ballOn(u);
  const at = useAttach();

  const load = useCallback(() => fetch(`/api/sy/s/line/messages?user=${encodeURIComponent(u.user_id)}`).then((r) => r.json()).then((j) => j.messages && setMsgs(j.messages)), [u.user_id]);
  useEffect(() => { load(); onUser({ unread: 0 }); const t = setInterval(() => document.visibilityState === 'visible' && load(), 5000); return () => clearInterval(t); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView(); }, [msgs?.length]);

  async function send() {
    const t = text.trim(); if ((!t && !at.has) || at.busy) return;
    setBusy(true); setErr('');
    const r = await fetch('/api/sy/s/line/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: u.user_id, text: t, ...at.payload }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setErr(j.error || '送信に失敗しました'); fx.toast(j.error || '送信に失敗しました', 'err'); return; }
    setText(''); at.clear(); await load(); onUser({ last_text: j.lastText || t, last_direction: 'out', last_message_at: j.at || new Date().toISOString() });
    fx.hit('line'); fx.toast('送信しました');
  }
  async function askName() {
    if (!confirm('名前登録のリンクをLINEで送ります（通数を1通使います）。よろしいですか？')) return;
    setBusy(true); setErr('');
    const r = await fetch('/api/sy/s/line/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: u.user_id }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setErr(j.error || '送れませんでした'); return; }
    setMsgs((m) => [...(m || []), j.message]); onUser({ name_asked_at: new Date().toISOString() });
  }
  async function link(body: Record<string, string>) {
    if (body.action === 'candidate') {
      const guess = [u.claimed_name, ...(u.name_guesses || []).filter((g) => /\p{Script=Han}/u.test(g)), u.display_name].find(Boolean) || '';
      const name = prompt('候補者として登録する名前（フルネーム）', guess.replace(/(と申します|といいます|です)$/, ''));
      if (!name || !name.trim()) return;
      body = { ...body, name: name.trim() };
    }
    // 取り違え防止（2026-10-22 shoya）: 紐付けを変える・外す時と、相手が もう別の LINE とつながっている時は、LINE名と相手を並べて確かめる
    if (body.action !== 'candidate') {
      const changing = !!u.subject_key && u.subject_key !== (body.key || '');
      const c = body.key ? await fetch('/api/sy/s/line/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: u.user_id, key: body.key, check: true }) }).then((x) => x.json()).catch(() => ({})) : {};
      const taken: string[] = Array.isArray(c.taken) ? c.taken : [];
      if (changing || taken.length) {
        const lines = [`LINE：${u.display_name}`];
        if (changing) lines.push(body.key ? `いまの紐付け：${u.subject_name || u.subject_key} → ${body.name} に変えます` : `いまの紐付け：${u.subject_name || u.subject_key} を外します`);
        else lines.push(`紐付ける相手：${body.name}`);
        if (taken.length) lines.push('', `⚠ ${body.name}さんは もう別の LINE（${taken.join('、')}）とつながっています。`, '同じ人に 2つの LINE をつなぐことになります。');
        if (!confirm([...lines, '', 'よろしいですか？'].join('\n'))) return;
      }
    }
    setBusy(true); setErr('');
    const r = await fetch('/api/sy/s/line/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: u.user_id, ...body }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setErr(j.error || '紐付けに失敗しました'); return; }
    onUser({ subject_key: j.key, subject_name: j.name }); setLinking(false); onReloadUsers();
    if (j.key) fx.toast(`${j.name}さんと紐付けました`);
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-ig-divider bg-white px-4 py-2.5">
        <button onClick={onBack} className="md:hidden text-ig-text"><ArrowLeft size={22} /></button>
        <LineAvatar u={u} size="sm" />
        <div className="min-w-0 flex-1">
          <div className={`truncate font-medium ${u.staff ? 'text-ig-staff' : ''}`}>{u.subject_name || u.display_name}<span className="ml-2 text-xs font-normal text-ig-muted">LINE: {u.display_name}</span></div>
          <div className="flex items-center gap-2 text-xs">
            {member ? <><StageBadge stage={member.status} />{member.recruitTantou && <span className="text-ig-muted">採用:{member.recruitTantou}</span>}</>
              : proper ? <><StageBadge stage={proper.status} /><span className="text-ig-muted">{proper.from === 'ledger' ? '稼働管理一覧（名簿外）' : 'プロパーリスト'}</span></>
              : u.subject_key ? <span className="text-ig-muted">紐付け先: {u.subject_name}</span> : u.staff ? <span className="rounded bg-ig-staff px-1.5 py-px text-[10px] font-semibold text-white">内勤</span> : <span className="text-ig-warn">名簿と未紐付け</span>}
            <button onClick={() => setLinking((x) => !x)} className="text-ig-muted underline">{u.subject_key ? '紐付けを変える' : '紐付ける'}</button>
            {u.claimed_name ? <span className="text-ig-muted">名乗り: {u.claimed_name}{u.claimed_kana && `（${u.claimed_kana}）`}</span>
              : null}
          </div>
        </div>
        {member && <InfoLinks k={member.key} onOpenMember={onOpenMember} infoOn={infoOn} onToggleInfo={onToggleInfo} />}
        <PinMenu u={u} kinds={pinKinds} setKinds={setPinKinds} onUser={onUser} onReload={onReloadKinds} />
        {/* 相手ボール。点灯中は「対応済み」、解除済みで最後が受信なら「要対応に戻す」 */}
        {ball ? <button onClick={() => onBall(false)} className="ig-press inline-flex shrink-0 items-center gap-1 rounded-lg border border-ig-danger/40 px-2.5 py-1.5 text-xs font-semibold text-ig-danger hover:bg-ig-danger/10"><Check size={14} strokeWidth={2.25} />対応済みにする</button>
          : u.followed && u.last_direction === 'in' && u.ball_cleared_at ? <button onClick={() => onBall(true)} className="ig-press inline-flex shrink-0 items-center gap-1 rounded-lg bg-ig-hover px-2.5 py-1.5 text-xs font-semibold text-ig-text hover:bg-ig-border"><Undo2 size={14} />要対応に戻す</button>
          : null}
      </header>
      {legacyChats.filter((c) => c.match_kind === 'name').map((c) => (
        <div key={c.chat_id} className="flex items-center gap-2 border-b border-ig-divider bg-ig-subtle px-4 py-1.5 text-xs text-ig-warn">
          表示名「{c.name}」で過去のトークを仮につないでいます。
          <button disabled={busy} onClick={async () => { setBusy(true); await fetch('/api/sy/s/line/legacy-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat: c.chat_id, unmatch: true }) }); setBusy(false); onReloadUsers(); load(); }}
            className="underline">別人なので外す</button>
        </div>
      ))}
      {linking && <LinkPanel u={u} members={members} busy={busy} onLink={link} />}
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {msgs === null && <div className="text-center text-xs text-ig-muted">読み込み中…</div>}
        {msgs?.map((m, i) => (
          <div key={m.id + ':' + i}>
            {m.legacy && (i === 0) && <div className="mb-2 text-center text-[11px] text-ig-muted">── 採用版につなぐ前のトーク（LINE管理画面から取り込み） ──</div>}
            {!m.legacy && i > 0 && msgs[i - 1].legacy && <div className="my-2 text-center text-[11px] text-ig-muted">── ここから採用版 ──</div>}
            <Bubble m={m} />
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {err && <p className="px-4 text-sm text-ig-danger">{err}</p>}
      <div className="border-t border-ig-divider bg-white p-3">
        {!u.followed ? <p className="text-center text-xs text-ig-muted">ブロックされているため送れません</p> : member?.bousan ? <p className="flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-ig-stop"><Ban size={14} strokeWidth={2.25} />ぼうさん（接触禁止）のため送れません。送るときは 情報欄のチェックを外してください</p> : (
          <><AttachPreview at={at} />
          <div className="flex items-end gap-2 rounded-[22px] border border-ig-border px-4 py-1.5">
            <AttachButton at={at} className="my-1.5" />
            <textarea id={`chat-draft-${u.user_id}`} value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="メッセージを入力…（⌘+Enterで送信）"
              onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); at.add(f); } }}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) send(); }}
              className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none field-sizing-content" />
            {busy ? <span className="ig-typing flex gap-1 py-3"><span /><span /><span /></span>
              : text.trim() || at.has ? <button onClick={send} disabled={at.busy} className="ig-pop py-1.5 text-sm font-semibold text-ig-primary hover:text-ig-link">送信</button>
              : <Send size={22} strokeWidth={1.75} className="my-1.5 text-ig-muted" />}
          </div></>
        )}
      </div>
    </>
  );
}

function LinkPanel({ u, members, busy, onLink }: { u: LineUser; members: Linkable[] | null; busy: boolean; onLink: (b: Record<string, string>) => void }) {
  // 最初の検索語: 名乗り → 送ってきた漢字の名前らしき一言 → LINE表示名の頭2文字
  const guess = (u.name_guesses || []).find((g) => /\p{Script=Han}/u.test(g))?.replace(/(と申します|といいます|です)$/, '');
  const [q, setQ] = useState((u.claimed_name || guess || u.display_name.slice(0, 2)).replace(/[\s　]+/g, ''));
  const hits = (members || []).filter((m) => q && (m.name + m.kana).replace(/[\s　]+/g, '').includes(q.replace(/[\s　]+/g, ''))).slice(0, 8);
  return (
    <div className="border-b border-ig-divider bg-ig-subtle p-3 text-sm space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名簿・プロパーリスト・稼働管理一覧の名前で探す" className="w-48 rounded-lg border border-ig-border bg-white px-2 py-1 text-sm" />
        {/* 2026-09-30 shoya: 「候補者として新規登録」ボタンは出さない */}
        {u.subject_key && <button disabled={busy} onClick={() => onLink({ key: '' })} className="rounded-lg px-2.5 py-1 text-xs text-ig-text ring-1 ring-ig-border bg-white">紐付けを外す</button>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {!members && <span className="text-xs text-ig-muted">名簿を読み込み中…</span>}
        {hits.map((m) => (
          <button key={m.key} disabled={busy} onClick={() => onLink({ key: m.key, name: m.name })} className="flex items-center gap-1.5 rounded-full bg-white px-2 py-1 text-xs ring-1 ring-ig-border hover:ring-ig-muted">
            {m.name}<StageBadge stage={m.status} />
          </button>
        ))}
        {members && q && hits.length === 0 && <span className="text-xs text-ig-muted">見つかりません</span>}
      </div>
    </div>
  );
}

// 友だち(userId)とまだつながっていない過去トーク。見る・名簿と紐付けるだけ（LINEの仕組み上、送信はできない）
function LegacyConversation({ c, members, member, proper, onBack, onOpenMember, onReload, infoOn, onToggleInfo }: {
  c: LegacyChat; members: Linkable[] | null; member: Member | null; proper: ProperLite | null; onBack: () => void; onOpenMember: (k: string) => void; onReload: () => void; infoOn: boolean; onToggleInfo: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { fetch(`/api/sy/s/line/legacy?chat=${encodeURIComponent(c.chat_id)}`).then((r) => r.json()).then((j) => setMsgs(j.messages || [])); }, [c.chat_id]);
  useEffect(() => { bottom.current?.scrollIntoView(); }, [msgs?.length]);
  const fake = { user_id: '', display_name: c.name, claimed_name: '', subject_key: c.subject_key, name_guesses: c.name_guesses } as unknown as LineUser;
  async function link(body: Record<string, string>) {
    let payload: Record<string, string> = { chat: c.chat_id, key: body.key || '', name: body.name || '' };
    if (body.action === 'candidate') {
      const guess = (c.name_guesses || []).find((g) => /\p{Script=Han}/u.test(g))?.replace(/(と申します|といいます|です)$/, '') || c.name;
      const name = prompt('候補者として登録する名前（フルネーム）', guess || '');
      if (!name || !name.trim()) return;
      payload = { chat: c.chat_id, action: 'candidate', name: name.trim() };
    }
    setBusy(true);
    const r = await fetch('/api/sy/s/line/legacy-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    setBusy(false);
    if (!r.ok) { alert((await r.json().catch(() => ({}))).error || '登録に失敗しました'); return; }
    setLinking(false); onReload();
  }
  return (
    <>
      <header className="flex items-center gap-3 border-b border-ig-divider bg-white px-4 py-2.5">
        <button onClick={onBack} className="md:hidden text-ig-text"><ArrowLeft size={22} /></button>
        <Avatar name={c.name || '?'} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{c.subject_name || c.name}<span className="ml-2 text-xs font-normal text-ig-muted">LINE: {c.name}</span></div>
          <div className="flex items-center gap-2 text-xs">
            {member ? <><StageBadge stage={member.status} /></>
              : proper ? <><StageBadge stage={proper.status} /><span className="text-ig-muted">{proper.from === 'ledger' ? '稼働管理一覧（名簿外）' : 'プロパーリスト'}</span></>
              : c.subject_key ? <span className="text-ig-muted">紐付け先: {c.subject_name}</span> : <span className="text-ig-warn">名簿と未紐付け</span>}
            <button onClick={() => setLinking((x) => !x)} className="text-ig-muted underline">{c.subject_key ? '紐付けを変える' : '紐付ける'}</button>
          </div>
        </div>
        {member && <InfoLinks k={member.key} onOpenMember={onOpenMember} infoOn={infoOn} onToggleInfo={onToggleInfo} />}
      </header>
      {linking && <LinkPanel u={fake} members={members} busy={busy} onLink={link} />}
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        <div className="text-center text-[11px] text-ig-muted">── 採用版につなぐ前のトーク（LINE管理画面から取り込み） ──</div>
        {msgs === null && <div className="text-center text-xs text-ig-muted">読み込み中…</div>}
        {msgs?.map((m, i) => <Bubble key={m.id + ':' + i} m={m} />)}
        <div ref={bottom} />
      </div>
      <div className="border-t border-ig-divider bg-white p-3 text-center text-xs text-ig-muted">
        この人から採用版につないだ後のメッセージがまだ無いため、ここからは送れません。次にメッセージが届くと自動でつながり、送れるようになります。
      </div>
    </>
  );
}
