'use client';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { Member } from '@/components/sy/compat';
import { PROPER_FLAGS, type ProperRow } from '@/lib/sy/proper-flags-types';

// 名簿の詳細の「プロパーリスト」欄（2026-10-10 shoya「営業止めからドロップまで反映・編集できないように」）。
//   いけどんのプロパーリストのチェック（営業止め〜営業停止）を 見るだけで出す。押しても何も変わらない＝変えるのは いけどんの画面
//   プロパーリストに居ない人には 何も出さない
export default function MemberProper({ m }: { m: Member }) {
  const [rows, setRows] = useState<ProperRow[] | null>(null);
  useEffect(() => {
    let dead = false;
    fetch(`/api/sy/s/proper-flags?name=${encodeURIComponent(m.name)}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (!dead) setRows(j?.rows || []); }).catch(() => {});
    return () => { dead = true; };
  }, [m.name]);
  if (!rows?.length) return null;
  return (
    <section className="mx-5 mt-4 rounded-lg ring-1 ring-ig-border">
      <div className="flex flex-wrap items-baseline gap-x-2 border-b border-ig-divider px-3 py-2">
        <h3 className="text-sm font-bold">プロパーリスト</h3>
        <span className="text-[11px] text-ig-muted">いけどん（見るだけ）{rows.length > 1 && `・${rows.length}行`}</span>
      </div>
      <div className="divide-y divide-ig-divider">
        {rows.map((r, i) => {
          const dates = ([['承諾日', r.shoudaku], ['稼働可能日', r.kanou], ['参画日', r.sankaku], ['入場日', r.nyuujou], ['担当', r.tantou]] as [string, string][]).filter(([, v]) => v);
          return (
            <div key={i} className="p-3">
              <div className="flex flex-wrap gap-1.5" aria-label="プロパーリストのチェック（見るだけ）">
                {PROPER_FLAGS.map(([k, label]) => {
                  const on = r.flags[k];
                  return (
                    <span key={k} aria-checked={on} role="checkbox" aria-readonly="true" aria-disabled="true"
                      className={`inline-flex cursor-default select-none items-center gap-1 rounded-md px-2 py-0.5 text-xs ${on ? 'bg-ig-text font-semibold text-white' : 'bg-ig-subtle text-ig-muted'}`}>
                      <span className={`grid h-3.5 w-3.5 place-items-center rounded-sm ${on ? 'bg-white text-ig-text' : 'ring-1 ring-ig-border'}`}>{on && <Check size={11} strokeWidth={3} />}</span>
                      {label}
                    </span>
                  );
                })}
              </div>
              {dates.length > 0 && <p className="mt-2 text-xs text-ig-muted">{dates.map(([k, v]) => `${k} ${v}`).join('・')}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
