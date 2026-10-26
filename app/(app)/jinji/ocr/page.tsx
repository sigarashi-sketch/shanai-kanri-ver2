'use client';

import { useMemo, useRef, useState } from 'react';
import { Camera, Check, IdCard } from 'lucide-react';
import { DOCS, type DocKey } from '@/lib/types/jinji';
import { PageTitle } from '@/components/ui';
import { LiveBanner } from '@/components/Live';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { JINJI_URL, jinjiPostRead, jinjiRead, type JinjiMe } from '@/lib/live/jinji';
import { type LiveStaffList } from '@/lib/live/staff';
import { useMikeiken } from '@/components/Mikeiken';
import { useLiveWrite, WriteError } from '@/components/jinji/useLiveWrite';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { needText, usePerms } from '@/components/Perms';
import { PersonName } from '@/components/Person';

// 身分証の読み取り。
//   ① 写真を選ぶ → ② 読み取った項目を今の基本情報と並べて確かめる（項目ごとに「使う／今のまま」を選ぶだけ）→ ③ 基本情報に入れる
//   自信の低い項目は、どちらかを選ぶまで入れられない。マイナンバーの個人番号は読まない。
//   ★本物（10-26）：今のシステムの /api/jinji-v2（ocr-current・ocr-read・ocr-apply）。
//     写真はブラウザで縮めて1回送るだけ。今のシステムは写真も読み取った値も保存しない・ログに出さない（返すだけ）。
//     基本情報に入れるのは ふりがな・生年月日・住所 だけ（氏名は名簿とのつなぎの鍵なので変えない・有効期限などは見るだけ）。
//     入れる前に必ず確かめる（ConfirmWrite）。同姓同名で基本情報が2行以上ある人は入れない
type Pick = 'read' | 'keep';
const STEPS = ['写真を選ぶ', '読み取った項目を確かめる', '基本情報に入れる'];

export default function OcrPage() {
  const me = useLiveRoute<JinjiMe>(jinjiRead('me'));
  if (me.live) return <LiveOcr canWrite={!!me.data?.canWrite} />;
  // 読み込み中・読めなかったとき（見本の流れは出さない）
  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="身分証の読み取り" sub="参画が決まった人の身分証の写真から、基本情報を入れます" />
      {me.state === 'error' ? <LiveBanner state="error" error={me.error} onReload={me.reload} /> : <div className="rounded-xl border border-line bg-surface px-4 py-6 text-body text-muted">読み込み中…</div>}
    </main>
  );
}

// ---- 本物（10-26） ----
type LField = { key: string; label: string; read: string; sure: 'high' | 'low' };
type Cur = { id: string; name: string; kana: string; birth: string; addr: string };
const APPLY_KEYS = ['kana', 'birth', 'addr'];

/** 写真を長い辺 1600px までの JPEG に縮める（送る量を減らす・元の写真はどこにも残さない） */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ng) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ng(new Error('写真を開けませんでした')); i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85).replace(/^data:[^,]+,/, '');
  } finally { URL.revokeObjectURL(url); }
}

