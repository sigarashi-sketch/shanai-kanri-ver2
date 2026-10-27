'use client';

// 要員ページ（営業）：プロパー・営業共有リスト・ライバーの名前から開く1人ぶんのページ。形は人事の社員ページと同じ。
//   タブ＝基本・希望条件／スキシ・サマリ／送った案件（OK・NG）／チャット（個人・グループ）
//   ・今の社内システムの値（読むだけ）
//   ・チャットだけは送れる（長押し）。送る口は /api/live/chat（今の POST /api/chat の send / groupSend だけ通す）
//     グループに送ってよいかは今の API が決める。断られたら理由をそのまま出す
//   ・ライバーは「スキシ・サマリ」にライバーリストの値（メモ＝サマリ）、「送った案件」に案件を送る口（今の配信の送信と同じ・確認の窓のあと・10-26）
//   ・それ以外の書き込み（スキシを作る・メモを直す 等）はここには置かない
//   ・名前の小窓（embedded）では送れない（送る欄を出さない・10-25）。小窓が読んだ分（initial）を使い、プロパーリストを読み直さない
//     読めなかったときも 404 にしない（後ろの画面まで「見つからない」にしない）。リンクは別タブで開く
import { ChatSummary } from '@/components/ChatSummary';
import { ChatLog, type ReplyTo } from '@/components/ChatLog';
import { ChatComposer } from '@/components/ChatComposer';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { Pill, SkeletonRows } from '@/components/ui';
import { ScoreLine } from '@/components/ProperScore';
import { PersonBasic } from '@/components/PersonBasic';
import { PersonMemo } from '@/components/PersonMemo';
import { LiveBanner, useIke } from '@/components/Live';
import { useCaseSend } from '@/components/CaseSendDialog';
import { usePerms } from '@/components/Perms';
import { liveStock } from '@/lib/live/cases';
import { blockReason, type ProgressData } from '@/lib/live/eigyo-common';
import type { EngineerRows, SukishiFileUrls } from '@/lib/live/eigyo-common';
import { SukishiFiles } from '@/components/SukishiFiles';
import type { LiverList, PartnerList } from '@/lib/live/proper';
import {
  CAN_ALL, memoOf, contactsOf, groupBubbles, groupsOf, livePerson, logView, memberOf, threadBubbles,
  type ContactsRes, type Fact, type GroupsRes, type GroupThreadRes, type LivePersonView, type MembersRes, type PersonCan, type ThreadRes,
} from '@/lib/live/person';

// 社員ページ（StaffDetail）と同じ型のタブ（10-25 shoya「写真で出したやつにして」）。チャットは一番右
const TABS = ['基本情報', '希望条件', 'スキシ・サマリ', '送った案件', '面談メモ', 'チャット'] as const;
type Tab = (typeof TABS)[number];
type View = { id: string; name: string; status: string; facts: Fact[]; summary: string; career: string; sukishiUrl: string; source: string; row?: string; files?: SukishiFileUrls };

/** 名前の小窓が /api/live/person で読んだ分 */
export type ProperInitial = { view: LivePersonView; everyone: string[]; can: PersonCan };

