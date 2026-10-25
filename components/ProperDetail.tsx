'use client';

// 要員ページ（営業）：プロパー・営業共有リスト・ライバーの名前から開く1人ぶんのページ。形は人事の社員ページと同じ。
//   タブ＝基本・希望条件／スキシ・サマリ／送った案件（OK・NG）／チャット（個人・グループ）
//   ・ログインしていれば今の社内システムの値（読むだけ）。していなければ見本
//   ・チャットだけは送れる（長押し）。送る口は /api/live/chat（今の POST /api/chat の send / groupSend だけ通す）
//     グループに送ってよいかは今の API が決める。断られたら理由をそのまま出す。見本のときは送らない
//   ・それ以外の書き込み（スキシを作る・メモを直す 等）はここには置かない
//   ・名前の小窓（embedded）では送れない（送る欄を出さない・10-25）。小窓が読んだ分（initial）を使い、プロパーリストを読み直さない
//     読めなかったときも 404 にしない（後ろの画面まで「見つからない」にしない）。リンクは別タブで開く
import { ChatSummary } from '@/components/ChatSummary';
import { ChatLog } from '@/components/ChatLog';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { LIVERS, PEOPLE, PROPERS } from '@/lib/sample';
import { Pill } from '@/components/ui';
import { ScoreLine } from '@/components/ProperScore';
import { PersonBasic } from '@/components/PersonBasic';
import { PersonMemo } from '@/components/PersonMemo';
import { useMotivation } from '@/components/Motivation';
import { LiveBanner, NotInLegacy, useIke } from '@/components/Live';
import type { EngineerRows } from '@/lib/live/eigyo-common';
import type { LiverList, PartnerList } from '@/lib/live/proper';
import {
  CAN_ALL, memoOf, contactsOf, groupBubbles, groupsOf, livePerson, logView, memberOf, threadBubbles,
  type Bubble, type ContactsRes, type Fact, type GroupsRes, type GroupThreadRes, type LivePersonView, type MemberRow, type MembersRes, type PersonCan, type ThreadRes,
} from '@/lib/live/person';

// 社員ページ（StaffDetail）と同じ型のタブ（10-25 shoya「写真で出したやつにして」）。チャットは一番右
const TABS = ['基本情報', '希望条件', 'スキシ・サマリ', '送った案件', '面談メモ', 'チャット'] as const;
type Tab = (typeof TABS)[number];
type View = { id: string; name: string; status: string; facts: Fact[]; summary: string; career: string; sukishiUrl: string; source: string };

