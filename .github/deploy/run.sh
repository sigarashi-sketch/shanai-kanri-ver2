#!/usr/bin/env bash
# claude/* に push されたら GitHub Actions が本番に出す（2026-10-27 shoya「Mac の見張り役やめて GitHub に」）。
#   Mac の見張り役（いけどん tools/deploy-watch/v2.sh・saiyou.sh）と同じ流れ:
#     GitHub の main に取り込み → npm ci → tsc → （本番に Mac だけの変更が無いか確かめる）→ ビルド → main を push → vercel --prod
#   違いは ビルドを GitHub の上でやる（vercel build → vercel deploy --prebuilt）＝Vercel のビルド代がかからない・Mac が要らない。
#   結果はこのリポジトリのタグ deploy-ok/<sha7>・deploy-failed/<sha7>（本文に理由）、様子はタグ deploy-watch/status（Mac と同じ）。
#   ★本番の系統は GitHub の main。先頭のコミットが wip: のブランチは出さない。
#   ★ビルドが通ってから main を進める（Mac は先に main を進めていた）＝落ちたときは main も本番も前のまま。
#   ★別のブランチで出し損ねた分（Actions の待ち行列で消された分）も拾う＝24時間以内のコミットで、タグも付いておらず main にも無いもの。
#   env（workflow が渡す）: BRANCH・VERCEL_TOKEN・VERCEL_SCOPE・VERCEL_PROJECT・PROD_HOST・KEEP（git に入れず本番から持ち越す前置き。空なら無し）・
#     AUTHOR_EMAIL・SETTLE（ほかのブランチを拾うときの落ち着き待ち 秒）・WAIT_MIN（本番に Mac だけの変更があるとき待つ 分）・RUN_URL
set -uo pipefail

D="$(cd "$(dirname "$0")" && pwd)"   # workflow が RUNNER_TEMP に写したもの（main を checkout するとリポジトリの中は入れ替わるため）
VC=(npx --yes vercel@latest --token "$VERCEL_TOKEN" --scope "$VERCEL_SCOPE")
export PROD_IGNORE="${KEEP:-}"

status() {
  echo "様子: $1"
  git rev-parse -q --verify origin/main >/dev/null || return 0
  git tag -f -a deploy-watch/status origin/main -m "$(TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M:%S') $1
（GitHub Actions ${RUN_URL:-}）" >/dev/null 2>&1
  git push -q -f origin refs/tags/deploy-watch/status >/dev/null 2>&1 || echo "deploy-watch/status の push に失敗"
}

report() { # report ok|failed <sha> <本文>
  local tag="deploy-$1/${2:0:7}"
  echo "[$1] ${2:0:7} $(echo "$3" | head -1)"
  git tag -f -a "$tag" "$2" -m "$3
（GitHub Actions ${RUN_URL:-}）" >/dev/null 2>&1
  git push -q -f origin "refs/tags/$tag" >/dev/null 2>&1 || echo "タグ $tag の push に失敗"
}

handled() { # すでに結果のタグがあるか main に入っている
  git ls-remote --tags origin "refs/tags/deploy-ok/${1:0:7}" "refs/tags/deploy-failed/${1:0:7}" 2>/dev/null | grep -q . && return 0
  git merge-base --is-ancestor "$1" origin/main 2>/dev/null
}

# 1 件ぶん。0=出した 1=止めた（やり直さない） 2=もう一度最初から（main が先に進んでいた）
process() {
  local branch="$1" sha="$2" out res merged url i rc warn=""
  git fetch -q origin main || { status "main を取ってこられない"; return 1; }
  handled "$sha" && { echo "${sha:0:7} は扱いずみ"; return 1; }

  git checkout -q -f --detach origin/main
  git clean -fdxq -e node_modules -e .vercel
  rm -rf .vercel/output

  # いまの本番に main のどこにも無い中身（Mac で作業中・未 push の分）があれば、上から出すと消えるので待つ
  for ((i = 0; ; i++)); do
    res="$(node "$D/prod.mjs" check . 2>&1)"
    case "$(echo "$res" | head -1)" in OK) echo "$(echo "$res" | sed -n 2p)"; break ;; esac
    if [ "$i" -ge $((WAIT_MIN / 2)) ]; then
      if [ "$(echo "$res" | head -1)" = "NG" ]; then
        report failed "$sha" "いまの本番に GitHub の main に無い変更がある（Mac で作業中・未 push の分）。上から出すと消えるので止めた。本番は変わっていない。
Mac でコミットして main に push してから、こちらをもう一度 push する（新しいコミットで）。
$(echo "$res" | tail -n +2)"
      else
        report failed "$sha" "いまの本番の中身を Vercel に聞けなかったので止めた。本番は変わっていない。もう一度 push する。
$(echo "$res" | tail -n +2 | head -5)"
      fi
      return 1
    fi
    status "待っている: いまの本番に main に無い変更がある、または Vercel に聞けない（2 分後にもう一度・${sha:0:7}）
$(echo "$res" | tail -n +2 | head -8)"
    sleep 120
  done

  if ! out="$(git merge --no-ff -m "クラウドから取り込み: $branch (${sha:0:7})" "$sha" 2>&1)"; then
    local files; files="$(git diff --name-only --diff-filter=U | head -20)"
    git merge --abort >/dev/null 2>&1
    report failed "$sha" "main への取り込みで衝突したので止めた。本番は変わっていない。
