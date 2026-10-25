'use client';

import { useState } from 'react';
import { Check, Search } from 'lucide-react';
import { LiveBanner, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { PersonName } from '@/components/Person';

// アラート設定の「今の社内システムの未打刻のお知らせ」（本物・10-25）。読むだけ：
//   GET /api/kintai-alert?action=groups … 送る/止める（Vercel の KINTAI_ALERT_ENABLED）と通知先のグループ
//   GET /api/kintai-alert?action=dry    … 押したときだけ、今日の判定を送らずに数える（freee を読むので数十秒かかる）
//   ★送る（run）・通知先を変える（setGroup）は ver2 から呼ばない。この下の段階・宛先の決まりは ver2 の中だけ（今のシステムには無い）
type Groups = { ok?: boolean; enabled?: boolean; current?: { id: string; name: string; source: string }; groups?: { id: string; name: string }[]; error?: unknown };
type Dry = {
  ok?: boolean; date?: string; nowJst?: string; targetCount?: number; unpunched?: { name: string; companyLabel: string; rep: string }[];
  needsLink?: string[]; fetchErrors?: { name: string }[]; decision?: { send: boolean; mode: string; reason: string }; blockedReason?: string;
  config?: { enabled: boolean; groupConfigured: boolean; today: string }; error?: { kind: string; message: string } | string;
};
const errText = (e: unknown) => (typeof e === 'string' ? e : (e as { message?: string } | null)?.message || '');

export function KintaiAlertLive() {
  const g = useIke<Groups>('kintai-alert?action=groups');
  const [go, setGo] = useState(false);
  const dry = useIke<Dry>(go ? 'kintai-alert?action=dry' : null);
  const mk = useMikeiken();
  if (g.state === 'sample' || g.state === 'loading') return null;
  const un = dry.data?.unpunched ? mk.keep(dry.data.unpunched, 'name') : [];
  const dErr = dry.state === 'error' ? dry.error : dry.data && dry.data.ok === false ? errText(dry.data.error) : '';
  return (
    <section className="mo-fade-up flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
      <LiveBanner state={g.state === 'error' ? 'error' : 'live'} error={g.error} onReload={g.reload} note="今の社内システムの未打刻のお知らせ（平日10:00）。見るだけです（送る・通知先を変えるは今の社内システムから）" />
      <div className="flex flex-wrap items-center gap-2 text-body">
        <b>未打刻のお知らせ</b>
        {g.data && <>
          <span className="chip" style={{ background: g.data.enabled ? 'var(--tone-ok-bg)' : 'var(--tone-caution-bg)', color: g.data.enabled ? 'var(--tone-ok-fg)' : 'var(--tone-caution-fg)' }}>{g.data.enabled ? '送っている' : '止めている（ためし）'}</span>
          <span className="text-muted">通知先：{g.data.current?.name || '未設定'}</span>
        </>}
        <button onClick={() => (go ? dry.reload() : setGo(true))} disabled={go && dry.state === 'loading'} className="btn-secondary ml-auto"><Search size={14} />{go && dry.state === 'loading' ? '数えています…（数十秒）' : '今日の未打刻を数える（送らない）'}</button>
      </div>
      {go && <MikeikenNote mk={mk} live />}
      {dErr && <div className="text-sm" style={{ color: 'var(--tone-bad-fg)' }}>{dErr}</div>}
      {go && dry.data?.ok !== false && dry.data?.date && (
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="text-muted">{dry.data.date} {dry.data.nowJst} 時点・対象 {dry.data.targetCount ?? 0}人（全員）・未打刻 {dry.data.unpunched?.length ?? 0}人（うち未経験 {un.length}人）{dry.data.needsLink?.length ? `・freee の紐付けが要る ${dry.data.needsLink.length}人` : ''}{dry.data.fetchErrors?.length ? `・読めなかった ${dry.data.fetchErrors.length}人` : ''}</div>
          {dry.data.decision && <div className="text-faint">送るなら：{dry.data.decision.send ? (dry.data.decision.mode === 'summary' ? 'まとめの1通だけ' : '人の一覧つき') : `送らない（${dry.data.decision.reason || dry.data.blockedReason || '—'}）`}</div>}
          {un.length === 0 ? <div className="inline-flex items-center gap-1 text-ok"><Check size={13} />未経験の人の未打刻はありません</div> : (
            <ul className="flex flex-wrap gap-x-4 gap-y-1">{un.map((p) => <li key={p.name} className="flex items-center gap-1.5"><PersonName name={p.name} className="font-semibold underline-offset-2 hover:underline" /><span className="text-faint">{p.companyLabel}・営業 {p.rep || '—'}</span></li>)}</ul>
          )}
        </div>
      )}
    </section>
  );
}
