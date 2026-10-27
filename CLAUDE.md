# いけどん ver2（本番前）

いけいけどんどん（ses/02_ツール/LINE/ikeike-next/legacy）の作り直し。
手元で `npm run dev`（http://localhost:3330）で動かす。Vercel プロジェクト shanai-kanri-v2（10-23〜）に出す。

- **営業から先に出す（2026-10-27 shoya「営業からやっちゃいたい」。10-22 の「全部できあがるまで出さない」を変えた）**: 今の社内システム（legacy）は残したまま、営業の人に ver2 の営業画面も使ってもらう**並行運用**。読み書きはどちらも今のシステムの口を通る（`lib/live/post.ts` → `/api/live/**`）ので データは食い違わない
  - 全体管理者でない人に見えるのは 営業（/home/eigyo・/eigyo/）とホーム・設定だけ。人事・人財・労務・経理・保留は 全体管理者だけ（`lib/kubun.ts` の `PRE_LAUNCH`・`PRE_LAUNCH_CLOSED`。出すときはそこから外す）。メニュー・右クリック・画面は `usePerms().open(href)` で決める
  - 配る URL に vercel.app を付けない（10-27 shoya）＝会社のドメインをつなぐ（ドメインはまだ買わない・同日）
  - **クラウドから出す**：`claude/…` に push すれば、Mac の見張り役（いけどんの tools/deploy-watch/v2.sh）が main に取り込み → tsc → vercel --prod まで出す。結果は このリポジトリのタグ `deploy-ok/<sha7>`・`deploy-failed/<sha7>`、様子はタグ `deploy-watch/status`。`main` に直接 push しない。Mac から手で出すときは 先に git pull・main を push してから
  - 今のシステムの URL を ver2 に切り替えるのは まだ（全部そろって `/settings/cutover` が全部 ✓ になってから shoya ともう一度確認）

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
- **人財管理**（10-27・5つ目の分類・緑）：それゆけ未経験（saiyou-app）を中身ごと移した（同日 shoya「それゆけを ver2 にぶちこんで」）。画面 `components/sy`・処理 `app/api/sy/s/*`（それゆけ app/api/s の写し）・`lib/sy`（それゆけ lib の写し）。**それゆけのサーバは呼ばない**＝saiyou スキーマを service role で直接読み書きし、LINE「インフォメーション」にも ver2 から送る。ログインは ver2 のトークン（`lib/sy/auth.ts`）、それゆけの4段階の権限・内勤一般は見るだけ（`lib/sy/api.ts`・proxy.ts が x-sa-method を渡す）もそのまま。★ver2 の Vercel に鍵が要る：IKEIKE_SERVICE_ROLE・LINE_CHANNEL_ACCESS_TOKEN・LINE_CHANNEL_SECRET・SESSION_SECRET（どれもそれゆけと同じ値）。要員向け（LINE Webhook・/m・/k bdsh・/f 回答ページ・cron）は URL を配ってあるのでそれゆけに残す。ver2 にもうあった コミュニティ・離職率・資格手当・採用・bdsh は人事管理から移しただけ（区分はそのまま）。プロパーリストは営業の要員リストと同じ画面、たまげたポンを回す画面は今のシステムの bikkura.html を /ik で。**それゆけ側の lib・API を直したら lib/sy・app/api/sy/s も同じに**
- 案件進捗は単独。作り込みはあとで（LINEグループに直接投げた案件も回収する）
- 案件・要員マップは 営業 `/eigyo/map` と 人事 `/jinji/map` の両方のメニューにある（同じ画面・10-27 shoya。人事側は区分「稼働中の人」）

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
