'use client';
import { useEffect, useState } from 'react';
import { fx } from '@/components/sy/compat';
import {
  AUDIENCES, AUDIENCE_SHORT, BUTTONS, LIFF_ID_RE, MENU_IMAGE, MENU_VERSION, M_ENDPOINT, SLOT_MINS, TEXT_MAX, hasText, liffUrl,
  type Audience, type MendanSettings, type MenuKey, type RichMenuSettings,
} from '@/lib/sy/richmenu-types';
import { PageHeader, btnGray, btnPrimary, inputCls } from '@/components/sy/ui';

interface Friend { user_id: string; display_name: string; subject_name: string }
interface State { settings: RichMenuSettings; configured: boolean; liveId: string; friends: number; testers: Friend[]; canEdit: boolean }
type Edit = Pick<RichMenuSettings, 'liffId' | 'audience' | 'mendan'> & { texts: Record<MenuKey, string> };

const editOf = (s: RichMenuSettings): Edit => ({
  liffId: s.liffId, audience: { ...s.audience }, mendan: { ...s.mendan },
  texts: Object.fromEntries(BUTTONS.map((b) => [b.key, s.texts[b.key] || b.text])) as Record<MenuKey, string>,
});
const AUD_TONE: Record<Audience, string> = { off: 'bg-ig-muted', leader: 'bg-[#7B5CF0]', kadou: 'bg-ig-warn', all: 'bg-ig-ok' };

