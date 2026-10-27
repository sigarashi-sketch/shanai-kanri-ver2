# いけどん ver2（本番前）

いけいけどんどん（ses/02_ツール/LINE/ikeike-next/legacy）の作り直し。**全部できあがるまで本番に出さない**（2026-10-22 shoya）。
手元で `npm run dev`（http://localhost:3330）で動かす。見本URL（本番とは別の Vercel プロジェクト shanai-kanri-v2・10-23〜）にも出す（10-27〜 GitHub の main に入れると自動で出る＝クラウドからも main に push すれば出る。claude/… のブランチはお試しの別URL）。本番（legacy）に入れる前は shoya ともう一度確認する。

- 土台：Next.js 16（App Router）＋ React 19 ＋ Tailwind 4 ＋ lucide-react（それゆけ saiyou-app と同じ）
- 字体：ミンミカと同じ Inter ＋ ヒラギノ角ゴ
- 分類：人事管理／労務/営業管理（労務と営業管理=稼働・現場・契約は1つ）／営業（案件・案件進捗・プロパー＝売る側）／経理管理。色はそれぞれ1色ずつ（`lib/theme.ts`）。選べるが **重複不可**。黄（黄×黒）の上の文字は黒
- 動き：モーション図鑑（legacy/api/_assets/docs/motion-catalog.html）の語彙だけ（`app/globals.css` の mo-*）
- 遊び心（今日の処理・残りリング→完了カード・波及先トースト・取り消す）は **なくさない**（`components/Motivation.tsx`）
- 入れる人：**未経験事業部の内勤だけ**が全画面。それ以外は `/shared`（営業共有リスト）だけ（`lib/access.ts`）。それ以外のロールは ver2 で作り直し中
- いまは見本データ（`lib/sample.ts`）。いまの人は上のバーの「見え方」で切り替え（cookie v2_viewer・ログインをつないだら消す）
- 画面のルール：ses/docs/ver2/UIの型.md ／ 見た目の見本：https://claude.ai/artifact/6nLiR9H8CNZYqqgegPBUE1
- 画面にブランド名（いけいけどんどん／いけどん）は出さない
- 権限：区分＝**左メニューの分類**（人事管理・人財管理・労務/営業管理・営業・経理管理）＋かな西エリア（`lib/kubun.ts`・10-27 shoya「左のメニュー依存に」）ごとに 見ない/見る/直す/承認（付いていなければ見ない）＋ロール（全体管理者・管理者・全体を見る）。2つの分類で見せたい画面は メニューに別の href で複製する。`lib/access.ts`・付けるのは組織表 `/settings/org`
- 左メニュー（`components/Shell.tsx` SideNav）：ふだんはアイコンの帯、マウスを合わせると重ねて広がる（今のシステムと同じ）。ピンで広げたまま固定。分類の見出しを押すと画面の一覧が開く
- 要員リスト `/eigyo/proper`：タブで プロパー（スキシ作成）／営業共有リスト／従業員名簿（人事を見る人だけ）／ライバーリスト（全体管理者だけ）
- 連絡（チャット・配信・手動配信）は各画面の右上（`components/Renraku.tsx`）。人事＝インフォメーション、それ以外＝あおい。送信は長押し
- **人財管理**（10-27・5つ目の分類・緑）：それゆけ未経験（saiyou-app）を中身ごと移した（同日 shoya「それゆけを ver2 にぶちこんで」）。画面 `components/sy`・処理 `app/api/sy/s/*`（それゆけ app/api/s の写し）・`lib/sy`（それゆけ lib の写し）。**それゆけのサーバは呼ばない**＝saiyou スキーマを service role で直接読み書きし、LINE「インフォメーション」にも ver2 から送る。ログインは ver2 のトークン（`lib/sy/auth.ts`）、それゆけの4段階の権限・内勤一般は見るだけ（`lib/sy/api.ts`・proxy.ts が x-sa-method を渡す）もそのまま。★ver2 の Vercel に鍵が要る：IKEIKE_SERVICE_ROLE・LINE_CHANNEL_ACCESS_TOKEN・LINE_CHANNEL_SECRET・SESSION_SECRET（どれもそれゆけと同じ値）。要員向け（LINE Webhook・/m・/k bdsh・/f 回答ページ・cron）は URL を配ってあるのでそれゆけに残す。ver2 にもうあった コミュニティ・離職率・資格手当・採用・bdsh は人事管理から移しただけ（区分はそのまま）。プロパーリストは営業の要員リストと同じ画面、たまげたポンを回す画面は今のシステムの bikkura.html を /ik で。**それゆけ側の lib・API を直したら lib/sy・app/api/sy/s も同じに**
- 案件進捗は単独。作り込みはあとで（LINEグループに直接投げた案件も回収する）

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
