'use client';
import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { Member } from '@/components/sy/compat';
import type { CheckAdmin } from '@/components/sy/compat';
import { CHECK_SUBJECTS, checkLabel } from '@/lib/sy/kyouiku-check';
import { ago } from '@/components/sy/ui';

// 名簿の詳細の「スキルチェック」欄（2026-10-09 shoya「スコアを それゆけに反映・従業員にも紐づけて」）。
//   b-dash のスキルチェックを 1科目でも受けた人にだけ出る（受けていない人には 何も出さない）。中身は 受講データの詳細と同じ（/api/s/kyouiku/check）
export default function MemberCheck({ m }: { m: Member }) {
  const [d, setD] = useState<{ check: CheckAdmin | null; via?: 'member' | 'staff' } | null>(null);
  useEffect(() => {
    let dead = false;
    fetch(`/api/sy/s/kyouiku/check?name=${encodeURIComponent(m.name)}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (!dead) setD(j); }).catch(() => {});
    return () => { dead = true; };
  }, [m.name]);
  const c = d?.check; if (!c) return null;
  return (
    <section className="mx-5 mt-4 rounded-lg ring-1 ring-ig-border">
      <div className="flex flex-wrap items-baseline gap-x-2 border-b border-ig-divider px-3 py-2">
        <h3 className="text-sm font-bold">スキルチェック</h3>
        {c.avg !== null && <span className="text-xs text-ig-muted">総合 <b className="text-base text-ig-text">{c.avg}</b> 点{c.firstAvg !== null && c.firstAvg !== c.avg && `（初回 ${c.firstAvg}点）`}・{c.taken}/{CHECK_SUBJECTS.length}科目</span>}
        <span className="text-[11px] text-ig-muted">b-dash{d?.via === 'staff' && '・内勤として受けた記録'}</span>
      </div>
      <div className="space-y-3 p-3">
        {CHECK_SUBJECTS.map((sb) => {
          const cp = c.parts[sb.id];
          return (
            <div key={sb.id}>
              <div className="flex items-center gap-2">
                <span className="w-[6.5em] shrink-0 text-xs font-semibold">{sb.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e6f4ff]" role="img" aria-label={`100点中 ${cp?.last || 0}点`}><div className="h-full rounded-full bg-ig-primary" style={{ width: `${Math.max(0, Math.min(100, cp?.last || 0))}%` }} /></div>
                <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums">{cp ? `${cp.last}点` : '—'}</span>
              </div>
              {!cp ? <p className="mt-0.5 text-xs text-ig-muted">まだ受けていません</p> : (
                <>
                  <p className="mt-0.5 text-xs text-ig-muted" suppressHydrationWarning>{checkLabel(cp.last)}{cp.plays > 1 && `・初回 ${cp.first}点 → 最新 ${cp.last}点（${cp.plays}回）`}・{ago(cp.lastAt)}{sb.id === 'typing' && `・${cp.kpm}打/分・正確さ ${Math.round(cp.accuracy * 100)}%`}</p>
                  {cp.tags.length > 0 && <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">{cp.tags.map((t) => <span key={t.tag} className={`rounded px-1.5 py-px ${t.ok / t.total < 0.5 ? 'bg-[#fdecee] text-[#a3202c]' : 'bg-ig-hover text-ig-muted'}`}>{t.tag} {t.ok}/{t.total}</span>)}</p>}
                  {cp.items.length > 0 && (
                    <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                      {cp.items.map((it, k) => <li key={k} className={`flex items-center gap-1 ${it.ok ? '' : 'text-ig-muted'}`}>{it.ok ? <Check size={11} strokeWidth={2.5} className="shrink-0 text-[#1c6331]" /> : <X size={11} className="shrink-0 text-[#a3202c]" />}<span className="truncate">Q{k + 1} {it.label}{it.dk && '（わからない）'}</span></li>)}
                    </ul>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
