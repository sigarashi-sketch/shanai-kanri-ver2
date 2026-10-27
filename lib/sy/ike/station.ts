// ★いけいけどんどん legacy/api/_station.ts の写し（2026-09-30）
// 駅名の正規化（現場の最寄り駅・要員の最寄り駅で共通）。
//   先頭 _ で Vercel の関数ルーティングから除外。純関数だけ＝テスト対象。
//
//   ★なぜ既存の tidyEki(_shoudaku.ts) と別に作るのか（2026-07-31 shoya 依頼）
//     tidyEki は「1セルから駅を1つだけ拾う」前提で、承諾者取込の書き込み経路で使っている。
//     ・現場の最寄り駅は「毎日現場が違う」人がいて、1つに丸めると情報が消える
//     ・実データは自由記述で、路線名・徒歩分数・複数駅・カッコ書きが混ざる
//     そのため「複数駅を複数のまま返す」パーサを新設した。
//     ※ tidyEki の挙動は変えない。あちらを触ると basic_info / 営業リスト / 地図に
//       保存済みの駅名が一斉に変わるため、この新パーサは読み取り・表示側だけで使う。
//
//   方針: 落とせない文字列は捨てずに note に残す。
//     「よく分からない書き方だったので空にしました」を作らない＝現物を人が見て直せる。

export interface StationParse {
  raw: string;         // 入力そのまま（trim のみ）
  stations: string[];  // 正規化した駅名（'五反野駅'）。重複除去・入力順
  display: string;     // stations.join('・')。駅が取れなければ ''
  junk: boolean;       // 「なし」「未定」など、駅として無効
  daily: boolean;      // 「日によって違う」系の但し書き、または日付ごとの列挙がある
  remote: boolean;     // リモート/在宅と書かれている（＝通勤の駅が無い）
  note: string;        // 駅として解釈できなかった残り（人が見て判断する用）
}

// 鉄道事業者。駅名の前に付くことがある（「JR五反野」「東京メトロ北千住」）。
//   長いものから消したいので、使う直前に長さ順へ並べ替える。
const OPERATORS = [
  'JR東日本', 'JR西日本', 'JR東海', 'JR九州', 'JR北海道', 'JR四国', 'JR',
  '東京メトロ', '東京地下鉄', 'メトロ', '都営地下鉄', '都営', '東京都交通局',
  '東急電鉄', '東急', '京王電鉄', '京王', '小田急電鉄', '小田急', '西武鉄道', '西武',
  '東武鉄道', '東武', '京成電鉄', '京成', '京浜急行', '京急', '相模鉄道', '相鉄',
  'つくばエクスプレス', 'TX', 'ゆりかもめ', 'りんかい', '横浜市営', '横浜市交通局',
  '名古屋市営', '大阪メトロ', 'Osaka Metro', '大阪市営', '阪急電鉄', '阪急',
  '阪神電鉄', '阪神', '近鉄', '南海電鉄', '南海', '北総', '新京成', '埼玉高速',
  '多摩都市モノレール', '東京モノレール', 'モノレール', '日暮里舎人ライナー', '舎人ライナー',
];

// 駅として無効な値（「最寄り駅なし」等）。比較は記号・空白を落として行う。
const JUNK = [
  'なし', '無し', '特になし', 'とくになし', '未定', '未確定', '確認中', '調整中',
  '不明', '未記入', '未入力', '記載なし', '該当なし', 'ー', '—', '–', '-', '－', '−',
  'none', 'na', 'n/a', 'tbd', '?', '？', '同上', '上記', '＊', '*',
];

// 「日によって現場が変わる」ことを示す表現。駅が1つに決まらない人の印。
const DAILY_HINTS = [
  '日によって', '日により', '日ごと', '日毎', '毎日変わる', '毎日違う', '都度', 'その都度',
  '現場による', '案件による', '現場ごと', '複数現場', '変動', '不定', 'バラバラ', 'ばらばら',
  '常駐先による', '派遣先による', '直行直帰',
];

