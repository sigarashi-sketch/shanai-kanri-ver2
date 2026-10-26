/* ctx-menu.js — 全画面共通の右クリックメニュー（2026-10-08 shoya「ページ全体で右クリックメニュー・操作ログ参考に仕事効率があがるように」）
   ES5・依存なし。shell.js が読み込む（shell を使わない画面は各 HTML が直接読む＝そのときは「文字・画面・スクショ」だけ出る）。

   ★何を出すか（上から）: この人 → この案件 → リンク → 文字 → スクショ → この画面 → よく行く画面
     ・この人   … 行に data-ctx-name が付いていれば、その人をチャット／プロパーリスト／基本情報／名簿／案件進捗／出勤状況で開く。
                  操作ログ（ui_click_log・直近30日）で一番多かった動きが「同じ人を別の画面で開き直す」だったため。
     ・この案件 … 押した場所の近くに案件番号（P######-######）が1つだけあれば、案件進捗／案件マップ／営業共有リストで開く。
     ・よく行く画面 … 本人の操作ログから「この画面のあとによく開く画面」（/api/my-activity?action=jumps・1日1回だけ取りに行く）。
     ・スクショ … タブの画面取り込み（getDisplayMedia）を切り抜く。画面の写しなので、メールの透かしも必ず写る。
   ★出さない場所: 入力欄（貼り付け・変換候補はブラウザのメニューが要る）・地図・3D・画像・タッチ操作・ページ側が自分で右クリックを使っている所。
     Shift を押しながら右クリックすれば、いつでもブラウザのメニューが出る。
   ★行き先はそのロールのメニューにある画面だけ（shell.js の navFor）。見えない画面への入口は作らない。
   ★書き込み（OK/NG・送信・保存）はメニューに置かない。押し間違いで戻せない操作を増やさないため。
     例外は、ページ側が自分で足す「この行の操作」（ike:ctx-menu の合図に items を足す）。いまはチャット一覧の
     「対応済みにする（強調を消す）／要対応に戻す」と、案件進捗の返信チップの「OK／NG／その他／取り消す」（2026-10-08 shoya）。
     どちらも画面にあるボタンと同じ関数を呼ぶだけ。送信・削除のような、ボタンに確認が付いている操作は足さない。
   ★氏名を別画面へ渡すとき、受け口が無かった画面には URL の # より後ろ（#ctxq=）で渡す。# より後ろはサーバーに送られない＝アクセスログに氏名が残らない。
   ★メニューの項目は data-log に固定の名前を持たせる（click-log.js が氏名入りの文字を拾わないように）。
   ★それゆけ未経験（saiyou-app）も同じファイルを使う（public/ctx-menu.js に写しを置く・components/CtxMenu.tsx が init する）。
     画面ごとに違うもの（その人を開く先・よく行く画面の既定・記録の取り先）は init で差し替えられる。ここを直したら向こうにも写す。 */
