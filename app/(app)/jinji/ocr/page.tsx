'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Camera, Check, IdCard, PauseCircle } from 'lucide-react';
import { DOCS, FIELDS, PERSON, type DocKey } from '@/lib/ocr-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';

// 身分証の読み取り（保留中）＝流れの見本だけ。実際の読み取りはしない。
//   ① 写真を選ぶ → ② 読み取った項目を今の基本情報と並べて確かめる（項目ごとに「使う／今のまま」を選ぶだけ）→ ③ 基本情報に入れる
//   自信の低い項目は、どちらかを選ぶまで入れられない。マイナンバーの個人番号は読まない。
type Pick = 'read' | 'keep';
const STEPS = ['写真を選ぶ', '読み取った項目を確かめる', '基本情報に入れる'];

export default function OcrPage() {
  const canEdit = usePerms().can('jinji', 'edit');
  const { hit, toast } = useMotivation();
  const [step, setStep] = useState(0);
  const [doc, setDoc] = useState<DocKey | null>(null);
  const [reading, setReading] = useState(false);
  const [pick, setPick] = useState<Record<string, Pick>>({});

  const fields = doc ? FIELDS[doc] : [];
  const pickOf = (k: string, sure: 'high' | 'low', current: string): Pick | undefined => pick[k] ?? (sure === 'high' ? (current ? 'keep' : 'read') : undefined);
  const undecided = fields.filter((f) => !pickOf(f.key, f.sure, f.current)).length;
  const changes = fields.filter((f) => pickOf(f.key, f.sure, f.current) === 'read' && f.read !== f.current);

  const choose = (k: DocKey) => { setDoc(k); setPick({}); setReading(true); setTimeout(() => { setReading(false); setStep(1); }, 900); };
  const apply = () => {
    hit(); setStep(2);
    toast({ text: `${PERSON.name} の基本情報に ${changes.length}項目を入れました（見本）`, sub: '→ 基本情報と社員ページに反映しました。写真は確かめたあと消します', undo: () => setStep(1) });
  };
  const reset = () => { setStep(0); setDoc(null); setPick({}); };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="身分証の読み取り" sub="参画が決まった人の身分証の写真から、基本情報を入れる流れの見本" />

      <div className="mo-fade-up flex items-start gap-3 rounded-xl border px-4 py-3" style={{ ['--i' as string]: 1, background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)', borderColor: 'var(--tone-caution-bar)' }}>
        <PauseCircle size={20} className="mt-0.5 shrink-0" />
        <div className="text-[13px]"><b>いまは保留中です。</b>参画決定のあとに入れる想定で、ここは流れの見本だけ動きます（実際の読み取りはしません・写真も送りません）。</div>
      </div>

      <ol className="mo-fade-up flex flex-wrap gap-2" style={{ ['--i' as string]: 2 }}>
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px]" style={i === step ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)', fontWeight: 700 } : { borderColor: 'var(--color-line)', color: i < step ? 'var(--color-ok)' : 'var(--color-muted)' }}>
            {i < step ? <Check size={14} /> : <span className="num">{i + 1}</span>}{s}
          </li>
        ))}
      </ol>

      <section key={step} className="mo-axis rounded-xl border border-line bg-surface px-5 py-4">
        {step === 0 && (
          <div>
            <div className="text-[13px] text-muted">{PERSON.name} さんが撮った写真（見本）から、身分証の種類を選んでください</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {DOCS.map((d) => (
                <button key={d.key} onClick={() => choose(d.key)} disabled={reading} className="flex flex-col items-center gap-2 rounded-xl border border-field bg-soft px-4 py-5 disabled:opacity-50" style={doc === d.key ? { borderColor: 'var(--a)' } : undefined}>
                  <div className="flex h-16 w-24 items-center justify-center rounded-lg bg-sunken"><IdCard size={30} className="text-faint" /></div>
                  <span className="text-[13.5px] font-bold">{d.label}</span><span className="text-[11.5px] text-muted">{d.note}</span>
                </button>
              ))}
            </div>
            {reading && <div className="mo-pulse mt-3 flex items-center gap-2 text-[13px] text-muted"><Camera size={16} />読み取っています…（見本）</div>}
          </div>
        )}

        {step === 1 && (
          <div>
            <div className="text-[13px] text-muted">読み取った値と、今の基本情報を並べています。違うところだけ「読み取りを使う」を選んでください。<b className="text-ink">確かめが要る</b>項目は、選ぶまで入れられません。</div>
            <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead><tr className="th-row text-left"><th className="px-3 py-2 font-semibold">項目</th><th className="px-2 py-2 font-semibold">読み取った値</th><th className="px-2 py-2 font-semibold">今の基本情報</th><th className="px-3 py-2 font-semibold">どちらを使う</th></tr></thead>
              <tbody>
                {fields.map((f) => {
                  const p = pickOf(f.key, f.sure, f.current);
                  return (
                    <tr key={f.key} className="row border-t border-line-soft">
                      <td className="whitespace-nowrap px-3 py-2 font-semibold">{f.label}{f.sure === 'low' && <span className="chip ml-1.5" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>確かめが要る</span>}</td>
                      <td className="px-2 py-2">{f.read}</td>
                      <td className="px-2 py-2 text-muted">{f.current || '（空）'}{f.current && f.current === f.read && <span className="ml-1 whitespace-nowrap text-ok">同じ</span>}</td>
                      <td className="px-3 py-2">
                        <select aria-label={`${f.label} はどちらを使う`} value={p ?? ''} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} onChange={(e) => setPick((x) => ({ ...x, [f.key]: e.target.value as Pick }))} className="min-h-8 rounded-lg border border-field bg-surface px-1.5 text-[12.5px] disabled:opacity-50" style={!p ? { borderColor: 'var(--color-warn)' } : undefined}>
                          {!p && <option value="">選んでください</option>}
                          <option value="read">読み取りを使う</option><option value="keep">今のまま</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={apply} disabled={!canEdit || undecided > 0} title={!canEdit ? needText('edit') : undecided ? '確かめが要る項目を選んでください' : undefined} className="btn-primary min-h-10 rounded-[10px] px-4 text-[13.5px] font-bold disabled:opacity-40">基本情報に入れる（{changes.length}項目）</button>
              <button onClick={reset} className="text-[12.5px] text-muted">写真を選び直す</button>
              {undecided > 0 && <span className="text-[12px] text-warn">あと {undecided}項目 選んでください</span>}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mo-scale-in py-4 text-center">
            <Check className="mx-auto text-ok" size={26} />
            <div className="mt-2 text-[15px] font-bold">{PERSON.name} の基本情報に入れました（見本）</div>
            <div className="mt-1 text-[12.5px] text-muted">{changes.map((c) => c.label).join('・') || '変更なし'}</div>
            <div className="mt-3 flex justify-center gap-3 text-[12.5px]"><Link href={`/jinji/staff/${PERSON.id}`} className="font-semibold" style={{ color: 'var(--ad)' }}>社員ページを見る</Link><button onClick={reset} className="text-muted">もう一度ためす</button></div>
          </div>
        )}
      </section>
      <p className="text-[11.5px] leading-relaxed text-faint">身分証の写真は、確かめ終わったら残さない想定です。マイナンバーの個人番号は読み取りません。本人確認書類の扱い・保存の期間は、最終判断は社労士・法務に確認してください。</p>
    </main>
  );
}