// リモート勤務の表明。駅が書かれていないのが正しい状態＝「未記入」とは区別する。
//   実データ例: '完全フルリモート'（2026年07月タブ）
const REMOTE_HINTS = ['フルリモート', 'フルリモ', '完全リモート', 'リモート', '在宅', 'テレワーク', '出社なし'];

// 日付ごとに現場を書く人の表記。実データ例: '7/29 新百合ケ丘駅 7/30 上尾駅  7/31 高砂駅'
//   「日によって」と書いていなくても、実態は日別に現場が違う＝daily として扱う。
const DATE_LIKE = /(\d{1,2}\s*[/／\-月]\s*\d{1,2}\s*日?)|([月火水木金土日]曜)/;

// 駅名になりえない語（分割後のトークンをここで捨てる）。
const STOPWORDS = [
  '徒歩', 'バス', 'タクシー', '電車', '車', '自転車', '送迎', '分', '駅', '最寄', '最寄り',
  '勤務地', '現場', '常駐先', '派遣先', '客先', '就業場所', '所在地', '住所',
  'から', 'まで', 'または', '又は', 'もしくは', 'および', '及び', 'ほか', '他', '等', 'など',
  'あたり', '付近', '周辺', '方面', '沿線', '予定', '想定', '在宅', 'リモート', 'フルリモート',
  'テレワーク', '自宅', '不明', '未定',
];

// 「駅」と書かれていない塊を駅名として採用してよいかの判定に使う。
//   これが無いと『客先ビル内につき要確認』が丸ごと "客先ビル内につき要確認駅" になる。
//   駅名にはまず現れない語を部分一致で弾き、あとは長さと文字種で見る。
const NOT_STATION_HINTS = [
  '変動', '不定', '直行', '直帰', '確認', '相談', '都度', '現場', '客先', '常駐', '派遣',
  'なし', '無し', '未定', '未確', '在宅', 'リモート', 'テレワーク', '自宅', 'ビル', '本社',
  'につき', 'ため', 'による', 'により', 'ごと', '毎日', '複数', 'その他', '予定', '想定',
  '沿線', '方面', 'バラバラ', 'ばらばら', '要員', '案件', '不明', '記載', '同上',
  // 案件サマリー本文から拾うようになって出てきた誤り（2026-07-31 実データ）:
  //   '品川フル出社' → 品川フル出社駅 / '週1出社' → 週1出社駅 / '23区内' → 23区内駅
  '出社', '併用', '区内', '都内', '県内', '業務', '内容', '工程', '期間', '単価', '募集', '面談',
  // 地の文が駅名になるのを止める（'吉祥寺から程度の場所駅' 'Linuxサーバ上で稼働駅' 等）。
  //   駅名は短い固有名詞なので、助詞・動詞・案件用語を含む塊は駅ではないと判断してよい。
  'から', 'まで', 'ので', 'ため', 'など', '程度', 'および', 'における', 'による', 'に関',
  '場所', 'オフィス', 'スキル', '設計', '開発', 'テスト', '運用', '保守', '稼働', 'サーバ',
  'キャンペーン', '人数', '希望', '可能', '担当', '言語', '必要', '経験', '予算', '客様',
  // 案件サマリー抽出の2周目で出た誤り（2026-07-31 実データ）:
  //   'キャッチアップ駅' '無料の送迎バス駅' '徒歩7駅' '甲府に出張有り駅' '参画直後1駅'
  '徒歩', '出張', 'キャッチアップ', '送迎', 'セットアップ', '直後', '定期', '初期',
  '現在', 'その後', '参画', '導入', '当初', '以降', 'ユーザ', 'ユーザー',
];

// 駅名の末尾には来ない語（建物名を駅にしないため）。部分一致にすると
//   「センター南」「センター北」のような実在駅を殺すので、末尾一致だけで判定する。
const NOT_STATION_SUFFIX = ['センター', 'タワー', 'ルーム', 'オフィス', 'ビル', 'プロジェクト', '支店', '本社', '工場', '倉庫', 'ホール'];

function nfkc(s: string): string {
  try { return s.normalize('NFKC'); } catch { return s; }
}

