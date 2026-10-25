'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lock, Users } from 'lucide-react';
import { PageTitle } from '@/components/ui';
import { LiveBanner, type LiveState } from '@/components/Live';
import { NoAccess, usePerms } from '@/components/Perms';
import { candidateLabel, openCount, type SameNameItem } from '@/lib/live/same-name';

// 同姓同名をつなぐ（設定の中・全体管理者だけ・10-25 shoya「応募IDで進めて」）。
//   今の名簿（稼働管理の一覧）と基本情報フォームの回答は氏名でしか持っていないので、同じ名前の人が2人以上いると取り違える。
//   ここで「この月の名簿の行はどの応募の人か」「この回答はどの応募の人か」を選ぶ（選ぶだけ・手で番号を打たない）。
//   選ぶと、社員ページ・名前の小窓・基本情報がその人の分だけになる。選んだらすぐ保存（今のシステムの roster?op=person）
//   本物＝/api/live/same-name。ログインしていなければ見本
type Res = { ok?: boolean; ym?: string; items?: SameNameItem[]; error?: string };

const SAMPLE: SameNameItem[] = [{
  key: 'みほん', name: '見本 太郎', inRoster: true, rosterLink: '', rosterLinkExact: false,
  candidates: [
    { personId: 'sample-a', applicantId: '', tantou: '見本A', shozoku: '見本会社', eki: '見本駅', kadouChu: true, jitai: false, poa: false, sankakuKettei: true },
    { personId: 'sample-b', applicantId: '', tantou: '見本B', shozoku: '', eki: '別の駅', kadouChu: false, jitai: false, poa: false, sankakuKettei: false },
  ],
  answers: [{ token: 'sample1', personId: '', submittedAt: new Date().toISOString(), eki: '別の駅', where: 'extra' }],
}];

const ymd = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
};

