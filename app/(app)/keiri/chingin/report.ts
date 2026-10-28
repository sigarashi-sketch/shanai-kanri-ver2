import type { LiveArariRow } from '@/lib/live/chingin';

// 想定粗利の PDF レポート（10-28 shoya「想定粗利の PDF レポート・赤字社員の情報も・所属別はいらない」）。
//   画面の表と同じ行・同じ金額（交通費を申請で置きかえた後・法定福利 19% 固定の後）をそのまま並べる＝ここで計算し直さない
//   新しい窓に A4 横の紙面を書いて、ブラウザの印刷（PDF に保存）を開く
const e = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const n = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(Math.round(v)).toLocaleString('ja-JP')}`;
const neg = (v: number, s = n(v)) => (v < 0 ? `<span class="neg">${s}</span>` : s);
const pct = (r: number | null) => (r == null ? '-' : `${(r * 100).toFixed(1)}%`);
const LOW = 0.1;   // 低粗利＝粗利率 10% 未満（赤字は除く）

type Row = LiveArariRow;
const sumOf = (rs: Row[], f: (r: Row) => number) => rs.reduce((s, r) => s + f(r), 0);
const fareKind = (r: Row) => (r.fareManual ? '手で直した値' : r.fareEki ? '駅から' : r.fareLabel.startsWith('仮') ? '仮 25,000円' : '申請');

export function arariReportHtml({ rows, ym, filter }: { rows: Row[]; ym: string; filter: string }): string {
  const ymJa = `${ym.slice(0, 4)}年${Number(ym.slice(5, 7))}月`;
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const S = sumOf(rows, (r) => r.sales), W = sumOf(rows, (r) => r.salary), F = sumOf(rows, (r) => r.fare), WF = sumOf(rows, (r) => r.welfare), G = sumOf(rows, (r) => r.gross);
  const aka = rows.filter((r) => r.gross < 0).sort((a, b) => a.gross - b.gross);
  const AK = sumOf(aka, (r) => r.gross);
  const low = rows.filter((r) => r.gross >= 0 && r.rate < LOW).sort((a, b) => a.rate - b.rate);
  // 交通費を引く前でも赤字の人（交通費のせいだけで赤字になっている人と分ける）
  const akaPre = aka.filter((r) => r.gross + r.fare < 0);
  const kinds = ['駅から', '申請', '手で直した値', '仮 25,000円'].map((k) => { const rs = rows.filter((r) => fareKind(r) === k); return { k, n: rs.length, y: sumOf(rs, (r) => r.fare) }; });
  const temp = rows.filter((r) => r.temp);

  const byCo = new Map<string, Row[]>();
  for (const r of rows) byCo.set(r.company, [...(byCo.get(r.company) || []), r]);
  const coAka = [...byCo].map(([k, rs]) => { const a = rs.filter((r) => r.gross < 0); return { k, n: rs.length, an: a.length, ag: sumOf(a, (r) => r.gross), s: sumOf(rs, (r) => r.sales), g: sumOf(rs, (r) => r.gross) }; })
    .filter((x) => x.an > 0).sort((a, b) => a.ag - b.ag);

  const card = (l: string, v: string, sub = '', bad = false) => `<div class="card${bad ? ' bad' : ''}"><div>${l}</div><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const kin = (r: Row) => (r.kintai?.workDays != null ? `${r.kintai.workDays}日` : '-') + (r.kintai?.hours != null ? `・${Math.round(r.kintai.hours * 10) / 10}h` : '');
  const table = (rs: Row[], kubun = false) => `<table class="sm"><thead><tr>${kubun ? '<th>区分</th>' : ''}<th>社員</th><th>取引先</th><th class="r">勤怠</th><th class="r">売上（税抜）</th><th class="r">給与</th><th class="r">交通費</th><th>交通費の出どころ</th><th class="r">法定福利</th><th class="r">粗利</th><th class="r">粗利率</th><th>備考</th></tr></thead><tbody>${rs.map((r) => `<tr>${kubun ? (r.gross < 0 ? '<td class="neg">赤字</td>' : '<td class="warn">低粗利</td>') : ''}<td class="nw">${e(r.name)}</td><td class="co">${e(r.company)}</td><td class="r">${kin(r)}</td><td class="r">${n(r.sales)}</td><td class="r">${n(r.salary)}</td><td class="r">${n(r.fare)}</td><td class="src">${e(r.fareLabel)}</td><td class="r">${n(r.welfare)}</td><td class="r">${neg(r.gross)}</td><td class="r">${neg(r.gross, pct(r.sales ? r.rate : null))}</td><td class="note">${e([r.temp ? '仮の値あり' : '', r.salaryLabel !== 'freee 勤怠から' ? `給与：${r.salaryLabel}` : '', ...r.warn].filter(Boolean).join('・'))}</td></tr>`).join('')}</tbody></table>`;

  const body = `
<header><h1>想定賃金・粗利レポート ${ymJa}</h1><div class="meta">作成 ${now}</div></header>
<p class="cond">想定粗利の画面（請求書締め）と同じ金額。粗利＝売上（格納した請求書・税抜）− 給与（freee 勤怠の想定賃金）− 交通費 − 法定福利（額面の19%・固定）。交通費は 手で直した値 ＞ 駅から（最寄り駅→現場の駅の片道×往復×出勤日数）＞ 申請（いけどん・マネフォ）＞ 仮 25,000円。${filter ? `絞り込み：${e(filter)}` : '全員'}</p>
<div class="cards">
${card('人数', `${rows.length}名`)}${card('売上（税抜）', `${n(S)}円`)}${card('給与', `${n(W)}円`)}${card('交通費', `${n(F)}円`)}${card('法定福利', `${n(WF)}円`)}${card('粗利', `${n(G)}円`)}${card('粗利率', pct(S ? G / S : null))}${card('赤字の人', `${aka.length}名`, `${n(AK)}円`, true)}
</div>
<h2>交通費の出どころ<span>仮の値が残る人 ${temp.length}名</span></h2>
<table class="half"><thead><tr><th>出どころ</th><th class="r">人数</th><th class="r">交通費</th></tr></thead><tbody>${kinds.map((x) => `<tr><td>${x.k}</td><td class="r">${x.n}名</td><td class="r">${n(x.y)}</td></tr>`).join('')}</tbody></table>

<section class="pb"><h2>赤字社員のまとめ<span>粗利がマイナスの人</span></h2>
<div class="cards five">
${card('赤字の人数', `${aka.length}名`, `全体 ${rows.length}名の ${rows.length ? Math.round((aka.length / rows.length) * 100) : 0}%`, true)}${card('赤字の合計', `${n(AK)}円`, aka.length ? `1人あたり ${n(AK / aka.length)}円` : '', true)}${card('交通費を引く前でも赤字', `${akaPre.length}名`, `${n(sumOf(akaPre, (r) => r.gross + r.fare))}円（交通費前）`)}${card('交通費を引いて赤字', `${aka.length - akaPre.length}名`)}${card('赤字を除いた粗利', `${n(G - AK)}円`, `粗利率 ${pct(S ? (G - AK) / S : null)}`)}
</div>
<h3>取引先別の赤字<span>赤字の合計が大きい順・赤字のいる取引先だけ</span></h3>
<table class="half"><thead><tr><th>取引先</th><th class="r">人数</th><th class="r">赤字の人数</th><th class="r">赤字の合計</th><th class="r">売上（税抜）</th><th class="r">粗利（全体）</th><th class="r">粗利率</th></tr></thead><tbody>${coAka.map((x) => `<tr><td>${e(x.k)}</td><td class="r">${x.n}名</td><td class="r">${x.an}名</td><td class="r">${neg(x.ag)}</td><td class="r">${n(x.s)}</td><td class="r">${neg(x.g)}</td><td class="r">${neg(x.g, pct(x.s ? x.g / x.s : null))}</td></tr>`).join('') || '<tr><td colspan="7">赤字の人はいません</td></tr>'}</tbody></table>
</section>
<section class="pb"><h2>赤字社員の一覧<span>${aka.length}名・粗利の低い順</span></h2>${table(aka)}</section>
<section><h2>低粗利の人<span>粗利率 10%未満（赤字を除く）${low.length}名・粗利率の低い順</span></h2>${table(low, true)}</section>
<section class="pb"><h2>全員の一覧<span>${rows.length}名・粗利の高い順・金額は円</span></h2>${table([...rows].sort((a, b) => b.gross - a.gross))}</section>
<p class="foot">法定福利は額面の19%で固定の概算です。給与・社会保険料・税の扱いの最終判断は社労士・税理士に確認してください。社外秘</p>`;

  const css = `
@page { size: A4 landscape; margin: 10mm; }
body { font-family: Inter, "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif; color:#1f2937; font-size:9.5px; margin:0; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
header { display:flex; justify-content:space-between; align-items:baseline; } h1 { font-size:20px; margin:0 0 4px; }
.meta,.cond,.foot { color:#6b7280; font-size:9px; } .cond { margin:0 0 8px; }
h2 { font-size:14px; margin:14px 0 6px; } h3 { font-size:12px; margin:12px 0 5px; }
h2 span,h3 span { font-size:9.5px; color:#6b7280; font-weight:400; margin-left:10px; }
.cards { display:grid; grid-template-columns:repeat(8,1fr); gap:6px; margin:6px 0; } .cards.five { grid-template-columns:repeat(5,1fr); }
.card { background:#f1f4f8; border-radius:8px; padding:7px 9px; } .card div { color:#6b7280; font-size:9px; } .card b { font-size:14px; display:block; margin-top:2px; } .card small { color:#6b7280; font-size:8.5px; }
.card.bad b { color:#c62828; }
table { width:100%; border-collapse:collapse; } table.half { width:auto; min-width:50%; } thead { display:table-header-group; } tr { break-inside:avoid; }
th { background:#eef2f7; text-align:left; padding:4px 5px; border-bottom:1px solid #b9c3d1; white-space:nowrap; } td { padding:3px 5px; border-bottom:1px solid #d8dee8; }
tbody tr:nth-child(even) td { background:#f8fafc; } table.sm { font-size:8.5px; }
.r { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; } .nw { white-space:nowrap; }
.co { max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .src { color:#6b7280; font-size:8px; max-width:170px; } .note { color:#6b7280; font-size:8px; max-width:200px; }
.neg { color:#c62828; } .warn { color:#c2660a; } .pb { break-before:page; }
@media screen { body { padding:16px; max-width:1200px; margin:0 auto; } }`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>想定賃金・粗利レポート ${ymJa}</title><style>${css}</style></head><body>${body}<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
}

/** 新しい窓にレポートを出して印刷を開く（PDF に保存はブラウザの印刷から） */
export function openArariReport(args: Parameters<typeof arariReportHtml>[0]): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open(); w.document.write(arariReportHtml(args)); w.document.close();
  return true;
}