// リッチメニューの管理。左=メニューの見た目（押すと そのボタンの設定へ）と LINE へ出す操作、右=選んだボタンの設定（だれに開けるか・中身）
//   ボタンを押すと LIFF のページ（/m/<key>）が開く。開け方・文面・面談の決まりは 保存した瞬間から効く（LINE のメニューは作り直さない）
export default function RichMenuView() {
  const [st, setSt] = useState<State | null>(null);
  const [err, setErr] = useState('');
  const [ed, setEd] = useState<Edit | null>(null);
  const [sel, setSel] = useState<MenuKey>(BUTTONS[0].key);
  const [busy, setBusy] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Friend[] | null>(null);

  useEffect(() => {
    fetch('/api/sy/s/richmenu').then((r) => r.json()).then((j) => { if (j.error) setErr(j.error); else { setSt(j); setEd(editOf(j.settings)); } }).catch(() => setErr('読み込みに失敗しました'));
  }, []);
  if (err && !st) return <div><PageHeader title="リッチメニュー" /><p className="p-6 text-sm text-ig-danger">{err}</p></div>;
  if (!st || !ed) return <div><PageHeader title="リッチメニュー" sub="読み込み中…" /></div>;

  const dirty = JSON.stringify(ed) !== JSON.stringify(editOf(st.settings));
  const s = st.settings;
  const made = !!s.line.id && s.line.version === MENU_VERSION && s.line.liffId === s.liffId;
  const live = !!st.liveId && st.liveId === s.line.id;   // LINE 側で いま全員に出ているのが このメニューか
  const stale = live && !made;                           // 全員に出ているが LIFF ID が変わった＝出し直しが要る
  const cur = BUTTONS.find((b) => b.key === sel)!;
  const liffOk = LIFF_ID_RE.test(ed.liffId.trim());
  const ready = !!s.liffId && st.configured;
  const setM = (p: Partial<MendanSettings>) => setEd({ ...ed, mendan: { ...ed.mendan, ...p } });

  async function save() {
    if (ed!.liffId.trim() && !liffOk) { setErr('LIFF ID の形が違います（例: 1234567890-AbCdEfGh）'); return; }
    setBusy('save'); setErr('');
    const r = await fetch('/api/sy/s/richmenu', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...ed, liffId: ed!.liffId.trim() }) });
    const j = await r.json().catch(() => ({})); setBusy('');
    if (!r.ok) { setErr(j.error || '保存できませんでした'); fx.toast(j.error || '保存できませんでした', 'err'); return; }
    setSt({ ...st!, settings: j.settings }); setEd(editOf(j.settings)); fx.toast('保存しました');
  }
  async function act(action: 'test' | 'untest' | 'apply' | 'off', userId = '', okMsg = '') {
    setBusy(action + userId); setErr('');
    const r = await fetch('/api/sy/s/richmenu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, userId }) });
    const j = await r.json().catch(() => ({})); setBusy('');
    if (!r.ok) { setErr(j.error || '反映できませんでした'); fx.toast(j.error || '反映できませんでした', 'err'); return; }
    setSt({ ...st!, settings: j.settings, liveId: j.liveId || '', testers: j.testers || [] }); fx.toast(okMsg);
  }
  async function search() {
    if (!q.trim()) return;
    setBusy('search');
    const j = await fetch('/api/sy/s/richmenu?q=' + encodeURIComponent(q.trim())).then((r) => r.json()).catch(() => ({ friends: [] }));
    setBusy(''); setFound(j.friends || []);
  }
  const applyAll = () => {
    if (!window.confirm(`友だち ${st.friends}人 全員のトーク画面にメニューを出します。よろしいですか？`)) return;
    act('apply', '', '友だち全員にメニューを出しました');
  };
  const offAll = () => {
    if (!window.confirm('友だち全員のトーク画面からメニューを外します。よろしいですか？')) return;
    act('off', '', 'メニューを外しました');
  };
  const nameOf = (f: Friend) => f.subject_name || f.display_name || f.user_id.slice(0, 8);

  return (
    <div>
      <PageHeader title="リッチメニュー" sub={stale ? '全員に出ていますが、LIFF ID が変わったので 出し直しが必要です' : live ? `友だち全員に出ています（${st.friends}人）` : made ? 'LINE に用意済み・まだ全員には出していません' : 'まだ LINE に出していません'}>
        {st.canEdit && <button disabled={!!busy || !dirty} onClick={save} className={btnPrimary}>{busy === 'save' ? '保存中…' : dirty ? '変更を保存する' : '保存済み'}</button>}
      </PageHeader>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-5 md:px-6">
        {err && <p className="text-sm text-ig-danger">{err}</p>}
        {!st.configured && <p className="rounded-lg border border-ig-border bg-ig-subtle px-3 py-2 text-sm text-ig-warn">公式LINEの鍵が未設定のため、LINE への反映はできません。</p>}

        <section className="rounded-lg border border-ig-border p-4">
          <h2 className="mb-1 text-sm font-bold">LIFF ID{s.liffId ? '' : '（まだ入っていません）'}</h2>
          <p className="mb-2 text-xs leading-relaxed text-ig-muted">
            ボタンを押した人が だれかを LINE に確かめるための番号です。LINE Developers で、公式LINE「インフォメーション」と<b>同じプロバイダー</b>に「LINEログイン」チャネルを作り、その中に LIFF アプリを足すと出ます。
            LIFF アプリの設定は サイズ <b>Full</b>・エンドポイントURL <b className="select-all">{M_ENDPOINT}</b>・Scope <b>profile</b>。チャネルは「公開」にしてください。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input value={ed.liffId} onChange={(e) => setEd({ ...ed, liffId: e.target.value })} readOnly={!st.canEdit} placeholder="例: 1234567890-AbCdEfGh" className={`${inputCls} w-64`} />
            {ed.liffId.trim() && !liffOk && <span className="text-xs text-ig-danger">形が違います</span>}
            {s.liffId && <span className="text-xs text-ig-muted">「{cur.label}」の行き先: <span className="select-all">{liffUrl(s.liffId, cur.key)}</span></span>}
          </div>
        </section>

        <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <section>
            <h2 className="mb-1 text-sm font-bold">メニューの見た目</h2>
            <div className="relative overflow-hidden rounded-lg border border-ig-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={MENU_IMAGE} alt="リッチメニュー" className="block w-full" />
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-2">
                {BUTTONS.map((b) => (
                  <button key={b.key} onClick={() => setSel(b.key)} aria-label={b.label}
                    className={`relative ig-press ${sel === b.key ? 'ring-2 ring-inset ring-ig-primary' : 'hover:bg-black/5'}`}>
                    <span className={`absolute right-1.5 top-1.5 rounded-lg px-1.5 py-0.5 text-[10px] font-semibold text-white ${AUD_TONE[ed.audience[b.key]]}`}>{AUDIENCE_SHORT[ed.audience[b.key]]}</span>
                  </button>
                ))}
              </div>
            </div>

            {st.canEdit && (
              <div className="mt-5 space-y-4">
                <div>
                  <h2 className="mb-1 text-sm font-bold">1. まず1人で試す</h2>
                  <div className="flex gap-2">
                    <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} placeholder="友だちの名前（LINEの表示名でも可）" className={`${inputCls} min-w-0 flex-1`} />
                    <button disabled={!!busy || !q.trim()} onClick={search} className={btnGray}>{busy === 'search' ? '検索中…' : 'さがす'}</button>
                  </div>
                  {found && found.length === 0 && <p className="mt-2 text-xs text-ig-muted">見つかりませんでした。</p>}
                  {found && found.length > 0 && (
                    <div className="mt-2 overflow-hidden rounded-lg border border-ig-border">
                      {found.map((f) => (
                        <div key={f.user_id} className="flex items-center gap-2 border-b border-ig-divider px-3 py-2 text-sm last:border-b-0">
                          <span className="min-w-0 flex-1 truncate"><span className="font-semibold">{nameOf(f)}</span>{f.subject_name && f.display_name && <span className="ml-2 text-xs text-ig-muted">{f.display_name}</span>}</span>
                          <button disabled={!!busy || !ready} onClick={() => act('test', f.user_id, 'この人にだけメニューを出しました')} className={btnGray}>{busy === 'test' + f.user_id ? '…' : 'この人に出す'}</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {st.testers.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-ig-muted">試している人:</span>
                      {st.testers.map((f) => (
                        <span key={f.user_id} className="inline-flex items-center gap-1.5 rounded-lg bg-ig-hover px-2 py-1 font-semibold">{nameOf(f)}
                          <button disabled={!!busy} onClick={() => act('untest', f.user_id, '試すのをやめました')} className="font-normal text-ig-muted hover:underline">外す</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="mb-1 text-sm font-bold">2. 友だち全員に出す</h2>
                  <p className="mb-2 text-xs text-ig-muted">友だち {st.friends}人のトーク画面に出ます（これから友だちになる人にも出ます）。通数は使いません。開けていないボタンは、押した先で「準備中」と出ます。</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button disabled={!!busy || !ready || (live && !stale)} onClick={applyAll} className={btnPrimary}>{busy === 'apply' ? '反映中…' : stale ? '全員に出し直す' : live ? '全員に出ています' : '友だち全員に出す'}</button>
                    {live && <button disabled={!!busy} onClick={offAll} className={btnGray}>{busy === 'off' ? '…' : '全員から外す'}</button>}
                  </div>
                  {!s.liffId && <p className="mt-2 text-xs text-ig-warn">先に LIFF ID を入れて保存してください。</p>}
                  {s.line.appliedAt && <p className="mt-2 text-xs text-ig-muted">最後の操作: {new Date(s.line.appliedAt).toLocaleString('ja-JP')}・{s.line.appliedBy}</p>}
                  {!!st.liveId && !live && <p className="mt-2 text-xs text-ig-warn">いま LINE 側では 別のメニューが全員に出ています。「友だち全員に出す」を押すと このメニューに置き換わります。</p>}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-5">
            <div>
              <h2 className="mb-1 text-sm font-bold">「{cur.label}」を だれに開けるか</h2>
              <div className="flex flex-wrap gap-2">
                {AUDIENCES.map(([a, label]) => (
                  <button key={a} disabled={!st.canEdit} onClick={() => setEd({ ...ed, audience: { ...ed.audience, [cur.key]: a } })}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${ed.audience[cur.key] === a ? 'bg-ig-text text-white' : 'bg-ig-hover text-ig-text'}`}>{label}</button>
                ))}
              </div>
            </div>

            {hasText(cur) && (
              <div>
                <h2 className="mb-1 text-sm font-bold">ページに出す文面</h2>
                <p className="mb-2 text-xs text-ig-muted">URL は 押せるリンクになります。{cur.kind === 'clubs' && '文面の下に、従業員名簿の「部活別」タブで作った部活の一覧が出ます（1つも無い間は「準備中」）。'}</p>
                <textarea value={ed.texts[cur.key]} onChange={(e) => setEd({ ...ed, texts: { ...ed.texts, [cur.key]: e.target.value.slice(0, TEXT_MAX) } })} readOnly={!st.canEdit}
                  rows={10} className={`${inputCls} w-full resize-y leading-relaxed`} />
                <div className="mt-1 flex items-center gap-3 text-xs text-ig-muted">
                  <span>{ed.texts[cur.key].length} / {TEXT_MAX}文字</span>
                  {st.canEdit && ed.texts[cur.key].trim() !== cur.text && <button onClick={() => setEd({ ...ed, texts: { ...ed.texts, [cur.key]: cur.text } })} className="ml-auto text-ig-primary hover:underline">最初の文面に戻す</button>}
                </div>
              </div>
            )}
            {cur.kind === 'bdash' && <p className="rounded-lg bg-ig-subtle px-3 py-2 text-xs leading-relaxed text-ig-muted">開けた人には、その人専用の bdsh の受講ページへ進むボタンが出ます（内勤が受講URLを送らなくて済みます）。営業中の人の「おためし」などの決まりは b-dash 側のままです。</p>}
            {cur.kind === 'survey' && <p className="rounded-lg bg-ig-subtle px-3 py-2 text-xs leading-relaxed text-ig-muted">Googleフォームと同じ設問（氏名・就業先の最寄り・主な業務内容・現場の満足度・理由・資格について・理由・目標資格・その他）を、このページで答えてもらいます。すべて必須です（資格の「理由」は「出来ていない」を選んだ人だけ）。入社月は聞きません（名簿の入社日で分かるため）。名簿と紐付いている人は 氏名も入れません。回答は「月次アンケート」のページに そのまま出ます。</p>}
            {cur.kind === 'mendan' && (
              <div>
                <h2 className="mb-1 text-sm font-bold">面談の予約の決まり</h2>
                <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm">
                  <span className="text-ig-muted">リーダーの相手</span>
                  <input value={ed.mendan.leaderHost} onChange={(e) => setM({ leaderHost: e.target.value })} readOnly={!st.canEdit} className={inputCls} />
                  <span className="text-ig-muted">メンバーの相手</span>
                  <input value={ed.mendan.memberHost} onChange={(e) => setM({ memberHost: e.target.value })} readOnly={!st.canEdit} className={inputCls} />
                  <span className="text-ig-muted">受け付ける時間</span>
                  <span className="flex items-center gap-2">
                    <input type="time" step={900} value={ed.mendan.startHm} onChange={(e) => setM({ startHm: e.target.value })} disabled={!st.canEdit} className={inputCls} />〜
                    <input type="time" step={900} value={ed.mendan.endHm} onChange={(e) => setM({ endHm: e.target.value })} disabled={!st.canEdit} className={inputCls} />
                  </span>
                  <span className="text-ig-muted">1回の長さ</span>
                  <select value={ed.mendan.slotMin} onChange={(e) => setM({ slotMin: Number(e.target.value) })} disabled={!st.canEdit} className={`${inputCls} w-28`}>{SLOT_MINS.map((m) => <option key={m} value={m}>{m}分</option>)}</select>
                  <span className="text-ig-muted">何日先まで</span>
                  <span className="flex items-center gap-2"><input type="number" min={1} max={20} value={ed.mendan.days} onChange={(e) => setM({ days: Number(e.target.value) })} readOnly={!st.canEdit} className={`${inputCls} w-20`} />日ぶん（{ed.mendan.weekends ? '土日祝も数える' : '平日だけ数える'}）</span>
                  <span className="text-ig-muted">土日祝</span>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={ed.mendan.weekends} onChange={(e) => setM({ weekends: e.target.checked })} disabled={!st.canEdit} className="h-4 w-4 accent-[#0095f6]" />土日祝も受け付ける</label>
                </div>
              </div>
            )}
            {!st.canEdit && <p className="text-xs text-ig-muted">設定を変えられるのは admin と super admin です。</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
