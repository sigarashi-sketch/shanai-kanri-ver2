'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { needText, usePerms } from '@/components/Perms';
import { BENKYOU_UNITS, RULE_PHASES, TAIOU_FIELDS, TAIOU_INTERVIEW, TAIOU_KINDS, rulePhaseOf } from '@/lib/live/staff-write';
import { useLiveWrite, WriteError } from './useLiveWrite';
import { staffReq } from './staffWrite';

// 対応歴（今の名簿の「対応歴」・taiou-modal.js の写し）＝電話・LINE・面談などのメモを1行ずつ足していく（足すだけ・直す/消すは無い）。
//   ・フォロー面談・定期面談のときだけ 現場懸念点／これから頑張りたいこと／現状評価されていること／勉強時間 の欄を出す
//   ・それゆけ未経験（採用）のメモ・採用LINE は混ぜて出す（ここからは直せない）
//   ・上にルール欠勤の段（①営業面談 → ②来社面談 → ③書面注意・改善計画書 → ④けん責を検討）を出す
type Entry = { id?: string; kind?: string; body?: string; created_at?: string; source?: string; fields?: Record<string, unknown> };
const fmt = (iso?: string) => { const t = Date.parse(iso || ''); if (!Number.isFinite(t)) return iso || ''; const d = new Date(t + 9 * 3600e3).toISOString(); return `${d.slice(0, 10).replaceAll('-', '/')} ${d.slice(11, 16)}`; };