// 比較用に記号・空白を落とす。
function squash(s: string): string {
  return nfkc(s).replace(/[\s　。、,，.・…:：;；'"「」『』()（）\[\]【】]/g, '').toLowerCase();
}

export function isJunkStation(raw: unknown): boolean {
  const s = squash(String(raw == null ? '' : raw)).replace(/駅$/, '');
  if (!s) return true;
  return JUNK.indexOf(s) !== -1;
}

// 突合キー。表記ゆれを吸収して「同じ駅か」を判定するためだけに使う（表示には使わない）。
//   ヶ/ケ/ガ、ノ/之、旧字体の一部、長音・中黒を畳む。
export function stationKey(raw: unknown): string {
  let s = squash(String(raw == null ? '' : raw));
  s = s.replace(/駅$/, '');
  s = s.replace(/[ヶヵケヶ]/g, 'ケ');
  s = s.replace(/[ノ之]/g, 'ノ');
  s = s.replace(/[ー−–—-]/g, '');
  s = s.replace(/[髙]/g, '高').replace(/[﨑]/g, '崎').replace(/[濵濱]/g, '浜');
  return s;
}

// 1トークン → 駅名（取れなければ ''）。
function toStation(tokenRaw: string): string {
  let t = nfkc(tokenRaw).trim();
  if (!t) return '';

  // 括弧の中身は路線名・補足が多い。中身は別トークンとして呼び側が処理済みなのでここでは落とす。
  t = t.replace(/[（(][^）)]*[）)]/g, '').replace(/[【\[][^】\]]*[】\]]/g, '');
  // 「徒歩5分」「バス10分」などの所要時間表現。
  t = t.replace(/(徒歩|バス|タクシー|車|自転車)\s*(で|にて)?\s*(約)?\s*\d+\s*分/g, '');
  t = t.replace(/約?\s*\d+\s*分/g, '');
  // 出社頻度の後置き（'品川フル出社' '週1出社' '新宿常駐'）。実データで駅名にくっついて来る。
  t = t.replace(/(フル|完全|基本|原則|ほぼ|週\s*\d+\s*回?|月\s*\d+\s*回?)?(出社|常駐)$/g, '');
  // 「〜駅より」「〜駅から」等の助詞。
  t = t.replace(/(より|から|まで|辺り|あたり|付近|周辺|近く|近辺|方面)$/g, '');
  t = t.replace(/(駅前|駅近|駅チカ|駅ちか)$/g, '駅');

  // 路線名の前置き（「山手線五反田」「東武スカイツリーライン五反野」）を落とす。
  //   「○○線」「○○ライン」で終わる塊が先頭にあれば、その後ろを駅名候補にする。
  t = t.replace(/^[^\s]{1,12}?(線|ライン)(?=.)/, '');
  // 事業者名の前置き。長い名前から順に消す。
  for (const op of [...OPERATORS].sort((a, b) => b.length - a.length)) {
    if (t.startsWith(op)) { t = t.slice(op.length); break; }
  }
  t = t.replace(/^[\s　・:：/／|｜-]+/, '').replace(/[\s　・:：/／|｜]+$/, '').trim();
  if (!t) return '';

  // 路線名・事業者名だけの塊は駅ではない。
  if (/(線|ライン)$/.test(t)) return '';
  if (OPERATORS.some((op) => t === op)) return '';
  // 語尾の「駅」を一旦外して中身を検査する。
  const core = t.replace(/駅$/, '').trim();
  if (!core) return '';
  if (STOPWORDS.indexOf(core) !== -1) return '';
  if (isJunkStation(core)) return '';
  if (/^\d+$/.test(core)) return '';          // 数字だけ（分数の残骸）
  // 記号だけ・アルファベット1文字などを弾く。
  if (!/[ぁ-んァ-ヶ一-龥ａ-ｚA-Za-z]/.test(core)) return '';
  // 駅名にまず現れない語を含む塊は駅にしない（文章をそのまま駅名にしないための歯止め）。
  if (NOT_STATION_HINTS.some((w) => core.indexOf(w) !== -1)) return '';
  if (NOT_STATION_SUFFIX.some((w) => core.endsWith(w))) return '';

  // 「駅」と明記されていた場合は、多少長くても本人の申告を尊重して採用する。
  const declared = /駅$/.test(t);
  if (!declared) {
    // 「駅」と書かれていない塊は、駅名として無理のない長さ・文字種のときだけ採用する。
    if (core.length > 12) return '';
    // 1文字の塊は駅にしない。項目名の切れ端（'単 価：' の「単」等）を駅にしてしまうため。
    if (core.length < 2) return '';
    // 数字を含む塊は駅にしない（'2拠点' '4日程' '1ヶ月後' '9F' '麹町4丁目' など全部これ）。
    //   「北24条」のように数字を含む実在駅は「駅」と明記された場合だけ通す。
    if (/[0-9]/.test(core)) return '';
    // 日本語と英字が混ざる塊も駅にしない（'富士通Japan' 等の社名・建物名）。
    if (/[A-Za-z]/.test(core) && /[ぁ-んァ-ヶ一-龥]/.test(core)) return '';
    if (!/^[ぁ-んァ-ヶ一-龥ー々〇a-zA-Z0-9]+$/.test(core)) return '';
  } else if (core.length > 20) {
    return '';
  }

  return core + '駅';
}