export default function SameNamePage() {
  const { manageAccess } = usePerms();
  const [state, setState] = useState<LiveState>('loading');
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [ym, setYm] = useState('');
  const [items, setItems] = useState<SameNameItem[]>([]);
  const [saving, setSaving] = useState('');
  const [msg, setMsg] = useState<{ key: string; text: string; bad?: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/live/same-name', { cache: 'no-store' });
      const j = (await r.json().catch(() => ({}))) as Res;
      if (r.status === 401 && j.error === 'not_logged_in') { setItems(SAMPLE); setYm('見本'); setState('sample'); return; }
      if (r.status === 403) { setForbidden(true); setState('live'); return; }
      if (!r.ok) { setError(j.error || `読めませんでした（${r.status}）`); setState('error'); return; }
      setItems(j.items || []); setYm(j.ym || ''); setError(''); setState('live');
    } catch (e) { setError((e as Error).message); setState('error'); }
  }, []);
  useEffect(() => { if (manageAccess) void load(); }, [load, manageAccess]);

  const save = async (key: string, payload: Record<string, string>) => {
    if (state === 'sample') { setMsg({ key, text: '見本なので保存しません' }); return; }
    setSaving(key); setMsg(null);
    try {
      const r = await fetch('/api/live/same-name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) { setMsg({ key, text: j.error || `保存できませんでした（${r.status}）`, bad: true }); return; }
      setMsg({ key, text: '保存しました' });
      await load();
    } catch (e) { setMsg({ key, text: (e as Error).message, bad: true }); }
    finally { setSaving(''); }
  };

  if (!manageAccess) return <NoAccess label="同姓同名をつなぐ" />;
  if (forbidden) return (
    <main className="px-6 pb-12 pt-[22px]">
      <div className="mo-fade-up rounded-xl border border-line bg-surface px-8 py-14 text-center">
        <Lock className="mx-auto text-faint" size={28} />
        <h1 className="mt-3 text-xl font-bold">同姓同名をつなぐのは全体管理者（super_admin・admin）だけです</h1>
        <p className="mt-2 text-body text-muted">今の社内システムのロールで判定しています。</p>
      </div>
    </main>
  );

  const open = items.reduce((n, x) => n + openCount(x), 0);
  return (
    <main className="flex flex-col gap-3.5 px-4 pb-12 pt-[22px] sm:px-6">
      <PageTitle title="同姓同名をつなぐ" sub="同じ名前の人が2人以上いるとき、名簿の行と基本情報の回答がどの応募の人かを選びます（採用担当・所属・最寄駅で見分ける）" />
      <LiveBanner state={state} error={error} onReload={load} note="今の社内システムの営業リスト（応募）・名簿・基本情報の回答を読んでいます。選ぶとすぐ保存します" />
      <div className="text-sm text-muted">{ym && `${ym}の名簿で見ています・`}同じ名前 {items.length}件{open ? `・まだ決まっていないもの ${open}件` : ''}</div>

      {state !== 'loading' && items.length === 0 && (
        <section className="rounded-xl border border-line bg-surface px-6 py-10 text-center text-body text-muted">未経験の人で、同じ名前の応募が2つ以上ある人はいません</section>
      )}

      {items.map((x, i) => {
        const rk = `r:${x.key}`;
        return (
          <section key={x.key} className="mo-fade-up flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-4 sm:px-5" style={{ ['--i' as string]: Math.min(i, 10) }}>
            <div className="flex flex-wrap items-center gap-2">
              <Users size={15} className="text-faint" />
              <b className="text-md">{x.name}</b>
              <span className="chip" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }}>応募 {x.candidates.length}つ</span>
              {openCount(x) > 0 && <span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>未決 {openCount(x)}</span>}
            </div>
            <ol className="flex flex-col gap-1 text-sm text-muted">
              {x.candidates.map((c, k) => <li key={c.personId}><b className="text-ink">応募{k + 1}</b>　{candidateLabel(c)}</li>)}
            </ol>

            <div className="flex flex-col gap-1.5 border-t border-line-soft pt-3">
              <div className="text-sm font-bold text-muted">名簿（{ym || '今月'}）の行</div>
              {x.inRoster || x.rosterLink ? (
                <label className="flex flex-wrap items-center gap-2 text-body">
                  <span>この月の名簿の「{x.name}」は</span>
                  <select value={x.rosterLinkExact ? x.rosterLink : ''} disabled={saving === rk}
                    onChange={(e) => e.target.value && void save(rk, { kind: 'roster', name: x.key, ym, personId: e.target.value })}
                    className="min-h-9 min-w-0 max-w-full rounded-lg border border-field bg-surface px-2 text-body">
                    <option value="">{x.rosterLink ? `（前の月から：応募${x.candidates.findIndex((c) => c.personId === x.rosterLink) + 1}）選ぶ…` : 'まだ決まっていません。選ぶ…'}</option>
                    {x.candidates.map((c, k) => <option key={c.personId} value={c.personId}>応募{k + 1}（{candidateLabel(c)}）</option>)}
                  </select>
                </label>
              ) : <div className="text-sm text-faint">この月の名簿にはこの名前の行がありません</div>}
              {msg?.key === rk && <div className={`text-sm ${msg.bad ? 'text-bad' : 'text-muted'}`}>{msg.text}</div>}
            </div>

            <div className="flex flex-col gap-1.5 border-t border-line-soft pt-3">
              <div className="text-sm font-bold text-muted">基本情報フォームの回答</div>
              {x.answers.length === 0 && <div className="text-sm text-faint">回答はまだありません</div>}
              {x.answers.map((a) => {
                const ak = `a:${x.key}:${a.token || 'sheet'}`;
                return (
                  <div key={ak} className="flex flex-col gap-1">
                    <label className="flex flex-wrap items-center gap-2 text-body">
                      <span>{a.submittedAt ? `${ymd(a.submittedAt)}の回答` : '前のシートからの回答'}（最寄駅 {a.eki || '—'}{a.where === 'extra' ? '・同じ名前の人の回答と分けて置いてある分' : ''}）は</span>
                      <select value={a.personId} disabled={saving === ak}
                        onChange={(e) => e.target.value && void save(ak, { kind: 'basic', name: x.key, token: a.token, personId: e.target.value })}
                        className="min-h-9 min-w-0 max-w-full rounded-lg border border-field bg-surface px-2 text-body">
                        <option value="">まだ決まっていません。選ぶ…</option>
                        {x.candidates.map((c, k) => <option key={c.personId} value={c.personId}>応募{k + 1}（{candidateLabel(c)}）</option>)}
                      </select>
                    </label>
                    {msg?.key === ak && <div className={`text-sm ${msg.bad ? 'text-bad' : 'text-muted'}`}>{msg.text}</div>}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      <p className="text-xs text-faint">請求（請求書づくり・現場/取引先マスタ・格納）は今までどおり氏名で動きます。ここでつないでも請求は変わりません。</p>
    </main>
  );
}