export function TaiouLog({ name, live, rule }: { name: string; live: boolean; rule?: { ok: boolean; n?: number } }) {
  const canEdit = usePerms().can('jinji', 'edit');
  const [rows, setRows] = useState<Entry[] | null>(live ? null : []);
  const [loadErr, setLoadErr] = useState('');
  const [kind, setKind] = useState<(typeof TAIOU_KINDS)[number]>('電話');
  const [body, setBody] = useState('');
  const [f, setF] = useState<Record<string, string>>({ benkyou_unit: '週' });
  const load = useCallback(() => {
    if (!live) return;
    fetch('/api/live/staff/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ what: 'taiou', name }) })
      .then((r) => r.json()).then((j) => { if (j.error) setLoadErr(j.error); else { setRows(j.rows || []); setLoadErr(''); } })
      .catch((e) => setLoadErr((e as Error).message));
  }, [live, name]);
  useEffect(() => { load(); }, [load]);
  const { send, error, setError, busy } = useLiveWrite(live, load);
  const interview = (TAIOU_INTERVIEW as readonly string[]).includes(kind);

  const add = async () => {
    const fields: Record<string, unknown> = {};
    if (interview) {
      for (const { key } of TAIOU_FIELDS) if (f[key]?.trim()) fields[key] = f[key].trim();
      if (f.benkyou_hours?.trim()) { fields.benkyou_hours = f.benkyou_hours.trim(); fields.benkyou_unit = f.benkyou_unit || '週'; }
      if (f.benkyou_note?.trim()) fields.benkyou_note = f.benkyou_note.trim();
    }
    if (!body.trim() && !Object.keys(fields).length) { setError('対応内容を書いてください'); return; }
    const local: Entry = { kind, body: body.trim(), fields, created_at: new Date().toISOString(), id: `local-${Date.now()}` };
    const before = rows;
    const r = await send(staffReq({ kind: 'taiou', name, taiouKind: kind, body: body.trim(), fields: fields as never }, `${name} さんの対応歴に「${kind}」を足しました`, {
      sub: '→ 名簿の対応歴（追記だけ・あとから直せません）',
      apply: live ? undefined : () => setRows((x) => [local, ...(x || [])]), revert: live ? undefined : () => setRows(before),
    }));
    if (r) { setBody(''); setF({ benkyou_unit: '週' }); }
  };
  const ph = rule?.ok && rule.n != null ? rulePhaseOf(rule.n) : null;
  const ta = 'min-h-[56px] w-full rounded-[10px] border border-field bg-surface px-2.5 py-2 text-body text-ink';

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-xl border border-line bg-surface px-[18px] py-3.5 text-body">
        <h3 className="text-body font-bold">欠勤・遅刻・早退の段階対応</h3>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {RULE_PHASES.slice(1).map((p, i) => {
            const on = ph?.mark === p!.mark;
            return <span key={p!.mark} className="chip" style={on ? { background: `var(--tone-${p!.tone}-bg)`, color: `var(--tone-${p!.tone}-fg)`, fontWeight: 700 } : { background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{p!.mark} {p!.label}{i < 3 ? ' →' : ''}</span>;
          })}
        </div>
        <div className="mt-1.5 text-sm text-muted">
          {!rule ? '回数は社員一覧から開いたときに出ます' : !rule.ok ? '勤怠連絡を読めませんでした（0回ではなく不明）' : `2026-10-05 以降のルール欠勤 ${rule.n ?? 0}回${ph ? `＝いまは「${ph.mark} ${ph.label}」の段` : '（対象なし）'}。④は③で決めた改善策を守らなかったときの目安で、処分するかは人が決めます`}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface px-[18px] py-3.5">
        <WriteError error={error} onClose={() => setError('')} />
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="区分">
          {TAIOU_KINDS.map((k) => (
            <button key={k} role="radio" aria-checked={kind === k} disabled={!canEdit} onClick={() => setKind(k)} className="fchip disabled:opacity-50">{k}</button>
          ))}
        </div>
        {interview && (
          <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
            {TAIOU_FIELDS.map(({ key, label }) => (
              <label key={key} className="flex flex-col gap-1 text-sm text-muted">{label}
                <textarea value={f[key] || ''} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, [key]: e.target.value }))} className={ta} />
              </label>
            ))}
            <div className="flex flex-wrap items-end gap-1.5 text-sm text-muted sm:col-span-3">現状の勉強時間
              <input type="number" min={0} step={0.5} value={f.benkyou_hours || ''} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, benkyou_hours: e.target.value }))} className="min-h-9 w-[84px] rounded-[10px] border border-field bg-surface px-2 text-body text-ink" />時間 /
              <select value={f.benkyou_unit || '週'} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, benkyou_unit: e.target.value }))} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-body text-ink">{BENKYOU_UNITS.map((u) => <option key={u}>{u}</option>)}</select>
              <input value={f.benkyou_note || ''} disabled={!canEdit} placeholder="補足（任意）" onChange={(e) => setF((x) => ({ ...x, benkyou_note: e.target.value }))} className="min-h-9 min-w-[160px] flex-1 rounded-[10px] border border-field bg-surface px-2 text-body text-ink" />
            </div>
          </div>
        )}
        <textarea value={body} disabled={!canEdit} onChange={(e) => setBody(e.target.value)} placeholder={interview ? '自由に記入（改行OK）' : '対応内容を記入（改行OK）'} className={`${ta} mt-2.5 min-h-[72px]`} />
        <div className="mt-2 flex justify-end">
          <button onClick={add} disabled={!canEdit || busy} title={canEdit ? undefined : needText('edit')} className="btn-primary">{busy ? '保存しています…' : '＋ 追記'}</button>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface px-[18px] py-3.5 text-body">
        <h3 className="mb-1 text-body font-bold">これまでの対応</h3>
        {loadErr && <div className="text-sm text-bad">{loadErr}</div>}
        {rows === null && !loadErr && <div className="text-sm text-muted">読み込み中…</div>}
        {rows && rows.length === 0 && <div className="text-sm text-muted">まだ対応歴はありません</div>}
        {rows?.map((e, i) => (
          <div key={e.id || i} className="border-t border-line-soft py-2 first:border-t-0">
            <div className="mb-0.5 flex flex-wrap items-center gap-2 text-sm">
              <span className="num text-faint">{fmt(e.created_at)}</span>
              <span className="chip" style={e.source === 'zuanshi' ? { background: 'var(--tone-purple-bg)', color: 'var(--tone-purple-fg)' } : { background: 'var(--tone-info-bg)', color: 'var(--tone-info-fg)' }}>{e.kind}</span>
              {e.source === 'zuanshi' && <a href="https://soreyuke.vercel.app/roster" target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 text-xs text-muted underline">採用の画面で見る<ExternalLink size={10} /></a>}
            </div>
            {e.fields && TAIOU_FIELDS.map(({ key, label }) => (e.fields![key] ? <div key={key} className="mb-1"><div className="text-xs text-muted">■{label}</div><div className="whitespace-pre-wrap break-words">{String(e.fields![key])}</div></div> : null))}
            {e.fields && (e.fields.benkyou_hours != null || !!e.fields.benkyou_note) && <div className="mb-1"><div className="text-xs text-muted">■現状の勉強時間</div>{e.fields.benkyou_hours != null ? `${String(e.fields.benkyou_hours)} 時間/${String(e.fields.benkyou_unit || '週')}` : ''}{e.fields.benkyou_note ? `（${String(e.fields.benkyou_note)}）` : ''}</div>}
            {e.body && <div className="whitespace-pre-wrap break-words">{e.body}</div>}
          </div>
        ))}
      </section>
    </div>
  );
}
