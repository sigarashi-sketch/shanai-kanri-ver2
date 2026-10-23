'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Lock, RotateCcw } from 'lucide-react';
import { HOW, MODES, WHO, numOf, type How, type Mode, type Rule, type Stage, type Who } from '@/lib/alert-rules';
import { LEVEL_STYLE } from '@/lib/roumu-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import { useAlerts } from '@/components/AlertStore';

// アラート設定（労務/営業管理）＝知らせの「いつ」「だれに」「どうやって」を段階ごとに選ぶ。
//   ・決まりは 残業（36協定）・有給の年5日・派遣契約・未打刻・退勤の打ち忘れ。値は全部選ぶだけ
//   ・ここで変えると、残業・有給・現場契約の画面の「知らせる」宛先と段階もすぐ変わる（同じ置き場を読む）
//   ・法令に関わる知らせは、警告より上の段階で労務を外せない（鍵マーク）。宛先・届け方は最低1つ
//   ・変えられるのは労務/営業管理の「承認」を持つ人だけ
const MODE_STYLE: Record<Mode, { bg: string; fg: string }> = {
  送る: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)' },
  'ためし（送らない）': { bg: 'var(--tone-caution-bg)', fg: 'var(--tone-caution-fg)' },
  止める: { bg: 'var(--tone-mute-bg)', fg: 'var(--tone-mute-fg)' },
};
const nowText = () => { const d = new Date(); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };

function Toggle({ on, locked, disabled, why, onClick, children }: { on: boolean; locked?: boolean; disabled?: boolean; why?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} disabled={disabled || locked}
      title={locked ? '法令に関わる知らせなので外せません' : disabled ? why : undefined}
      className="inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] disabled:cursor-not-allowed"
      style={on ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)', fontWeight: 600 } : { borderColor: 'var(--color-field)', color: 'var(--color-muted)', opacity: disabled ? 0.5 : 1 }}>
      {locked && <Lock size={11} />}{children}
    </button>
  );
}