// 自由記述の駅欄を解析する。現場・要員どちらの最寄り駅にも使う。
export function parseStations(raw: unknown): StationParse {
  const rawStr = String(raw == null ? '' : raw).trim();
  const out: StationParse = { raw: rawStr, stations: [], display: '', junk: false, daily: false, remote: false, note: '' };
  if (!rawStr) { out.junk = true; return out; }
  if (isJunkStation(rawStr)) { out.junk = true; return out; }

  const src = nfkc(rawStr);
  // 「日によって」と明記されている場合と、日付を並べて書いている場合の両方を daily とする。
  out.daily = DAILY_HINTS.some((h) => src.indexOf(h) !== -1) || DATE_LIKE.test(src);
  out.remote = REMOTE_HINTS.some((h) => src.indexOf(h) !== -1);

  // 括弧の中身も候補に含める（「五反野（または北千住）」の北千住を拾うため）。
  //   路線名だけのカッコは toStation 側で落ちる。
  const inner: string[] = [];
  const reParen = /[（(【\[]([^）)】\]]*)[）)】\]]/g;
  let m: RegExpExecArray | null;
  while ((m = reParen.exec(src)) !== null) inner.push(m[1]);

  // ラベル（「最寄り駅:」等）を落としてから分割する。
  let body = src.replace(/(最寄り?駅|最寄り?|勤務地|就業場所|現場|常駐先|派遣先|客先)\s*[:：]/g, ' ');
  body = body.replace(/[（(【\[][^）)】\]]*[）)】\]]/g, ' ');

  const SEP = /[\s　、,，・･/／|｜&＆＋+\n\r]+|または|又は|若しくは|もしくは|および|及び|あるいは|\bor\b|\band\b|～|〜|~/gi;
  const tokens = [...body.split(SEP), ...inner.flatMap((x) => x.split(SEP))]
    .map((t) => String(t || '').trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const leftovers: string[] = [];
  for (const tk of tokens) {
    const st = toStation(tk);
    if (!st) {
      // 但し書き（「日によって変動」等）は note に残す。純粋なノイズは残さない。
      const c = squash(tk);
      if (c && STOPWORDS.indexOf(tk.trim()) === -1 && !/^\d+分?$/.test(c) && !/(線|ライン)$/.test(tk.trim())) {
        leftovers.push(tk.trim());
      }
      continue;
    }
    const key = stationKey(st);
    if (seen.has(key)) continue;
    seen.add(key);
    out.stations.push(st);
  }

  out.display = out.stations.join('・');
  out.note = leftovers.join(' ').trim();
  // リモート表明で駅が無いのは「書き忘れ」ではなく正しい状態なので junk 扱いにする
  //   （未記入との区別が付くよう note には元の文言を残す）。
  if (!out.stations.length && out.remote) out.junk = true;
  if (!out.stations.length && !out.note) out.junk = true;
  return out;
}