// ---- 見本 ----
function samplePerson(id: string, liver: boolean): View | null {
  if (liver) {
    const l = LIVERS.find((x) => x.id === id);
    return l ? { id, name: l.name, status: l.status, source: 'ライバー', summary: l.memo, career: '', sukishiUrl: '', facts: [['配信', l.platform], ['フォロワー', l.followers]] } : null;
  }
  const p = PROPERS.find((x) => x.id === id);
  if (p) return {
    id, name: p.name, status: p.status, source: 'プロパー', sukishiUrl: '', career: p.sukishi.history.map((h) => `${h.period} ${h.text}`).join('\n'),
    summary: `イニシャル：${p.sukishi.initial || '（未設定）'}\n年齢：${p.sukishi.age}\n資格：${p.sukishi.skills}\n稼働：${p.sukishi.start}`,
    facts: [['最寄駅', p.station], ['希望職種', p.want], ['担当営業', p.sales], ['額面', p.price], ['稼働できる日', p.sukishi.start]],
  };
  const q = PEOPLE.find((x) => x.id === id);
  return q ? { id, name: q.name, status: q.status, source: '営業共有リスト', summary: '', career: '', sukishiUrl: '', facts: [['最寄駅', q.station], ['現場', q.site], ['担当営業', q.sales], ['採用担当', q.recruiter]] } : null;
}
const SAMPLE_MEMBER: MemberRow = {
  name: '', undecided: 1, sent: 4, okRate: 0.5, lastSentAt: '2026-10-21T10:00:00+09:00',
  ok: [{ caseNo: 'K-1021', label: 'サーバー監視（夜勤あり）', sentAt: '2026-10-21T10:00:00+09:00', place: '品川', kind: '監視' }],
  ng: [{ caseNo: 'K-1015', label: 'ヘルプデスク（英語）', sentAt: '2026-10-15T11:00:00+09:00', place: '大手町', kind: 'ヘルプデスク' }],
  other: [{ caseNo: 'K-1010', label: 'キッティング（短期）', sentAt: '2026-10-10T15:00:00+09:00', place: '川崎', kind: 'キッティング' }],
};
const SAMPLE_1on1: Bubble[] = [
  { key: 'a', out: true, who: 'あおい', text: 'お疲れさまです！明日の面談は 10:00 からで大丈夫そうですか？', at: '10/22 18:02' },
  { key: 'b', out: false, who: '', text: 'はい、大丈夫です。よろしくお願いします', at: '10/22 18:40' },
];
const SAMPLE_GROUPS = [{ groupId: 'Csample', name: '（見本）本人＋営業のグループ', lastAt: null }];
const SAMPLE_GROUP_MSGS: Bubble[] = [
  { key: 'g1', out: true, who: '営業', text: '案件を1件お送りします。ご確認ください', at: '10/21 10:00' },
  { key: 'g2', out: false, who: '本人', text: 'ありがとうございます、ぜひ進めたいです', at: '10/21 12:15' },
];

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
  const p: View | null = live ? lp : samplePerson(id, liver);
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
    if (waiting) return <div className="px-6 py-10 text-[13px] text-muted">読み込み中…</div>;
    if (er.state === 'error') return (
      <div className="flex flex-wrap items-center gap-2 px-6 py-10 text-[13px]">
        <span className="text-bad">{er.error || '読めませんでした'}</span>
        {er.error?.includes('ログイン') ? <a href="/api/ike-auth/start" className="font-semibold underline">もう一度ログイン</a>
          : <button type="button" onClick={er.reload} className="min-h-8 rounded-lg border border-field px-3 font-semibold">もう一度読む</button>}
      </div>
    );
    if (!live && !embedded) notFound();
    if (!live) return <div className="px-6 py-10 text-[13px] text-muted">見本のリストにこの人はいません。ログインすると本物が見られます。</div>;
    return (
      <div className="px-6 py-10 text-[13px]">
        <p>この人は今のリストに見つかりませんでした（営業止め・辞退になったか、ほかのエリアの人かもしれません）。</p>
        <Link href="/eigyo/proper" {...ext} className="mt-2 inline-block font-semibold hover:underline" style={{ color: 'var(--ad)' }}>要員リストへ戻る</Link>
      </div>
    );
  }
  const back = liver ? 'ライバーリスト' : p.source === '営業共有リスト' ? '営業共有リスト' : 'プロパーリスト';

  return (
    <div className="flex flex-col">
      {!embedded && <div className="flex items-center gap-2 border-b border-line bg-surface px-6 py-2.5 text-[13px]">
        <Link href="/eigyo/proper" className="text-muted hover:underline">{back}</Link><span className="text-faint">/</span><b>{p.name}</b>
      </div>}
      <section className="mo-fade-up border-b border-line bg-surface px-4 pt-5 sm:px-6">
        <LiveBanner state={erState} error={er.error} onReload={er.reload} note={live ? (embedded ? `${p.source}の値です（見るだけ）` : `${p.source}の値です（読むだけ）。チャットだけは長押しで送れます`) : undefined} />
        <div className="mt-2 flex flex-wrap items-start gap-5">
          <div aria-hidden className="flex size-[72px] shrink-0 items-center justify-center rounded-full text-[26px] font-bold" style={{ background: 'var(--as)', color: 'var(--ad)', boxShadow: '0 0 0 3px var(--color-surface), 0 0 0 5px var(--al)' }}>{p.name[0]}</div>
          <div className="min-w-0 flex-1 sm:w-[210px] sm:flex-none">
            <div className="text-[12px] text-faint">{p.source}</div>
            <div className="text-[22px] font-bold tracking-tight">{p.name}</div>
            <div className="mt-2 flex gap-1.5"><Pill>{p.status}</Pill></div>
            {!liver && p.source === 'プロパー' && <ScoreLine id={p.id} name={p.name} live={live} />}
          </div>
          <dl className="grid min-w-0 flex-1 basis-full grid-cols-2 gap-x-5 gap-y-2.5 text-[13px] sm:basis-[480px] sm:grid-cols-4">
            {p.facts.slice(0, 8).map(([k, val]) => <div key={k} className="min-w-0"><dt className="text-[11.5px] text-faint">{k}</dt><dd className="break-words">{val}</dd></div>)}
          </dl>
        </div>
        <div role="tablist" className="mt-4 flex gap-1 overflow-x-auto text-[13.5px]">
          {tabs.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => select(t)} className="whitespace-nowrap px-3 py-2.5"
              style={tab === t ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: 'var(--color-muted)' }}>{t}</button>
          ))}
        </div>
      </section>

      {/* 一度開いたタブは出したまま（切り替えで読み直さない・10-25） */}
      <main className="mo-axis flex flex-col gap-4 px-4 pb-12 pt-[18px] sm:px-6">
        {seen.filter((t) => tabs.includes(t)).map((t) => (
          <div key={t} hidden={t !== tab} className="flex flex-col gap-4">
            {t === '基本情報' && <section className="w-full rounded-xl border border-line bg-surface px-5 py-4 text-[13px]"><PersonBasic name={p.name} live={live} /></section>}
            {t === '希望条件' && <Facts facts={p.facts.filter(([k]) => k !== 'メモ')} />}
            {t === '面談メモ' && <section className="w-full rounded-xl border border-line bg-surface px-5 py-4 text-[13px]"><PersonMemo name={p.name} live={live} id={p.id} initial={live ? memoOf(p as LivePersonView) : { memo: p.facts.find(([k]) => k === 'メモ')?.[1] ?? '', summary: p.summary }} /></section>}
            {t === 'スキシ・サマリ' && <Sukishi p={p} liver={liver} ext={ext} />}
            {t === '送った案件' && <SentCases name={p.name} live={live} liver={liver} />}
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
      <div className="px-[18px] py-3.5"><h2 className="text-[15px] font-bold">{title}</h2>{sub && <div className="text-[12px] text-faint">{sub}</div>}</div>
      <div className="px-[18px] pb-4">{children}</div>
    </section>
  );
}

function Facts({ facts }: { facts: Fact[] }) {
  return (
    <Card title="希望条件" sub="今のプロパーリストに入っている値のまま（直すのは要員リストの表から）">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
        {facts.map(([k, val]) => <div key={k}><dt className="text-[11.5px] text-faint">{k}</dt><dd className="whitespace-pre-wrap break-words">{val}</dd></div>)}
      </dl>
    </Card>
  );
}

function Sukishi({ p, liver, ext }: { p: View; liver: boolean; ext: { target?: string; rel?: string } }) {
  if (liver) return <NotInLegacy what="ライバーのスキルシート" />;
  return (
    <>
      <Card title="サマリ" sub="スキルシートのもとになる要約（今のプロパーリストのサマリ列）">
        {p.summary ? <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed">{p.summary}</pre> : <p className="text-[13px] text-muted">サマリはまだありません</p>}
      </Card>
      <Card title="前職・経歴">
        {p.career ? <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed">{p.career}</pre> : <p className="text-[13px] text-muted">—</p>}
      </Card>
      <div className="flex flex-wrap gap-2">
        {p.sukishiUrl && <a href={p.sukishiUrl} target="_blank" rel="noreferrer" className="btn inline-flex min-h-10 items-center rounded-[10px] border border-field px-4 text-[13.5px] font-semibold">スキルシートを開く</a>}
        <Link href={`/eigyo/skillsheet?q=${encodeURIComponent(p.name)}`} {...ext} className="btn inline-flex min-h-10 items-center rounded-[10px] border border-field px-4 text-[13.5px] font-semibold">スキルシートの画面で見る</Link>
      </div>
    </>
  );
}

function SentCases({ name, live, liver }: { name: string; live: boolean; liver: boolean }) {
  const ms = useIke<MembersRes>(live && !liver ? 'progress-stats?view=members' : null);
  if (liver) return <NotInLegacy what="ライバーへの案件の送付" />;
  if (live && ms.state === 'loading') return <p className="text-[13px] text-muted">読み込み中…</p>;
  if (live && (ms.state === 'error' || ms.data?.ok === false)) return <p className="text-[13px] text-bad">{ms.error || ms.data?.error}</p>;
  const m = live ? memberOf(ms.data, name) : SAMPLE_MEMBER;
  if (!m) return <Card title="送った案件"><p className="text-[13px] text-muted">案件進捗の「要員別」にこの人はいません（まだ案件を送っていないか、営業中ではありません）</p></Card>;
  const rows = [...m.ok.map((c) => ({ ...c, d: 'OK' })), ...m.ng.map((c) => ({ ...c, d: 'NG' })), ...m.other.map((c) => ({ ...c, d: 'その他' }))].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const tone: Record<string, React.CSSProperties> = { OK: { background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }, NG: { background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }, その他: { background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' } };
  return (
    <Card title="送った案件" sub={`案件進捗の「要員別」と同じ数え方。送った ${m.sent}件・OK ${m.ok.length}・NG ${m.ng.length}・その他 ${m.other.length}・まだ ${m.undecided}${m.okRate != null ? `・OK率 ${Math.round(m.okRate * 100)}%` : ''}`}>
      {rows.length === 0 ? <p className="text-[13px] text-muted">OK・NG が付いた案件はまだありません</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead><tr className="th-row text-left"><th className="px-2 py-2 font-semibold">判定</th><th className="px-2 py-2 font-semibold">案件</th><th className="px-2 py-2 font-semibold">場所・種別</th><th className="px-2 py-2 font-semibold">送った日</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.d + c.caseNo} className="border-t border-line-soft">
                  <td className="px-2 py-2"><span className="rounded-full px-2 py-0.5 text-[12px] font-bold" style={tone[c.d]}>{c.d}</span></td>
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
function HoldButton({ label, onDone, disabled, title }: { label: string; onDone: () => void; disabled?: boolean; title?: string }) {
  const [p, setP] = useState(0);
  const t = useRef<ReturnType<typeof setInterval> | null>(null);
  const start = () => {
    if (disabled || t.current) return;
    const t0 = Date.now();
    t.current = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / 900);
      setP(k);
      if (k >= 1) { clearInterval(t.current!); t.current = null; setP(0); onDone(); }
    }, 16);
  };
  const stop = () => { if (t.current) clearInterval(t.current); t.current = null; setP(0); };
  return (
    <button disabled={disabled} title={title ?? '押し続けると送ります（0.9秒）'} onPointerDown={start} onPointerUp={stop} onPointerLeave={stop}
      className="relative min-h-10 select-none overflow-hidden rounded-[10px] px-4 text-[13.5px] font-bold disabled:cursor-not-allowed disabled:opacity-40" style={{ background: 'var(--a)', color: 'var(--ao)' }}>
      <span className="absolute inset-y-0 left-0 bg-black/20" style={{ width: `${p * 100}%` }} />
      <span className="relative">{label}</span>
    </button>
  );
}

function Chat({ name, live, everyone, embedded, canSummary }: { name: string; live: boolean; everyone: readonly string[]; embedded: boolean; canSummary: boolean }) {
  const [sub, setSub] = useState<'個人' | 'グループ'>('個人');
  const contacts = useIke<ContactsRes>(live && sub === '個人' ? 'chat?action=contacts' : null);
  const groups = useIke<GroupsRes>(live && sub === 'グループ' ? 'chat?action=groups' : null);
  const mine = live ? contactsOf(contacts.data, name) : [];
  const myGroups = live ? groupsOf(groups.data, name, everyone) : SAMPLE_GROUPS;
  const [uid, setUid] = useState('');
  const [gid, setGid] = useState('');
  // 同じ名前の LINE の相手が2人以上なら勝手に選ばない（送り先を間違えないように・10-25）
  const userId = uid || (mine.length === 1 ? mine[0].line_user_id : '');
  const mustPick = live && sub === '個人' && mine.length > 1 && !uid;
  const groupId = gid || myGroups[0]?.groupId || '';
  const th = useIke<ThreadRes>(live && sub === '個人' && userId ? `chat?action=thread&userId=${encodeURIComponent(userId)}` : null);
  const gt = useIke<GroupThreadRes>(live && sub === 'グループ' && groupId ? `chat?action=groupThread&groupId=${encodeURIComponent(groupId)}` : null);

  const list = sub === '個人' ? contacts : groups;
  const bubbles = !live ? (sub === '個人' ? SAMPLE_1on1 : SAMPLE_GROUP_MSGS) : sub === '個人' ? threadBubbles(th.data) : groupBubbles(gt.data);
  const loading = live && (list.state === 'loading' || (sub === '個人' ? !!userId && th.state === 'loading' : !!groupId && gt.state === 'loading'));
  const err = live ? list.error || (sub === '個人' ? th.error : gt.error) : '';
  const target = sub === '個人' ? userId : groupId;
  const none = live && list.state === 'live' && !target && !mustPick;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-[18px] py-3">
        <h2 className="mr-2 text-[15px] font-bold">チャット</h2>
        {(['個人', 'グループ'] as const).map((s) => (
          <button key={s} onClick={() => setSub(s)} aria-pressed={sub === s} className="min-h-9 rounded-full border px-3.5 text-[13px] font-semibold"
            style={sub === s ? { background: 'var(--as)', color: 'var(--ad)', borderColor: 'var(--al)' } : { borderColor: 'var(--color-field)', color: 'var(--color-muted)' }}>
            {s === '個人' ? '個人（あおい）' : 'グループ'}
          </button>
        ))}
        {sub === '個人' && mine.length > 1 && (
          <select value={userId} onChange={(e) => setUid(e.target.value)} aria-label="LINE の相手" className="ml-auto min-h-9 min-w-0 max-w-full rounded-full border border-field bg-surface px-3 text-[12.5px]">
            {!uid && <option value="">相手を選んでください</option>}
            {mine.map((c) => <option key={c.line_user_id} value={c.line_user_id}>{c.display_name || 'LINE の相手'}</option>)}
          </select>
        )}
        {sub === '個人' && mine.length > 1 && <span className="chip" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }}>同じ名前の相手が{mine.length}人います</span>}
        {sub === 'グループ' && myGroups.length > 1 && (
          <select value={groupId} onChange={(e) => setGid(e.target.value)} aria-label="LINE グループ" className="ml-auto min-h-9 min-w-0 max-w-full sm:max-w-[320px] rounded-full border border-field bg-surface px-3 text-[12.5px]">
            {myGroups.map((g) => <option key={g.groupId} value={g.groupId}>{g.name}</option>)}
          </select>
        )}
        {sub === 'グループ' && myGroups.length === 1 && <span className="ml-auto text-[12.5px] text-muted">{myGroups[0].name}</span>}
        {(!live || target) && canSummary && <span className={(sub === '個人' ? mine.length > 1 : myGroups.length >= 1) ? '' : 'ml-auto'}><ChatSummary kind={sub === '個人' ? 'user' : 'group'} id={target || 'sample0'} name={sub === '個人' ? name : myGroups.find((g) => g.groupId === groupId)?.name || name} live={live} /></span>}
      </div>
      <ChatLog bubbles={loading ? [] : bubbles} className="max-h-[520px] min-h-[260px]" resetKey={`${sub}:${target}`}>
        {!live && <p className="text-center text-[12px] text-faint">見本のトークです</p>}
        {loading && <p className="text-[13px] text-muted">読み込み中…</p>}
        {err && <p className="text-[13px] text-bad">{err}</p>}
        {mustPick && <p className="text-[13px] text-muted">同じ名前の LINE の相手が{mine.length}人います。表示名を見て、上で選んでください</p>}
        {none && <p className="text-[13px] text-muted">{sub === '個人' ? 'この人に紐付いた LINE の相手がいません（今のチャット画面で紐付けると出ます）' : 'グループ名にこの人の名前が入った LINE グループがありません'}</p>}
      </ChatLog>
      {embedded
        ? <p className="border-t border-line-soft px-[18px] py-3 text-[12px] text-faint">見るだけです。送るのは要員ページのチャットから。パスワードらしい文字は伏せています</p>
        : <Composer kind={sub === '個人' ? 'person' : 'group'} target={target} live={live} disabled={live && !target}
          onSent={() => (sub === '個人' ? th.reload() : gt.reload())} />}
    </section>
  );
}

function Composer({ kind, target, live, disabled, onSent }: { kind: 'person' | 'group'; target: string; live: boolean; disabled: boolean; onSent: () => void }) {
  const { hit, toast } = useMotivation();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!text.trim()) return;
    if (!live) { toast({ text: '見本なので送っていません', sub: 'ログインすると、本物の LINE に送れます' }); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/live/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kind === 'person' ? { kind, userId: target, text } : { kind, groupId: target, text }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; warning?: string; sample?: boolean };
      if (j.ok) { hit(); toast({ text: '送りました', sub: j.warning || (kind === 'person' ? '→ あおいのトークに残りました' : '→ グループのトークに残りました') }); setText(''); onSent(); }
      else toast({ text: j.sample ? '見本なので送っていません' : '送れませんでした', sub: j.error || '' });
    } catch (e) { toast({ text: '送れませんでした', sub: (e as Error).message }); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-line-soft px-[18px] py-3">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={5000} aria-label="送る文"
        placeholder={kind === 'person' ? 'あおいから本人に送る文' : 'グループに送る文（送ってよいかは今のシステムが決めます）'}
        className="min-h-[44px] min-w-0 flex-1 resize-y rounded-[10px] border border-field bg-surface px-3 py-2 text-[13px] outline-none" />
      <HoldButton label={busy ? '送っています…' : '長押しで送る'} disabled={busy || disabled || !text.trim()} onDone={send}
        title={disabled ? '送り先がありません' : undefined} />
    </div>
  );
}
