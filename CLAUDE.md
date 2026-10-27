# いけどん ver2（本番前）

いけいけどんどん（ses/02_ツール/LINE/ikeike-next/legacy）の作り直し。**全部できあがるまで本番に出さない**（2026-10-22 shoya）。
手元で `npm run dev`（http://localhost:3330）で動かす。見本URL（本番とは別の Vercel プロジェクト shanai-kanri-v2・10-23〜）にも出す。本番（legacy）に入れる前は shoya ともう一度確認する。

- 土台：Next.js 16（App Router）＋ React 19 ＋ Tailwind 4 ＋ lucide-react（それゆけ saiyou-app と同じ）
- 字体：ミンミカと同じ Inter ＋ ヒラギノ角ゴ
- 分類：人事管理／労務/営業管理（労務と営業管理=稼働・現場・契約は1つ）／営業（案件・案件進捗・プロパー＝売る側）／経理管理。色はそれぞれ1色ずつ（`lib/theme.ts`）。選べるが **重複不可**。黄（黄×黒）の上の文字は黒
- 動き：モーション図鑑（legacy/api/_assets/docs/motion-catalog.html）の語彙だけ（`app/globals.css` の mo-*）
- 遊び心（今日の処理・残りリング→完了カード・波及先トースト・取り消す）は **なくさない**（`components/Motivation.tsx`）
- 入れる人：**未経験事業部の内勤だけ**が全画面。それ以外は `/shared`（営業共有リスト）だけ（`lib/access.ts`）。それ以外のロールは ver2 で作り直し中
- いまは見本データ（`lib/sample.ts`）。いまの人は上のバーの「見え方」で切り替え（cookie v2_viewer・ログインをつないだら消す）
- 画面のルール：ses/docs/ver2/UIの型.md ／ 見た目の見本：https://claude.ai/artifact/6nLiR9H8CNZYqqgegPBUE1
- 画面にブランド名（いけいけどんどん／いけどん）は出さない
- 権限：分類ごとに 見ない/見る/直す/承認（付いていなければ見ない）＋ロール（全体管理者・管理者・全体を見る）。`lib/access.ts`・権限管理 `/settings/access`。手元の名簿は data/members.json
- 要員リスト `/eigyo/proper`：タブで プロパー（スキシ作成）／営業共有リスト／従業員名簿（人事を見る人だけ）／ライバーリスト（全体管理者だけ）
- 連絡（チャット・配信・手動配信）は各画面の右上（`components/Renraku.tsx`）。人事＝インフォメーション、それ以外＝あおい。送信は長押し
- **人財管理**（10-27・5つ目の分類・緑）：それゆけ未経験（saiyou-app）の画面を移した。それゆけにしか無かった画面（定期面談・月次アンケート・イベント出欠・アンケート作成・粗利LTV・リッチメニュー・たまげたポンの設定）は `components/sy`（それゆけの写しを ver2 の部品・色で）、データはそれゆけの API を `/api/sy/*` で読み書き（`lib/soreyuke.ts`・同じログインのトークンを sa_access に入れる＝権限・保存の決まりはそれゆけのまま）。ver2 にもうあった コミュニティ・離職率・資格手当・採用・bdsh は人事管理から移しただけ（区分はそのまま）
- 案件進捗は単独。作り込みはあとで（LINEグループに直接投げた案件も回収する）
