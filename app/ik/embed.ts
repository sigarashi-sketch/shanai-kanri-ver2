import 'server-only';

// 今の社内システムの画面（HTML と JS）を、そのまま ver2 と同じ origin の /ik/ から出すための下ごしらえ。
//   ★作り直さない・計算しない・データを写さない。画面のコードは今のシステムのものを毎回そのまま取ってくる
//   ★変えるのは「行き先」だけ：/api/… → /ik/api/…（ver2 自身の /api/live などとぶつけない）、/shell.js など → /ik/shell.js
//   ★見た目は今のまま。今の外枠（左メニュー・上バー・タブ・AIに聞く）だけ消す（ver2 の外枠と二重になるため）

/** ver2 で開ける今の画面（請求の2つ＋3D の出勤ボード）。ほかの画面は開かない（中継する API を増やさないため） */
export const IK_PAGES = new Set(['seikyu.html', 'seikyu-make.html', 'attendance-3d.html', 'bikkura.html', 'nippo.html']);   // nippo＝成約日報（10-27 shoya「デザインもとに戻して」＝今の画面をそのまま）   // bikkura＝たまげたポン（人財管理・10-27）

/** 画面のコード（JS/CSS）と画像。データは入っていない（今のシステムでもログインなしで読める静的ファイル） */
export const ASSET_TYPES: Record<string, string> = {
  js: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2',
};

