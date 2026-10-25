'use client';

import { LiveBanner } from '@/components/Live';
import { PageTitle } from '@/components/ui';
import { Bars, HoryuNote, Panel, fmtDateTime, useHoryu } from '@/components/Horyu';
import { OFFICE_SAMPLE } from '@/lib/horyu-sample';
import type { OfficeRes } from '@/lib/horyu';

// 内勤の今日の画面（今の office.html＝ドット絵のオフィスを、ふつうの一覧にしたもの・保留）。管理者だけ（今のシステムが決める）。
//   今日、内勤の人がどの画面に何分いたか・最後に開いた画面・最近の保存。★ドット絵の部屋・3D の出勤ボード（attendance-3d）は写していない
//   （出勤の状況は 労務/営業管理 の「当日の出勤状況」にある）
const ACTIVE_MS = 10 * 60_000;

export default function OfficePage() {
  const h = useHoryu<OfficeRes>('office', OFFICE_SAMPLE);
  const d = h.d;
  const now = h.live ? Date.now() : Date.parse('2026-10-25T11:45:00+09:00');
  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="内勤の今日の画面" sub={d ? `${d.date}・${d.members.length}人` : ''}>
        <button onClick={h.reload} className="min-h-10 rounded-[10px] border border-field bg-surface px-3.5 text-[13px] font-semibold">読み直す</button>
      </PageTitle>
      <HoryuNote>今の画面のドット絵のオフィスは、ふつうの一覧にしました。数字は今日の0時からです。</HoryuNote>
      <LiveBanner state={h.state} error={h.error} onReload={h.reload} note="見るだけです" />
      {d && <div className="grid gap-3.5 xl:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-3 md:grid-cols-2">
          {d.members.map((m, i) => {
            const on = now - Date.parse(m.lastAt) < ACTIVE_MS;
            const total = m.rooms.reduce((a, r) => a + r.activeMs, 0);
            return (
              <Panel key={m.name + i} title={m.name} i={i + 1} sub={`${fmtDateTime(m.firstAt).split(' ')[1]}〜${fmtDateTime(m.lastAt).split(' ')[1]}・${Math.round(total / 60000)}分`}
                right={<span className="chip" style={{ background: on ? 'var(--tone-ok-bg)' : 'var(--tone-mute-bg)', color: on ? 'var(--tone-ok-fg)' : 'var(--tone-mute-fg)' }}>{on ? '作業中' : '離席'}</span>}>
                <div className="mb-2 text-[12px] text-muted">最後の画面：{m.rooms.find((r) => r.path === m.lastPath)?.title || m.lastPath}</div>
                <Bars items={[...m.rooms].sort((a, b) => b.activeMs - a.activeMs).map((r) => ({ key: r.title || r.path, count: Math.round(r.activeMs / 60000) }))} fmt={(v) => `${v}分`} max={6} />
              </Panel>
            );
          })}
          {!d.members.length && <div className="text-[12.5px] text-faint">今日はまだ誰も開いていません</div>}
        </div>
        <Panel title="最近の保存" sub={`${d.events.length}件`}>
          <ul className="flex flex-col text-[12.5px]">{d.events.slice(0, 80).map((e, i) => <li key={i} className="flex gap-2 border-t border-line-soft py-1 first:border-t-0"><span className="num w-[44px] text-faint">{fmtDateTime(e.at).split(' ')[1]}</span><span className="w-[72px] truncate font-semibold">{e.name}</span><span className="truncate text-muted">{e.action}</span>{!e.ok && <span className="ml-auto text-bad">失敗</span>}</li>)}</ul>
        </Panel>
      </div>}
    </main>
  );
}
