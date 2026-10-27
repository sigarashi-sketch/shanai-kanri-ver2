# いけどん ver2（本番前）

いけいけどんどん（ses/02_ツール/LINE/ikeike-next/legacy）の作り直し。
手元で `npm run dev`（http://localhost:3330）で動かす。Vercel プロジェクト shanai-kanri-v2（10-23〜）に出す。

- **営業から先に出す（2026-10-27 shoya「営業からやっちゃいたい」。10-22 の「全部できあがるまで出さない」を変えた）**: 今の社内システム（legacy）は残したまま、営業の人に ver2 の営業画面も使ってもらう**並行運用**。読み書きはどちらも今のシステムの口を通る（`lib/live/post.ts` → `/api/live/**`）ので データは食い違わない
  - 全体管理者でない人に見えるのは 営業（/home/eigyo・/eigyo/）とホーム・設定だけ。人事・労務・経理・保留は 全体管理者だけ（`lib/kubun.ts` の `PRE_LAUNCH`・`PRE_LAUNCH_CLOSED`。出すときはそこから外す）。メニュー・右クリック・画面は `usePerms().open(href)` で決める
  - 配る URL に vercel.app を付けない（10-27 shoya）＝会社のドメインをつなぐ
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
- 案件進捗は単独。作り込みはあとで（LINEグループに直接投げた案件も回収する）
- 案件・要員マップは 営業 `/eigyo/map` と 人事 `/jinji/map` の両方のメニューにある（同じ画面・10-27 shoya。人事側は区分「稼働中の人」）