/** 文字列の中の行き先だけを /ik/ に向け直す（HTML と JS と CSS に同じものを当てる） */
export function rewritePaths(src: string): string {
  return src
    // '/api/seikyu?…' → '/ik/api/seikyu?…'（引用符・バッククォートの直後の /api/ だけ）
    .replace(/(['"`])\/api\//g, '$1/ik/api/')
    // '/shell.js' '/seikyu.html' url(/x.png) → /ik/…（すでに /ik/ のもの・// で始まるものは触らない）
    .replace(/(['"`(=])\/(?!\/|ik\/|api\/)([A-Za-z0-9_][A-Za-z0-9_.\-/]*\.(?:js|css|html|png|svg|jpe?g|webp|ico|woff2?))(?=[?#'"`)\s])/g, '$1/ik/$2');
}

/** 今の画面のコードを ver2 用に少しだけ変える。auth-guard.js の日報の締めの寄せ（平日18時）は止める＝ver2 の外枠が寄せる（components/NippoMust.tsx）。
 *  iframe の中で寄せると 日報の画面（/ik/nippo.html は '/nippo.html' と別の名前）でも開き直しを繰り返し、ほかの画面では iframe の中だけが日報になるため */
export function rewriteAsset(name: string, src: string): string {
  if (name === 'auth-guard.js') src = src.replace("if (!nippoBlocked && path !== '/nippo.html')", 'if (false)');
  return rewritePaths(src);
}

// 文字の書き換えで拾えない組み立て方（変数で /api/ を作るなど）の保険。fetch / XHR / sendBeacon の行き先を /ik/api/ に向ける
const PATCH = `<script>(function(){var O=location.origin;function P(u){try{if(typeof u!=='string')return u;if(u.indexOf('/api/')===0)return '/ik'+u;if(u.indexOf(O+'/api/')===0)return O+'/ik'+u.slice(O.length)}catch(e){}return u}
var f=window.fetch;if(f)window.fetch=function(i,o){if(typeof i==='string')i=P(i);else if(i&&typeof URL!=='undefined'&&i instanceof URL)i=P(i.href);return f.call(this,i,o)};
var x=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(){arguments[1]=P(String(arguments[1]));return x.apply(this,arguments)};
if(navigator.sendBeacon){var b=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(u,d){return b(P(u),d)}}})();</script>`;

// 今の外枠を消す（それゆけの app/ik と同じ消し方）。画面の中身の見た目は変えない
const HIDE_SHELL = `<style id="v2-embed">
.ike-sidebar,.ike-topbar,.ike-m-appbar,.ike-m-tabbar,.ike-scrim,.ike-m-scrim,.ike-subtabs,#ai-widget{display:none!important}
.ike-main{margin-left:0!important}
a[href="/ik/home.html"]{display:none!important}
body{padding-top:0!important;padding-bottom:0!important}
</style>`;

// 請求書作成（seikyu-make.html）の「作成」「格納」を ver2 では別のページに分ける（10-25 shoya「格納ページも作らないと」）。
//   ?v2pane=make|store で開くと、そのタブを押した状態にして、上の 作成／格納 の切り替えを隠す（画面のコードは変えない）
const PANE = (pane: 'make' | 'store') => `<script>(function(){var n=0;function go(){var b=document.querySelector('.ptabs [data-pane="${pane}"]');if(!b){if(n++<100)setTimeout(go,100);return}b.click();var t=document.querySelector('.ptabs');if(t)t.style.display='none'}
if(document.readyState!=='loading')go();else document.addEventListener('DOMContentLoaded',go)})();</script>`;

// 請求書作成のファイル名（PDF・保存とも fileNameOf）を「宛先御中_請求書_番号」にする（10-27 shoya「人財ＢＡＮＫ株式会社御中_請求書_MKTB-0000000011 この名前で保存」）。
//   今の画面は「宛先御中_件名_請求書_番号」。件名だけ外す。取引先マスタの「ファイル名の形」（file_name_fmt）がある会社はそちらのまま
//   ★今の画面の書き方が変わって見つからなければ何もしない（今のままの名前になる）
const FILE_NAME_OLD = "[(inv.partner || '宛先未定') + '御中', inv.subject, '請求書', inv.number || ymLabel(data.ym)]";
const FILE_NAME_NEW = "[(inv.partner || '宛先未定') + '御中', '請求書', inv.number || ymLabel(data.ym)]";

// 請求書の書類（PDF・保存・印刷）にはメールの透かし（今の watermark.js の #ike-wm）を入れない（10-27 shoya「書類に透かしいれないで」）。
//   画面に出る透かしはそのまま。印刷（PDFに）では隠し、保存の PDF（html2pdf）は写す対象から外す
//   ★今の画面の書き方が変わって見つからなければ 保存の方は何もしない（印刷で隠すのは CSS なのでいつも効く）
const NO_WM_PRINT = `<style id="v2-nowm-print">@media print{#ike-wm{display:none!important}}</style>`;
const PDF_OPT_OLD = "html2canvas: { scale: 2, backgroundColor: '#ffffff'";
const PDF_OPT_NEW = "html2canvas: { scale: 2, ignoreElements: function (e) { return e.id === 'ike-wm'; }, backgroundColor: '#ffffff'";

// 印刷（PDF に保存）のファイル名は いちばん外のページ（ver2・「社内管理」）の題名から付く。iframe の中の画面が document.title に入れた
//   ファイル名（fileNameOf）を、印刷の間だけ外のページの題名にも入れる（10-27 shoya「名前のとこまだ治ってなくね」）。印刷が終わったら戻す
const PRINT_TITLE = `<script>(function(){var p=window.print;if(!p||window.top===window)return;window.print=function(){var t=null,d=null;try{d=window.top.document;t=d.title;d.title=document.title}catch(e){d=null}
try{return p.apply(window,arguments)}finally{if(d)setTimeout(function(){d.title=t},500)}}})();</script>`;

export function embedHtml(html: string, opts?: { pane?: 'make' | 'store'; noWatermarkDocs?: boolean }): string {
  let out = rewritePaths(html).replace(FILE_NAME_OLD, FILE_NAME_NEW);
  if (opts?.noWatermarkDocs) {
    out = out.split(PDF_OPT_OLD).join(PDF_OPT_NEW);
    out = out.includes('</head>') ? out.replace('</head>', NO_WM_PRINT + PRINT_TITLE + '</head>') : NO_WM_PRINT + PRINT_TITLE + out;
  }
  if (opts?.pane) out = out.includes('</body>') ? out.replace('</body>', PANE(opts.pane) + '</body>') : out + PANE(opts.pane);
  // 保険の script は <head> のいちばん先（今の画面の script より前）に置く
  out = /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, (m) => m + PATCH) : PATCH + out;
  out = out.includes('</head>') ? out.replace('</head>', HIDE_SHELL + '</head>') : HIDE_SHELL + out;
  return out;
}

/** ログインしていない・開けない画面のときの短い案内（架空のデータは出さない） */
export function noticeHtml(title: string, body: string): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fff;color:#333;font:14px/1.8 system-ui,-apple-system,"Hiragino Kaku Gothic ProN",sans-serif;text-align:center;padding:24px}
a{display:inline-block;margin-top:14px;padding:8px 20px;border:1px solid #ccc;border-radius:8px;color:#111;text-decoration:none}</style></head>
<body><div><div style="font-size:16px;font-weight:600;margin-bottom:8px">${title}</div><div style="color:#666">${body}</div>
<a href="/api/ike-auth/start" target="_top">会社のアカウントでログイン</a></div></body></html>`;
}

export const LOGIN_NOTICE = () => noticeHtml('ログインしてください', 'この画面は今の社内システムのデータをそのまま出します。ログインすると開けます。');
