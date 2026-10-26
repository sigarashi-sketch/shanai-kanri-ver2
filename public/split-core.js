/* split-core.js — スプリット（1つのタブに 2〜4 画面）の本体（2026-10-08 shoya「2画面3画面4画面を1つのタブだけで」）
   ES5・依存なし。いけどんは public/split.html、それゆけ未経験は app/split（components/SplitHost.tsx）から IkeSplitBoot(cfg) を呼ぶ。
   それゆけ側の public/split-core.js はこのファイルの写し。ここを直したら向こうにも写す。
   ・中身は各画面そのもの（iframe）＝機能も権限もそのまま。並べてよいのは自分のサイトの中の画面だけ。
   ・並びは URL の # より後ろに持つ（サーバーに送られない＝氏名入りの検索もアクセスログに残らない）。端末の控えはパスだけ。
   ・中の画面からは window.parent.IkeSplit を呼べる（右クリックメニュー ctx-menu.js の「となりの画面で開く」）。 */
(function () {
  'use strict';
  if (window.IkeSplitBoot) return;
  var CSS = "\n  :root { --border:#e7e7eb; --ink:#1c1c1e; --muted:#6c6c72; --primary:#ff0033; --primary-soft:#fff0f3; --bar:34px; --head:30px; --gap:5px; }\n  * { box-sizing: border-box; }\n  html, body { height: 100%; margin: 0; overflow: hidden; background: #e9e9ee; color: var(--ink);\n    font: 13.5px/1.4 -apple-system, BlinkMacSystemFont, \"Hiragino Sans\", \"Noto Sans JP\", \"Yu Gothic UI\", sans-serif; }\n  .sp-bar { height: var(--bar); display: flex; align-items: center; gap: 8px; padding: 0 10px; background: #fff; border-bottom: 1px solid var(--border); }\n  .sp-bar b { font-size: 13.5px; margin-right: 4px; }\n  .sp-bar .sp-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }\n  .sp-bar button { border: 0; background: #fff; font: inherit; color: var(--ink); padding: 4px 11px; cursor: pointer; }\n  .sp-bar .sp-seg button + button { border-left: 1px solid var(--border); }\n  .sp-bar .sp-seg button[aria-pressed=\"true\"] { background: var(--primary); color: #fff; font-weight: 700; }\n  .sp-bar .sp-plain { border: 1px solid var(--border); border-radius: 8px; }\n  .sp-bar .sp-hint { margin-left: auto; color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n  .sp-root { position: fixed; left: 0; top: 0; right: 0; bottom: 0; background: #e9e9ee; }\n  .sp-grid { position: absolute; left: 0; right: 0; top: var(--bar); bottom: 0; display: grid; gap: var(--gap); padding: var(--gap); }\n  .sp-pane { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: #fff; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }\n  .sp-pane.on { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }\n  .sp-head { flex: 0 0 var(--head); display: flex; align-items: center; gap: 4px; padding: 0 6px; background: #fafafb; border-bottom: 1px solid var(--border); }\n  .sp-head .sp-pick { flex: 0 1 200px; width: auto; min-width: 90px; height: 23px; display: inline-flex; align-items: center; gap: 4px; padding: 0 8px; border: 1px solid var(--border); border-radius: 6px; background: #fff; font: inherit; font-size: 12.5px; font-weight: 700; color: var(--ink); text-align: left; }\n  .sp-head .sp-pick span { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n  .sp-head .sp-pick:hover, .sp-head .sp-pick[aria-expanded=\"true\"] { background: var(--primary-soft); color: var(--ink); border-color: var(--primary); }\n  .sp-menu { position: fixed; z-index: 60; display: none; flex-direction: column; background: #fff; border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,.16); overflow: hidden; }\n  .sp-menu.on { display: flex; }\n  .sp-menu input { flex: 0 0 auto; margin: 10px 10px 4px; height: 32px; padding: 0 10px; border: 1px solid var(--border); border-radius: 8px; font: inherit; font-size: 14px; outline: none; }\n  .sp-menu input:focus { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }\n  .sp-menu .sp-cols { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 2px 10px 10px; columns: 160px; column-gap: 14px; }\n  .sp-menu .sp-grp { break-inside: avoid; padding-top: 8px; }\n  .sp-menu .sp-grp h4 { margin: 0 0 2px; padding: 0 6px; font-size: 11.5px; font-weight: 700; color: var(--muted); }\n  .sp-menu .sp-it { display: block; width: 100%; border: 0; background: none; text-align: left; font: inherit; font-size: 13px; color: var(--ink); padding: 4px 6px; border-radius: 6px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n  .sp-menu .sp-it:hover, .sp-menu .sp-it.hit { background: #f2f2f5; }\n  .sp-menu .sp-it.cur { background: var(--primary-soft); color: var(--primary); font-weight: 700; }\n  .sp-menu .sp-none { padding: 16px 6px; color: var(--muted); font-size: 13px; }\n  .sp-head .sp-title { flex: 1 1 auto; min-width: 0; color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n  .sp-head button { flex: 0 0 auto; width: 25px; height: 23px; border: 0; border-radius: 6px; background: none; color: var(--muted); font-size: 14px; line-height: 1; cursor: pointer; }\n  .sp-head button:hover { background: var(--primary-soft); color: var(--primary); }\n  .sp-pane iframe { flex: 1 1 auto; width: 100%; min-height: 0; border: 0; background: #fff; }\n  .sp-gut { position: absolute; z-index: 5; background: transparent; }\n  .sp-gut.v { width: 11px; margin-left: -3px; cursor: col-resize; }\n  .sp-gut.h { height: 11px; margin-top: -3px; cursor: row-resize; }\n  .sp-gut:hover, .sp-gut.drag { background: rgba(255, 0, 51, .25); border-radius: 6px; }\n  .sp-shield { position: fixed; inset: 0; z-index: 50; display: none; }   /* 境目をドラッグ中、iframe にマウスを取られないようにする幕 */\n  .sp-shield.on { display: block; }\n  @media (max-width: 820px) { .sp-hint { display: none; } }\n";
  var HTML = "<div class=\"sp-bar\" data-log-area=\"スプリット\">\n  <b>スプリット</b>\n  <span class=\"sp-seg\" role=\"group\" aria-label=\"並べる枚数\">\n    <button type=\"button\" data-n=\"2\" data-log=\"2画面\">2画面</button>\n    <button type=\"button\" data-n=\"3\" data-log=\"3画面\">3画面</button>\n    <button type=\"button\" data-n=\"4\" data-log=\"4画面\">4画面</button>\n  </span>\n  <button type=\"button\" class=\"sp-plain\" id=\"spEven\" data-log=\"幅をそろえる\">幅をそろえる</button>\n  <button type=\"button\" class=\"sp-plain\" id=\"spQuit\" data-log=\"スプリットをやめる\">やめる</button>\n  <span class=\"sp-hint\">境目はドラッグで動かせます ／ 行の上で右クリック →「となりの画面で開く」</span>\n</div>\n<div class=\"sp-grid\" id=\"grid\"></div>\n<div class=\"sp-shield\" id=\"shield\"></div>";
  // 見た目と骨組みを自分で置く（いけどんは split.html・それゆけは app/split から、同じこのファイルを呼ぶ）
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  var holder = document.createElement('div'); holder.className = 'sp-root'; holder.innerHTML = HTML; document.body.appendChild(holder);

  var LS = 'ike_split';
  var DEFAULTS = ['/proper.html', '/chat.html', '/progress.html', '/basic-info.html'];
  var SELF = '/split.html', HOME = '/home.html';
  var state = { n: 2, urls: [], cols: [1, 1], rows: [1, 1] };
  var pages = [];       // このロールで開ける画面 [{ t, href, g }]（g = 見出し）
  var panes = [];       // [{ el, frame, sel, title }]
  var active = 0;
  var grid = document.getElementById('grid'), shield = document.getElementById('shield');

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function pathOf(u) { return String(u || '').replace(/[?#].*$/, ''); }
  // 並べてよいのは自分のサイトの画面だけ（# に外のURLを書かれても開かない）。スプリット自身も入れ子にしない。
  function safe(u) {
    u = String(u || '');
    if (!/^\/(?![\/\\])[^\s\\]*$/.test(u)) return '';   // 自分のサイトの中のパスだけ（//host や \ は外へ出るので不可）
    return pathOf(u) === SELF ? '' : u;
  }

  // ---- 並びの読み書き ----
  function readHash() {
    var out = { n: 0, urls: [] };
    String(location.hash || '').replace(/^#/, '').split('&').forEach(function (kv) {
      var i = kv.indexOf('='); if (i < 0) return;
      var k = kv.slice(0, i), v = '';
      try { v = decodeURIComponent(kv.slice(i + 1)); } catch (e) { return; }
      if (k === 'n') out.n = Number(v) || 0;
      if (k === 'u') { var s = safe(v); if (s) out.urls.push(s); }
    });
    return out;
  }
  function writeState() {
    var h = 'n=' + state.n + state.urls.slice(0, state.n).map(function (u) { return '&u=' + encodeURIComponent(u); }).join('');
    try { history.replaceState(null, '', '#' + h); } catch (e) { /* noop */ }
    // 端末の控えはパスだけ（検索語＝氏名を端末に残さない）
    try { localStorage.setItem(LS, JSON.stringify({ n: state.n, urls: state.urls.map(pathOf), cols: state.cols, rows: state.rows })); } catch (e) { /* noop */ }
  }
  function fill() {
    var used = {};
    state.urls = state.urls.filter(Boolean).slice(0, 4);
    state.urls.forEach(function (u) { used[pathOf(u)] = 1; });
    var pool = DEFAULTS.concat(pages.map(function (p) { return p.href; }));
    for (var i = 0; state.urls.length < state.n && i < pool.length; i++) {
      var ok = !pages.length || pages.some(function (p) { return pathOf(p.href) === pathOf(pool[i]); });
      if (ok && !used[pathOf(pool[i])]) { used[pathOf(pool[i])] = 1; state.urls.push(pool[i]); }
    }
    while (state.urls.length < state.n) state.urls.push(HOME);
  }

  // ---- 描く ----
  function layout() {
    var two = state.n === 4;
    var c = two ? state.cols.slice(0, 2) : state.cols.slice(0, state.n);
    while (c.length < (two ? 2 : state.n)) c.push(1);
    grid.style.gridTemplateColumns = c.map(function (f) { return 'minmax(0,' + f + 'fr)'; }).join(' ');
    grid.style.gridTemplateRows = two ? state.rows.map(function (f) { return 'minmax(0,' + f + 'fr)'; }).join(' ') : 'minmax(0,1fr)';
    state.cols = c;
    Array.prototype.forEach.call(document.querySelectorAll('.sp-seg button'), function (b) {
      b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-n')) === state.n));
    });
    placeGutters();
  }
  // 枠の上のボタンに、いま出している画面の名前を出す。?area= 付きの画面（かな西エリア）も見分ける。
  function pageOf(cur) {
    var exact = null, loose = null;
    pages.forEach(function (p) {
      if (!exact && p.href === cur) exact = p;
      if (!loose && pathOf(p.href) === pathOf(cur)) loose = p;
    });
    return exact || loose;
  }
  function setLabel(p, cur) {
    var pg = pageOf(cur);
    p.sel.querySelector('span').textContent = pg ? (pg.g && /エリア/.test(pg.g) ? pg.g.replace(/エリア$/, '') + ' ' : '') + pg.t : '（メニューに無い画面）';
  }

  // ---- 画面を選ぶ一覧（2026-10-21 shoya「2画面のこれみずらい」→ 見本3: 見出しごとに横へ並べる＋文字で絞る） ----
  //   pages の g（サイドバーの見出し）ごとにまとめ、段組みで横に流す。g が無い画面（それゆけ）は見出し無しの1かたまり。
  var menu = document.createElement('div');
  menu.className = 'sp-menu';
  menu.setAttribute('data-log-area', 'スプリットの画面一覧');
  menu.innerHTML = '<input type="search" placeholder="画面の名前で絞る（例: 請求、かな西）" aria-label="画面の名前で絞る" autocomplete="off"><div class="sp-cols"></div>';
  document.body.appendChild(menu);
  var menuQ = menu.querySelector('input'), menuCols = menu.querySelector('.sp-cols');
  var menuFor = -1;
  // ひらがな・カタカナ・大文字小文字の違いは同じに見る
  function norm(s) { return String(s || '').toLowerCase().replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); }); }
  function drawMenu() {
    var q = norm(menuQ.value.trim()), cur = menuFor >= 0 ? state.urls[menuFor] : '', curPg = pageOf(cur);
    var groups = [], byName = {};
    pages.forEach(function (p) {
      if (q && norm(p.t).indexOf(q) < 0 && norm(p.g).indexOf(q) < 0) return;
      var g = p.g || '';
      if (!byName[g]) { byName[g] = { name: g, items: [] }; groups.push(byName[g]); }
      byName[g].items.push(p);
    });
    var first = true;
    menuCols.innerHTML = groups.length ? groups.map(function (g) {
      return '<div class="sp-grp">' + (g.name ? '<h4>' + esc(g.name) + '</h4>' : '') + g.items.map(function (p) {
        var cls = 'sp-it' + (p === curPg ? ' cur' : '') + (q && first ? ' hit' : '');
        first = false;
        return '<button type="button" class="' + cls + '" data-href="' + esc(p.href) + '" data-log="画面を選ぶ" title="' + esc(p.t) + '">' + esc(p.t) + '</button>';
      }).join('') + '</div>';
    }).join('') : '<div class="sp-none">その名前の画面はありません</div>';
  }
  function openMenu(i) {
    var p = panes[i]; if (!p) return;
    if (menuFor === i && menu.classList.contains('on')) { closeMenu(); return; }
    closeMenu();
    menuFor = i;
    menuQ.value = '';
    drawMenu();
    // 枠の左上から開く。広さは画面に収まる範囲で大きめに（項目が多いので段を横に並べる）
    var b = p.sel.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    var w = Math.min(760, vw - 16), left = Math.max(8, Math.min(b.left, vw - w - 8));
    menu.style.left = left + 'px'; menu.style.top = (b.bottom + 4) + 'px';
    menu.style.width = w + 'px'; menu.style.maxHeight = Math.max(200, vh - b.bottom - 12) + 'px';
    menu.classList.add('on');
    p.sel.setAttribute('aria-expanded', 'true');
    var c = menuCols.querySelector('.cur');
    if (c) c.scrollIntoView({ block: 'nearest' });
    menuQ.focus();
  }
  function closeMenu() {
    if (!menu.classList.contains('on')) return;
    menu.classList.remove('on');
    if (panes[menuFor]) panes[menuFor].sel.setAttribute('aria-expanded', 'false');
    menuFor = -1;
  }
  menuQ.addEventListener('input', drawMenu);
  menuQ.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeMenu(); return; }
    if (e.key === 'Enter') {
      var hit = menuCols.querySelector('.sp-it.hit') || menuCols.querySelector('.sp-it');
      if (hit) { e.preventDefault(); hit.click(); }
    }
  });
  menuCols.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('.sp-it');
    if (!b) return;
    var i = menuFor;
    closeMenu();
    open(i, b.getAttribute('data-href'));
  });
  document.addEventListener('mousedown', function (e) {
    if (!menu.classList.contains('on') || menu.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.sp-pick')) return;   // ボタン側の click が開け閉めする
    closeMenu();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('blur', function () { setTimeout(function () { if (document.activeElement && document.activeElement.tagName === 'IFRAME') closeMenu(); }, 0); });   // 枠の中をクリックした
  window.addEventListener('resize', closeMenu);
  function makePane(i) {
    var el = document.createElement('div');
    el.className = 'sp-pane';
    el.innerHTML = '<div class="sp-head" data-log-area="スプリットの枠">' +
      '<button type="button" class="sp-pick" aria-haspopup="true" aria-expanded="false" title="この枠に出す画面を選ぶ" data-log="画面の一覧を開く"><span></span>▾</button><span class="sp-title"></span>' +
      '<button type="button" data-act="back" title="この枠で前の画面に戻る" aria-label="戻る" data-log="枠: 戻る">←</button>' +
      '<button type="button" data-act="reload" title="この枠を読み込み直す" aria-label="読み込み直す" data-log="枠: 読み込み直す">↻</button>' +
      '<button type="button" data-act="solo" title="スプリットをやめて、この画面だけにする" aria-label="この画面だけにする" data-log="枠: この画面だけにする">⤢</button>' +
      '<button type="button" data-act="close" title="この枠を閉じる" aria-label="閉じる" data-log="枠: 閉じる">×</button></div>';
    var frame = document.createElement('iframe');
    frame.setAttribute('title', '画面 ' + (i + 1));
    frame.setAttribute('allow', 'clipboard-read; clipboard-write');
    el.appendChild(frame);
    var p = { el: el, frame: frame, sel: el.querySelector('.sp-pick'), title: el.querySelector('.sp-title') };
    p.sel.addEventListener('click', function () { openMenu(panes.indexOf(p)); });
    el.querySelector('.sp-head').addEventListener('click', function (e) {
      var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      var k = panes.indexOf(p);
      setActive(k);
      if (act === 'back') { try { frame.contentWindow.history.back(); } catch (x) { /* noop */ } }
      else if (act === 'reload') { try { frame.contentWindow.location.reload(); } catch (x) { frame.src = state.urls[k]; } }
      else if (act === 'solo') { location.href = state.urls[k]; }
      else if (act === 'close') closePane(k);
    });
    // 中で画面が変わったら、並びの控えと見出しを合わせる（中のリンクで移動したぶんも再読み込みで戻せるように）
    frame.addEventListener('load', function () {
      var k = panes.indexOf(p);
      if (k < 0) return;
      try {
        var w = frame.contentWindow, u = safe(w.location.pathname + w.location.search);
        if (u) { state.urls[k] = u; writeState(); }
        p.title.textContent = u ? '' : '（ほかの画面）';
        setLabel(p, state.urls[k]);
        w.addEventListener('focus', function () { setActive(panes.indexOf(p)); });
        w.document.addEventListener('mousedown', function () { setActive(panes.indexOf(p)); }, true);
      } catch (x) { p.title.textContent = '（外のサイト）'; }
    });
    return p;
  }
  function setActive(i) {
    if (i < 0) return;
    active = i;
    panes.forEach(function (p, k) { p.el.classList.toggle('on', k === i); });
  }
  function open(i, url) {
    url = safe(url);
    if (!url || !panes[i]) return;
    state.urls[i] = url;
    setLabel(panes[i], url);
    panes[i].frame.src = url;
    setActive(i);
    writeState();
  }
  function render() {
    closeMenu();
    fill();
    // 枚数が変わっても、すでに開いている枠は作り直さない（入力途中のものを消さない）
    while (panes.length > state.n) { var gone = panes.pop(); grid.removeChild(gone.el); }
    while (panes.length < state.n) {
      var p = makePane(panes.length);
      panes.push(p); grid.appendChild(p.el);
      setLabel(p, state.urls[panes.length - 1]);
      p.frame.src = state.urls[panes.length - 1];
    }
    state.urls = state.urls.slice(0, state.n);
    if (active >= state.n) active = 0;
    setActive(active);
    layout();
    writeState();
  }
  function setN(n) {
    if (n < 2 || n > 4 || n === state.n) return;
    state.n = n;
    state.cols = n === 3 ? [1, 1, 1] : [1, 1];
    render();
  }
  function closePane(i) {
    if (state.n <= 2) { location.href = state.urls[i === 0 ? 1 : 0]; return; }   // 2枚から1枚減らす＝スプリットをやめて残った方へ
    var gone = panes.splice(i, 1)[0];
    grid.removeChild(gone.el);
    state.urls.splice(i, 1);
    state.n -= 1;
    state.cols = state.n === 3 ? [1, 1, 1] : [1, 1];
    render();
  }

  // ---- 境目をドラッグで動かす ----
  var guts = [];
  function placeGutters() {
    guts.forEach(function (g) { g.parentNode.removeChild(g); });
    guts = [];
    var R = grid.getBoundingClientRect();
    function add(kind, idx) {
      var a = panes[kind === 'v' ? idx : 0], b = kind === 'v' ? panes[idx + 1] : panes[2];
      if (!a || !b) return;
      var ra = a.el.getBoundingClientRect(), rb = b.el.getBoundingClientRect();
      var g = document.createElement('div');
      g.className = 'sp-gut ' + kind;
      if (kind === 'v') { g.style.left = ((ra.right + rb.left) / 2 - 2.5) + 'px'; g.style.top = R.top + 'px'; g.style.height = R.height + 'px'; }
      else { g.style.top = ((ra.bottom + rb.top) / 2 - 2.5) + 'px'; g.style.left = R.left + 'px'; g.style.width = R.width + 'px'; }
      g.addEventListener('mousedown', function (e) { startDrag(e, kind, idx, g); });
      document.body.appendChild(g);
      guts.push(g);
    }
    var nc = state.n === 4 ? 2 : state.n;
    for (var i = 0; i < nc - 1; i++) add('v', i);
    if (state.n === 4) add('h', 0);
  }
  function startDrag(e, kind, idx, g) {
    e.preventDefault();
    var arr = kind === 'v' ? state.cols : state.rows;
    var R = grid.getBoundingClientRect();
    var total = kind === 'v' ? R.width : R.height, sum = arr.reduce(function (a, b) { return a + b; }, 0);
    var start = kind === 'v' ? e.clientX : e.clientY, a0 = arr[idx], b0 = arr[idx + 1];
    shield.classList.add('on'); shield.style.cursor = kind === 'v' ? 'col-resize' : 'row-resize'; g.classList.add('drag');
    function move(ev) {
      var d = ((kind === 'v' ? ev.clientX : ev.clientY) - start) / total * sum;
      var min = (a0 + b0) * 0.15;   // どちらの枠も消えるほどは寄せない
      var a = Math.max(min, Math.min(a0 + b0 - min, a0 + d));
      arr[idx] = a; arr[idx + 1] = a0 + b0 - a;
      layout();
    }
    function up() {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      shield.classList.remove('on'); writeState(); placeGutters();
    }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  }
  window.addEventListener('resize', placeGutters);

  // ---- 上の帯 ----
  document.querySelector('.sp-seg').addEventListener('click', function (e) {
    var n = Number(e.target && e.target.getAttribute && e.target.getAttribute('data-n'));
    if (n) setN(n);
  });
  document.getElementById('spEven').addEventListener('click', function () {
    state.cols = state.cols.map(function () { return 1; }); state.rows = [1, 1];
    layout(); writeState();
  });
  document.getElementById('spQuit').addEventListener('click', function () { location.href = state.urls[active] || state.urls[0]; });

  // ---- 中の画面から呼ぶ口 ----
  function indexOfWin(win) {
    for (var i = 0; i < panes.length; i++) { try { if (panes[i].frame.contentWindow === win) return i; } catch (e) { /* noop */ } }
    return -1;
  }
  window.IkeSplit = {
    // 呼んだ枠の「となり」に開く（右端の次は左端）。どの枠から呼んだか分からなければ、いま使っている枠のとなり。
    openBeside: function (win, href) {
      var i = indexOfWin(win);
      if (i < 0) i = active;
      open((i + 1) % state.n, href);
    },
    count: function () { return state.n; }
  };

  // ---- 起動 ----
  //   cfg: { pages: [{ t, href, g }]（このロールで開ける画面・g はサイドバーの見出し＝一覧のまとまり。無くてもよい）, defaults: [最初に並べる画面], self: この画面のパス, home: 埋める画面が無いときの画面, key: 端末の控えの名前 }
  function boot(cfg) {
    cfg = cfg || {};
    if (cfg.defaults) DEFAULTS = cfg.defaults;
    if (cfg.self) SELF = cfg.self;
    if (cfg.home) HOME = cfg.home;
    if (cfg.key) LS = cfg.key;
    pages = (cfg.pages || []).filter(function (p) { return p && p.href && pathOf(p.href) !== SELF; });
    var h = readHash(), saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { saved = null; }
    if (h.urls.length || h.n) {
      state.urls = h.urls;
      state.n = Math.max(2, Math.min(4, h.n || h.urls.length || 2));
    } else if (saved && saved.urls) {
      state.n = Math.max(2, Math.min(4, Number(saved.n) || 2));
      state.urls = saved.urls.map(safe).filter(Boolean);
      if (saved.cols && saved.cols.length) state.cols = saved.cols.map(Number).filter(function (x) { return x > 0; });
      if (saved.rows && saved.rows.length === 2) state.rows = saved.rows.map(Number);
    }
    if (state.n === 3 && state.cols.length !== 3) state.cols = [1, 1, 1];
    if (state.n !== 3 && state.cols.length !== 2) state.cols = [1, 1];
    render();
  }
  // 中の画面が読み込み直さずに移る作り（それゆけ）でも、並びの控えと枠の見出しを合わせる
  setInterval(function () {
    panes.forEach(function (p, k) {
      try {
        var w = p.frame.contentWindow, u = safe(w.location.pathname + w.location.search);
        if (u && u !== state.urls[k]) { state.urls[k] = u; setLabel(p, u); writeState(); }
      } catch (e) { /* 外のサイト */ }
    });
  }, 1500);
  window.IkeSplitBoot = boot;
})();