/** 要員ページの中身。ページ（/eigyo/proper/[id]）と名前の小窓（embedded＝上のパンくずを出さない・送れない）で使う */
export function ProperDetail({ id, liver = false, embedded = false, initial }: { id: string; liver?: boolean; embedded?: boolean; initial?: ProperInitial }) {
  const [tab, setTab] = useState<Tab>('希望条件');
  const [seen, setSeen] = useState<Tab[]>(['希望条件']);

  const er = useIke<EngineerRows>(initial ? null : 'roster?action=getEngineerRows&area=main');
  const live = !!initial || er.live;
  const erState = initial ? 'live' : er.state;
  const needPl = !initial && live && !liver && !er.data?.rows?.some((r) => r.row === id) && !id.startsWith('n:');
  const pl = useIke<PartnerList>(needPl ? 'partner-list?action=list' : null);
  const lv = useIke<LiverList>(!initial && live && liver ? 'livers' : null);

  const lp = initial ? initial.view : live ? livePerson(id, er.data, pl.data, lv.data, liver) : null;
  const p: View | null = lp;
  const erRows = er.data?.rows;
  const everyone = useMemo(() => initial?.everyone ?? (erRows ?? []).map((r) => r.name), [initial, erRows]);
  const can = initial?.can ?? CAN_ALL;
  const tabs = TABS.filter((t) => (t === 'チャット' ? can.chat : t === '基本情報' ? can.basic && !liver : t === '面談メモ' ? !liver : true));
  const waiting = erState === 'loading' || (needPl && pl.state === 'loading') || (live && liver && lv.state === 'loading');
  const ext = embedded ? { target: '_blank', rel: 'noopener' } : {};

  // 見たことを残す（本物のときだけ）：基本情報・面談メモ・チャットを開いたとき
  const pname = p?.name ?? '';
  const select = (t: Tab) => {
    setTab(t);
    setSeen((s) => (s.includes(t) ? s : [...s, t]));
    if (live && pname) { if (t === 'チャット') logView('chat', pname); else if (t === '面談メモ') logView('memo', pname); else if (t === '基本情報') logView('basic', pname); }
  };

  if (!p) {
    if (waiting) return <SkeletonRows rows={8} className="px-3 py-6" />;
    if (er.state === 'error') return (
      <div className="flex flex-wrap items-center gap-2 px-6 py-10 text-body">
        <span className="text-bad">{er.error || '読めませんでした'}</span>
        {er.error?.includes('ログイン') ? <a href="/api/ike-auth/start" className="font-semibold underline">もう一度ログイン</a>
          : <button type="button" onClick={er.reload} className="btn-secondary btn-sm">もう一度読む</button>}
      </div>
    );
    if (!live) return <div className="px-6 py-10 text-body text-muted">読み込み中…</div>;
    return (
      <div className="px-6 py-10 text-body">
        <p>この人は今のリストに見つかりませんでした（営業止め・辞退になったか、ほかのエリアの人かもしれません）。</p>
        <Link href="/eigyo/proper" {...ext} className="mt-2 inline-block font-semibold hover:underline" style={{ color: 'var(--ad)' }}>要員リストへ戻る</Link>
      </div>
    );
  }
  const back = liver ? 'ライバーリスト' : p.source === '営業共有リスト' ? '営業共有リスト' : 'プロパーリスト';

  return (
    <div className="flex flex-col">
      {!embedded && <div className="flex items-center gap-2 border-b border-line bg-surface px-6 py-2.5 text-body">
        <Link href="/eigyo/proper" className="text-muted hover:underline">{back}</Link><span className="text-faint">/</span><b>{p.name}</b>
      </div>}
      <section className="mo-fade-up border-b border-line bg-surface px-4 pt-5 sm:px-6">
        <LiveBanner state={erState} error={er.error} onReload={er.reload} note={live ? (embedded ? `${p.source}の値です（見るだけ）` : `${p.source}の値です（読むだけ）。チャットだけは長押しで送れます`) : undefined} />
        <div className="mt-2 flex flex-wrap items-start gap-5">
          <div aria-hidden className="flex size-[72px] shrink-0 items-center justify-center rounded-full text-2xl font-bold" style={{ background: 'var(--as)', color: 'var(--ad)', boxShadow: '0 0 0 3px var(--color-surface), 0 0 0 5px var(--al)' }}>{p.name[0]}</div>
          <div className="min-w-0 flex-1 sm:w-[210px] sm:flex-none">
            <div className="text-sm text-faint">{p.source}</div>
            <div className="text-xl font-bold tracking-tight">{p.name}</div>
            <div className="mt-2 flex gap-1.5"><Pill>{p.status}</Pill></div>
            {!liver && p.source === 'プロパー' && <ScoreLine id={p.id} name={p.name} live={live} />}
          </div>
          <dl className="grid min-w-0 flex-1 basis-full grid-cols-2 gap-x-5 gap-y-2.5 text-body sm:basis-[480px] sm:grid-cols-4">
            {p.facts.slice(0, 8).map(([k, val]) => <div key={k} className="min-w-0"><dt className="text-xs text-faint">{k}</dt><dd className="break-words">{val}</dd></div>)}
          </dl>
        </div>
        <div role="tablist" className="mt-4 flex gap-1 overflow-x-auto text-body">
          {tabs.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => select(t)} className="tab">{t}</button>
          ))}
        </div>
      </section>

      {/* 一度開いたタブは出したまま（切り替えで読み直さない・10-25） */}
      <main className="mo-axis flex flex-col gap-4 px-4 pb-12 pt-[18px] sm:px-6">
        {seen.filter((t) => tabs.includes(t)).map((t) => (
          <div key={t} hidden={t !== tab} className="flex flex-col gap-4">
            {t === '基本情報' && <section className="w-full rounded-xl border border-line bg-surface px-5 py-4 text-body"><PersonBasic name={p.name} live={live} /></section>}
            {t === '希望条件' && <Facts facts={p.facts.filter(([k]) => k !== 'メモ')} />}
            {t === '面談メモ' && <section className="w-full rounded-xl border border-line bg-surface px-5 py-4 text-body"><PersonMemo name={p.name} live={live} id={p.id} initial={memoOf(p as LivePersonView)} /></section>}
            {t === 'スキシ・サマリ' && <Sukishi p={p} liver={liver} ext={ext} />}
            {t === '送った案件' && <SentCases name={p.name} live={live} liver={liver} embedded={embedded} />}
            {t === 'チャット' && <Chat name={p.name} live={live} everyone={everyone} embedded={embedded} canSummary={can.summary} />}
          </div>
        ))}
      </main>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="px-[18px] py-3.5"><h2 className="text-md font-bold">{title}</h2>{sub && <div className="text-sm text-faint">{sub}</div>}</div>
      <div className="px-[18px] pb-4">{children}</div>
    </section>
  );
}