function LiveOcr({ canWrite }: { canWrite: boolean }) {
  const canEdit = usePerms().can('jinji', 'edit') && canWrite;
  const staff = useLiveRoute<LiveStaffList>('/api/live/staff');
  const mk = useMikeiken();
  const { send, error: wErr, setError: setWErr } = useLiveWrite(true, () => {});
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [step, setStep] = useState(0);
  const [person, setPerson] = useState('');
  const [doc, setDoc] = useState<DocKey | null>(null);
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState('');
  const [cur, setCur] = useState<Cur | null>(null);
  const [warn, setWarn] = useState('');
  const [fields, setFields] = useState<LField[]>([]);
  const [pick, setPick] = useState<Record<string, Pick>>({});
  const [applied, setApplied] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  // 参画が決まった人を先に（未経験の人だけ・退社は出さない）
  const people = useMemo(() => {
    const xs = mk.keep((staff.data?.rows || []).filter((x) => x.statusKey !== 'taisha'), 'name');
    return xs.map((x) => x.name).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [staff.data, mk]);

  const curOf = (k: string) => (cur ? String((cur as Record<string, string>)[k] ?? '') : '');
  const canApplyKey = (k: string) => APPLY_KEYS.includes(k);
  const pickOf = (f: LField): Pick | undefined => (!canApplyKey(f.key) ? 'keep' : pick[f.key] ?? (!f.read ? 'keep' : f.sure === 'high' ? (curOf(f.key) ? 'keep' : 'read') : undefined));
  const undecided = fields.filter((f) => !pickOf(f)).length;
  const changes = fields.filter((f) => canApplyKey(f.key) && pickOf(f) === 'read' && f.read && f.read !== curOf(f.key));

  const choosePerson = async (nm: string) => {
    setPerson(nm); setCur(null); setWarn(''); setErr('');
    if (!nm) return;
    try {
      const j = await jinjiPostRead<{ ok: boolean; found: boolean; ambiguous?: boolean; current?: Cur }>('ocr-current', { name: nm });
      if (!j.found) setWarn('この人の基本情報がまだありません（基本情報フォームの回答が先です）。読み取りは見るだけになります');
      else if (j.ambiguous) setWarn('同じ名前の基本情報が2行以上あります。どちらか分からないので、ここからは入れません（基本情報の画面で直してください）');
      setCur(j.found && !j.ambiguous ? j.current! : null);
    } catch (e) { setErr((e as Error).message); }
  };
  const onFile = async (f: File | undefined) => {
    if (!f || !doc) return;
    setReading(true); setErr('');
    try {
      const image = await shrink(f);
      const j = await jinjiPostRead<{ ok: boolean; fields: LField[] }>('ocr-read', { doc, media_type: 'image/jpeg', image });
      setFields(j.fields || []); setPick({}); setStep(1);
    } catch (e) { setErr((e as Error).message); }
    finally { setReading(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const apply = () => {
    if (!cur) return;
    const values = Object.fromEntries(changes.map((c) => [c.key, c.read]));
    const prev = Object.fromEntries(changes.map((c) => [c.key, curOf(c.key)]).filter(([, v]) => v));
    setConfirm({
      title: '基本情報に入れますか', okLabel: `入れる（${changes.length}項目）`,
      lines: [`${person} の基本情報`, ...changes.map((c) => `${c.label}：${curOf(c.key) || '（空）'} → ${c.read}`), '取り消しで元の値に戻せます（元が空だった項目は空に戻せません）'],
      run: () => send({ url: JINJI_URL, body: { action: 'ocr-apply', id: cur.id, values }, text: `${person} の基本情報に ${changes.length}項目を入れました`, sub: '→ 基本情報に反映しました。写真はどこにも残っていません',
        undo: () => (Object.keys(prev).length ? { url: JINJI_URL, body: { action: 'ocr-apply', id: cur.id, values: prev } } : null) })
        .then((x) => { if (x) { setApplied(changes.map((c) => c.label)); setStep(2); } }),
    });
  };
  const reset = () => { setStep(0); setDoc(null); setPick({}); setFields([]); setErr(''); };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="身分証の読み取り" sub="参画が決まった人の身分証の写真から、基本情報を入れます" />
      {staff.state === 'error' && <LiveBanner state="error" error={`社員の一覧を読めませんでした（${staff.error}）`} onReload={staff.reload} />}
      <WriteError error={wErr || err} onClose={() => { setWErr(''); setErr(''); }} />
      <ol className="mo-fade-up flex flex-wrap gap-2" style={{ ['--i' as string]: 2 }}>
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm" style={i === step ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)', fontWeight: 700 } : { borderColor: 'var(--color-line)', color: i < step ? 'var(--color-ok)' : 'var(--color-muted)' }}>
            {i < step ? <Check size={14} /> : <span className="num">{i + 1}</span>}{s}
          </li>
        ))}
      </ol>

      <section key={step} className="mo-axis rounded-xl border border-line bg-surface px-5 py-4">
        {step === 0 && (
          <div>
            <label className="flex flex-wrap items-center gap-2 text-body text-muted">社員
              <select value={person} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} onChange={(e) => choosePerson(e.target.value)} className="min-h-9 rounded-lg border border-field bg-surface px-2 text-body text-ink">
                <option value="">選んでください</option>{people.map((p) => <option key={p}>{p}</option>)}
              </select>
              {person && <PersonName name={person} className="text-sm underline-offset-2 hover:underline" />}
            </label>
            {warn && <div className="mt-2 text-sm text-warn">{warn}</div>}
            {person && <>
              <div className="mt-3 text-body text-muted">身分証の種類を選んで、写真を選んでください</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {DOCS.map((d) => (
                  <button key={d.key} onClick={() => { setDoc(d.key); setTimeout(() => fileRef.current?.click(), 0); }} disabled={reading || !canEdit} className="flex flex-col items-center gap-2 rounded-xl border border-field bg-soft px-4 py-5 disabled:opacity-50" style={doc === d.key ? { borderColor: 'var(--a)' } : undefined}>
                    <div className="flex h-16 w-24 items-center justify-center rounded-lg bg-sunken"><IdCard size={30} className="text-faint" /></div>
                    <span className="text-body font-bold">{d.label}</span><span className="text-xs text-muted">{d.note}</span>
                  </button>
                ))}
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </>}
            {reading && <div className="mo-pulse mt-3 flex items-center gap-2 text-body text-muted"><Camera size={16} />読み取っています…（30秒ほどかかることがあります）</div>}
          </div>
        )}

        {step === 1 && (
          <div>
            <div className="text-body text-muted">読み取った値と、今の基本情報を並べています。違うところだけ「読み取りを使う」を選んでください。<b className="text-ink">確かめが要る</b>項目は、選ぶまで入れられません。</div>
            <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-body">
              <thead><tr className="th-row text-left"><th className="px-3 py-2 font-semibold">項目</th><th className="px-2 py-2 font-semibold">読み取った値</th><th className="px-2 py-2 font-semibold">今の基本情報</th><th className="px-3 py-2 font-semibold">どちらを使う</th></tr></thead>
              <tbody>
                {fields.map((f) => {
                  const p = pickOf(f); const c = curOf(f.key); const fixed = !canApplyKey(f.key) || !cur || !f.read;
                  return (
                    <tr key={f.key} className="row border-t border-line-soft">
                      <td className="whitespace-nowrap px-3 py-2 font-semibold">{f.label}{f.sure === 'low' && canApplyKey(f.key) && f.read && <span className="chip ml-1.5" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>確かめが要る</span>}</td>
                      <td className="px-2 py-2">{f.read || <span className="text-faint">（読めなかった）</span>}</td>
                      <td className="px-2 py-2 text-muted">{canApplyKey(f.key) || f.key === 'name' ? (c || '（空）') : '—'}{c && c === f.read && <span className="ml-1 whitespace-nowrap text-ok">同じ</span>}</td>
                      <td className="px-3 py-2">
                        {fixed ? <span className="text-sm text-faint">{f.key === 'name' ? '氏名はここでは変えない' : !canApplyKey(f.key) ? '見るだけ（基本情報には入れない）' : !cur ? '入れられない' : '今のまま'}</span> : (
                          <select aria-label={`${f.label} はどちらを使う`} value={p ?? ''} disabled={!canEdit} onChange={(e) => setPick((x) => ({ ...x, [f.key]: e.target.value as Pick }))} className="min-h-8 rounded-lg border border-field bg-surface px-1.5 text-sm disabled:opacity-50" style={!p ? { borderColor: 'var(--color-warn)' } : undefined}>
                            {!p && <option value="">選んでください</option>}
                            <option value="read">読み取りを使う</option><option value="keep">今のまま</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={apply} disabled={!canEdit || !cur || undecided > 0 || changes.length === 0} title={!canEdit ? needText('edit') : !cur ? warn : undecided ? '確かめが要る項目を選んでください' : changes.length === 0 ? '入れる項目がありません' : undefined} className="btn-primary">基本情報に入れる（{changes.length}項目）</button>
              <button onClick={reset} className="text-sm text-muted">写真を選び直す</button>
              {undecided > 0 && <span className="text-sm text-warn">あと {undecided}項目 選んでください</span>}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mo-scale-in py-4 text-center">
            <Check className="mx-auto text-ok" size={26} />
            <div className="mt-2 text-md font-bold">{person} の基本情報に入れました</div>
            <div className="mt-1 text-sm text-muted">{applied.join('・') || '変更なし'}</div>
            <div className="mt-3 flex justify-center gap-3 text-sm"><PersonName name={person} className="font-semibold" /><button onClick={() => { reset(); setPerson(''); setCur(null); }} className="text-muted">次の人へ</button></div>
          </div>
        )}
      </section>
      <p className="text-xs leading-relaxed text-faint">写真は読み取りのために1回送るだけで、どこにも残しません（読み取った値も、基本情報に入れた項目以外は残りません）。マイナンバーの個人番号・免許証番号は読み取りません。本人確認書類の扱い・保存の期間は、最終判断は社労士・法務に確認してください。</p>
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
    </main>
  );
}