(function (root) {
  'use strict';

  // ---- 純関数（tests/ctxMenu.test.ts から読む） ------------------------------------
  var CASE_RE = /P\d{6}-\d{6}/g;
  // 文字の中に案件番号が「1種類だけ」あればそれを返す（2種類以上＝どの案件か決められないので空）
  function caseNoIn(text) {
    var m = String(text == null ? '' : text).match(CASE_RE);
    if (!m) return '';
    for (var i = 1; i < m.length; i++) if (m[i] !== m[0]) return '';
    return m[0];
  }
  function cleanName(s) {
    return String(s == null ? '' : s).replace(/[\s　]+/g, ' ').replace(/^\s+|\s+$/g, '').slice(0, 40);
  }
  function enc(s) { return encodeURIComponent(s); }
  // その人を開く先。path は権限の照合用（NAV の href と突き合わせる）。
  function personLinks(p) {
    var name = cleanName(p && p.name);
    if (!name) return [];
    var n = enc(name);
    var chatQ = [];
    if (p.gid) { chatQ.push('groupId=' + enc(p.gid)); chatQ.push('mode=group'); }
    else if (p.uid) chatQ.push('userId=' + enc(p.uid));
    chatQ.push('name=' + n);
    return [
      { id: 'p-chat', path: '/chat.html', label: 'チャット', icon: 'chat', href: '/chat.html?' + chatQ.join('&') },
      { id: 'p-proper', path: '/proper.html', label: 'プロパーリスト', icon: 'note', href: '/proper.html?q=' + n },
      { id: 'p-basic', path: '/basic-info.html', label: '基本情報', icon: 'clipboard', href: '/basic-info.html?q=' + n },
      { id: 'p-progress', path: '/progress.html', label: '案件進捗', icon: 'briefcase', href: '/progress.html?view=members#ctxq=' + n },
      { id: 'p-roster', path: '/roster.html', label: '従業員名簿', icon: 'users', href: '/roster.html#ctxq=' + n },
      { id: 'p-kintai', path: '/kintai-today.html', label: '出勤状況', icon: 'clock', href: '/kintai-today.html#ctxq=' + n },
      { id: 'p-interviews', path: '/interviews.html', label: '面談管理', icon: 'calendar', href: '/interviews.html#ctxq=' + n }
    ];
  }
  function caseLinks(no) {
    if (!caseNoIn(no)) return [];
    var c = enc(no);
    return [
      { id: 'c-progress', path: '/progress.html', label: '案件進捗', icon: 'briefcase', href: '/progress.html#ctxq=' + c },
      { id: 'c-map', path: '/cases-map.html', label: '案件マップ', icon: 'map', href: '/cases-map.html?case=' + c },
      { id: 'c-list', path: '/partner-list.html', label: '営業共有リスト', icon: 'doc', href: '/partner-list.html?case=' + c },
      { id: 'c-ops', path: '/ops-log.html', label: '操作ログ', icon: 'scroll', href: '/ops-log.html?target=' + c }
    ];
  }
  function pathOf(href) { return String(href || '').replace(/[?#].*$/, ''); }
  // 行き先を「そのロールに見えている画面」と「いま居る画面以外」に絞る。pages が無い（shell 無し）なら何も出さない。
  function allowed(links, pages, here) {
    var ok = {};
    (pages || []).forEach(function (p) { if (p && p.href) ok[pathOf(p.href)] = 1; });
    return links.filter(function (l) { return ok[l.path] && l.path !== here; });
  }
  // 操作ログが少ない人向けの既定（2026-10-08 時点の全員の合計で多かった順）
  var DEFAULT_JUMPS = {
    '/proper.html': ['/chat.html', '/basic-info.html', '/progress.html', '/roster.html'],
    '/chat.html': ['/proper.html', '/progress.html', '/basic-info.html'],
    '/progress.html': ['/chat.html', '/proper.html'],
    '/basic-info.html': ['/proper.html', '/chat.html'],
    '/home.html': ['/proper.html', '/chat.html', '/progress.html', '/line-broadcast.html'],
    '/roster.html': ['/proper.html', '/kintai-today.html'],
    '/kintai-today.html': ['/shift-admin.html', '/roster.html'],
    '/line-broadcast.html': ['/chat.html', '/progress.html'],
    '/interviews.html': ['/proper.html', '/chat.html']
  };
  function jumpTargets(here, mine, pages, max, defaults) {
    var title = {};
    (pages || []).forEach(function (p) { if (p && p.href && !title[pathOf(p.href)]) title[pathOf(p.href)] = { t: p.t, href: p.href }; });
    var out = [], seen = {};
    ((mine && mine[here]) || []).concat((defaults || DEFAULT_JUMPS)[here] || []).forEach(function (path) {
      if (seen[path] || path === here || !title[path] || out.length >= (max || 4)) return;
      seen[path] = 1;
      out.push({ path: path, label: title[path].t, href: title[path].href });
    });
    return out;
  }
  // 表の1行をタブ区切りに（Excel・スプレッドシートにそのまま貼れる）
  function rowText(cells) {
    return (cells || []).map(function (c) { return String(c == null ? '' : c).replace(/[\t\r\n]+/g, ' ').replace(/^\s+|\s+$/g, ''); }).join('\t');
  }
  function shotName(path, d) {
    function z(n) { return (n < 10 ? '0' : '') + n; }
    var page = String(path || '').replace(/^\//, '').replace(/\.html$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'page';
    return 'screenshot_' + page + '_' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '_' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()) + '.png';
  }
  // 切り抜く範囲（画面の座標）を取り込んだ映像の座標へ。画面の外にはみ出した分は切り落とす。
  function cropBox(rect, viewW, viewH, videoW, videoH) {
    var s = videoW / viewW;
    var x0 = Math.max(0, rect.left), y0 = Math.max(0, rect.top);
    var x1 = Math.min(viewW, rect.left + rect.width), y1 = Math.min(viewH, rect.top + rect.height);
    if (x1 - x0 < 4 || y1 - y0 < 4) return null;
    var b = { x: Math.round(x0 * s), y: Math.round(y0 * s), w: Math.round((x1 - x0) * s), h: Math.round((y1 - y0) * s) };
    if (b.y + b.h > videoH) b.h = videoH - b.y;
    return b.h > 0 ? b : null;
  }

  var PURE = { caseNoIn: caseNoIn, personLinks: personLinks, caseLinks: caseLinks, allowed: allowed, jumpTargets: jumpTargets,
    rowText: rowText, shotName: shotName, cropBox: cropBox, cleanName: cleanName, DEFAULT_JUMPS: DEFAULT_JUMPS };
  if (typeof document === 'undefined') { root.IkeCtx = { _pure: PURE }; return; }   // テストからの読み込み
  if (root.IkeCtx && root.IkeCtx._on) return;
  if (/^\/(login|auth-callback|kihon-form|menu-|m\/)/.test(location.pathname || '/')) return;   // ログイン前の画面・要員本人の画面では動かさない（click-log.js と同じ線引き）

  // ---- 設定（shell.js が init で渡す。shell の無い画面は空のまま） -------------------
  //   personLinks / caseLinks … その人・その案件を開く先を返す関数（無ければ いけどんの画面）
  //   defaultJumps … 「よく行く画面」の既定 / jumpsUrl … 本人の記録の取り先（null なら取りに行かない） / home … '/' のときの画面
  //   copyAny … 目印（data-ctx-copy）や表の欄でなくても、押した所の文字を「この文字をコピー」で出す（それゆけ）
  var cfg = { pages: null, withArea: null, openSearch: null, split: false, copyAny: false,
    personLinks: personLinks, caseLinks: caseLinks, defaultJumps: DEFAULT_JUMPS, jumpsUrl: '/api/my-activity?action=jumps', home: '/home.html', splitUrl: '/split.html' };
  // いま居る画面。画面を移っても読み込み直さない作り（それゆけ）があるので、使うたびに読む。
  function here() { return location.pathname === '/' ? cfg.home : location.pathname; }
  var EMBED = false;
  try { EMBED = window.top !== window; } catch (e) { EMBED = true; }
  // スプリット（/split.html）の中か。中なら { host: スプリットの窓, pane: その直下の枠の窓 }。
  //   枠の中の、さらに埋め込み（詳細の中のチャット）から呼ばれても辿れるように親を順に見る。
  var SPLIT = null;
  try {
    for (var w = window, d = 0; w.parent !== w && d < 4; w = w.parent, d++) {
      if (w.parent.IkeSplit) { SPLIT = { host: w.parent, pane: w }; break; }
    }
  } catch (e) { SPLIT = null; }
  var lastTouch = 0;
  window.addEventListener('touchstart', function () { lastTouch = Date.now(); }, { passive: true, capture: true });

  function prefOff() {
    try { var p = JSON.parse(localStorage.getItem('ike_prefs') || 'null'); return !!(p && p.ctxMenu === 'off'); } catch (e) { return false; }
  }
  function withArea(href) { try { return cfg.withArea ? cfg.withArea(href) : href; } catch (e) { return href; } }
  function icon(name) { var I = window.IkeIcons; try { return I && I.svg ? I.svg(name) : ''; } catch (e) { return ''; } }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function up(el, sel) { return el && el.closest ? el.closest(sel) : null; }

  // ---- 押した場所から「誰の・どの案件の」を読む -------------------------------------
  var resolvers = [];
  function findPerson(t) {
    for (var i = 0; i < resolvers.length; i++) {
      try { var r = resolvers[i](t); if (r && r.name) return r; } catch (e) { /* ページ側の不具合でメニューを止めない */ }
    }
    var el = up(t, '[data-ctx-name]');
    if (!el) return null;
    var name = cleanName(el.getAttribute('data-ctx-name'));
    // data-ctx-key … その画面の中での人の鍵（それゆけの名簿の key など。開く先を作る側が使う）
    return name ? { name: name, gid: el.getAttribute('data-ctx-gid') || '', uid: el.getAttribute('data-ctx-uid') || '', key: el.getAttribute('data-ctx-key') || '' } : null;
  }
  function findCase(t) {
    var el = up(t, '[data-ctx-case]');
    if (el) return caseNoIn(el.getAttribute('data-ctx-case'));
    // 近い枠から順に見て、案件番号が1種類だけ入っている最初の枠のものを採る（一覧全体まで広げない）
    for (var n = t, d = 0; n && n.nodeType === 1 && n !== document.body && d < 7; n = n.parentNode, d++) {
      var tx = n.textContent || '';
      if (tx.length > 4000) break;
      var m = tx.match(CASE_RE);
      if (m) return caseNoIn(tx);
    }
    return '';
  }
  function selectedText() {
    try { return String(window.getSelection ? window.getSelection() : '').replace(/^\s+|\s+$/g, ''); } catch (e) { return ''; }
  }
  function textOf(el) { return String((el && (el.innerText || el.textContent)) || '').replace(/[ \t　]+/g, ' ').replace(/^\s+|\s+$/g, ''); }
  // 目印（data-ctx-copy）の無い場所で「押した所の文字」を持っている要素。文字をじかに持つ要素だけ（余白を押して枠ごと拾わない）。
  function textBlock(t) {
    for (var n = t, d = 0; n && n.nodeType === 1 && n !== document.body && d < 3; n = n.parentNode, d++) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3 && /\S/.test(c.nodeValue || '')) return (n.textContent || '').length <= 4000 ? n : null;
      }
    }
    return null;
  }
  // 目印の付いた要素から、コピーする文字を読む。属性に値があればそれ（画面に出ていない書式でも渡せる）、無ければ見えている文字。
  function markedText(el, attr) {
    var v = el ? el.getAttribute(attr) : '';
    return String(v || '').replace(/^\s+|\s+$/g, '') || textOf(el);
  }

  // ---- 小さな道具 -------------------------------------------------------------------
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'ike-ctx-toast'; toastEl.setAttribute('role', 'status'); document.documentElement.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }
  function copyText(s, okMsg) {
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = s; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        toast(ok ? okMsg : 'コピーできませんでした');
      } catch (e) { toast('コピーできませんでした'); }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(function () { toast(okMsg); }, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }
  function openTab(href) { try { window.open(href, '_blank', 'noopener'); } catch (e) { location.href = href; } }
  // 同じタブで移る。埋め込み表示（詳細の中のチャット）からは外側の画面ごと移る。
  //   スプリットの枠の中なら、その枠だけが移る（タブ全体は動かさない）。
  function go(href) {
    try {
      if (SPLIT) SPLIT.pane.location.href = href;
      else (EMBED ? window.parent : window).location.href = href;
    } catch (e) { openTab(href); }
  }
  // 人・案件を開く。ふだんは新しいタブ、スプリットの中では「となりの枠」（⌘/Ctrl を押していれば新しいタブ）。
  function openOther(href, e) {
    if (SPLIT && !(e && (e.metaKey || e.ctrlKey))) {
      try { SPLIT.host.IkeSplit.openBeside(SPLIT.pane, href); return; } catch (x) { /* 開けなければ新しいタブへ */ }
    }
    openTab(href);
  }
  var OTHER = SPLIT ? 'となりの画面で開く' : '開く（新しいタブ）';
  function clickRefresh() {
    var bs = document.querySelectorAll('button, a.btn, [role="button"]');
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (b.disabled || !b.offsetParent || up(b, '.ike-ctx')) continue;
      if (/^(↻|🔄|⟳)?\s*(更新|再読み込み|再読込|最新にする)$/.test(textOf(b))) { b.click(); toast('データを更新しました'); return; }
    }
    location.reload();
  }

  // ---- スクショ ---------------------------------------------------------------------
  //   タブの画面取り込みを1枚だけ受け取って切り抜く。ブラウザが毎回「このタブを共有」を確認する（勝手には撮れない）。
  //   ★範囲は取り込みが始まってから測る（共有中の帯が出て画面が少し下がるため）。
  var shotBusy = false;
  //   ★スプリットの枠の中からは、タブ全体を持っている外側（split.html の IkeCtx）に頼む。範囲は外側の座標に直して渡す。
  function shotHost() { try { return SPLIT && SPLIT.host.IkeCtx && SPLIT.host.IkeCtx._shoot ? SPLIT.host.IkeCtx : null; } catch (e) { return null; } }
  function canShoot() {
    if (SPLIT) return !!shotHost();
    return !EMBED && !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  }
  // 枠の中の要素の位置を、外側（タブ全体）の座標で返す関数にする。枠からはみ出した分は切り落とす。
  function outerRectFn(el) {
    return function () {
      if (!document.documentElement.contains(el)) return null;
      var r = el.getBoundingClientRect();
      var x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(window.innerWidth, r.right), y1 = Math.min(window.innerHeight, r.bottom);
      var ox = 0, oy = 0;
      for (var w = window; w !== SPLIT.host; w = w.parent) { var fr = w.frameElement.getBoundingClientRect(); ox += fr.left; oy += fr.top; }
      return { left: x0 + ox, top: y0 + oy, width: x1 - x0, height: y1 - y0 };
    };
  }
  //   ★pick=true（範囲を選ぶ）は、撮った1枚を画面いっぱいに止め絵で敷いて、その上をドラッグで囲んでもらう（Mac の ⌘⇧4 と同じ手ざわり）。
  //     先に囲んでから撮ると、共有の確認で画面が動いて位置がずれるため、撮ってから囲む順にしている。
  function shoot(target, what, pick) {
    var host = shotHost();
    if (host) { host._shoot(target && typeof target !== 'function' ? outerRectFn(target) : target, what, pick); return; }
    if (shotBusy) return;
    shotBusy = true;
    var stream = null;
    function stop() { try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* noop */ } shotBusy = false; }
    navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' })
      .then(function (s) {
        stream = s;
        var v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.srcObject = s;
        return v.play().then(function () {
          return new Promise(function (res) { setTimeout(function () { res(v); }, 450); });   // 確認の窓が消えて描き直されるのを待つ
        });
      })
      .then(function (v) {
        var vw = v.videoWidth, vh = v.videoHeight, iw = window.innerWidth, ih = window.innerHeight;
        var surface = '';
        try { surface = (stream.getVideoTracks()[0].getSettings() || {}).displaySurface || ''; } catch (e) { /* noop */ }
        // このタブ以外（ウィンドウ・画面全体）を選ばれたら位置が合わないので、切り抜かずそのまま渡す
        var sameTab = (!surface || surface === 'browser') && Math.abs(vw / vh - iw / ih) < 0.03;
        var box = { x: 0, y: 0, w: vw, h: vh }, cropped = false;
        if (pick) {
          var full = document.createElement('canvas');
          full.width = vw; full.height = vh;
          full.getContext('2d').drawImage(v, 0, 0);
          stop();
          pickRegion(full);
          return;
        }
        if (target && sameTab) {
          // target は要素か、範囲を返す関数（スプリットの枠の中から頼まれたとき）
          var tr = typeof target === 'function' ? target() : (document.documentElement.contains(target) ? target.getBoundingClientRect() : null);
          var b = tr ? cropBox(tr, iw, ih, vw, vh) : null;
          if (b) { box = b; cropped = true; }
        }
        var cv = document.createElement('canvas');
        cv.width = box.w; cv.height = box.h;
        cv.getContext('2d').drawImage(v, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
        stop();
        cv.toBlob(function (blob) {
          if (!blob) { toast('スクショを作れませんでした'); return; }
          showShot(blob, target && !cropped ? '範囲を切り抜けなかったので、画面全体を撮りました' : what + 'を撮りました');
        }, 'image/png');
      })
      .catch(function (e) {
        stop();
        if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return;   // 確認の窓で「キャンセル」＝何も言わない
        toast('スクショを撮れませんでした');
      });
  }
  // 止め絵の上で範囲を囲む。Esc・右クリック・小さすぎる囲みはやめる（何も残さない）。
  var pickEl = null;
  function closePick() { if (pickEl) { pickEl.parentNode.removeChild(pickEl); pickEl = null; } }
  function pickRegion(full) {
    closePick();
    injectCss();
    pickEl = document.createElement('div');
    pickEl.className = 'ike-ctx-pick';
    pickEl.setAttribute('data-log', 'off');   // 囲む操作そのものは記録しない
    full.className = 'ike-ctx-pick-img';
    var sel = document.createElement('div'); sel.className = 'ike-ctx-pick-sel';
    var tip = document.createElement('div'); tip.className = 'ike-ctx-pick-tip';
    tip.textContent = 'ドラッグで撮る範囲を囲む（Esc でやめる）';
    pickEl.appendChild(full); pickEl.appendChild(sel); pickEl.appendChild(tip);
    document.documentElement.appendChild(pickEl);
    var x0 = 0, y0 = 0, on = false;
    function rectOf(e) {
      return { left: Math.min(x0, e.clientX), top: Math.min(y0, e.clientY), width: Math.abs(e.clientX - x0), height: Math.abs(e.clientY - y0) };
    }
    pickEl.addEventListener('contextmenu', function (e) { e.preventDefault(); closePick(); });
    pickEl.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      on = true; x0 = e.clientX; y0 = e.clientY;
      tip.style.display = 'none';
      sel.style.cssText = 'display:block;left:' + x0 + 'px;top:' + y0 + 'px;width:0;height:0';
    });
    pickEl.addEventListener('mousemove', function (e) {
      if (!on) return;
      var r = rectOf(e);
      sel.style.cssText = 'display:block;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
    });
    pickEl.addEventListener('mouseup', function (e) {
      if (!on) return;
      on = false;
      var r = rectOf(e), ir = full.getBoundingClientRect();
      // 止め絵が画面のどこに・どの大きさで出ているかを基準に、元の画像の座標へ直す（別のウィンドウを選ばれて縦横比が違っても合う）
      var b = cropBox({ left: r.left - ir.left, top: r.top - ir.top, width: r.width, height: r.height }, ir.width, ir.height, full.width, full.height);
      closePick();
      if (!b || r.width < 8 || r.height < 8) return;
      var cv = document.createElement('canvas');
      cv.width = b.w; cv.height = b.h;
      cv.getContext('2d').drawImage(full, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
      cv.toBlob(function (blob) {
        if (!blob) { toast('スクショを作れませんでした'); return; }
        showShot(blob, '選んだ範囲を撮りました');
      }, 'image/png');
    });
  }
  var shotEl = null, shotUrl = '';
  function closeShot() {
    if (shotEl) { shotEl.parentNode.removeChild(shotEl); shotEl = null; }
    if (shotUrl) { try { URL.revokeObjectURL(shotUrl); } catch (e) { /* noop */ } shotUrl = ''; }
  }
  function showShot(blob, msg) {
    closeShot();
    shotUrl = URL.createObjectURL(blob);
    var name = shotName(here(), new Date());
    shotEl = document.createElement('div');
    shotEl.className = 'ike-ctx-shot';
    shotEl.setAttribute('role', 'dialog');
    shotEl.setAttribute('aria-label', 'スクショ');
    shotEl.setAttribute('data-log-area', '右クリックメニュー');
    shotEl.innerHTML = '<div class="ike-ctx-shot-h"><b></b><button type="button" class="x" data-act="close" data-log="スクショ: 閉じる" aria-label="閉じる">×</button></div>' +
      '<div class="ike-ctx-shot-img"><img alt="撮ったスクショ"></div>' +
      '<div class="ike-ctx-shot-f"><button type="button" data-act="copy" data-log="スクショ: 画像をコピー">画像をコピー</button>' +
      '<a data-log="スクショ: 保存" role="button">保存</a></div>';
    shotEl.querySelector('b').textContent = msg;
    shotEl.querySelector('img').src = shotUrl;
    var a = shotEl.querySelector('a');
    a.href = shotUrl; a.download = name;
    function copyImg(silent) {
      try {
        if (!navigator.clipboard || !window.ClipboardItem) throw new Error('unsupported');
        navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]).then(function () {
          toast('画像をコピーしました。そのまま貼り付けできます');
        }, function () { if (!silent) toast('コピーできませんでした。「保存」を使ってください'); });
      } catch (e) { if (!silent) toast('このブラウザは画像のコピーに対応していません。「保存」を使ってください'); }
    }
    shotEl.addEventListener('click', function (e) {
      var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'close') closeShot();
      else if (act === 'copy') copyImg(false);
    });
    document.documentElement.appendChild(shotEl);
    copyImg(true);   // まず黙って試す（確認の窓のあとは弾かれることがある＝そのときはボタンで）
  }
  // 撮る範囲の候補: 行（tr・data-ctx-name の行・チャットの1通）と、それを囲む枠（表・カード・ダイアログ）
  function shotRow(t) { return up(t, 'tr, [data-ctx-name], .msg-row, .contact-row, .kanban-card, .ike-m-itemcard, li'); }
  function shotFrame(t) {
    var el = up(t, 'table, [role="dialog"], .modal, .card, .case-card, .bk-card, .ike-card, section, .pane-thread, .panel');
    return el && el !== document.body ? el : null;
  }

  // ---- メニューを組む ---------------------------------------------------------------
  var jumpsMine = null;
  function loadJumps() {
    var KEY = 'ike_ctx_jumps';
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (c && c.map) jumpsMine = c.map;
      if (c && Date.now() - c.at < 24 * 3600 * 1000) return;
    } catch (e) { /* 壊れていたら取り直す */ }
    if (!cfg.jumpsUrl) return;
    fetch(cfg.jumpsUrl, { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.ok || !j.jumps) return;
        jumpsMine = j.jumps;
        try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), map: j.jumps })); } catch (e) { /* noop */ }
      }).catch(function () { /* 取れなければ既定の並びで出す */ });
  }

  function build(t) {
    var groups = [];
    var pages = cfg.pages;
    var person = findPerson(t), caseNo = findCase(t);
    var link = up(t, 'a[href]');
    var sel = selectedText();
    var cell = up(t, 'td, th, .msg-bubble, [data-ctx-copy]');
    var row = up(t, 'tr');
    // コピーの目印（ページ側が付ける）
    //   data-ctx-copy="文字"          … この要素のどこを押しても「◯◯をコピー」。値が空なら見えている文字
    //   data-ctx-copy-label="入社日"  … メニューに出す名前（氏名などの個人の文字は入れない＝操作の記録に残る）
    //   data-ctx-copy-all="文字"      … 外側の枠。「◯◯をまとめてコピー」（名前は同じ要素の data-ctx-copy-label）
    //   目印が無くても、cfg.copyAny のときは押した所の文字を「この文字をコピー」で出す
    var marked = cell && cell.hasAttribute('data-ctx-copy');
    var cellLabel = marked ? cleanName(cell.getAttribute('data-ctx-copy-label')) : '';
    if (!cell && cfg.copyAny) cell = textBlock(t);
    var all = up(t, '[data-ctx-copy-all]');

    // ページ側が足す「この行の操作」。押した場所に ike:ctx-menu を投げ、聞いている画面が detail.items に { label, log, icon, run } を足す。
    //   ★足すのは、その行にもうあるボタンと同じ操作だけ（同じ関数を呼ぶ）。送信・削除は足さない。log は氏名を含まない固定の名前にする。
    try {
      var ask = new CustomEvent('ike:ctx-menu', { bubbles: true, detail: { items: [] } });
      t.dispatchEvent(ask);
      var acts = (ask.detail.items || []).filter(function (it) { return it && it.label && it.log && typeof it.run === 'function'; }).slice(0, 4);
      if (acts.length) groups.push({ title: 'この行の操作', items: acts });
    } catch (e) { /* 古いブラウザ・ページ側の不具合ではメニューの残りだけ出す */ }

    if (person) {
      var pl = allowed(cfg.personLinks(person), pages, here()).map(function (l) {
        return { label: l.label, icon: l.icon, log: 'この人: ' + l.label, run: function (e) { openOther(withArea(l.href), e); } };
      });
      pl.push({ label: '氏名をコピー', icon: 'clip', log: 'この人: 氏名をコピー', run: function () { copyText(person.name, '氏名をコピーしました'); } });
      groups.push({ title: person.name + ' さんを' + OTHER, cols: 2, items: pl });
    }
    if (caseNo) {
      var cl = allowed(cfg.caseLinks(caseNo), pages, here()).map(function (l) {
        return { label: l.label, icon: l.icon, log: 'この案件: ' + l.label, run: function (e) { openOther(withArea(l.href), e); } };
      });
      cl.push({ label: '番号をコピー', icon: 'clip', log: 'この案件: 案件番号をコピー', run: function () { copyText(caseNo, '案件番号をコピーしました'); } });
      groups.push({ title: '案件 ' + caseNo + ' を' + OTHER, cols: 2, items: cl });
    }
    if (link && !/^(#|javascript:)/i.test(link.getAttribute('href') || '')) {
      groups.push({ title: 'リンク', cols: 2, items: [
        { label: '新しいタブで開く', icon: 'layers', log: 'リンク: 新しいタブで開く', run: function () { openTab(link.href); } },
        { label: 'リンクをコピー', icon: 'link', log: 'リンク: リンクをコピー', run: function () { copyText(link.href, 'リンクをコピーしました'); } }
      ] });
    }
    var words = [];
    var pick = sel || (cell ? (marked ? markedText(cell, 'data-ctx-copy') : textOf(cell)) : '');
    if (sel) words.push({ label: '選んだ文字をコピー', icon: 'clip', log: '文字: 選んだ文字をコピー', run: function () { copyText(sel, 'コピーしました'); } });
    else if (cell && pick) words.push({ label: cellLabel ? cellLabel + 'をコピー' : (marked || up(cell, 'td, th, .msg-bubble') ? '欄の文字をコピー' : 'この文字をコピー'), icon: 'clip', log: '文字: この欄の文字をコピー', run: function () { copyText(pick, cellLabel ? cellLabel + 'をコピーしました' : 'コピーしました'); } });
    if (all) {
      var allText = markedText(all, 'data-ctx-copy-all'), allLabel = cleanName(all.getAttribute('data-ctx-copy-label'));
      if (allText && allText !== pick) words.push({ label: (allLabel || 'この枠') + 'をまとめてコピー', icon: 'grid', log: '文字: まとめてコピー', run: function () { copyText(allText, 'まとめてコピーしました'); } });
    }
    if (row && row.cells && row.cells.length > 1) {
      words.push({ label: '行をコピー', icon: 'grid', log: '文字: この行をコピー', run: function () {
        copyText(rowText(Array.prototype.map.call(row.cells, textOf)), '行をコピーしました');
      } });
    }
    if (cfg.openSearch && pick && pick.length <= 40 && pick.indexOf('\n') < 0) {
      words.push({ label: 'この文字で検索', icon: 'search', log: '文字: この文字で全体を検索', run: function () { cfg.openSearch(pick); } });
    }
    if (words.length) groups.push({ title: '文字', cols: 2, items: words });

    if (canShoot()) {
      var sr = shotRow(t), sf = shotFrame(t), shots = [];
      shots.push({ label: '範囲を選ぶ', icon: 'pointer', log: 'スクショ: 範囲を選ぶ', run: function () { shoot(null, '範囲', true); } });
      if (sr) shots.push({ label: 'この行', icon: 'camera', log: 'スクショ: この行', run: function () { shoot(sr, 'この行'); } });
      if (sf && sf !== sr) shots.push({ label: 'この枠', icon: 'image', log: 'スクショ: この枠', run: function () { shoot(sf, 'この枠'); } });
      shots.push({ label: '画面', icon: 'camera', log: 'スクショ: 画面', run: function () { shoot(null, '画面'); } });
      groups.push({ title: 'スクショ（撮ってコピー・保存）', cols: 2, items: shots });
    }

    var pg = [
      { label: 'データを更新', icon: 'refresh', log: '画面: データを更新', run: clickRefresh },
      { label: '新しいタブで開く', icon: 'layers', log: '画面: 新しいタブで開く', run: function () { openTab(location.href); } },
      { label: 'リンクをコピー', icon: 'link', log: '画面: リンクをコピー', run: function () { copyText(location.href, 'リンクをコピーしました'); } }
    ];
    if (cfg.openSearch) pg.push({ label: '全体を検索', icon: 'search', log: '画面: 全体を検索', run: function () { cfg.openSearch(); } });
    groups.push({ title: 'この画面', cols: 2, items: pg });

    // スプリット（1つのタブに 2〜4 画面）。いまの画面を左に、よく行く画面を右に並べて開く。スプリットの中では出さない（上の帯で切り替える）。
    if (cfg.split && !SPLIT && !window.IkeSplit && !EMBED) {
      var mates = jumpTargets(here(), jumpsMine, pages, 3, cfg.defaultJumps).map(function (j) { return j.href; });
      var me = location.pathname + location.search;
      groups.push({ title: 'スプリット（1つのタブに並べる）', cols: 3, items: [2, 3, 4].map(function (n) {
        return { label: n + '画面', icon: 'grid', log: 'スプリット: ' + n + '画面', run: function () {
          var us = [me].concat(mates.slice(0, n - 1).map(withArea));
          location.href = cfg.splitUrl + '#n=' + n + us.map(function (u) { return '&u=' + enc(u); }).join('');
        } };
      }) });
    }

    var jumps = jumpTargets(here(), jumpsMine, pages, 4, cfg.defaultJumps).map(function (j) {
      return { label: j.label, icon: 'compass', log: 'よく行く画面: ' + j.path, run: function (e) {
        var href = withArea(j.href);
        if (e && (e.metaKey || e.ctrlKey)) openTab(href); else go(href);
      } };
    });
    if (jumps.length) groups.push({ title: 'よく行く画面', cols: 2, items: jumps });
    return groups;
  }

  // ---- 表示 -------------------------------------------------------------------------
  var menu = null, items = [], idx = -1;
  function close() {
    if (!menu) return;
    menu.parentNode.removeChild(menu);
    menu = null; items = []; idx = -1;
  }
  function focusItem(i) {
    var bs = menu ? menu.querySelectorAll('button.ike-ctx-i') : [];
    if (!bs.length) return;
    idx = (i + bs.length) % bs.length;
    bs[idx].focus();
  }
  function show(groups, x, y) {
    close();
    injectCss();
    menu = document.createElement('div');
    menu.className = 'ike-ctx';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('data-log-area', '右クリックメニュー');
    items = [];
    var html = groups.map(function (g) {
      return '<div class="ike-ctx-g"><div class="ike-ctx-t">' + esc(g.title) + '</div><div class="ike-ctx-c c' + (g.cols || 1) + '">' + g.items.map(function (it) {
        var i = items.length;
        items.push(it);
        return '<button type="button" class="ike-ctx-i" role="menuitem" data-i="' + i + '" data-log="' + esc(it.log) + '">' +
          '<span class="ic">' + icon(it.icon) + '</span><span class="lb">' + esc(it.label) + '</span>' +
          (it.hint ? '<span class="hint">' + esc(it.hint) + '</span>' : '') + '</button>';
      }).join('') + '</div></div>';
    }).join('');
    menu.innerHTML = html + '<div class="ike-ctx-foot">Shift＋右クリックでブラウザのメニュー</div>';
    document.documentElement.appendChild(menu);
    // 画面の外にはみ出さない位置へ
    var w = menu.offsetWidth, h = menu.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    menu.style.left = Math.max(6, Math.min(x, vw - w - 6)) + 'px';
    menu.style.top = Math.max(6, y + h + 6 > vh ? Math.max(6, vh - h - 6) : y) + 'px';
    menu.addEventListener('click', function (e) {
      var b = up(e.target, 'button.ike-ctx-i');
      if (!b) return;
      var it = items[Number(b.getAttribute('data-i'))];
      // 記録（click-log.js）が data-log を読み終えてから閉じる
      setTimeout(function () { close(); try { if (it) it.run(e); } catch (x) { toast('実行できませんでした'); } }, 0);
    });
    menu.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function skip(e) {
    var t = e.target;
    if (e.shiftKey || e.defaultPrevented || prefOff()) return true;
    if (Date.now() - lastTouch < 1500) return true;                 // タッチの長押し
    if (!t || t.nodeType !== 1) return true;
    if (up(t, '.ike-ctx, .ike-ctx-shot, .ike-ctx-pick')) return true;
    if (up(t, 'input, textarea, select, [contenteditable=""], [contenteditable="true"], img, video, canvas, audio, iframe, .leaflet-container, [data-ctx="native"]')) return true;
    return false;
  }
  document.addEventListener('contextmenu', function (e) {
    try {
      if (skip(e)) { close(); return; }
      var groups = build(e.target);
      if (!groups.length) return;
      e.preventDefault();
      show(groups, e.clientX, e.clientY);
    } catch (x) { close(); /* メニューの不具合で右クリックを殺さない＝ブラウザのメニューが出る */ }
  });
  document.addEventListener('mousedown', function (e) { if (menu && !up(e.target, '.ike-ctx')) close(); }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && pickEl) { e.preventDefault(); e.stopPropagation(); closePick(); return; }
    if (e.key === 'Escape' && shotEl && !menu) { closeShot(); return; }
    if (!menu) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(idx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(idx < 0 ? -1 : idx - 1); }
  }, true);
  window.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);
  window.addEventListener('blur', close);

  // ---- 別の画面から渡された名前・案件番号で絞る（#ctxq=） ----------------------------
  //   受け口（?q= など）を持っていない画面向け。検索欄に入れて、その画面のいつもの絞り込みを動かすだけ。
  var SEARCH_BOX = {
    '/roster.html': '#searchInput', '/kintai-today.html': '#q', '/interviews.html': '#searchInput',
    '/shift-admin.html': '#q', '/progress.html': '#q'
  };
  function applyHashQuery() {
    var m = /[#&]ctxq=([^&]*)/.exec(location.hash || '');
    if (!m) return;
    var q = '';
    try { q = decodeURIComponent(m[1]); } catch (e) { return; }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* noop */ }
    var selr = SEARCH_BOX[here()];
    if (here() === '/progress.html' && /[?&]view=members(&|$)/.test(location.search)) selr = '#mbQ';
    if (!q || !selr) return;
    // 一覧があとから届く画面でも効くように、少し間を空けて数回入れ直す（本人が打ち替えたらやめる）
    [0, 500, 1500, 3500].forEach(function (ms) {
      setTimeout(function () {
        var el = document.querySelector(selr);
        if (!el || (el.value && el.value !== q)) return;
        el.value = q;
        try { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { /* noop */ }
      }, ms);
    });
  }

  var cssDone = false;
  function injectCss() {
    if (cssDone) return;
    cssDone = true;
    var st = document.createElement('style');
    st.textContent =
      '.ike-ctx{position:fixed;z-index:2147483000;box-sizing:border-box;width:344px;max-width:calc(100vw - 12px);max-height:calc(100vh - 12px);overflow:auto;padding:6px;' +
        'background:rgba(255,255,255,.96);-webkit-backdrop-filter:blur(20px) saturate(180%);backdrop-filter:blur(20px) saturate(180%);' +
        'border:1px solid var(--border,#e7e7eb);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.16),0 2px 6px rgba(0,0,0,.06);' +
        'font:14px/1.4 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP","Yu Gothic UI",sans-serif;color:var(--ink,#1c1c1e);' +
        'animation:ikeCtxIn .12s cubic-bezier(.22,1,.36,1)}' +
      '@keyframes ikeCtxIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}' +
      '@media (prefers-reduced-motion:reduce){.ike-ctx{animation:none}}' +
      '.ike-ctx-g+.ike-ctx-g{border-top:1px solid var(--border-soft,#f0f0f3);margin-top:4px;padding-top:4px}' +
      '.ike-ctx-t{padding:5px 10px 3px;font-size:12px;font-weight:700;color:var(--muted,#6c6c72);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ike-ctx-c{display:grid;grid-template-columns:1fr}.ike-ctx-c.c2{grid-template-columns:1fr 1fr}.ike-ctx-c.c3{grid-template-columns:1fr 1fr 1fr}' +
      '.ike-ctx-i{display:flex;min-width:0;align-items:center;gap:9px;width:100%;padding:7px 10px;border:0;border-radius:8px;background:none;' +
        'font:inherit;color:inherit;text-align:left;cursor:pointer}' +
      '.ike-ctx-i:hover,.ike-ctx-i:focus{background:var(--primary-soft,#fff0f3);color:var(--primary-ink,#c40029);outline:none}' +
      '.ike-ctx-i .ic{flex:0 0 18px;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;opacity:.75}' +
      '.ike-ctx-i .ic svg{width:17px;height:17px}.ike-ctx-i .ic:empty{display:none}' +
      '.ike-ctx-i .lb{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ike-ctx-i .hint{flex:0 0 auto;font-size:11.5px;color:var(--faint,#a3a3aa)}' +
      '.ike-ctx-foot{margin-top:4px;padding:6px 10px 3px;border-top:1px solid var(--border-soft,#f0f0f3);font-size:11.5px;color:var(--faint,#a3a3aa)}' +
      '.ike-ctx-toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,12px);z-index:2147483001;padding:9px 16px;border-radius:999px;' +
        'background:rgba(28,28,30,.92);color:#fff;font:13.5px/1.4 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif;' +
        'opacity:0;pointer-events:none;transition:opacity .15s,transform .15s}' +
      '.ike-ctx-toast.show{opacity:1;transform:translate(-50%,0)}' +
      '.ike-ctx-pick{position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483002;background:#1c1c1e;cursor:crosshair;display:flex;align-items:center;justify-content:center;-webkit-user-select:none;user-select:none}' +
      '.ike-ctx-pick-img{max-width:100%;max-height:100%;display:block;pointer-events:none}' +
      '.ike-ctx-pick-sel{display:none;position:fixed;box-sizing:border-box;border:1.5px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,.45);pointer-events:none}' +
      '.ike-ctx-pick-tip{position:fixed;left:50%;top:18px;transform:translateX(-50%);padding:8px 16px;border-radius:999px;background:rgba(28,28,30,.9);color:#fff;pointer-events:none;' +
        'font:13.5px/1.4 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif}' +
      '.ike-ctx-shot{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:340px;max-width:calc(100vw - 36px);padding:10px;background:#fff;' +
        'border:1px solid var(--border,#e7e7eb);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.18);' +
        'font:13.5px/1.4 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif;color:var(--ink,#1c1c1e)}' +
      '.ike-ctx-shot-h{display:flex;align-items:center;gap:8px;margin-bottom:8px}.ike-ctx-shot-h b{flex:1 1 auto;font-size:13px}' +
      '.ike-ctx-shot-h .x{border:0;background:none;font-size:18px;line-height:1;cursor:pointer;color:var(--muted,#6c6c72);padding:2px 6px}' +
      '.ike-ctx-shot-img{max-height:220px;overflow:hidden;border:1px solid var(--border-soft,#f0f0f3);border-radius:8px;background:#fafafa;text-align:center}' +
      '.ike-ctx-shot-img img{max-width:100%;max-height:220px;display:block;margin:0 auto}' +
      '.ike-ctx-shot-f{display:flex;gap:8px;margin-top:8px}' +
      '.ike-ctx-shot-f button,.ike-ctx-shot-f a{flex:1 1 0;padding:8px 0;border-radius:9px;border:1px solid var(--border,#e7e7eb);background:#fff;' +
        'font:inherit;font-weight:700;color:var(--ink,#1c1c1e);text-align:center;text-decoration:none;cursor:pointer}' +
      '.ike-ctx-shot-f button{background:var(--primary,#ff0033);border-color:var(--primary,#ff0033);color:#fff}';
    document.head.appendChild(st);
  }

  root.IkeCtx = {
    _on: true, _pure: PURE,
    // shell.js から: { pages: navFor(role), withArea, openSearch }
    init: function (o) {
      o = o || {};
      if (o.pages) cfg.pages = o.pages;
      if (o.withArea) cfg.withArea = o.withArea;
      if (o.openSearch) cfg.openSearch = o.openSearch;
      cfg.split = !!o.split;
      cfg.copyAny = !!o.copyAny;
      ['personLinks', 'caseLinks', 'defaultJumps', 'home', 'splitUrl'].forEach(function (k) { if (o[k]) cfg[k] = o[k]; });
      if ('jumpsUrl' in o) cfg.jumpsUrl = o.jumpsUrl || '';
      if (cfg.pages && cfg.pages.length && !prefOff()) loadJumps();
    },
    // ページ側が「押した場所 → { name, gid, uid }」を返す関数を足せる（data-ctx-name を付けられない描き方のとき用）
    resolvePerson: function (fn) { if (typeof fn === 'function') resolvers.push(fn); },
    _shoot: shoot,   // スプリットの枠の中の右クリックメニューから（範囲は外側の座標を返す関数で渡ってくる）
    close: close
  };
  applyHashQuery();
})(typeof window !== 'undefined' ? window : this);
