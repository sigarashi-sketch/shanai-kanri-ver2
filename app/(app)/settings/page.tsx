'use client';

import { Check } from 'lucide-react';
import { useColors } from '@/components/ColorProvider';
import { useMotivation } from '@/components/Motivation';
import { MODULES, PALETTE, THEMES, type ColorKey } from '@/lib/theme';
import { Swatches, useTheme } from '@/components/ThemeProvider';
import { PageTitle } from '@/components/ui';

// 分類ごとの色。選べるが、ほかの分類が使っている色は選べない（重複不可）。この端末に覚える。
export default function SettingsPage() {
  const { keys, setColor, reset } = useColors();
  const { toast } = useMotivation();
  const { theme, setTheme } = useTheme();
  const owner = (c: ColorKey) => MODULES.find((m) => keys[m.key] === c);

  return (
    <main className="flex max-w-[980px] flex-col gap-4 px-6 pb-12 pt-[22px]">
      <PageTitle title="設定" sub="見た目の着せ替えと分類ごとの色・この端末に覚えます">
        <button onClick={() => { reset(); toast({ text: '色を最初の組み合わせに戻しました' }); }} className="min-h-10 rounded-[10px] border border-field bg-surface px-3.5 text-[13.5px] font-semibold">最初の色に戻す</button>
      </PageTitle>
      <section className="mo-fade-up rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 1 }}>
        <div className="px-5 py-3.5"><h2 className="text-[15px] font-bold">見た目（着せ替え）</h2><p className="text-[12.5px] text-muted">画面全体の雰囲気を変えます。分類ごとの色はどれを選んでも残ります。上のバーの「見た目」からも変えられます。</p></div>
        <div className="grid grid-cols-1 gap-3 border-t border-line-soft px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          {THEMES.map((t) => {
            const on = theme === t.key;
            return (
              <button key={t.key} onClick={() => { setTheme(t.key); toast({ text: `見た目を「${t.name}」にしました`, sub: '→ この端末のすべての画面に反映' }); }} aria-pressed={on}
                className="flex flex-col gap-2 rounded-xl border p-3 text-left" style={{ borderColor: on ? 'var(--a)' : 'var(--color-line)', boxShadow: on ? '0 0 0 3px var(--al)' : undefined }}>
                <span className="flex items-center justify-between"><Swatches sw={t.sw} size={14} />{on && <Check size={16} strokeWidth={3} style={{ color: 'var(--a)' }} />}</span>
                <b className="text-[13.5px]">{t.name}</b>
                <span className="text-[11.5px] leading-snug text-muted">{t.desc}</span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
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
                    style={{ borderColor: mine ? PALETTE[c].p : 'var(--color-line)', background: mine ? PALETTE[c].s : 'var(--color-surface)', opacity: taken ? 0.45 : 1 }}>
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
