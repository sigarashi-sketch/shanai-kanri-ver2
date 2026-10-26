'use client';

import { LiveBanner } from '@/components/Live';
import { PageTitle } from '@/components/ui';
import { HoryuNote, Panel, useHoryu, HoryuLoading } from '@/components/Horyu';
import type { BotAbRes } from '@/lib/horyu';

// bot のモデル比較（今の bot-ab.html の「結果を見る」を写したもの・保留）。全体管理者だけ（今のシステムが決める）。
//   ★「比較をはじめる」は写していない（1回で数ドルかかり 5〜15 分かかる操作のため。今の社内システムの画面から）
export default function BotAbPage() {
  const h = useHoryu<BotAbRes>('botab');
  const d = h.d;
  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="botのモデル比較" sub={d?.batch ? `いちばん新しい比較：${d.batch}` : '同じ質問を2つのモデルに答えさせた結果'} />
      <HoryuNote>結果を見るだけです。比較をはじめるのは費用がかかるので、今の社内システムの画面から（全体管理者だけ）。</HoryuNote>
      <LiveBanner state={h.state} error={h.error} onReload={h.reload} note="見るだけです" />
      <HoryuLoading state={h.state} />
      {d && !d.rows.length && <div className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-body text-muted">まだ比較の記録がありません</div>}
      {d && d.questions.map((q, i) => {
        const rs = d.rows.filter((r) => r.qid === q.id);
        if (!rs.length) return null;
        return (
          <Panel key={q.id} title={`${i + 1}. ${q.label}`} i={i + 1}>
            <div className="grid gap-3 md:grid-cols-2">
              {d.models.map((m) => {
                const r = rs.find((x) => x.model === m);
                return (
                  <div key={m} className="rounded-lg border border-line-soft px-3 py-2 text-sm">
                    <div className="mb-1 text-xs text-faint">{m}{r && `（${(r.latency_ms / 1000).toFixed(1)}秒・$${r.cost_usd.toFixed(4)}・${r.route}）`}</div>
                    <div className="whitespace-pre-wrap">{!r ? '—' : r.error ? `エラー：${r.error}` : r.answer}</div>
                  </div>
                );
              })}
            </div>
          </Panel>
        );
      })}
    </main>
  );
}
