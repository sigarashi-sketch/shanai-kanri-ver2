'use client';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { fx } from '@/components/sy/compat';
import { REMIND_TEXT_MAX, REMIND_VARS, STEP_KEYS, STEP_NAME, stampText, type MendanRemindSettings, type PlanState, type RemindRow, type RemindStep, type StepKey } from '@/lib/sy/mendan-remind-types';
import { btnGray, btnPrimary, inputCls } from '@/components/sy/ui';

// 面談のリマインド（2026-10-09 shoya）。公式LINE のメニューから予約した 定期面談・リーダー面談の 本人へ、3日前・1日前・当日に 自動で送る。
//   決め方は lib/mendan-remind-types.ts（3日以上前に予約 → 3つとも・前日に予約した人は 当日だけ・当日に予約した人は なし）。
//   下の「これからの予約」は カレンダーから毎回読む（予定を動かす・消すと そのまま変わる）
const STATE: Record<PlanState | 'sent', [string, string]> = {
  sent: ['送信済み', 'bg-ig-primary/10 text-ig-primary'], due: ['まもなく送る', 'bg-ig-warn text-white'], wait: ['', 'bg-ig-hover text-ig-text'],
  skip: ['出さない', 'text-ig-muted'], off: ['止めている', 'text-ig-muted'], missed: ['送らなかった', 'text-ig-muted'],
};
export default function MendanRemindModal({ onClose }: { onClose: () => void }) {
  const [saved, setSaved] = useState<MendanRemindSettings | null>(null);
  const [ed, setEd] = useState<MendanRemindSettings | null>(null);
  const [rows, setRows] = useState<RemindRow[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    fetch('/api/sy/s/mendan-remind').then((r) => r.json()).then((d) => {
      if (!d?.ok) { setMsg(d?.error || d?.hint || '読み込めませんでした'); return; }
      setSaved(d.settings); setEd(d.settings); setRows(d.rows || []); setCanEdit(!!d.canEdit); setMsg(d.warning || '');
    }).catch((e) => setMsg((e as Error).message));
  }, []);
  const dirty = !!ed && JSON.stringify(ed) !== JSON.stringify(saved);
  const close = () => { if (!dirty || confirm('保存していない変更があります。閉じますか？')) onClose(); };
  const setStep = (k: StepKey, p: Partial<RemindStep>) => ed && setEd({ ...ed, steps: { ...ed.steps, [k]: { ...ed.steps[k], ...p } } });
  async function save() {
    if (!ed) return;
    if (ed.on && !saved?.on && !confirm('オンにすると、これからの予約に リマインドを自動で送り始めます。よろしいですか？')) return;
    setBusy(true); setMsg('');
    try {
      const d = await fetch('/api/sy/s/mendan-remind', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ed) }).then((r) => r.json());
      if (!d?.ok) { setMsg(d?.error || '保存できませんでした'); return; }
      setSaved(d.settings); setEd(d.settings); setRows(d.rows || []); fx.toast('リマインドの設定を保存しました');
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="ig-scrim fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={close}>
      <div onClick={(e) => e.stopPropagation()} className="ig-pop flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white">
        <div className="flex items-center justify-between border-b border-ig-divider px-4 py-3"><span className="font-semibold">面談のリマインド</span><button onClick={close}><X size={20} /></button></div>
        <div className="space-y-4 overflow-y-auto p-4 text-sm">
          {!ed ? <p className="text-ig-muted">{msg || '読み込み中…'}</p> : (
            <>
              <label className="flex items-center gap-2 font-semibold">
                <input type="checkbox" checked={ed.on} onChange={(e) => setEd({ ...ed, on: e.target.checked })} disabled={!canEdit} className="h-4 w-4" />リマインドを自動で送る
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${saved?.on ? 'bg-ig-primary/10 text-ig-primary' : 'bg-ig-hover text-ig-muted'}`}>いま {saved?.on ? '送っている' : '止まっている'}</span>
              </label>
              {STEP_KEYS.map((k) => (
                <div key={k} className="rounded-lg border border-ig-divider p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={ed.steps[k].on} onChange={(e) => setStep(k, { on: e.target.checked })} disabled={!canEdit} className="h-4 w-4" />{STEP_NAME[k]}</label>
                    <label className="flex items-center gap-1.5 text-xs text-ig-muted">送る時刻<input type="time" step={600} value={ed.steps[k].hm} onChange={(e) => setStep(k, { hm: e.target.value })} disabled={!canEdit} className={`${inputCls} w-28 py-1 text-sm text-ig-text`} /></label>
                    {k === 'd0' && <span className="text-[11px] text-ig-muted">面談が早い時間のときは 1時間前までに送ります</span>}
                  </div>
                  <textarea value={ed.steps[k].text} onChange={(e) => setStep(k, { text: e.target.value })} readOnly={!canEdit} maxLength={REMIND_TEXT_MAX} rows={6} className={`${inputCls} mt-2 w-full text-sm leading-relaxed`} />
                </div>
              ))}
              <p className="text-[11px] leading-relaxed text-ig-muted">文章に書ける差し込み: {REMIND_VARS.map(([v, d]) => `${v}＝${d}`).join('／')}。送る時刻は 10分きざみで見ています（最大10分ほど遅れます）。</p>
              <div>
                <div className="mb-1.5 font-semibold">これからの予約（{rows.length}件）</div>
                {rows.length === 0 ? <p className="text-xs text-ig-muted">メニューから予約された これからの面談は ありません。</p> : (
                  <div className="divide-y divide-ig-divider rounded-lg border border-ig-divider">
                    {rows.map((r) => (
                      <div key={r.id} className="px-3 py-2">
                        <div className="flex flex-wrap items-baseline gap-x-2"><span className="font-medium">{r.name}</span><span className="text-xs text-ig-muted">{r.kind}・{r.when}・担当 {r.host}</span></div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="text-ig-muted">予約 {stampText(Date.parse(r.bookedAt))}</span>
                          {!r.linked && <span className="text-ig-danger">LINE に送れません（ブロック・友だちでない）</span>}
                          {r.bousan && <span className="rounded bg-ig-stop px-1 font-semibold text-white">ぼうさん（送りません）</span>}
                          {r.steps.map((s) => <span key={s.key} className={`rounded px-1.5 py-0.5 ${STATE[s.state][1]}`}>{STEP_NAME[s.key]} {s.state === 'wait' ? stampText(Date.parse(s.at)) : STATE[s.state][0]}</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {msg && <p className="text-ig-danger">{msg}</p>}
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-ig-divider px-4 py-3">
          {ed && !canEdit && <span className="mr-auto text-xs text-ig-muted">設定を変えられるのは admin 以上です</span>}
          <button onClick={close} className={btnGray}>閉じる</button>
          {canEdit && <button disabled={busy || !dirty} onClick={save} className={btnPrimary}>保存する</button>}
        </div>
      </div>
    </div>
  );
}
