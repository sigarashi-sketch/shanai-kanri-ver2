'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { BAND_STYLE, scoreBand, scoreText, scoreValue, type ScoreKind, type ScoreMeta, type ScoreRes, type ScoreRow } from '@/lib/live/proper-cols';
import { SAMPLE_SCORES } from '@/lib/proper-sample';
import { Z } from '@/lib/layers';
import { DrawerPortal } from './DrawerPortal';

// プロパーリストのスコア（今の proper.html と同じ：スキル 0〜100／参画見込％／辞退リスク％／営業止め％）。
//   ・読む口は /api/live/proper-score（今の GET /api/roster?op=score・10分控える・学習し直しは起こさない）
//   ・色は今と同じ3段（良い＝緑・並み＝黄・悪い＝赤／材料不足＝灰）。押すと内訳（送った案件・OK/NG・発言・48時間の返信率・効いている要素）
//   ・対象は決着していない人（＋再アサイン）だけ。参画・辞退・営業止めが付いた人は「—」
//   ・ログインしていないときは見本の数字（画面に「見本」と出す）

export const SCORE_LABEL: Record<ScoreKind, string> = { skill: 'スキル', join: '参画見込', decline: '辞退リスク', poa: '営業止め見込' };
export const SCORE_HINT: Record<ScoreKind, string> = {
  skill: '職歴・資格・PC・現場経験から0〜100（戦闘力があれば半々で混ぜる）',
  join: '承諾からの経過・LINEの動き・属性から推定した参画決定の確率',
  decline: '承諾からの経過・LINEの動き・属性から推定した辞退の確率',
  poa: '承諾からの経過・LINEの動き・属性から推定した営業止めの確率',
};

type At = { x: number; top?: number; bottom?: number };
export type Scores = { map: Map<string, ScoreRow>; meta: ScoreMeta | null; state: 'loading' | 'live' | 'sample' | 'error' | 'off'; error: string; sample: boolean };

/** live=false なら見本。403（見られない人）なら state='off'＝列ごと出さない */
export function useProperScores(live: boolean): Scores {
  const r = useLiveRoute<ScoreRes>(live ? '/api/live/proper-score' : null);
  return useMemo(() => {
    const d = live ? r.data : SAMPLE_SCORES;
    const map = new Map<string, ScoreRow>((d?.rows ?? []).map((x) => [x.id, x]));
    const off = live && r.state === 'error' && /403|見られ|権限/.test(r.error);
    return { map, meta: d?.meta ?? null, state: !live ? 'sample' : off ? 'off' : r.state === 'loading' ? 'loading' : r.state === 'error' ? 'error' : 'live', error: r.error, sample: !live };
  }, [live, r.data, r.state, r.error]);
}

const f2 = (v: number | null | undefined) => (v == null ? '-' : Number(v).toFixed(2));

/** スコアの精度の短い注意（今の「マトリックス」の説明を短くしたもの） */
export function ScoreNote({ scores }: { scores: Scores }) {
  const m = scores.meta;
  if (scores.state === 'off') return null;
  if (scores.state === 'loading') return <p className="text-[12px] text-faint">スコアを読み込み中…（はじめは数十秒かかることがあります）</p>;
  if (scores.state === 'error') return <p className="text-[12px] text-bad">スコアを読めませんでした：{scores.error}</p>;
  if (!m) return null;
  const a = m.cvAuc;
  return (
    <p className="text-[12px] leading-relaxed text-muted">
      {scores.sample && <span className="mr-1 rounded bg-sunken px-1.5 text-[11px]">見本</span>}
      <b>スコアの精度</b>：参画見込・辞退リスクは {m.trainFrom} 以降に承諾して決着した {m.trained}名（参画 {m.counts.join}・辞退 {m.counts.decline}・営業止め {m.counts.poa}）から学習。
      見分ける力（AUC・0.5＝当てずっぽう／1.0＝完璧）は承諾7日目以降で 参画 <b>{f2(a.joinLate)}</b>・辞退 <b>{f2(a.declineLate)}</b>。
      確率としては概ね当たりますが、1人ずつの断定には使わないでください。数字を押すと内訳。
    </p>
  );
}

/** 表のセル・要員ページに置く数字。押すと内訳 */
export function ScoreBadge({ s, kind, meta, name }: { s: ScoreRow | null | undefined; kind: ScoreKind; meta: ScoreMeta | null; name: string }) {
  const [at, setAt] = useState<At | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  if (!s) return <span className="text-faint" title="決着済み（参画/辞退/営業止め）の人は対象外">—</span>;
  const v = scoreValue(s, kind);
  const open = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) { const x = Math.max(8, Math.min(r.left, window.innerWidth - 360)); setAt(window.innerHeight - r.bottom > 340 ? { x, top: r.bottom + 6 } : { x, bottom: window.innerHeight - r.top + 6 }); }
  };
  return (
    <>
      <button ref={btn} type="button" onClick={(e) => { e.stopPropagation(); if (at) setAt(null); else open(); }} title={`${SCORE_LABEL[kind]}：${SCORE_HINT[kind]}（押すと内訳）`}
        className="num inline-block min-w-[40px] rounded-full px-2 py-0.5 text-center text-[12.5px] font-bold" style={BAND_STYLE[scoreBand(kind, v, s.skillThin, meta)]}>
        {scoreText(s, kind)}
      </button>
      {at && <ScorePop s={s} kind={kind} meta={meta} name={name} at={at} onClose={() => setAt(null)} />}
    </>
  );
}

