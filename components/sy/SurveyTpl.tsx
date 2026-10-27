'use client';
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { ruleHits, ruleLabel, rulesError, TPL_MAX_RULES, TPL_MAX_TEXT, type ScoreRule, type TplTarget } from '@/lib/sy/survey-tpl-types';
import { btnGray, btnPrimary, inputCls } from '@/components/sy/ui';

// 月次アンケート「スコア別の文章」（2026-10-09 shoya）。範囲ごとに文章を置き、その範囲の回答者の LINE（1:1）へ送る。
//   決め方は lib/survey-tpl-types.ts。入口は2つ:
//     ・回答の行の「文章を送る」＝その1人へ（shoya「要員をクリックしてボタンで送信」）
//     ・ページ右上の「スコア別の文章」＝文章の設定と、範囲ごとの まとめて送信
//   ここの人数は目安で、ほんとうの宛先（LINE が紐付いているか・送信済みか）は 送る前の確認でサーバが引く

// 保存済みの文章と、送信済みの印（'<月分>|<正規化氏名>' → '10/9 送信済み（だれ）'）。画面で1回だけ読む
export interface SurveyTplState {
  rules: ScoreRule[] | null;
  sent: Record<string, string>;
  setRules: (r: ScoreRule[]) => void;
  markSent: (month: string, keys: string[]) => void;
}
export function useSurveyTpl(): SurveyTplState {
  const [rules, setRules] = useState<ScoreRule[] | null>(null);
  const [sent, setSent] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch('/api/sy/s/survey-tpl').then((r) => r.json()).then((d) => { setRules(d?.rules || []); setSent(d?.sent || {}); }).catch(() => setRules([]));
  }, []);
  const markSent = useCallback((month: string, keys: string[]) => setSent((s) => { const n = { ...s }; keys.forEach((k) => { n[`${month}|${k}`] = '送信済み'; }); return n; }), []);
  return { rules, sent, setRules, markSent };
}

