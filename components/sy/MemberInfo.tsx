'use client';
import { useEffect, useState } from 'react';
import type { Memo } from '@/components/sy/compat';
import type { Member } from '@/components/sy/compat';
import { RECRUIT_STAGE_KEYS, candidateStatus } from '@/lib/sy/stages';
import { normName } from '@/lib/sy/name';
import { LEADER_LABEL, MENDAN_LABELS } from '@/lib/sy/teiki-types';
import { ArrowRightLeft, Ban, Handshake, MessageCircle, NotebookPen, Pencil, Phone, Trash2 } from 'lucide-react';
import { fx } from '@/components/sy/compat';
import MemberActivity from '@/components/sy/MemberActivity';
import MemberCheck from '@/components/sy/MemberCheck';
import MemberLtv from '@/components/sy/MemberLtv';
import MemberPhoto from '@/components/sy/MemberPhoto';
import MemberProper from '@/components/sy/MemberProper';
import { KindRow, MemoEditor, deleteMemo, fullDate, jstDay, today } from '@/components/sy/MemoEdit';
import { MemberTags } from '@/components/sy/Tags';
import { TagEditor } from '@/components/sy/TagEditor';
import type { Club } from '@/components/sy/useRoster';
import { StageBadge, ago, btnPrimary, inputCls } from '@/components/sy/ui';

const KIND_ICON: Record<string, typeof NotebookPen> = { memo: NotebookPen, call: Phone, line: MessageCircle, mendan: Handshake, stage: ArrowRightLeft };
// いけどんの定期面談メモの定型項目（taiou-modal.js と同じ）
const FIELD_LABEL: Record<string, string> = { genba_kenen: '現場懸念点', kongo_ganbaru: 'これから頑張りたいこと', hyouka_ima: '現状評価されていること' };

// 右クリック「メモをコピー」で渡す文字（本文＋定型項目。書いた人・日時は入れない）
const memoText = (a: Memo) => [a.body || '', ...Object.entries(a.fields || {}).filter(([, v]) => v).map(([k, v]) => `${FIELD_LABEL[k] || k}：${v}`)].filter(Boolean).join('\n');