衝突したファイル:
$files
直し方: git fetch origin main && git merge origin/main で衝突を解いてから、もう一度 push する。"
    return 1
  fi
  merged="$(git rev-parse HEAD)"

  status "動いている: ${sha:0:7} を main に取り込んだ。npm ci / tsc 中"
  if ! out="$(npm ci --no-audit --no-fund 2>&1)"; then
    report failed "$sha" "npm ci が落ちたので止めた。本番は変わっていない。
$(echo "$out" | tail -15)"
    return 1
  fi
  if ! out="$(npx tsc --noEmit 2>&1)"; then
    report failed "$sha" "型チェック（tsc）が落ちたので止めた。本番は変わっていない。
$(echo "$out" | tail -30)"
    return 1
  fi

  # git に入れていないフォルダ（ver2 の mf/）は いまの本番から取ってきて一緒に出す（取れなければ出さない＝消さない）
  if [ -n "${KEEP:-}" ]; then
    if ! out="$(node "$D/prod.mjs" pull . "$KEEP" 2>&1)"; then
      report failed "$sha" "いまの本番から $KEEP を取ってこられなかったので止めた（出すと本番から消える）。本番は変わっていない。もう一度 push する。
$out"
      return 1
    fi
    echo "$out"
  fi

  status "動いている: ${sha:0:7} をビルド中"
  if ! out="$("${VC[@]}" pull --yes --environment=production 2>&1)"; then
    report failed "$sha" "Vercel から本番の設定を取れなかったので止めた。本番は変わっていない。
$(echo "$out" | tail -10)"
    return 1
  fi
  # 中身が見えない環境変数（Vercel の Sensitive）はビルドのときだけ空になる。動くときは Vercel が入れるので、知らせるだけ（VERCEL_GIT_… など Vercel が自分で入れるものは数えない）
  warn="$(grep -E '^[A-Z0-9_]+=""?$' .vercel/.env.production.local 2>/dev/null | cut -d= -f1 | grep -v '^VERCEL_' | tr '\n' ' ')"
  if ! out="$("${VC[@]}" build --prod --yes 2>&1)"; then
    report failed "$sha" "ビルド（next build）が落ちたので止めた。main も本番も前のまま。
$(echo "$out" | tail -30)"
    return 1
  fi

  # 先に GitHub の main を進める（次の照合の基準になる）。だれかが先に main を進めていたら最初からやり直す
  if ! out="$(git push origin "HEAD:main" 2>&1)"; then
    status "main の push に失敗（先に進んだ？）。最初からやり直す: $(echo "$out" | tail -2)"
    return 2
  fi
  status "動いている: ${sha:0:7} を main に push した。vercel deploy 中"

  out="$("${VC[@]}" deploy --prebuilt --prod --yes --meta ghDeploy=actions --meta "ghSha=$merged" --meta "ghBranch=$branch" 2>&1)"; rc=$?
  url="$(echo "$out" | grep -Eo 'https://[a-z0-9-]+\.vercel\.app' | head -1)"
  if [ $rc -ne 0 ] || [ -z "$url" ]; then
    report failed "$sha" "main への取り込み・tsc・ビルドは通ったが、Vercel へのデプロイが失敗した。本番は前のまま。
GitHub の main には入っているので、直して push すれば次で一緒に出る。
$(echo "$out" | tail -15)"
    return 1
  fi
  status "待機中（最後に出したのは ${sha:0:7}）"
  report ok "$sha" "本番に出した。https://$PROD_HOST （${url}）
取り込み: $branch (${sha:0:7}) → main (${merged:0:7})${warn:+
ビルドのときに中身が空だった環境変数（Sensitive）: $warn}"
  return 0
}

run() { # run <branch> <sha>
  local subj r n
  subj="$(git log -1 --format=%s "$2")"
  case "$subj" in wip:*|WIP:*|Wip:*) echo "$1 ${2:0:7} は wip: なので出さない"; return 0 ;; esac
  for n in 1 2 3; do
    process "$1" "$2"; r=$?
    [ $r -eq 2 ] || return 0
  done
  report failed "$2" "main が何度も先に進んでいて取り込めなかった。本番は変わっていない。もう一度 push する。"
}

git fetch -q origin main "+refs/heads/claude/*:refs/remotes/origin/claude/*" --tags --force
"${VC[@]}" link --yes --project "$VERCEL_PROJECT" >/dev/null 2>&1 || { status "vercel link できない（VERCEL_TOKEN の権限？）"; exit 1; }

# 1) push されたブランチの いまの先頭（続けて push されていれば最新の分）
own="$(git rev-parse -q --verify "refs/remotes/origin/$BRANCH" || true)"
[ -n "$own" ] && run "$BRANCH" "$own"

# 2) ほかの claude/* で出し損ねた分（24時間以内・SETTLE 秒より前のコミット・結果のタグが無い・main に無い）
now="$(date +%s)"
while read -r sha ref; do
  [ -z "$sha" ] && continue
  b="${ref#refs/remotes/origin/}"
  [ "$b" = "$BRANCH" ] && continue
  t="$(git log -1 --format=%ct "$sha")"
  [ $((now - t)) -lt "${SETTLE:-60}" ] && continue
  [ $((now - t)) -gt 86400 ] && continue
  git fetch -q origin main
  handled "$sha" && continue
  echo "出し損ねた分を拾う: $b ${sha:0:7}"
  run "$b" "$sha"
done < <(git for-each-ref --format='%(objectname) %(refname)' 'refs/remotes/origin/claude/')
exit 0
