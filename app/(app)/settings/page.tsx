'use client';

import { Check } from 'lucide-react';
import { useColors } from '@/components/ColorProvider';
import { useMotivation } from '@/components/Motivation';
import { MODULES, PALETTE, type ColorKey } from '@/lib/theme';
import { PageTitle } from '@/components/ui';

// 分類ごとの色。選べるが、ほかの分類が使っている色は選べない（重複不可）。この端末に覚える。
export default function SettingsPage() {
  const { keys, setColor, reset } = useColors();
  const { toast } = useMotivation();
  const owner = (c: ColorKey) => MODULES.find((m) => keys[m.key] === c);

  return (
    <main className="flex max-w-[980px] flex-col gap-4 px-6 pb-12 pt-[22px]">
      <PageTitle title="設定" sub="分類ごとの色・この端末に覚えます">
        <button onClick={() => { reset(); toast({ text: '色を最初の組み合わせに戻しました' }); }} className="min-h-10 rounded-[10px] border border-[#DCDDE6] bg-white px-3.5 text-[13.5px] font-semibold">最初の色に戻す</button>
      </PageTitle>
      <section className="mo-fade-up overflow-hidden rounded-xl border border-line bg-white" style={{ ['--i' as string]: 1 }}>
        <div className="px-5 py-3.5"><h2 className="text-[15px] font-bold">分類ごとの色</h2><p className="text-[12.5px] text-muted">同じ色は2つの分類に付けられません。使用中の色には、どの分類が使っているかが出ます。</p></div>
        {MODULES.map((m, i) => (
          <div key={m.key} className="mo-fade-in flex flex-wrap items-center gap-4 border-t border-line-soft px-5 py-4" style={{ ['--i' as string]: i + 2 }}>
            <div className="flex w-[120px] items-center gap-2 font-semibold"><span className="size-4 rounded" style={{ background: `var(--c-${m.key})` }} />{m.label}</div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PALETTE) as ColorKey[]).map((c) => {
                const mine = keys[m.key] === c;
                const by = owner(c);
                const taken = !!by && by.key !== m.key;
                return (
                  <button key={c} disabled={taken} onClick={() => { setColor(m.key, c); toast({ text: `${m.label}を「${PALETTE[c].name}」にしました`, sub: '→ メニュー・ボタン・表の見出しに反映' }); }}
                    title={taken ? `${by!.label}が使用中` : PALETTE[c].name} aria-label={`${PALETTE[c].name}${taken ? `（${by!.label}が使用中）` : ''}`}
                    className="relative flex flex-col items-center gap-1 rounded-xl border px-2.5 py-2 text-[11px] disabled:cursor-not-allowed"
                    style={{ borderColor: mine ? PALETTE[c].p : '#E8E9F0', background: mine ? PALETTE[c].s : '#fff', opacity: taken ? 0.45 : 1 }}>
                    <span className="flex size-8 items-center justify-center rounded-lg" style={{ background: PALETTE[c].p, color: PALETTE[c].on }}>{mine && <Check size={16} strokeWidth={3} />}</span>
                    <span className="whitespace-nowrap">{taken ? `${by!.short}が使用中` : PALETTE[c].name.replace('（黄×黒）', '')}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
