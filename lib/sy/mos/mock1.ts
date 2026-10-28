import { type Bk, type Sh, F, G, near, norm, overlap, refKey, refOnly } from './check';
import type { RChart, RTable } from './read';
import { D, type MockSet } from './types';

// 模擬試験 1（5プロジェクト × 5問 ＝ 25問）。本番と同じく ヒントなし・保存したファイルだけで採点する。
//   分野の数: 1＝4問／2＝6問／3＝4問／4＝6問／5＝5問。365 でしか使えない関数（SORT・UNIQUE など）は 出さない
//   書き方の決まりは docs/kyouiku-mos.md。hint は 採点のあとに出す「正解の形」の説明
const rows = (a: number, z: number) => Array.from({ length: z - a + 1 }, (_, k) => a + k);
const onSheet = (ref: string, sheet: string) => norm(refKey(ref).replace(/!.*$/, '')) === norm(sheet);
// グラフは 番号ではなく「どの範囲を使っているか」で探す（グラフを足したり グラフ シートへ動かしたりしても 見失わない）
const chartOn = (b: Bk, sheet: string, range: string): RChart | null => b.charts.find((c) => c.series.some((s) => onSheet(s.val, sheet) && overlap(s.val, range))) || null;
const colIx = (t: RTable, name: string) => t.cols.findIndex((c) => norm(c.name) === norm(name));
const filterIs = (t: RTable | null, col: string, v: string) => { if (!t) return false; const f = t.filters.find((x) => x.col === colIx(t, col)); return !!f && ((f.values.length === 1 && norm(f.values[0]) === norm(v)) || (f.custom.length === 1 && f.custom[0].op === 'equal' && norm(f.custom[0].val) === norm(v))); };
// ヘッダー／フッターの 左（L）・中央（C）・右（R）の中身
const hfPart = (s: string, p: 'L' | 'C' | 'R') => { const m = new RegExp('&' + p + '((?:(?!&[LCR])[\\s\\S])*)').exec(/^&[LCR]/.test(s) ? s : '&C' + s); return m ? m[1] : ''; };
const total = (sh: Sh, cells: string[]) => cells.reduce((x, a) => x + (Number.isFinite(sh.n(a)) ? sh.n(a) : 0), 0);

