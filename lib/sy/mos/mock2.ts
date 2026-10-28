import { type Bk, type Sh, F, G, near, norm, overlap, refKey } from './check';
import type { RChart } from './read';
import { D, type MockSet } from './types';

// 模擬試験 2（5プロジェクト × 5問 ＝ 25問）。模擬試験 1 とは 題材も 聞く所も変えてある。
//   分野の数: 1＝4問／2＝6問／3＝4問／4＝6問／5＝5問。365 でしか使えない関数（SORT・UNIQUE など）は 出していない
//   書き方の決まりは docs/kyouiku-mos.md。hint は 採点のあとに出す「正解の形」の説明
const rows = (a: number, z: number) => Array.from({ length: z - a + 1 }, (_, k) => a + k);
const onSheet = (ref: string, sheet: string) => norm(refKey(ref).replace(/!.*$/, '')) === norm(sheet);
// グラフは 番号ではなく「どの範囲を使っているか」で探す（グラフを足したり グラフ シートへ動かしたりしても 見失わない）
const chartOn = (b: Bk, sheet: string, range: string): RChart | null => b.charts.find((c) => c.series.some((s) => onSheet(s.val, sheet) && overlap(s.val, range))) || null;
const total = (sh: Sh, cells: string[]) => cells.reduce((x, a) => x + (Number.isFinite(sh.n(a)) ? sh.n(a) : 0), 0);
// 見出しの文字から 列の記号を探す（列を消したり足したりしても 見失わない）
const colOf = (sh: Sh, row: number, head: string) => 'ABCDEFGHIJ'.split('').find((c) => sh.t(c + row) === norm(head)) || '';

