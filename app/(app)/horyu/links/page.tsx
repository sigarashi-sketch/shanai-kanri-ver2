'use client';

import { useState } from 'react';
import { LiveBanner } from '@/components/Live';
import { PageTitle } from '@/components/ui';
import { PersonName } from '@/components/Person';
import { HoldButton, HoryuNote, Panel, fmtDateTime, postHoryu, useHoryu } from '@/components/Horyu';
import { LINKS_SAMPLE } from '@/lib/horyu-sample';
import type { LinksRes } from '@/lib/horyu';

// LINE の紐付け管理（今の links.html を写したもの・保留）。公式LINEの友だち（連絡先）を、プロパーリストの人に紐付ける。
//   ・紐付ける人は「選ぶだけ」（プロパーリストの名前の一覧から・自由入力はさせない）。空を選ぶと紐付けを外す
//     保存はチャット画面の手動紐付けと同じ口（POST /api/chat?action=link）。参画決定の人に紐付けると、今のシステムがその場で稼働中メニューを貼る
//   ・「いま同期する」は稼働中メニューの同期（RICHMENU_SYNC が off なら何もしない）。長押し
//   ・紐付いた人は未経験の人だけを出す。未紐付けの連絡先は誰か分からないので出す（紐付けるための画面）
type F = 'all' | 'linked' | 'unmatched';
type B = 'all' | 'yes' | 'no';

