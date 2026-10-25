'use client';

import { useState } from 'react';
import { LiveBanner } from '@/components/Live';
import { PageTitle } from '@/components/ui';
import { PersonName } from '@/components/Person';
import { Bars, HoldButton, HoryuNote, Kpi, Panel, Seg, Spark, fmtDate, fmtDateTime, pct, postHoryu, useHoryu } from '@/components/Horyu';
import { DASH_SAMPLE } from '@/lib/horyu-sample';
import { LEFT_RESULT, type DashRes } from '@/lib/horyu';

// ダッシュボード（今の dashboard.html を写したもの・保留）。
//   参画決定（今月/先月/今年）・月次推移（成約ベース）・退会/ブロック検知（辞退にチェック・対応済み・自動モード）・
//   稼働・案件・送信・案件ごとの反応・面談。読むのは /api/live/horyu?view=dash（未経験の人だけ・単価は見られるロールだけ）
//   ★今の画面にあった「決定日の手入力」「MNM同期」は写していない（決定日はプロパーリスト側・同期は管理の操作のため）
type JK = 'm' | 'l' | 'y';

export default function HoryuDashboard() {
  const h = useHoryu<DashRes>('dash', DASH_SAMPLE);
  const d = h.d;
  const [jk, setJk] = useState<JK>('m');
  const [openYm, setOpenYm] = useState('');
  const [sendK, setSendK] = useState<'7' | '30'>('30');
  const [ivK, setIvK] = useState<'thisMonth' | 'lastMonth' | 'all'>('thisMonth');
  const [gone, setGone] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [mode, setMode] = useState<string | null>(null);

  const act = async (id: string, kind: 'left-handle' | 'left-jitai') => {
    setBusy(id); setMsg('');
    const r = h.live ? await postHoryu({ kind, id }) : { ok: true };
    setBusy('');
    if (r.ok) setGone((g) => ({ ...g, [id]: kind === 'left-jitai' ? '辞退にチェックして対応済みにしました' : '対応済みにしました' }));
    else setMsg(r.error || '保存できませんでした');
  };
  const changeMode = async (m: string) => {
    setMsg('');
    const r = h.live ? await postHoryu({ kind: 'left-mode', mode: m }) : { ok: true };
    if (r.ok) setMode(m); else setMsg(r.error || '切り替えられませんでした');
  };

  const j = d?.joined?.[jk];
  const leftRows = (d?.left?.rows || []).filter((r) => !gone[r.id]);
  const sw = d?.send?.windows[sendK], ok = d?.send?.okng[sendK];
  const ivs = d?.iv?.[ivK];
  const tr = d?.trend;
  const open = tr?.months.find((m) => m.ym === openYm);
  const trMax = Math.max(1, ...(tr?.months.map((m) => m.count) || [1]));

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="ダッシュボード" sub={`参画決定・月次推移・退会検知・稼働・案件・送信・面談${d?.generatedAt ? `（集計 ${d.generatedAt}）` : ''}`}>
        <button onClick={h.reload} className="min-h-10 rounded-[10px] border border-field bg-surface px-3.5 text-[13px] font-semibold">読み直す</button>
      </PageTitle>
      <HoryuNote>人は未経験の人だけ（今のプロパーリストに入っている人）。</HoryuNote>
      <LiveBanner state={h.state} error={h.error} onReload={h.reload} note="本物のデータです。退会検知の「辞退にチェック」「対応済み」「自動モード」はここから今の社内システムに保存されます" />
      {!!d?.errors.length && <div className="rounded-xl border px-4 py-2 text-[12.5px]" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)', borderColor: 'var(--tone-warn-bar)' }}>読めなかったところ：{d.errors.join('／')}</div>}
      {msg && <div className="rounded-xl border px-4 py-2 text-[12.5px]" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)', borderColor: 'var(--tone-bad-bar)' }}>{msg}</div>}

      {d && <>
        <div className="grid gap-3.5 lg:grid-cols-2">
          <Panel title="参画決定" sub="いま参画決定のチェックが付いている人（決定日で分ける）" right={<Seg value={jk} onChange={setJk} options={[['m', '今月'], ['l', '先月'], ['y', '今年']] as const} />}>
            {j ? <>
              <div className="flex items-end gap-3"><span className="num text-[34px] font-bold">{j.count}</span><span className="pb-2 text-[13px]">名</span><span className="pb-2 text-[12px] text-muted">{j.diff}</span></div>
              <div className="mt-2 flex flex-wrap gap-1.5">{j.names.map((x) => <span key={x.name + x.decidedOn} className="chip" style={{ background: 'var(--as)', color: 'var(--ad)' }}><PersonName name={x.name} className="font-bold" /><span className="font-normal text-faint">{fmtDate(x.decidedOn)}</span></span>)}</div>
              {!!d.joined?.undated.length && <div className="mt-2 text-[12px] text-muted">決定日が分からない人 {d.joined.undated.length}名：{d.joined.undated.map((n, i) => <span key={n}>{i ? '、' : ''}<PersonName name={n} /></span>)}（決定日はプロパーリストで入れます）</div>}
            </> : <div className="text-[12.5px] text-faint">読めませんでした</div>}
          </Panel>

          <Panel title="月次推移（成約ベース）" sub={tr ? `直近12か月 ${tr.months.reduce((a, m) => a + m.count, 0)}名` : ''}>
            {tr ? <>
              <div className="flex flex-col gap-1">
                {tr.months.map((m) => (
                  <button key={m.ym} onClick={() => setOpenYm(openYm === m.ym ? '' : m.ym)} className={`grid grid-cols-[72px_1fr_70px] items-center gap-2 rounded-md px-1 text-left text-[12.5px] ${openYm === m.ym ? 'bg-soft font-semibold' : ''}`}>
                    <span>{m.ym.slice(0, 4)}/{m.label}</span>
                    <span className="h-3 overflow-hidden rounded-r bg-soft"><i className="block h-full rounded-r" style={{ width: `${(m.count / trMax) * 100}%`, background: 'var(--a)' }} /></span>
                    <span className="num text-right">{m.count}名{m.offCount ? <small className="ml-1 text-faint">取消{m.offCount}</small> : null}</span>
                  </button>
                ))}
              </div>
              {open && <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg bg-soft p-2 text-[12px]">{open.names.length ? open.names.map((x) => <span key={x.name + x.decidedOn} className={x.active ? '' : 'line-through opacity-60'}><PersonName name={x.name} />（{fmtDate(x.decidedOn)}・{x.tantou}）</span>) : 'この月はいません'}</div>}
              {!!tr.tantouTotals.length && <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]"><span className="text-faint">採用担当別（12か月）</span>{tr.tantouTotals.map((t) => <span key={t.tantou} className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{t.tantou} {t.count}</span>)}</div>}
              {tr.undatedChecked > 0 && <div className="mt-2 text-[11.5px] text-faint">{tr.undatedChecked}名は決定日が分からないので入っていません（チェックの記録は {tr.logStartsAt} から）</div>}
            </> : <div className="text-[12.5px] text-faint">読めませんでした</div>}
          </Panel>
        </div>

        <Panel title="退会・ブロック検知" sub="グループLINEの退会・公式LINEのブロック（未対応のもの）" right={d.left && <label className="flex items-center gap-1.5 text-[12px] text-muted">自動で辞退にする
          <select value={mode ?? d.left.mode} disabled={!d.left.canMode} title={d.left.canMode ? undefined : '切り替えは管理者だけです'} onChange={(e) => changeMode(e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-1.5 text-[12px] disabled:opacity-50">
            <option value="off">しない（off）</option><option value="dry">記録だけ（dry）</option><option value="on">辞退にチェック（on）</option>
          </select></label>}>
          {!d.left ? <div className="text-[12.5px] text-faint">読めませんでした</div> : !leftRows.length ? <div className="py-2 text-center text-[12.5px] text-faint">未対応の検知はありません</div> : (
            <ul className="flex flex-col">
              {leftRows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 border-t border-line-soft py-2 text-[12.5px] first:border-t-0">
                  <span className="min-w-[96px] font-semibold">{r.name ? <PersonName name={r.name} /> : <span className="text-faint">名前が引けない人</span>}</span>
                  <span className="text-muted">{r.group}</span>
                  <span className="num text-faint">{fmtDateTime(r.changedAt)}</span>
                  <span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{LEFT_RESULT[r.result] || r.result || '—'}</span>
                  <span className="ml-auto flex gap-1.5">
                    {r.canJitai && <HoldButton small label="辞退にチェック" disabled={busy === r.id} onDone={() => act(r.id, 'left-jitai')} />}
                    <button disabled={busy === r.id} onClick={() => act(r.id, 'left-handle')} className="min-h-8 rounded-lg border border-field bg-surface px-2.5 text-[12px] font-semibold disabled:opacity-40">対応済み</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {Object.keys(gone).length > 0 && <div className="mt-1 text-[11.5px] text-ok">{Object.values(gone).length}件を片付けました</div>}
        </Panel>

        {d.wf && <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="稼働中（未経験）" value={`${d.wf.count}名`} sub={`今月の新規 ${d.wf.newThisMonth}名（全体）`} />
            <Kpi label="参画予定" value={`${d.wf.yotei.length}名`} sub="入場前・名簿にまだ載っていない人" />
            <Kpi label="売上（月）" value={d.wf.revenueMan == null ? '—' : `${d.wf.revenueMan}万`} sub={d.wf.showPrice ? '単価がある人の合計' : '単価はあなたのロールでは見られません'} />
            <Kpi label="平均単価" value={d.wf.avgPriceMan == null ? '—' : `${d.wf.avgPriceMan}万`} />
          </div>
          <div className="grid gap-3.5 lg:grid-cols-3">
            <Panel title="営業担当別 稼働人数"><Bars items={d.wf.byRep.map((r) => ({ key: r.rep, count: r.count }))} fmt={(v) => `${v}名`} /></Panel>
            <Panel title="所属（エンド）別"><Bars items={d.wf.byEnd} fmt={(v) => `${v}名`} /></Panel>
            <Panel title="単価の分布">{d.wf.priceBuckets ? <Bars items={d.wf.priceBuckets} max={6} fmt={(v) => `${v}名`} /> : <div className="text-[12.5px] text-faint">単価はあなたのロールでは見られません</div>}</Panel>
          </div>
          <Panel title="稼働メンバー" sub={`${d.wf.members.length}名`}>
            <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="text-left text-faint"><th className="py-1 pr-2">名前</th><th className="pr-2">営業担当</th><th className="pr-2">所属</th>{d.wf.showPrice && <th className="text-right">単価</th>}</tr></thead>
              <tbody>{d.wf.members.map((m) => <tr key={m.name} className="border-t border-line-soft"><td className="py-1.5 pr-2"><PersonName name={m.name} /></td><td className="pr-2">{m.rep}</td><td className="pr-2">{m.end || '—'}</td>{d.wf!.showPrice && <td className="num text-right">{m.priceMan == null ? '—' : `${m.priceMan}万`}</td>}</tr>)}</tbody></table></div>
            {!!d.wf.yotei.length && <div className="mt-2 text-[12px] text-muted">参画予定：{d.wf.yotei.map((y, i) => <span key={y.name}>{i ? '、' : ''}<PersonName name={y.name} />（{y.rep}{y.end ? `・${y.end}` : ''}）</span>)}</div>}
          </Panel>
        </>}

        {d.cases && <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="新着案件（30日）" value={d.cases.total30} sub={`その前の30日 ${d.cases.prev30}`} />
            <Kpi label="新着案件（7日）" value={d.cases.total7} />
            <Kpi label="平均単価（書いてある案件）" value={`${d.cases.priceAvg}万`} />
            <Kpi label="前の30日との差" value={`${d.cases.total30 - d.cases.prev30 >= 0 ? '+' : ''}${d.cases.total30 - d.cases.prev30}`} />
          </div>
          <div className="grid gap-3.5 lg:grid-cols-3">
            <Panel title="新着案件の推移" sub="週別・直近12週"><Spark items={d.cases.trend} /></Panel>
            <Panel title="勤務地別" sub="直近30日"><Bars items={d.cases.byArea} /></Panel>
            <Panel title="職種別" sub="直近30日"><Bars items={d.cases.byJob} /></Panel>
          </div>
        </>}

        {d.send && <Panel title="送信" sub="案件の送信と、返信・OK/NG（同じ期間）" right={<Seg value={sendK} onChange={setSendK} options={[['7', '直近7日'], ['30', '直近30日']] as const} />}>
          {sw && ok ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="配信回数" value={sw.sends} sub={`宛先のべ ${sw.deliveries}・実数 ${sw.groups}`} />
            <Kpi label="返信率" value={pct(sw.replyRate)} sub={`前向きな返信 ${pct(sw.positiveRate)}`} />
            <Kpi label="OK" value={pct(ok.okRate)} sub={`${ok.ok}件／NG ${ok.ng}件（${pct(ok.ngRate)}）`} tone="ok" />
            <Kpi label="返事なし" value={pct(ok.unansweredRate)} sub={`判断待ち ${ok.undecided}件`} tone="warn" />
          </div> : <div className="text-[12.5px] text-faint">データがありません</div>}
          <div className="mt-3"><div className="mb-1 text-[12px] text-muted">配信回数（日別・直近30日）</div><Spark items={d.send.trend} height={70} /></div>
        </Panel>}

        {d.report && <Panel title="案件ごとの送信と反応" sub="反応率＝前向きな返信 ÷ 送信">
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-[12.5px]"><thead><tr className="text-left text-faint"><th className="py-1 pr-2">案件</th><th className="pr-2">本文</th><th className="text-right">送信</th><th className="text-right">返信</th><th className="text-right">前向き</th><th className="text-right">返信率</th><th className="text-right">反応率</th></tr></thead>
            <tbody>{d.report.slice(0, 50).map((r) => <tr key={r.caseNo + r.message} className="border-t border-line-soft"><td className="num py-1.5 pr-2 font-semibold">{r.caseNo}</td><td className="max-w-[320px] truncate pr-2 text-muted" title={r.message}>{r.message}</td><td className="num text-right">{r.sent}</td><td className="num text-right">{r.replied}</td><td className="num text-right text-ok">{r.positive}</td><td className="num text-right">{pct(r.replyRate)}</td><td className="num text-right font-bold">{pct(r.positiveRate)}</td></tr>)}</tbody></table></div>
          {d.report.length > 50 && <div className="mt-1 text-[11.5px] text-faint">ほか {d.report.length - 50}件</div>}
        </Panel>}

        {d.iv && ivs && <Panel title="面談" sub="決着＝成約・辞退・見送り" right={<Seg value={ivK} onChange={setIvK} options={[['thisMonth', '今月'], ['lastMonth', '先月'], ['all', '全期間']] as const} />}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="面談" value={ivs.total} sub={`進行中 ${ivs.ongoing}`} />
            <Kpi label="成約" value={ivs.win} sub={`決定率 ${pct(ivs.winRate)}`} tone="ok" />
            <Kpi label="辞退" value={ivs.decline} sub={`辞退率 ${pct(ivs.declineRate)}`} tone="bad" />
            <Kpi label="見送り" value={ivs.pass} />
          </div>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="text-left text-faint"><th className="py-1 pr-2">営業担当</th><th className="text-right">面談</th><th className="text-right">成約</th><th className="text-right">辞退</th><th className="text-right">決定率</th><th className="text-right">辞退率</th></tr></thead>
            <tbody>{ivs.byRep.map((r) => <tr key={r.rep} className="border-t border-line-soft"><td className="py-1.5 pr-2">{r.rep}</td><td className="num text-right">{r.total}</td><td className="num text-right">{r.win}</td><td className="num text-right">{r.decline}</td><td className="num text-right">{pct(r.winRate)}</td><td className="num text-right">{pct(r.declineRate)}</td></tr>)}</tbody></table></div>
        </Panel>}
      </>}
    </main>
  );
}
