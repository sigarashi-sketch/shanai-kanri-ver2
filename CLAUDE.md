# いけどん ver2（本番前）

いけいけどんどん（ses/02_ツール/LINE/ikeike-next/legacy）の作り直し。**全部できあがるまで本番に出さない**（2026-10-22 shoya）。
手元で `npm run dev`（http://localhost:3330）で動かす。Vercel にはまだ出さない（デプロイ節約）。

- 土台：Next.js 16（App Router）＋ React 19 ＋ Tailwind 4 ＋ lucide-react（それゆけ saiyou-app と同じ）
- 字体：ミンミカと同じ Inter ＋ ヒラギノ角ゴ
- 色：人事・労務・営業・経理が1色ずつ（`lib/theme.ts`）。選べるが **重複不可**。黄（黄×黒）の上の文字は黒
- 動き：モーション図鑑（legacy/api/_assets/docs/motion-catalog.html）の語彙だけ（`app/globals.css` の mo-*）
- 遊び心（今日の処理・残りリング→完了カード・波及先トースト・取り消す）は **なくさない**（`components/Motivation.tsx`）
- 入れる人：**未経験事業部の内勤だけ**が全画面。それ以外は `/shared`（営業共有リスト）だけ（`lib/access.ts`）。それ以外のロールは ver2 で作り直し中
- いまは見本データ（`lib/sample.ts`）。いまの人は上のバーの「見え方」で切り替え（cookie v2_viewer・ログインをつないだら消す）
- 画面のルール：ses/docs/ver2/UIの型.md ／ 見た目の見本：https://claude.ai/artifact/6nLiR9H8CNZYqqgegPBUE1
- 画面にブランド名（いけいけどんどん／いけどん）は出さない
