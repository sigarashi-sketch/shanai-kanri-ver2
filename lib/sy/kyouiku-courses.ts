// 教育コンテンツのコース一覧（2026-10-02 shoya「増えてきたから選べるように」）。受講ページの最初に出す「コースを選ぶ」の中身（この画面だけはモダンな見た目・ふつうの日本語）。
//   ready=false は「準備中」と出すだけ（押せない）。中身ができたら ready を true にして、LearnView に入口を足す
//   ・スプレッドシート 関数 基本編（id は excel のまま）= いまあるスプシ講座（lib/kyouiku-lessons.ts の4ワールド）。2026-10-11 shoya「エクセルではなく スプレッドシートに・関数 基本編みたいな感じで」＝名前を変えた（それまでは「エクセル」）。短く書く所（上の帯・サムネイルの題字）は「スプレッドシート」
//   ・応用編（oyo）= 基本編の先の関数を 1つ1レッスンで（lib/oyo・components/kyouiku/oyo）。本人のスプシは 基本編と同じ1冊に タブを足す
//   ・実務編（jitsumu）= 現場から届く汚い表を 直して→確かめて→数字で報告する（lib/jitsumu・components/kyouiku/jitsumu・2026-10-12）。手本は Excel 研修の背骨（移動と選択→データクレンジング→チェック→集計）。本人のスプシは 基本編と同じ1冊に タブを足す
//   ・ITパスポート（ipass）= 1日10問の4択・3分野の合格予測・週ランキング（lib/ipass・components/kyouiku/ipass・2026-10-12・docs/kyouiku-ipass.md）
//   ・関数道場（dojo）= シートを開かずに 画面の中で式を打つ稽古（lib/dojo・components/kyouiku/dojo）。カード・稽古5種・昇段審査（初段〜七段）
//   ・CCNA = 講義（章ごとに 解説→穴埋め・lib/ccna/lecture・components/kyouiku/ccna/LectureView）がメイン。くさむらで出会って捕まえる型（docs/kyouiku-ccna.md）は おまけの復習（2026-10-09 shoya）。人ごとにオンにした人だけ入れる
//   ・タイピング = 会話の文をローマ字で打ってつなぐゲーム（lib/kyouiku-typing.ts・全員に開いている）
//   ・デザインリテラシー = 本人用の Google スライドで「直す前」のスライドを直す（lib/design・初級/中級/上級の24レッスン）。営業中（おためし）の人には出さない（LearnView が closed で閉じる）
//   ・MOS Excel = 本人のパソコンの Excel で練習し、保存したファイルをサーバが読んで採点する（lib/mos・docs/kyouiku-mos.md）
//   ・キッティングから情シスへ = 基礎編（確認テスト）→ 実践編（成果物を出して 内勤のレビュー）→ 試験対策編（資格 AB-900）の型（lib/course・components/kyouiku/course・2026-10-09）。担当者が人ごとにオンにした人だけ。オフの人には 行ごと出さない（LearnView が hidden で消す）
//   ・プログラミング／AI駆動開発／Claude Code 初級編／生成AI／データサイエンス／インフラ・クラウド編／データベース／SQL／機械学習／コマンドラインは中身がまだ無い
// cat = カテゴリ（2026-10-05 shoya「カテゴリで分けようか。事務 インフラ プログラミング デザイン AI」）。コースを選ぶ画面は この順に かたまりで並べる
//   どのコースを どこに入れたかは Claude の判断（shoya が決めたのは カテゴリの名前と順だけ）。足すときは CATEGORIES と 各コースの cat の両方
//   2026-10-12 shoya「インフラに入れるんじゃなくて ITスキルとして」「タイピングも独立したカテゴリに」＝ITスキル（ITパスポート）と タイピング を足した
export const CATEGORIES = [
  { id: 'office', name: '事務' }, { id: 'typing', name: 'タイピング' }, { id: 'it', name: 'ITスキル' }, { id: 'infra', name: 'インフラ' }, { id: 'programming', name: 'プログラミング' }, { id: 'design', name: 'デザイン' }, { id: 'ai', name: 'AI' },
] as const;
export type CategoryId = typeof CATEGORIES[number]['id'];
// ★コースを足す時は サムネイルも必ず作る（2026-10-09 shoya・作り方は docs/kyouiku-thumb.md）
// thumb = コースのサムネイル（2026-10-09 shoya「要はサムネイル作ればいい」）。絵（public/bdash/thumb/<id>.jpg・shoya が画像生成で用意）の上に、題字・ひとこと・チェック項目・帯を コードで重ねる
//   （components/kyouiku/CourseThumb.tsx。画像生成に日本語の字を描かせると崩れるので 字は絵に入れない）。絵がまだ無いコースは thumb を書かない＝サムネイルは出ない
//   color = 題字の色／tag = 上の ひとこと（「|」より後ろは 黄色）／points = チェック項目（3つまで）／bar = 下の帯
//   title = 題字を コース名と変えたい時だけ（名前が長くて 小さくなりすぎるコース）
export interface CourseThumbInfo { img: string; color: string; tag: string; points: string[]; bar: string; title?: string }
// level = 難易度のバッジ（2026-10-09 shoya「他の講座より難易度高めだから バッジを」）。書いたコースにだけ出る（コースを選ぶ画面の 行と説明・コースの中の先頭）。いまは キッティングだけ
export interface CourseLevel { label: string; note: string }
export interface Course { id: string; name: string; sub: string; ready: boolean; cat: CategoryId; thumb?: CourseThumbInfo; level?: CourseLevel }
export const COURSES: Course[] = [
  { id: 'excel', name: 'スプレッドシート 関数 基本編', sub: '表計算の基本から、関数を使った集計・請求書づくりまで。自分専用のスプレッドシートで、手を動かして覚えます。', ready: true, cat: 'office', thumb: { img: '/bdash/thumb/excel.jpg', color: '#0b8043', title: 'スプレッドシート', tag: '関数|基本編', points: ['表計算の基本から', '集計・関数・請求書づくりまで', '自分専用のシートで手を動かす'], bar: '動画つき・PCで練習・修了テストあり' } },
  { id: 'jitsumu', name: 'スプレッドシート 実務編', sub: '現場から届く「汚い表」を、そのまま使える表に直して 数字で報告する。数値と文字の見分け方・表記ゆれ・空白・全角・文字の日付・重複・抜けを直し、プルダウンや保護で 共有の表を壊さない作法、ピボットで集計して報告の一文まで。', ready: true, cat: 'office', thumb: { img: '/bdash/thumb/jitsumu.jpg', color: '#0b8043', title: 'スプレッドシート', tag: '実務編|汚い表を直す', points: ['表記ゆれ・重複・抜けを直す', '共有の表を壊さない作法', 'ピボットで集計して報告'], bar: '現場の依頼14本・大きい表で練習・修了テストあり' } },   // 2026-10-12。入れるのは lib/jitsumu/lessons.ts の JITSUMU_LIVE が true で おためしでない人と super admin（LearnView が closed で閉じる）。絵は 応用編の絵を寄せて色を変えた仮（docs/kyouiku-jitsumu.md）
  { id: 'oyo', name: 'スプレッドシート 関数 応用編', sub: 'QUERY・IMPORTRANGE・FILTER・XLOOKUP など、基本編の先の関数を 1つずつ。集計表を式1つで作り、別のシートとつなげるところまで進みます。', ready: true, cat: 'office', thumb: { img: '/bdash/thumb/oyo.jpg', color: '#0b8043', title: 'スプレッドシート', tag: '関数|応用編', points: ['QUERY・IMPORTRANGE・FILTER', '集計表を 式1つで作る', '別のシートと つなげる'], bar: '基本編の先へ・関数1つ＝1レッスン・修了テストあり' } },   // 2026-10-11。入れるのは lib/oyo/lessons.ts の OYO_LIVE が true で おためしでない人と super admin（LearnView が closed で閉じる）。見た目は リッチだけ
  { id: 'dojo', name: '関数道場', sub: '関数をくり返し鍛える場所。シートは開かず、画面の中の小さい表に式を打って その場で判定します。カード集め・10本組手・依頼・こわれた式・早打ち・逆引きクイズ、昇段審査は初段から七段まで。', ready: true, cat: 'office', thumb: { img: '/bdash/thumb/dojo.jpg', color: '#9a3412', tag: '関数を|くり返し鍛える', points: ['シートを開かず その場で判定', '組手・早打ち・逆引きクイズ', '昇段審査は 初段から七段'], bar: 'カード集め・稽古5種・昇段審査' } },   // 2026-10-11。lib/dojo。入れるのは DOJO_LIVE が true で おためしでない人と super admin。サムネイルは 人物なし（道場の絵だけ・2026-10-11 shoya）
  { id: 'mos', name: 'MOS Excel', sub: 'Excel の資格 MOS（一般レベル）の合格をめざします。自分のパソコンの Excel で 1つずつ操作して、最後は本番と同じ形の模擬試験まで。', ready: true, cat: 'office', thumb: { img: '/bdash/thumb/mos.jpg', color: '#107c41', tag: '資格で|実力を証明', points: ['MOS 一般レベルの合格をめざす', '自分の Excel で1つずつ操作', '本番と同じ形の模擬試験つき'], bar: '出題範囲を順に練習・模擬試験で仕上げ' } },   // 入れるのは lib/mos の MOS_LIVE が true で おためしでない人と super admin（LearnView が closed で閉じる）。見た目は ゲーム風／リッチを選べる
  { id: 'typing', name: 'タイピング', sub: 'キーボードを速く、正確に打てるように。会話の文を打ってつなぐゲームで、楽しみながら練習します。', ready: true, cat: 'typing', thumb: { img: '/bdash/thumb/typing.jpg', color: '#c2255c', tag: '速く 正確に|打てる', points: ['ゲームで楽しく練習', '電話対応・メールの文を打つ', '検定で 級がつく'], bar: 'ローマ字入力・PCで練習・だれでも入れます' } },
  { id: 'design', name: 'デザインリテラシー', sub: '文字の大きさ・色・余白・図解の基本。パワポやスライドで、見やすく伝わるビジネス資料を作れるようになります。', ready: true, cat: 'design', thumb: { img: '/bdash/thumb/design.jpg', color: '#c2410c', title: 'デザイン', tag: '見やすく|伝わる資料に', points: ['文字・色・余白・図解の基本', '初級・中級・上級の24レッスン', 'Google スライドで自動採点'], bar: 'デザインリテラシー・パワポでも使える' } },   // 営業中の人には出さない
  { id: 'ipass', name: 'ITパスポート', sub: 'ITの入口の国家資格。1日5分・10問の4択で、ストラテジ・マネジメント・テクノロジの3分野を、IPA の過去問で鍛えます。まちがえた問題は 忘れたころにもう一度。合格予測と 週ランキングつき。スマホで解けます。', ready: true, cat: 'it', thumb: { img: '/bdash/thumb/ipass.jpg?v=2', color: '#1a56c4', title: 'ITパスポート', tag: '1日5分で|国家資格へ', points: ['IPA の過去問 2,400問', '合格予測と 週ランキング', 'スマホで解ける4択'], bar: '毎日10問・ミニ模試・資格手当の対象' } },   // 2026-10-12。lib/ipass。入れるのは IPASS_LIVE が true で 管理画面の「解放」で開いている人（最初は 参画決定前から）と super admin。絵は スキルチェックの絵を寄せた仮（docs/kyouiku-ipass.md）
  { id: 'ccna', name: 'CCNA', sub: 'ネットワークの資格。章ごとに解説を読んで、穴埋めで確かめながら 試験の6分野を基礎から順に身につけます。', ready: true, cat: 'infra', thumb: { img: '/bdash/thumb/ccna.jpg', color: '#0369a1', tag: 'ネットワークの|資格をとる', points: ['6分野を 章ごとの講義で', '解説を読んで 穴埋めで確かめる', '6分野を 順番に 合格していく'], bar: 'ネットワークの基礎から 順に身につける' } },   // 入れるのは manager がオンにした人と 勉強会（火・木・土）の回答に名前がある人（lib/kyouiku-release.ts ccnaByStudy。LearnView が closed で閉じる）
  { id: 'ccnaprep', name: 'CCNA 試験対策', sub: '本番に近い形式の練習問題（選択問題・ドラッグ＆ドロップ・シミュレーション）と、週ごとのテストの成績表。', ready: true, cat: 'infra', thumb: { img: '/bdash/thumb/ccnaprep.jpg', color: '#b45309', title: '試験対策', tag: 'CCNA|合格まで仕上げる', points: ['本番に近い形式の練習問題', '選択・並べ替え・シミュレーション', '週ごとのテストと成績表'], bar: 'CCNA 試験対策・形式に慣れて 本番へ' } },   // 買った 練習問題。人ごとにオンにした人だけ（lib/ccna/prep.ts）。オフの人には 行ごと出さない（LearnView が hidden で消す）
  { id: 'kitting', name: 'キッティングから情シスへ', sub: 'いまの現場の作業を、情シス・ヘルプデスクの仕事につなげる講座。アカウント管理・端末管理・問い合わせ対応・自動化を自分の手で試してスキルシートに書ける実績を積み上げ、最後に Microsoft の資格 AB-900 の合格をめざします。', ready: false, cat: 'infra', thumb: { img: '/bdash/thumb/kitting.jpg', color: '#0f766e', title: 'キッティング', tag: '現場から|資格と情シスへ', points: ['AD・Microsoft 365・Intune を試す', 'スキルシートに書ける実績に', '資格 AB-900 の合格をめざす'], bar: 'キッティングから 情シス・ヘルプデスクへ' }, level: { label: '上級', note: 'ほかのコースより難しめです。自分のPCに検証用のサーバーを立てるなど、1回 1〜2時間の実習があります。基礎編（第0〜2回）は読んで確認テストに答えるだけなので、まずはそこから。最後は資格試験 AB-900 の対策まで進みます。' } },   // 2026-10-19 shoya「準備中のカードにして中に入れないように」＝ready: false（だれも入れない・API も止まる）。戻すときは true に。true の間は 担当者がオンにした人だけ（lib/course/store.ts isCourseOn）・オフの人には 行ごと出さない
  { id: 'programming', name: 'プログラミング', sub: 'コードを書いて、動かすところから。', ready: false, cat: 'programming' },
  // ↓ 2026-10-02 shoya「準備中にして欲しい」＝名前だけ先に出す（中身はまだ無い）
  { id: 'aidev', name: 'AI駆動開発', sub: 'AI に指示を出して、いっしょにアプリを作る開発のしかた。考え方と進め方の基本を学びます。', ready: false, cat: 'ai' },
  { id: 'claudecode', name: 'Claude Code 初級編', sub: 'AI と会話しながらコードを書く道具 Claude Code。入れ方と基本の使い方から。', ready: false, cat: 'ai' },
  { id: 'genai', name: '生成AI', sub: '生成AI のしくみと、仕事での使いどころ。伝わる指示の書き方を身につけます。', ready: false, cat: 'ai' },
  { id: 'datascience', name: 'データサイエンス', sub: 'データを集めて、整えて、読み解く。数字から答えを出す基本を学びます。', ready: false, cat: 'ai' },
  { id: 'infra', name: 'インフラ・クラウド編', sub: 'サーバー・ネットワーク・クラウドの基本。システムが動く土台を学びます。', ready: false, cat: 'infra' },
  { id: 'database', name: 'データベース', sub: 'データをためて、取り出すしくみ。表の考え方と設計の基本を学びます。', ready: false, cat: 'programming' },
  { id: 'sql', name: 'SQL', sub: 'データベースに聞くための言葉。ほしいデータを取り出す書き方を、手を動かして覚えます。', ready: false, cat: 'programming' },
  { id: 'ml', name: '機械学習', sub: 'データから決まりを見つけて、予測するしくみ。考え方と基本の流れを学びます。', ready: false, cat: 'ai' },
  { id: 'cli', name: 'コマンドライン', sub: '文字でパソコンを動かす黒い画面。現場でよく使う基本のコマンドを身につけます。', ready: false, cat: 'infra' },
];
// スキルチェック（lib/kyouiku-check.ts）のサムネイル。コースではないが 同じ形で出す（コースを選ぶ画面の [0] の行の下・スキルチェックの案内）
export const CHECK_THUMB = { id: 'check', name: 'スキルチェック', thumb: { img: '/bdash/thumb/check.jpg', color: '#1a56c4', tag: 'まずは|力だめし', points: ['事務・IT・マナー・タイピング', '4択と入力で 15分ほど', 'いまの力が点数でわかる'], bar: '何度でも受けられます・成績には関係ありません' } satisfies CourseThumbInfo };
export const courseOf = (id: string | null | undefined) => COURSES.find((c) => c.id === id && c.ready) || null;