// =============================================================================
//  案件サマリーの本文から現場の駅を拾う
//
//   ★背景（2026-07-31 実データ）
//     「参画案件の最寄り駅」列は 964名中 22名(2%)しか埋まっていない。
//     一方で案件サマリー（664名/69%）の本文には場所が書かれていることが多く、
//     現場駅列が空でサマリーにだけ駅がある人が 223名 いた。そこを拾いに行く。
//
//   ★ラベルを手がかりにする（本文中の「○○駅」を全部拾わない）
//     サマリーは営業がメールから貼った長文で、他社名・経由駅・アクセス説明など
//     現場と無関係な駅名が普通に混ざる。全部拾うと誤りが増えるので
//     「場所」「最寄」等のラベルの直後だけを見る。拾えなければ空を返す（推測しない）。
// =============================================================================

// 場所を表すラベル。この直後の値だけを駅の候補にする。
const PLACE_LABELS = [
  '最寄り駅', '最寄駅', '最寄り', '最寄', '勤務地', '就業場所', '勤務場所', '作業場所',
  '常駐先', '場所', '勤務先', 'エリア',
];

// 値の終わりとみなす記号（次の項目が始まる印）。サマリーは箇条書き記号が何でも来る。
const VALUE_END = /[\n\r■●◆◇▲△▼※【】〔〕≪≫◾◼▪▫・>＞]|＝＝|――|─{2,}|-{2,}|\s{2,}/;
// 「単価：」「期間：」のように次の項目ラベルが始まったら、そこで値は終わり。
const NEXT_LABEL = /[^\s：:（(]{1,10}\s*[:：]/;

export interface SummaryStationParse extends StationParse {
  label: string;    // 実際に一致したラベル（'最寄駅' 等）。拾えなければ ''
  snippet: string;  // ラベル直後に切り出した原文（人が正しさを確認する用）
}

export function extractStationsFromSummary(text: unknown): SummaryStationParse {
  const src = nfkc(String(text == null ? '' : text));
  const empty: SummaryStationParse = {
    raw: '', stations: [], display: '', junk: true, daily: false, remote: false, note: '',
    label: '', snippet: '',
  };
  if (!src.trim()) return empty;

  // 長いラベルから先に探す（「最寄り駅」を「最寄」で切らないため）。
  for (const label of [...PLACE_LABELS].sort((a, b) => b.length - a.length)) {
    // ラベルの直後の区切りは統一されていない: 「場所：」「【場所】」「■場所 ・」「勤務地 東京」。
    //   閉じ括弧・コロン・中黒・空白のどれでも受ける。
    const re = new RegExp(label + '\\s*[】\\]〕》≫]?\\s*[:：・]?\\s*([^]{0,60})');
    const m = re.exec(src);
    if (!m) continue;
    // 先に行頭の飾り（'>' '<' '・' 等）を落としてから切る。
    //   これをやらないと VALUE_END が位置0で当たり、切らずに本文を丸ごと拾ってしまう。
    let val = m[1].replace(/^[\s>＞<＜:：・\-–—]+/, '');
    // 次の項目が始まるところで切る。ラベル直後の値なので、最初に当たった印で打ち切ってよい。
    const end = VALUE_END.exec(val);
    if (end) val = val.slice(0, end.index);
    const nx = NEXT_LABEL.exec(val);
    if (nx && nx.index > 0) val = val.slice(0, nx.index);
    // 閉じていない括弧（「新宿駅（原則出社。」で切れた等）は括弧ごと落とす。
    val = val.replace(/[（(][^）)]*$/, '');
    val = val.trim().replace(/^[、,。.]+|[、,。.]+$/g, '').trim();
    if (!val) continue;
    const p = parseStations(val);
    if (!p.stations.length) continue;   // 駅が取れないラベルは次の候補へ
    return { ...p, label, snippet: val };
  }
  return empty;
}

// 表示用の1行。駅が取れなければ生の値を出す（空欄にして情報を消さない）。
export function stationLabel(raw: unknown): string {
  const p = parseStations(raw);
  if (p.display) return p.daily ? `${p.display}（日により変動）` : p.display;
  return p.raw;
}
