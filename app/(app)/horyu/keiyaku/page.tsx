'use client';

import { useEffect, useState } from 'react';
import { Copy, Search } from 'lucide-react';
import { MnmPanel } from './MnmPanel';
import { PersonName } from '@/components/Person';
import { Card, HoryuFrame, Msg, btnCls, horyuPost, inputCls, tdCls, thCls, useHoryu } from '@/components/horyu/kit';

// 契約報告の雛形（保留・10-25）。今の /keiyaku-houkoku.html と同じ：
//   要員を選ぶ → 報告区分 → 条件詳細を貼る → 52項目と雛形の文（どこから取ったか付き）。値はその場で直せる。報告フォームへは人が貼って押す
//   4. MNM に登録（① 案件確定 → ② 稼働追加）も今の画面と同じ口（10-26）。押したときだけ・確認の窓のあと
//     ★試し送りか本番かは今のシステムの MNM_DRY_RUN が決める（true の間は MNM に登録されない）。ver2 からは変えられない
type Person = { name: string; shozoku: string; last?: { tab: string; houkoku: string; joi: string; start: string; end: string } };
type Field = { key: string; value: string; src: string; why: string };
type Built = { houkoku: string; fields: Field[]; warnings: string[]; notes: string[]; template: string; history?: { joi: string; joiCount: number; personTab: string } };

const SRC_LABEL: Record<string, string> = { text: '条件詳細', history: '前回の報告', joi: '同じ上位の報告', person: '要員', fixed: '決まり', default: '既定', user: 'ログインした人', calc: '計算' };