export default function AlertsPage() {
  const { me, can } = usePerms();
  const canSet = can('roumu', 'approve');
  const { rules, setRules, reset } = useAlerts();
  const { hit, toast } = useMotivation();
  const [flash, setFlash] = useState<string | null>(null);
  const by = me.name.replace(/（.*）/, '');

  const change = (rule: Rule, f: (r: Rule) => Rule, what: string) => {
    // 取り消しはこの決まり1つだけ元に戻す（続けて変えた別の決まりは戻さない）
    const prev = rule;
    setRules((rs) => rs.map((r) => (r.key === rule.key ? { ...f(r), changedBy: by, changedAt: nowText() } : r)));
    setFlash(rule.key); setTimeout(() => setFlash(null), 1300);
    hit();
    toast({ text: `${rule.name}：${what}`, sub: rule.page ? '→ その画面の「知らせる」の宛先と段階に、すぐ反映しました' : '→ 次の知らせから反映します', undo: () => setRules((rs) => rs.map((r) => (r.key === prev.key ? prev : r))) });
  };
  const setStage = (rule: Rule, i: number, f: (s: Stage) => Stage, what: string) =>
    change(rule, (r) => ({ ...r, stages: r.stages.map((s, j) => (j === i ? f(s) : s)) }), what);
  const flip = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="アラート設定" sub="知らせの段階（注意→警告→上限間近）ごとに、いつ・だれに・どうやって届けるかを選びます">
        <button onClick={() => { const before = rules; reset(); hit(); toast({ text: 'アラート設定をはじめの決まりに戻しました', sub: '→ 残業・有給・現場契約・当日の出勤状況の知らせに反映しました', undo: () => setRules(() => before) }); }} disabled={!canSet} title={!canSet ? needText('approve') : undefined} className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-field bg-surface px-3 text-[12.5px] font-semibold text-muted disabled:opacity-40"><RotateCcw size={14} />はじめの決まりに戻す</button>
      </PageTitle>
      {!canSet && <div className="rounded-xl border border-line bg-soft px-4 py-2.5 text-[12.5px] text-muted">見るだけです。変えるには労務/営業管理の{needText('approve')}</div>}

      {rules.map((rule, ri) => {
        const order = rule.key === 'contract' && !(numOf(rule.stages[0].when) > numOf(rule.stages[1].when) && numOf(rule.stages[1].when) > numOf(rule.stages[2].when));
        const off = rule.mode === '止める';
        const last = rule.stages[rule.stages.length - 1];
        return (
          <section key={rule.key} className={`mo-fade-up rounded-xl border border-line bg-surface ${flash === rule.key ? 'mo-flash' : ''}`} style={{ ['--i' as string]: ri + 1 }}>
            <div className="flex flex-wrap items-start gap-3 border-b border-line-soft px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[15px] font-bold">{rule.name}</h2>
                  <span className="chip" style={{ background: MODE_STYLE[rule.mode].bg, color: MODE_STYLE[rule.mode].fg }}>{rule.mode}</span>
                  {rule.page && <Link href={rule.page} className="text-[12px] font-semibold" style={{ color: 'var(--ad)' }}>画面を見る</Link>}
                </div>
                <p className="mt-0.5 text-[12px] text-muted">{rule.desc}</p>
                {rule.note && <p className="mt-1 text-[12px] font-semibold text-warn">{rule.note}</p>}
              </div>
              <label className="text-[11.5px] text-faint">知らせを
                <select aria-label={`${rule.name} を送るか`} value={rule.mode} disabled={!canSet} title={!canSet ? needText('approve') : rule.key === 'taikin' && rule.mode !== '送る' ? '「送る」にするのは全体管理者の承認のあと' : undefined} onChange={(e) => change(rule, (r) => ({ ...r, mode: e.target.value as Mode }), `「${e.target.value}」にしました`)} className="ml-2 min-h-8 rounded-lg border border-field bg-surface px-2 text-[12.5px] text-ink disabled:opacity-50">
                  {MODES.filter((m) => rule.key !== 'taikin' || m !== '送る' || rule.mode === '送る').map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
            </div>

            <div className={`flex flex-col gap-0 px-5 py-3 lg:flex-row lg:items-stretch lg:gap-2 ${off ? 'opacity-45' : ''}`}>
              {rule.stages.map((s, i) => {
                const st = LEVEL_STYLE[s.level];
                const linePlease = s.to.includes('本人') && !s.how.includes('LINE（あおい）');
                return (
                  <div key={s.level} className="flex flex-col lg:flex-1 lg:flex-row lg:items-stretch lg:gap-2">
                    {i > 0 && <ArrowRight aria-hidden size={16} className="mx-auto my-1 rotate-90 self-center text-faint lg:my-0 lg:rotate-0" />}
                    <div className="flex-1 rounded-[12px] border px-3.5 py-3" style={{ borderColor: 'var(--color-line)', borderTop: `3px solid ${st.bar}` }}>
                      <div className="flex items-center gap-2">
                        <span className="chip" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                        <select aria-label={`${rule.name} ${st.label} のいつ`} value={s.when} disabled={!canSet || off || s.options.length < 2} title={!canSet ? needText('approve') : s.options.length < 2 ? 'この段階は選べる値が1つだけです' : undefined} onChange={(e) => setStage(rule, i, (x) => ({ ...x, when: e.target.value }), `${st.label}を「${e.target.value}」にしました`)} className="min-h-8 min-w-0 flex-1 rounded-lg border border-field bg-surface px-2 text-[12.5px] disabled:opacity-70">
                          {s.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div className="mt-2.5 text-[11px] text-faint">だれに</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {WHO.map((w: Who) => {
                          const on = s.to.includes(w);
                          return <Toggle key={w} on={on} locked={on && s.lockTo?.includes(w)} disabled={!canSet || off || (on && s.to.length === 1)} why={!canSet ? needText('approve') : off ? '知らせを止めています' : '宛先は最低1つ要ります'} onClick={() => setStage(rule, i, (x) => ({ ...x, to: flip(x.to, w) }), `${st.label}の宛先から${w}を${on ? '外しました' : '足しました'}`)}>{w}</Toggle>;
                        })}
                      </div>
                      <div className="mt-2.5 text-[11px] text-faint">どうやって</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {HOW.map((h: How) => {
                          const on = s.how.includes(h);
                          return <Toggle key={h} on={on} disabled={!canSet || off || (on && s.how.length === 1)} why={!canSet ? needText('approve') : off ? '知らせを止めています' : '届け方は最低1つ要ります'} onClick={() => setStage(rule, i, (x) => ({ ...x, how: flip(x.how, h) }), `${st.label}の届け方から${h}を${on ? '外しました' : '足しました'}`)}>{h}</Toggle>;
                        })}
                      </div>
                      {linePlease && <div className="mt-2 flex items-start gap-1 text-[11.5px] text-warn"><AlertTriangle size={12} className="mt-0.5 shrink-0" />本人には LINE（あおい）でしか届きません</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            {order && <div className="mo-shake mx-5 mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-bad"><AlertTriangle size={14} />段階の日数の順番が逆です（注意 ＞ 警告 ＞ 上限間近 の順に近づくように）</div>}

            <div className="flex flex-wrap items-start gap-3 border-t border-line-soft px-5 py-2.5 text-[12px]">
              <div className="min-w-0 flex-1"><span className="text-faint">知らせの見本　</span><span className="text-ink">{rule.sample}</span><span className="ml-2 text-faint">→ {off ? 'いまは送りません' : `${last.to.join('・')}（${last.how.join('・')}）`}</span></div>
              <span className="text-faint">{rule.changedBy ? `${rule.changedAt} ${rule.changedBy} が変更` : 'はじめの決まりのまま'}</span>
            </div>
          </section>
        );
      })}
      <p className="text-[11.5px] text-faint">36協定・有給の年5日・派遣の抵触日の扱いは法令に沿って決めています。段階の数字を変えるときは、社労士・法務にも確認してください。</p>
    </main>
  );
}