// 文章の設定（ページ右上のボタンから開く）。answers = いま選んでいる月分の回答（1人1件）。month が空（「すべて」）のときは まとめて送れない
export function SurveyTplSettings({ tpl, month, monthLabel, answers, onClose }: { tpl: SurveyTplState; month: string; monthLabel: string; answers: { manzoku: string }[]; onClose: () => void }) {
  const saved = JSON.stringify(tpl.rules || []);
  const [list, setList] = useState<ScoreRule[]>(tpl.rules || []);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState<ScoreRule | null>(null);

  const err = rulesError(list);
  const dirty = JSON.stringify(list) !== saved;
  const hits = (r: ScoreRule) => answers.filter((a) => ruleHits(r, a.manzoku)).length;
  const patch = (i: number, p: Partial<ScoreRule>) => { setMsg(''); setList(list.map((r, j) => (j === i ? { ...r, ...p } : r))); };
  const close = () => { if (!dirty || confirm('保存していない変更があります。閉じますか？')) onClose(); };

  // まだ使っていないスコアのうち、いちばん下の帯（無ければ 空いている数字1つ）を最初の値にする
  function add() {
    const used = new Set<number>(); list.forEach((r) => { for (let n = r.min; n <= r.max; n++) used.add(n); });
    const free = ([[1, 2], [3, 5], [6, 7], [8, 10]] as [number, number][]).find(([a, b]) => { for (let n = a; n <= b; n++) if (used.has(n)) return false; return true; });
    const one = free ? null : Array.from({ length: 10 }, (_, i) => i + 1).find((n) => !used.has(n));
    if (!free && !one) { setMsg('1〜10 は すべて使われています'); return; }
    const [min, max] = free || [one!, one!];
    setMsg(''); setList([...list, { id: 'r' + Date.now().toString(36), min, max, text: '' }].sort((a, b) => a.min - b.min));
  }
  async function save() {
    setBusy(true); setMsg('');
    try {
      const d = await fetch('/api/sy/s/survey-tpl', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: list }) }).then((r) => r.json());
      if (!d?.ok) { setMsg(d?.error || '保存できませんでした'); return; }
      setList(d.rules); tpl.setRules(d.rules); setMsg('保存しました');
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  const num = (v: number, on: (n: number) => void) => (
    <select value={v} onChange={(e) => on(Number(e.target.value))} className={`${inputCls} px-2 py-1`}>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select>
  );

  return (<>
    <div className="ig-scrim fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={close}>
      <div onClick={(e) => e.stopPropagation()} className="ig-pop flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white">
        <div className="flex items-center justify-between border-b border-ig-divider px-4 py-3"><span className="font-semibold">スコア別の文章</span><button type="button" onClick={close}><X size={20} /></button></div>
        <div className="space-y-2 overflow-y-auto p-4">
          <p className="text-[11px] leading-relaxed text-ig-muted">
            スコアの範囲ごとに文章を1つ置けます（例：5 だけ／5〜7）。範囲どうしは重ねられません。本文の <b>{'{名前}'}</b> は回答者の氏名に変わります。
            ここで置いた文章は、回答の一覧の <b>「文章を送る」</b> から1人ずつ送れます（この画面からは 範囲ごとに まとめて送れます）。
            いまのフォームは「10～8 / 7～6 / 5～3 / 2～1」の帯で答えるので、<b>帯がまるごと範囲に入る人</b>だけが対象です（5〜7 なら 7～6 の人）。
            送り先は 公式LINE の 1:1。同じ月分に一度送った人には もう送りません。
          </p>
          {!list.length && <div className="rounded-lg border border-dashed border-ig-border p-4 text-center text-xs text-ig-muted">まだ文章がありません。「範囲を追加」から作れます</div>}
          {list.map((r, i) => {
            const n = hits(r);
            return (
              <div key={r.id} className="rounded-lg border border-ig-border p-2">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <span>スコア</span>{num(r.min, (v) => patch(i, { min: v }))}<span>〜</span>{num(r.max, (v) => patch(i, { max: v }))}
                  {month && <span className={n ? 'text-ig-muted' : 'text-ig-warn'}>{monthLabel}の対象 {n}人{!n && '（帯がまるごと入る範囲にしてください）'}</span>}
                  <span className="ml-auto flex gap-1.5">
                    <button type="button" className={`${btnGray} px-3 py-1 text-xs`} disabled={dirty || !!err || !month || !n} title={dirty ? '先に保存してください' : !month ? '月を1つ選ぶと送れます' : ''} onClick={() => setSending(r)}>
                      この範囲の全員に送る
                    </button>
                    <button type="button" className={`${btnGray} px-2 py-1`} title="この文章を消す（保存を押すまでは消えません）" onClick={() => { if (!r.text.trim() || confirm(`スコア ${ruleLabel(r)} の文章を消しますか？`)) { setMsg(''); setList(list.filter((_, j) => j !== i)); } }}><Trash2 size={14} /></button>
                  </span>
                </div>
                <textarea value={r.text} maxLength={TPL_MAX_TEXT} onChange={(e) => patch(i, { text: e.target.value })} rows={3} placeholder="このスコアの人に送る文章（{名前} は氏名に変わります）" className={`${inputCls} w-full resize-y leading-relaxed`} />
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-ig-divider px-4 py-3 text-xs">
          <button type="button" className={`${btnGray} inline-flex items-center gap-1 px-3`} disabled={list.length >= TPL_MAX_RULES} onClick={add}><Plus size={14} />範囲を追加</button>
          <span className="mr-auto">{err ? <span className="font-semibold text-ig-danger">{err}</span> : msg ? <span className="text-ig-muted">{msg}</span> : dirty && <span className="text-ig-muted">未保存の変更があります</span>}</span>
          <button type="button" className={btnGray} onClick={close}>閉じる</button>
          <button type="button" className={btnPrimary} disabled={!dirty || !!err || busy} onClick={save}>保存</button>
        </div>
      </div>
    </div>
    {sending && <SendDialog rule={sending} month={month} monthLabel={monthLabel} onClose={() => setSending(null)} onSent={(keys) => tpl.markSent(month, keys)} />}
  </>);
}

// 送る前の確認 → 送る。only（正規化した氏名）を渡すと その1人だけ（回答の行から）。無ければ 範囲の全員を10人ずつ
export function SendDialog({ rule, month, monthLabel, only, onClose, onSent }: { rule: ScoreRule; month: string; monthLabel: string; only?: { key: string; name: string }; onClose: () => void; onSent: (keys: string[]) => void }) {
  const [targets, setTargets] = useState<TplTarget[] | null>(null);
  const [text, setText] = useState(rule.text);
  const [error, setError] = useState('');
  const [prog, setProg] = useState('');
  const [busy, setBusy] = useState(false);
  const post = (body: Record<string, unknown>) => fetch('/api/sy/s/survey-tpl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, ruleId: rule.id, ...body }) }).then((r) => r.json());

  useEffect(() => {
    post({ action: 'preview' }).then((d) => {
      if (!d?.ok) { setError(d?.error || '確認できませんでした'); return; }
      const ts: TplTarget[] = d.targets || [];
      setTargets(only ? ts.filter((t) => t.key === only.key) : ts); setText(d.rule?.text || rule.text);
    }).catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ok = (targets || []).filter((t) => t.status === 'ok');
  const sent = (targets || []).filter((t) => t.status === 'sent').length;
  async function run() {
    if (!ok.length || !confirm(only ? `${ok[0].name} さんの LINE（1:1）に送ります。取り消せません。よろしいですか？` : `${ok.length}人の LINE（1:1）に送ります。取り消せません。よろしいですか？`)) return;
    setBusy(true);
    let cur = targets || [], done = 0, fail = 0, stop = '';
    for (let i = 0; i < ok.length && !stop; i += 10) {
      setProg(`送信中… ${done} / ${ok.length}`);
      try {
        const d = await post({ action: 'send', keys: ok.slice(i, i + 10).map((t) => t.key) });
        if (!d?.ok) { stop = d?.error || '送信に失敗しました'; break; }
        const res = new Map<string, { ok: boolean; error?: string }>((d.results || []).map((r: { key: string; ok: boolean; error?: string }) => [r.key, r]));
        const okKeys: string[] = [];
        cur = cur.map((t) => { const r = res.get(t.key); if (!r) return t; if (r.ok) { done++; okKeys.push(t.key); return { ...t, status: 'sent' as const, note: '送信しました' }; } fail++; return { ...t, status: 'no_line' as const, note: `失敗: ${r.error || ''}` }; });
        setTargets(cur); if (okKeys.length) onSent(okKeys);
      } catch (e) { stop = (e as Error).message; }
    }
    setProg(`${stop ? `途中で止まりました（${stop}）。` : ''}${only ? (done ? '送りました' : '') : `${done}人に送りました`}${fail ? `／失敗 ${fail}人` : ''}`);
    setBusy(false);
  }
  const one = only && targets ? targets[0] : null;

  return (
    <div className="ig-scrim fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" onClick={busy ? undefined : onClose}>
      <div className="ig-pop max-h-[86vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-base font-bold">{only ? `${only.name} さんに送る` : `スコア ${ruleLabel(rule)} の全員に送る`}</div>
        <div className="mb-3 text-xs text-ig-muted">{monthLabel}の回答・スコア {ruleLabel(rule)} の文章を、公式LINE の 1:1 で送ります</div>
        <div className="mb-1 text-[11px] font-semibold text-ig-muted">送る文章</div>
        <div className="mb-3 whitespace-pre-wrap break-words rounded-lg bg-ig-subtle p-2.5 text-sm leading-relaxed">{only ? text.replace(/\{名前\}|｛名前｝/g, only.name.trim()) : text}</div>
        {only ? (
          <div className="mb-3 text-xs">
            {error ? <span className="text-ig-danger">{error}</span> : !targets ? <span className="text-ig-muted">宛先を確認中…</span>
              : !one ? <span className="text-ig-warn">この人は この文章の対象ではありません（新しい回答があるか、範囲が変わりました）</span>
              : one.status === 'ok' ? <span className="text-ig-muted">LINE に送れます</span> : <span className={one.status === 'sent' ? 'text-ig-ok' : 'text-ig-warn'}>{one.note}</span>}
          </div>
        ) : <>
          <div className="mb-1 text-[11px] font-semibold text-ig-muted">{targets ? `送る ${ok.length}人 ／ 送信済み ${sent}人 ／ 送れない ${targets.length - ok.length - sent}人` : '宛先'}</div>
          <div className="mb-3 max-h-64 overflow-y-auto rounded-lg border border-ig-border text-sm">
            {error ? <div className="p-3 text-xs text-ig-danger">{error}</div> : !targets ? <div className="p-3 text-xs text-ig-muted">宛先を確認中…</div>
              : !targets.length ? <div className="p-3 text-xs text-ig-muted">対象の人がいません</div>
              : targets.map((t) => (
                <div key={t.key} className="flex gap-2 border-b border-ig-divider px-3 py-1.5 last:border-b-0">
                  <span className={`shrink-0 font-semibold ${t.status === 'ok' ? '' : 'text-ig-muted'}`}>{t.name}</span>
                  <span className="min-w-0 truncate text-xs leading-5 text-ig-muted">{t.status === 'ok' ? `満足度 ${t.manzoku}` : t.note}</span>
                </div>
              ))}
          </div>
        </>}
        <div className="flex items-center gap-2">
          <span className="mr-auto text-xs text-ig-muted">{prog}</span>
          <button type="button" className={btnGray} disabled={busy} onClick={onClose}>閉じる</button>
          <button type="button" className={btnPrimary} disabled={busy || !ok.length} onClick={run}>{only ? '送る' : ok.length ? `${ok.length}人に送る` : '送る相手がいません'}</button>
        </div>
      </div>
    </div>
  );
}