function ScorePop({ s, kind, meta, name, at, onClose }: { s: ScoreRow; kind: ScoreKind; meta: ScoreMeta | null; name: string; at: At; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const t = setTimeout(() => { window.addEventListener('pointerdown', down, true); }, 0);
    window.addEventListener('keydown', esc, true);
    window.addEventListener('scroll', onClose, true);
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', esc, true); window.removeEventListener('scroll', onClose, true); };
  }, [onClose]);
  const isJoin = kind === 'join';
  const base = meta && kind !== 'skill' ? meta.base[kind] : null;
  const auc = meta ? (isJoin ? meta.cvAuc.joinLate : kind === 'decline' ? meta.cvAuc.declineLate : null) : null;
  const why = isJoin ? s.joinWhy : kind === 'decline' ? s.declineWhy : [];
  return (
    <DrawerPortal>
      <div ref={ref} role="dialog" aria-label={`${name} の${SCORE_LABEL[kind]}の内訳`} onClick={(e) => e.stopPropagation()}
        className="fixed w-[min(340px,calc(100vw-16px))] rounded-xl border border-line bg-surface px-3.5 py-3 text-[12.5px] leading-relaxed shadow-[0_8px_24px_rgba(0,0,0,.15)]"
        style={{ left: at.x, top: at.top, bottom: at.bottom, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto', zIndex: Z.modal + 1 }}>
        <div className="mb-1 font-bold">{name}</div>
        {kind === 'skill' ? (
          <>
            <div>スキル <b>{s.skill}</b> / 100{s.sento != null && <span className="text-muted">（ルール {s.skillRule} と 戦闘力 {s.sento}×20 の平均）</span>}</div>
            <table className="mt-1 w-full border-collapse">
              <tbody>
                {s.skillParts.map((p) => (
                  <tr key={p.label} className="border-b border-line-soft align-top"><td className="py-0.5 pr-2">{p.label}</td><td className="num whitespace-nowrap py-0.5 pr-2 text-right"><b>{p.points}</b>/{p.max}</td><td className="py-0.5 text-muted">{p.note}</td></tr>
                ))}
              </tbody>
            </table>
            {s.skillThin && <p className="mt-1.5 text-[11.5px] text-faint">材料不足：フォーム・基本情報・前職欄のどれも無いので低く出ています</p>}
            <p className="mt-1.5 text-[11.5px] text-faint">職歴・資格・PCは本人フォーム/基本情報/前職欄のキーワードから自動判定</p>
          </>
        ) : (
          <>
            <div>{SCORE_LABEL[kind]} <b>{scoreValue(s, kind)}%</b>{base != null && <span className="text-muted">（全体平均 {base}%）</span>}</div>
            <div className="text-muted">内訳：参画 {s.join}%・辞退 {s.decline}%・営業止め {s.poa}%</div>
            <div className="mt-1.5">
              {s.cases && s.cases.sends ? (<>
                案件：送った <b>{s.cases.sends}</b>件 ／ OK <b>{s.cases.ok}</b>・NG <b>{s.cases.ng}</b>・未判断 <b>{s.cases.undecided}</b>
                {(s.cases.declineWords || s.cases.condWords || s.cases.reschedWords) ? <div className="text-muted">本人の発言：「見送り/辞退」{s.cases.declineWords}回・場所/条件の引っかかり {s.cases.condWords}回・日程変更/体調 {s.cases.reschedWords}回</div> : null}
              </>) : s.cases ? '案件：まだ送っていません' : <span className="text-muted">案件の記録なし</span>}
            </div>
            {s.resp && s.resp.outs > 0 && (
              <div className="mt-1">返信：こちらの送信 <b>{s.resp.outs}</b>回 → 48時間以内の返信 <b>{s.resp.replied}</b>回{s.resp.rate != null && <>（返信率 <b>{s.resp.rate}%</b>）</>}{s.resp.medianHours != null && <span className="text-muted">・中央値 {s.resp.medianHours}時間</span>}</div>
            )}
            {why.length > 0 ? (
              <>
                <div className="mt-1.5 text-muted">効いている要素（平均的な人との差）</div>
                <ul>{why.map((w) => <li key={w.label} className="flex justify-between gap-2 border-b border-line-soft py-0.5"><span>{w.label}</span><span className="whitespace-nowrap font-semibold" style={{ color: (w.v > 0) === isJoin ? 'var(--tone-ok-fg)' : 'var(--tone-bad-fg)' }}>{w.v > 0 ? '↑ 上げる' : '↓ 下げる'}</span></li>)}</ul>
              </>
            ) : kind !== 'poa' && <p className="mt-1.5 text-[11.5px] text-faint">平均から大きく動かす要素なし</p>}
            <p className="mt-1.5 text-[11.5px] text-faint">{s.days != null && `承諾から ${s.days}日目の時点。`}過去の決着者の同じ時点の行動・属性からの推定{auc != null && `（AUC ${auc}）`}。参考値</p>
          </>
        )}
      </div>
    </DrawerPortal>
  );
}

/** 要員ページ・名前の小窓の名前の下に出す1行（スキル・参画見込・辞退リスク・営業止め見込） */
export function ScoreLine({ id, name, live, compact }: { id: string; name: string; live: boolean; compact?: boolean }) {
  const sc = useProperScores(live);
  const s = sc.map.get(id);
  if (sc.state === 'off' || sc.state === 'error' || !s) return null;
  return (
    <div className={`${compact ? '' : 'mt-2 '}flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted`}>
      {sc.sample && <span className="rounded bg-sunken px-1.5 text-[11px]">見本</span>}
      {(['skill', 'join', 'decline', 'poa'] as ScoreKind[]).map((k) => <span key={k} className="inline-flex items-center gap-1">{SCORE_LABEL[k]} <ScoreBadge s={s} kind={k} meta={sc.meta} name={name} /></span>)}
    </div>
  );
}
