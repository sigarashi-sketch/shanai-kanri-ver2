// CCNA の講義（メインの教材・2026-10-09 shoya「ポケモンテイストは遊びにして補助的に。解説文のあとに 穴埋めで選択肢の単語を入れる問題」）
//   章ごとに 解説（Markdown）を読む → 穴埋め（文の［ ］に 選択肢の単語を入れる）。全部の穴が合ったら その章は合格で、次の章が開く
//   ここは画面とサーバの両方が使う（正解は入れない）。中身と正解は lib/ccna/lecture/（サーバだけ）
export interface LecBlankView { i: number }                 // 穴（章の中の通し番号）
export type LecPart = string | LecBlankView;                // 穴埋めの文 = 文字と穴を並べたもの
export interface LecQuizView { parts: LecPart[]; bank: string[] }   // bank = 選択肢（正解＋まぎらわしい語・まぜてある）
export interface LecChapterView { id: string; area: number; no: number; title: string; goal: string; body: string; quiz: LecQuizView[]; blanks: number }
export interface LecChapterSum { id: string; area: number; no: number; title: string; goal: string; blanks: number; passed: boolean; open: boolean; tries: number }
export interface LecState { chapters: LecChapterSum[] }
//   答え合わせの結果: 穴ごとの ○×。全部 ○ なら passed。explain = 間違えた穴がある問題の解説（何問目か）
export interface LecCheck { ok: boolean[]; passed: boolean; explain: { q: number; text: string }[] }