export default function LinksPage() {
  const h = useHoryu<LinksRes>('links', LINKS_SAMPLE);
  const d = h.d;
  const [f, setF] = useState<F>('unmatched');
  const [b, setB] = useState<B>('no');
  const [q, setQ] = useState('');
  const [local, setLocal] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const nameOf = (r: LinksRes['rows'][number]) => (r.userId in local ? local[r.userId] : r.linkedName);
  const rows = (d?.rows || []).filter((r) => {
    const linked = !!nameOf(r);
    if (f === 'linked' && !linked) return false;
    if (f === 'unmatched' && linked) return false;
    if (b === 'yes' && !r.blocked) return false;
    if (b === 'no' && r.blocked) return false;
    const k = q.replace(/[\s　]+/g, '');
    return !k || (r.displayName + nameOf(r)).replace(/[\s　]+/g, '').includes(k);
  });
  const un = (d?.rows || []).filter((r) => !nameOf(r) && !r.blocked).length;

  const save = async (userId: string, name: string) => {
    setBusy(userId); setMsg(null);
    const r = h.live ? await postHoryu({ kind: 'link', userId, name }) : { ok: true };
    setBusy('');
    if (r.ok) { setLocal((x) => ({ ...x, [userId]: name })); setMsg({ ok: true, text: name ? `「${name}」に紐付けました` : '紐付けを外しました' }); }
    else setMsg({ ok: false, text: r.error || '保存できませんでした' });
  };
  const sync = async () => {
    setMsg(null);
    if (!h.live) { setMsg({ ok: true, text: '見本なので何もしていません' }); return; }
    const r = await postHoryu({ kind: 'link-sync' }) as { ok: boolean; error?: string; skipped?: string; dry?: boolean; targetCount?: number; linked?: number; unlinked?: number; failed?: number; link?: unknown[]; unlink?: unknown[] };
    if (!r.ok) { setMsg({ ok: false, text: r.error || '同期できませんでした' }); return; }
    if (r.skipped === 'disabled') setMsg({ ok: false, text: 'RICHMENU_SYNC が off なので何もしませんでした' });
    else if (r.dry) setMsg({ ok: true, text: `dry（LINE には触っていません）：対象 ${r.targetCount ?? 0}名・貼る予定 ${(r.link || []).length}名・外す予定 ${(r.unlink || []).length}名` });
    else setMsg({ ok: true, text: `同期しました：貼った ${r.linked ?? 0}名・外した ${r.unlinked ?? 0}名${r.failed ? `・失敗 ${r.failed}名` : ''}` });
    h.reload();
  };
  const sel = 'min-h-9 rounded-lg border border-field bg-surface px-2 text-[12.5px]';

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="LINEの紐付け管理" sub={d ? `全 ${d.rows.length}件・未紐付け ${un}件` : ''}>
        <HoldButton label="いま同期する" onDone={sync} title="稼働中メニューの同期を今すぐ（押したままにする）" />
      </PageTitle>
      <HoryuNote>紐付ける人はプロパーリストの名前から選ぶだけです。</HoryuNote>
      <LiveBanner state={h.state} error={h.error} onReload={h.reload} note="本物のデータです。紐付けの変更と同期は、ここから今の社内システムに保存されます" />
      {d?.note && <div className="text-[12px] text-muted">{d.note}</div>}
      {d && !d.menuKnown && <div className="text-[11.5px] text-faint">メニューの列は「?」になります（いま貼られているメニューの記録は、同期が有効になってから埋まります）。</div>}
      {msg && <div className="rounded-xl border px-4 py-2 text-[12.5px]" style={{ background: `var(--tone-${msg.ok ? 'ok' : 'bad'}-bg)`, color: `var(--tone-${msg.ok ? 'ok' : 'bad'}-fg)`, borderColor: `var(--tone-${msg.ok ? 'ok' : 'bad'}-bar)` }}>{msg.text}</div>}
      {d && <Panel title="連絡先" sub={`${rows.length}件を表示${d.hidden ? `（未経験でない人に紐付いた ${d.hidden}件は出していません）` : ''}`} right={<>
        <select aria-label="状態" value={f} onChange={(e) => setF(e.target.value as F)} className={sel}><option value="all">すべて</option><option value="unmatched">未紐付け</option><option value="linked">紐付け済み</option></select>
        <select aria-label="ブロック" value={b} onChange={(e) => setB(e.target.value as B)} className={sel}><option value="all">ブロックも</option><option value="no">ブロック以外</option><option value="yes">ブロック中だけ</option></select>
        <input aria-label="さがす" value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前でさがす" className={`${sel} w-[140px]`} />
      </>}>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-[12.5px]"><thead><tr className="text-left text-faint"><th className="py-1 pr-2">LINE の表示名</th><th className="pr-2">紐付ける人</th><th className="pr-2">状態</th><th className="pr-2">メニュー</th><th className="pr-2">参画決定</th><th className="pr-2">稼働中</th><th>最後のメッセージ</th></tr></thead>
          <tbody>{rows.slice(0, 300).map((r) => {
            const nm = nameOf(r);
            const opts = nm && !d.names.includes(nm) ? [nm, ...d.names] : d.names;
            return (
              <tr key={r.userId} className={`border-t border-line-soft ${!nm && !r.blocked ? 'bg-soft' : ''}`}>
                <td className="py-1.5 pr-2">{r.displayName || '（名前なし）'}</td>
                <td className="pr-2"><div className="flex items-center gap-1.5">
                  <select aria-label="紐付ける人" value={nm} disabled={busy === r.userId} onChange={(e) => save(r.userId, e.target.value)} className={`${sel} max-w-[150px]`}>
                    <option value="">（紐付けない）</option>{opts.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>{nm && <PersonName name={nm}>開く</PersonName>}</div></td>
                <td className="pr-2">{r.blocked ? <span className="chip" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>ブロック中</span> : nm ? <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>紐付け済み</span> : <span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>未紐付け</span>}</td>
                <td className="pr-2">{r.menu === 'kadou' ? '稼働中' : r.menu === 'sales' ? '営業中' : '?'}</td>
                <td className="pr-2">{r.decided == null ? '—' : r.decided ? '✓' : ''}</td>
                <td className="pr-2">{r.active == null ? '—' : r.active ? '✓' : ''}</td>
                <td className="num text-faint">{fmtDateTime(r.lastMessageAt)}</td>
              </tr>
            );
          })}</tbody></table></div>
        {rows.length > 300 && <div className="mt-1 text-[11.5px] text-faint">ほか {rows.length - 300}件（さがすで絞ってください）</div>}
        {!rows.length && <div className="py-3 text-center text-[12.5px] text-faint">当てはまる連絡先はありません</div>}
      </Panel>}
    </main>
  );
}