export const MOCK1: MockSet = {
  id: 'mock1', title: '模擬試験 1',
  projects: [
    // ───────── プロジェクト 1 ─────────
    {
      id: 'p1', title: 'プロジェクト 1　研修の成績',
      intro: 'あなたは人事部の研修担当です。新人研修の成績一覧を、配属先の上長に見せられる形に整えます。',
      book: {
        sheets: [{
          name: '成績',
          grid: [
            ['新人研修　成績一覧'],
            [],
            ['社員番号', '氏名', '部署', 'Excel', 'ネットワーク', 'Linux', '合計', '平均', '判定'],
            [1001, '佐藤', '開発一課', 82, 74, 68, '=SUM(D4:F4)', null, null],
            [1002, '鈴木', '開発一課', 55, 62, 71, '=SUM(D5:F5)', null, null],
            [1003, '高橋', '開発二課', 91, 88, 84, '=SUM(D6:F6)', null, null],
            [1004, '田中', 'インフラ課', 64, 58, 49, '=SUM(D7:F7)', null, null],
            [1005, '伊藤', 'インフラ課', 77, 81, 90, '=SUM(D8:F8)', null, null],
            [1006, '渡辺', '開発二課', 48, 66, 59, '=SUM(D9:F9)', null, null],
            [1007, '山本', '運用課', 70, 73, 67, '=SUM(D10:F10)', null, null],
            [1008, '中村', '運用課', 88, 92, 79, '=SUM(D11:F11)', null, null],
            [1009, '小林', '開発一課', 59, 54, 63, '=SUM(D12:F12)', null, null],
            [1010, '加藤', 'インフラ課', 73, 69, 75, '=SUM(D13:F13)', null, null],
          ],
          widths: { A: 10, B: 10, C: 12, D: 9, E: 13, F: 9, G: 9, H: 9, I: 10 },
          styles: { A1: { b: true, sz: 14 }, 'A3:I3': { b: true, fill: 'DDEBF7', border: true, h: 'center' }, 'A4:I13': { border: true } },
        }],
      },
      tasks: [
        {
          ask: 'ワークシート「成績」のセル範囲 A1:I1 を結合し、文字列を中央に配置してください。', obj: 2, lesson: 'm2-2',
          checks: [
            { label: 'A1:I1 が 1つのセルに結合されている', hint: 'A1:I1 を選んで [ホーム] タブ → [配置] グループ → [セルを結合して中央揃え] を押します。結合する範囲は A1 から I1 までちょうどです。', test: (b) => b.sheet('成績').merged('A1:I1') },
            { label: '文字列が中央に配置されている', hint: '[セルを結合して中央揃え] を使うと、結合と中央揃えが一度に付きます。[横方向に結合] だと中央揃えになりません。', test: (b) => b.sheet('成績').st('A1').h === 'center' },
          ],
        },
        {
          ask: 'ワークシート「成績」のセル範囲 H4:H13 に、関数を使用して、「Excel」「ネットワーク」「Linux」の 3 科目の平均点を求めてください。', obj: 4, lesson: 'm4-2',
          checks: [
            { label: 'H4:H13 に AVERAGE 関数が入っている', hint: 'H4 に「=AVERAGE(D4:F4)」と入力し、H13 までコピーします。合計を 3 で割る式ではなく、AVERAGE 関数を使います。', test: (b) => { const sh = b.sheet('成績'); return rows(4, 13).every((r) => sh.uses('H' + r, 'AVERAGE')); } },
            { label: '3 科目（D〜F 列）の平均になっている', hint: '平均する範囲は D 列から F 列までです。G 列（合計）まで含めると 値が大きくなります。', test: (b) => { const sh = b.sheet('成績'); return rows(4, 13).every((r) => near(sh.n('H' + r), total(sh, [`D${r}`, `E${r}`, `F${r}`]) / 3, 0.01)); } },
          ],
        },
        {
          ask: 'ワークシート「成績」のセル範囲 I4:I13 に、関数を使用して、「合計」が 210 以上の場合は「合格」、そうでない場合は「再受講」と表示してください。', obj: 4, lesson: 'm4-2',
          checks: [
            { label: 'I4:I13 に IF 関数が入っている', hint: 'I4 に「=IF(G4>=210,"合格","再受講")」と入力し、I13 までコピーします。', test: (b) => { const sh = b.sheet('成績'); return rows(4, 13).every((r) => sh.uses('I' + r, 'IF')); } },
            { label: '210 以上が「合格」、それ以外が「再受講」になっている', hint: '「以上」は >= です。> だけだと ちょうど 210 点の人が「再受講」になってしまいます。', test: (b) => { const sh = b.sheet('成績'); return rows(4, 13).every((r) => sh.t('I' + r) === norm(total(sh, [`D${r}`, `E${r}`, `F${r}`]) >= 210 ? '合格' : '再受講')); } },
          ],
        },
        {
          ask: 'ワークシート「成績」のセル範囲 D4:F13 に、セルの値が 60 より小さい場合に「濃い赤の文字、明るい赤の背景」の書式を適用する条件付き書式を設定してください。', obj: 2, lesson: 'm2-4',
          checks: [
            { label: 'D4:F13 に「60 より小さい」の条件付き書式がある', hint: 'D4:F13 を選んで [ホーム] タブ → [条件付き書式] → [セルの強調表示ルール] → [指定の値より小さい] を開き、「60」と入れます。', test: (b) => b.sheet('成績').cf('D4:F13').some((c) => c.kind === 'cellIs' && c.operator === 'lessThan' && norm(c.formulas[0]) === '60' && overlap(c.ref, 'D4') && overlap(c.ref, 'F13')) },
          ],
        },
        {
          ask: 'ワークシート「成績」を、スクロールしても 1 行目から 3 行目までが常に表示されるように設定してください。', obj: 1, lesson: 'm1-4',
          checks: [
            { label: '3 行目までが固定されている', hint: 'セル A4 を選んでから [表示] タブ → [ウィンドウ枠の固定] → [ウィンドウ枠の固定] を押します。[先頭行の固定] だと 1 行目しか固定されません。', test: (b) => { const f = b.sheet('成績').raw.freeze; return !!f && f.rows === 3 && f.cols === 0; } },
          ],
        },
      ],
    },

    // ───────── プロジェクト 2 ─────────
    {
      id: 'p2', title: 'プロジェクト 2　機器の売上',
      intro: 'あなたは営業事務の担当です。9 月の機器の売上明細を集計し、会議で配る資料として印刷できるようにします。',
      book: {
        sheets: [{
          name: '売上明細',
          grid: [
            ['9月 売上明細'],
            [],
            ['伝票番号', '日付', '担当者', '商品', '数量', '単価', '金額'],
            ['U-0901', D(2026, 9, 1), '佐藤', 'ノートPC', 3, 128000, null],
            ['U-0902', D(2026, 9, 2), '鈴木', 'モニター', 6, 32800, null],
            ['U-0903', D(2026, 9, 4), '高橋', 'キーボード', 12, 6400, null],
            ['U-0904', D(2026, 9, 7), '佐藤', 'マウス', 20, 2900, null],
            ['U-0905', D(2026, 9, 8), '田中', 'ノートPC', 2, 128000, null],
            ['U-0906', D(2026, 9, 10), '鈴木', 'ドッキングステーション', 5, 18500, null],
            ['U-0907', D(2026, 9, 14), '高橋', 'モニター', 4, 32800, null],
            ['U-0908', D(2026, 9, 16), '佐藤', 'キーボード', 8, 6400, null],
            ['U-0909', D(2026, 9, 18), '田中', 'マウス', 15, 2900, null],
            ['U-0910', D(2026, 9, 24), '鈴木', 'ノートPC', 1, 128000, null],
            ['U-0911', D(2026, 9, 25), '佐藤', 'モニター', 2, 32800, null],
            ['U-0912', D(2026, 9, 29), '高橋', 'ドッキングステーション', 3, 18500, null],
          ],
          widths: { A: 11, B: 12, C: 10, D: 24, E: 8, F: 11, G: 13 },
          styles: { A1: { b: true, sz: 14 }, 'B4:B15': { fmt: 'yyyy/m/d' }, 'F4:G15': { fmt: '#,##0' } },
          table: { name: '売上明細表', ref: 'A3:G15', style: 'TableStyleMedium2' },
        }],
      },
      tasks: [
        {
          ask: 'ワークシート「売上明細」のテーブルの「金額」列に、「数量」に「単価」を掛けた金額を求める数式を入力してください。', obj: 4, lesson: 'm4-1',
          checks: [
            { label: '「金額」列のすべての行に数式が入っている', hint: 'G4 に「=」と打ち、同じ行の「数量」のセル、「*」、「単価」のセルの順にクリックして Enter を押します（=[@数量]*[@単価]）。テーブルなので 下の行まで自動で入ります。', test: (b) => { const sh = b.sheet('売上明細'); return rows(4, 15).every((r) => !!sh.f('G' + r)); } },
            { label: '金額が 数量 × 単価 になっている', hint: '掛けるのは 同じ行の「数量」と「単価」です。値を直接打つのではなく 数式で求めます。', test: (b) => { const sh = b.sheet('売上明細'); return rows(4, 15).every((r) => near(sh.n('G' + r), sh.n('E' + r) * sh.n('F' + r), 0.5)); } },
          ],
        },
        {
          ask: 'ワークシート「売上明細」のテーブルに集計行を追加し、「数量」列の平均が表示されるようにしてください。', obj: 3, lesson: 'm3-2',
          checks: [
            { label: 'テーブルに集計行が表示されている', hint: 'テーブルの中をクリックして [テーブル デザイン] タブ → [テーブル スタイルのオプション] グループ → [集計行] にチェックを入れます。', test: (b) => !!b.sheet('売上明細').table()?.totals },
            { label: '「数量」列の集計が 平均 になっている', hint: '集計行の「数量」のセルをクリックし、右に出る ▼ から [平均] を選びます。', test: (b) => { const t = b.sheet('売上明細').table(); return !!t && t.cols[colIx(t, '数量')]?.total === 'average'; } },
          ],
        },
        {
          ask: 'ワークシート「売上明細」のテーブルに、「担当者」が「佐藤」のレコードだけが表示されるようにフィルターを設定してください。', obj: 3, lesson: 'm3-3',
          checks: [
            { label: '「担当者」列が「佐藤」だけに絞り込まれている', hint: '見出し「担当者」の ▼ を押し、[(すべて選択)] のチェックを外してから「佐藤」だけにチェックを入れて [OK] を押します。', test: (b) => filterIs(b.sheet('売上明細').table(), '担当者', '佐藤') },
          ],
        },
        {
          ask: 'ワークシート「売上明細」のテーブルに、テーブル スタイル「緑, テーブル スタイル (中間) 7」を適用してください。', obj: 3, lesson: 'm3-1',
          checks: [
            { label: 'テーブル スタイルが「緑, テーブル スタイル (中間) 7」になっている', hint: 'テーブルの中をクリックして [テーブル デザイン] タブ → [テーブル スタイル] の一覧を開き、「中間」の 1 行目の右はし（緑）を選びます。マウスを乗せると スタイルの名前が出ます。', test: (b) => b.sheet('売上明細').table()?.style === 'TableStyleMedium7' },
          ],
        },
        {
          ask: 'ワークシート「売上明細」の印刷の向きを横に変更し、すべての列が 1 ページの幅に収まるように設定してください。', obj: 1, lesson: 'm1-5',
          checks: [
            { label: '印刷の向きが 横 になっている', hint: '[ページ レイアウト] タブ → [ページ設定] グループ → [印刷の向き] → [横] を選びます。', test: (b) => b.sheet('売上明細').raw.page.orientation === 'landscape' },
            { label: 'すべての列が 1 ページの幅に収まる設定になっている', hint: '[ページ レイアウト] タブ → [拡大縮小印刷] グループの [横] を「1 ページ」にします（[ファイル] → [印刷] の [すべての列を 1 ページに印刷] でも同じです）。', test: (b) => { const p = b.sheet('売上明細').raw.page; return p.fitToPage && p.fitW === 1; } },
          ],
        },
      ],
    },

    // ───────── プロジェクト 3 ─────────
    {
      id: 'p3', title: 'プロジェクト 3　経費の集計',
      intro: 'あなたは経理部の担当です。第 1 四半期の費目別の経費をまとめ、グラフで推移が分かる資料を作ります。',
      book: {
        sheets: [{
          name: '経費',
          grid: [
            ['第1四半期　費目別経費（円）'],
            [],
            ['費目', '4月', '5月', '6月', '合計', '推移'],
            ['交通費', 48200, 51300, 46800, '=SUM(B4:D4)', null],
            ['通信費', 23500, 23500, 24100, '=SUM(B5:D5)', null],
            ['消耗品費', 15800, 9200, 18400, '=SUM(B6:D6)', null],
            ['会議費', 12000, 8500, 21000, '=SUM(B7:D7)', null],
            ['研修費', 30000, 45000, 15000, '=SUM(B8:D8)', null],
            ['合計', '=SUM(B4:B8)', '=SUM(C4:C8)', '=SUM(D4:D8)', '=SUM(E4:E8)', null],
            ['最大', null, null, null, null, null],
          ],
          widths: { A: 12, B: 11, C: 11, D: 11, E: 12, F: 14 },
          styles: { A1: { b: true, sz: 14 }, 'A3:F3': { b: true, fill: 'E2EFDA', border: true, h: 'center' }, 'A4:F10': { border: true }, 'B4:E10': { fmt: '#,##0', border: true } },
          charts: [{ type: 'col', cats: '経費!$A$4:$A$8', series: [{ name: '経費!$B$3', vals: '経費!$B$4:$B$8' }, { name: '経費!$C$3', vals: '経費!$C$4:$C$8' }], anchor: [8, 3, 15, 17], legend: 'r' }],
        }],
      },
      tasks: [
        {
          ask: 'ワークシート「経費」の縦棒グラフに、データ系列「6月」を追加してください。', obj: 5, lesson: 'm5-2',
          checks: [
            { label: 'グラフの系列が 4月・5月・6月 の 3 つになっている', hint: 'グラフをクリックして [グラフのデザイン] タブ → [データの選択] を開き、グラフ データの範囲を A3:D8 に広げます（グラフを選ぶと出る 青い枠を D 列までドラッグしても同じです）。', test: (b) => chartOn(b, '経費', 'B4:D8')?.series.length === 3 },
            { label: '「6月」の系列が D4:D8 を使っている', hint: '追加する系列の値は D4:D8（6月の 5 つの費目）です。9 行目の「合計」は含めません。', test: (b) => !!chartOn(b, '経費', 'B4:D8')?.series.some((s) => refOnly(s.val) === 'D4:D8') },
          ],
        },
        {
          ask: 'ワークシート「経費」の縦棒グラフに、グラフ タイトル「費目別経費」を表示してください。', obj: 5, lesson: 'm5-2',
          checks: [
            { label: 'グラフ タイトルが「費目別経費」になっている', hint: 'グラフをクリックして [グラフのデザイン] タブ → [グラフ要素を追加] → [グラフ タイトル] → [グラフの上] を選び、出てきたタイトルの文字を「費目別経費」に打ち替えます。', test: (b) => norm(chartOn(b, '経費', 'B4:D8')?.title) === norm('費目別経費') },
          ],
        },
        {
          ask: 'ワークシート「経費」の縦棒グラフの凡例を、グラフの下に表示してください。', obj: 5, lesson: 'm5-2',
          checks: [
            { label: '凡例が グラフの下 にある', hint: 'グラフをクリックして [グラフのデザイン] タブ → [グラフ要素を追加] → [凡例] → [下] を選びます。', test: (b) => { const c = chartOn(b, '経費', 'B4:D8'); return !!c && c.hasLegend && c.legend === 'b'; } },
          ],
        },
        {
          ask: 'ワークシート「経費」のセル範囲 F4:F8 に、4 月から 6 月までの経費の推移を表す折れ線スパークラインを挿入してください。', obj: 2, lesson: 'm2-4',
          checks: [
            { label: 'F4:F8 のすべてのセルに 折れ線スパークラインがある', hint: 'F4:F8 を選んで [挿入] タブ → [スパークライン] グループ → [折れ線] を押し、データ範囲に「B4:D8」を指定します。', test: (b) => { const sh = b.sheet('経費'); return rows(4, 8).every((r) => sh.sparks('F' + r).some((s) => s.type === 'line')); } },
            { label: 'データ範囲が 4月〜6月（B〜D 列）になっている', hint: 'データ範囲は B4:D8 です。E 列の「合計」まで入れると 線の形が変わってしまいます。', test: (b) => b.sheet('経費').sparks('F4').some((s) => refOnly(s.data) === 'B4:D4') },
          ],
        },
        {
          ask: 'ワークシート「経費」のセル B10 に、関数を使用して、4 月の経費（セル範囲 B4:B8）の最大値を求めてください。', obj: 4, lesson: 'm4-2',
          checks: [
            { label: 'B10 に MAX 関数が入っている', hint: 'B10 に「=MAX(B4:B8)」と入力します。', test: (b) => b.sheet('経費').uses('B10', 'MAX') },
            { label: '4 月の 5 つの費目の最大値になっている', hint: '範囲は B4:B8 です。9 行目の「合計」まで含めると 合計の値が最大になってしまいます。', test: (b) => { const sh = b.sheet('経費'); return near(sh.n('B10'), Math.max(...rows(4, 8).map((r) => sh.n('B' + r))), 0.5); } },
          ],
        },
      ],
    },

    // ───────── プロジェクト 4 ─────────
    {
      id: 'p4', title: 'プロジェクト 4　社員名簿',
      intro: 'あなたは総務部の担当です。社員名簿に氏名と拠点の列を作り、10 月の異動の一覧を扱いやすい形にします。',
      book: {
        sheets: [
          {
            name: '名簿',
            grid: [
              ['社員名簿'],
              [],
              ['社員コード', '姓', '名', '氏名', '拠点コード', '入社日', '部署'],
              ['TK-1024', '佐藤', '健', null, null, D(2021, 4, 1), '開発部'],
              ['OS-1031', '鈴木', '美咲', null, null, D(2021, 10, 1), '営業部'],
              ['TK-1058', '高橋', '翔', null, null, D(2022, 4, 1), '開発部'],
              ['NG-1066', '田中', '陽子', null, null, D(2022, 4, 1), '総務部'],
              ['FK-1072', '伊藤', '大輔', null, null, D(2023, 1, 16), '開発部'],
              ['TK-1090', '渡辺', '彩', null, null, D(2023, 4, 3), '営業部'],
              ['OS-1104', '山本', '拓也', null, null, D(2024, 4, 1), '開発部'],
              ['NG-1117', '中村', '愛', null, null, D(2024, 7, 1), '経理部'],
              ['TK-1123', '小林', '誠', null, null, D(2025, 4, 1), '開発部'],
              ['FK-1136', '加藤', '優', null, null, D(2026, 4, 1), '営業部'],
            ],
            widths: { A: 13, B: 8, C: 8, D: 14, E: 12, F: 12, G: 10 },
            styles: { A1: { b: true, sz: 14 }, 'A3:G3': { b: true, fill: 'FFF2CC', border: true, h: 'center' }, 'A4:G13': { border: true }, 'F4:F13': { fmt: 'yyyy/m/d', border: true } },
          },
          {
            name: '異動一覧',
            grid: [
              ['10月 異動一覧'],
              [],
              ['発令日', '氏名', '異動前', '異動後'],
              [D(2026, 10, 1), '鈴木 美咲', '営業部', '企画部'],
              [D(2026, 10, 1), '伊藤 大輔', '開発部', '品質管理部'],
              [D(2026, 10, 1), '中村 愛', '経理部', '総務部'],
              [D(2026, 10, 15), '高橋 翔', '開発部', '営業部'],
              [D(2026, 10, 15), '加藤 優', '営業部', '開発部'],
              [D(2026, 10, 15), '田中 陽子', '総務部', '人事部'],
              [D(2026, 10, 20), '山本 拓也', '開発部', '企画部'],
            ],
            widths: { A: 12, B: 14, C: 12, D: 12 },
            styles: { A1: { b: true, sz: 14 }, 'A4:A10': { fmt: 'yyyy/m/d' } },
          },
        ],
      },
      tasks: [
        {
          ask: 'ワークシート「名簿」のセル範囲 D4:D13 に、CONCAT 関数を使用して、「姓」と「名」をこの順に結合した氏名を表示してください。', obj: 4, lesson: 'm4-3',
          checks: [
            { label: 'D4:D13 に CONCAT 関数が入っている', hint: 'D4 に「=CONCAT(B4,C4)」と入力し、D13 までコピーします（Excel 2016 では CONCATENATE 関数を使います）。', test: (b) => { const sh = b.sheet('名簿'); return rows(4, 13).every((r) => sh.uses('D' + r, 'CONCAT') || sh.uses('D' + r, 'CONCATENATE')); } },
            { label: '「姓」「名」の順に結合されている', hint: '引数の順番は 姓（B 列）、名（C 列）です。逆にすると「健佐藤」になります。', test: (b) => { const sh = b.sheet('名簿'); return rows(4, 13).every((r) => sh.t('D' + r) !== '' && sh.t('D' + r) === sh.t('B' + r) + sh.t('C' + r)); } },
          ],
        },
        {
          ask: 'ワークシート「名簿」のセル範囲 E4:E13 に、関数を使用して、「社員コード」の左から 2 文字を取り出して表示してください。', obj: 4, lesson: 'm4-3',
          checks: [
            { label: 'E4:E13 に LEFT 関数が入っている', hint: 'E4 に「=LEFT(A4,2)」と入力し、E13 までコピーします。', test: (b) => { const sh = b.sheet('名簿'); return rows(4, 13).every((r) => sh.uses('E' + r, 'LEFT')); } },
            { label: '社員コードの先頭 2 文字が表示されている', hint: '2 つ目の引数（文字数）は 2 です。「TK-1024」なら「TK」になります。', test: (b) => { const sh = b.sheet('名簿'); return rows(4, 13).every((r) => sh.t('E' + r) !== '' && sh.t('E' + r) === sh.t('A' + r).slice(0, 2)); } },
          ],
        },
        {
          ask: 'ワークシート「異動一覧」のセル範囲 A3:D10 をテーブルに変換してください。テーブルには見出しがあります。', obj: 3, lesson: 'm3-1',
          checks: [
            { label: 'A3:D10 がテーブルになっている', hint: 'A3:D10 の中をクリックして [挿入] タブ → [テーブル] を押し、範囲が A3:D10・[先頭行をテーブルの見出しとして使用する] にチェック、を確かめて [OK] を押します。', test: (b) => { const t = b.sheet('異動一覧').tableAt('A3:D10'); return !!t && refOnly(t.ref) === 'A3:D10' && t.header; } },
            { label: '3 行目が そのまま見出しになっている', hint: '[先頭行をテーブルの見出しとして使用する] のチェックを外すと、「列1」「列2」…という見出しの行が上に足されてしまいます。', test: (b) => { const sh = b.sheet('異動一覧'); return sh.t('A3') === norm('発令日') && sh.t('D3') === norm('異動後'); } },
          ],
        },
        {
          ask: 'ワークシート「名簿」のセル範囲 F4:F13 に「入社日」という名前を付けてください。', obj: 2, lesson: 'm2-3',
          checks: [
            { label: '名前「入社日」が 名簿!F4:F13 を指している', hint: 'F4:F13 を選び、左上の名前ボックスに「入社日」と打って Enter を押します。見出しの F3 は含めません。', test: (b) => b.nameIs('入社日', '名簿!F4:F13') },
          ],
        },
        {
          ask: 'ワークシート「名簿」のセル A15 に、「https://example.com/kitei」へのハイパーリンクを挿入してください。表示する文字列は「就業規則」とします。', obj: 1, lesson: 'm1-2',
          checks: [
            { label: 'A15 に https://example.com/kitei へのリンクがある', hint: 'A15 を選んで [挿入] タブ → [リンク] を開き、[アドレス] に「https://example.com/kitei」と入れます。', test: (b) => norm(b.sheet('名簿').link('A15')?.target).includes('EXAMPLE.COM/KITEI') },
            { label: '表示する文字列が「就業規則」になっている', hint: '[ハイパーリンクの挿入] の いちばん上の [表示文字列] に「就業規則」と入れます。', test: (b) => b.sheet('名簿').t('A15') === norm('就業規則') },
          ],
        },
      ],
    },

    // ───────── プロジェクト 5 ─────────
    {
      id: 'p5', title: 'プロジェクト 5　備品の在庫',
      intro: 'あなたは情報システム部の担当です。備品の在庫表とグラフを整え、不足している品の発注書を準備します。',
      book: {
        sheets: [
          {
            name: '備品',
            grid: [
              ['備品在庫表'],
              [],
              ['品名', '分類', '在庫数', '単価', '在庫金額'],
              ['LANケーブル', 'ネットワーク機器', 42, 680, '=C4*D4'],
              ['スイッチングハブ', 'ネットワーク機器', 6, 12800, '=C5*D5'],
              ['USBメモリ', 'PC周辺', 25, 1480, '=C6*D6'],
              ['外付けSSD', 'PC周辺', 9, 11800, '=C7*D7'],
              ['ヘッドセット', 'PC周辺', 14, 4200, '=C8*D8'],
              ['コピー用紙', '事務用品', 30, 2150, '=C9*D9'],
              ['トナー', '事務用品', 7, 16500, '=C10*D10'],
              ['ホワイトボード', '什器', 3, 24800, '=C11*D11'],
            ],
            widths: { A: 18, B: 18, C: 9, D: 10, E: 12 },
            styles: { A1: { b: true, sz: 14 }, 'A3:E3': { b: true, fill: 'DDEBF7', border: true, h: 'center' }, 'A4:E11': { border: true } },
            charts: [{ type: 'bar', title: '在庫数', cats: '備品!$A$4:$A$11', series: [{ name: '備品!$C$3', vals: '備品!$C$4:$C$11' }], anchor: [7, 3, 14, 18], legend: 'none' }],
          },
          {
            name: '分類別',
            grid: [
              ['分類別 在庫金額'],
              [],
              ['分類', '在庫金額'],
              ['ネットワーク機器', 105360],
              ['PC周辺', 202000],
              ['事務用品', 180000],
              ['什器', 74400],
              ['ソフトウェア', 96000],
            ],
            widths: { A: 18, B: 12 },
            styles: { A1: { b: true, sz: 14 }, 'A3:B3': { b: true, fill: 'DDEBF7', border: true, h: 'center' }, 'A4:A8': { border: true }, 'B4:B8': { fmt: '#,##0', border: true } },
          },
          {
            name: '発注',
            grid: [
              ['発注書'],
              [],
              ['発注番号', '品名', '数量', '納期'],
              ['H-001', 'スイッチングハブ', 4, D(2026, 10, 20)],
              [null, '外付けSSD', 6, D(2026, 10, 20)],
              [null, 'トナー', 5, D(2026, 10, 22)],
              [null, 'ホワイトボード', 2, D(2026, 10, 27)],
              [null, 'LANケーブル', 30, D(2026, 10, 27)],
              [null, 'ヘッドセット', 10, D(2026, 10, 29)],
              [null, 'コピー用紙', 20, D(2026, 10, 29)],
              [null, 'USBメモリ', 15, D(2026, 10, 30)],
            ],
            widths: { A: 11, B: 18, C: 8, D: 12 },
            styles: { A1: { b: true, sz: 14 }, 'A3:D3': { b: true, fill: 'FCE4D6', border: true, h: 'center' }, 'A4:C11': { border: true }, 'D4:D11': { fmt: 'yyyy/m/d', border: true } },
          },
        ],
      },
      tasks: [
        {
          ask: 'ワークシート「分類別」のセル範囲 A3:B8 をもとに、円グラフを作成してください。グラフはワークシート「分類別」に配置します。', obj: 5, lesson: 'm5-1',
          checks: [
            { label: '分類別の在庫金額（B4:B8）を使った 円グラフがある', hint: 'ワークシート「分類別」の A3:B8 を選んで [挿入] タブ → [グラフ] グループ → [円またはドーナツ グラフの挿入] → [円] を選びます。', test: (b) => b.charts.some((c) => G.is(c, 'pie') && c.series.some((s) => onSheet(s.val, '分類別') && refOnly(s.val) === 'B4:B8')) },
          ],
        },
        {
          ask: 'ワークシート「備品」の横棒グラフに、代替テキスト「備品別の在庫数」を追加してください。', obj: 5, lesson: 'm5-3',
          checks: [
            { label: 'グラフの代替テキストが「備品別の在庫数」になっている', hint: 'グラフの外枠を右クリック → [代替テキストを表示]（古い版は [グラフ エリアの書式設定] → [サイズとプロパティ] → [代替テキスト] の [説明]）を開き、「備品別の在庫数」と入力します。', test: (b) => norm(chartOn(b, '備品', 'C4:C11')?.alt).includes(norm('備品別の在庫数')) },
          ],
        },
        {
          ask: 'ワークシート「備品」のセル範囲 D4:E11 に、桁区切りスタイルを適用してください。', obj: 2, lesson: 'm2-2',
          checks: [
            { label: 'D4:E11 が 桁区切り（1,234 の形）になっている', hint: 'D4:E11 を選んで [ホーム] タブ → [数値] グループ → [桁区切りスタイル]（, のボタン）を押します。', test: (b) => { const sh = b.sheet('備品'); return sh.all('D4:E11', (a) => F.comma(sh.st(a))); } },
          ],
        },
        {
          ask: 'ワークシート「発注」のセル A4 をもとに、オートフィルを使用して、セル範囲 A5:A11 に連続した発注番号（H-002 から H-008 まで）を入力してください。', obj: 2, lesson: 'm2-1',
          checks: [
            { label: 'A5:A11 に H-002 〜 H-008 が入っている', hint: 'A4 を選び、セルの右下の ■（フィル ハンドル）を A11 までドラッグします。番号が増えずに全部「H-001」になった時は、出てきた [オートフィル オプション] で [連続データ] を選びます。', test: (b) => { const sh = b.sheet('発注'); return sh.t('A4') === 'H-001' && rows(5, 11).every((r) => sh.t('A' + r) === 'H-00' + (r - 3)); } },
          ],
        },
        {
          ask: 'ワークシート「発注」のフッターの中央に、ページ番号を追加してください。', obj: 1, lesson: 'm1-3',
          checks: [
            { label: 'フッターの中央に ページ番号がある', hint: '[挿入] タブ → [テキスト] グループ → [ヘッダーとフッター] を押し、フッターの中央の枠をクリックして [ヘッダーとフッター] タブ → [ページ番号] を押します。枠に「&[ページ番号]」と入れば できています。', test: (b) => hfPart(b.sheet('発注').raw.footer, 'C').includes('&P') },
          ],
        },
      ],
    },
  ],
};
