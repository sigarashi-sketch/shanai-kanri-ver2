// 講義の中身の書き方（サーバだけが読む。正解が入っている）
//   body  = 解説（Markdown。使える書き方は components/kyouiku/course/Md.tsx にあるものだけ: ## 見出し / ### 小見出し / - 箇条書き / 1. 番号 / | 表 | / ~~~ コード / > 引用 / **太字**）
//   quiz  = 解説のあとの穴埋め。text の 全角の［ ］で囲んだ語が 正解（例: 'IPv4 アドレスは［32］ビットです'）。1問に 穴は 1〜3つ
//           extra = まぎらわしい選択肢（正解と同じ種類の語・2〜4つ）。選択肢 = その問題の正解＋extra
//           explain = 間違えたときに出す ひとこと解説
//   id は あとから変えない（記録のキー）。章の順番は 配列の順
export interface LecQuiz { text: string; extra: string[]; explain: string }
export interface LecChapter { id: string; area: number; title: string; goal: string; body: string; quiz: LecQuiz[] }