// その人の情報（担当・部活・タグ・動き・粗利・名簿の項目・メモ）。名簿の詳細パネル（MemberDrawer）の「情報」タブと、チャット画面の右の欄で同じものを出す
// leader＝この人がコミュニティのリーダーか（定期面談ページが渡す。渡されない画面では コミュニティ名＝氏名 で見分ける）
export default function MemberInfo({ m, clubs, onPatch, leader }: {
  m: Member; clubs: Club[]; onPatch: (p: Partial<Member>) => void; leader?: boolean;
}) {
  const [memos, setMemos] = useState<Memo[] | null>(null);
  const [kind, setKind] = useState('memo');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isCand = m.kind === 'candidate';
  const isLeader = leader ?? (!!m.community && normName(m.community) === normName(m.name));
  // 面談の区分。リーダーを開いたときは「リーダー面談」を先に選んでおく
  const [mlabel, setMlabel] = useState(isLeader ? LEADER_LABEL : MENDAN_LABELS[0]);
  const [date, setDate] = useState(today());   // いつの記録か（あとから書くときは日付を戻せる）
  const [editId, setEditId] = useState('');    // 直している最中のメモ
  const [rev, setRev] = useState(0);           // 面談の記録が変わったら「活動の記録」を読み直す合図
  const reload = () => fetch(`/api/sy/s/memos?key=${encodeURIComponent(m.key)}`).then((r) => r.json()).then((j) => setMemos(j.memos || []));
  const byNew = (a: Memo[]) => [...a].sort((x, y) => y.created_at.localeCompare(x.created_at));

  // 呼ぶ側が key={m.key} で作り直すので、人が変わったときの読み直しはここだけでよい
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.key]);

  async function call(url: string, payload: unknown, method = 'POST') {
    setBusy(true); setErr('');
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setErr(j.error || '保存に失敗しました'); fx.toast(j.error || '保存に失敗しました', 'err'); return null; }
    return j;
  }
  async function saveRecruitTantou(v: string) {
    if (v === m.recruitTantou) return;
    if (!isCand) return;   // 従業員（いけどんの名簿）は見るだけ
    const ok = await call(`/api/sy/s/people/${m.key.slice(2)}`, { recruit_tantou: v }, 'PATCH');
    if (ok) { onPatch({ recruitTantou: v }); fx.toast('採用担当を保存しました'); fx.hit('tantou'); }
  }
  async function saveSalesTantou(v: string) {
    if (v === m.salesTantou) return;
    if (await call(`/api/sy/s/people/${m.key.slice(2)}`, { sales_tantou: v }, 'PATCH')) onPatch({ salesTantou: v });
  }
  async function saveStage(v: string) {
    if (await call(`/api/sy/s/people/${m.key.slice(2)}`, { stage: v }, 'PATCH')) {
      onPatch({ stage: v, status: candidateStatus(v, m.properStatus) });
      reload();
    }
  }
  // ぼうさん＝接触禁止の印（それゆけ未経験だけ・lib/bousan.ts）。付けると リマインド・アンケートの文章・配信が この人に 送られなくなる
  async function toggleBousan(on: boolean) {
    if (on && !confirm(`${m.name} さんを「ぼうさん（接触禁止）」にします。\n\n面談のリマインド・月次アンケートの文章・配信が この人には 送られなくなり、チャットで 紫に強調されます。よろしいですか？`)) return;
    if (await call('/api/sy/s/bousan', { key: m.key, name: m.name, on })) { onPatch({ bousan: on, ...(on ? { surveyTodo: false } : {}) }); fx.toast(on ? 'ぼうさん にしました' : 'ぼうさん を外しました'); }
  }
  async function toggleClub(c: Club) {
    const cur = clubs.filter((x) => m.clubs.includes(x.name));
    const next = m.clubs.includes(c.name) ? cur.filter((x) => x.id !== c.id) : [...cur, c];
    if (await call('/api/sy/s/member-clubs', { key: m.key, name: m.name, clubIds: next.map((x) => x.id) })) onPatch({ clubs: next.map((x) => x.name) });
  }
  async function addMemo() {
    if (!body.trim()) return;
    const j = await call('/api/sy/s/memos', { key: m.key, name: m.name, kind, body, label: kind === 'mendan' ? mlabel : '', date });
    if (j) { setMemos((a) => byNew([j.memo, ...(a || [])])); setBody(''); setDate(today()); fx.toast('メモを残しました'); fx.hit('memo'); if (kind === 'mendan') setRev((n) => n + 1); }
  }

  const info = ([
    ['所属会社', m.company], ['入社日', m.nyusha], ['案件最寄り', m.siteEki], ['本人最寄り', m.homeEki], ['コミュニティ', m.community],
    ['性別', m.gender], ['年齢', m.age], ['住所', m.address], ['資格', m.shikaku],
    ['契約期間', [m.start, m.end].filter(Boolean).join(' 〜 ')], ['単価', m.tanka], ['LINE', m.lineGroup],
  ] as [string, string][]).filter(([, v]) => v);

  return (
    <>
        <div className="ig-rise flex items-center gap-5 p-5">
          <MemberPhoto m={m} onPatch={onPatch} />
          <div className="min-w-0">
            <div className="text-xl font-bold">{m.name}</div>
            <div className="text-sm text-ig-muted">{m.kana}</div>
            <div className="mt-1"><StageBadge stage={m.status} /></div>
          </div>
        </div>
        <div className="px-5"><MemberTags m={m} /></div>

        <div className="px-5 mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs text-ig-muted">採用担当{!isCand && <span className="ml-1 text-[10px] text-ig-muted">いけどんの名簿（見るだけ）</span>}
            <input key={m.key + m.recruitTantou} defaultValue={m.recruitTantou} disabled={busy || !isCand} onBlur={(e) => isCand && saveRecruitTantou(e.target.value.trim())}
              className="mt-1 w-full rounded-lg border border-ig-border px-2 py-1.5 text-sm text-ig-text disabled:bg-ig-subtle disabled:text-ig-text" />
          </label>
          <label className="text-xs text-ig-muted">営業担当{!isCand && <span className="ml-1 text-[10px] text-ig-muted">名簿シート由来</span>}
            <input key={m.key + m.salesTantou} defaultValue={m.salesTantou} disabled={busy || !isCand} onBlur={(e) => isCand && saveSalesTantou(e.target.value.trim())}
              className="mt-1 w-full rounded-lg border border-ig-border px-2 py-1.5 text-sm text-ig-text disabled:bg-ig-subtle disabled:text-ig-text" />
          </label>
          {isCand && (
            <label className="text-xs text-ig-muted">ステージ
              <select disabled={busy} value={m.stage ?? m.status} onChange={(e) => saveStage(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ig-border bg-white px-2 py-1.5 text-sm text-ig-text">
                {RECRUIT_STAGE_KEYS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          )}
        </div>

        {/* ぼうさん（接触禁止）。それゆけ未経験だけの状態＝いけどんの名簿・プロパーリストには出ない */}
        <label className={`mx-5 mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2.5 ${m.bousan ? 'bg-ig-stop text-white' : 'ring-1 ring-ig-border'}`}>
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-ig-stop" checked={!!m.bousan} disabled={busy} onChange={(e) => toggleBousan(e.target.checked)} />
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-sm font-bold"><Ban size={14} strokeWidth={2.25} />ぼうさん（接触禁止）</span>
            <span className={`block text-[11px] ${m.bousan ? 'text-white/85' : 'text-ig-muted'}`}>チェックすると 面談のリマインド・月次アンケートの文章・配信を送りません。チャットでは紫で強調します</span>
          </span>
        </label>

        {/* いけどんのプロパーリストのチェック（営業止め〜営業停止）。見るだけ・プロパーリストに居る人にだけ出る */}
        <MemberProper key={'pr' + m.key} m={m} />

        <div className="px-5 mt-4">
          <div className="text-xs text-ig-muted mb-1">部活</div>
          {clubs.length === 0 ? <p className="text-xs text-ig-muted">部活はまだありません（従業員名簿の「部活別」タブで作れます）</p> : (
            <div className="flex flex-wrap gap-1.5">
              {clubs.map((c) => {
                const on = m.clubs.includes(c.name);
                return <button key={c.id} disabled={busy} onClick={(e) => { if (!on) fx.celebrate(e.currentTarget); toggleClub(c); }}
                  className={`ig-press rounded-lg px-2.5 py-1 text-xs font-semibold ${on ? 'bg-ig-text text-white' : 'bg-ig-hover text-ig-text'}`}>{c.name}</button>;
              })}
            </div>
          )}
        </div>

        <div className="px-5 mt-4"><TagEditor key={m.key} m={m} onPatch={onPatch} /></div>

        <MemberActivity key={m.key} m={m} memos={memos} rev={rev} onChanged={() => { reload(); setRev((n) => n + 1); }} />
        {/* b-dash のスキルチェックの点。受けた人にだけ出る */}
        <MemberCheck key={'chk' + m.key} m={m} />
        {/* 各月の粗利とLTV。admin 以上にだけ出る（中で確かめる）。従業員だけ */}
        {!isCand && <MemberLtv key={'ltv' + m.key} m={m} />}

        {info.length > 0 && (
          // 右クリックでコピー（public/ctx-menu.js の目印）: 1項目は「入社日をコピー」、枠は「項目をまとめてコピー」
          <dl data-ctx-copy-all={info.map(([k, v]) => `${k}：${v}`).join('\n')} data-ctx-copy-label="項目" className="mx-5 mt-4 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 rounded-lg bg-ig-subtle p-4 text-sm">
            {info.map(([k, v]) => <div key={k} data-ctx-copy={v} data-ctx-copy-label={k} className="contents"><dt className="text-ig-muted">{k}</dt><dd className="break-words whitespace-pre-wrap">{v}</dd></div>)}
          </dl>
        )}
        {m.caseSummary && (
          <details data-ctx-copy={m.caseSummary} data-ctx-copy-label="案件サマリー" className="mx-5 mt-3 rounded-lg bg-ig-subtle p-4 text-sm">
            <summary className="cursor-pointer text-ig-text">案件サマリー</summary>
            <p className="mt-2 whitespace-pre-wrap text-ig-text">{m.caseSummary}</p>
          </details>
        )}

        <div className="mx-5 mt-5 mb-2 text-sm font-bold text-ig-text">メモ</div>
        <div className="mx-5 rounded-lg ring-1 ring-ig-border p-3">
          <KindRow d={{ kind, label: mlabel, body, date }} set={(p) => { if (p.kind) setKind(p.kind); if (p.label) setMlabel(p.label); if (p.date) setDate(p.date); }} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="やりとりの内容を残す（⌘+Enterで記録）"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addMemo(); }}
            className={`${inputCls} w-full resize-none`} />
          <div className="mt-2 flex justify-end"><button disabled={busy || !body.trim()} onClick={addMemo} className={`ig-press ${btnPrimary}`}>記録する</button></div>
        </div>
        {err && <p className="mx-5 mt-2 text-sm text-ig-danger">{err}</p>}
        <ol className="mx-5 my-4 space-y-3">
          {memos === null && <li className="text-center text-xs text-ig-muted">読み込み中…</li>}
          {memos?.map((a) => (
            editId === a.id ? (
              <li key={a.id}>
                <MemoEditor id={a.id} init={{ kind: a.kind, label: a.label || mlabel, body: a.body || '', date: jstDay(a.created_at) }} onCancel={() => setEditId('')}
                  onSaved={(n) => { setEditId(''); setMemos((x) => byNew((x || []).map((y) => (y.id === n.id ? n : y)))); if (a.kind === 'mendan' || n.kind === 'mendan') setRev((v) => v + 1); }} />
              </li>
            ) : (
            <li key={a.id} data-ctx-copy={memoText(a)} data-ctx-copy-label="メモ" className="group flex gap-3 text-sm">
              <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ig-hover text-ig-text">{(() => { const I = KIND_ICON[a.kind] || NotebookPen; return <I size={14} strokeWidth={2} />; })()}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-xs text-ig-muted">
                  <span className="min-w-0" title={fullDate(a.created_at)}>{a.label && <span className="mr-1 rounded bg-ig-hover px-1 text-ig-text">{a.label}</span>}{a.actor_name || a.actor_email}・{ago(a.created_at)}</span>
                  {/* ステージ変更は自動の記録なので 直す・消すは出さない。スマホは いつも見せる */}
                  {a.kind !== 'stage' && (
                    <span className="ml-auto flex shrink-0 gap-0.5 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                      <button title="直す" aria-label="直す" onClick={() => setEditId(a.id)} className="ig-press rounded p-1 text-ig-muted hover:bg-ig-hover hover:text-ig-text"><Pencil size={13} /></button>
                      <button title="消す" aria-label="消す" onClick={async () => { if (await deleteMemo(a.id)) { setMemos((x) => (x || []).filter((y) => y.id !== a.id)); if (a.kind === 'mendan') setRev((v) => v + 1); } }}
                        className="ig-press rounded p-1 text-ig-muted hover:bg-ig-danger/10 hover:text-ig-danger"><Trash2 size={13} /></button>
                    </span>
                  )}
                </div>
                {a.body && <div className="whitespace-pre-wrap text-ig-text">{a.body}</div>}
                {Object.entries(a.fields || {}).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="mt-1"><span className="text-xs text-ig-muted">{FIELD_LABEL[k] || k}：</span><span className="whitespace-pre-wrap text-ig-text">{v}</span></div>
                ))}
              </div>
            </li>
            )
          ))}
          {memos?.length === 0 && <li className="text-center text-xs text-ig-muted">まだメモはありません</li>}
        </ol>
    </>
  );
}