function Facts({ facts }: { facts: Fact[] }) {
  return (
    <Card title="希望条件" sub="今のプロパーリストに入っている値のまま（直すのは要員リストの表から）">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-body sm:grid-cols-2 lg:grid-cols-3">
        {facts.map(([k, val]) => <div key={k}><dt className="text-xs text-faint">{k}</dt><dd className="whitespace-pre-wrap break-words">{val}</dd></div>)}
      </dl>
    </Card>
  );
}

function Sukishi({ p, liver, ext }: { p: View; liver: boolean; ext: { target?: string; rel?: string } }) {
  if (liver) return (
    <>
      <Card title="ライバーのプロフィール" sub="今のライバーリストの値。ライバーは営業リストに入れないので、スキルシートの自動作成（営業リストの行に保存する）は使えません">
        <dl className="grid grid-cols-[96px_1fr] gap-y-2 text-body">{p.facts.map(([k, val]) => <div key={k} className="contents"><dt className="text-faint">{k}</dt><dd className="break-words">{val}</dd></div>)}</dl>
      </Card>
      <Card title="サマリ（ライバーリストのメモ）" sub="直すときはライバーリストのメモ欄から">
        {p.summary ? <pre className="whitespace-pre-wrap break-words font-sans text-body leading-relaxed">{p.summary}</pre> : <p className="text-body text-muted">メモはまだありません</p>}
      </Card>
      <div className="flex flex-wrap gap-2">
        <Link href={`/eigyo/skillsheet?q=${encodeURIComponent(p.name)}`} {...ext} className="btn-secondary btn">基本情報フォームの回答を見る</Link>
      </div>
    </>
  );
  return (
    <>
      <Card title="サマリ" sub="スキルシートのもとになる要約（今のプロパーリストのサマリ列）">
        {p.summary ? <pre className="whitespace-pre-wrap break-words font-sans text-body leading-relaxed">{p.summary}</pre> : <p className="text-body text-muted">サマリはまだありません</p>}
      </Card>
      <Card title="前職・経歴">
        {p.career ? <pre className="whitespace-pre-wrap break-words font-sans text-body leading-relaxed">{p.career}</pre> : <p className="text-body text-muted">—</p>}
      </Card>
      {p.row && (
        <Card title="スキルシートのファイル" sub="本名版とイニシャル版（客先送付用）の PDF・Excel。今のプロパーリストの PDF 列と同じ。客先にはイニシャル版の PDF を（スプレッドシートをブラウザで印刷すると崩れます）">
          <SukishiFiles files={p.files ?? {}} row={p.row} name={p.name} canMake={!!p.sukishiUrl} size="md" />
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        {p.sukishiUrl && <a href={p.sukishiUrl} target="_blank" rel="noreferrer" className="btn-secondary btn">スキルシートを開く</a>}
        <Link href={`/eigyo/skillsheet?q=${encodeURIComponent(p.name)}`} {...ext} className="btn-secondary btn">スキルシートの画面で見る</Link>
      </div>
    </>
  );
}

// ライバーに案件を送る：最近の案件（送れない案件＝アダルト・店舗運営系は出さない）から1件選ぶ → 確認の窓 → この人の LINE グループに送る
function LiverSend({ name }: { name: string }) {
  const pd = useIke<ProgressData>('proxy?action=getProgressData');
  const cs = useCaseSend();
  const canEdit = usePerms().can('eigyo', 'edit');
  const stock = useMemo(() => liveStock(pd.data).filter((c) => !blockReason(c.content)), [pd.data]);
  const [k, setK] = useState('');
  return (
    <Card title="案件を送る" sub="選んだ案件を、この人の LINE グループに送ります（今の配信画面の「送信」と同じ。送る前に宛先と本文を確かめる窓が出ます）">
      {pd.state === 'loading' ? <p className="text-body text-muted">案件を読み込み中…</p> : pd.state === 'error' ? <p className="text-body text-bad">{pd.error}</p> : (
        <div className="flex flex-wrap items-center gap-2 text-body">
          <select value={k} onChange={(e) => setK(e.target.value)} className="min-h-9 max-w-full rounded-[10px] border border-field bg-surface px-2 text-body" aria-label="送る案件">
            <option value="">案件を選ぶ（{stock.length}件）</option>
            {stock.map((c) => <option key={c.no} value={c.no}>{c.no}　{c.name}{c.sentTo ? `（送った ${c.sentTo}）` : ''}</option>)}
          </select>
          <button className="btn-primary" disabled={!k || !canEdit || cs.busy} title={canEdit ? undefined : '営業の編集権限が必要です'} onClick={() => cs.open(k, [name], (n) => { if (n) { setK(''); pd.reload(); } })}>送る前に確かめる</button>
        </div>
      )}
      {cs.node}
    </Card>
  );
}

function SentCases({ name, live, liver, embedded }: { name: string; live: boolean; liver: boolean; embedded: boolean }) {
  const ms = useIke<MembersRes>(live ? 'progress-stats?view=members' : null);
  if (liver) {
    if (!live) return <Card title="送った案件"><p className="text-body text-muted">読み込み中…</p></Card>;
    const m = memberOf(ms.data, name);
    return (
      <>
        {!embedded && <LiverSend name={name} />}
        <Card title="送った案件" sub="案件進捗の「要員別」と同じ数え方">
          {ms.state === 'loading' ? <p className="text-body text-muted">読み込み中…</p> : !m ? <p className="text-body text-muted">まだ案件を送っていません（送ると案件進捗の「送った案件」に載ります）</p>
            : <p className="text-body">送った {m.sent}件・OK {m.ok.length}・NG {m.ng.length}・その他 {m.other.length}・まだ {m.undecided}</p>}
        </Card>
      </>
    );
  }
  if (!live || ms.state === 'loading') return <p className="text-body text-muted">読み込み中…</p>;
  if (live && (ms.state === 'error' || ms.data?.ok === false)) return <p className="text-body text-bad">{ms.error || ms.data?.error}</p>;
  const m = memberOf(ms.data, name);
  if (!m) return <Card title="送った案件"><p className="text-body text-muted">案件進捗の「要員別」にこの人はいません（まだ案件を送っていないか、営業中ではありません）</p></Card>;
  const rows = [...m.ok.map((c) => ({ ...c, d: 'OK' })), ...m.ng.map((c) => ({ ...c, d: 'NG' })), ...m.other.map((c) => ({ ...c, d: 'その他' }))].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const tone: Record<string, React.CSSProperties> = { OK: { background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }, NG: { background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }, その他: { background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' } };
  return (
    <Card title="送った案件" sub={`案件進捗の「要員別」と同じ数え方。送った ${m.sent}件・OK ${m.ok.length}・NG ${m.ng.length}・その他 ${m.other.length}・まだ ${m.undecided}${m.okRate != null ? `・OK率 ${Math.round(m.okRate * 100)}%` : ''}`}>
      {rows.length === 0 ? <p className="text-body text-muted">OK・NG が付いた案件はまだありません</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-body">
            <thead><tr className="th-row text-left"><th className="px-2 py-2 font-semibold">判定</th><th className="px-2 py-2 font-semibold">案件</th><th className="px-2 py-2 font-semibold">場所・種別</th><th className="px-2 py-2 font-semibold">送った日</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.d + c.caseNo} className="border-t border-line-soft">
                  <td className="px-2 py-2"><span className="rounded-full px-2 py-0.5 text-sm font-bold" style={tone[c.d]}>{c.d}</span></td>
                  <td className="px-2 py-2"><span className="text-faint">{c.caseNo}</span> {c.label}</td>
                  <td className="px-2 py-2">{[c.place, c.kind].filter(Boolean).join('・') || '—'}</td>
                  <td className="num px-2 py-2">{c.sentAt.slice(5, 10).replace('-', '/')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---- チャット（個人＝あおいの 1:1／グループ＝この人のLINEグループ） ----

function Chat({ name, live, everyone, embedded, canSummary }: { name: string; live: boolean; everyone: readonly string[]; embedded: boolean; canSummary: boolean }) {
  const [sub, setSub] = useState<'個人' | 'グループ'>('個人');
  const contacts = useIke<ContactsRes>(live && sub === '個人' ? 'chat?action=contacts' : null);
  const groups = useIke<GroupsRes>(live && sub === 'グループ' ? 'chat?action=groups' : null);
  const mine = live ? contactsOf(contacts.data, name) : [];
  const myGroups = live ? groupsOf(groups.data, name, everyone) : [];
  const [uid, setUid] = useState('');
  const [gid, setGid] = useState('');
  // 同じ名前の LINE の相手が2人以上なら勝手に選ばない（送り先を間違えないように・10-25）
  const userId = uid || (mine.length === 1 ? mine[0].line_user_id : '');
  const mustPick = live && sub === '個人' && mine.length > 1 && !uid;
  const groupId = gid || myGroups[0]?.groupId || '';
  const th = useIke<ThreadRes>(live && sub === '個人' && userId ? `chat?action=thread&userId=${encodeURIComponent(userId)}` : null);
  const gt = useIke<GroupThreadRes>(live && sub === 'グループ' && groupId ? `chat?action=groupThread&groupId=${encodeURIComponent(groupId)}` : null);

  const list = sub === '個人' ? contacts : groups;
  const bubbles = !live ? [] : sub === '個人' ? threadBubbles(th.data) : groupBubbles(gt.data);
  const loading = live && (list.state === 'loading' || (sub === '個人' ? !!userId && th.state === 'loading' : !!groupId && gt.state === 'loading'));
  const err = live ? list.error || (sub === '個人' ? th.error : gt.error) : '';
  const target = sub === '個人' ? userId : groupId;
  const none = live && list.state === 'live' && !target && !mustPick;
  const [reply, setReply] = useState<{ t: string; r: ReplyTo } | null>(null);
  const curReply = reply && reply.t === `${sub}:${target}` ? reply.r : null;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-[18px] py-3">
        <h2 className="mr-2 text-md font-bold">チャット</h2>
        {(['個人', 'グループ'] as const).map((s) => (
          <button key={s} onClick={() => setSub(s)} aria-pressed={sub === s} className="min-h-9 rounded-full border px-3.5 text-body font-semibold"
            style={sub === s ? { background: 'var(--as)', color: 'var(--ad)', borderColor: 'var(--al)' } : { borderColor: 'var(--color-field)', color: 'var(--color-muted)' }}>
            {s === '個人' ? '個人（あおい）' : 'グループ'}
          </button>
        ))}
        {sub === '個人' && mine.length > 1 && (
          <select value={userId} onChange={(e) => setUid(e.target.value)} aria-label="LINE の相手" className="ml-auto min-h-9 min-w-0 max-w-full rounded-full border border-field bg-surface px-3 text-sm">
            {!uid && <option value="">相手を選んでください</option>}
            {mine.map((c) => <option key={c.line_user_id} value={c.line_user_id}>{c.display_name || 'LINE の相手'}</option>)}
          </select>
        )}
        {sub === '個人' && mine.length > 1 && <span className="chip" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }}>同じ名前の相手が{mine.length}人います</span>}
        {sub === 'グループ' && myGroups.length > 1 && (
          <select value={groupId} onChange={(e) => setGid(e.target.value)} aria-label="LINE グループ" className="ml-auto min-h-9 min-w-0 max-w-full sm:max-w-[320px] rounded-full border border-field bg-surface px-3 text-sm">
            {myGroups.map((g) => <option key={g.groupId} value={g.groupId}>{g.name}</option>)}
          </select>
        )}
        {sub === 'グループ' && myGroups.length === 1 && <span className="ml-auto text-sm text-muted">{myGroups[0].name}</span>}
        {live && target && canSummary && <span className={(sub === '個人' ? mine.length > 1 : myGroups.length >= 1) ? '' : 'ml-auto'}><ChatSummary kind={sub === '個人' ? 'user' : 'group'} id={target} name={sub === '個人' ? name : myGroups.find((g) => g.groupId === groupId)?.name || name} live={live} /></span>}
      </div>
      <ChatLog bubbles={loading ? [] : bubbles} className="max-h-[520px] min-h-[260px]" resetKey={`${sub}:${target}`}
        onReply={!embedded && live && target ? (r) => setReply({ t: `${sub}:${target}`, r }) : undefined}>
        {loading && <p className="text-body text-muted">読み込み中…</p>}
        {err && <p className="text-body text-bad">{err}</p>}
        {mustPick && <p className="text-body text-muted">同じ名前の LINE の相手が{mine.length}人います。表示名を見て、上で選んでください</p>}
        {none && <p className="text-body text-muted">{sub === '個人' ? 'この人に紐付いた LINE の相手がいません（今のチャット画面で紐付けると出ます）' : 'グループ名にこの人の名前が入った LINE グループがありません'}</p>}
      </ChatLog>
      {embedded
        ? <p className="border-t border-line-soft px-[18px] py-3 text-sm text-faint">見るだけです。送るのは要員ページのチャットから。パスワードらしい文字は伏せています</p>
        : <ChatComposer kind={sub === '個人' ? 'person' : 'group'} target={target} live={live} canTalk={live && !!target} className="border-t border-line-soft"
          reply={curReply} onClearReply={() => setReply(null)} onSent={() => (sub === '個人' ? th.reload() : gt.reload())}
          sentToast={{ text: '送りました', sub: sub === '個人' ? '→ あおいのトークに残りました' : '→ グループのトークに残りました' }}
          placeholder={sub === '個人' ? 'あおいから本人に送る文' : 'グループに送る文（送ってよいかは今のシステムが決めます）'} disabledTitle="送り先がありません" />}
    </section>
  );
}