export default function KeiyakuPage() {
  const opts = useHoryu<{ kinds: string[]; koyou: string[] }>('keiyaku-options');
  const live = opts.state === 'live';
  const [q, setQ] = useState('');
  const [qq, setQq] = useState('');
  useEffect(() => { const t = setTimeout(() => setQq(q.trim()), 400); return () => clearTimeout(t); }, [q]);
  const people = useHoryu<{ people: Person[] }>(live && qq ? 'keiyaku-people' : null, { q: qq });
  const [person, setPerson] = useState<Person | null>(null);
  const [kind, setKind] = useState('');
  const [koyou, setKoyou] = useState('');
  const [shienhi, setShienhi] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const [built, setBuilt] = useState<Built | null>(null);

  const kinds = live ? opts.data?.kinds ?? [] : [];
  const koyous = live ? opts.data?.koyou ?? [] : [];
  const list = live && qq ? people.data?.people ?? [] : [];

  const build = async () => {
    if (!person || !kind || !koyou) { setMsg({ text: '要員・報告区分を選んでください', bad: true }); return; }
    if (!live) return;
    setBusy(true); setMsg({ text: '' });
    const r = await horyuPost<Built>('keiyaku-build', { name: person.name, kind, koyou, shienhi, text });
    setBusy(false);
    if (r.ok) setBuilt(r.data); else setMsg({ text: r.error, bad: true });
  };
  // 雛形の文は値を直したら作り直す（今の画面の buildTemplate と同じ規則）
  const template = (b: Built) => ['# 社内ツール「契約報告の雛形」で作成（' + new Date().toISOString().slice(0, 10) + '）', ...b.fields.filter((f) => f.value.trim()).map((f) => `${f.key}: ${f.value.trim()}`)].join('\n') + '\n';
  const copy = async () => { if (!built) return; try { await navigator.clipboard.writeText(template(built)); setMsg({ text: '雛形の文をコピーしました。報告フォームに貼ってください' }); } catch { setMsg({ text: 'コピーできませんでした', bad: true }); } };

  return (
    <HoryuFrame title="契約報告の雛形" sub="条件詳細から契約報告の52項目を作る（保存・送信はしません）" state={opts.state} error={opts.error} onReload={opts.reload}>
      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card title="1. 要員と報告区分">
          <div className="flex flex-col gap-3 px-4 pb-4">
            <label className="flex items-center gap-1.5 rounded-lg border border-field bg-surface px-2 py-1.5 text-body">
              <Search size={14} className="shrink-0 text-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="氏名の一部で探す" aria-label="要員を探す" className="min-w-0 flex-1 bg-transparent outline-none" />
            </label>
            {list.length > 0 && (
              <ul className="max-h-[220px] overflow-y-auto rounded-lg border border-line-soft">
                {list.map((p) => (
                  <li key={p.name} className="flex items-center gap-2 border-b border-line-soft px-3 py-2 text-body last:border-0">
                    <input type="radio" name="kh-person" checked={person?.name === p.name} onChange={() => { setPerson(p); if (p.last?.houkoku) { const [k, y] = p.last.houkoku.split('_'); if (kinds.includes('継続') && k) setKind('継続'); if (y) setKoyou(y); } }} aria-label={`${p.name} を選ぶ`} />
                    <PersonName name={p.name} />
                    <span className="ml-auto text-xs text-faint">{p.last ? `前回 ${p.last.tab}・${p.last.joi}` : '前回の報告なし'}</span>
                  </li>
                ))}
              </ul>
            )}
            {live && qq && people.state === 'live' && !list.length && <p className="text-sm text-muted">見つかりません</p>}
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-1.5 text-sm text-muted">種別<select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}><option value="">選ぶ</option>{kinds.map((k) => <option key={k}>{k}</option>)}</select></label>
              <label className="flex items-center gap-1.5 text-sm text-muted">雇用<select value={koyou} onChange={(e) => setKoyou(e.target.value)} className={inputCls}><option value="">選ぶ</option>{koyous.map((k) => <option key={k}>{k}</option>)}</select></label>
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={shienhi} onChange={(e) => setShienhi(e.target.checked)} />支援費あり</label>
            </div>
            <label className="flex flex-col gap-1 text-sm text-muted">2. 条件詳細（成約の連絡などをそのまま貼る）
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} className={`${inputCls} font-[inherit]`} placeholder="上位・期間・単価・精算幅など" />
            </label>
            <button onClick={build} disabled={busy} className="btn-primary">{busy ? '作っています…（30秒ほど）' : '雛形を作る'}</button>
            <Msg text={msg.text} bad={msg.bad} />
          </div>
        </Card>
        <Card title="3. できた雛形" note={built ? `報告区分 ${built.houkoku}` : undefined} right={built && <button onClick={copy} className={btnCls}><Copy size={13} className="mr-1 inline" />文をコピー</button>}>
          {!built ? <p className="px-4 pb-6 text-body text-muted">左で要員と条件を入れて「雛形を作る」を押すと、ここに出ます。</p> : (
            <div className="flex flex-col gap-2 pb-3">
              {[...built.warnings, ...built.notes].map((w, i) => <div key={i} className="mx-4 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>{w}</div>)}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-body">
                  <thead><tr className="th-row"><th className={thCls}>項目</th><th className={thCls}>値</th><th className={thCls}>どこから</th></tr></thead>
                  <tbody>
                    {built.fields.map((f) => (
                      <tr key={f.key} className="border-t border-line-soft align-top">
                        <td className={`${tdCls} whitespace-nowrap font-semibold`}>{f.key}</td>
                        <td className={tdCls}>
                          <textarea value={f.value} rows={Math.min(4, Math.max(1, f.value.split('\n').length))} aria-label={f.key}
                            onChange={(e) => { const v = e.target.value; setBuilt((b) => b && { ...b, fields: b.fields.map((x) => (x.key === f.key ? { ...x, value: v, src: 'user', why: '手で直した' } : x)) }); }}
                            className={`${inputCls} w-full min-w-[220px] font-[inherit]`} style={/★/.test(f.value) ? { color: 'var(--tone-bad-fg)' } : undefined} />
                        </td>
                        <td className={`${tdCls} text-sm text-muted`}>{SRC_LABEL[f.src] ?? f.src}{f.why ? `・${f.why}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      </div>
      {built && person && <MnmPanel live={live} name={person.name} houkoku={built.fields.find((f) => f.key === '報告区分')?.value || built.houkoku} fields={built.fields} />}
    </HoryuFrame>
  );
}
