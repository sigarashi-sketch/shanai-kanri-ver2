'use client';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { WORLDS } from '@/lib/sy/kyouiku-lessons';
import { GATE_COURSES, type Gate, type GateCourse, type ReleaseSettings } from '@/lib/sy/kyouiku-release-types';
import { Chip, btnPrimary } from '@/components/sy/ui';

// bdsh のコースを いつ開くか（/kyouiku のタブ「解放」・2026-10-09 shoya）。決め方は lib/kyouiku-release-types.ts、口は /api/sy/s/kyouiku/release
//   参画決定前（おためし）の人に 何を開くか。参画決定後は 全部開く（CCNA・試験対策・キッティングは 人ごとにオンにした人だけ）。変えられるのは admin 以上
export default function ReleaseAdmin() {
  const [s, setS] = useState<ReleaseSettings | null>(null);
  const [saved, setSaved] = useState<ReleaseSettings | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch('/api/sy/s/kyouiku/release').then(async (r) => { const j = await r.json(); if (!r.ok) { setErr(j.error || '読み込めませんでした'); return; } setS(j.settings); setSaved(j.settings); setCanEdit(!!j.canEdit); }).catch(() => setErr('読み込めませんでした'));
  }, []);

  async function save() {
    if (!s) return; setBusy(true); setErr('');
    const r = await fetch('/api/sy/s/kyouiku/release', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setErr(j.error || '保存できませんでした'); return; }
    setS(j.settings); setSaved(j.settings); setDone(true); setTimeout(() => setDone(false), 2500);
  }

  if (!s) return <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 text-sm text-ig-muted">{err || '読み込み中…'}</div>;
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const setGate = (id: GateCourse, g: Gate) => setS({ ...s, gates: { ...s.gates, [id]: g } });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
      {err && <p className="mb-4 rounded-lg bg-ig-hover p-3 text-sm text-ig-danger">{err}</p>}
      <h2 className="text-[15px] font-bold">コースの解放</h2>
      <p className="mt-1 text-sm text-ig-muted">参画決定前の人（いけどんのプロパーリストに居て、参画決定・稼働中 の行がまだ無い人）に どこまで開くかを決めます。いけどんで参画決定になると、同じURLのまま 次に開いた時から全部開きます。プロパーリストに居ない社員・内勤は いつも全部開いています。</p>
      {!canEdit && <p className="mt-2 text-sm text-ig-warn">設定を変えられるのは admin 以上です（見るだけ）。</p>}

      <section className="mt-5 rounded-xl border border-ig-border p-4">
        <h3 className="text-sm font-bold">スプレッドシート</h3>
        <p className="mt-1 text-xs text-ig-muted">参画決定前に入れるのは 最初の何ワールドまでか。参画決定後は 全ワールド。</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip on={s.excelWorlds === 0} onClick={() => canEdit && setS({ ...s, excelWorlds: 0 })}>閉じる</Chip>
          {WORLDS.map((w, k) => <Chip key={w.id} on={s.excelWorlds === k + 1} onClick={() => canEdit && setS({ ...s, excelWorlds: k + 1 })}>{k + 1 === WORLDS.length ? '全部' : `${w.title.split('　')[1]}まで`}</Chip>)}
        </div>
        <p className="mt-2 text-xs text-ig-muted">いま: {s.excelWorlds === 0 ? '参画決定前は スプレッドシートに入れません' : WORLDS.slice(0, s.excelWorlds).map((w) => w.title).join('／')}</p>
      </section>

      <section className="mt-4 rounded-xl border border-ig-border">
        <ul className="divide-y divide-ig-divider">
          {GATE_COURSES.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{c.name}</div>
                {c.id === 'kitting' && <div className="text-xs text-ig-muted">担当者が人ごとにオンにした人だけ（参画決定後も）</div>}
                {c.id === 'ccna' && <div className="text-xs text-ig-muted">担当者がオンにした人{s.ccnaStudy ? '＋勉強会（火・木・土）の回答に名前がある人' : 'だけ'}</div>}
                {c.id === 'mos' && <div className="text-xs text-ig-muted">準備中の間は だれにも開きません</div>}
              </div>
              <div className="flex gap-2">
                <Chip on={s.gates[c.id] === 'all'} onClick={() => canEdit && setGate(c.id, 'all')}>参画決定前から</Chip>
                <Chip on={s.gates[c.id] === 'kettei'} onClick={() => canEdit && setGate(c.id, 'kettei')}>参画決定から</Chip>
              </div>
            </li>
          ))}
          <li className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">CCNA を 勉強会で開く</div>
              <div className="text-xs text-ig-muted">勉強会（火・木・土）の回答に名前がある人（出席・リモート。先の日付の参加予定も含む・欠席だけの人は入れない）に CCNA を開く</div>
            </div>
            <div className="flex gap-2">
              <Chip on={s.ccnaStudy} onClick={() => canEdit && setS({ ...s, ccnaStudy: true })}>開く</Chip>
              <Chip on={!s.ccnaStudy} onClick={() => canEdit && setS({ ...s, ccnaStudy: false })}>開かない</Chip>
            </div>
          </li>
          <li className="px-4 py-3">
            <div className="text-sm font-semibold">CCNA 試験対策</div>
            <div className="text-xs text-ig-muted">完全に手作業。タブ「CCNA」→「配る人」で「試験対策」をオンにした人だけ（参画決定・勉強会・CCNA のオン／オフに関係しない）</div>
          </li>
        </ul>
      </section>

      {canEdit && (
        <div className="mt-4 flex items-center gap-3">
          <button type="button" className={btnPrimary} disabled={!dirty || busy} onClick={save}>{busy ? '保存中…' : '保存'}</button>
          {done && <span className="inline-flex items-center gap-1 text-sm text-ig-ok"><Check size={14} />保存しました（受講ページには 30秒ほどで反映）</span>}
        </div>
      )}
    </div>
  );
}
