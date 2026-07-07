/**
 * foriio_works.js — freak HP vC 実績セクション foriio自動同期モジュール
 *
 * 依存ゼロの素のJS。グローバルに 1 関数 `renderForiioWorks(containerEl, options)` を公開する。
 *
 * 挙動:
 *   - foriio API (https://api.foriio.com/api/v1/users/{user}/works) から作品リストを取得
 *   - 並び順は API のレスポンス順をそのまま使う
 *     (= foriio プロフィールページの表示順。2026-07-07 にページ埋め込み workIDs と完全一致を実測確認済み。
 *      foriio 側で並び替えれば次のページロードで HP にも反映される)
 *   - 上位 featuredCount 件: サムネイル + タイトル + リンク のカード
 *   - それ以降: タイトル + リンク のみの文字リスト
 *   - 各作品は https://www.foriio.com/works/{id} に新規タブで遷移
 *   - API 失敗時(タイムアウト/HTTPエラー/構造変化)は同梱の静的スナップショットに自動切替し、
 *     console.warn を出す。root 要素の data-foriio-source 属性が "api" / "fallback" になる
 *
 * 使い方(最小):
 *   <div id="works"></div>
 *   <script src="foriio_works.js"></script>
 *   <script>renderForiioWorks(document.getElementById('works'));</script>
 *
 * options(すべて任意):
 *   user           foriio ユーザー名           (default: 'freak')
 *   featuredCount  サムネ付きで出す件数          (default: 3)
 *   maxItems       表示する総件数               (default: 12 / APIの1ページ上限)
 *   titleMaxLength タイトルの最大文字数。超過は「…」 (default: 60。0 で無制限)
 *   classPrefix    生成するクラス名の接頭辞        (default: 'foriio')
 *   timeoutMs      API タイムアウト             (default: 8000)
 *
 * 生成される DOM(スタイルは一切当てない。CSS は呼び出し側が classPrefix ベースで書く):
 *   div.foriio-works[data-foriio-source="api|fallback"]
 *     div.foriio-featured
 *       a.foriio-card (href=作品ページ, target=_blank)
 *         img.foriio-thumb
 *         span.foriio-card-title
 *     ul.foriio-list
 *       li.foriio-list-item
 *         a.foriio-list-link (href=作品ページ, target=_blank)
 *
 * 戻り値: Promise<{ source: 'api'|'fallback', works: Array<{id,title,thumbnail}> }>
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    user: 'freak',
    featuredCount: 3,
    maxItems: 12,
    titleMaxLength: 60,
    classPrefix: 'foriio',
    timeoutMs: 8000,
    apiBase: 'https://api.foriio.com/api/v1'
  };

  // 静的フォールバック: 2026-07-07 時点の API レスポンススナップショット(表示順)
  var SNAPSHOT = [
    { id: 2178649, title: "アニメ『PSYREN -サイレン-』ティザーPV第1弾", thumbnail: "https://foriio.imgix.net/store/cO9LIgn7PPPI_1769661554.jpg" },
    { id: 1281036, title: "【本予告】福原遥主演 新ドラマ「透明なわたしたち」主題歌は幾田りら「Sign」に決定！どこか居場所のないすべての\"わたしたち\"に寄り添う物語｜ABEMAで9/16(月)よる11時スタート", thumbnail: "https://foriio.imgix.net/store/Ww9UKlOnRose_1727329124.jpg" },
    { id: 1916140, title: "【3.14(金)公開】『劇場版モノノ怪 第二章 火鼠』制作ドキュメンタリー《前編》", thumbnail: "https://i.ytimg.com/vi/9TAui5Ssbrk/maxresdefault.jpg" },
    { id: 1281021, title: "『八犬伝』特報　10月25日（金） 全国ロードショー", thumbnail: "https://foriio.imgix.net/store/tjCjfrWrm5pP_1727328952.jpg" },
    { id: 968741, title: "『パレード』予告編 - Netflix", thumbnail: "https://foriio.imgix.net/store/q8dopgxI7gZc_1709103252.jpg" },
    { id: 1745545, title: "【ショートドラマ】かしこきもの_各話ティザー｜鏡の精神世界予告（エピソードIV）", thumbnail: "https://foriio.imgix.net/store/gqhxiNADUAu4_1752147343.jpg" },
    { id: 1677181, title: "『パーティーから追放されたその治癒師、実は最強につき』「前田佳織里 武闘家への道」後編", thumbnail: "https://foriio.imgix.net/store/jBNvZgQPb4ms_1749531394.jpg" },
    { id: 1516153, title: "juJoe -「supersonic」Music Video", thumbnail: "https://foriio.imgix.net/store/JWfpE_y9DMdq_1747656148.jpg" },
    { id: 1516156, title: "大きな玉ねぎの下で - asmi (Official Music Video)", thumbnail: "https://foriio.imgix.net/store/WXCOuxU23qVP_1741166791.jpg" },
    { id: 1516162, title: "映画『サンセット・サンライズ』特別映像（キャラクター編）2025年1月17日（金）公開", thumbnail: "https://foriio.imgix.net/store/NXppMUCRuBEU_1741166971.jpg" },
    { id: 1745537, title: "映画『ラブ・イン・ザ・ビッグシティ』ノ・サンヒョン in TOKYO CITY", thumbnail: "https://foriio.imgix.net/store/8AiFt9rMmkj7_1752147153.jpg" },
    { id: 1324306, title: "【透明なわたしたち】#1-3スペシャルダイジェスト。20分で3話まで追いつける！", thumbnail: "https://foriio.imgix.net/store/UduRQpZrtP2X_1729654649.jpg" }
  ];

  function workUrl(id) {
    return 'https://www.foriio.com/works/' + id;
  }

  function truncate(text, max) {
    if (!text) return '';
    text = String(text).replace(/\s+/g, ' ').trim();
    if (max > 0 && text.length > max) {
      var cut = text.slice(0, max);
      // サロゲートペア(絵文字等)を途中で切らない
      var last = cut.charCodeAt(cut.length - 1);
      if (last >= 0xD800 && last <= 0xDBFF) cut = cut.slice(0, -1);
      return cut + '…';
    }
    return text;
  }

  function fetchWorks(opts) {
    var url = opts.apiBase + '/users/' + encodeURIComponent(opts.user) +
      '/works?per_page=' + opts.maxItems + '&page=1';
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, opts.timeoutMs) : null;

    function clearTimer() { if (timer) clearTimeout(timer); }

    return fetch(url, {
      headers: { 'Accept': 'application/json' },
      mode: 'cors',
      signal: controller ? controller.signal : undefined
    }).then(function (r) {
      clearTimer();
      if (!r.ok) throw new Error('foriio API HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      var items = d.works || d.data;
      if (!items || !items.length) throw new Error('foriio API: empty works');
      // API順をそのまま保持(= foriioの表示順)
      return items.map(function (x) {
        return { id: x.id, title: x.title || '', thumbnail: x.thumbnail || '' };
      });
    }).catch(function (err) {
      clearTimer();
      throw err;
    });
  }

  function buildDom(containerEl, works, source, opts) {
    var p = opts.classPrefix;
    var root = document.createElement('div');
    root.className = p + '-works';
    root.setAttribute('data-foriio-source', source);

    var featured = works.slice(0, opts.featuredCount);
    var rest = works.slice(opts.featuredCount, opts.maxItems);

    if (featured.length) {
      var grid = document.createElement('div');
      grid.className = p + '-featured';
      featured.forEach(function (w) {
        var a = document.createElement('a');
        a.className = p + '-card';
        a.href = workUrl(w.id);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        var img = document.createElement('img');
        img.className = p + '-thumb';
        img.src = w.thumbnail;
        img.alt = truncate(w.title, opts.titleMaxLength);
        img.loading = 'lazy';
        a.appendChild(img);

        var t = document.createElement('span');
        t.className = p + '-card-title';
        t.textContent = truncate(w.title, opts.titleMaxLength);
        a.appendChild(t);

        grid.appendChild(a);
      });
      root.appendChild(grid);
    }

    if (rest.length) {
      var ul = document.createElement('ul');
      ul.className = p + '-list';
      rest.forEach(function (w) {
        var li = document.createElement('li');
        li.className = p + '-list-item';
        var a = document.createElement('a');
        a.className = p + '-list-link';
        a.href = workUrl(w.id);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = truncate(w.title, opts.titleMaxLength);
        li.appendChild(a);
        ul.appendChild(li);
      });
      root.appendChild(ul);
    }

    containerEl.innerHTML = '';
    containerEl.appendChild(root);
  }

  function renderForiioWorks(containerEl, options) {
    if (!containerEl || !containerEl.appendChild) {
      return Promise.reject(new Error('renderForiioWorks: containerEl が不正です'));
    }
    var opts = {};
    for (var k in DEFAULTS) opts[k] = DEFAULTS[k];
    if (options) for (var k2 in options) if (options[k2] !== undefined) opts[k2] = options[k2];

    return fetchWorks(opts).then(function (works) {
      buildDom(containerEl, works, 'api', opts);
      return { source: 'api', works: works };
    }).catch(function (err) {
      console.warn('[foriio_works] API取得に失敗。静的スナップショット(2026-07-07)にフォールバックします:', err && err.message ? err.message : err);
      var works = SNAPSHOT.slice(0, opts.maxItems);
      buildDom(containerEl, works, 'fallback', opts);
      return { source: 'fallback', works: works };
    });
  }

  global.renderForiioWorks = renderForiioWorks;
})(typeof window !== 'undefined' ? window : this);