export const MOCK2: MockSet = {
  id: 'mock2', title: '模擬試験 2',
  projects: [
    // ───────── プロジェクト 1 ─────────
    {
      id: 'p1', title: 'プロジェクト 1　アルバイトの勤務時間',
      intro: 'あなたは総務部で、アルバイト スタッフの勤務時間を管理しています。10 月の勤務時間から支給額を計算し、表を見やすく整えます。',
      book: {
        sheets: [
          {
            name: '勤務時間',
            grid: [
              ['10月 勤務時間（時間）'],
              [],
              ['氏名', '第1週', '第2週', '第3週', '第4週', '合計時間', '支給額'],
              ['佐藤', 24, 22, 25, 20, '=SUM(B4:E4)', null],
              ['鈴木', 18, 20, 16, 21, '=SUM(B5:E5)', null],
              ['高橋', '休暇', 24, 24, 26, '=SUM(B6:E6)', null],
              ['田中', 30, 28, 32, 29, '=SUM(B7:E7)', null],
              ['伊藤', 12, 15, 10, 14, '=SUM(B8:E8)', null],
              ['渡辺', null, 20, 22, 18, '=SUM(B9:E9)', null],
              ['山本', 26, 25, 27, 24, '=SUM(B10:E10)', null],
              ['中村', 16, 16, 18, 16, '=SUM(B11:E11)', null],
              ['小林', 21, 19, 23, 22, '=SUM(B12:E12)', null],
              ['加藤', 28, 30, 27, 31, '=SUM(B13:E13)', null],
              [],
              ['第1週の入力人数', null],
            ],
            widths: { A: 18, B: 9, C: 9, D: 9, E: 9, F: 11, G: 12 },
            styles: { A1: { b: true, sz: 14 }, 'A4:G13': { border: true }, 'B4:E13': { border: true, h: 'right' } },
          },
          { name: '設定', grid: [['時間単価', 1800], ['締め日', '月末']], widths: { A: 12, B: 10 }, styles: { 'A1:A2': { b: true, fill: 'F2F2F2', border: true }, 'B1:B2': { border: true } } },
        ],
        names: { 時間単価: '設定!$B$1' },
        props: { creator: '総務部' },
      },
      tasks: [
        {
          ask: 'ワークシート「勤務時間」のセル範囲 G4:G13 に、「合計時間」に名前付き範囲「時間単価」を掛けた支給額を求める数式を入力してください。', obj: 4, lesson: 'm4-1',
          checks: [
            { label: 'G4:G13 の数式で 名前「時間単価」を使っている', hint: 'G4 に「=F4*時間単価」と入力し、G13 までコピーします。名前は 数式の中に そのまま打てます（[数式] タブ → [数式で使用] から選んでも入ります）。', test: (b) => { const sh = b.sheet('勤務時間'); return rows(4, 13).every((r) => sh.f('G' + r).includes('時間単価')); } },
            { label: '支給額が 合計時間 × 1,800 になっている', hint: '掛けるのは F 列（合計時間）です。名前「時間単価」は ワークシート「設定」のセル B1（1,800）を指しています。', test: (b) => { const sh = b.sheet('勤務時間'); return rows(4, 13).every((r) => near(sh.n('G' + r), total(sh, [`B${r}`, `C${r}`, `D${r}`, `E${r}`]) * 1800, 0.5)); } },
          ],
        },
        {
          ask: 'ワークシート「勤務時間」のセル B15 に、関数を使用して、セル範囲 B4:B13 のうち数値が入力されているセルの個数を求めてください。', obj: 4, lesson: 'm4-2',
          checks: [
            { label: 'B15 に COUNT 関数が入っている', hint: 'B15 に「=COUNT(B4:B13)」と入力します。数値のセルだけを数えるのは COUNT、文字も数えるのは COUNTA です。', test: (b) => b.sheet('勤務時間').uses('B15', 'COUNT') },
            { label: '結果が 8 になっている', hint: 'B4:B13 の 10 個のうち、「休暇」（文字）と 空白のセルは数えないので 8 になります。9 になった時は COUNTA を使っています。', test: (b) => b.sheet('勤務時間').n('B15') === 8 },
          ],
        },
        {
          ask: 'ワークシート「勤務時間」のセル範囲 F4:F13 に、条件付き書式のデータ バー「青のデータ バー（塗りつぶし (グラデーション)）」を設定してください。', obj: 2, lesson: 'm2-4',
          checks: [
            { label: 'F4:F13 に データ バーが設定されている', hint: 'F4:F13 を選んで [ホーム] タブ → [条件付き書式] → [データ バー] → [塗りつぶし (グラデーション)] の [青のデータ バー] を選びます。', test: (b) => b.sheet('勤務時間').cf('F4:F13').some((c) => c.kind === 'dataBar' && overlap(c.ref, 'F4') && overlap(c.ref, 'F13')) },
          ],
        },
        {
          ask: 'ブックのプロパティのタイトルに「10月勤務表」と入力してください。', obj: 1, lesson: 'm1-4',
          checks: [
            { label: 'プロパティのタイトルが「10月勤務表」になっている', hint: '[ファイル] タブ → [情報] を開き、右側の [プロパティ] の [タイトル] に「10月勤務表」と入力します。入力したら ブックを上書き保存します。', test: (b) => norm(b.prop('title')) === norm('10月勤務表') },
          ],
        },
        {
          ask: 'ワークシート「勤務時間」のセル範囲 A3:G3 に、セルのスタイル「見出し 2」を適用してください。', obj: 2, lesson: 'm2-2',
          checks: [
            { label: 'A3:G3 のスタイルが「見出し 2」になっている', hint: 'A3:G3 を選んで [ホーム] タブ → [スタイル] グループ → [セルのスタイル] を開き、[タイトルと見出し] の中の [見出し 2] を選びます。', test: (b) => { const sh = b.sheet('勤務時間'); return sh.all('A3:G3', (a) => norm(sh.st(a).name) === norm('見出し 2')); } },
          ],
        },
      ],
    },

    // ───────── プロジェクト 2 ─────────
    {
      id: 'p2', title: 'プロジェクト 2　問い合わせの受付',
      intro: 'あなたはヘルプデスクの担当です。9 月に受け付けた問い合わせの一覧を、対応の優先度が分かるように整理します。',
      book: {
        sheets: [{
          name: '問い合わせ',
          grid: [
            ['9月 問い合わせ受付一覧'],
            [],
            ['受付番号', '受付日', '種別', '優先度', '対応時間', '担当', '備考'],
            ['Q-101', D(2026, 9, 1), '障害', 2, 45, '佐藤', '再起動で復旧'],
            ['Q-102', D(2026, 9, 2), '質問', 3, 10, '鈴木', null],
            ['Q-103', D(2026, 9, 3), '障害', 1, 120, '高橋', 'ベンダーに連絡'],
            ['Q-104', D(2026, 9, 7), '要望', 3, 25, '佐藤', null],
            ['Q-105', D(2026, 9, 8), '質問', 2, 15, '田中', null],
            ['Q-106', D(2026, 9, 10), '障害', 1, 90, '鈴木', '部品を交換'],
            ['Q-107', D(2026, 9, 14), '質問', 3, 20, '高橋', null],
            ['Q-108', D(2026, 9, 15), '要望', 2, 60, '田中', '次回の定例で検討'],
            ['Q-109', D(2026, 9, 17), '障害', 1, 150, '佐藤', '原因を調査中'],
            ['Q-110', D(2026, 9, 22), '質問', 2, 30, '鈴木', null],
            ['Q-111', D(2026, 9, 24), '要望', 3, 35, '高橋', null],
            ['Q-112', D(2026, 9, 28), '障害', 2, 75, '田中', '設定を修正'],
          ],
          widths: { A: 11, B: 12, C: 9, D: 9, E: 11, F: 9, G: 22 },
          styles: { A1: { b: true, sz: 14 }, 'B4:B15': { fmt: 'yyyy/m/d' } },
          table: { name: 'テーブル1', ref: 'A3:G15', style: 'TableStyleMedium2' },
        }],
      },
      tasks: [
        {
          ask: 'ワークシート「問い合わせ」のテーブルを、「優先度」の昇順に並べ替え、「優先度」が同じ場合は「対応時間」の降順になるように並べ替えてください。', obj: 3, lesson: 'm3-3',
          checks: [
            { label: '「優先度」の小さい順に並んでいる', hint: 'テーブルの中をクリックして [データ] タブ → [並べ替え] を開き、最優先されるキーを「優先度」・順序を「小さい順」にします。', test: (b) => { const sh = b.sheet('問い合わせ'); const p = colOf(sh, 3, '優先度'); if (!p) return false; const v = rows(4, 15).map((r) => sh.n(p + r)); return v.every((x) => Number.isFinite(x)) && v.slice(1).every((x, k) => v[k] <= x); } },
            { label: '「優先度」が同じ行は「対応時間」の大きい順に並んでいる', hint: '[並べ替え] の画面で [レベルの追加] を押し、次に優先されるキーを「対応時間」・順序を「大きい順」にします。', test: (b) => { const sh = b.sheet('問い合わせ'); const p = colOf(sh, 3, '優先度'), m = colOf(sh, 3, '対応時間'); if (!p || !m) return false; const v = rows(4, 15).map((r) => [sh.n(p + r), sh.n(m + r)]); return v.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) && v.slice(1).every(([x, y], k) => v[k][0] !== x || v[k][1] >= y); } },
          ],
        },
        {
          ask: 'ワークシート「問い合わせ」のテーブルに、テーブル スタイルのオプションの「縞模様 (列)」を設定し、「縞模様 (行)」を解除してください。', obj: 3, lesson: 'm3-2',
          checks: [
            { label: '「縞模様 (列)」が オン になっている', hint: 'テーブルの中をクリックして [テーブル デザイン] タブ → [テーブル スタイルのオプション] グループ → [縞模様 (列)] にチェックを入れます。', test: (b) => !!b.sheet('問い合わせ').table()?.colStripes },
            { label: '「縞模様 (行)」が オフ になっている', hint: '同じグループの [縞模様 (行)] のチェックを外します。', test: (b) => { const t = b.sheet('問い合わせ').table(); return !!t && !t.rowStripes; } },
          ],
        },
        {
          ask: 'ワークシート「問い合わせ」のテーブルから、「備考」の列を削除してください。', obj: 3, lesson: 'm3-2',
          checks: [
            { label: 'テーブルから「備考」の列が無くなっている', hint: '「備考」の列のセルを右クリック → [削除] → [テーブルの列] を選びます。Delete キーで文字を消すだけでは 列は残ります。', test: (b) => { const sh = b.sheet('問い合わせ'); const t = sh.table(); return !!t && !t.cols.some((c) => norm(c.name) === norm('備考')) && !sh.hasText('備考'); } },
            { label: 'ほかの 6 列は そのまま残っている', hint: '消すのは「備考」の 1 列だけです。「受付番号」から「担当」までの 6 列は残します。', test: (b) => { const sh = b.sheet('問い合わせ'); const t = sh.table(); return !!t && t.cols.length === 6 && ['受付番号', '受付日', '種別', '優先度', '対応時間', '担当'].every((h) => t.cols.some((c) => norm(c.name) === norm(h))); } },
          ],
        },
        {
          ask: 'ワークシート「問い合わせ」のテーブルの名前を「受付一覧」に変更してください。', obj: 2, lesson: 'm2-3',
          checks: [
            { label: 'テーブルの名前が「受付一覧」になっている', hint: 'テーブルの中をクリックして [テーブル デザイン] タブ → 左はしの [プロパティ] グループ → [テーブル名] に「受付一覧」と入力して Enter を押します。', test: (b) => !!b.sheet('問い合わせ').table('受付一覧') },
          ],
        },
        {
          ask: 'ワークシート「問い合わせ」を印刷したときに、3 行目がすべてのページに印刷されるように、印刷タイトルを設定してください。', obj: 1, lesson: 'm1-5',
          checks: [
            { label: 'タイトル行が 3 行目になっている', hint: '[ページ レイアウト] タブ → [ページ設定] グループ → [印刷タイトル] を開き、[タイトル行] をクリックしてから 行番号の 3 をクリックします（$3:$3 と入ります）。', test: (b) => b.sheet('問い合わせ').raw.printTitleRows === '3:3' },
          ],
        },
      ],
    },

    // ───────── プロジェクト 3 ─────────
    {
      id: 'p3', title: 'プロジェクト 3　地区別の売上',
      intro: 'あなたは営業企画部の担当です。地区別の売上を四半期ごとに比べるグラフと、年間の構成比の表を仕上げます。',
      book: {
        sheets: [
          {
            name: '地区別売上',
            grid: [
              ['地区別売上（万円）'],
              [],
              ['地区', '第1四半期', '第2四半期', '第3四半期', '第4四半期'],
              ['東京', 420, 455, 480, 510],
              ['神奈川', 310, 298, 335, 360],
              ['埼玉', 205, 220, 214, 241],
              ['千葉', 188, 176, 201, 219],
              ['茨城', 96, 104, 99, 121],
            ],
            widths: { A: 10, B: 11, C: 11, D: 11, E: 11 },
            styles: { A1: { b: true, sz: 14 }, 'A3:E3': { b: true, fill: 'DDEBF7', border: true, h: 'center' }, 'A4:E8': { border: true } },
            charts: [{ type: 'col', title: '地区別売上', cats: '地区別売上!$A$4:$A$8', series: [{ name: '地区別売上!$B$3', vals: '地区別売上!$B$4:$B$8' }, { name: '地区別売上!$C$3', vals: '地区別売上!$C$4:$C$8' }, { name: '地区別売上!$D$3', vals: '地区別売上!$D$4:$D$8' }, { name: '地区別売上!$E$3', vals: '地区別売上!$E$4:$E$8' }], anchor: [7, 3, 15, 18], legend: 'b' }],
          },
          {
            name: '年間',
            grid: [
              ['年間売上と構成比'],
              [],
              ['地区', '年間売上', '構成比'],
              ['東京', 1865, null],
              ['神奈川', 1303, null],
              ['埼玉', 880, null],
              ['千葉', 784, null],
              ['茨城', 420, null],
              ['合計', '=SUM(B4:B8)', null],
            ],
            widths: { A: 10, B: 11, C: 10 },
            styles: { A1: { b: true, sz: 14 }, 'A3:C3': { b: true, fill: 'E2EFDA', border: true, h: 'center' }, 'A4:C9': { border: true }, 'B4:B9': { fmt: '#,##0', border: true } },
          },
        ],
      },
      tasks: [
        {
          ask: 'ワークシート「地区別売上」の縦棒グラフの行と列を切り替えて、横（項目）軸に四半期が表示されるようにしてください。', obj: 5, lesson: 'm5-2',
          checks: [
            { label: '系列が 地区（5 つ）になり、横軸が 四半期になっている', hint: 'グラフをクリックして [グラフのデザイン] タブ → [データ] グループ → [行/列の切り替え] を 1 回押します。凡例に 東京・神奈川…の 5 つが並べば できています。', test: (b) => { const c = chartOn(b, '地区別売上', 'B4:E8'); return !!c && G.is(c, 'col') && c.series.length === 5; } },
          ],
        },
        {
          ask: 'ワークシート「地区別売上」の縦棒グラフの縦（値）軸に、軸ラベル「売上（万円）」を表示してください。', obj: 5, lesson: 'm5-2',
          checks: [
            { label: '縦（値）軸の軸ラベルが「売上（万円）」になっている', hint: 'グラフをクリックして [グラフのデザイン] タブ → [グラフ要素を追加] → [軸ラベル] → [第 1 縦軸] を選び、出てきた枠の文字を「売上（万円）」に打ち替えます。', test: (b) => norm(G.axisTitle(chartOn(b, '地区別売上', 'B4:E8'), 'val')) === norm('売上（万円）') },
          ],
        },
        {
          ask: 'ワークシート「年間」のセル範囲 A3:B8 をもとに、集合横棒グラフを作成してください。グラフはワークシート「年間」に配置します。', obj: 5, lesson: 'm5-1',
          checks: [
            { label: '年間売上（B4:B8）を使った 横棒グラフがある', hint: 'ワークシート「年間」の A3:B8 を選んで [挿入] タブ → [グラフ] グループ → [縦棒/横棒グラフの挿入] → [2-D 横棒] の [集合横棒] を選びます。9 行目の「合計」は範囲に入れません。', test: (b) => b.charts.some((c) => G.is(c, 'bar') && !G.stacked(c) && c.series.some((s) => onSheet(s.val, '年間') && overlap(s.val, 'B4:B8') && !overlap(s.val, 'B9'))) },
          ],
        },
        {
          ask: 'ワークシート「年間」のセル範囲 C4:C8 に、各地区の「年間売上」をセル B9 の合計で割った構成比を求める数式を入力してください。数式は、セル C4 に入力した数式をコピーして作成します。', obj: 4, lesson: 'm4-1',
          checks: [
            { label: 'C4:C8 のすべてに数式が入っている', hint: 'C4 に「=B4/$B$9」と入力し、C8 までコピーします。', test: (b) => { const sh = b.sheet('年間'); return rows(4, 8).every((r) => !!sh.f('C' + r)); } },
            { label: 'どの行も 年間売上 ÷ 合計 になっている', hint: '合計のセルは 絶対参照（$B$9）にします。$ を付けずにコピーすると、割る相手が B10、B11…とずれて エラーになります。', test: (b) => { const sh = b.sheet('年間'); const all = total(sh, rows(4, 8).map((r) => 'B' + r)); return all > 0 && rows(4, 8).every((r) => near(sh.n('C' + r), sh.n('B' + r) / all, 0.0005)); } },
          ],
        },
        {
          ask: 'ワークシート「年間」のセル範囲 C4:C8 の表示形式を、パーセント スタイルで小数点以下 1 桁まで表示されるように設定してください。', obj: 2, lesson: 'm2-2',
          checks: [
            { label: 'C4:C8 が パーセント表示になっている', hint: 'C4:C8 を選んで [ホーム] タブ → [数値] グループ → [パーセント スタイル]（% のボタン）を押します。', test: (b) => { const sh = b.sheet('年間'); return sh.all('C4:C8', (a) => F.percent(sh.st(a))); } },
            { label: '小数点以下 1 桁まで表示されている', hint: '続けて、同じグループの [小数点以下の表示桁数を増やす] を 1 回押します（35.5% の形になります）。', test: (b) => { const sh = b.sheet('年間'); return sh.all('C4:C8', (a) => F.percent(sh.st(a)) && F.decimals(sh.st(a)) === 1); } },
          ],
        },
      ],
    },

    // ───────── プロジェクト 4 ─────────
    {
      id: 'p4', title: 'プロジェクト 4　研修の受講者',
      intro: 'あなたは研修センターの事務担当です。受講者の名簿のデータを整え、研修の日程表を修正します。',
      book: {
        sheets: [
          {
            name: '受講者',
            grid: [
              ['受講者名簿'],
              [],
              ['受講番号', '氏名', 'メール アドレス', 'コース名', 'メール（小文字）', 'コース記号'],
              ['2026-NW-0153', '佐藤 健', 'Sato.Ken@Example.com', 'ネットワーク基礎', null, null],
              ['2026-LX-0154', '鈴木 美咲', 'SUZUKI.M@example.com', 'Linux 入門', null, null],
              ['2026-DB-0155', '高橋 翔', 'Takahashi_S@Example.COM', 'データベース基礎', null, null],
              ['2026-NW-0156', '田中 陽子', 'tanaka.yoko@EXAMPLE.com', 'ネットワーク基礎', null, null],
              ['2026-PG-0157', '伊藤 大輔', 'Ito.Daisuke@example.com', 'プログラミング入門', null, null],
              ['2026-LX-0158', '渡辺 彩', 'WATANABE.A@EXAMPLE.COM', 'Linux 入門', null, null],
              ['2026-PG-0159', '山本 拓也', 'Yamamoto.T@Example.com', 'プログラミング入門', null, null],
              ['2026-DB-0160', '中村 愛', 'Nakamura_Ai@example.COM', 'データベース基礎', null, null],
              ['2026-NW-0161', '小林 誠', 'Kobayashi.M@Example.com', 'ネットワーク基礎', null, null],
            ],
            widths: { A: 15, B: 12, C: 14, D: 20, E: 28, F: 11 },
            styles: { A1: { b: true, sz: 14 }, 'A3:F3': { b: true, fill: 'FFF2CC', border: true, h: 'center' }, 'A4:F12': { border: true } },
          },
          {
            name: '日程',
            grid: [
              ['研修日程表'],
              [],
              ['開催日', 'コース名', '定員', '講師'],
              [D(2026, 11, 4), 'ネットワーク基礎', 20, '加藤'],
              [D(2026, 11, 6), 'Linux 入門', 16, '吉田'],
              [D(2026, 11, 11), 'データベース基礎', 16, '山田'],
              [D(2026, 11, 13), 'プログラミング入門', 24, '佐々木'],
              [D(2026, 11, 18), 'ネットワーク基礎', 20, '加藤'],
              [D(2026, 11, 25), 'Linux 入門', 16, '吉田'],
            ],
            widths: { A: 12, B: 20, C: 8, D: 10 },
            styles: { A1: { b: true, sz: 14 }, 'A4:A9': { fmt: 'yyyy/m/d' } },
            table: { name: '日程表', ref: 'A3:D9', style: 'TableStyleLight9' },
          },
        ],
      },
      tasks: [
        {
          ask: 'ワークシート「受講者」のセル範囲 E4:E12 に、関数を使用して、「メール アドレス」の英字をすべて小文字に変換して表示してください。', obj: 4, lesson: 'm4-3',
          checks: [
            { label: 'E4:E12 に LOWER 関数が入っている', hint: 'E4 に「=LOWER(C4)」と入力し、E12 までコピーします。', test: (b) => { const sh = b.sheet('受講者'); return rows(4, 12).every((r) => sh.uses('E' + r, 'LOWER')); } },
            { label: 'メール アドレスが すべて小文字になっている', hint: '変換するのは C 列（メール アドレス）です。小文字にするのは LOWER、大文字にするのは UPPER です。', test: (b) => { const sh = b.sheet('受講者'); return rows(4, 12).every((r) => { const src = String(sh.v('C' + r) ?? '').trim(); return src !== '' && String(sh.v('E' + r) ?? '').trim() === src.toLowerCase(); }); } },
          ],
        },
        {
          ask: 'ワークシート「受講者」のセル範囲 F4:F12 に、関数を使用して、「受講番号」の 6 文字目から 2 文字を取り出して表示してください。', obj: 4, lesson: 'm4-3',
          checks: [
            { label: 'F4:F12 に MID 関数が入っている', hint: 'F4 に「=MID(A4,6,2)」と入力し、F12 までコピーします。途中の文字を取り出すのは MID 関数です。', test: (b) => { const sh = b.sheet('受講者'); return rows(4, 12).every((r) => sh.uses('F' + r, 'MID')); } },
            { label: '6 文字目からの 2 文字が表示されている', hint: '引数は「文字列, 開始位置, 文字数」の順で、開始位置が 6、文字数が 2 です。「2026-NW-0153」なら「NW」になります。', test: (b) => { const sh = b.sheet('受講者'); return rows(4, 12).every((r) => sh.t('F' + r) !== '' && sh.t('F' + r) === norm(String(sh.v('A' + r) ?? '').slice(5, 7))); } },
          ],
        },
        {
          ask: 'ワークシート「日程」の「開催日」の列と「コース名」の列の間に列を 1 列挿入し、挿入した列の 3 行目のセルに「会場」と入力してください。', obj: 2, lesson: 'm2-1',
          checks: [
            { label: 'B3 が「会場」になっている', hint: 'B 列の列番号を右クリック → [挿入] を選ぶと、「コース名」の左に 空の列が入ります。その 3 行目（B3）に「会場」と入力します。', test: (b) => b.sheet('日程').t('B3') === norm('会場') },
            { label: '「開催日」は A 列のまま、「コース名」は C 列に移っている', hint: '列を入れる場所は A 列と B 列の間です。B 列を選んでから挿入します（挿入は 選んだ列の左に入ります）。', test: (b) => { const sh = b.sheet('日程'); return sh.t('A3') === norm('開催日') && sh.t('C3') === norm('コース名') && sh.t('E3') === norm('講師'); } },
          ],
        },
        {
          ask: 'ワークシート「日程」のテーブルを、セル範囲に変換してください。', obj: 3, lesson: 'm3-1',
          checks: [
            { label: 'ワークシート「日程」に テーブルが無くなっている', hint: 'テーブルの中をクリックして [テーブル デザイン] タブ → [ツール] グループ → [範囲に変換] を押し、確認の画面で [はい] を押します。', test: (b) => { const sh = b.sheet('日程'); return sh.exists && sh.raw.tables.length === 0; } },
            { label: 'データは そのまま残っている', hint: '範囲に変換しても データと色は残ります。表を消すのではなく、テーブルの機能だけを外します。', test: (b) => { const sh = b.sheet('日程'); return sh.hasText('開催日') && sh.hasText('講師') && sh.hasText('佐々木'); } },
          ],
        },
        {
          ask: 'ワークシート「受講者」の C 列の列の幅を 30 に設定してください。', obj: 1, lesson: 'm1-3',
          checks: [
            { label: 'C 列の幅が 30 になっている', hint: 'C 列の列番号を右クリック → [列の幅] を開き、「30」と入力して [OK] を押します（[ホーム] タブ → [セル] グループ → [書式] → [列の幅] でも同じです）。', test: (b) => Math.abs(b.sheet('受講者').width('C') - 30) < 1 },
          ],
        },
      ],
    },

    // ───────── プロジェクト 5 ─────────
    {
      id: 'p5', title: 'プロジェクト 5　部門別の予算と実績',
      intro: 'あなたは経営管理部の担当です。上半期の部門別の予算と実績の資料を、役員会に出せるように仕上げます。',
      book: {
        sheets: [
          {
            name: '予算実績',
            grid: [
              ['上半期　部門別 予算と実績（万円）'],
              [],
              ['部門', '予算', '実績'],
              ['開発部', 900, 942],
              ['営業部', 750, 688],
              ['総務部', 320, 305],
              ['人事部', 280, 331],
              ['情報システム部', 610, 820],
              [],
              ['実績の最小値', null, null],
              [],
              ['経費規程（社内サイト）'],
            ],
            widths: { A: 22, B: 10, C: 10 },
            styles: { A1: { b: true, sz: 14 }, 'A3:C3': { b: true, fill: 'DDEBF7', border: true, h: 'center' }, 'A4:C8': { border: true }, 'A10:C10': { border: true }, A12: { color: '0563C1' } },
            cf: [{ ref: 'C4:C8', op: 'greaterThan', val: '800', fill: 'FFC7CE' }],
            links: [{ ref: 'A12', url: 'https://example.com/keihi' }],
            charts: [{ type: 'col', title: '予算と実績', cats: '予算実績!$A$4:$A$8', series: [{ name: '予算実績!$B$3', vals: '予算実績!$B$4:$B$8' }, { name: '予算実績!$C$3', vals: '予算実績!$C$4:$C$8' }], anchor: [5, 3, 12, 17], legend: 'b' }],
          },
          {
            name: '月別推移',
            grid: [
              ['上半期　支出の推移（万円）'],
              [],
              ['月', '支出合計'],
              ['4月', 512],
              ['5月', 478],
              ['6月', 530],
              ['7月', 496],
              ['8月', 455],
              ['9月', 615],
            ],
            widths: { A: 10, B: 12 },
            styles: { A1: { b: true, sz: 14 }, 'A3:B3': { b: true, fill: 'E2EFDA', border: true, h: 'center' }, 'A4:B9': { border: true } },
            charts: [{ type: 'line', title: '支出の推移', cats: '月別推移!$A$4:$A$9', series: [{ name: '月別推移!$B$3', vals: '月別推移!$B$4:$B$9' }], anchor: [4, 3, 11, 17], legend: 'none' }],
          },
        ],
      },
      tasks: [
        {
          ask: 'ワークシート「予算実績」の縦棒グラフに、代替テキスト「部門別の予算と実績」を追加してください。', obj: 5, lesson: 'm5-3',
          checks: [
            { label: 'グラフの代替テキストが「部門別の予算と実績」になっている', hint: 'グラフの外枠を右クリック → [代替テキストを表示]（古い版は [グラフ エリアの書式設定] → [サイズとプロパティ] → [代替テキスト] の [説明]）を開き、「部門別の予算と実績」と入力します。', test: (b) => norm(chartOn(b, '予算実績', 'B4:C8')?.alt).includes(norm('部門別の予算と実績')) },
          ],
        },
        {
          ask: 'ワークシート「月別推移」の折れ線グラフを、新しいグラフ シート「推移グラフ」に移動してください。', obj: 5, lesson: 'm5-1',
          checks: [
            { label: 'グラフ シート「推移グラフ」がある', hint: 'グラフをクリックして [グラフのデザイン] タブ → [場所] グループ → [グラフの移動] を開き、[新しいシート] を選んで 名前を「推移グラフ」にして [OK] を押します。', test: (b) => b.chartSheets.some((s) => norm(s.name) === norm('推移グラフ')) },
          ],
        },
        {
          ask: 'ワークシート「予算実績」のセル範囲 C4:C8 に設定されている条件付き書式を削除してください。', obj: 2, lesson: 'm2-4',
          checks: [
            { label: 'C4:C8 の条件付き書式が無くなっている', hint: 'C4:C8 を選んで [ホーム] タブ → [条件付き書式] → [ルールのクリア] → [選択したセルからルールをクリア] を選びます。', test: (b) => { const sh = b.sheet('予算実績'); return sh.exists && sh.cf('C4:C8').length === 0; } },
          ],
        },
        {
          ask: 'ワークシート「予算実績」のセル C10 に、関数を使用して、「実績」（セル範囲 C4:C8）の最小値を求めてください。', obj: 4, lesson: 'm4-2',
          checks: [
            { label: 'C10 に MIN 関数が入っている', hint: 'C10 に「=MIN(C4:C8)」と入力します。', test: (b) => b.sheet('予算実績').uses('C10', 'MIN') },
            { label: '実績の最小値になっている', hint: '範囲は C 列（実績）の C4:C8 です。B 列（予算）と まちがえないようにします。', test: (b) => { const sh = b.sheet('予算実績'); return near(sh.n('C10'), Math.min(...rows(4, 8).map((r) => sh.n('C' + r))), 0.5); } },
          ],
        },
        {
          ask: 'ワークシート「予算実績」のセル A12 に設定されているハイパーリンクを削除してください。セルの文字列は残します。', obj: 1, lesson: 'm1-2',
          checks: [
            { label: 'A12 のハイパーリンクが無くなっている', hint: 'A12 を右クリック → [ハイパーリンクの削除] を選びます。', test: (b) => { const sh = b.sheet('予算実績'); return sh.exists && !sh.link('A12'); } },
            { label: 'セルの文字列は残っている', hint: 'Delete キーで消すと 文字も消えてしまいます。右クリックの [ハイパーリンクの削除] なら 文字は残ります。', test: (b) => b.sheet('予算実績').t('A12') === norm('経費規程（社内サイト）') },
          ],
        },
      ],
    },
  ],
};
